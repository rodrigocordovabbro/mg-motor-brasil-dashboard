import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { CommercialSourceRow } from "../shared/v2Commercial";
import {
  classifyNonDealerLabel,
  dealerRegistryList,
  isCommercialTotalLabel,
  normalizeDealerKey,
  resolveCommercialDealersWithRegistry,
  resolveRegisteredDealer,
  validatedDealerState,
  type DealerRegistrationPending,
  type DealerRegistrationSkipped,
  type ExtraDealerRegistryEntry,
} from "../shared/dealerRegistryExtensions";
import { getV2Pool } from "./v2Db";

export type DealerRegistryActor = {
  id: number;
  username: string;
};

export type RegisterNewUploadDealersResult = {
  created: ExtraDealerRegistryEntry[];
  existing: ExtraDealerRegistryEntry[];
  pending: DealerRegistrationPending[];
  skipped: DealerRegistrationSkipped[];
};

type DealerRegistryRow = RowDataPacket & {
  id: number;
  label: string;
  normalizedKey: string;
  state: string | null;
  sourceImportId: number | null;
  createdBy: number;
  createdByUsername: string;
  createdAt: string | Date;
};

type RegistryExecutor = Pool | PoolConnection;

const SELECT_COLUMNS =
  "id,label,normalizedKey,state,sourceImportId,createdBy,createdByUsername,createdAt";

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toISOString();
}

function mapRegistryRow(row: DealerRegistryRow): ExtraDealerRegistryEntry {
  const label = String(row.label);
  return {
    id: Number(row.id),
    name: label,
    label,
    normalizedKey: String(row.normalizedKey),
    state: row.state == null ? null : String(row.state),
    sourceImportId:
      row.sourceImportId == null ? null : Number(row.sourceImportId),
    createdBy: Number(row.createdBy),
    createdByUsername: String(row.createdByUsername),
    createdAt: timestamp(row.createdAt),
  };
}

/** Reads only persisted extras; the official registry remains in shared/dealerRegistry.ts. */
export async function readExtraDealerRegistry(
  executor?: PoolConnection
): Promise<ExtraDealerRegistryEntry[]> {
  const db: RegistryExecutor = executor ?? getV2Pool();
  const [rows] = await db.execute<DealerRegistryRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM v2_dealer_registry ORDER BY id ASC`
  );
  return rows.map(mapRegistryRow);
}

function assertActor(actor: DealerRegistryActor): void {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0)
    throw new Error("O ator do cadastro de dealer é inválido.");
  if (
    typeof actor.username !== "string" ||
    actor.username.trim() === "" ||
    actor.username.length > 64
  )
    throw new Error("O username do ator do cadastro de dealer é inválido.");
}

function sourceImportValue(sourceImportId: number | undefined): number | null {
  if (sourceImportId == null) return null;
  if (!Number.isSafeInteger(sourceImportId) || sourceImportId <= 0)
    throw new Error("O id da importação de origem é inválido.");
  return sourceImportId;
}

function rowKey(row: CommercialSourceRow): string {
  return String(row.key);
}

function skip(
  row: CommercialSourceRow,
  reason: DealerRegistrationSkipped["reason"]
): DealerRegistrationSkipped {
  return {
    rowKey: rowKey(row),
    sourceLabel: String(row.sourceLabel ?? ""),
    reason,
  };
}

function pending(
  row: CommercialSourceRow,
  reason: DealerRegistrationPending["reason"]
): DealerRegistrationPending {
  return {
    rowKey: rowKey(row),
    sourceLabel: String(row.sourceLabel ?? ""),
    state: validatedDealerState(row.state, row.sourceLabel),
    reason,
  };
}

async function selectByKey(
  executor: PoolConnection,
  normalizedKey: string
): Promise<ExtraDealerRegistryEntry> {
  const [rows] = await executor.execute<DealerRegistryRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM v2_dealer_registry WHERE normalizedKey=? LIMIT 1`,
    [normalizedKey]
  );
  if (!rows[0])
    throw new Error("O dealer extra inserido não pôde ser lido na mesma transação.");
  return mapRegistryRow(rows[0]);
}

/**
 * Registers only full, unknown dealer labels from a confirmed upload.
 *
 * This function deliberately does not call beginTransaction/commit/rollback.
 * The caller must pass the import's own PoolConnection after it has an import id;
 * any later import failure can therefore roll back these inserts together.
 * Preview code must not call this function.
 */
export async function registerNewUploadDealers(
  rows: CommercialSourceRow[],
  actor: DealerRegistryActor,
  executor: PoolConnection,
  sourceImportId?: number
): Promise<RegisterNewUploadDealersResult> {
  assertActor(actor);
  const importId = sourceImportValue(sourceImportId);
  if (!Array.isArray(rows)) throw new Error("As linhas comerciais são inválidas.");
  if (!rows.length)
    return { created: [], existing: [], pending: [], skipped: [] };

  const dynamic = await readExtraDealerRegistry(executor);
  const created: ExtraDealerRegistryEntry[] = [];
  const existing: ExtraDealerRegistryEntry[] = [];
  const pendingRows: DealerRegistrationPending[] = [];
  const skipped: DealerRegistrationSkipped[] = [];
  const seenInUpload = new Set<string>();
  const knownExtras = [...dynamic];

  for (const row of rows) {
    const sourceLabel = String(row.sourceLabel ?? "");
    const label = sourceLabel.trim();
    const normalizedKey = normalizeDealerKey(label);
    if (!label || !normalizedKey) {
      skipped.push(skip(row, "blank-label"));
      continue;
    }
    if (isCommercialTotalLabel(label)) {
      skipped.push(skip(row, "total-label"));
      continue;
    }

    // A mapping supplied by the importer is authoritative and means the source
    // row already has a destination; it must not create a second extra unit.
    if (Array.isArray(row.rawDealers) && row.rawDealers.length) {
      skipped.push(skip(row, "explicit-mapping"));
      continue;
    }

    const state = validatedDealerState(row.state, sourceLabel);
    if (seenInUpload.has(normalizedKey)) {
      skipped.push(skip(row, "duplicate-in-upload"));
      continue;
    }
    if (
      resolveCommercialDealersWithRegistry(sourceLabel, state, knownExtras).length > 0 ||
      resolveRegisteredDealer(sourceLabel, knownExtras) !== null
    ) {
      skipped.push(skip(row, "already-known"));
      continue;
    }

    const groupReason = classifyNonDealerLabel(sourceLabel, state);
    if (groupReason) {
      pendingRows.push(pending(row, groupReason));
      continue;
    }
    seenInUpload.add(normalizedKey);

    // The no-op duplicate-key update makes concurrent confirmed imports safe
    // while leaving the first label, state, actor, and timestamp immutable.
    const [result] = await executor.execute<ResultSetHeader>(
      "INSERT INTO v2_dealer_registry (label,normalizedKey,state,origin,sourceImportId,createdBy,createdByUsername) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
      [
        sourceLabel,
        normalizedKey,
        state,
        "commercial-upload",
        importId,
        actor.id,
        actor.username,
      ]
    );
    const entry = await selectByKey(executor, normalizedKey);
    if (Number(result.affectedRows) === 1) {
      created.push(entry);
      knownExtras.push(entry);
    } else {
      existing.push(entry);
    }
  }

  return { created, existing, pending: pendingRows, skipped };
}

/** Small adapter for dashboard callers that need only the public list shape. */
export function extraDealerRegistryList(
  extras: readonly ExtraDealerRegistryEntry[]
): Array<{ name: string; state: string | null }> {
  return dealerRegistryList(extras).filter(
    item => !item.name.trim().toLocaleLowerCase("pt-BR").startsWith("total")
  );
}
