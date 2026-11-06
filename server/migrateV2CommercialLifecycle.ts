import { readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool } from "./v2Db";

type Db = ReturnType<typeof getV2Pool>;
type Row = RowDataPacket & Record<string, unknown>;

function timestampKey(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 19);
  const text = String(value).trim();
  if (!text) return null;
  return text.replace("T", " ").slice(0, 19);
}

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

async function hasIndex(
  db: Db,
  table: string,
  index: string
): Promise<boolean> {
  const [rows] = await db.query<Row[]>(
    `SHOW INDEX FROM ${table} WHERE Key_name = ?`,
    [index]
  );
  return rows.length > 0;
}

/**
 * Existing rows default to manual. Only an exact value + timestamp + latest
 * audit match is promoted to import provenance; uncertain legacy goals remain
 * manual and therefore survive source removal.
 */
async function backfillImportedGoalProvenance(db: Db): Promise<number> {
  const [goals] = await db.query<Row[]>(
    "SELECT competence,goal,updatedAt,updatedBy FROM v2_lead_goals WHERE sourceKind='manual' OR sourceKind IS NULL"
  );
  let updated = 0;
  for (const goal of goals) {
    const competence = String(goal.competence);
    const [imports] = await db.query<Row[]>(
      "SELECT i.id,i.total,i.importedAt,i.importedBy,s.removedAt FROM v2_commercial_imports i LEFT JOIN v2_commercial_import_state s ON s.importId=i.id WHERE i.kind='lead-goals' AND i.competence=? ORDER BY i.id DESC LIMIT 1",
      [competence]
    );
    const source = imports[0];
    if (!source || source.removedAt != null) continue;

    const [audits] = await db.query<Row[]>(
      "SELECT newGoal,accountId,createdAt FROM v2_goal_audit WHERE competence=? ORDER BY id DESC LIMIT 1",
      [competence]
    );
    const audit = audits[0];
    const sameValue = Number(goal.goal) === Number(source.total);
    const sameGoalTime =
      timestampKey(goal.updatedAt) === timestampKey(source.importedAt);
    const sameAuditTime =
      timestampKey(audit?.createdAt) === timestampKey(source.importedAt);
    const sameActor =
      Number(goal.updatedBy) === Number(source.importedBy) &&
      Number(audit?.accountId) === Number(goal.updatedBy);
    const auditMatches = Number(audit?.newGoal) === Number(goal.goal);
    if (
      !sameValue ||
      !sameGoalTime ||
      !sameAuditTime ||
      !sameActor ||
      !auditMatches
    )
      continue;

    await db.query(
      "UPDATE v2_lead_goals SET sourceKind='import',sourceImportId=?,updatedAt=updatedAt WHERE competence=? AND (sourceKind='manual' OR sourceKind IS NULL)",
      [Number(source.id), competence]
    );
    updated += 1;
  }
  return updated;
}

export async function migrateV2CommercialLifecycle(): Promise<void> {
  const sql = await readFile(
    new URL("../drizzle/v2-commercial-lifecycle.sql", import.meta.url),
    "utf8"
  );
  if (
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_commercial_import_state") ||
    !sql.includes("CREATE TABLE IF NOT EXISTS v2_commercial_import_audit")
  )
    throw new Error("Migration de lifecycle comercial V2 incompleta.");

  const db = getV2Pool();
  try {
    // Keep this runner compatible with deployments where multipleStatements is
    // disabled on mysql2 pools.
    for (const statement of sql
      .split(/;\s*/)
      .map(part => part.trim())
      .filter(part => part.includes("CREATE TABLE IF NOT EXISTS"))) {
      await db.query(statement);
    }

    if (!(await hasColumn(db, "v2_lead_goals", "sourceKind")))
      await db.query(
        "ALTER TABLE v2_lead_goals ADD COLUMN sourceKind VARCHAR(16) NOT NULL DEFAULT 'manual' AFTER updatedBy"
      );
    if (!(await hasColumn(db, "v2_lead_goals", "sourceImportId")))
      await db.query(
        "ALTER TABLE v2_lead_goals ADD COLUMN sourceImportId INT NULL AFTER sourceKind"
      );
    if (!(await hasIndex(db, "v2_lead_goals", "commercial_goal_source")))
      await db.query(
        "ALTER TABLE v2_lead_goals ADD INDEX commercial_goal_source (sourceImportId)"
      );

    const backfilled = await backfillImportedGoalProvenance(db);
    console.log(
      `Migration lifecycle comercial V2 concluída; snapshots preservados; metas legadas vinculadas com segurança: ${backfilled}.`
    );
  } finally {
    await db.end();
  }
}

migrateV2CommercialLifecycle().catch(error => {
  console.error(
    "Não foi possível concluir a migration de lifecycle comercial V2. Nenhum snapshot ou meta foi apagado.",
    error
  );
  process.exitCode = 1;
});
