import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool } from "./v2Db";

type Db = ReturnType<typeof getV2Pool>;
type Row = RowDataPacket & Record<string, unknown>;

async function hasColumn(
  db: Db,
  table: string,
  column: string
): Promise<boolean> {
  const [rows] = await db.query<Row[]>(`SHOW COLUMNS FROM ${table} LIKE ?`, [
    column,
  ]);
  return rows.length > 0;
}

/**
 * Additive migration for general Retail metadata. Existing immutable snapshots
 * receive NULL and are never backfilled from Registration or WEEKLY_REG.
 */
export async function migrateV2Retail(): Promise<void> {
  const sql = await readFile(
    new URL("../drizzle/v2-retail.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("retailMtd INT NULL") ||
    !sql.includes("retailAsOf DATE NULL")
  )
    throw new Error("Migration de Retail comercial V2 incompleta.");

  const db = getV2Pool();
  try {
    if (!(await hasColumn(db, "v2_commercial_imports", "retailMtd")))
      await db.query(
        "ALTER TABLE v2_commercial_imports ADD COLUMN retailMtd INT NULL AFTER registrationAsOf"
      );
    if (!(await hasColumn(db, "v2_commercial_imports", "retailAsOf")))
      await db.query(
        "ALTER TABLE v2_commercial_imports ADD COLUMN retailAsOf DATE NULL AFTER retailMtd"
      );
    console.log(
      "Migration de Retail comercial V2 concluída; snapshots antigos preservados e sem backfill."
    );
  } finally {
    await db.end();
  }
}

const isDirectExecution =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  migrateV2Retail().catch(error => {
    console.error(
      "Não foi possível concluir a migration de Retail comercial V2. Nenhum snapshot foi apagado.",
      error
    );
    process.exitCode = 1;
  });
}
