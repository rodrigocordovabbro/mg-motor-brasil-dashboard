import { readFile } from "node:fs/promises";
import { getV2Pool } from "./v2Db";

// Run explicitly after review against the already provisioned V2 database.
// This module is intentionally not imported by the application startup path.
async function migrate() {
  const sql = await readFile(
    new URL("../drizzle/v2-sales-goal.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_sales_total_goals") ||
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_sales_total_goal_audit") ||
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_sales_total_goal_locks")
  )
    throw new Error("Migration de meta total de vendas V2 incompleta.");

  const db = getV2Pool();
  try {
    // Both statements are CREATE IF NOT EXISTS, so rerunning is additive and
    // does not seed or rewrite any imported MetaVendas value.
    for (const statement of sql
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map(value => value.trim())
      .filter(Boolean)) {
      await db.query(statement);
    }
    console.log(
      "Migration da meta total de vendas V2 concluída; nenhum override foi semeado."
    );
  } finally {
    await db.end();
  }
}

migrate().catch(error => {
  console.error(
    "Não foi possível concluir a migration da meta total de vendas V2. Nenhuma meta importada foi alterada.",
    error
  );
  process.exitCode = 1;
});
