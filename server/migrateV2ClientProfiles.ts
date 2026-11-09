import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool } from "./v2Db";
import {
  ensureV2AccountRoleEnum,
  ensureV2AccountSessionVersion,
  ensureV2AccountSupportTables,
  type MigrationConnection,
  type MigrationDb,
} from "./migrateV2Accounts";

export const CLIENT_PROFILE_MIGRATION_ID = "v2-client-profiles-v1";

type ClientAccountRow = RowDataPacket & {
  id: number;
  role?: string | null;
  sessionVersion?: number | null;
};

export type ClientProfileMigrationResult = {
  migrationId: typeof CLIENT_PROFILE_MIGRATION_ID;
  alreadyApplied: boolean;
  migratedAccounts: number;
};

/**
 * Converts only existing legacy clients. It intentionally does not select or
 * update passwordHash/isActive and never creates an account or privilege.
 */
export async function migrateV2ClientProfiles(
  suppliedDb?: MigrationDb,
  actorId?: number
): Promise<ClientProfileMigrationResult> {
  const sql = await readFile(
    new URL("../drizzle/v2-client-profiles.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("v2-client-profiles-v1") ||
    !sql.includes("v2_user_migrations") ||
    !sql.includes("v2_account_audit")
  )
    throw new Error("Migration de perfis de cliente V2 incompleta.");

  const db = suppliedDb ?? (getV2Pool() as unknown as MigrationDb);
  const ownsDb = !suppliedDb;
  let connection: MigrationConnection | undefined;
  try {
    connection = await db.getConnection();
    // The enum change is additive: old admin/client/bbro values remain valid,
    // and the validated role is required before any data update starts.
    await ensureV2AccountRoleEnum(connection);
    await ensureV2AccountSessionVersion(connection);
    await ensureV2AccountSupportTables(connection);

    await connection.beginTransaction();
    const [markers] = await connection.query<RowDataPacket[]>(
      "SELECT migrationId FROM v2_user_migrations WHERE migrationId=? FOR UPDATE",
      [CLIENT_PROFILE_MIGRATION_ID]
    );
    if (markers.length) {
      await connection.commit();
      return {
        migrationId: CLIENT_PROFILE_MIGRATION_ID,
        alreadyApplied: true,
        migratedAccounts: 0,
      };
    }

    if (!Number.isSafeInteger(actorId) || Number(actorId) < 1)
      throw new Error(
        "Informe um Administrador autenticado para auditar a migração de perfis."
      );
    const [administrators] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM v2_accounts WHERE id=? AND role='admin' AND isActive=1 FOR UPDATE",
      [actorId]
    );
    if (administrators.length !== 1)
      throw new Error("O autor da migração deve ser um Administrador ativo.");

    // Lock only identity/version fields. The update below leaves passwordHash
    // and isActive untouched, and no admin/BBRO row is selected for conversion.
    const [legacyClients] = await connection.query<ClientAccountRow[]>(
      "SELECT id,role,sessionVersion FROM v2_accounts WHERE role='client' FOR UPDATE"
    );
    for (const account of legacyClients) {
      const accountId = Number(account.id);
      const [result] = await connection.query<{ affectedRows?: number }>(
        "UPDATE v2_accounts SET role='client_admin',sessionVersion=sessionVersion+1 WHERE id=? AND role='client'",
        [accountId]
      );
      if (Number(result?.affectedRows ?? 1) !== 1)
        throw new Error(`Conta de cliente não foi migrada: ${accountId}.`);

      // The authorized administrator is the actor; migrating a client is not
      // recorded as though that client had changed their own permissions.
      await connection.query(
        "INSERT INTO v2_account_audit (accountId,actorId,action) VALUES (?,?,?)",
        [accountId, actorId, "update"]
      );
    }

    await connection.query(
      "INSERT INTO v2_user_migrations (migrationId) VALUES (?)",
      [CLIENT_PROFILE_MIGRATION_ID]
    );
    await connection.commit();
    return {
      migrationId: CLIENT_PROFILE_MIGRATION_ID,
      alreadyApplied: false,
      migratedAccounts: legacyClients.length,
    };
  } catch (error) {
    await connection?.rollback();
    throw error;
  } finally {
    connection?.release();
    if (ownsDb && db.end) await db.end();
  }
}

function isDirectInvocation(): boolean {
  const script = process.argv[1];
  return Boolean(
    script && pathToFileURL(resolve(script)).href === import.meta.url
  );
}

if (isDirectInvocation()) {
  migrateV2ClientProfiles(undefined, Number(process.env.MG_MIGRATION_ACTOR_ID))
    .then(result => {
      console.log(
        result.alreadyApplied
          ? "Migration de perfis de cliente V2 já estava aplicada."
          : `Migration de perfis de cliente V2 concluída: ${result.migratedAccounts} conta(s) convertida(s).`
      );
    })
    .catch(error => {
      console.error(
        "Não foi possível concluir a migration de perfis de cliente V2; nenhuma senha ou conta foi criada.",
        error instanceof Error ? error.message : error
      );
      process.exitCode = 1;
    });
}
