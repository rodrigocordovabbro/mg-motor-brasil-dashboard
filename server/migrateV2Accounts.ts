import { readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { grantBbroV2Account } from "./v2Accounts";
import { getV2Pool } from "./v2Db";

const MIGRATION_ID = "v2-accounts-role-session-v1";
const BBRO_MIGRATION_ID = "v2-accounts-bbro-role-v1";

// Run explicitly after review against the already provisioned V2 database.
// This module is intentionally not imported by the application startup path.
async function migrate() {
  const sql = await readFile(
    new URL("../drizzle/v2-accounts.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_account_audit") ||
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_user_migrations")
  )
    throw new Error("Migration de contas V2 incompleta.");

  const db = getV2Pool();
  let connection: Awaited<ReturnType<typeof db.getConnection>> | undefined;
  try {
    connection = await db.getConnection();
    const [columns] = await connection.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM v2_accounts"
    );
    const column = (name: string) =>
      columns.find(item => String(item.Field) === name);

    const roleColumn = column("role");
    const desiredRoleType = "enum('admin','client','bbro')";
    if (!roleColumn)
      await connection.query(
        "ALTER TABLE v2_accounts ADD COLUMN role ENUM('admin','client','bbro') NOT NULL DEFAULT 'client' AFTER isActive"
      );
    else if (
      roleColumn.Null === "YES" ||
      String(roleColumn.Default) !== "client" ||
      String(roleColumn.Type).replace(/\s/g, "").toLowerCase() !==
        desiredRoleType
    )
      await connection.query(
        "ALTER TABLE v2_accounts MODIFY COLUMN role ENUM('admin','client','bbro') NOT NULL DEFAULT 'client'"
      );

    const sessionVersionColumn = column("sessionVersion");
    if (!sessionVersionColumn)
      await connection.query(
        "ALTER TABLE v2_accounts ADD COLUMN sessionVersion INT UNSIGNED NOT NULL DEFAULT 0 AFTER role"
      );
    else if (
      sessionVersionColumn.Null === "YES" ||
      String(sessionVersionColumn.Default) !== "0"
    ) {
      await connection.query(
        "UPDATE v2_accounts SET sessionVersion=0 WHERE sessionVersion IS NULL"
      );
      await connection.query(
        "ALTER TABLE v2_accounts MODIFY COLUMN sessionVersion INT UNSIGNED NOT NULL DEFAULT 0"
      );
    }

    await connection.query(
      "CREATE TABLE IF NOT EXISTS v2_account_audit (id INT AUTO_INCREMENT PRIMARY KEY, accountId INT NOT NULL, actorId INT NOT NULL, action VARCHAR(32) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX account_history (accountId,id), FOREIGN KEY (accountId) REFERENCES v2_accounts(id), FOREIGN KEY (actorId) REFERENCES v2_accounts(id))"
    );
    await connection.query(
      "CREATE TABLE IF NOT EXISTS v2_user_migrations (migrationId VARCHAR(120) PRIMARY KEY, appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    );

    await connection.beginTransaction();
    const [markers] = await connection.execute<RowDataPacket[]>(
      "SELECT migrationId FROM v2_user_migrations WHERE migrationId=? FOR UPDATE",
      [MIGRATION_ID]
    );
    if (!markers.length) {
      // Promote only the already existing requested account. This never creates
      // an account and never writes a password or password hash.
      await connection.execute(
        "UPDATE v2_accounts SET role='admin' WHERE username=? AND role<>'admin'",
        ["rodrigo"]
      );
      await connection.execute(
        "INSERT INTO v2_user_migrations (migrationId) VALUES (?)",
        [MIGRATION_ID]
      );
    }
    await connection.commit();

    const [bbroMarkers] = await db.execute<RowDataPacket[]>(
      "SELECT migrationId FROM v2_user_migrations WHERE migrationId=? LIMIT 1",
      [BBRO_MIGRATION_ID]
    );
    if (!bbroMarkers.length) {
      // Read only identity fields. No password or password hash is consulted.
      const [rodrigoRows] = await db.execute<RowDataPacket[]>(
        "SELECT id,username,role FROM v2_accounts WHERE LOWER(username)=LOWER(?) AND role='admin' LIMIT 1",
        ["rodrigo"]
      );
      const rodrigo = rodrigoRows[0];
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
      await db.execute(
        "INSERT IGNORE INTO v2_user_migrations (migrationId) VALUES (?)",
        [BBRO_MIGRATION_ID]
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
    await db.end();
  }
}

migrate().catch(error => {
  console.error(
    "Não foi possível concluir a migration de contas V2. Nenhuma senha foi criada ou alterada.",
    error
  );
  process.exitCode = 1;
});
