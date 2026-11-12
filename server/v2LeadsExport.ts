import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { Writable } from "node:stream";
import type {
  LeadsExcelExportResult,
  LeadsExportInput,
  LeadsExportLocale,
  LeadsExportResult,
} from "../shared/leadsExport";
import { groupedStateLabel } from "../shared/stateRegistry";
import { resolveDashboardPeriod } from "../shared/dashboardDates";
import type { V2Lead } from "../shared/v2Types";
import { filterV2LeadRows, readV2LeadsForPeriod } from "./v2Leads";
import { enrichV2LeadContacts } from "./v2LeadContacts";
import { readExtraDealerRegistry } from "./v2DealerRegistry";
import { getV2Pool } from "./v2Db";

export const LEADS_EXPORT_MAX_ROWS = 100_000;
export const LEADS_EXPORT_MAX_BYTES = 16 * 1024 * 1024;
const LEADS_EXPORT_MAX_XLSX_BYTES = Math.floor(
  (LEADS_EXPORT_MAX_BYTES * 3) / 4
);
const EXCEL_CELL_MAX_CHARS = 32_767;
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;

const CSV_HEADERS_PT = [
  "Data",
  "Hora",
  "Nome",
  "E-mail",
  "Telefone",
  "Carro de interesse",
  "Modelo",
  "Versão",
  "Canal",
  "Campanha",
  "Concessionária",
  "Cidade",
  "UF",
  "CRM",
] as const;
const CSV_HEADERS_EN = [
  "Date",
  "Time",
  "Name",
  "Email",
  "Phone",
  "Vehicle of interest",
  "Model",
  "Version",
  "Channel",
  "Campaign",
  "Dealer",
  "City",
  "State",
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

export class LeadsExportCellError extends Error {
  constructor() {
    super("Uma célula excede o limite de 32.767 caracteres do Excel.");
    this.name = "LeadsExportCellError";
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

function exportLabel(value: string, locale: LeadsExportLocale): string {
  if (locale !== "en") return value;
  if (value === "Não informado") return "N/A";
  return value;
}

function missingLabel(locale: LeadsExportLocale): string {
  return locale === "en" ? "N/A" : "Não informado";
}

function providedValue(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return [
    "",
    "não informado",
    "nao informado",
    "indisponível",
    "indisponivel",
    "n/a",
    "n/d",
    "null",
    "undefined",
  ].includes(text.toLocaleLowerCase("pt-BR"))
    ? null
    : text;
}

function presentValue(
  value: string | null | undefined,
  locale: LeadsExportLocale
): string {
  return providedValue(value) ?? missingLabel(locale);
}

function vehicleValue(row: V2Lead, locale: LeadsExportLocale): string {
  // Match the table: use the original interest first, then only this same
  // opportunity's provided model/version. Unknown labels are not inferred.
  return (
    providedValue(row.interestVehicle) ??
    ([providedValue(row.model), providedValue(row.version)]
      .filter(Boolean)
      .join(" · ") ||
      missingLabel(locale))
  );
}

function hiddenName(locale: LeadsExportLocale): string {
  return locale === "en"
    ? "Hidden name in client mode"
    : "Nome oculto no modo cliente";
}

function hiddenContact(locale: LeadsExportLocale): string {
  return locale === "en"
    ? "Hidden in presentation mode"
    : "Oculto no modo apresentação";
}

function leadCsvRow(
  row: V2Lead,
  maskNames: boolean,
  groupStates: boolean,
  locale: LeadsExportLocale
): string[] {
  return [
    row.date,
    // Keep integer hours, including 0; absent values remain explicit.
    row.hour ?? missingLabel(locale),
    maskNames ? hiddenName(locale) : presentValue(row.name, locale),
    maskNames ? hiddenContact(locale) : presentValue(row.email, locale),
    maskNames ? hiddenContact(locale) : presentValue(row.phone, locale),
    vehicleValue(row, locale),
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
    csvCell(
      typeof value === "string" ? exportLabel(value, locale) : value,
      index !== 1
    )
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
  const locale = input.locale ?? "pt-BR";
  const headers = locale === "en" ? CSV_HEADERS_EN : CSV_HEADERS_PT;
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
  append(headers.map(header => csvCell(header)).join(";"));
  for (const row of rows)
    append(leadCsvRow(row, maskNames, groupStates, locale).join(";"));
  return bom + chunks.join("");
}

function leadOrder(a: V2Lead, b: V2Lead): number {
  return (
    b.date.localeCompare(a.date) ||
    (b.hour ?? -1) - (a.hour ?? -1) ||
    b.id - a.id
  );
}

type PreparedExport = {
  rows: V2Lead[];
  period: { dateFrom: string; dateTo: string; cutoffDate: string };
};

/**
 * Generates the complete filtered population, deliberately ignoring input.page.
 * It shares the dashboard's date clamp, analytical cache, predicate, registry,
 * and ordering, but never calls the paginated dashboard projection.
 */
async function prepareV2LeadsExport(
  input: LeadsExportInput
): Promise<PreparedExport> {
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

  // Reject before the potentially expensive provenance enrichment and workbook
  // generation; do not silently export a partial population.
  if (filtered.length > LEADS_EXPORT_MAX_ROWS)
    throw new LeadsExportLimitError();

  // Presentation hides only identity/contact columns, not vehicle interest.
  // Read the same opportunity details as the table, then mask when serializing.
  const exportRows = await enrichV2LeadContacts(filtered);
  return { rows: exportRows, period };
}

function leadExcelRow(
  row: V2Lead,
  maskNames: boolean,
  groupStates: boolean,
  locale: LeadsExportLocale
): string[] {
  const values = [
    row.date,
    row.hour == null ? missingLabel(locale) : String(row.hour),
    maskNames ? hiddenName(locale) : presentValue(row.name, locale),
    maskNames ? hiddenContact(locale) : presentValue(row.email, locale),
    maskNames ? hiddenContact(locale) : presentValue(row.phone, locale),
    vehicleValue(row, locale),
    row.model,
    row.version,
    row.channel,
    row.campaign,
    row.dealer,
    row.city,
    groupStates ? groupedStateLabel(row.state) : row.state,
    row.crm,
  ].map(value => exportLabel(value, locale));

  for (const value of values) {
    if (value.length > EXCEL_CELL_MAX_CHARS) throw new LeadsExportCellError();
  }
  return values;
}

class BoundedXlsxOutput extends Writable {
  private readonly chunks: Buffer[] = [];
  private byteLength = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, encoding);
    const nextLength = this.byteLength + buffer.byteLength;
    if (nextLength > this.maxBytes) {
      callback(new LeadsExportLimitError());
      return;
    }
    this.chunks.push(buffer);
    this.byteLength = nextLength;
    callback();
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks, this.byteLength);
  }
}

/** Build one parser-friendly worksheet with string cells and no formula objects. */
export async function buildLeadsExportXlsx(
  rows: readonly V2Lead[],
  input: LeadsExportInput,
  presentation: ExportPresentation = {}
): Promise<string> {
  if (rows.length > LEADS_EXPORT_MAX_ROWS) throw new LeadsExportLimitError();
  const locale = input.locale ?? "pt-BR";
  const headers = (locale === "en" ? CSV_HEADERS_EN : CSV_HEADERS_PT).map(
    String
  );
  const maskNames = Boolean(input.clientMode);
  const groupStates = Boolean(presentation.groupStates);
  // Validate before opening a ZIP. A rejected cell must not leave an unfinished
  // producer/stream alive, and must never be silently truncated to fit Excel.
  for (const row of rows) leadExcelRow(row, maskNames, groupStates, locale);
  // Base64 expands the binary by 4/3; keep the decoded ZIP at 12 MiB so the
  // returned RPC payload remains within the shared 16 MiB encoded cap.
  const stream = new BoundedXlsxOutput(LEADS_EXPORT_MAX_XLSX_BYTES);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useSharedStrings: false,
    useStyles: true,
  });
  // ExcelJS exposes its Archiver producer internally. Watch errors before any
  // row is written and stop both producer and sink when a size/write fails.
  const archive = (
    workbook as unknown as {
      zip: {
        on(event: string, listener: (error: Error) => void): void;
        abort(): void;
      };
    }
  ).zip;
  const outputFailure = new Promise<never>((_resolve, reject) => {
    stream.on("error", reject);
    archive.on("error", reject);
  });
  void outputFailure.catch(() => {});
  try {
    const worksheet = workbook.addWorksheet(
      locale === "en" ? "Opportunities" : "Oportunidades",
      {
        views: [{ state: "frozen", ySplit: 1 }],
      }
    );

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 30;
    headerRow.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FF334155" },
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    headerRow.alignment = { vertical: "middle", wrapText: true };
    headerRow.eachCell({ includeEmpty: true }, cell => {
      cell.value = String(cell.value ?? "");
      cell.numFmt = "@";
    });

    const widths = [14, 10, 26, 30, 20, 25, 18, 18, 18, 28, 28, 22, 12, 22];
    widths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: headers.length },
    };

    for (const sourceRow of rows) {
      const values = leadExcelRow(sourceRow, maskNames, groupStates, locale);
      const row = worksheet.addRow(values);
      row.height = 30;
      row.font = { name: "Calibri", size: 11 };
      row.alignment = { vertical: "middle", wrapText: true };
      row.eachCell({ includeEmpty: true }, cell => {
        // Explicit string assignment keeps +55 prefixes, leading zeroes, and
        // formula-looking operational values as text; no hyperlinks are created.
        cell.value = String(cell.value ?? "");
        cell.numFmt = "@";
      });
      row.commit();
    }

    worksheet.commit();
    await Promise.race([workbook.commit(), outputFailure]);
    const buffer = stream.toBuffer();
    const xlsxBase64 = buffer.toString("base64");
    if (Buffer.byteLength(xlsxBase64, "utf8") > LEADS_EXPORT_MAX_BYTES)
      throw new LeadsExportLimitError();
    return xlsxBase64;
  } catch (error) {
    archive.abort();
    stream.destroy();
    throw error;
  }
}

export async function exportV2LeadsCSV(
  input: LeadsExportInput,
  presentation: ExportPresentation = {}
): Promise<LeadsExportResult> {
  const { rows, period } = await prepareV2LeadsExport(input);
  const csv = buildLeadsExportCsv(rows, input, presentation);

  return {
    fileName: `leads_${period.dateFrom}_${period.dateTo}.csv`,
    mimeType: "text/csv;charset=utf-8",
    csv,
    count: rows.length,
    nameMasked: Boolean(input.clientMode),
    period,
  };
}

export async function exportV2LeadsExcel(
  input: LeadsExportInput,
  presentation: ExportPresentation = {}
): Promise<LeadsExcelExportResult> {
  const { rows, period } = await prepareV2LeadsExport(input);
  const xlsxBase64 = await buildLeadsExportXlsx(rows, input, presentation);

  return {
    fileName: `leads_${period.dateFrom}_${period.dateTo}.xlsx`,
    mimeType: XLSX_MIME,
    xlsxBase64,
    count: rows.length,
    nameMasked: Boolean(input.clientMode),
    period,
  };
}
