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
 * Additive migration for general registration metadata. Existing immutable
 * snapshots receive NULL and are never backfilled from an unrelated source.
 */
export async function migrateV2Registration(): Promise<void> {
  const sql = await readFile(
    new URL("../drizzle/v2-registration.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("registrationMtd INT NULL") ||
    !sql.includes("registrationAsOf DATE NULL")
  )
    throw new Error("Migration de registro comercial V2 incompleta.");

  const db = getV2Pool();
  try {
    if (!(await hasColumn(db, "v2_commercial_imports", "registrationMtd")))
      await db.query(
        "ALTER TABLE v2_commercial_imports ADD COLUMN registrationMtd INT NULL AFTER sourceWeek"
      );
    if (!(await hasColumn(db, "v2_commercial_imports", "registrationAsOf")))
      await db.query(
        "ALTER TABLE v2_commercial_imports ADD COLUMN registrationAsOf DATE NULL AFTER registrationMtd"
      );
    console.log(
      "Migration de registro comercial V2 concluída; snapshots antigos preservados e sem backfill."
    );
  } finally {
    await db.end();
  }
}

const isDirectExecution =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  migrateV2Registration().catch(error => {
    console.error(
      "Não foi possível concluir a migration de registro comercial V2. Nenhum snapshot foi apagado.",
      error
    );
    process.exitCode = 1;
  });
}
