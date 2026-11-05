import {
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "@shared/dashboardDates";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { leadImports, leadMonthlyGoals, leads, type LeadMonthlyGoal } from "../drizzle/schema";
import { getDb } from "./db";
import {
  buildLeadAnalytics,
  endOfUtcMonth,
  resolveLeadReportingChannel,
  startOfUtcMonth,
  type LeadAnalytics,
  type LeadAnalyticsRow,
  type LeadChannelTargetMap,
} from "./leadsAnalytics";
import {
  getDealerChannelTargetSummary,
  type DealerChannelTargetSummary,
} from "./dealerTargetsService";

const MAX_ANALYTICS_RANGE_DAYS = 370;
export const UOL_LEAD_CHANNEL_LAST_ACTIVE_DATE = "2026-07-31";
export const SEPTEMBER_HIDDEN_LEAD_CHANNELS = ["TIKTOK", "INTERLAGOS"] as const;
export const SEPTEMBER_LEAD_CHANNEL_HIDE_FROM = "2026-09-01";

export function isLeadChannelActiveOnDate(channel: string, date: string): boolean {
  const normalizedChannel = channel.trim().toLocaleUpperCase("pt-BR");
  if (normalizedChannel === "UOL") return date <= UOL_LEAD_CHANNEL_LAST_ACTIVE_DATE;
  return !(
    SEPTEMBER_HIDDEN_LEAD_CHANNELS.includes(
      normalizedChannel as (typeof SEPTEMBER_HIDDEN_LEAD_CHANNELS)[number],
    ) && date >= SEPTEMBER_LEAD_CHANNEL_HIDE_FROM
  );
}

export function filterLeadRowsByChannelLifecycle<
  T extends Pick<LeadAnalyticsRow, "channel" | "correctedDate"> & Partial<Pick<LeadAnalyticsRow, "sourceChannel">>,
>(
  rows: T[],
): T[] {
  return rows.filter(row =>
    isLeadChannelActiveOnDate(resolveLeadReportingChannel(row), row.correctedDate),
  );
}

export function filterExpectedLeadChannelsByDate(channels: string[], date: string): string[] {
  return channels.filter(
    channel =>
      channel.trim().toLocaleUpperCase("pt-BR") !== "CAMPANHA URBAN" &&
      isLeadChannelActiveOnDate(channel, date),
  );
}

function assertDateRange(dateFrom: string, dateTo: string): void {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from.toISOString().slice(0, 10) !== dateFrom ||
    to.toISOString().slice(0, 10) !== dateTo
  ) {
    throw new Error("Informe datas válidas no formato AAAA-MM-DD.");
  }
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days < 1) throw new Error("A data inicial precisa ser anterior ou igual à data final.");
  if (days > MAX_ANALYTICS_RANGE_DAYS) {
    throw new Error(`O intervalo máximo para análise é de ${MAX_ANALYTICS_RANGE_DAYS} dias.`);
  }
}

export async function getLeadDataBounds(): Promise<{
  dateFrom: string | null;
  dateTo: string | null;
  totalLeads: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const cutoffDate = getDashboardCutoffDate();
  const [row] = await db
    .select({
      dateFrom: sql<string | null>`min(${leads.correctedDate})`,
      dateTo: sql<string | null>`max(${leads.correctedDate})`,
      totalLeads: sql<number>`count(*)`,
    })
    .from(leads)
    .where(lte(leads.correctedDate, cutoffDate));
  const dateFrom = row?.dateFrom ?? null;
  return {
    dateFrom,
    dateTo: dateFrom ? cutoffDate : null,
    totalLeads: Number(row?.totalLeads ?? 0),
  };
}

export async function getLeadMonthlyGoal(competence: string): Promise<LeadMonthlyGoal | null> {
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competência mensal inválida.");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [goal] = await db
    .select()
    .from(leadMonthlyGoals)
    .where(eq(leadMonthlyGoals.competencia, competence))
    .limit(1);
  return goal ?? null;
}

export async function upsertLeadMonthlyGoal(input: {
  competence: string;
  goalCount: number;
  actor: string;
}): Promise<LeadMonthlyGoal> {
  if (!/^\d{4}-\d{2}$/.test(input.competence)) throw new Error("Competência mensal inválida.");
  if (!Number.isInteger(input.goalCount) || input.goalCount < 1 || input.goalCount > 100_000_000) {
    throw new Error("A meta mensal precisa ser um inteiro entre 1 e 100.000.000.");
  }
  const actor = input.actor.trim();
  if (!actor) throw new Error("Usuário responsável pela alteração não identificado.");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();

  await db
    .insert(leadMonthlyGoals)
    .values({
      competencia: input.competence,
      goalCount: input.goalCount,
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        goalCount: input.goalCount,
        updatedBy: actor,
        updatedAt: now,
      },
    });

  const goal = await getLeadMonthlyGoal(input.competence);
  if (!goal) throw new Error("Não foi possível salvar a meta mensal de Leads.");
  return goal;
}

async function getLeadRows(dateFrom: string, dateTo: string): Promise<LeadAnalyticsRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db
    .select({
      correctedDate: leads.correctedDate,
      channel: leads.channel,
      sourceChannel: leads.sourceChannel,
      model: leads.model,
      region: leads.region,
      dealerName: leads.dealerName,
    })
    .from(leads)
    .where(and(gte(leads.correctedDate, dateFrom), lte(leads.correctedDate, dateTo)))
    .orderBy(asc(leads.correctedDate), asc(leads.id));
  return filterLeadRowsByChannelLifecycle(rows);
}

async function getExpectedLeadChannels(dateTo: string): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const rows = await db
    .selectDistinct({ channel: leads.channel, sourceChannel: leads.sourceChannel })
    .from(leads)
    .where(lte(leads.correctedDate, dateTo))
    .orderBy(asc(leads.channel));
  return filterExpectedLeadChannelsByDate(
    rows.map(resolveLeadReportingChannel).filter(Boolean),
    dateTo,
  );
}

async function getLatestLeadImportAt(): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [latestImport] = await db
    .select({ createdAt: leadImports.createdAt, completedAt: leadImports.completedAt })
    .from(leadImports)
    .orderBy(desc(leadImports.createdAt))
    .limit(1);
  const latestAt = latestImport?.completedAt ?? latestImport?.createdAt;
  return latestAt ? new Date(latestAt).toISOString() : null;
}

export function buildLeadChannelTargetDefinitions(
  summary: DealerChannelTargetSummary | null,
): LeadChannelTargetMap {
  if (!summary) return {};
  const targets = summary.channelTargets;
  return {
    Site: {
      target: targets.google + targets.publya,
      targetLabel: "Google + Publya",
      sourceChannels: ["Site"],
    },
    Meta: { target: targets.meta, targetLabel: "Meta", sourceChannels: ["Meta"] },
    Webmotors: {
      target: targets.webmotors,
      targetLabel: "Webmotors",
      sourceChannels: ["Webmotors"],
    },
    "Mercado Livre": {
      target: targets.mercadoLivre,
      targetLabel: "Mercado Livre",
      sourceChannels: ["Mercado Livre"],
    },
    TikTok: { target: targets.tiktok, targetLabel: "TikTok", sourceChannels: ["TikTok"] },
  };
}

export async function getLeadAnalytics(input: {
  dateFrom: string;
  dateTo: string;
}): Promise<LeadAnalytics & { dateFrom: string; dateTo: string; metadata: { updatedAt: string | null } }> {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo);
  assertDateRange(period.dateFrom, period.dateTo);
  const competence = period.dateTo.slice(0, 7);
  const monthStart = startOfUtcMonth(period.dateTo);
  const monthEnd = endOfUtcMonth(period.dateTo);
  const pacingAsOfDate = monthEnd < period.cutoffDate ? monthEnd : period.cutoffDate;
  const [rows, pacingRows, channelUpdateRows, goal, updatedAt, expectedChannels, channelTargets] = await Promise.all([
    getLeadRows(period.dateFrom, period.dateTo),
    getLeadRows(monthStart, pacingAsOfDate),
    getLeadRows(period.cutoffDate, period.cutoffDate),
    getLeadMonthlyGoal(competence),
    getLatestLeadImportAt(),
    getExpectedLeadChannels(period.cutoffDate),
    getDealerChannelTargetSummary(competence),
  ]);

  return {
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    metadata: { updatedAt },
    ...buildLeadAnalytics({
      rows,
      pacingRows,
      channelTargetRows: pacingRows,
      pacingAsOfDate,
      channelUpdateRows,
      channelUpdateDate: period.cutoffDate,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      competence,
      goal: goal?.goalCount ?? null,
      expectedChannels,
      channelTargetDefinitions: buildLeadChannelTargetDefinitions(channelTargets),
      channelTargetSummary: channelTargets
        ? {
            totalLeadTarget: channelTargets.totalLeadTarget,
            totalChannelTarget: channelTargets.totalChannelTarget,
            channelDifference: channelTargets.channelDifference,
          }
        : null,
    }),
  };
}
