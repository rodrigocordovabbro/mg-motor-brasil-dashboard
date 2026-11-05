import { and, asc, gte, lte } from "drizzle-orm";
import { metaBaseLeadDailyMetrics } from "../drizzle/schema";
import { getDb } from "./db";

export const META_BASE_TIME_ZONE = "America/Sao_Paulo";

type MetaBaseLeadDailyMetric = {
  date: string;
  sourceRows: number;
  uniqueLeadIds: number;
};

export type MetaBaseLeadMetricsInput = {
  runLabel: string;
  daily: MetaBaseLeadDailyMetric[];
  refreshedAt?: number;
};

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("A métrica Meta precisa usar data no formato AAAA-MM-DD.");
  }
}

export function normalizeMetaBaseDailyMetrics(daily: MetaBaseLeadDailyMetric[]) {
  const byDate = new Map<string, MetaBaseLeadDailyMetric>();
  for (const item of daily) {
    assertIsoDate(item.date);
    const sourceRows = Math.max(0, Math.trunc(item.sourceRows));
    const uniqueLeadIds = Math.max(0, Math.trunc(item.uniqueLeadIds));
    if (uniqueLeadIds > sourceRows) {
      throw new Error("Identificadores únicos não podem superar as linhas de origem Meta.");
    }
    byDate.set(item.date, { date: item.date, sourceRows, uniqueLeadIds });
  }
  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Persiste somente a série agregada da aba Meta da planilha-base.
 * Nenhum dado pessoal do lead é armazenado nesta tabela.
 */
export async function replaceMetaBaseLeadDailyMetrics(input: MetaBaseLeadMetricsInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const daily = normalizeMetaBaseDailyMetrics(input.daily);
  const now = input.refreshedAt ?? Date.now();

  await db.transaction(async tx => {
    await tx.delete(metaBaseLeadDailyMetrics);
    if (!daily.length) return;
    await tx.insert(metaBaseLeadDailyMetrics).values(
      daily.map(item => ({
        metricDate: item.date,
        sourceRows: item.sourceRows,
        uniqueLeadIds: item.uniqueLeadIds,
        sourceRunLabel: input.runLabel,
        sourceTimeZone: META_BASE_TIME_ZONE,
        refreshedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
  });

  return { metricCount: daily.length, refreshedAt: now };
}

export async function getMetaBaseLeadMetrics(dateFrom: string, dateTo: string) {
  assertIsoDate(dateFrom);
  assertIsoDate(dateTo);
  if (dateFrom > dateTo) throw new Error("A data inicial precisa ser anterior ou igual à data final.");

  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db
    .select()
    .from(metaBaseLeadDailyMetrics)
    .where(
      and(
        gte(metaBaseLeadDailyMetrics.metricDate, dateFrom),
        lte(metaBaseLeadDailyMetrics.metricDate, dateTo),
      ),
    )
    .orderBy(asc(metaBaseLeadDailyMetrics.metricDate));

  const total = rows.reduce((sum, row) => sum + Number(row.sourceRows), 0);
  return {
    source: "BASE_LEADS_META" as const,
    sourceLabel: "Planilha-base de Leads — aba Meta",
    dateField: "created_time",
    timeZone: META_BASE_TIME_ZONE,
    total,
    dataThroughDate: rows.at(-1)?.metricDate ?? null,
    refreshedAt: rows.at(-1)?.refreshedAt ?? null,
    daily: rows.map(row => ({
      date: row.metricDate,
      leads: Number(row.sourceRows),
      uniqueLeadIds: Number(row.uniqueLeadIds),
    })),
  };
}
