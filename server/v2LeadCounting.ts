import { createHash } from "node:crypto";
import type { V2Lead } from "../shared/v2Types";
import { BRAZILIAN_STATES } from "../shared/stateRegistry";
import { isIsoCalendarDate } from "../shared/dashboardDates";
import { parseSourceDate } from "./v2Mapper";

/** Private provenance: never serialize contacts, payloads or identities to clients. */
export type LeadCountingProvenance = {
  sourceSheet?: unknown;
  headersJson?: unknown;
  valuesJson?: unknown;
  sourceTimestampRaw?: unknown;
};
export type LeadCountingInput = {
  lead: V2Lead;
  provenance?: LeadCountingProvenance;
};
const UNAVAILABLE = "Indisponível";
const UNAVAILABLE_KEYS = new Set([
  "",
  "N A",
  "NA",
  "NULL",
  "INDEFINIDO",
  "INDISPONIVEL",
]);
const DEALER_PLACEHOLDERS = new Set([
  "WHATSAPP",
  "E MAIL",
  "EMAIL",
  "CONCESSIONARIA NAO PREENCHIDA",
]);
function whitespace(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function fold(value: unknown): string {
  return whitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
function comparable(value: unknown): string {
  return whitespace(value).toLocaleLowerCase("pt-BR");
}
function optional(value: unknown): string {
  return whitespace(value) || UNAVAILABLE;
}
function jsonArray(value: unknown): unknown[] | null {
  if (value == null) return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed))
    throw new Error("Proveniência de Leads inválida.");
  return parsed;
}

/** Model recognition used by googleLeadsConsolidator.py, not fuzzy classification. */
export function legacyConsolidatedModel(value: unknown): string {
  const key = fold(value);
  if (!key) return "";
  if (key.includes("CYBERSTER")) return "CYBERSTER";
  if (/(?:^| )IM ?6(?: |$)/.test(key)) return "IM6";
  if (key.includes("URBAN")) return "MG4 URBAN";
  if (/(?:^| )MG ?S?5(?: |$)/.test(key) || key === "S5") return "MGS5";
  if (key.includes("XPOWER") || /(?:^| )X POWER(?: |$)/.test(key)) return "MG4";
  if (/(?:^| )MG ?4(?: |$)/.test(key) || key === "4") return "MG4";
  return "";
}

/** V1's generated Data Corrigida is a calendar date, not a timezone conversion. */
export function legacyCorrectedDate(
  value: unknown,
  dayFirst: boolean
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return isIsoCalendarDate(iso[1]) ? iso[1] : null;
  // The historical ETL explicitly recognizes DD/MM/YYYY even for Meta.
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const date = `${br[3]}-${br[2]}-${br[1]}`;
    return isIsoCalendarDate(date) ? date : null;
  }
  const js = raw.match(/[A-Za-z]{3} ([A-Za-z]{3}) (\d{1,2}) (\d{4})/);
  if (js) {
    const month =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(js[1].toLowerCase()) + 1;
    const date = `${js[3]}-${String(month).padStart(2, "0")}-${js[2].padStart(2, "0")}`;
    return isIsoCalendarDate(date) ? date : null;
  }
  return parseSourceDate(raw, !dayFirst)?.date ?? null;
}

/** Same lifecycle as V1; TikTok Live deliberately remains distinct from TikTok. */
export function isLegacyLeadChannelActive(
  channel: string,
  date: string
): boolean {
  const key = channel.trim().toLocaleUpperCase("pt-BR");
  if (key === "UOL") return date <= "2026-07-31";
  return !(["TIKTOK", "INTERLAGOS"].includes(key) && date >= "2026-09-01");
}

type CsvShape = {
  sourceDate: string;
  date: string | null;
  model: string;
  region: string;
  city: string;
  dealer: string;
  name: string;
  email: string;
  phone: string;
  channel: string;
  sourceChannel: string;
};
function shapeFromSource(
  lead: V2Lead,
  provenance: LeadCountingProvenance,
  headers: unknown[],
  values: unknown[]
): CsvShape {
  const keys = headers.map(fold);
  const get = (aliases: string[], fallback = "") => {
    for (const alias of aliases) {
      const index = keys.indexOf(fold(alias));
      if (index >= 0) return String(values[index] ?? "");
    }
    return fallback;
  };
  const sheet = String(provenance.sourceSheet ?? "");
  let sourceDate = String(provenance.sourceTimestampRaw ?? "") || lead.date;
  let modelSource = lead.model,
    region = lead.state,
    city = lead.city,
    dealer = lead.dealer;
  let name = lead.name,
    email = "",
    phone = "",
    channel = lead.channel;
  let dayFirst = true,
    allowUnavailable = false;
  if (sheet === "Site") {
    sourceDate =
      get(["data"]) || get(["Criação do ticket - Carimbo de data/hora"]);
    modelSource = get(["Modelo de Interesse"]);
    region = get(["Estado"]);
    city = get(["Cidade"]);
    dealer = get(["Concessionária"]);
    name = get(["Nome do solicitante"]);
    email = get(["E-mail do solicitante"]);
    phone = get(["Número de telefone do solicitante"]);
    channel = fold(get(["Canal / Campanha"])).includes("URBAN")
      ? "Campanha Urban"
      : "Site";
  } else if (sheet === "Meta") {
    sourceDate = get(["created_time"]);
    modelSource = get(["form_name"]);
    dayFirst = false;
    dealer = get([
      "em_qual_concessionária_gostaria_de_ser_atendido?_",
      "em_qual_concessionaria_gostaria_de_ser_atendido?_",
    ]);
    name = get(["full_name"]);
    email = get(["email"]);
    phone = get(["phone_number"]);
    city = get(["Cidade"]);
    region = get(["Estado"]);
  } else if (sheet === "Weebmotors") {
    sourceDate = get(["recebimento_lead_ts"]);
    modelSource = get(["modelo"]);
    dealer = get(["loja"]);
    city = get(["cidade"]);
    region = get(["estado"]);
    name = get(["nomeCliente"]);
    email = get(["email"]);
    phone = get(["whatsapp"]);
  } else if (sheet === "Mercado Livre") {
    sourceDate = get(["data"]);
    modelSource = get(["modelo"]);
    dealer = get(["Concessionaria"]);
    region = get(["Estado"]);
    city = get(["Cidade"]);
    name = get(["Usuario_legal"]);
    email = get(["Chave_2"]);
    phone = get(["Chave_3"]);
    dayFirst = false;
  } else if (sheet === "Uol") {
    sourceDate = get(["Data da conversão"]);
    modelSource = get(["Modelo"]);
    dealer = get(["Concessionária"]);
    region = get(["Estado"]);
    city = get(["Cidade"]);
    name = get(["Nome"]);
    email = get(["Email"]);
    phone = get(["Telefone"]);
  } else if (sheet === "Interlagos") {
    sourceDate = get(["created_at"]);
    modelSource = get(["interest_model"]);
    dealer = get(["dealership_label"]);
    region = get(["state"]);
    city = get(["city_label"]);
    name = get(["name"]);
    email = get(["email"]);
    phone = get(["phone_e164"]);
    dayFirst = false;
    allowUnavailable = true;
  } else if (
    ["Tiktok - Live", "TikTok - Live", "Tiktok Live", "TikTok Live"].includes(
      sheet
    )
  ) {
    sourceDate = get(["Date", "Data"]);
    modelSource = get(["Modelo", "Model"]);
    dealer = UNAVAILABLE;
    city = get(["City", "Cidade"]);
    region = get(["State (Province)", "State", "Estado"]);
    name = get(["Name", "Nome"]);
    phone = get(["Phone", "Telefone"]);
    email = get(["E-mail", "Email"]);
    allowUnavailable = true;
  } else if (["Tikok", "TikTok"].includes(sheet)) {
    sourceDate = get(["created_time"]);
    modelSource = get(["ad_name", "ad name"]);
    dayFirst = false;
    dealer = get(["Em qual concessionária gostaria de ser atendido?"]);
    const location = whitespace(dealer).match(
      /\s+-\s+(.+?)\s*\/\s*([A-Za-z]{2})\s*$/
    );
    city = location?.[1].trim() ?? "";
    region = location?.[2].toUpperCase() ?? "";
    name = get(["Name", "Nome"]);
    phone = get(["Phone number", "Telefone", "phone_number"]);
    email = get(["Email", "E-mail"]);
  }
  const model =
    legacyConsolidatedModel(modelSource) ||
    (allowUnavailable ? UNAVAILABLE : "");
  dealer = dealer.trim() ? dealer : allowUnavailable ? UNAVAILABLE : "";
  const sourceChannel = lead.channel;
  const hashChannel = ["TikTok", "TikTok Live"].includes(sourceChannel)
    ? sourceChannel
    : model === "MG4 URBAN"
      ? "Campanha Urban"
      : channel;
  const explicit = get(["Data Corrigida"]);
  const date = legacyCorrectedDate(
    explicit || sourceDate,
    explicit ? true : dayFirst
  );
  return {
    sourceDate,
    date,
    model,
    region,
    city,
    dealer,
    name,
    email,
    phone,
    channel: hashChannel,
    sourceChannel,
  };
}

/** ETL validation + the exact ten fields of V1 contentHash; no physical ID included. */
export function projectLegacyLeadCounting(input: LeadCountingInput): {
  lead: V2Lead;
  contentHash: string | null;
  valid: boolean;
} {
  const original = input.lead;
  const headers = jsonArray(input.provenance?.headersJson);
  const values = jsonArray(input.provenance?.valuesJson);
  if (!headers || !values)
    return { lead: { ...original }, contentHash: null, valid: true };
  const csv = shapeFromSource(
    original,
    input.provenance ?? {},
    headers,
    values
  );
  if (!csv.date || !csv.model || !csv.dealer.trim())
    return { lead: { ...original }, contentHash: null, valid: false };
  let date = csv.date;
  if (
    date === "2026-06-01" &&
    csv.sourceChannel === "Mercado Livre" &&
    whitespace(csv.sourceDate) ===
      "Tue Jun 01 2026 00:00:00 GMT-0400 (Chile Standard Time)"
  )
    date = "2026-07-01";
  const stateKey = fold(csv.region);
  const region =
    BRAZILIAN_STATES.find(
      s => fold(s.uf) === stateKey || fold(s.name) === stateKey
    )?.uf ?? UNAVAILABLE;
  const dealerKey = fold(csv.dealer);
  const dealer =
    UNAVAILABLE_KEYS.has(dealerKey) || DEALER_PLACEHOLDERS.has(dealerKey)
      ? UNAVAILABLE
      : whitespace(csv.dealer);
  const contentHash = createHash("sha256")
    .update(
      [
        comparable(csv.sourceDate),
        comparable(csv.model),
        comparable(region),
        comparable(optional(csv.city)),
        comparable(dealer),
        comparable(csv.name),
        comparable(csv.email),
        csv.phone.replace(/\D+/g, ""),
        comparable(csv.channel),
        date,
      ].join("\u001f")
    )
    .digest("hex");
  // Keep the current display's original model/dealer/name; only the analytical date changes.
  return { lead: { ...original, date }, contentHash, valid: true };
}

export type LegacyLeadCountingAccumulator = {
  add(input: LeadCountingInput): void;
  finish(): V2Lead[];
};

/**
 * Incremental form of the historical counter for bounded database reads.
 * The set deliberately lives across pages so canonical SQL ordering keeps
 * the same first-occurrence precedence as the array-based implementation.
 */
export function createLegacyLeadCountingAccumulator(): LegacyLeadCountingAccumulator {
  const seen = new Set<string>();
  const result: V2Lead[] = [];
  return {
    add(input) {
      const row = projectLegacyLeadCounting(input);
      if (!row.valid) return;
      if (row.contentHash) {
        if (seen.has(row.contentHash)) return;
        seen.add(row.contentHash);
      }
      if (isLegacyLeadChannelActive(row.lead.channel, row.lead.date))
        result.push(row.lead);
    },
    finish() {
      return result;
    },
  };
}

export function countLegacyCompatibleLeads(
  inputs: readonly LeadCountingInput[]
): V2Lead[] {
  const counter = createLegacyLeadCountingAccumulator();
  for (const input of inputs) counter.add(input);
  return counter.finish();
}
