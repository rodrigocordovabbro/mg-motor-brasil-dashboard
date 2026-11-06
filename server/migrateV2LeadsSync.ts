import { readFile } from "node:fs/promises";
import { getV2Pool } from "./v2Db";

const REQUIRED_TABLES = [
  "v2_lead_imports",
  "v2_lead_sync_rows",
  "v2_lead_sync_history",
] as const;

// Explicit operator-run migration only. It is intentionally not imported by
// application startup and contains no ALTER, DROP, DELETE or data backfill.
async function migrate() {
  const sql = await readFile(
    new URL("../drizzle/v2-leads-sync.sql", import.meta.url),
    "utf8"
  );
  for (const table of REQUIRED_TABLES) {
    if (!sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`))
      throw new Error("Migration de Leads Sync V2 incompleta.");
  }
  const statements = sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean);
  if (
    statements.length !== REQUIRED_TABLES.length ||
    statements.some(
      statement =>
        !REQUIRED_TABLES.some(table =>
          statement.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`)
        )
    )
  )
    throw new Error("Migration de Leads Sync incompleta ou não aditiva.");

  const db = getV2Pool();
  try {
    for (const statement of statements) await db.query(statement);
    console.log("Migration de Leads Sync V2 concluída; histórico preservado.");
  } finally {
    await db.end();
  }
}

migrate().catch(error => {
  console.error(
    "Não foi possível concluir a migration de Leads Sync V2; nenhum dado foi apagado.",
    error instanceof Error ? error.message : "erro desconhecido"
  );
  process.exitCode = 1;
});
