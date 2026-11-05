import JSZip from "jszip";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type {
  CommercialSourceRow,
  CommercialUploadKind,
} from "../shared/v2Commercial";

const MAX_BASE64_LENGTH = 1_400_000;
const MAX_ARCHIVE_BYTES = 1 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_HEADER_ROWS = 15;

export type ParsedCommercialWorkbook = {
  kind: CommercialUploadKind;
  competence: string;
  asOf: string | null;
  sourceWeek?: number;
  fileName: string;
  fileSha256: string;
  rows: CommercialSourceRow[];
  total: number | null;
  warnings: string[];
};

type HeaderInfo = {
  rowNumber: number;
  columns: Map<string, number>;
};

type SheetWithHeader = {
  worksheet: ExcelJS.Worksheet;
  header: HeaderInfo;
};

function fail(message: string): never {
  throw new Error(`Arquivo comercial inválido: ${message}`);
}

export function normalizeCommercialText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value: unknown): string {
  return normalizeCommercialText(value).replace(/ /g, "");
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      richText?: unknown[];
      result?: unknown;
      formula?: unknown;
    };
    if (candidate.formula != null && candidate.result != null)
      return textOf(candidate.result);
    if (typeof candidate.text === "string") return candidate.text;
    if (Array.isArray(candidate.richText))
      return candidate.richText
        .map(part => textOf((part as { text?: unknown }).text ?? part))
        .join("");
    if (candidate.result != null) return textOf(candidate.result);
  }
  return String(value);
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value as unknown;
  if (value && typeof value === "object" && "formula" in value)
    return (value as { result?: unknown }).result;
  return value;
}

function parseCompetence(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    fail("a competência deve estar no formato AAAA-MM.");
  return value;
}

function parseAsOf(value: string | undefined): string | null {
  if (value == null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("a data de referência deve estar no formato AAAA-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    fail("a data de referência é inválida.");
  return value;
}

function selectSourceWeek(asOf: string | null, sourceWeek?: number): number {
  if (sourceWeek != null) {
    if (!Number.isInteger(sourceWeek) || sourceWeek < 1 || sourceWeek > 6)
      fail("sourceWeek deve ser um inteiro entre 1 e 6.");
    return sourceWeek;
  }
  if (!asOf) return 1;
  return Math.min(6, Math.ceil(Number(asOf.slice(8)) / 7));
}

function assertZipExpansionSafe(buffer: Buffer): void {
  if (buffer.length > MAX_ARCHIVE_BYTES)
    fail("o arquivo excede o limite de 1 MiB.");
  if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    fail("não é um XLSX ZIP válido.");
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buffer.lastIndexOf(eocdSignature);
  if (eocd < 0 || eocd + 22 > buffer.length)
    fail("o diretório ZIP está ausente.");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  )
    fail("ZIP64 não é aceito neste importador.");
  if (
    entryCount > MAX_ARCHIVE_ENTRIES ||
    centralOffset > eocd ||
    centralSize > eocd - centralOffset
  ) {
    fail("o diretório ZIP excede os limites permitidos.");
  }
  let cursor = centralOffset;
  let expanded = 0;
  for (let index = 0; index < entryCount; index++) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    )
      fail("o diretório ZIP contém uma entrada inválida.");
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (uncompressed === 0xffffffff || compressed === 0xffffffff)
      fail("ZIP64 não é aceito.");
    if (uncompressed > MAX_ENTRY_UNCOMPRESSED_BYTES)
      fail("uma entrada ZIP excede o limite de expansão.");
    expanded += uncompressed;
    if (expanded > MAX_ARCHIVE_UNCOMPRESSED_BYTES)
      fail("a expansão total ZIP excede o limite permitido.");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (cursor > eocd) fail("o diretório ZIP está truncado.");
  }
}

export function decodeCommercialWorkbookBase64(base64: string): Buffer {
  if (
    typeof base64 !== "string" ||
    base64.length === 0 ||
    base64.length > MAX_BASE64_LENGTH
  )
    fail("base64 ausente ou acima do limite de 1,4 MB.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1)
    fail("base64 inválido.");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) fail("arquivo vazio.");
  assertZipExpansionSafe(buffer);
  return buffer;
}

function headerInfo(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number
): HeaderInfo {
  const columns = new Map<string, number>();
  const row = worksheet.getRow(rowNumber);
  for (let column = 1; column <= worksheet.columnCount; column++) {
    const header = compact(cellValue(row.getCell(column)));
    if (header && !columns.has(header)) columns.set(header, column);
  }
  return { rowNumber, columns };
}

function findHeader(
  worksheet: ExcelJS.Worksheet,
  requiredGroups: string[][]
): HeaderInfo | null {
  for (
    let rowNumber = 1;
    rowNumber <= Math.min(MAX_HEADER_ROWS, worksheet.rowCount);
    rowNumber++
  ) {
    const info = headerInfo(worksheet, rowNumber);
    if (
      requiredGroups.every(group =>
        group.some(alias => info.columns.has(compact(alias)))
      )
    )
      return info;
  }
  return null;
}

function findSheetWithHeader(
  workbook: ExcelJS.Workbook,
  requiredGroups: string[][]
): SheetWithHeader | null {
  for (const worksheet of workbook.worksheets) {
    const header = findHeader(worksheet, requiredGroups);
    if (header) return { worksheet, header };
  }
  return null;
}

function firstColumn(info: HeaderInfo, aliases: string[]): number | null {
  for (const alias of aliases) {
    const column = info.columns.get(compact(alias));
    if (column != null) return column;
  }
  return null;
}

function parseInteger(value: unknown, description: string): number | null {
  if (value == null || (typeof value === "string" && value.trim() === ""))
    return null;
  const numberValue =
    typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(numberValue) || numberValue < 0)
    fail(`${description} precisa ser um inteiro seguro não negativo.`);
  return numberValue;
}

function sourceState(sourceLabel: string): string | null {
  const match = sourceLabel.trim().match(/(?:^|[\s\/\\-])([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : null;
}

function stateCell(value: unknown): string | null {
  const source = textOf(value).trim();
  return /^[A-Za-z]{2}$/.test(source) ? source.toUpperCase() : null;
}

function isTotalLabel(value: string): boolean {
  const normalized = compact(value);
  return (
    normalized === "total" ||
    normalized.startsWith("total ") ||
    normalized === "totais" ||
    normalized === "monthlytotal" ||
    normalized === "totalmensal" ||
    normalized === "grandtotal" ||
    normalized === "totalgeral"
  );
}

function rowHasData(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: number[]
): boolean {
  return columns.some(
    column =>
      textOf(cellValue(worksheet.getCell(rowNumber, column))).trim() !== ""
  );
}

const DEALER_ALIASES = [
  "dealer",
  "concessionaria",
  "grupo",
  "customer name",
  "customer_name",
  "customer",
];
const STATE_ALIASES = ["state", "uf", "estado", "region", "região"];
const LEAD_TOTAL_ALIASES = [
  "total dealer",
  "total leads",
  "total_leads",
  "metaleads",
  "meta leads",
];
const SALES_GOAL_ALIASES = [
  "meta vendas",
  "metavendas",
  "meta sales",
  "sales goal",
  "sales target",
  "target",
  "target to be adjusted",
  "retail target",
  "j retailtarget",
  "jretailtarget",
];
const SALES_ALIASES = [
  "vendas",
  "sales",
  "retail sales",
  "sales quantity",
  "quantity",
  "qty",
  "mtd sales",
  "mtd retail",
  "retail mtd",
  "retailmtd",
];

function makeRow(
  key: string,
  sourceLabel: string,
  value: number | null,
  state?: string | null
): CommercialSourceRow {
  return {
    key,
    sourceLabel,
    state: state === undefined ? sourceState(sourceLabel) : state,
    value,
    rawDealers: [],
  };
}

function parseLeadGoals(workbook: ExcelJS.Workbook): {
  rows: CommercialSourceRow[];
  total: number | null;
  warnings: string[];
} {
  const found = findSheetWithHeader(workbook, [
    DEALER_ALIASES,
    LEAD_TOTAL_ALIASES,
  ]);
  if (!found)
    fail("não encontrei cabeçalho Dealer/Concessionária e Total Leads.");
  const dealerColumn = firstColumn(found.header, DEALER_ALIASES);
  const valueColumn = firstColumn(found.header, LEAD_TOTAL_ALIASES);
  if (!dealerColumn || !valueColumn)
    fail("o cabeçalho de MetaLeads está incompleto.");
  const rows: CommercialSourceRow[] = [];
  let total: number | null = null;
  for (
    let rowNumber = found.header.rowNumber + 1;
    rowNumber <= found.worksheet.rowCount;
    rowNumber++
  ) {
    const sourceLabel = textOf(
      cellValue(found.worksheet.getCell(rowNumber, dealerColumn))
    );
    if (!sourceLabel.trim()) continue;
    if (isTotalLabel(sourceLabel)) {
      total = parseInteger(
        cellValue(found.worksheet.getCell(rowNumber, valueColumn)),
        `Total Leads na linha ${rowNumber}`
      );
      break;
    }
    rows.push(
      makeRow(
        `${found.worksheet.name}:${rowNumber}`,
        sourceLabel,
        parseInteger(
          cellValue(found.worksheet.getCell(rowNumber, valueColumn)),
          `Total Leads na linha ${rowNumber}`
        )
      )
    );
  }
  if (!rows.length) fail("nenhum grupo de MetaLeads foi encontrado.");
  if (total == null)
    fail("a linha TOTAL de MetaLeads não foi encontrada ou está vazia.");
  return { rows, total, warnings: [] };
}

function findDailyFupSheet(
  workbook: ExcelJS.Workbook
): ExcelJS.Worksheet | null {
  return (
    workbook.worksheets.find(sheet => compact(sheet.name) === "dailyfup") ??
    null
  );
}

function findWeeklyRegSheet(
  workbook: ExcelJS.Workbook
): ExcelJS.Worksheet | null {
  return (
    workbook.worksheets.find(sheet => compact(sheet.name) === "weeklyreg") ??
    null
  );
}

function dailyFupReferenceWarning(workbook: ExcelJS.Workbook): string | null {
  const daily = findDailyFupSheet(workbook);
  if (!daily) return null;
  const header = findHeader(daily, [
    ["current month"],
    ["mtd retail", "retail mtd", "retailmtd"],
  ]);
  if (!header) return null;
  const retailColumn = firstColumn(header, [
    "mtd retail",
    "retail mtd",
    "retailmtd",
  ]);
  const registrationColumn = firstColumn(header, [
    "mtd registration",
    "registration mtd",
    "mtd registrations",
    "registration",
  ]);
  if (!retailColumn && !registrationColumn) return null;
  const retail = retailColumn
    ? textOf(
        cellValue(daily.getCell(header.rowNumber + 1, retailColumn))
      ).trim()
    : "N/A";
  const registration = registrationColumn
    ? textOf(
        cellValue(daily.getCell(header.rowNumber + 1, registrationColumn))
      ).trim()
    : "N/A";
  if (!retail && !registration) return null;
  return `Referências DAILY_FUP (não utilizadas como vendas ativas): MTD Retail = ${retail || "N/A"}; MTD Registration = ${registration || "N/A"}.`;
}

function parseWeeklyRegSales(
  workbook: ExcelJS.Workbook,
  sourceWeek: number
): { rows: CommercialSourceRow[]; total: number | null; warnings: string[] } {
  const weekly = findWeeklyRegSheet(workbook);
  if (!weekly) fail("a aba WEEKLY_REG não foi encontrada.");
  const selectedColumnLabel = `W${sourceWeek}_Reg`;
  const weeklyHeader = findHeader(weekly, [
    ["customer_name", "customer name"],
    [selectedColumnLabel],
  ]);
  if (!weeklyHeader)
    fail(
      `a aba WEEKLY_REG precisa conter CUSTOMER_NAME e ${selectedColumnLabel} para o snapshot selecionado.`
    );
  const customerNameColumn = firstColumn(weeklyHeader, [
    "customer_name",
    "customer name",
  ]);
  const salesColumn = firstColumn(weeklyHeader, [selectedColumnLabel]);
  if (!customerNameColumn || !salesColumn)
    fail("o cabeçalho WEEKLY_REG está incompleto.");

  const warnings: string[] = [
    `Fonte de vendas: WEEKLY_REG, coluna ${selectedColumnLabel}. Os valores são o snapshot desta coluna, não a soma das semanas nem DAILY_FUP.`,
  ];
  const dailyReference = dailyFupReferenceWarning(workbook);
  if (dailyReference) warnings.push(dailyReference);
  const rows: CommercialSourceRow[] = [];
  let knownTotal = 0;
  let knownCount = 0;
  let blankCount = 0;
  for (
    let rowNumber = weeklyHeader.rowNumber + 1;
    rowNumber <= weekly.rowCount;
    rowNumber++
  ) {
    const sourceLabel = textOf(
      cellValue(weekly.getCell(rowNumber, customerNameColumn))
    );
    // CUSTOMER_NAME is the business label; unnamed footer/target rows are not
    // dealer sales rows, even if they contain a TARGET value.
    if (!sourceLabel.trim() || isTotalLabel(sourceLabel)) continue;
    const value = parseInteger(
      cellValue(weekly.getCell(rowNumber, salesColumn)),
      `${selectedColumnLabel} na aba ${weekly.name}, linha ${rowNumber}`
    );
    if (value == null) blankCount++;
    else {
      knownTotal += value;
      knownCount++;
    }
    rows.push(
      makeRow(
        `${weekly.name}:${selectedColumnLabel}:${rowNumber}`,
        sourceLabel,
        value,
        null
      )
    );
  }
  if (!rows.length) fail("nenhuma linha nomeada de WEEKLY_REG foi encontrada.");
  if (blankCount && knownCount) {
    warnings.push(
      `Fonte de vendas parcial: ${blankCount} de ${rows.length} linhas de WEEKLY_REG, coluna ${selectedColumnLabel}, estão sem valor; o total soma somente as linhas conhecidas.`
    );
  } else if (blankCount === rows.length) {
    warnings.push(
      `Fonte de vendas sem valores conhecidos: todas as ${rows.length} linhas de WEEKLY_REG, coluna ${selectedColumnLabel}, estão em branco; o total permanece desconhecido.`
    );
  }
  return { rows, total: knownCount ? knownTotal : null, warnings };
}

function parseGenericRows(
  workbook: ExcelJS.Workbook,
  kind: CommercialUploadKind
): { rows: CommercialSourceRow[]; total: number | null; warnings: string[] } {
  if (kind === "sales-goals" && findDailyFupSheet(workbook))
    fail(
      "Meta de Vendas exige seu arquivo próprio; DAILY_FUP/WEEKLY_REG pertence à Atualização de Vendas."
    );
  const valueAliases =
    kind === "sales-goals" ? SALES_GOAL_ALIASES : SALES_ALIASES;
  const found = findSheetWithHeader(workbook, [DEALER_ALIASES, valueAliases]);
  if (!found) {
    fail(
      `não encontrei as colunas de concessionária e ${kind === "sales-goals" ? "MetaVendas/target" : "Vendas/sales"}.`
    );
  }
  const dealerColumn = firstColumn(found.header, DEALER_ALIASES);
  const valueColumn = firstColumn(found.header, valueAliases);
  const stateColumn = firstColumn(found.header, STATE_ALIASES);
  if (!dealerColumn || !valueColumn)
    fail("o cabeçalho comercial está incompleto.");
  const rows: CommercialSourceRow[] = [];
  let total: number | null = null;
  let sum = 0;
  let hasValue = false;
  for (
    let rowNumber = found.header.rowNumber + 1;
    rowNumber <= found.worksheet.rowCount;
    rowNumber++
  ) {
    if (!rowHasData(found.worksheet, rowNumber, [dealerColumn, valueColumn]))
      continue;
    const sourceLabel = textOf(
      cellValue(found.worksheet.getCell(rowNumber, dealerColumn))
    );
    if (!sourceLabel.trim()) continue;
    const value = parseInteger(
      cellValue(found.worksheet.getCell(rowNumber, valueColumn)),
      `${kind} na linha ${rowNumber}`
    );
    if (isTotalLabel(sourceLabel)) {
      total = value;
      break;
    }
    if (value != null) {
      sum += value;
      hasValue = true;
    }
    rows.push(
      makeRow(
        `${found.worksheet.name}:${rowNumber}`,
        sourceLabel,
        value,
        (stateColumn
          ? stateCell(
              cellValue(found.worksheet.getCell(rowNumber, stateColumn))
            )
          : null) ?? sourceState(sourceLabel)
      )
    );
  }
  if (!rows.length) fail("nenhuma linha comercial foi encontrada.");
  return { rows, total: total ?? (hasValue ? sum : null), warnings: [] };
}

async function compatibleSpreadsheetPackage(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  const mainNamespace =
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.startsWith("xl/") || !name.endsWith(".xml"))
      continue;
    let xml = await entry.async("string");
    const original = xml;
    const namespaces = [
      ...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=["']([^"']+)["']/g),
    ];
    for (const match of namespaces) {
      if (match[2] !== mainNamespace) continue;
      const prefix = match[1];
      xml = xml.replace(
        new RegExp(`(<\\/?)(?:${prefix}):([A-Za-z_][\\w.-]*)`, "g"),
        "$1$2"
      );
      xml = xml.replace(match[0], `xmlns="${mainNamespace}"`);
    }
    if (xml !== original) {
      zip.file(name, xml);
      changed = true;
    }
  }
  return changed
    ? await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    : buffer;
}

export async function parseCommercialWorkbook(
  kind: CommercialUploadKind,
  competence: string,
  asOf: string | undefined,
  fileName: string,
  base64: string,
  sourceWeek?: number
): Promise<ParsedCommercialWorkbook> {
  parseCompetence(competence);
  const parsedAsOf = parseAsOf(asOf);
  const selectedSourceWeek =
    kind === "sales" ? selectSourceWeek(parsedAsOf, sourceWeek) : undefined;
  if (parsedAsOf && parsedAsOf.slice(0, 7) !== competence)
    fail("a data de referência precisa pertencer à competência selecionada.");
  if (!fileName || fileName.length > 255 || !/\.xlsx$/i.test(fileName))
    fail("o nome deve identificar um arquivo .xlsx.");
  const buffer = decodeCommercialWorkbookBase64(base64);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      (await compatibleSpreadsheetPackage(buffer)) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0]
    );
  } catch {
    fail("não pôde ser lido como XLSX.");
  }
  let result: {
    rows: CommercialSourceRow[];
    total: number | null;
    warnings: string[];
  };
  if (kind === "lead-goals") result = parseLeadGoals(workbook);
  else if (kind === "sales") {
    const weekly = findWeeklyRegSheet(workbook);
    if (weekly) {
      result = parseWeeklyRegSales(workbook, selectedSourceWeek as number);
    } else {
      const generic = findSheetWithHeader(workbook, [
        DEALER_ALIASES,
        SALES_ALIASES,
      ]);
      const daily = findDailyFupSheet(workbook);
      if (daily && (!generic || generic.worksheet === daily)) {
        fail(
          "DAILY_FUP não é uma fonte de vendas por concessionária; envie a aba WEEKLY_REG com CUSTOMER_NAME e W1_Reg até W6_Reg."
        );
      }
      result = parseGenericRows(workbook, kind);
    }
  } else result = parseGenericRows(workbook, kind);
  return {
    kind,
    competence,
    asOf: kind === "sales" ? parsedAsOf : null,
    sourceWeek: kind === "sales" ? selectedSourceWeek : undefined,
    fileName,
    fileSha256: createHash("sha256").update(buffer).digest("hex"),
    rows: result.rows,
    total: result.total,
    warnings: result.warnings,
  };
}

export const commercialXlsxLimits = {
  maxBase64Length: MAX_BASE64_LENGTH,
  maxArchiveBytes: MAX_ARCHIVE_BYTES,
  maxArchiveUncompressedBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
};
