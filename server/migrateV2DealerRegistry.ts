import { readFile } from "node:fs/promises";
import { getV2Pool } from "./v2Db";

// This runner is intentionally explicit and is never imported by the server.
async function migrate() {
  const sql = await readFile(
    new URL("../drizzle/v2-dealer-registry.sql", import.meta.url),
    "utf8"
  );
  if (!sql.includes("CREATE TABLE IF NOT EXISTS v2_dealer_registry"))
    throw new Error("Migration do registry de dealers V2 incompleta.");
  if (!sql.includes("UNIQUE KEY dealer_registry_normalized_key"))
    throw new Error("Migration do registry de dealers V2 sem chave única.");

  const db = getV2Pool();
  try {
    await db.query(sql);
    const [columns]: any = await db.query(
      "SHOW COLUMNS FROM v2_dealer_registry LIKE 'normalizedKey'"
    );
    if (!columns.length)
      throw new Error("A tabela v2_dealer_registry não possui normalizedKey.");
    console.log(
      "Migration do registry de dealers V2 concluída; nenhuma linha foi importada."
    );
  } finally {
    await db.end();
  }
}

migrate().catch(error => {
  console.error(
    "Não foi possível concluir a migration do registry de dealers V2. Nenhum cadastro foi importado.",
    error
  );
  process.exitCode = 1;
});
