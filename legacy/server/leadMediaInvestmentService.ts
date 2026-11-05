import { loadDashboardData } from "./dashboardService";
import { loadMetaAdsData } from "./metaAdsService";
import { loadTikTokAdsData } from "./tiktokAdsService";

export type PaidMediaChannel = "Site" | "Meta" | "TikTok";
export type LeadMediaInvestmentChannel =
  | PaidMediaChannel
  | "Display"
  | "YouTube"
  | "Webmotors"
  | "Mercado Livre";
export type LeadSourceInvestmentChannel =
  | PaidMediaChannel
  | "Webmotors"
  | "Mercado Livre";
export type PaidMediaSourceStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

export const AUGUST_META_MONTHLY_BUDGET = 187_200;
export const AUGUST_META_BUDGET_CALENDAR_DAYS = 31;
export const AUGUST_NET_MEDIA_MONTHLY_TOTAL = 1_008_000;
const AUGUST_START = "2026-08-01";
const AUGUST_END = "2026-08-31";

const AUGUST_NET_MEDIA_CHANNELS: ReadonlyArray<{
  channel: LeadMediaInvestmentChannel;
  leadChannel: LeadSourceInvestmentChannel | null;
  platform: string;
  monthlyNetInvestment: number;
}> = [
  { channel: "Site", leadChannel: "Site", platform: "Google Ads", monthlyNetInvestment: 412_800 },
  { channel: "Meta", leadChannel: "Meta", platform: "Meta Ads", monthlyNetInvestment: 187_200 },
  { channel: "TikTok", leadChannel: "TikTok", platform: "TikTok Ads", monthlyNetInvestment: 28_800 },
  { channel: "Display", leadChannel: null, platform: "Publya Display", monthlyNetInvestment: 98_599.97 },
  { channel: "YouTube", leadChannel: null, platform: "YouTube", monthlyNetInvestment: 25_386.95 },
  { channel: "Webmotors", leadChannel: "Webmotors", platform: "Webmotors", monthlyNetInvestment: 178_413.08 },
  { channel: "Mercado Livre", leadChannel: "Mercado Livre", platform: "Mercado Livre", monthlyNetInvestment: 76_800 },
];

export type MetaBudgetPlan = {
  competence: "2026-08";
  monthlyBudget: number;
  calendarDays: number;
  dateFrom: string;
  dateTo: string;
  elapsedDays: number;
  dailyBudget: number;
  periodBudget: number;
};

export type AugustNetMediaPlan = {
  competence: "2026-08";
  monthlyNetInvestment: number;
  calendarDays: number;
  dateFrom: string;
  dateTo: string;
  elapsedDays: number;
  periodNetInvestment: number;
  channels: Array<{
    channel: LeadMediaInvestmentChannel;
    leadChannel: LeadSourceInvestmentChannel | null;
    platform: string;
    monthlyNetInvestment: number;
    periodNetInvestment: number;
  }>;
};

export type PaidMediaMeasurement = {
  channel: LeadMediaInvestmentChannel;
  leadChannel?: LeadSourceInvestmentChannel | null;
  platform: string;
  investment: number | null;
  source: string | null;
  updatedAt: string | null;
  dataThroughDate: string | null;
  status: PaidMediaSourceStatus;
  error: string | null;
};

export type LeadMediaInvestmentReference = {
  dateFrom: string;
  dateTo: string;
  formula:
    | "CHANNEL_INVESTMENT_DIVIDED_BY_CHANNEL_LEADS"
    | "AUGUST_META_MONTHLY_BUDGET_RATE_DIVIDED_BY_CALENDAR_DAYS"
    | "AUGUST_NET_MEDIA_PLAN_RATE_DIVIDED_BY_CALENDAR_DAYS";
  totalInvestment: number | null;
  availableInvestment: number;
  attributableInvestment: number;
  paidMediaLeads: number;
  estimatedOverallCpl: number | null;
  allSourcesAvailable: boolean;
  metaBudgetPlan: MetaBudgetPlan | null;
  netMediaPlan: AugustNetMediaPlan | null;
  channels: Array<
    PaidMediaMeasurement & {
      leadChannel: LeadSourceInvestmentChannel | null;
      leads: number;
      referenceCpl: number | null;
    }
  >;
};

type PaidMediaMeasurements = Record<PaidMediaChannel, PaidMediaMeasurement>;

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function unavailableMeasurement(
  channel: PaidMediaChannel,
  platform: string,
  error: unknown,
): PaidMediaMeasurement {
  return {
    channel,
    leadChannel: channel,
    platform,
    investment: null,
    source: null,
    updatedAt: null,
    dataThroughDate: null,
    status: "UNAVAILABLE",
    error: errorMessage(error),
  };
}

function statusForCoverage(dataThroughDate: string | null, dateTo: string): PaidMediaSourceStatus {
  if (!dataThroughDate) return "PARTIAL";
  return dataThroughDate >= dateTo ? "AVAILABLE" : "PARTIAL";
}

function countCalendarDays(dateFrom: string, dateTo: string) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function getAugustMetaBudgetPlan(dateFrom: string, dateTo: string): MetaBudgetPlan | null {
  if (dateFrom < AUGUST_START || dateTo > AUGUST_END || dateFrom > dateTo) return null;
  const elapsedDays = countCalendarDays(dateFrom, dateTo);
  return {
    competence: "2026-08",
    monthlyBudget: AUGUST_META_MONTHLY_BUDGET,
    calendarDays: AUGUST_META_BUDGET_CALENDAR_DAYS,
    dateFrom,
    dateTo,
    elapsedDays,
    dailyBudget: round(AUGUST_META_MONTHLY_BUDGET / AUGUST_META_BUDGET_CALENDAR_DAYS),
    periodBudget: round(
      (AUGUST_META_MONTHLY_BUDGET * elapsedDays) / AUGUST_META_BUDGET_CALENDAR_DAYS,
    ),
  };
}

export function getAugustNetMediaPlan(dateFrom: string, dateTo: string): AugustNetMediaPlan | null {
  if (dateFrom < AUGUST_START || dateTo > AUGUST_END || dateFrom > dateTo) return null;
  const elapsedDays = countCalendarDays(dateFrom, dateTo);
  const channels = AUGUST_NET_MEDIA_CHANNELS.map(item => ({
    ...item,
    periodNetInvestment: round(
      (item.monthlyNetInvestment * elapsedDays) / AUGUST_META_BUDGET_CALENDAR_DAYS,
    ),
  }));
  return {
    competence: "2026-08",
    monthlyNetInvestment: AUGUST_NET_MEDIA_MONTHLY_TOTAL,
    calendarDays: AUGUST_META_BUDGET_CALENDAR_DAYS,
    dateFrom,
    dateTo,
    elapsedDays,
    periodNetInvestment: round(
      channels.reduce((sum, item) => sum + item.periodNetInvestment, 0),
    ),
    channels,
  };
}

export function applyAugustMetaBudget(
  measurements: PaidMediaMeasurements,
  plan: MetaBudgetPlan | null,
): PaidMediaMeasurements {
  if (!plan) return measurements;
  return {
    ...measurements,
    Meta: {
      ...measurements.Meta,
      investment: plan.periodBudget,
      source: "august-meta-budget-plan",
      dataThroughDate: plan.dateTo,
      status: "AVAILABLE",
      error: null,
    },
  };
}

export async function loadPaidMediaInvestmentMeasurements(
  dateFrom: string,
  dateTo: string,
): Promise<PaidMediaMeasurements> {
  const [googleResult, metaResult, tiktokResult] = await Promise.allSettled([
    loadDashboardData(dateFrom, dateTo),
    loadMetaAdsData(dateFrom, dateTo),
    loadTikTokAdsData(dateFrom, dateTo),
  ]);

  const google: PaidMediaMeasurement =
    googleResult.status === "fulfilled"
      ? {
          channel: "Site",
          leadChannel: "Site",
          platform: "Google Ads",
          investment: round(googleResult.value.summary.investment),
          source: googleResult.value.metadata.source,
          updatedAt: googleResult.value.metadata.updatedAt,
          dataThroughDate: googleResult.value.metadata.lastClosedDate ?? null,
          status: statusForCoverage(
            googleResult.value.metadata.lastClosedDate ?? null,
            dateTo,
          ),
          error: null,
        }
      : unavailableMeasurement("Site", "Google Ads", googleResult.reason);

  const meta: PaidMediaMeasurement =
    metaResult.status === "fulfilled"
      ? {
          channel: "Meta",
          leadChannel: "Meta",
          platform: "Meta Ads",
          investment: round(metaResult.value.summary.spend),
          source: metaResult.value.metadata.source,
          updatedAt: metaResult.value.metadata.updatedAt,
          dataThroughDate: metaResult.value.metadata.dataThroughDate,
          status: statusForCoverage(metaResult.value.metadata.dataThroughDate, dateTo),
          error: null,
        }
      : unavailableMeasurement("Meta", "Meta Ads", metaResult.reason);

  const tiktok: PaidMediaMeasurement =
    tiktokResult.status === "fulfilled"
      ? {
          channel: "TikTok",
          leadChannel: "TikTok",
          platform: "TikTok Ads",
          investment: round(tiktokResult.value.summary.spend),
          source: tiktokResult.value.metadata.source,
          updatedAt: tiktokResult.value.metadata.updatedAt,
          dataThroughDate: tiktokResult.value.metadata.dataThroughDate,
          status: statusForCoverage(tiktokResult.value.metadata.dataThroughDate, dateTo),
          error: null,
        }
      : unavailableMeasurement("TikTok", "TikTok Ads", tiktokResult.reason);

  return { Site: google, Meta: meta, TikTok: tiktok };
}

export function buildLeadMediaInvestmentReference(input: {
  dateFrom: string;
  dateTo: string;
  channelLeads: Array<{ value: string; leads: number }>;
  measurements: PaidMediaMeasurements;
  metaBudgetPlan?: MetaBudgetPlan | null;
  netMediaPlan?: AugustNetMediaPlan | null;
}): LeadMediaInvestmentReference {
  const leadsByChannel = new Map(input.channelLeads.map(item => [item.value, item.leads]));
  const measurements: PaidMediaMeasurement[] = input.netMediaPlan
    ? input.netMediaPlan.channels.map(item => ({
        channel: item.channel,
        leadChannel: item.leadChannel,
        platform: item.platform,
        investment: item.periodNetInvestment,
        source: "august-net-media-plan",
        updatedAt: null,
        dataThroughDate: input.netMediaPlan?.dateTo ?? input.dateTo,
        status: "AVAILABLE",
        error: null,
      }))
    : (["Site", "Meta", "TikTok"] as const).map(channel => input.measurements[channel]);
  const channels = measurements.map(measurement => {
    const leadChannel = measurement.leadChannel ?? (
      measurement.channel === "Site" || measurement.channel === "Meta" || measurement.channel === "TikTok"
        ? measurement.channel
        : null
    );
    const leads = leadChannel ? leadsByChannel.get(leadChannel) ?? 0 : 0;
    return {
      ...measurement,
      leadChannel,
      leads,
      referenceCpl:
        measurement.investment != null && leads > 0
          ? round(measurement.investment / leads)
          : null,
    };
  });
  const availableInvestment = round(
    channels.reduce((sum, item) => sum + (item.investment ?? 0), 0),
  );
  const paidMediaLeads = channels.reduce((sum, item) => sum + item.leads, 0);
  const attributableInvestment = round(
    channels.reduce(
      (sum, item) => sum + (item.leadChannel ? item.investment ?? 0 : 0),
      0,
    ),
  );
  const allSourcesAvailable = channels.every(item => item.status === "AVAILABLE");
  const totalInvestment = allSourcesAvailable ? availableInvestment : null;

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    formula: input.netMediaPlan
      ? "AUGUST_NET_MEDIA_PLAN_RATE_DIVIDED_BY_CALENDAR_DAYS"
      : input.metaBudgetPlan
        ? "AUGUST_META_MONTHLY_BUDGET_RATE_DIVIDED_BY_CALENDAR_DAYS"
        : "CHANNEL_INVESTMENT_DIVIDED_BY_CHANNEL_LEADS",
    totalInvestment,
    availableInvestment,
    attributableInvestment,
    paidMediaLeads,
    estimatedOverallCpl:
      totalInvestment != null && paidMediaLeads > 0
        ? round(attributableInvestment / paidMediaLeads)
        : null,
    allSourcesAvailable,
    metaBudgetPlan: input.metaBudgetPlan ?? null,
    netMediaPlan: input.netMediaPlan ?? null,
    channels,
  };
}
