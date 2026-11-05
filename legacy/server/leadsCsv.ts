import { createHash } from "node:crypto";
import {
  DASHBOARD_TIME_ZONE,
  getDashboardCutoffDate,
} from "@shared/dashboardDates";
import { parse } from "csv-parse/sync";

export const LEGACY_LEAD_CSV_HEADERS = [
  "Data",
  "Modelo",
  "Região/Estado",
  "Cidade",
  "Concessionaria",
  "Nome",
  "Email",
  "Telefone",
  "Canal",
  "Data Corrigida",
  "Concessionarias corrijida",
] as const;

export const LEAD_CSV_HEADERS = [
  ...LEGACY_LEAD_CSV_HEADERS,
  "Canal de Origem",
] as const;

export const UNAVAILABLE_LEAD_VALUE = "Indisponível";
export const MAX_LEAD_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_LEAD_CSV_ROWS = 100_000;

export const MERCADO_LIVRE_JULY_DATE_CORRECTION = {
  channel: "Mercado Livre",
  sourceDateRaw: "Tue Jun 01 2026 00:00:00 GMT-0400 (Chile Standard Time)",
  correctedDateRaw: "01/06/2026",
  from: "2026-06-01",
  to: "2026-07-01",
} as const;

export type LeadCsvHeader = (typeof LEAD_CSV_HEADERS)[number];
type LegacyLeadCsvHeader = (typeof LEGACY_LEAD_CSV_HEADERS)[number];

export const REQUIRED_LEAD_ROW_FIELDS = [
  "Modelo",
  "Canal",
  "Concessionarias corrijida",
] as const satisfies readonly LegacyLeadCsvHeader[];
export type LeadRawRow = Record<LegacyLeadCsvHeader, string> &
  Partial<Record<LeadCsvHeader, string>>;

export type NormalizedLeadRecord = {
  sourceRowNumber: number;
  recordHash: string;
  contentHash: string;
  correctedDate: string;
  correctedDateRaw: string;
  sourceDateRaw: string;
  channel: string;
  channelRaw: string;
  sourceChannel: string;
  model: string;
  modelRaw: string;
  region: string;
  regionRaw: string;
  city: string;
  cityRaw: string;
  dealerName: string;
  dealerRaw: string;
  contactName: string;
  email: string;
  phone: string;
  rawPayload: {
    sourceDate: string;
    model: string;
    region: string;
    city: string;
    dealer: string;
    correctedDealer: string;
    name: string;
    email: string;
    phone: string;
    channel: string;
    sourceChannel: string;
    correctedDate: string;
  };
};

export type LeadCsvRowError = {
  rowNumber: number;
  message: string;
};

export type LeadCsvBreakdown = {
  value: string;
  count: number;
};

export type ParsedLeadCsv = {
  fileHash: string;
  fileSizeBytes: number;
  rowsTotal: number;
  validRows: number;
  invalidRows: number;
  fallbackDateUsed: string;
  fallbackDateCount: number;
  uniqueValidRows: number;
  duplicateRowsWithinFile: number;
  duplicateRowsByChannel: LeadCsvBreakdown[];
  dateFrom: string | null;
  dateTo: string | null;
  channels: LeadCsvBreakdown[];
  models: LeadCsvBreakdown[];
  regions: LeadCsvBreakdown[];
  errors: LeadCsvRowError[];
  records: NormalizedLeadRecord[];
};

export class LeadCsvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadCsvValidationError";
  }
}

const REGION_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
];

function normalizeWhitespace(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foldKey(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const REGION_BY_KEY = new Map<string, string>();
for (const [code, name] of REGION_NAMES) {
  REGION_BY_KEY.set(foldKey(code), code);
  REGION_BY_KEY.set(foldKey(name), code);
}

const UNAVAILABLE_KEYS = new Set(["", "N A", "NA", "NULL", "INDEFINIDO", "INDISPONIVEL"]);

export function normalizeLeadRegion(value: string): string {
  const key = foldKey(value);
  if (UNAVAILABLE_KEYS.has(key)) return UNAVAILABLE_LEAD_VALUE;
  return REGION_BY_KEY.get(key) ?? UNAVAILABLE_LEAD_VALUE;
}

const CHANNEL_BY_KEY = new Map<string, string>([
  ["SITE", "Site"],
  ["META", "Meta"],
  ["WEEBMOTORS", "Webmotors"],
  ["WEBMOTORS", "Webmotors"],
  ["CAMPANHA URBAN", "Campanha Urban"],
  ["MERCADO LIVRE", "Mercado Livre"],
  ["UOL", "UOL"],
  ["TIKTOK", "TikTok"],
  ["TIKTOK LIVE", "TikTok Live"],
  ["PROXY", "Proxy"],
]);

export function normalizeLeadChannel(value: string): string {
  const normalized = normalizeWhitespace(value);
  const key = foldKey(normalized);
  if (UNAVAILABLE_KEYS.has(key)) return UNAVAILABLE_LEAD_VALUE;
  return CHANNEL_BY_KEY.get(key) ?? normalized;
}

export function isMg4UrbanLeadModel(value: string): boolean {
  return foldKey(value).includes("URBAN");
}

export function correctKnownLeadDateAnomaly(input: {
  correctedDate: string;
  correctedDateRaw: string;
  sourceDateRaw: string;
  channel: string;
}): string {
  const correction = MERCADO_LIVRE_JULY_DATE_CORRECTION;
  const isExactKnownOccurrence =
    input.correctedDate === correction.from &&
    normalizeWhitespace(input.correctedDateRaw) === correction.correctedDateRaw &&
    normalizeWhitespace(input.sourceDateRaw) === correction.sourceDateRaw &&
    input.channel === correction.channel;
  return isExactKnownOccurrence ? correction.to : input.correctedDate;
}

const DEALER_PLACEHOLDER_KEYS = new Set([
  "WHATSAPP",
  "E MAIL",
  "EMAIL",
  "CONCESSIONARIA NAO PREENCHIDA",
]);

export function normalizeLeadDealer(value: string): string {
  const normalized = normalizeWhitespace(value);
  const key = foldKey(normalized);
  if (UNAVAILABLE_KEYS.has(key) || DEALER_PLACEHOLDER_KEYS.has(key)) {
    return UNAVAILABLE_LEAD_VALUE;
  }
  return normalized;
}

function normalizeOptionalDimension(value: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized || UNAVAILABLE_LEAD_VALUE;
}

export function normalizeLeadModel(value: string): string {
  const normalized = normalizeOptionalDimension(value);
  const key = foldKey(normalized);
  if (/(^| )IM ?6( |$)/.test(key)) return "IM6";
  if (key.includes("XPOWER") || /(^| )X POWER( |$)/.test(key)) return "MG4";
  return normalized;
}

function normalizeEmail(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("pt-BR");
}

function normalizePhone(value: string): string {
  return value.replace(/\D+/g, "");
}

function parseDateParts(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function parseCorrectedLeadDate(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  const br = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return parseDateParts(Number(br[3]), Number(br[2]), Number(br[1]));
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return parseDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

export const LEADS_TIMEZONE = DASHBOARD_TIME_ZONE;

export function getYesterdayInSaoPaulo(now: Date = new Date()): string {
  return getDashboardCutoffDate(now);
}

function assertFallbackDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || parseCorrectedLeadDate(value) !== value) {
    throw new LeadCsvValidationError("A data de fallback precisa ser válida no formato AAAA-MM-DD.");
  }
  return value;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function getLeadCsvFileHash(bytes: Buffer): string {
  return sha256(bytes);
}

function toComparable(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("pt-BR");
}

function increment(counter: Map<string, number>, value: string): void {
  counter.set(value, (counter.get(value) ?? 0) + 1);
}

function breakdown(counter: Map<string, number>): LeadCsvBreakdown[] {
  return Array.from(counter.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"));
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LeadCsvValidationError("O arquivo precisa estar codificado em UTF-8.");
  }
}

function parseRows(text: string): LeadRawRow[] {
  try {
    return parse(text, {
      bom: true,
      columns: (headers: string[]) => {
        const normalizedHeaders = headers.map(header => normalizeWhitespace(header));
        const currentMatch =
          normalizedHeaders.length === LEAD_CSV_HEADERS.length &&
          normalizedHeaders.every((header, index) => header === LEAD_CSV_HEADERS[index]);
        const legacyMatch =
          normalizedHeaders.length === LEGACY_LEAD_CSV_HEADERS.length &&
          normalizedHeaders.every((header, index) => header === LEGACY_LEAD_CSV_HEADERS[index]);
        if (!currentMatch && !legacyMatch) {
          throw new LeadCsvValidationError(
            `Cabeçalhos inválidos. Use: ${LEGACY_LEAD_CSV_HEADERS.join(", ")} e, opcionalmente, Canal de Origem como última coluna.`,
          );
        }
        return normalizedHeaders;
      },
      skip_empty_lines: true,
      relax_column_count: false,
      trim: false,
    }) as LeadRawRow[];
  } catch (error) {
    if (error instanceof LeadCsvValidationError) throw error;
    const message = error instanceof Error ? error.message : "estrutura CSV inválida";
    throw new LeadCsvValidationError(`Não foi possível interpretar o CSV: ${message}`);
  }
}

function normalizeRow(
  row: LeadRawRow,
  sourceRowNumber: number,
  fallbackDate: string,
): NormalizedLeadRecord | LeadCsvRowError {
  const missingFields = REQUIRED_LEAD_ROW_FIELDS.filter(field => !normalizeWhitespace(row[field] ?? ""));
  if (missingFields.length) {
    return {
      rowNumber: sourceRowNumber,
      message: `Campos obrigatórios ausentes: ${missingFields.join(", ")}.`,
    };
  }

  const correctedDateRaw = row["Data Corrigida"] ?? "";
  const correctedDateMissing = !normalizeWhitespace(correctedDateRaw);
  const parsedCorrectedDate = correctedDateMissing
    ? fallbackDate
    : parseCorrectedLeadDate(correctedDateRaw);
  if (!parsedCorrectedDate) {
    return {
      rowNumber: sourceRowNumber,
      message: "Data Corrigida inválida; use DD/MM/AAAA ou AAAA-MM-DD.",
    };
  }

  const sourceDateRaw = row.Data ?? "";
  const modelRaw = row.Modelo ?? "";
  const regionRaw = row["Região/Estado"] ?? "";
  const cityRaw = row.Cidade ?? "";
  const originalDealerRaw = row.Concessionaria ?? "";
  const correctedDealerRaw = row["Concessionarias corrijida"] ?? "";
  const dealerRaw = correctedDealerRaw;
  const contactNameRaw = row.Nome ?? "";
  const emailRaw = row.Email ?? "";
  const phoneRaw = row.Telefone ?? "";
  const channelRaw = row.Canal ?? "";
  const sourceChannelRaw = row["Canal de Origem"] ?? channelRaw;

  const model = normalizeLeadModel(modelRaw);
  const region = normalizeLeadRegion(regionRaw);
  const city = normalizeOptionalDimension(cityRaw);
  const dealerName = normalizeLeadDealer(dealerRaw);
  const contactName = normalizeWhitespace(contactNameRaw);
  const email = normalizeEmail(emailRaw);
  const phone = normalizePhone(phoneRaw);
  const sourceChannel = normalizeLeadChannel(channelRaw);
  const normalizedSourceChannel = normalizeLeadChannel(sourceChannelRaw);
  const channel = normalizedSourceChannel === "TikTok"
    ? "TikTok"
    : normalizedSourceChannel === "TikTok Live"
      ? "TikTok Live"
      : isMg4UrbanLeadModel(model)
      ? "Campanha Urban"
      : sourceChannel;
  const correctedDate = correctKnownLeadDateAnomaly({
    correctedDate: parsedCorrectedDate,
    correctedDateRaw,
    sourceDateRaw,
    channel: sourceChannel,
  });

  const contentHash = sha256(
    [
      toComparable(sourceDateRaw),
      toComparable(model),
      toComparable(region),
      toComparable(city),
      toComparable(dealerName),
      toComparable(contactName),
      email,
      phone,
      toComparable(channel),
      correctedDate,
    ].join("\u001f"),
  );
  const recordHash = contentHash;

  return {
    sourceRowNumber,
    recordHash,
    contentHash,
    correctedDate,
    correctedDateRaw,
    sourceDateRaw,
    channel,
    channelRaw,
    sourceChannel: normalizedSourceChannel,
    model,
    modelRaw,
    region,
    regionRaw,
    city,
    cityRaw,
    dealerName,
    dealerRaw,
    contactName,
    email,
    phone,
    rawPayload: {
      sourceDate: sourceDateRaw,
      model: modelRaw,
      region: regionRaw,
      city: cityRaw,
      dealer: originalDealerRaw,
      correctedDealer: correctedDealerRaw,
      name: contactNameRaw,
      email: emailRaw,
      phone: phoneRaw,
      channel: channelRaw,
      sourceChannel: sourceChannelRaw,
      correctedDate: correctedDateRaw,
    },
  };
}

export function parseLeadCsv(
  bytes: Buffer,
  fallbackDate = getYesterdayInSaoPaulo(),
): ParsedLeadCsv {
  if (!bytes.length) throw new LeadCsvValidationError("O arquivo CSV está vazio.");
  if (bytes.length > MAX_LEAD_CSV_BYTES) {
    throw new LeadCsvValidationError("O arquivo CSV excede o limite de 10 MB.");
  }

  const normalizedFallbackDate = assertFallbackDate(fallbackDate);
  const fileHash = getLeadCsvFileHash(bytes);
  const text = decodeUtf8(bytes);
  const rawRows = parseRows(text);
  if (!rawRows.length) throw new LeadCsvValidationError("O CSV não contém registros de Leads.");
  if (rawRows.length > MAX_LEAD_CSV_ROWS) {
    throw new LeadCsvValidationError(`O CSV excede o limite de ${MAX_LEAD_CSV_ROWS.toLocaleString("pt-BR")} registros.`);
  }

  const records: NormalizedLeadRecord[] = [];
  const seenContentHashes = new Set<string>();
  const errors: LeadCsvRowError[] = [];
  const duplicateChannelCounts = new Map<string, number>();
  let invalidRows = 0;
  let validRows = 0;
  let fallbackDateCount = 0;
  let duplicateRowsWithinFile = 0;

  rawRows.forEach((row, index) => {
    const normalized = normalizeRow(row, index + 2, normalizedFallbackDate);
    if ("message" in normalized) {
      invalidRows += 1;
      if (errors.length < 50) errors.push(normalized);
      return;
    }
    validRows += 1;
    if (!normalizeWhitespace(normalized.correctedDateRaw)) fallbackDateCount += 1;
    if (seenContentHashes.has(normalized.contentHash)) {
      duplicateRowsWithinFile += 1;
      increment(duplicateChannelCounts, normalized.channel);
      return;
    }
    seenContentHashes.add(normalized.contentHash);
    records.push(normalized);
  });
  const channelCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  for (const record of records) {
    increment(channelCounts, record.channel);
    increment(modelCounts, record.model);
    increment(regionCounts, record.region);
  }
  const dates = records.map(record => record.correctedDate).sort();

  return {
    fileHash,
    fileSizeBytes: bytes.length,
    rowsTotal: rawRows.length,
    validRows,
    invalidRows,
    fallbackDateUsed: normalizedFallbackDate,
    fallbackDateCount,
    uniqueValidRows: seenContentHashes.size,
    duplicateRowsWithinFile,
    duplicateRowsByChannel: breakdown(duplicateChannelCounts),
    dateFrom: dates.at(0) ?? null,
    dateTo: dates.at(-1) ?? null,
    channels: breakdown(channelCounts),
    models: breakdown(modelCounts),
    regions: breakdown(regionCounts),
    errors,
    records,
  };
}
