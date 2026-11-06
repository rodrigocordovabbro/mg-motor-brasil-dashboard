import type { RowDataPacket } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import type { UserRole } from "../shared/accountRoles";
import {
  applyMediaPlanProjectionOverrides,
  emptyMediaPlanProjectionValues,
  isMediaPlanProjectionMonth,
  MAX_MEDIA_PLAN_PROJECTION_LEADS,
  type MediaPlanProjectionPatch,
  type MediaPlanProjectionRead,
  type MediaPlanProjectionUpdateResult,
  type MediaPlanProjectionValues,
  type MediaPlanWithProjectionOverrides,
  validateMediaPlanProjectionLead,
} from "../shared/v2MediaPlanProjections";
import { getMediaPlan, MEDIA_PLANS } from "./mediaPlans";
import { getV2Pool } from "./v2Db";

const TARGET_GLOBAL = "global" as const;
const TARGET_PRODUCT = "product" as const;
const TARGET_ROW = "row" as const;
type ProjectionTargetType =
  | typeof TARGET_GLOBAL
  | typeof TARGET_PRODUCT
  | typeof TARGET_ROW;

export type V2MediaPlanProjectionActor = {
  id: number;
  username: string;
  role?: UserRole;
};

type RawOverride = RowDataPacket & {
  targetType: string;
  targetKey: string;
  value: number;
};

type RawVersion = RowDataPacket & { version: number };
type ProjectionSqlExecutor = {
  execute<T extends RowDataPacket[]>(
    query: string,
    values?: unknown[]
  ): Promise<[T, unknown]>;
};

function normalizeMonth(monthId: string): string {
  const normalized = monthId.trim();
  if (!isMediaPlanProjectionMonth(normalized))
    throw new Error("O mês deve estar no formato AAAA-MM.");
  if (!getMediaPlan(normalized))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Plano de mídia aprovado não encontrado para este mês.",
    });
  return normalized;
}

function assertExpectedVersion(current: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0)
    throw new Error("Versão esperada inválida.");
  if (current !== expected)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Outra pessoa atualizou as projeções deste mês. Atualize o plano antes de salvar novamente.",
    });
}

/** The identity check is repeated in the service; UI props are never trusted. */
export function assertV2MediaPlanProjectionOwner(
  actor: V2MediaPlanProjectionActor
): void {
  if (
    actor.role !== "admin" ||
    actor.username.trim().toLowerCase() !== "rodrigo"
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Apenas o administrador Rodrigo pode editar as projeções de mídia.",
    });
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conta administradora inválida.",
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateNullableLead(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number")
    throw new Error(
      `Informe um número inteiro entre 0 e ${MAX_MEDIA_PLAN_PROJECTION_LEADS.toLocaleString("pt-BR")}.`
    );
  return validateMediaPlanProjectionLead(value);
}

function normalizePatch(
  monthId: string,
  patch: MediaPlanProjectionPatch
): MediaPlanProjectionPatch {
  const plan = getMediaPlan(monthId);
  if (!plan) throw new Error("Plano de mídia aprovado não encontrado.");
  if (!isRecord(patch)) throw new Error("Valores de projeção inválidos.");

  const normalized: MediaPlanProjectionPatch = {};
  let changed = false;
  if (Object.prototype.hasOwnProperty.call(patch, "globalLeads")) {
    normalized.globalLeads = validateNullableLead(patch.globalLeads);
    changed = true;
  }

  const products = new Set(
    plan.totals.flatMap(total => (total.product ? [total.product] : []))
  );
  if (patch.products !== undefined) {
    if (!isRecord(patch.products))
      throw new Error("Overrides de produto inválidos.");
    normalized.products = {};
    for (const [key, raw] of Object.entries(patch.products)) {
      if (!products.has(key))
        throw new Error("O produto informado não existe neste plano aprovado.");
      normalized.products[key] = validateNullableLead(raw);
      changed = true;
    }
  }

  const rows = new Map(
    plan.rows.filter(row => row.leads != null).map(row => [row.id, row])
  );
  if (patch.rows !== undefined) {
    if (!isRecord(patch.rows)) throw new Error("Overrides de canal inválidos.");
    normalized.rows = {};
    for (const [key, raw] of Object.entries(patch.rows)) {
      if (!rows.has(key))
        throw new Error(
          "A linha informada não possui Leads projetados no plano aprovado."
        );
      normalized.rows[key] = validateNullableLead(raw);
      changed = true;
    }
  }
  if (!changed) throw new Error("Informe ao menos uma projeção para salvar.");
  return normalized;
}

function valuesToJson(values: MediaPlanProjectionValues): string {
  const json: Record<string, unknown> = {};
  if (values.globalLeads !== undefined) json.globalLeads = values.globalLeads;
  json.products = Object.fromEntries(
    Object.entries(values.products).sort(([a], [b]) => a.localeCompare(b))
  );
  json.rows = Object.fromEntries(
    Object.entries(values.rows).sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(json);
}

function setOverride(
  values: MediaPlanProjectionValues,
  type: ProjectionTargetType,
  key: string,
  value: number
): void {
  if (type === TARGET_GLOBAL) values.globalLeads = value;
  else if (type === TARGET_PRODUCT) values.products[key] = value;
  else values.rows[key] = value;
}

function deleteOverride(
  values: MediaPlanProjectionValues,
  type: ProjectionTargetType,
  key: string
): void {
  if (type === TARGET_GLOBAL) delete values.globalLeads;
  else if (type === TARGET_PRODUCT) delete values.products[key];
  else delete values.rows[key];
}

function cloneValues(
  values: MediaPlanProjectionValues
): MediaPlanProjectionValues {
  return {
    ...(values.globalLeads === undefined
      ? {}
      : { globalLeads: values.globalLeads }),
    products: { ...values.products },
    rows: { ...values.rows },
  };
}

function readRawValues(rows: RawOverride[]): MediaPlanProjectionValues {
  const values = emptyMediaPlanProjectionValues();
  for (const row of rows) {
    const value = Number(row.value);
    if (!Number.isSafeInteger(value) || value < 0) continue;
    if (row.targetType === TARGET_GLOBAL && row.targetKey === "globalLeads")
      values.globalLeads = value;
    else if (row.targetType === TARGET_PRODUCT)
      values.products[row.targetKey] = value;
    else if (row.targetType === TARGET_ROW) values.rows[row.targetKey] = value;
  }
  return values;
}

async function readRowsForMonth(
  monthId: string,
  db: ProjectionSqlExecutor
): Promise<RawOverride[]> {
  const [rows] = await db.execute(
    "SELECT targetType,targetKey,value FROM v2_media_plan_projection_overrides WHERE monthId=? ORDER BY targetType,targetKey",
    [monthId]
  );
  return rows as RawOverride[];
}

/** Read endpoint contract: only sparse numeric contexts, never actor metadata. */
export async function readMediaPlanProjections(
  monthId: string
): Promise<MediaPlanProjectionRead> {
  const key = normalizeMonth(monthId);
  const db = getV2Pool();
  const [versionRows, overrideRows] = await Promise.all([
    db.execute<RowDataPacket[]>(
      "SELECT version FROM v2_media_plan_projection_versions WHERE monthId=? LIMIT 1",
      [key]
    ),
    db.execute<RowDataPacket[]>(
      "SELECT targetType,targetKey,value FROM v2_media_plan_projection_overrides WHERE monthId=? ORDER BY targetType,targetKey",
      [key]
    ),
  ]);
  return {
    monthId: key,
    version: versionRows[0].length
      ? Number((versionRows[0] as RawVersion[])[0].version)
      : 0,
    values: readRawValues(overrideRows[0] as RawOverride[]),
  };
}

/**
 * Read-only source augmentation used by mediaPlan.plans. With no rows it
 * deliberately returns the imported array unchanged and never seeds defaults.
 */
export async function readPlansWithProjections(): Promise<
  MediaPlanWithProjectionOverrides[]
> {
  const db = getV2Pool();
  const [overrideRows] = await db.execute<RowDataPacket[]>(
    "SELECT monthId,targetType,targetKey,value FROM v2_media_plan_projection_overrides ORDER BY monthId,targetType,targetKey"
  );
  if (!overrideRows.length) return MEDIA_PLANS;

  const byMonth = new Map<string, RawOverride[]>();
  for (const raw of overrideRows as (RawOverride & { monthId: string })[]) {
    const list = byMonth.get(raw.monthId) ?? [];
    list.push(raw);
    byMonth.set(raw.monthId, list);
  }
  const versions = new Map<string, number>();
  const [versionRows] = await db.execute<RowDataPacket[]>(
    "SELECT monthId,version FROM v2_media_plan_projection_versions ORDER BY monthId"
  );
  for (const row of versionRows as (RawVersion & { monthId: string })[])
    versions.set(row.monthId, Number(row.version));

  return MEDIA_PLANS.map(plan => {
    const rows = byMonth.get(plan.month);
    if (!rows?.length) return plan;
    const values = readRawValues(rows);
    return applyMediaPlanProjectionOverrides(plan, {
      monthId: plan.month,
      version: versions.get(plan.month) ?? 0,
      values,
    });
  });
}

export async function updateMediaPlanProjections(
  input: {
    monthId: string;
    expectedVersion: number;
    values: MediaPlanProjectionPatch;
  },
  actor: V2MediaPlanProjectionActor
): Promise<MediaPlanProjectionUpdateResult> {
  assertV2MediaPlanProjectionOwner(actor);
  const monthId = normalizeMonth(input.monthId);
  const patch = normalizePatch(monthId, input.values);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
    throw new Error("Versão esperada inválida.");

  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    // Materialize and exclusively lock the version key before the SELECT:
    // SELECT FOR UPDATE alone cannot lock a missing row on the first save.
    await connection.execute(
      "INSERT INTO v2_media_plan_projection_versions (monthId,version,updatedBy) VALUES (?,0,?) ON DUPLICATE KEY UPDATE monthId=VALUES(monthId)",
      [monthId, actor.id]
    );
    const [versionRows] = await connection.execute<RowDataPacket[]>(
      "SELECT version FROM v2_media_plan_projection_versions WHERE monthId=? FOR UPDATE",
      [monthId]
    );
    const currentVersion = versionRows.length
      ? Number((versionRows as RawVersion[])[0].version)
      : 0;
    assertExpectedVersion(currentVersion, input.expectedVersion);

    const oldRows = await readRowsForMonth(monthId, connection);
    const oldValues = readRawValues(oldRows);
    const newValues = cloneValues(oldValues);
    if (Object.prototype.hasOwnProperty.call(patch, "globalLeads")) {
      const globalLeads = patch.globalLeads;
      if (globalLeads == null)
        deleteOverride(newValues, TARGET_GLOBAL, "globalLeads");
      else setOverride(newValues, TARGET_GLOBAL, "globalLeads", globalLeads);
    }
    for (const [key, value] of Object.entries(patch.products ?? {})) {
      if (value === null) deleteOverride(newValues, TARGET_PRODUCT, key);
      else setOverride(newValues, TARGET_PRODUCT, key, value);
    }
    for (const [key, value] of Object.entries(patch.rows ?? {})) {
      if (value === null) deleteOverride(newValues, TARGET_ROW, key);
      else setOverride(newValues, TARGET_ROW, key, value);
    }

    const nextVersion = currentVersion + 1;
    await connection.execute(
      "INSERT INTO v2_media_plan_projection_versions (monthId,version,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
      [monthId, nextVersion, actor.id]
    );
    await connection.execute(
      "DELETE FROM v2_media_plan_projection_overrides WHERE monthId=?",
      [monthId]
    );
    const entries: Array<[ProjectionTargetType, string, number]> = [];
    if (newValues.globalLeads !== undefined)
      entries.push([TARGET_GLOBAL, "globalLeads", newValues.globalLeads]);
    for (const [key, value] of Object.entries(newValues.products))
      entries.push([TARGET_PRODUCT, key, value]);
    for (const [key, value] of Object.entries(newValues.rows))
      entries.push([TARGET_ROW, key, value]);
    for (const [targetType, targetKey, value] of entries) {
      await connection.execute(
        "INSERT INTO v2_media_plan_projection_overrides (monthId,targetType,targetKey,value,updatedBy) VALUES (?,?,?,?,?)",
        [monthId, targetType, targetKey, value, actor.id]
      );
    }
    await connection.execute(
      "INSERT INTO v2_media_plan_projection_audit (monthId,version,username,accountId,oldValues,newValues) VALUES (?,?,?,?,?,?)",
      [
        monthId,
        nextVersion,
        actor.username,
        actor.id,
        valuesToJson(oldValues),
        valuesToJson(newValues),
      ]
    );
    await connection.commit();
    return { success: true, monthId, version: nextVersion, values: newValues };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Stable integration names for the mediaPlan router. The aliases keep the
// service contract explicit without duplicating any persistence logic.
export const readMediaPlansWithProjections = readPlansWithProjections;
export const saveMediaPlanProjections = updateMediaPlanProjections;
