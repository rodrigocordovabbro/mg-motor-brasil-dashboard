import { readFile } from "node:fs/promises";
import { getV2Pool } from "./v2Db";

// Run explicitly against the already provisioned V2 database. This file is
// intentionally not imported by the server startup path.
async function migrate() {
  const sql = await readFile(
    new URL("../drizzle/v2-commercial.sql", import.meta.url),
    "utf8"
  );
  if (!sql.includes("CREATE TABLE IF NOT EXISTS v2_commercial_imports"))
    throw new Error("Migration comercial V2 incompleta.");
  const db = getV2Pool();
  try {
    await db.query(sql);
    const [columns]: any = await db.query(
      "SHOW COLUMNS FROM v2_commercial_imports LIKE 'sourceWeek'"
    );
    if (!columns.length)
      await db.query(
        "ALTER TABLE v2_commercial_imports ADD COLUMN sourceWeek TINYINT NULL AFTER asOf"
      );
    console.log(
      "Migration comercial V2 concluída; snapshots antigos preservados."
    );
  } finally {
    await db.end();
  }
}

migrate().catch(error => {
  console.error(
    "Não foi possível concluir a migration comercial V2. Nenhum snapshot foi apagado.",
    error
  );
  process.exitCode = 1;
});
