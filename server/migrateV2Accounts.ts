import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RowDataPacket } from "mysql2/promise";
import { grantBbroV2Account } from "./v2Accounts";
import { getV2Pool } from "./v2Db";

export const V2_ACCOUNT_ROLES = [
  "admin",
  "client",
  "client_admin",
  "bbro",
] as const;
export const ACCOUNT_ROLE_MIGRATION_ID = "v2-accounts-role-session-v1";
export const BBRO_ROLE_MIGRATION_ID = "v2-accounts-bbro-role-v1";

export type MigrationQueryExecutor = {
  query: <T = any>(...args: any[]) => Promise<[T, any]>;
  execute?: <T = any>(...args: any[]) => Promise<[T, any]>;
};

export type MigrationConnection = MigrationQueryExecutor & {
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
};

export type MigrationDb = MigrationQueryExecutor & {
  getConnection: () => Promise<MigrationConnection>;
  end?: () => Promise<void>;
};

type AccountColumn = RowDataPacket & {
  Field?: string;
  Type?: string;
  Null?: string;
  Default?: unknown;
};

function enumValues(type: unknown): string[] {
  const text = String(type ?? "");
  return [...text.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(match =>
    match[1].replaceAll("\\'", "'")
  );
}

function roleEnumSql(values: readonly string[] = V2_ACCOUNT_ROLES): string {
  return values.map(value => `'${value}'`).join(",");
}

/**
 * Ensures the four-role enum without dropping an existing role value. The old
 * three-role enum is upgraded only by adding client_admin; unexpected custom
 * enum values fail closed instead of being silently removed.
 */
export async function ensureV2AccountRoleEnum(
  connection: Pick<MigrationConnection, "query">
): Promise<void> {
  const [columns] = await connection.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM v2_accounts"
  );
  const roleColumn = (columns as AccountColumn[]).find(
    column => String(column.Field) === "role"
  );
  const desiredType = `enum(${roleEnumSql()})`;

  if (!roleColumn) {
    await connection.query(
      `ALTER TABLE v2_accounts ADD COLUMN role ENUM(${roleEnumSql()}) NOT NULL DEFAULT 'client' AFTER isActive`
    );
  } else {
    const currentValues = enumValues(roleColumn.Type).map(value =>
      value.toLowerCase()
    );
    const unexpected = currentValues.filter(
      value => !(V2_ACCOUNT_ROLES as readonly string[]).includes(value)
    );
    if (unexpected.length)
      throw new Error(
        `Enum de contas contém papéis desconhecidos: ${unexpected.join(", ")}.`
      );
    const missing = V2_ACCOUNT_ROLES.filter(
      value => !currentValues.includes(value)
    );
    const needsRoleAlter = missing.length > 0;
    const needsNullAlter = roleColumn.Null === "YES";
    const needsDefaultAlter = String(roleColumn.Default) !== "client";
    if (needsRoleAlter || needsNullAlter || needsDefaultAlter)
      await connection.query(
        `ALTER TABLE v2_accounts MODIFY COLUMN role ENUM(${roleEnumSql()}) NOT NULL DEFAULT 'client'`
      );
  }

  const [validatedColumns] = await connection.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM v2_accounts"
  );
  const validatedRole = (validatedColumns as AccountColumn[]).find(
    column => String(column.Field) === "role"
  );
  const validatedValues = enumValues(validatedRole?.Type).map(value =>
    value.toLowerCase()
  );
  if (!V2_ACCOUNT_ROLES.every(value => validatedValues.includes(value)))
    throw new Error(
      `Enum de contas não contém os quatro papéis canônicos (${desiredType}).`
    );
}

/** Adds the session column while preserving every account credential/status. */
export async function ensureV2AccountSessionVersion(
  connection: Pick<MigrationConnection, "query">
): Promise<void> {
  const [columns] = await connection.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM v2_accounts"
  );
  const sessionColumn = (columns as AccountColumn[]).find(
    column => String(column.Field) === "sessionVersion"
  );
  if (!sessionColumn)
    await connection.query(
      "ALTER TABLE v2_accounts ADD COLUMN sessionVersion INT UNSIGNED NOT NULL DEFAULT 0 AFTER role"
    );
  else if (
    sessionColumn.Null === "YES" ||
    String(sessionColumn.Default) !== "0"
  ) {
    await connection.query(
      "UPDATE v2_accounts SET sessionVersion=0 WHERE sessionVersion IS NULL"
    );
    await connection.query(
      "ALTER TABLE v2_accounts MODIFY COLUMN sessionVersion INT UNSIGNED NOT NULL DEFAULT 0"
    );
  }
}

export async function ensureV2AccountSupportTables(
  executor: MigrationQueryExecutor
): Promise<void> {
  await executor.query(
    "CREATE TABLE IF NOT EXISTS v2_account_audit (id INT AUTO_INCREMENT PRIMARY KEY, accountId INT NOT NULL, actorId INT NOT NULL, action VARCHAR(32) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX account_history (accountId,id), FOREIGN KEY (accountId) REFERENCES v2_accounts(id), FOREIGN KEY (actorId) REFERENCES v2_accounts(id))"
  );
  await executor.query(
    "CREATE TABLE IF NOT EXISTS v2_user_migrations (migrationId VARCHAR(120) PRIMARY KEY, appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );
}

/** Manual, finite account schema migration. It is not called on module import. */
export async function migrateV2Accounts(
  suppliedDb?: MigrationDb
): Promise<void> {
  const sql = await readFile(
    new URL("../drizzle/v2-accounts.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_account_audit") ||
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_user_migrations")
  )
    throw new Error("Migration de contas V2 incompleta.");

  const db = suppliedDb ?? (getV2Pool() as unknown as MigrationDb);
  let connection: MigrationConnection | undefined;
  try {
    connection = await db.getConnection();
    await ensureV2AccountRoleEnum(connection);
    await ensureV2AccountSessionVersion(connection);
    await ensureV2AccountSupportTables(connection);

    await connection.beginTransaction();
    const [markers] = await connection.query<RowDataPacket[]>(
      "SELECT migrationId FROM v2_user_migrations WHERE migrationId=? FOR UPDATE",
      [ACCOUNT_ROLE_MIGRATION_ID]
    );
    if (!markers.length) {
      // Promote only the already existing requested account. This never creates
      // an account and never writes a password or password hash.
      await connection.query(
        "UPDATE v2_accounts SET role='admin' WHERE username=? AND role<>'admin'",
        ["rodrigo"]
      );
      await connection.query(
        "INSERT INTO v2_user_migrations (migrationId) VALUES (?)",
        [ACCOUNT_ROLE_MIGRATION_ID]
      );
    }
    await connection.commit();

    const execute = db.execute ?? db.query.bind(db);
    const [bbroMarkers] = await execute(
      "SELECT migrationId FROM v2_user_migrations WHERE migrationId=? LIMIT 1",
      [BBRO_ROLE_MIGRATION_ID]
    );
    if (!bbroMarkers.length) {
      // Read only identity fields. No password or password hash is consulted.
      const [rodrigoRows] = await execute(
        "SELECT id,username,role FROM v2_accounts WHERE LOWER(username)=LOWER(?) AND role='admin' LIMIT 1",
        ["rodrigo"]
      );
      const rodrigo = (rodrigoRows as RowDataPacket[])[0];
      let grantStatus =
        "bbro não encontrada; perfil disponível para criação/atribuição por um administrador";
      if (rodrigo) {
        const result = await grantBbroV2Account({
          id: Number(rodrigo.id),
          username: String(rodrigo.username),
          role: "admin",
        });
        grantStatus =
          result.status === "assigned"
            ? `perfil BBRO atribuído à conta ${result.username}; sessão revogada`
            : result.status === "already_bbro"
              ? `conta ${result.username} já possuía o perfil BBRO`
              : grantStatus;
      }
      await execute(
        "INSERT IGNORE INTO v2_user_migrations (migrationId) VALUES (?)",
        [BBRO_ROLE_MIGRATION_ID]
      );
      console.log(`Migration de contas V2: ${grantStatus}.`);
    }
    console.log(
      "Migration de contas V2 concluída; contas existentes preservadas."
    );
  } catch (error) {
    await connection?.rollback();
    throw error;
  } finally {
    connection?.release();
    if (db.end) await db.end();
  }
}

function isDirectInvocation(): boolean {
  const script = process.argv[1];
  return Boolean(
    script && pathToFileURL(resolve(script)).href === import.meta.url
  );
}

if (isDirectInvocation()) {
  migrateV2Accounts().catch(error => {
    console.error(
      "Não foi possível concluir a migration de contas V2. Nenhuma senha foi criada ou alterada.",
      error
    );
    process.exitCode = 1;
  });
}
