import type { RowDataPacket } from "mysql2/promise";
import type {
  LeadsExportInput,
  LeadsExportResult,
} from "../shared/leadsExport";
import { groupedStateLabel } from "../shared/stateRegistry";
import { resolveDashboardPeriod } from "../shared/dashboardDates";
import type { V2Lead } from "../shared/v2Types";
import { filterV2LeadRows, readV2LeadsForPeriod } from "./v2Leads";
import { readExtraDealerRegistry } from "./v2DealerRegistry";
import { getV2Pool } from "./v2Db";

export const LEADS_EXPORT_MAX_ROWS = 100_000;
export const LEADS_EXPORT_MAX_BYTES = 16 * 1024 * 1024;

const CSV_HEADERS = [
  "Data",
  "Hora",
  "Lead",
  "Modelo",
  "Versão",
  "Canal",
  "Campanha",
  "Concessionária",
  "Cidade",
  "UF",
  "CRM",
] as const;

export class LeadsExportSourceError extends Error {
  constructor() {
    super("A fonte de Leads não está configurada.");
    this.name = "LeadsExportSourceError";
  }
}

export class LeadsExportLimitError extends Error {
  constructor() {
    super("O recorte excede o limite de exportação; estreite o período.");
    this.name = "LeadsExportLimitError";
  }
}

type ExportPresentation = {
  /** Client and BBRO receive the same grouped UF presentation as the dashboard. */
  groupStates?: boolean;
};

type SourceStatusRow = RowDataPacket & {
  status?: string | null;
  source?: string | null;
  importedAt?: unknown;
};

/**
 * Source state is checked independently so an unconfigured database cannot look
 * like a successful empty export. The source label is deliberately not returned.
 */
async function assertLeadSourceReady(): Promise<void> {
  const [rows] = await getV2Pool().execute<SourceStatusRow[]>(
    `SELECT
       CASE WHEN importedAt IS NULL THEN 'NOT_CONFIGURED' ELSE 'READY' END AS status,
       name AS source,
       importedAt
     FROM v2_sources
     WHERE id=1
     LIMIT 1`
  );
  const source = rows[0];
  const status = String(
    source?.status ?? (source?.importedAt ? "READY" : "NOT_CONFIGURED")
  );
  if (status !== "READY" || !source?.importedAt)
    throw new LeadsExportSourceError();
}

function formulaSafe(value: string): string {
  // Spreadsheet formula injection also applies when a dangerous character is
  // preceded by spaces, tabs, CR/LF, or any leading ASCII control character.
  // Preserve such controls as data after the apostrophe; only text fields use
  // this path (numeric hours deliberately bypass it).
  if (/^[\t\r\n\x00-\x1F]/u.test(value)) return `'${value}`;
  return /^[\x00-\x20]*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null, protectFormula = true): string {
  if (value == null) return "";
  const text = String(value);
  const safe = protectFormula ? formulaSafe(text) : text;
  const escaped = safe.replaceAll('"', '""');
  return /[;"\r\n]/u.test(safe) ? `"${escaped}"` : safe;
}

function leadCsvRow(
  row: V2Lead,
  maskNames: boolean,
  groupStates: boolean
): string[] {
  return [
    row.date,
    // Keep integer hours, including 0. Null is the only empty hour.
    row.hour,
    maskNames ? "Nome oculto no modo cliente" : row.name,
    row.model,
    row.version,
    row.channel,
    row.campaign,
    row.dealer,
    row.city,
    groupStates ? groupedStateLabel(row.state) : row.state,
    row.crm,
  ].map((value, index) =>
    // Hours are numeric V2Lead values, not user-controlled spreadsheet text.
    csvCell(value, index !== 1)
  );
}

export function buildLeadsExportCsv(
  rows: readonly V2Lead[],
  input: LeadsExportInput,
  presentation: ExportPresentation = {}
): string {
  if (rows.length > LEADS_EXPORT_MAX_ROWS) throw new LeadsExportLimitError();
  const maskNames = Boolean(input.clientMode);
  const groupStates = Boolean(presentation.groupStates);
  const chunks: string[] = [];
  let byteLength = 0;
  const append = (line: string) => {
    const chunk = `${line}\r\n`;
    byteLength += Buffer.byteLength(chunk, "utf8");
    if (byteLength > LEADS_EXPORT_MAX_BYTES) throw new LeadsExportLimitError();
    chunks.push(chunk);
  };
  // BOM + CRLF is intentional for Excel/UTF-8 compatibility. Count the BOM
  // before appending the header so oversized output is rejected while built.
  const bom = "\uFEFF";
  byteLength = Buffer.byteLength(bom, "utf8");
  append(CSV_HEADERS.map(header => csvCell(header)).join(";"));
  for (const row of rows)
    append(leadCsvRow(row, maskNames, groupStates).join(";"));
  return bom + chunks.join("");
}

function leadOrder(a: V2Lead, b: V2Lead): number {
  return (
    b.date.localeCompare(a.date) ||
    (b.hour ?? -1) - (a.hour ?? -1) ||
    b.id - a.id
  );
}

/**
 * Generates the complete filtered population, deliberately ignoring input.page.
 * It shares the dashboard's date clamp, analytical cache, predicate, registry,
 * and ordering, but never calls the paginated dashboard projection.
 */
export async function exportV2LeadsCSV(
  input: LeadsExportInput,
  presentation: ExportPresentation = {}
): Promise<LeadsExportResult> {
  const now = new Date();
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);

  await assertLeadSourceReady();
  const [rows, extraDealers] = await Promise.all([
    readV2LeadsForPeriod(input.dateFrom, period.dateTo),
    readExtraDealerRegistry(),
  ]);
  const filtered = filterV2LeadRows(rows, input, now, extraDealers).sort(
    leadOrder
  );

  if (filtered.length > LEADS_EXPORT_MAX_ROWS)
    throw new LeadsExportLimitError();

  const csv = buildLeadsExportCsv(filtered, input, presentation);

  return {
    fileName: `leads_${period.dateFrom}_${period.dateTo}.csv`,
    mimeType: "text/csv;charset=utf-8",
    csv,
    count: filtered.length,
    nameMasked: Boolean(input.clientMode),
    period,
  };
}
