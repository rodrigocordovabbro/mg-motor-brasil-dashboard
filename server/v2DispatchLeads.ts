import { resolveOfficialDealer } from "../shared/dealerRegistry";
import { TRPCError } from "@trpc/server";
import type { RowDataPacket } from "mysql2/promise";
import {
  addIsoDays,
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "../shared/dashboardDates";
import type {
  DispatchCell,
  DispatchDay,
  DispatchReport,
  DispatchRow,
} from "../shared/v2Dispatch";
import type { V2Filters, V2Lead } from "../shared/v2Types";
import { getV2Pool } from "./v2Db";
import {
  filterV2LeadRows,
  mapV2LeadRow,
  readV2LeadsForPeriod,
} from "./v2Leads";
import { getDispatchReport } from "./v2Dispatch";

type LeadMapValue =
  | number
  | string
  | { rowId?: unknown; matchMethod?: unknown };
type LeadMetadata = {
  days: DispatchDay[];
  leadDealerMap: Record<string, LeadMapValue>;
  leadDealerMapMeta: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

type SourceInfo = {
  status: "READY" | "NOT_CONFIGURED";
  name: string;
  importedAt: string | null;
};

type Assigned = {
  rowId: number;
  metadataMatched: boolean;
  matchMethod: string;
};

const LEAD_SELECT =
  "SELECT id,leadDate AS date,leadHour AS hour,name,model,version,channel,campaign,dealer,city,state,crm FROM v2_leads WHERE leadDate>=? AND leadDate<=?";
const QUALIFICATION_ROW = "Leads em qualificação";

function parseMetadata(value: unknown): LeadMetadata {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const object =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const rawDays = Array.isArray(object.days) ? object.days : [];
  const days = rawDays
    .filter(
      day =>
        day &&
        typeof day === "object" &&
        typeof (day as { date?: unknown }).date === "string"
    )
    .map(day => {
      const source = day as Record<string, unknown>;
      return {
        date: String(source.date),
        label: String(source.label ?? source.date),
        sourceTotal:
          typeof source.sourceTotal === "number" ? source.sourceTotal : null,
        computedTotal:
          typeof source.computedTotal === "number"
            ? source.computedTotal
            : null,
        ...(source.pending === true ? { pending: true } : {}),
      } satisfies DispatchDay;
    });
  const map = object.leadDealerMap;
  const mapMeta = object.leadDealerMapMeta;
  return {
    ...object,
    days,
    leadDealerMap:
      map && typeof map === "object"
        ? (map as Record<string, LeadMapValue>)
        : {},
    leadDealerMapMeta:
      mapMeta && typeof mapMeta === "object"
        ? (mapMeta as Record<string, Record<string, unknown>>)
        : {},
  };
}

function dayLabel(date: string): string {
  const months = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const [, month, day] = date.split("-");
  return `${day}/${months[Number(month) - 1] ?? month}`;
}

function datesBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = from; date <= to; date = addIsoDays(date, 1))
    result.push(date);
  return result;
}

function normalizeDealer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");
}

function isQualificationDealer(value: string): boolean {
  const normalized = normalizeDealer(value);
  return (
    normalized === "" ||
    normalized === "outros" ||
    normalized === "outro" ||
    normalized === "nao informado"
  );
}

function mappedRowId(value: unknown): number | null {
  const candidate =
    value && typeof value === "object"
      ? (value as { rowId?: unknown }).rowId
      : value;
  const id = Number(candidate);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function stableVirtualId(raw: string): number {
  let hash = 2166136261;
  for (const character of raw)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return -Math.max(1, hash >>> 0);
}

function sourceDate(value: unknown): string | null {
  if (value == null) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readLeadSource(): Promise<SourceInfo> {
  const [rows] = await getV2Pool().execute<RowDataPacket[]>(
    "SELECT name,importedAt FROM v2_sources WHERE id=1 LIMIT 1"
  );
  const importedAt = sourceDate(rows[0]?.importedAt);
  return {
    status: importedAt ? "READY" : "NOT_CONFIGURED",
    name: rows[0] ? String(rows[0].name) : "LEADS MG — Base",
    importedAt,
  };
}

async function reportMetadata(reportId: number): Promise<LeadMetadata> {
  const [rows] = await getV2Pool().execute<RowDataPacket[]>(
    "SELECT metadata FROM v2_dispatch_reports WHERE id=? LIMIT 1",
    [reportId]
  );
  return parseMetadata(rows[0]?.metadata);
}

function findDeterministicRow(
  rawDealer: string,
  rows: DispatchRow[],
  metadata: LeadMetadata
): Assigned | null {
  const canonical = resolveOfficialDealer(rawDealer);
  if (canonical) {
    const official = rows.find(row => row.storeName === canonical);
    if (official)
      return {
        rowId: official.id,
        metadataMatched: true,
        matchMethod: "official-de-para",
      };
    const officialAliases = rows.filter(
      row => resolveOfficialDealer(row.storeName) === canonical
    );
    if (officialAliases.length === 1)
      return {
        rowId: officialAliases[0].id,
        metadataMatched: true,
        matchMethod: "official-de-para",
      };
  }
  const existingIds = new Set(rows.map(row => row.id));
  const persisted = mappedRowId(metadata.leadDealerMap[rawDealer]);
  const persistedRow = rows.find(row => row.id === persisted);
  const destinationCanonical = persistedRow
    ? resolveOfficialDealer(persistedRow.storeName)
    : null;
  const officialDestinationAllowed =
    !destinationCanonical || destinationCanonical === canonical;
  if (persisted && existingIds.has(persisted) && officialDestinationAllowed) {
    const meta = metadata.leadDealerMapMeta[rawDealer];
    return {
      rowId: persisted,
      metadataMatched:
        meta?.matchMethod !== "new-raw" &&
        meta?.matchMethod !== "qualification",
      matchMethod: String(meta?.matchMethod ?? "persisted"),
    };
  }
  if (isQualificationDealer(rawDealer)) {
    const qualification = rows.find(row => row.storeName === QUALIFICATION_ROW);
    if (qualification) {
      return {
        rowId: qualification.id,
        metadataMatched: false,
        matchMethod: "qualification",
      };
    }
    return null;
  }
  const exact = rows.find(row => row.storeName === rawDealer);
  if (exact)
    return { rowId: exact.id, metadataMatched: true, matchMethod: "exact" };
  const normalized = normalizeDealer(rawDealer);
  const candidates = rows.filter(
    row => normalizeDealer(row.storeName) === normalized
  );
  if (candidates.length === 1) {
    return {
      rowId: candidates[0].id,
      metadataMatched: true,
      matchMethod: "normalized",
    };
  }
  return null;
}

function syntheticRow(rawDealer: string, qualification = false): DispatchRow {
  const name = qualification ? QUALIFICATION_ROW : rawDealer;
  const id = stableVirtualId(
    qualification ? "qualification" : `dealer:${rawDealer}`
  );
  return {
    id,
    rowNumber: 0,
    storeName: name,
    crmResponsible: "",
    syonetIntegration: "",
    bbroIntegration: "",
    cells: [],
    rawDealers: [],
    metadataMatched: false,
  };
}

function archiveCell(row: DispatchRow, date: string): DispatchCell | undefined {
  return row.cells.find(cell => cell.date === date);
}

function mapLeadRows(
  reportRows: DispatchRow[],
  metadata: LeadMetadata,
  leads: V2Lead[],
  allowSynthetic: boolean
): {
  rows: DispatchRow[];
  assignment: Map<string, Assigned>;
  rawDealers: string[];
} {
  const rows: DispatchRow[] = reportRows.map(row => ({
    ...row,
    rawDealers: [] as string[],
    metadataMatched: row.metadataMatched ?? true,
  }));
  const byId = new Map<number, DispatchRow>(rows.map(row => [row.id, row]));
  const assignment = new Map<string, Assigned>();
  const rawDealers = [...new Set(leads.map(lead => lead.dealer))];
  for (const rawDealer of rawDealers) {
    let assigned = findDeterministicRow(rawDealer, rows, metadata);
    if (!assigned && allowSynthetic) {
      const qualification = isQualificationDealer(rawDealer);
      const virtual = syntheticRow(rawDealer, qualification);
      assigned = {
        rowId: virtual.id,
        metadataMatched: false,
        matchMethod: qualification ? "qualification" : "new-raw",
      };
      if (!byId.has(virtual.id)) {
        rows.push(virtual);
        byId.set(virtual.id, virtual);
      }
    }
    if (!assigned) continue;
    assignment.set(rawDealer, assigned);
    const row = byId.get(assigned.rowId);
    if (row && !row.rawDealers!.includes(rawDealer))
      row.rawDealers!.push(rawDealer);
    if (row && assigned.metadataMatched === false) row.metadataMatched = false;
  }
  return { rows, assignment, rawDealers };
}

function leadCells(
  row: DispatchRow,
  dates: string[],
  ready: boolean,
  counts: Map<string, number>,
  archived: Map<string, DispatchCell>
): DispatchCell[] {
  return dates.map(date => {
    const source = archived.get(date);
    const count = ready ? (counts.get(`${row.id}:${date}`) ?? 0) : null;
    return {
      id: source?.id ?? 0,
      rowNumber: source?.rowNumber ?? row.rowNumber,
      date,
      syonet: source?.syonet ?? "",
      sourceManual: source?.sourceManual ?? "",
      volume: count,
      leadVolume: count,
      ...(source?.sourcePending ? { sourcePending: true } : {}),
      validation: source?.validation ?? null,
    };
  });
}

export async function getLeadControl(
  reportId: number,
  filters: V2Filters
): Promise<DispatchReport> {
  const period = resolveDashboardPeriod(filters.dateFrom, filters.dateTo);
  const [report, source, metadata, loaded] = await Promise.all([
    getDispatchReport(reportId),
    readLeadSource(),
    reportMetadata(reportId),
    readV2LeadsForPeriod(period),
  ]);
  const filtered = filterV2LeadRows(loaded, { ...filters, ...period });
  const mapped = mapLeadRows(
    report.rows,
    metadata,
    source.status === "READY" ? filtered : [],
    true
  );
  const counts = new Map<string, number>();
  if (source.status === "READY") {
    for (const lead of filtered) {
      const target = mapped.assignment.get(lead.dealer);
      if (!target) continue;
      const key = `${target.rowId}:${lead.date}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const dates = datesBetween(period.dateFrom, period.dateTo);
  const archivedDays = new Map(report.days.map(day => [day.date, day]));
  const dailyTotals = new Map<string, number>();
  if (source.status === "READY") {
    for (const lead of filtered)
      dailyTotals.set(lead.date, (dailyTotals.get(lead.date) ?? 0) + 1);
  }
  const rows = mapped.rows.map(row => {
    const archived = new Map(row.cells.map(cell => [cell.date, cell]));
    return {
      ...row,
      cells: leadCells(row, dates, source.status === "READY", counts, archived),
    };
  });
  const days = dates.map(date => {
    const archived = archivedDays.get(date);
    const total =
      source.status === "READY" ? (dailyTotals.get(date) ?? 0) : null;
    return {
      date,
      label: archived?.label ?? dayLabel(date),
      sourceTotal: total,
      computedTotal: total,
      ...(archived?.pending ? { pending: true } : {}),
    } satisfies DispatchDay;
  });
  const total = source.status === "READY" ? filtered.length : null;
  const activeCells = rows.flatMap(row => row.cells);
  return {
    ...report,
    title: "Controle por dealer — base do dashboard",
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    information: [],
    days,
    rows,
    volumeMode: "dashboard-leads",
    leadSource: {
      status: source.status,
      name: source.name,
      importedAt: source.importedAt,
      total,
    },
    totals: {
      ...report.totals,
      computed: total,
      sourceDailySum: total,
      declaredInInstructions: null,
      sourceManualOk: activeCells.filter(
        cell => cell.sourceManual.trim().toUpperCase() === "OK"
      ).length,
      auditedOk: activeCells.filter(cell => cell.validation?.isOk).length,
      manualOverridden: activeCells.filter(cell => cell.validation !== null)
        .length,
      pendingDays: source.status === "READY" ? 0 : days.length,
    },
    notes: [
      ...report.notes,
      "Volume de Leads calculado diretamente de v2_leads com os mesmos filtros do dashboard; a planilha Envios não é fonte dessa contagem.",
      "Nomes de concessionária mantêm o valor original; aliases inequívocos usam o de-para do cadastro oficial, sem substring, rateio ou alteração dos checks históricos.",
    ],
  };
}

export type PrepareLeadControlResult = {
  date: string;
  added: boolean;
  missingSource: boolean;
};

function resultInsertId(result: unknown): number {
  const id = Number((result as { insertId?: unknown }).insertId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("A inserção da loja não retornou um id válido.");
  }
  return id;
}

export async function prepareLeadControl(
  reportId: number,
  filters: V2Filters,
  now = new Date()
): Promise<PrepareLeadControlResult> {
  const period = resolveDashboardPeriod(filters.dateFrom, filters.dateTo, now);
  const cutoffDate = getDashboardCutoffDate(now);
  const currentMonthStart = `${cutoffDate.slice(0, 7)}-01`;
  const requestedDates = new Set([
    ...datesBetween(period.dateFrom, period.dateTo),
    ...datesBetween(currentMonthStart, cutoffDate),
  ]);
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const [reports] = await connection.execute<RowDataPacket[]>(
      "SELECT id,metadata FROM v2_dispatch_reports WHERE id=? LIMIT 1 FOR UPDATE",
      [reportId]
    );
    if (!reports[0]) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Controle de envios não encontrado",
      });
    }
    const metadata = parseMetadata(reports[0].metadata);
    const [sourceRows] = await connection.execute<RowDataPacket[]>(
      "SELECT importedAt FROM v2_sources WHERE id=1 LIMIT 1"
    );
    const sourceReady = sourceDate(sourceRows[0]?.importedAt) != null;
    const [rawLeadRows] = await connection.execute<RowDataPacket[]>(
      LEAD_SELECT,
      [period.dateFrom, period.dateTo]
    );
    const selectedLeads = sourceReady
      ? filterV2LeadRows(
          rawLeadRows.map(mapV2LeadRow),
          { ...filters, ...period },
          now
        )
      : [];
    const [rawRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id,rowNumber,storeName,crmResponsible,syonetIntegration,bbroIntegration FROM v2_dispatch_rows WHERE reportId=? ORDER BY rowNumber FOR UPDATE",
      [reportId]
    );
    const reportRows: DispatchRow[] = rawRows.map(row => ({
      id: Number(row.id),
      rowNumber: Number(row.rowNumber),
      storeName: String(row.storeName),
      crmResponsible: String(row.crmResponsible),
      syonetIntegration: String(row.syonetIntegration),
      bbroIntegration: String(row.bbroIntegration),
      cells: [],
    }));
    const mapped = mapLeadRows(reportRows, metadata, selectedLeads, false);
    const rowsById = new Map(reportRows.map(row => [row.id, row]));
    let maxRowNumber = reportRows.reduce(
      (max, row) => Math.max(max, row.rowNumber),
      0
    );
    let newRows = 0;
    for (const rawDealer of mapped.rawDealers) {
      if (mapped.assignment.has(rawDealer)) continue;
      const qualification = isQualificationDealer(rawDealer);
      const existing = qualification
        ? reportRows.find(row => row.storeName === QUALIFICATION_ROW)
        : undefined;
      let rowId = existing?.id;
      let matchMethod = qualification ? "qualification" : "new-raw";
      if (!rowId) {
        maxRowNumber++;
        const [inserted] = await connection.execute(
          "INSERT INTO v2_dispatch_rows (reportId,rowNumber,storeName,crmResponsible,syonetIntegration,bbroIntegration) VALUES (?,?,?,?,?,?)",
          [
            reportId,
            maxRowNumber,
            qualification ? QUALIFICATION_ROW : rawDealer,
            "",
            "",
            "",
          ]
        );
        rowId = resultInsertId(inserted);
        reportRows.push({
          id: rowId,
          rowNumber: maxRowNumber,
          storeName: qualification ? QUALIFICATION_ROW : rawDealer,
          crmResponsible: "",
          syonetIntegration: "",
          bbroIntegration: "",
          cells: [],
        });
        rowsById.set(rowId, reportRows.at(-1)!);
        newRows++;
      }
      const deterministic = {
        rowId,
        metadataMatched: false,
        matchMethod,
      } satisfies Assigned;
      mapped.assignment.set(rawDealer, deterministic);
      mapped.rows.push(rowsById.get(rowId)!);
    }
    const existingDates = new Set(metadata.days.map(day => day.date));
    const addedDays: DispatchDay[] = [];
    for (const date of [...requestedDates].sort()) {
      if (existingDates.has(date)) continue;
      addedDays.push({
        date,
        label: dayLabel(date),
        sourceTotal: null,
        computedTotal: null,
        pending: true,
      });
      existingDates.add(date);
    }
    const allDays = [...metadata.days, ...addedDays].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const allRows = [...new Map(reportRows.map(row => [row.id, row])).values()];
    let addedCells = false;
    let batch: unknown[][] = [];
    const flush = async () => {
      if (!batch.length) return;
      const values = batch.map(() => "(?,?,?,?,?,?)").join(",");
      const [result] = await connection.execute(
        "INSERT IGNORE INTO v2_dispatch_cells (rowId,dispatchDate,syonet,sourceManual,volume,sourcePending) VALUES " +
          values,
        batch.flat()
      );
      addedCells ||=
        Number((result as { affectedRows?: unknown }).affectedRows) > 0;
      batch = [];
    };
    for (const row of allRows)
      for (const day of allDays) {
        batch.push([row.id, day.date, "", "", null, true]);
        if (batch.length >= 250) await flush();
      }
    await flush();
    const nextMap = { ...metadata.leadDealerMap };
    const nextMapMeta = { ...metadata.leadDealerMapMeta };
    for (const [rawDealer, assignment] of mapped.assignment) {
      if (assignment.rowId < 1) continue;
      nextMap[rawDealer] = assignment.rowId;
      nextMapMeta[rawDealer] = {
        rowId: assignment.rowId,
        matchMethod: assignment.matchMethod,
      };
    }
    const mappingChanged =
      JSON.stringify(nextMap) !== JSON.stringify(metadata.leadDealerMap);
    if (addedDays.length || newRows || mappingChanged) {
      await connection.execute(
        "UPDATE v2_dispatch_reports SET metadata=? WHERE id=?",
        [
          JSON.stringify({
            ...metadata,
            days: allDays,
            leadDealerMap: nextMap,
            leadDealerMapMeta: nextMapMeta,
          }),
          reportId,
        ]
      );
    }
    await connection.commit();
    return {
      date: cutoffDate,
      added:
        addedDays.length > 0 || newRows > 0 || mappingChanged || addedCells,
      missingSource: !sourceReady,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
