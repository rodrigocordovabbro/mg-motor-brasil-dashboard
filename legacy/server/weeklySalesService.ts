import { getDashboardCutoffDate, resolveDashboardPeriod } from "@shared/dashboardDates";
import { createHash } from "node:crypto";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { MTD_RETAIL_ORDER_LABEL } from "@shared/dashboardLabels";

import {
  leads,
  weeklySalesImports,
  weeklySalesRecords,
  type WeeklySalesImport,
} from "../drizzle/schema";
import {
  canonicalizeDealerName,
  getOfficialLeadDealers,
  getOfficialDealers,
  normalizeDealerLookupKey,
  type OfficialDealer,
} from "./dealerNormalization";
import { getDb } from "./db";
import { getDealerTargetsForCompetence } from "./dealerTargetsService";
import { LEADS_UNAVAILABLE } from "./leadsAnalytics";
import { storagePut } from "./storage";
import {
  parseWeeklySalesCsv,
  resolveWeeklySalesCanonicalDealer,
  type WeeklySalesCsvPreview,
  type WeeklySalesRow,
  type WeeklySalesWeek,
  type WeeklySalesWeekMetrics,
} from "./weeklySalesCsv";
import { parseWeeklySalesPdf } from "./weeklySalesPdf";
import { parseWeeklySalesXlsx } from "./weeklySalesXlsx";
import {
  describeWeeklySalesFile,
  resolveWeeklySalesCompetenceWithPolicy,
  type WeeklySalesCompetencePolicy,
  type WeeklySalesFileDescriptor,
} from "./weeklySalesUpload";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_HISTORY_LIMIT = 100;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
const INSERT_CHUNK_SIZE = 100;

export type WeeklySalesDealerPreviewRow = {
  sourceRowNumber: number;
  sourceName: string;
  canonicalDealer: string;
  matchStatus: "MATCHED" | "UNMATCHED";
  referenceRetail: number | null;
  referenceAchievementPercent: number | null;
  week4Retail: number | null;
  week4AchievementPercent: number | null;
};

export type WeeklySalesPreviewResult = {
  fileName: string;
  fileHash: string;
  competence: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: WeeklySalesCsvPreview["summary"] & {
    matchedDealerRows: number;
    unmatchedDealerRows: number;
  };
  dealers: WeeklySalesDealerPreviewRow[];
  unmatchedDealers: string[];
};

export type WeeklySalesImportResult = WeeklySalesPreviewResult & {
  importId: number;
  status: "COMPLETED";
  idempotent: boolean;
  rowsInserted: number;
  fileUrl: string | null;
  importedAt: number;
};

export type WeeklyLeadCounts = Record<"1" | "2" | "3" | "4" | "5", number>;

export type WeeklySalesDealerWeekMetric = WeeklySalesWeekMetrics & {
  leads: number | null;
};

export type WeeklySalesDealerMetric = {
  sourceName: string;
  dealerName: string;
  matchStatus: "MATCHED" | "UNMATCHED";
  leads: number;
  sales: number | null;
  conversionRatePercent: number | null;
  leadsPerSale: number | null;
  estimatedLeadsNeeded: number | null;
  weeks: Record<string, WeeklySalesDealerWeekMetric>;
};

export type WeeklySalesStateDealerMetric = {
  dealerName: string;
  stateCode: string;
  leads: number;
  sales: number | null;
  salesReported: boolean;
  conversionRatePercent: number | null;
  weeks: Record<string, {
    leads: number;
    sales: number | null;
    conversionRatePercent: number | null;
  }>;
};

export type WeeklySalesStateMetric = {
  stateCode: string;
  stateName: string;
  leads: number;
  sales: number;
  conversionRatePercent: number | null;
  salesCoverageLeads: number;
  salesCoveragePercent: number | null;
  officialDealers: number;
  recipientDealers: number;
  salesReportedDealers: number;
  weeks: Record<string, {
    leads: number;
    sales: number;
    conversionRatePercent: number | null;
    salesCoverageLeads: number;
    salesCoveragePercent: number | null;
    recipientDealers: number;
    salesReportedDealers: number;
  }>;
  dealers: WeeklySalesStateDealerMetric[];
};

export type WeeklySalesMetrics = {
  competence: string;
  dateFrom: string;
  dateTo: string;
  referenceWeek: WeeklySalesWeek | null;
  import: {
    id: number;
    fileName: string;
    importedBy: string;
    importedAt: number;
  } | null;
  summary: {
    dealers: number;
    matchedDealers: number;
    unmatchedDealers: number;
    dealersWithoutReferenceSales: number;
    dealersWithoutWeek4Sales: number;
    totalLeads: number;
    totalSales: number;
    matchedSales: number;
    unmatchedSales: number;
    conversionRatePercent: number | null;
    leadsPerSale: number | null;
    estimatedLeadsNeeded: number | null;
  };
  dealers: WeeklySalesDealerMetric[];
  states: WeeklySalesStateMetric[];
  targets: DealerTargetTracking | null;
};

export type DealerTargetProgress = {
  dealerName: string;
  dealerKey: string;
  stateCode: string;
  leadTarget: number;
  leadsActual: number;
  leadAchievementPercent: number;
  leadGap: number;
  salesTarget: number;
  salesActual: number | null;
  salesReported: boolean;
  salesAchievementPercent: number | null;
  salesGap: number | null;
  targetConversionRatePercent: number;
  actualConversionRatePercent: number | null;
  channelTargets: {
    google: number;
    meta: number;
    publya: number;
    webmotors: number;
    mercadoLivre: number;
    tiktok: number;
  };
};

export type DealerTargetTracking = {
  competence: string;
  source: {
    fileName: string;
    fileHash: string;
    importedBy: string;
    importedAt: number;
  };
  summary: {
    dealers: number;
    salesReportedDealers: number;
    leadTarget: number;
    leadsActual: number;
    leadAchievementPercent: number;
    leadGap: number;
    salesTarget: number;
    salesActual: number;
    salesAchievementPercent: number;
    salesGap: number;
    targetConversionRatePercent: number;
    actualConversionRatePercent: number | null;
  };
  dealers: DealerTargetProgress[];
};

type EnrichedSalesRow = WeeklySalesRow & {
  matchStatus: "MATCHED" | "UNMATCHED" | "AGGREGATE";
};

function assertCompetence(competence: string): void {
  if (!/^\d{4}-\d{2}$/.test(competence)) {
    throw new Error(`Competência de ${MTD_RETAIL_ORDER_LABEL} inválida. Use AAAA-MM.`);
  }
  const [year, month] = competence.split("-").map(Number);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) {
    throw new Error(`Competência de ${MTD_RETAIL_ORDER_LABEL} fora do intervalo permitido.`);
  }
}

function assertFileSize(bytes: Buffer): void {
  if (bytes.length === 0) throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} está vazio.`);
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} excede o limite de 5 MB.`);
  }
}

async function parseWeeklySalesFile(
  bytes: Buffer,
  kind: WeeklySalesFileDescriptor["kind"],
): Promise<WeeklySalesCsvPreview> {
  if (kind === "PDF") return parseWeeklySalesPdf(bytes);
  if (kind === "XLSX") return parseWeeklySalesXlsx(bytes);
  return parseWeeklySalesCsv(bytes);
}

function monthBounds(competence: string): { dateFrom: string; dateTo: string } {
  assertCompetence(competence);
  const [year, month] = competence.split("-").map(Number);
  const dateFrom = `${competence}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const cutoff = getDashboardCutoffDate();
  return {
    dateFrom,
    dateTo: cutoff.slice(0, 7) === competence && cutoff < monthEnd ? cutoff : monthEnd,
  };
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function decimalValue(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function buildOfficialWeeklyDealerKeys(
  dealers: readonly Pick<OfficialDealer, "name">[],
): Set<string> {
  const unavailableKey = normalizeDealerLookupKey(LEADS_UNAVAILABLE);
  return new Set(
    dealers
      .map(dealer => resolveWeeklySalesCanonicalDealer(dealer.name).canonicalDealer)
      .map(normalizeDealerLookupKey)
      .filter(key => Boolean(key) && key !== unavailableKey),
  );
}

export function resolveOfficialWeeklyDealerMatchStatus(
  canonicalDealerKey: string | null,
  officialDealerKeys: ReadonlySet<string>,
): "MATCHED" | "UNMATCHED" {
  return canonicalDealerKey && officialDealerKeys.has(canonicalDealerKey)
    ? "MATCHED"
    : "UNMATCHED";
}

const BRAZILIAN_STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

export function resolveDealerStateCode(operationalArea: string | null): string | null {
  const match = operationalArea?.trim().toUpperCase().match(/\/([A-Z]{2})$/);
  return match?.[1] ?? null;
}

export function buildWeeklySalesStateMetrics(input: {
  officialDealers: readonly Pick<OfficialDealer, "name" | "operationalArea">[];
  leadCountsByWeek: ReadonlyMap<string, WeeklyLeadCounts>;
  dealerMetrics: readonly WeeklySalesDealerMetric[];
  referenceWeek: WeeklySalesWeek;
}): WeeklySalesStateMetric[] {
  const weeks: Array<keyof WeeklyLeadCounts> = ["1", "2", "3", "4", "5"];
  const dealerMetricByKey = new Map(
    input.dealerMetrics
      .filter(dealer => dealer.matchStatus === "MATCHED")
      .map(dealer => [normalizeDealerLookupKey(dealer.dealerName), dealer] as const),
  );
  const uniqueOfficialDealers = new Map<string, Pick<OfficialDealer, "name" | "operationalArea">>();

  for (const dealer of input.officialDealers) {
    const canonical = resolveWeeklySalesCanonicalDealer(dealer.name).canonicalDealer;
    const key = normalizeDealerLookupKey(canonical);
    if (key && !uniqueOfficialDealers.has(key)) {
      uniqueOfficialDealers.set(key, { name: canonical, operationalArea: dealer.operationalArea });
    }
  }

  const byState = new Map<string, WeeklySalesStateDealerMetric[]>();
  for (const [key, dealer] of Array.from(uniqueOfficialDealers.entries())) {
    const stateCode = resolveDealerStateCode(dealer.operationalArea);
    if (!stateCode) continue;
    const leadCounts = input.leadCountsByWeek.get(key) ?? { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    const salesMetric = dealerMetricByKey.get(key);
    const dealerWeeks = Object.fromEntries(
      weeks.map(week => {
        const leadsCount = leadCounts[week];
        const sales = salesMetric?.weeks[week]?.retail ?? null;
        return [week, {
          leads: leadsCount,
          sales,
          conversionRatePercent: calculateWeeklySalesEfficiency(leadsCount, sales).conversionRatePercent,
        }];
      }),
    ) as WeeklySalesStateDealerMetric["weeks"];
    const reference = dealerWeeks[String(input.referenceWeek)];
    const row: WeeklySalesStateDealerMetric = {
      dealerName: dealer.name,
      stateCode,
      leads: reference.leads,
      sales: reference.sales,
      salesReported: reference.sales !== null,
      conversionRatePercent: reference.conversionRatePercent,
      weeks: dealerWeeks,
    };
    byState.set(stateCode, [...(byState.get(stateCode) ?? []), row]);
  }

  return Array.from(byState.entries())
    .map(([stateCode, dealers]: [string, WeeklySalesStateDealerMetric[]]) => {
      const stateWeeks = Object.fromEntries(
        weeks.map((week: keyof WeeklyLeadCounts) => {
          const leadsCount = dealers.reduce((total: number, dealer: WeeklySalesStateDealerMetric) => total + dealer.weeks[week].leads, 0);
          const reported = dealers.filter((dealer: WeeklySalesStateDealerMetric) => dealer.weeks[week].sales !== null);
          const sales = reported.reduce((total: number, dealer: WeeklySalesStateDealerMetric) => total + (dealer.weeks[week].sales ?? 0), 0);
          const salesCoverageLeads = reported.reduce((total: number, dealer: WeeklySalesStateDealerMetric) => total + dealer.weeks[week].leads, 0);
          return [week, {
            leads: leadsCount,
            sales,
            conversionRatePercent: reported.length
              ? calculateWeeklySalesEfficiency(salesCoverageLeads, sales).conversionRatePercent
              : null,
            salesCoverageLeads,
            salesCoveragePercent: leadsCount > 0 ? round((salesCoverageLeads / leadsCount) * 100) : null,
            recipientDealers: dealers.filter((dealer: WeeklySalesStateDealerMetric) => dealer.weeks[week].leads > 0).length,
            salesReportedDealers: reported.length,
          }];
        }),
      ) as WeeklySalesStateMetric["weeks"];
      const reference = stateWeeks[String(input.referenceWeek)];
      return {
        stateCode,
        stateName: BRAZILIAN_STATE_NAMES[stateCode] ?? stateCode,
        leads: reference.leads,
        sales: reference.sales,
        conversionRatePercent: reference.conversionRatePercent,
        salesCoverageLeads: reference.salesCoverageLeads,
        salesCoveragePercent: reference.salesCoveragePercent,
        officialDealers: dealers.length,
        recipientDealers: reference.recipientDealers,
        salesReportedDealers: reference.salesReportedDealers,
        weeks: stateWeeks,
        dealers: [...dealers].sort((left, right) => right.leads - left.leads || left.dealerName.localeCompare(right.dealerName, "pt-BR")),
      };
    })
    .filter(state => state.leads > 0 || state.sales > 0)
    .sort((left, right) => right.leads - left.leads || right.sales - left.sales || left.stateName.localeCompare(right.stateName, "pt-BR"));
}

async function getKnownDealerKeys(): Promise<Set<string>> {
  return buildOfficialWeeklyDealerKeys(getOfficialDealers());
}

export function getWeeklyLeadCutoffDates(
  competence: string,
  dateTo: string,
): Record<keyof WeeklyLeadCounts, string> {
  assertCompetence(competence);
  if (!dateTo.startsWith(`${competence}-`)) {
    throw new Error("A data final precisa pertencer à competência informada.");
  }
  const cappedDate = (day: number) => {
    const boundary = `${competence}-${String(day).padStart(2, "0")}`;
    return boundary < dateTo ? boundary : dateTo;
  };
  return {
    "1": cappedDate(7),
    "2": cappedDate(14),
    "3": cappedDate(21),
    "4": cappedDate(28),
    "5": dateTo,
  };
}

export function buildCumulativeWeeklyLeadCounts(
  rows: Array<{ dealerName: string | null; correctedDate: string; count: number }>,
  cutoffs: Record<keyof WeeklyLeadCounts, string>,
): Map<string, WeeklyLeadCounts> {
  const counts = new Map<string, WeeklyLeadCounts>();
  const unavailableKey = normalizeDealerLookupKey(LEADS_UNAVAILABLE);
  const weeks: Array<keyof WeeklyLeadCounts> = ["1", "2", "3", "4", "5"];

  for (const row of rows) {
    const canonical = canonicalizeDealerName(row.dealerName ?? "");
    const key = normalizeDealerLookupKey(canonical);
    if (!key || key === unavailableKey) continue;
    const current = counts.get(key) ?? { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const week of weeks) {
      if (row.correctedDate <= cutoffs[week]) current[week] += Number(row.count ?? 0);
    }
    counts.set(key, current);
  }

  return counts;
}

type WeeklySalesMetricsOptions = {
  dateFrom?: string;
  dateTo?: string;
};

function resolveWeeklyLeadPeriod(
  competence: string,
  options: WeeklySalesMetricsOptions = {},
): { dateFrom: string; dateTo: string } {
  const month = monthBounds(competence);
  const dateFrom = options.dateFrom ?? month.dateFrom;
  const dateTo = options.dateTo ?? month.dateTo;
  const period = resolveDashboardPeriod(dateFrom, dateTo);

  if (!period.dateFrom.startsWith(`${competence}-`) || !period.dateTo.startsWith(`${competence}-`)) {
    throw new Error(`O período de Leads precisa pertencer à competência mensal de ${MTD_RETAIL_ORDER_LABEL}.`);
  }

  return { dateFrom: period.dateFrom, dateTo: period.dateTo };
}

async function getLeadCountsByDealerAndWeek(
  competence: string,
  options: WeeklySalesMetricsOptions = {},
): Promise<Map<string, WeeklyLeadCounts>> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const { dateFrom, dateTo } = resolveWeeklyLeadPeriod(competence, options);
  const rows = await db
    .select({
      dealerName: leads.dealerName,
      correctedDate: leads.correctedDate,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .where(and(gte(leads.correctedDate, dateFrom), lte(leads.correctedDate, dateTo)))
    .groupBy(leads.dealerName, leads.correctedDate);

  return buildCumulativeWeeklyLeadCounts(
    rows.map(row => ({ ...row, count: Number(row.count ?? 0) })),
    getWeeklyLeadCutoffDates(competence, dateTo),
  );
}

function enrichRows(parsed: WeeklySalesCsvPreview, knownDealerKeys: Set<string>): EnrichedSalesRow[] {
  return parsed.rows.map(row => {
    if (row.rowType !== "DEALER") return { ...row, matchStatus: "AGGREGATE" as const };
    const matchStatus = resolveOfficialWeeklyDealerMatchStatus(
      row.canonicalDealerKey,
      knownDealerKeys,
    );
    return { ...row, matchStatus };
  });
}

function buildPreview(input: {
  fileName: string;
  competence: string;
  parsed: WeeklySalesCsvPreview;
  rows: EnrichedSalesRow[];
}): WeeklySalesPreviewResult {
  const dealerRows = input.rows.filter(
    (row): row is EnrichedSalesRow & { canonicalDealer: string } =>
      row.rowType === "DEALER" && Boolean(row.canonicalDealer),
  );
  const matchedDealerRows = dealerRows.filter(row => row.matchStatus === "MATCHED").length;
  const unmatchedDealerRows = dealerRows.filter(row => row.matchStatus === "UNMATCHED").length;
  const unmatchedDealers = dealerRows
    .filter(row => row.matchStatus === "UNMATCHED")
    .map(row => row.sourceName)
    .sort((left, right) => left.localeCompare(right, "pt-BR"));

  const referenceWeek = input.parsed.summary.referenceWeek;

  return {
    fileName: input.fileName,
    fileHash: input.parsed.fileHash,
    competence: input.competence,
    valid: input.parsed.errors.length === 0 && input.parsed.summary.reconciliationPassed,
    errors: input.parsed.errors,
    warnings: input.parsed.warnings,
    summary: {
      ...input.parsed.summary,
      matchedDealerRows,
      unmatchedDealerRows,
    },
    dealers: dealerRows.map(row => ({
      sourceRowNumber: row.sourceRowNumber,
      sourceName: row.sourceName,
      canonicalDealer: row.canonicalDealer,
      matchStatus: row.matchStatus as "MATCHED" | "UNMATCHED",
      referenceRetail:
        referenceWeek === null ? null : row.weeks[String(referenceWeek)]?.retail ?? null,
      referenceAchievementPercent:
        referenceWeek === null
          ? null
          : row.weeks[String(referenceWeek)]?.achievementPercent ?? null,
      week4Retail: row.weeks["4"]?.retail ?? null,
      week4AchievementPercent: row.weeks["4"]?.achievementPercent ?? null,
    })),
    unmatchedDealers,
  };
}

export async function previewWeeklySalesCsv(input: {
  fileName: string;
  bytes: Buffer;
  competence: string;
  declaredMimeType?: string | null;
}): Promise<WeeklySalesPreviewResult> {
  const file = describeWeeklySalesFile({
    fileName: input.fileName,
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
  });
  assertFileSize(input.bytes);
  assertCompetence(input.competence);
  const competence = resolveWeeklySalesCompetenceWithPolicy(file.fileName, input.competence);
  assertCompetence(competence);
  const [parsed, knownDealerKeys] = await Promise.all([
    parseWeeklySalesFile(input.bytes, file.kind),
    getKnownDealerKeys(),
  ]);
  const rows = enrichRows(parsed, knownDealerKeys);
  return buildPreview({ fileName: file.fileName, competence, parsed, rows });
}

async function findImportByIdentity(fileHash: string, competence: string): Promise<WeeklySalesImport | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [existing] = await db
    .select()
    .from(weeklySalesImports)
    .where(
      and(
        eq(weeklySalesImports.fileHash, fileHash),
        eq(weeklySalesImports.competence, competence),
      ),
    )
    .limit(1);
  return existing ?? null;
}

async function createOrResetImport(input: {
  fileName: string;
  bytes: Buffer;
  competence: string;
  actor: string;
  parsed: WeeklySalesCsvPreview;
  preview: WeeklySalesPreviewResult;
  existing: WeeklySalesImport | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();
  const values = {
    fileName: input.fileName,
    fileSizeBytes: input.bytes.length,
    competence: input.competence,
    referenceWeek: input.parsed.summary.referenceWeek ?? 4,
    status: "PROCESSING" as const,
    rowsTotal: input.parsed.summary.rowsTotal,
    dealerRows: input.parsed.summary.dealerRows,
    regionRows: input.parsed.summary.regionRows,
    totalRows: input.parsed.summary.totalRows,
    rowsInserted: 0,
    rowsInvalid: input.parsed.errors.length,
    matchedDealerRows: input.preview.summary.matchedDealerRows,
    unmatchedDealerRows: input.preview.summary.unmatchedDealerRows,
    dealersWithoutReferenceSales: input.parsed.summary.dealersWithoutReferenceSales,
    referenceDealerSalesTotal: input.parsed.summary.referenceDealerSalesTotal,
    referenceRegionSalesTotal: input.parsed.summary.referenceRegionSalesTotal,
    referenceReportedSalesTotal: input.parsed.summary.referenceReportedSalesTotal,
    dealersWithoutWeek4Sales: input.parsed.summary.dealersWithoutWeek4Sales,
    week4DealerSalesTotal: input.parsed.summary.week4DealerSalesTotal,
    week4RegionSalesTotal: input.parsed.summary.week4RegionSalesTotal,
    week4ReportedSalesTotal: input.parsed.summary.week4ReportedSalesTotal,
    reconciliationPassed: input.parsed.summary.reconciliationPassed,
    errorSummary: input.parsed.errors.length ? input.parsed.errors : null,
    importedBy: input.actor,
    createdAt: now,
    completedAt: null,
  };

  if (input.existing) {
    if (
      input.existing.status === "PROCESSING" &&
      now - input.existing.createdAt < PROCESSING_TIMEOUT_MS
    ) {
      throw new Error(`Este arquivo de ${MTD_RETAIL_ORDER_LABEL} já está sendo processado. Aguarde a conclusão.`);
    }
    await db.update(weeklySalesImports).set(values).where(eq(weeklySalesImports.id, input.existing.id));
    return input.existing.id;
  }

  await db.insert(weeklySalesImports).values({
    ...values,
    fileHash: input.parsed.fileHash,
  });
  const created = await findImportByIdentity(input.parsed.fileHash, input.competence);
  if (!created) throw new Error(`Não foi possível registrar o lote semanal de ${MTD_RETAIL_ORDER_LABEL}.`);
  return created.id;
}

async function markImportFailed(importId: number, error: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const message = error instanceof Error ? error.message : "Falha não identificada na importação.";
  await db
    .update(weeklySalesImports)
    .set({ status: "FAILED", errorSummary: [message.slice(0, 500)], completedAt: Date.now() })
    .where(eq(weeklySalesImports.id, importId));
}

export async function importWeeklySalesCsv(input: {
  fileName: string;
  bytes: Buffer;
  competence: string;
  actor: string;
  expectedFileHash?: string;
  declaredMimeType?: string | null;
  /** Uso interno: mantém a competência informada mesmo quando o nome contém outra data. */
  competencePolicy?: WeeklySalesCompetencePolicy;
  /** Uso interno: prévia reconciliada cujo hash deve ser idêntico ao arquivo original. */
  parsedOverride?: WeeklySalesCsvPreview;
  /** Uso interno: permite reprocessar um lote concluído após correção de alias, sem alterar a idempotência padrão. */
  reprocessCompleted?: boolean;
}): Promise<WeeklySalesImportResult> {
  const actor = input.actor.trim();
  if (!actor) throw new Error("Usuário responsável pela importação não identificado.");
  const file = describeWeeklySalesFile({
    fileName: input.fileName,
    bytes: input.bytes,
    declaredMimeType: input.declaredMimeType,
  });
  const fileName = file.fileName;
  assertFileSize(input.bytes);
  assertCompetence(input.competence);
  const competence = resolveWeeklySalesCompetenceWithPolicy(
    fileName,
    input.competence,
    input.competencePolicy,
  );
  assertCompetence(competence);

  const parsed = input.parsedOverride ?? (await parseWeeklySalesFile(input.bytes, file.kind));
  if (input.parsedOverride) {
    const actualFileHash = createHash("sha256").update(input.bytes).digest("hex");
    if (parsed.fileHash !== actualFileHash) {
      throw new Error("A prévia validada não pertence ao arquivo original informado.");
    }
  }
  const knownDealerKeys = await getKnownDealerKeys();
  if (input.expectedFileHash && input.expectedFileHash !== parsed.fileHash) {
    throw new Error("O arquivo mudou após a prévia. Gere uma nova prévia antes de confirmar.");
  }
  const rows = enrichRows(parsed, knownDealerKeys);
  const preview = buildPreview({ fileName, competence, parsed, rows });
  if (!preview.valid) {
    throw new Error(
      preview.errors[0] ?? `O arquivo de ${MTD_RETAIL_ORDER_LABEL} não passou na reconciliação da semana de referência.`,
    );
  }

  const existing = await findImportByIdentity(parsed.fileHash, competence);
  if (existing?.status === "COMPLETED" && !input.reprocessCompleted) {
    return {
      ...preview,
      importId: existing.id,
      status: "COMPLETED",
      idempotent: true,
      rowsInserted: 0,
      fileUrl: existing.fileUrl,
      importedAt: existing.completedAt ?? existing.createdAt,
    };
  }

  const importId = await createOrResetImport({
    fileName,
    bytes: input.bytes,
    competence,
    actor,
    parsed,
    preview,
    existing,
  });

  try {
    const stored = await storagePut(
      `weekly-sales/${competence}/${parsed.fileHash.slice(0, 12)}/${fileName}`,
      input.bytes,
      file.contentType,
    );
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    const now = Date.now();

    const rowsInserted = await db.transaction(async tx => {
      await tx.delete(weeklySalesRecords).where(eq(weeklySalesRecords.importId, importId));
      for (const rowsChunk of chunk(rows, INSERT_CHUNK_SIZE)) {
        await tx.insert(weeklySalesRecords).values(
          rowsChunk.map(row => ({
            importId,
            competence,
            sourceRowNumber: row.sourceRowNumber,
            rowType: row.rowType,
            sourceName: row.sourceName,
            sourceKey: row.sourceKey,
            canonicalDealer: row.canonicalDealer,
            canonicalDealerKey: row.canonicalDealerKey,
            matchStatus: row.matchStatus,
            recordHash: row.recordHash,
            week1Target: decimalValue(row.weeks["1"]?.target ?? null),
            week1Retail: row.weeks["1"]?.retail ?? null,
            week1Achievement: decimalValue(row.weeks["1"]?.achievementPercent ?? null),
            week2Target: decimalValue(row.weeks["2"]?.target ?? null),
            week2Retail: row.weeks["2"]?.retail ?? null,
            week2Achievement: decimalValue(row.weeks["2"]?.achievementPercent ?? null),
            week3Target: decimalValue(row.weeks["3"]?.target ?? null),
            week3Retail: row.weeks["3"]?.retail ?? null,
            week3Achievement: decimalValue(row.weeks["3"]?.achievementPercent ?? null),
            week4Target: decimalValue(row.weeks["4"]?.target ?? null),
            week4Retail: row.weeks["4"]?.retail ?? null,
            week4Achievement: decimalValue(row.weeks["4"]?.achievementPercent ?? null),
            week5Target: decimalValue(row.weeks["5"]?.target ?? null),
            week5Retail: row.weeks["5"]?.retail ?? null,
            week5Achievement: decimalValue(row.weeks["5"]?.achievementPercent ?? null),
            rawPayload: { tokens: row.tokens, weeks: row.weeks },
            createdAt: now,
          })),
        );
      }

      const [confirmed] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(weeklySalesRecords)
        .where(eq(weeklySalesRecords.importId, importId));
      const count = Number(confirmed?.count ?? 0);
      if (count !== rows.length) {
        throw new Error(`Falha de integridade: esperadas ${rows.length} linhas, confirmadas ${count}.`);
      }

      await tx
        .update(weeklySalesImports)
        .set({
          fileKey: stored.key,
          fileUrl: stored.url,
          status: "COMPLETED",
          rowsInserted: count,
          rowsInvalid: 0,
          errorSummary: null,
          completedAt: now,
        })
        .where(eq(weeklySalesImports.id, importId));
      return count;
    });

    return {
      ...preview,
      importId,
      status: "COMPLETED",
      idempotent: false,
      rowsInserted,
      fileUrl: stored.url,
      importedAt: now,
    };
  } catch (error) {
    await markImportFailed(importId, error);
    throw error;
  }
}

export async function getWeeklySalesImportHistory(limit = 20): Promise<WeeklySalesImport[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db
    .select()
    .from(weeklySalesImports)
    .orderBy(desc(weeklySalesImports.createdAt))
    .limit(Math.max(1, Math.min(MAX_HISTORY_LIMIT, limit)));
}

function toWeekMetrics(
  record: typeof weeklySalesRecords.$inferSelect,
  weeklyLeads: WeeklyLeadCounts | null,
): Record<string, WeeklySalesDealerWeekMetric> {
  const metric = (
    target: string | null,
    retail: number | null,
    achievement: string | null,
    leadsCount: number | null,
  ): WeeklySalesDealerWeekMetric => ({
    target: target === null ? null : Number(target),
    retail,
    achievementPercent: achievement === null ? null : Number(achievement),
    leads: leadsCount,
  });
  return {
    "1": metric(record.week1Target, record.week1Retail, record.week1Achievement, weeklyLeads?.["1"] ?? null),
    "2": metric(record.week2Target, record.week2Retail, record.week2Achievement, weeklyLeads?.["2"] ?? null),
    "3": metric(record.week3Target, record.week3Retail, record.week3Achievement, weeklyLeads?.["3"] ?? null),
    "4": metric(record.week4Target, record.week4Retail, record.week4Achievement, weeklyLeads?.["4"] ?? null),
    "5": metric(record.week5Target, record.week5Retail, record.week5Achievement, weeklyLeads?.["5"] ?? null),
  };
}

export function selectWeeklySalesReference(
  weeks: Record<string, WeeklySalesDealerWeekMetric>,
  referenceWeek: WeeklySalesWeek,
): { leads: number; sales: number | null } {
  const reference = weeks[String(referenceWeek)];
  return {
    leads: reference?.leads ?? 0,
    sales: reference?.retail ?? null,
  };
}

export function calculateWeeklySalesEfficiency(leadsCount: number, sales: number | null) {
  if (sales === null || leadsCount <= 0) {
    return {
      conversionRatePercent: null,
      leadsPerSale: null,
      estimatedLeadsNeeded: null,
    };
  }
  if (sales === 0) {
    return {
      conversionRatePercent: 0,
      leadsPerSale: null,
      estimatedLeadsNeeded: null,
    };
  }
  const leadsPerSale = leadsCount / sales;
  return {
    conversionRatePercent: round((sales / leadsCount) * 100),
    leadsPerSale: round(leadsPerSale),
    estimatedLeadsNeeded: Math.ceil(leadsPerSale),
  };
}

function sumNullable(values: readonly (number | null)[]): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

export function mergeCanonicalDealerMetrics(
  metrics: readonly WeeklySalesDealerMetric[],
): WeeklySalesDealerMetric[] {
  const grouped = new Map<string, WeeklySalesDealerMetric[]>();
  for (const metric of metrics) {
    const key = normalizeDealerLookupKey(metric.dealerName);
    const group = grouped.get(key) ?? [];
    group.push(metric);
    grouped.set(key, group);
  }
  return Array.from(grouped.values()).map(group => {
    if (group.length === 1) return group[0];
    const weeks: Record<string, WeeklySalesDealerWeekMetric> = {};
    for (const week of ["1", "2", "3", "4", "5"] as const) {
      const target = sumNullable(group.map(metric => metric.weeks[week]?.target ?? null));
      const retail = sumNullable(group.map(metric => metric.weeks[week]?.retail ?? null));
      const leads = Math.max(0, ...group.map(metric => metric.weeks[week]?.leads ?? 0));
      weeks[week] = {
        target,
        retail,
        achievementPercent:
          target === null || retail === null || target <= 0
            ? target === 0 && retail === 0 ? 0 : null
            : round((retail / target) * 100),
        leads,
      };
    }
    const leads = Math.max(...group.map(metric => metric.leads));
    const sales = sumNullable(group.map(metric => metric.sales));
    return {
      sourceName: Array.from(new Set(group.map(metric => metric.sourceName))).join(" + "),
      dealerName: group[0].dealerName,
      matchStatus: group.every(metric => metric.matchStatus === "MATCHED") ? "MATCHED" : "UNMATCHED",
      leads,
      sales,
      ...calculateWeeklySalesEfficiency(leads, sales),
      weeks,
    };
  });
}

type DealerMonthlyTargetRow = Awaited<ReturnType<typeof getDealerTargetsForCompetence>>[number];

export function buildDealerTargetTracking(input: {
  competence: string;
  targets: readonly DealerMonthlyTargetRow[];
  leadCountsByWeek: ReadonlyMap<string, WeeklyLeadCounts>;
  dealerMetrics: readonly WeeklySalesDealerMetric[];
  referenceWeek: WeeklySalesWeek;
}): DealerTargetTracking | null {
  if (input.targets.length === 0) return null;
  const dealerMetricsByKey = new Map(
    input.dealerMetrics
      .filter(dealer => dealer.matchStatus === "MATCHED")
      .map(dealer => [normalizeDealerLookupKey(dealer.dealerName), dealer] as const),
  );
  const dealers = input.targets.map(target => {
    const leadsActual = input.leadCountsByWeek.get(target.canonicalDealerKey)?.[String(input.referenceWeek) as keyof WeeklyLeadCounts] ?? 0;
    const salesMetric = dealerMetricsByKey.get(target.canonicalDealerKey);
    const salesActual = salesMetric?.sales ?? null;
    const salesReported = salesActual !== null;
    return {
      dealerName: target.canonicalDealer,
      dealerKey: target.canonicalDealerKey,
      stateCode: target.stateCode,
      leadTarget: target.leadTarget,
      leadsActual,
      leadAchievementPercent: target.leadTarget > 0 ? round((leadsActual / target.leadTarget) * 100) : 0,
      leadGap: target.leadTarget - leadsActual,
      salesTarget: target.salesTarget,
      salesActual,
      salesReported,
      salesAchievementPercent: salesReported && target.salesTarget > 0
        ? round((salesActual / target.salesTarget) * 100)
        : null,
      salesGap: salesReported ? target.salesTarget - salesActual : null,
      targetConversionRatePercent: target.leadTarget > 0
        ? round((target.salesTarget / target.leadTarget) * 100)
        : 0,
      actualConversionRatePercent: calculateWeeklySalesEfficiency(leadsActual, salesActual).conversionRatePercent,
      channelTargets: target.channelTargets,
    } satisfies DealerTargetProgress;
  });
  const leadTarget = dealers.reduce((sum, dealer) => sum + dealer.leadTarget, 0);
  const leadsActual = dealers.reduce((sum, dealer) => sum + dealer.leadsActual, 0);
  const salesTarget = dealers.reduce((sum, dealer) => sum + dealer.salesTarget, 0);
  const salesActual = dealers.reduce((sum, dealer) => sum + (dealer.salesActual ?? 0), 0);
  const first = input.targets[0];
  return {
    competence: input.competence,
    source: {
      fileName: first.sourceFileName,
      fileHash: first.sourceFileHash,
      importedBy: first.importedBy,
      importedAt: Math.max(...input.targets.map(target => target.updatedAt)),
    },
    summary: {
      dealers: dealers.length,
      salesReportedDealers: dealers.filter(dealer => dealer.salesReported).length,
      leadTarget,
      leadsActual,
      leadAchievementPercent: leadTarget > 0 ? round((leadsActual / leadTarget) * 100) : 0,
      leadGap: leadTarget - leadsActual,
      salesTarget,
      salesActual,
      salesAchievementPercent: salesTarget > 0 ? round((salesActual / salesTarget) * 100) : 0,
      salesGap: salesTarget - salesActual,
      targetConversionRatePercent: leadTarget > 0 ? round((salesTarget / leadTarget) * 100) : 0,
      actualConversionRatePercent: calculateWeeklySalesEfficiency(leadsActual, salesActual).conversionRatePercent,
    },
    dealers: dealers.sort(
      (left, right) =>
        right.leadAchievementPercent - left.leadAchievementPercent ||
        right.leadsActual - left.leadsActual ||
        left.dealerName.localeCompare(right.dealerName, "pt-BR"),
    ),
  };
}

export async function getWeeklySalesMetrics(
  competence: string,
  options: WeeklySalesMetricsOptions = {},
): Promise<WeeklySalesMetrics> {
  assertCompetence(competence);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const { dateFrom, dateTo } = resolveWeeklyLeadPeriod(competence, options);
  const [latestImport] = await db
    .select()
    .from(weeklySalesImports)
    .where(
      and(
        eq(weeklySalesImports.competence, competence),
        eq(weeklySalesImports.status, "COMPLETED"),
      ),
    )
    .orderBy(desc(weeklySalesImports.completedAt), desc(weeklySalesImports.createdAt))
    .limit(1);

  if (!latestImport) {
    return {
      competence,
      dateFrom,
      dateTo,
      referenceWeek: null,
      import: null,
      summary: {
        dealers: 0,
        matchedDealers: 0,
        unmatchedDealers: 0,
        dealersWithoutReferenceSales: 0,
        dealersWithoutWeek4Sales: 0,
        totalLeads: 0,
        totalSales: 0,
        matchedSales: 0,
        unmatchedSales: 0,
        conversionRatePercent: null,
        leadsPerSale: null,
        estimatedLeadsNeeded: null,
      },
      dealers: [],
      states: [],
      targets: null,
    };
  }

  const [records, leadCountsByWeek, targetRows] = await Promise.all([
    db
      .select()
      .from(weeklySalesRecords)
      .where(
        and(
          eq(weeklySalesRecords.importId, latestImport.id),
          eq(weeklySalesRecords.rowType, "DEALER"),
        ),
      ),
    getLeadCountsByDealerAndWeek(competence, { dateFrom, dateTo }),
    getDealerTargetsForCompetence(competence),
  ]);

  const referenceWeek =
    latestImport.referenceWeek >= 1 && latestImport.referenceWeek <= 5
      ? (latestImport.referenceWeek as WeeklySalesWeek)
      : 4;
  const officialDealerKeys = buildOfficialWeeklyDealerKeys(getOfficialDealers());
  const dealerRows = records
    .map(record => {
      const currentCanonicalDealer = resolveWeeklySalesCanonicalDealer(record.sourceName).canonicalDealer;
      const key = normalizeDealerLookupKey(currentCanonicalDealer);
      const matchStatus = resolveOfficialWeeklyDealerMatchStatus(
        key,
        officialDealerKeys,
      );
      const weeklyLeads =
        matchStatus === "MATCHED"
          ? (leadCountsByWeek.get(key) ?? { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 })
          : null;
      const weeks = toWeekMetrics(record, weeklyLeads);
      const { leads: leadsCount, sales } = selectWeeklySalesReference(weeks, referenceWeek);
      const efficiency = calculateWeeklySalesEfficiency(leadsCount, sales);
      return {
        sourceName: record.sourceName,
        dealerName: currentCanonicalDealer,
        matchStatus,
        leads: leadsCount,
        sales,
        ...efficiency,
        weeks,
      } satisfies WeeklySalesDealerMetric;
    });
  const dealers = mergeCanonicalDealerMetrics(dealerRows)
    .sort(
      (left, right) =>
        (right.sales ?? -1) - (left.sales ?? -1) ||
        left.dealerName.localeCompare(right.dealerName, "pt-BR"),
    );

  const matchedDealers = dealers.filter(dealer => dealer.matchStatus === "MATCHED");
  const unmatchedDealers = dealers.filter(dealer => dealer.matchStatus === "UNMATCHED");
  const totalLeads = matchedDealers.reduce((total, dealer) => total + dealer.leads, 0);
  const matchedSales = matchedDealers.reduce((total, dealer) => total + (dealer.sales ?? 0), 0);
  const unmatchedSales = unmatchedDealers.reduce((total, dealer) => total + (dealer.sales ?? 0), 0);
  const totalSales = matchedSales + unmatchedSales;
  const overallEfficiency = calculateWeeklySalesEfficiency(totalLeads, matchedSales);
  const states = buildWeeklySalesStateMetrics({
    officialDealers: getOfficialLeadDealers(),
    leadCountsByWeek,
    dealerMetrics: dealers,
    referenceWeek,
  });
  const targets = buildDealerTargetTracking({
    competence,
    targets: targetRows,
    leadCountsByWeek,
    dealerMetrics: dealers,
    referenceWeek,
  });

  return {
    competence,
    dateFrom,
    dateTo,
    referenceWeek,
    import: {
      id: latestImport.id,
      fileName: latestImport.fileName,
      importedBy: latestImport.importedBy,
      importedAt: latestImport.completedAt ?? latestImport.createdAt,
    },
    summary: {
      dealers: dealers.length,
      matchedDealers: matchedDealers.length,
      unmatchedDealers: unmatchedDealers.length,
      dealersWithoutReferenceSales: dealers.filter(dealer => dealer.sales === null).length,
      dealersWithoutWeek4Sales: dealers.filter(dealer => dealer.weeks["4"]?.retail === null).length,
      totalLeads,
      totalSales,
      matchedSales,
      unmatchedSales,
      ...overallEfficiency,
    },
    dealers,
    states,
    targets,
  };
}
