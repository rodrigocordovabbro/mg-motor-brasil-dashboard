import { parseLeadCsv, type NormalizedLeadRecord } from "./leadsCsv";
import { isLeadChannelActiveOnDate } from "./leadsService";

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

export const SEPTEMBER_JULY_LEAD_ADJUSTMENT = {
  adjustmentKey: "september-2026-july-carryover-250",
  requestedBy: "user-requested-manual-adjustment",
  sourceDateFrom: "2026-07-01",
  sourceDateTo: "2026-07-31",
  targetDates: ["2026-09-28", "2026-09-29", "2026-09-30"],
  requestedCount: 250,
  note: "Cópias adicionais solicitadas, preservando a ocorrência original de julho e a origem de canal.",
} as const;

type CountMap = Record<string, number>;

export type LeadDateAdjustmentResult = {
  bytes: Buffer;
  adjustmentKey: string;
  requestedCount: number;
  appliedCount: number;
  sourceDateFrom: string;
  sourceDateTo: string;
  targetDates: readonly string[];
  channelCounts: CountMap;
  sourceChannelCounts: CountMap;
  dailyCounts: CountMap;
};

function increment(counter: Map<string, number>, value: string): void {
  counter.set(value, (counter.get(value) ?? 0) + 1);
}

function asSortedObject(counter: Map<string, number>): CountMap {
  return Object.fromEntries(
    Array.from(counter.entries()).sort(
      ([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount || left.localeCompare(right, "pt-BR"),
    ),
  );
}

function formatBrDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Data de ajuste inválida: ${value}`);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function escapeCsv(value: string): string {
  const normalized = value ?? "";
  return /[",\n\r]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

function outputRow(record: NormalizedLeadRecord, targetDate: string): string {
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
    formatBrDate(targetDate),
    payload.correctedDealer,
    payload.sourceChannel ?? payload.channel,
  ];
  return values.map(escapeCsv).join(",");
}

function proportionalAllocation(groups: Map<string, NormalizedLeadRecord[]>, target: number): Map<string, number> {
  const total = Array.from(groups.values()).reduce((sum, rows) => sum + rows.length, 0);
  if (target > total) {
    throw new Error(
      `Ajuste requer ${target.toLocaleString("pt-BR")} Leads, mas somente ${total.toLocaleString("pt-BR")} são elegíveis.`,
    );
  }

  const allocation = new Map<string, number>();
  const fractions = Array.from(groups.entries()).map(([channel, rows]) => {
    const raw = (rows.length / total) * target;
    const floor = Math.floor(raw);
    allocation.set(channel, floor);
    return { channel, fraction: raw - floor };
  });
  let remaining = target - Array.from(allocation.values()).reduce((sum, value) => sum + value, 0);
  for (const { channel } of fractions.sort((left, right) => right.fraction - left.fraction || left.channel.localeCompare(right.channel, "pt-BR"))) {
    if (!remaining) break;
    allocation.set(channel, (allocation.get(channel) ?? 0) + 1);
    remaining -= 1;
  }
  return allocation;
}

function isEligibleForSeptember(record: NormalizedLeadRecord): boolean {
  const sourceChannel = record.sourceChannel || record.channel;
  return SEPTEMBER_JULY_LEAD_ADJUSTMENT.targetDates.every(date =>
    isLeadChannelActiveOnDate(sourceChannel, date),
  );
}

export function applySeptemberJulyLeadAdjustment(input: { bytes: Buffer }): LeadDateAdjustmentResult {
  const parsed = parseLeadCsv(input.bytes, SEPTEMBER_JULY_LEAD_ADJUSTMENT.targetDates.at(-1)!);
  const groups = new Map<string, NormalizedLeadRecord[]>();

  for (const record of parsed.records) {
    if (
      record.correctedDate < SEPTEMBER_JULY_LEAD_ADJUSTMENT.sourceDateFrom ||
      record.correctedDate > SEPTEMBER_JULY_LEAD_ADJUSTMENT.sourceDateTo ||
      !isEligibleForSeptember(record)
    ) {
      continue;
    }
    const sourceChannel = record.sourceChannel || record.channel;
    const rows = groups.get(sourceChannel) ?? [];
    rows.push(record);
    groups.set(sourceChannel, rows);
  }

  const allocation = proportionalAllocation(groups, SEPTEMBER_JULY_LEAD_ADJUSTMENT.requestedCount);
  const selected = Array.from(groups.entries())
    .flatMap(([channel, rows]) =>
      [...rows]
        .sort((left, right) =>
          left.contentHash.localeCompare(right.contentHash) || left.sourceRowNumber - right.sourceRowNumber,
        )
        .slice(0, allocation.get(channel) ?? 0),
    )
    .sort((left, right) =>
      left.contentHash.localeCompare(right.contentHash) || left.sourceRowNumber - right.sourceRowNumber,
    );

  if (selected.length !== SEPTEMBER_JULY_LEAD_ADJUSTMENT.requestedCount) {
    throw new Error("A seleção do ajuste não reconciliou com a quantidade solicitada.");
  }

  const channelCounts = new Map<string, number>();
  const sourceChannelCounts = new Map<string, number>();
  const dailyCounts = new Map<string, number>();
  const additions = selected.map((record, index) => {
    const targetDate = SEPTEMBER_JULY_LEAD_ADJUSTMENT.targetDates[index % SEPTEMBER_JULY_LEAD_ADJUSTMENT.targetDates.length]!;
    increment(channelCounts, record.channel);
    increment(sourceChannelCounts, record.sourceChannel || record.channel);
    increment(dailyCounts, targetDate);
    return outputRow(record, targetDate);
  });

  const baseCsv = input.bytes.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const [header] = baseCsv.split("\n", 1);
  if (header !== LEAD_CSV_HEADERS.join(",")) {
    throw new Error("Cabeçalho do CSV canônico não corresponde ao contrato de Leads.");
  }
  const bytes = Buffer.from(`\uFEFF${baseCsv}\n${additions.join("\n")}\n`, "utf8");
  const adjusted = parseLeadCsv(bytes, SEPTEMBER_JULY_LEAD_ADJUSTMENT.targetDates.at(-1)!);
  if (adjusted.invalidRows !== parsed.invalidRows || adjusted.records.length !== parsed.records.length + selected.length) {
    throw new Error("O ajuste de competência não reconciliou com o CSV canônico.");
  }

  return {
    bytes,
    adjustmentKey: SEPTEMBER_JULY_LEAD_ADJUSTMENT.adjustmentKey,
    requestedCount: SEPTEMBER_JULY_LEAD_ADJUSTMENT.requestedCount,
    appliedCount: selected.length,
    sourceDateFrom: SEPTEMBER_JULY_LEAD_ADJUSTMENT.sourceDateFrom,
    sourceDateTo: SEPTEMBER_JULY_LEAD_ADJUSTMENT.sourceDateTo,
    targetDates: SEPTEMBER_JULY_LEAD_ADJUSTMENT.targetDates,
    channelCounts: asSortedObject(channelCounts),
    sourceChannelCounts: asSortedObject(sourceChannelCounts),
    dailyCounts: asSortedObject(dailyCounts),
  };
}
