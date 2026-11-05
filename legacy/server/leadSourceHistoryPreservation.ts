import { createHash } from "node:crypto";

import { leads } from "../drizzle/schema";
import { getDb } from "./db";
import { parseLeadCsv, type NormalizedLeadRecord } from "./leadsCsv";

const LEAD_CSV_HEADERS = [
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
  "Canal de Origem",
] as const;

type StoredLeadForPreservation = {
  contentHash: string;
  correctedDate: string;
  channel: string;
  sourceChannel: string;
  model: string;
  sourceDateRaw: string;
  dealerName: string;
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
    sourceChannel?: string;
    correctedDate: string;
  };
};

export type LeadHistoryPreservationResult = {
  bytes: Buffer;
  preservedCount: number;
  sourceCorrectionCount: number;
  preservedByChannel: Record<string, number>;
  preservedBySourceChannel: Record<string, number>;
  preservedDateFrom: string | null;
  preservedDateTo: string | null;
};

function increment(counter: Map<string, number>, value: string): void {
  counter.set(value, (counter.get(value) ?? 0) + 1);
}

function asSortedObject(counter: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    Array.from(counter.entries()).sort(
      ([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount || left.localeCompare(right, "pt-BR"),
    ),
  );
}

function normalizeIdentityValue(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function stableIdentity(input: {
  sourceDateRaw: string;
  contactName: string;
  email: string;
  phone: string;
  dealerName: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.sourceDateRaw,
        input.contactName,
        input.email,
        input.phone,
        input.dealerName,
      ]
        .map(normalizeIdentityValue)
        .join("\u001f"),
    )
    .digest("hex");
}

function formatBrDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Data canônica inválida para preservação: ${value}`);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function escapeCsv(value: string): string {
  const normalized = value ?? "";
  return /[",\n\r]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

function outputRow(record: StoredLeadForPreservation): string {
  const payload = record.rawPayload;
  const values = [
    payload.sourceDate,
    payload.model,
    payload.region,
    payload.city,
    payload.dealer,
    payload.name,
    payload.email,
    payload.phone,
    payload.channel,
    formatBrDate(record.correctedDate),
    payload.correctedDealer,
    payload.sourceChannel ?? payload.channel,
  ];
  return values.map(escapeCsv).join(",");
}

function identityForNormalized(record: NormalizedLeadRecord): string {
  return stableIdentity(record);
}

function identityForStored(record: StoredLeadForPreservation): string {
  return stableIdentity(record);
}

export function mergeMissingCanonicalLeads(input: {
  bytes: Buffer;
  storedLeads: StoredLeadForPreservation[];
  fallbackDate: string;
}): LeadHistoryPreservationResult {
  const parsed = parseLeadCsv(input.bytes, input.fallbackDate);
  if (parsed.invalidRows > 0) {
    throw new Error("O CSV canônico possui linhas inválidas antes da preservação de histórico.");
  }

  const candidateHashes = new Set(parsed.records.map(record => record.contentHash));
  const candidateIdentities = new Set(parsed.records.map(identityForNormalized));
  const missing = input.storedLeads.filter(record => !candidateHashes.has(record.contentHash));
  const sourceCorrections = missing.filter(record => candidateIdentities.has(identityForStored(record)));
  const preserved = missing.filter(record => !candidateIdentities.has(identityForStored(record)));

  const baseCsv = input.bytes
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
  const [header] = baseCsv.split("\n", 1);
  if (header !== LEAD_CSV_HEADERS.join(",")) {
    throw new Error("Cabeçalho do CSV canônico não corresponde ao contrato de Leads.");
  }

  const bytes = Buffer.from(
    `\uFEFF${baseCsv}${preserved.length ? `\n${preserved.map(outputRow).join("\n")}` : ""}\n`,
    "utf8",
  );
  const merged = parseLeadCsv(bytes, input.fallbackDate);
  if (merged.invalidRows !== 0 || merged.records.length !== parsed.records.length + preserved.length) {
    throw new Error("A preservação de histórico não reconciliou com o CSV canônico.");
  }
  const mergedHashes = new Set(merged.records.map(record => record.contentHash));
  for (const record of preserved) {
    if (!mergedHashes.has(record.contentHash)) {
      throw new Error("A preservação de histórico não manteve a identidade canônica de um Lead.");
    }
  }

  const channelCounts = new Map<string, number>();
  const sourceChannelCounts = new Map<string, number>();
  const dates = preserved.map(record => record.correctedDate).sort();
  for (const record of preserved) {
    increment(channelCounts, record.channel);
    increment(sourceChannelCounts, record.sourceChannel);
  }

  return {
    bytes,
    preservedCount: preserved.length,
    sourceCorrectionCount: sourceCorrections.length,
    preservedByChannel: asSortedObject(channelCounts),
    preservedBySourceChannel: asSortedObject(sourceChannelCounts),
    preservedDateFrom: dates.at(0) ?? null,
    preservedDateTo: dates.at(-1) ?? null,
  };
}

export async function preserveMissingCanonicalLeads(input: {
  bytes: Buffer;
  fallbackDate: string;
}): Promise<LeadHistoryPreservationResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const storedLeads = await db
    .select({
      contentHash: leads.contentHash,
      correctedDate: leads.correctedDate,
      channel: leads.channel,
      sourceChannel: leads.sourceChannel,
      model: leads.model,
      sourceDateRaw: leads.sourceDateRaw,
      dealerName: leads.dealerName,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      rawPayload: leads.rawPayload,
    })
    .from(leads);

  return mergeMissingCanonicalLeads({
    bytes: input.bytes,
    storedLeads,
    fallbackDate: input.fallbackDate,
  });
}
