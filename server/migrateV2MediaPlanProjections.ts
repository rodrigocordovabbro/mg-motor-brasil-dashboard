import { readFile } from "node:fs/promises";
import { getV2Pool } from "./v2Db";

// Run explicitly after review against the already provisioned V2 database.
// This module is intentionally not imported by the application startup path.
async function migrate() {
  const sql = await readFile(
    new URL("../drizzle/v2-media-projections.sql", import.meta.url),
    "utf8"
  );
  for (const table of [
    "v2_media_plan_projection_versions",
    "v2_media_plan_projection_overrides",
    "v2_media_plan_projection_audit",
  ]) {
    if (!sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`))
      throw new Error(
        `Migration de projeções de mídia V2 incompleta: ${table}.`
      );
  }
  const statements = sql
    .split(/;\s*(?=CREATE TABLE IF NOT EXISTS)/g)
    .map(statement => statement.trim())
    .filter(Boolean);
  if (statements.length !== 3)
    throw new Error(
      "Migration de projeções de mídia V2 deve conter exatamente três DDLs."
    );

  const db = getV2Pool();
  try {
    // TiDB/MySQL deployments may reject multi-statements. Execute each CREATE
    // independently; reruns remain additive and do not seed, reset or rewrite
    // any approved forecast or manual override.
    for (const statement of statements) await db.query(statement);
    console.log(
      "Migration das projeções de mídia V2 concluída; nenhum override foi semeado."
    );
  } finally {
    await db.end();
  }
}

migrate().catch(error => {
  console.error(
    "Não foi possível concluir a migration das projeções de mídia V2. Nenhuma projeção aprovada foi alterada.",
    error
  );
  process.exitCode = 1;
});
