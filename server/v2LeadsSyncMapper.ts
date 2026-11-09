import { createHash } from "node:crypto";
import {
  LEADS_SYNC_ALLOWED_SHEETS,
  type LeadsSyncAllowedSheet,
  type LeadsSyncValueRange,
} from "../shared/leadsSync";
import { parseSourceDate } from "./v2Mapper";

const allowedSheets = new Set<string>(LEADS_SYNC_ALLOWED_SHEETS);
const PAGE_TO_EXCLUDE = "Página10";

export type MappedLeadSyncRow = {
  sourceSheet: LeadsSyncAllowedSheet;
  sourceRow: number;
  sourceIdRaw: string;
  sourceTimestampRaw: string;
  leadDate: string;
  leadHour: number | null;
  name: string;
  rawModel: string;
  version: string;
  channel: string;
  campaign: string;
  rawDealer: string;
  city: string;
  state: string;
  crm: string;
  headers: string[];
  rawValues: unknown[];
  payloadJson: string;
  rowHash: string;
};

export type MappedLeadSyncSource = {
  sourceSheet: LeadsSyncAllowedSheet;
  range: string;
  headers: string[];
  rows: MappedLeadSyncRow[];
};

export type PreparedLeadsSnapshot = {
  sources: MappedLeadSyncSource[];
  rows: MappedLeadSyncRow[];
  inputSha256: string;
};

const HEADER_ALIASES = {
  id: [
    "id",
    "lead_id",
    "lead id",
    "ID do ticket",
    "idLead",
    "retailer_item_id",
    "retailer item id",
  ],
  date: [
    "data",
    "created_time",
    "created_at",
    "recebimento_lead_ts",
    "data da conversão",
    "data da conversao",
    "data de criação",
    "data de criacao",
    "criação do ticket - carimbo de data/hora",
    "criacao do ticket - carimbo de data/hora",
  ],
  model: [
    "modelo",
    "modelo de interesse",
    "interest_model",
    "qual_versão_do_mg4_você_tem_interesse?",
    "qual_versão_do_mg4_você_tem_interesse?_",
    "qual versao do mg4 voce tem interesse",
  ],
  version: [
    "versao",
    "versão",
    "version",
    "qual_versão_do_mg4_você_tem_interesse?",
    "qual_versão_do_mg4_você_tem_interesse?_",
  ],
  dealer: [
    "concessionária",
    "concessionaria",
    "loja",
    "dealership_label",
    "em_qual_concessionária_gostaria_de_ser_atendido?",
    "em_qual_concessionária_gostaria_de_ser_atendido?_",
    "em qual concessionaria gostaria de ser atendido",
  ],
  name: [
    "nome do solicitante",
    "full_name",
    "name",
    "nome",
    "nomecliente",
    "usuario_preferred",
    "usuario_legal",
  ],
  campaign: ["canal / campanha", "campaign_name", "utm_campaign", "campaign"],
  city: ["cidade", "city", "city_label", "city_tag"],
  state: ["estado", "state", "state (province)"],
  hour: ["hora recebimento lead", "hora", "lead_hour"],
  crm: ["crm", "crm_name"],
} as const;

type HeaderField = keyof typeof HEADER_ALIASES;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || text(value).trim() === "";
}

function trimTrailingEmpty<T>(values: readonly T[]): T[] {
  const copy = [...values];
  while (copy.length > 0 && isBlank(copy[copy.length - 1])) copy.pop();
  return copy;
}

function canonicalCell(value: unknown): unknown {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  return text(value);
}

function canonicalValues(values: readonly unknown[][]): unknown[][] {
  const rows = values.map(row => trimTrailingEmpty(row).map(canonicalCell));
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

function quoteJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    throw new Error("A fonte de Leads contém valores inválidos.");
  }
}

function sheetFromRange(range: string): string {
  const match = String(range).match(/^\s*(?:'((?:''|[^'])+)'|([^!]+))!/);
  const value = match?.[1] ?? match?.[2] ?? "";
  return value.replace(/''/g, "'").trim();
}

function findHeaderIndex(headers: string[], field: HeaderField): number {
  const aliases = new Set(HEADER_ALIASES[field].map(normalizeHeader));
  return headers.findIndex(header => aliases.has(normalizeHeader(header)));
}

const headerIndexCache = new WeakMap<string[], Record<HeaderField, number[]>>();
function getValue(
  row: readonly unknown[],
  headers: string[],
  field: HeaderField
): unknown {
  let indexes = headerIndexCache.get(headers);
  if (!indexes) {
    const normalized = headers.map(normalizeHeader);
    indexes = Object.fromEntries(
      Object.entries(HEADER_ALIASES).map(([key, aliases]) => [
        key,
        aliases
          .map(alias => normalized.indexOf(normalizeHeader(alias)))
          .filter(index => index >= 0),
      ])
    ) as Record<HeaderField, number[]>;
    headerIndexCache.set(headers, indexes);
  }
  for (const index of indexes[field])
    if (!isBlank(row[index])) return row[index];
  return "";
}

function requireDateHeader(headers: string[]): void {
  if (findHeaderIndex(headers, "date") < 0)
    throw new Error(
      "A fonte de Leads não contém o cabeçalho obrigatório de data."
    );
}

function requireMeaningfulHeader(headers: string[]): void {
  if (!headers.some(header => !isBlank(header)))
    throw new Error("A fonte de Leads não contém cabeçalho válido.");
}

function sourceChannel(sheet: LeadsSyncAllowedSheet): string {
  return (
    {
      Site: "Site",
      Meta: "Meta",
      "Tiktok - Live": "TikTok Live",
      Tikok: "TikTok",
      Weebmotors: "Webmotors",
      Uol: "UOL",
      "Mercado Livre": "Mercado Livre",
      Interlagos: "Interlagos",
    } as Record<LeadsSyncAllowedSheet, string>
  )[sheet];
}

function rowHash(
  sourceSheet: string,
  sourceRow: number,
  headers: readonly string[],
  values: readonly unknown[]
): string {
  return createHash("sha256")
    .update(
      quoteJson({
        sourceSheet,
        sourceRow,
        headers: trimTrailingEmpty(headers),
        values: trimTrailingEmpty(values).map(canonicalCell),
      })
    )
    .digest("hex");
}

function readHour(value: unknown): number | null {
  const match = text(value).match(/^(\d{1,2})(?::|h|$)/i);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : null;
}

function mapSource(
  sheet: LeadsSyncAllowedSheet,
  range: LeadsSyncValueRange
): MappedLeadSyncSource {
  const values = Array.isArray(range.values) ? range.values : [];
  if (values.length === 0) throw new Error("Uma fonte de Leads está vazia.");
  const headers = (Array.isArray(values[0]) ? values[0] : []).map(text);
  requireMeaningfulHeader(headers);
  requireDateHeader(headers);

  const siteTimestampIndex =
    sheet === "Site"
      ? headers.findIndex(
          header =>
            normalizeHeader(header) ===
            normalizeHeader("Criação do ticket - Carimbo de data/hora")
        )
      : -1;
  const rows: MappedLeadSyncRow[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const row = Array.isArray(values[index]) ? values[index] : [];
    if (!row.some(value => !isBlank(value))) continue;

    const dateValue = text(getValue(row, headers, "date"));
    const rawTimestamp =
      siteTimestampIndex >= 0 ? text(row[siteTimestampIndex]) : dateValue;
    const parsed = parseSourceDate(dateValue, sheet === "Meta");
    if (!parsed)
      throw new Error(
        "A fonte de Leads contém data inválida; a carga foi rejeitada."
      );

    const rawModel = text(getValue(row, headers, "model"));
    const rawDealer = text(getValue(row, headers, "dealer"));
    const rawHour = getValue(row, headers, "hour");
    const name = text(getValue(row, headers, "name"));
    const rawVersion = text(getValue(row, headers, "version"));
    const rawCampaign = text(getValue(row, headers, "campaign"));
    const rawCity = text(getValue(row, headers, "city"));
    const rawState = text(getValue(row, headers, "state"));
    const rawCrm = text(getValue(row, headers, "crm"));
    const rowNumber = index + 1;
    const rawValues = [...row];
    const payload = {
      sourceSheet: sheet,
      sourceRow: rowNumber,
      headers,
      values: rawValues,
      sourceIdRaw: text(getValue(row, headers, "id")),
      sourceTimestampRaw: rawTimestamp,
    };

    rows.push({
      sourceSheet: sheet,
      sourceRow: rowNumber,
      sourceIdRaw: payload.sourceIdRaw,
      sourceTimestampRaw: rawTimestamp,
      leadDate: parsed.date,
      leadHour: parsed.hour ?? readHour(rawHour),
      name: name || "Não informado",
      // These two values intentionally remain byte-for-byte strings from Sheets.
      rawModel,
      version: rawVersion || "Não informado",
      channel: sourceChannel(sheet),
      campaign: rawCampaign || "Não informado",
      rawDealer,
      city: rawCity || "Não informado",
      state: rawState || "Não informado",
      crm: rawCrm || "Não informado",
      headers,
      rawValues,
      // Keep raw provenance, but serialize only when a changed row is persisted.
      // An unchanged 50k-row workbook must not retain 50k duplicate JSON payloads.
      get payloadJson() {
        return quoteJson(payload);
      },
      rowHash: rowHash(sheet, rowNumber, headers, rawValues),
    });
  }

  if (rows.length === 0) throw new Error("Uma fonte de Leads está vazia.");

  return { sourceSheet: sheet, range: range.range, headers, rows };
}

/**
 * Maps and validates a complete snapshot before any database transaction starts.
 * The mapper keeps physical sheet occurrences as the identity; source IDs are
 * audit fields only and never participate in deduplication.
 */
export function prepareLeadsSnapshot(
  valueRanges: readonly LeadsSyncValueRange[]
): PreparedLeadsSnapshot {
  if (!Array.isArray(valueRanges) || valueRanges.length === 0)
    throw new Error("A fonte de Leads não contém abas para importar.");

  const sources: MappedLeadSyncSource[] = [];
  const seenSheets = new Set<string>();
  for (const valueRange of valueRanges) {
    if (!valueRange || typeof valueRange.range !== "string")
      throw new Error("A fonte de Leads contém intervalo inválido.");
    const sheet = sheetFromRange(valueRange.range);
    if (!sheet || sheet === PAGE_TO_EXCLUDE) continue;
    if (!allowedSheets.has(sheet))
      throw new Error("A fonte de Leads contém uma aba não autorizada.");
    if (seenSheets.has(sheet))
      throw new Error("A fonte de Leads contém uma aba repetida.");
    seenSheets.add(sheet);
    sources.push(mapSource(sheet as LeadsSyncAllowedSheet, valueRange));
  }
  if (sources.length === 0)
    throw new Error("A fonte de Leads não contém abas autorizadas.");

  const rows = sources.flatMap(source => source.rows);
  // Emit exactly the previous canonical JSON bytes into the hash in bounded
  // pieces. Never allocate a second workbook or a workbook-sized JSON string.
  const hash = createHash("sha256");
  hash.update("[");
  const ordered = sources
    .slice()
    .sort((a, b) => a.sourceSheet.localeCompare(b.sourceSheet));
  ordered.forEach((source, index) => {
    if (index) hash.update(",");
    hash.update(`{"sourceSheet":${quoteJson(source.sourceSheet)}`);
    if (source.rows.some((row, rowIndex) => row.sourceRow !== rowIndex + 2)) {
      hash.update(',"physicalRows":[');
      source.rows.forEach((row, rowIndex) => {
        if (rowIndex) hash.update(",");
        hash.update(String(row.sourceRow));
      });
      hash.update("]");
    }
    hash.update(
      `,"headers":${quoteJson(trimTrailingEmpty(source.headers))},"values":[`
    );
    hash.update(
      quoteJson(trimTrailingEmpty(source.headers).map(canonicalCell))
    );
    for (const row of source.rows) {
      hash.update(",");
      hash.update(
        quoteJson(trimTrailingEmpty(row.rawValues).map(canonicalCell))
      );
    }
    hash.update("]}");
  });
  hash.update("]");
  const inputSha256 = hash.digest("hex");

  return { sources, rows, inputSha256 };
}

export function normalizeLeadsSyncRangeSheet(range: string): string {
  return sheetFromRange(range);
}

export function canonicalizeLeadsSyncValues(
  values: readonly unknown[][]
): unknown[][] {
  return canonicalValues(values);
}
