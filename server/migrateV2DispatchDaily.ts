import { readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool } from "./v2Db";

// Run only on the already provisioned V2 project database; never at container startup.
async function migrate() {
  const db = getV2Pool();
  try {
    const [columns] = await db.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM v2_dispatch_cells"
    );
    const volume = columns.find(column => column.Field === "volume");
    if (!volume) throw new Error("Controle de envios V2 não inicializado");
    if (volume.Null !== "YES")
      await db.query(
        "ALTER TABLE v2_dispatch_cells MODIFY COLUMN volume INT NULL"
      );
    if (!columns.some(column => column.Field === "sourcePending"))
      await db.query(
        "ALTER TABLE v2_dispatch_cells ADD COLUMN sourcePending BOOLEAN NOT NULL DEFAULT FALSE"
      );
    const migration = await readFile(
      new URL("../drizzle/v2-dispatch-daily.sql", import.meta.url),
      "utf8"
    );
    const create = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS v2_dispatch_imports")
    );
    if (!create.startsWith("CREATE TABLE IF NOT EXISTS v2_dispatch_imports"))
      throw new Error("Migration própria V2 incompleta");
    await db.query(create);
    console.log(
      "Migration V2 concluída; dados e checks existentes preservados."
    );
  } finally {
    await db.end();
  }
}
migrate().catch(() => {
  console.error(
    "Não foi possível concluir a migration V2. Nenhum dado foi apagado."
  );
  process.exitCode = 1;
});
