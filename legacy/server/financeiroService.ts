import { and, asc, desc, eq, gte, lte, or } from "drizzle-orm";
import { leads } from "../drizzle/schema";
import { MEDIA_PLANS, type MediaPlanRow } from "../client/src/data/mediaPlans";
import { getDb } from "./db";

export const FINANCEIRO_PARTNERS = ["webmotors", "mercado-livre"] as const;
export type FinanceiroPartnerId = (typeof FINANCEIRO_PARTNERS)[number];

export type FinanceiroLead = {
  id: number;
  correctedDate: string;
  model: string;
  name: string;
  email: string;
  phone: string;
  dealer: string;
  city: string;
  region: string;
  channel: string;
};

export type FinanceiroPartnerDashboard = {
  id: FinanceiroPartnerId;
  label: string;
  referenceCpm: number;
  plannedNetInvestment: number | null;
  plannedGrossInvestment: number | null;
  plannedLeads: number | null;
  actualLeads: number;
  referenceCpl: number | null;
  estimatedImpressions: number | null;
  daily: Array<{ date: string; leads: number }>;
  models: Array<{ model: string; leads: number }>;
  devicePlanning: FinanceiroDevicePlanning;
  leads: FinanceiroLead[];
};

export type FinanceiroDevicePlanning = {
  status: "ATIVA";
  source: "REFERENCIA_DE_PLANEJAMENTO";
  devices: Array<{
    device: "Mobile" | "Desktop";
    share: number;
    estimatedImpressions: number | null;
    modeledLeads: number;
  }>;
};

export type FinanceiroDashboard = {
  competence: string;
  period: { dateFrom: string; dateTo: string };
  planAvailable: boolean;
  partners: FinanceiroPartnerDashboard[];
  total: {
    plannedNetInvestment: number | null;
    actualLeads: number;
    referenceCpl: number | null;
    estimatedImpressions: number | null;
  };
};

const PARTNER_CONFIG: Record<FinanceiroPartnerId, {
  label: string;
  referenceCpm: number;
  leadChannels: string[];
  matchesPlanRow: (row: MediaPlanRow) => boolean;
}> = {
  webmotors: {
    label: "Webmotors",
    referenceCpm: 50,
    leadChannels: ["Webmotors"],
    matchesPlanRow: row => row.publisher === "Webmotors" || row.channel === "Webmotors",
  },
  "mercado-livre": {
    label: "Mercado Livre",
    referenceCpm: 35,
    leadChannels: ["Mercado Livre"],
    matchesPlanRow: row => row.publisher === "Mercado Livre" || row.channel === "Mercado Livre Ads" || row.channel === "Mercado Livre",
  },
};

const DEVICE_PROFILE_BY_MONTH: Record<FinanceiroPartnerId, Record<string, number>> = {
  webmotors: {
    "2026-07": 75,
    "2026-08": 78,
    "2026-09": 80,
    "2026-10": 82,
  },
  "mercado-livre": {
    "2026-07": 78,
    "2026-08": 80,
    "2026-09": 81,
    "2026-10": 83,
  },
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function monthBounds(competence: string) {
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competência inválida");
  const [year, month] = competence.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { dateFrom: `${competence}-01`, dateTo: `${competence}-${String(lastDay).padStart(2, "0")}` };
}

function partnerPlanMetrics(competence: string, partner: FinanceiroPartnerId) {
  const plan = MEDIA_PLANS.find(item => item.month === competence) ?? null;
  if (!plan) return { plan, gross: null, net: null, projectedLeads: null };

  const rows = plan.rows.filter(PARTNER_CONFIG[partner].matchesPlanRow);
  if (!rows.length) return { plan, gross: null, net: null, projectedLeads: null };

  return {
    plan,
    gross: round(rows.reduce((sum, row) => sum + row.investment, 0)),
    net: round(rows.reduce((sum, row) => sum + (row.netInvestment ?? row.investment), 0)),
    projectedLeads: rows.every(row => row.leads == null)
      ? null
      : round(rows.reduce((sum, row) => sum + (row.leads ?? 0), 0)),
  };
}

function partnerCondition(partner: FinanceiroPartnerId) {
  const channels = PARTNER_CONFIG[partner].leadChannels;
  return or(
    ...channels.flatMap(channel => [
      eq(leads.sourceChannel, channel),
      eq(leads.channel, channel),
    ]),
  );
}

export function buildFinanceiroLeadCharts(competence: string, rows: FinanceiroLead[]) {
  const period = monthBounds(competence);
  const dailyCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();

  for (const row of rows) {
    dailyCounts.set(row.correctedDate, (dailyCounts.get(row.correctedDate) ?? 0) + 1);
    const model = row.model.trim() || "Não informado";
    modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
  }

  const daily: Array<{ date: string; leads: number }> = [];
  for (let cursor = period.dateFrom; cursor <= period.dateTo; ) {
    daily.push({ date: cursor, leads: dailyCounts.get(cursor) ?? 0 });
    const date = new Date(`${cursor}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cursor = date.toISOString().slice(0, 10);
  }

  const models = Array.from(modelCounts, ([model, leads]) => ({ model, leads }))
    .sort((left, right) => right.leads - left.leads || left.model.localeCompare(right.model, "pt-BR"));

  return { daily, models };
}

function splitByShare(total: number, share: number) {
  const mobile = Math.round(total * (share / 100));
  return { mobile, desktop: total - mobile };
}

export function buildFinanceiroDevicePlanning(input: {
  partner: FinanceiroPartnerId;
  competence: string;
  actualLeads: number;
  estimatedImpressions: number | null;
}): FinanceiroDevicePlanning {
  const profiles = DEVICE_PROFILE_BY_MONTH[input.partner];
  const applicableMonth = Object.keys(profiles)
    .sort()
    .filter(month => month <= input.competence)
    .at(-1) ?? Object.keys(profiles).sort()[0];
  const mobileShare = profiles[applicableMonth] ?? 80;
  const desktopShare = 100 - mobileShare;
  const modeledLeads = splitByShare(input.actualLeads, mobileShare);
  const estimatedImpressions = input.estimatedImpressions == null
    ? null
    : splitByShare(input.estimatedImpressions, mobileShare);

  return {
    status: "ATIVA",
    source: "REFERENCIA_DE_PLANEJAMENTO",
    devices: [
      {
        device: "Mobile",
        share: mobileShare,
        estimatedImpressions: estimatedImpressions?.mobile ?? null,
        modeledLeads: modeledLeads.mobile,
      },
      {
        device: "Desktop",
        share: desktopShare,
        estimatedImpressions: estimatedImpressions?.desktop ?? null,
        modeledLeads: modeledLeads.desktop,
      },
    ],
  };
}

export function buildFinanceiroPartnerDashboard(input: {
  partner: FinanceiroPartnerId;
  competence: string;
  leads: FinanceiroLead[];
}) {
  const config = PARTNER_CONFIG[input.partner];
  const plan = partnerPlanMetrics(input.competence, input.partner);
  const actualLeads = input.leads.length;
  const referenceCpl = plan.net != null && actualLeads > 0 ? round(plan.net / actualLeads) : null;
  const estimatedImpressions = plan.net != null ? Math.round((plan.net / config.referenceCpm) * 1000) : null;
  const charts = buildFinanceiroLeadCharts(input.competence, input.leads);
  const devicePlanning = buildFinanceiroDevicePlanning({
    partner: input.partner,
    competence: input.competence,
    actualLeads,
    estimatedImpressions,
  });

  return {
    id: input.partner,
    label: config.label,
    referenceCpm: config.referenceCpm,
    plannedNetInvestment: plan.net,
    plannedGrossInvestment: plan.gross,
    plannedLeads: plan.projectedLeads,
    actualLeads,
    referenceCpl,
    estimatedImpressions,
    daily: charts.daily,
    models: charts.models,
    devicePlanning,
    leads: input.leads,
  } satisfies FinanceiroPartnerDashboard;
}

export async function getFinanceiroAvailableMonths() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const leadDates = await db
    .select({ correctedDate: leads.correctedDate })
    .from(leads)
    .groupBy(leads.correctedDate)
    .orderBy(desc(leads.correctedDate));

  return Array.from(new Set([...MEDIA_PLANS.map(plan => plan.month), ...leadDates.map(item => item.correctedDate.slice(0, 7))]))
    .filter(value => /^\d{4}-\d{2}$/.test(value))
    .sort((left, right) => right.localeCompare(left));
}

export async function getFinanceiroDashboard(competence: string): Promise<FinanceiroDashboard> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const period = monthBounds(competence);

  const entries = await Promise.all(
    FINANCEIRO_PARTNERS.map(async partner => {
      const records = await db
        .select({
          id: leads.id,
          correctedDate: leads.correctedDate,
          model: leads.model,
          name: leads.contactName,
          email: leads.email,
          phone: leads.phone,
          dealer: leads.dealerName,
          city: leads.city,
          region: leads.region,
          channel: leads.sourceChannel,
        })
        .from(leads)
        .where(and(gte(leads.correctedDate, period.dateFrom), lte(leads.correctedDate, period.dateTo), partnerCondition(partner)))
        .orderBy(desc(leads.correctedDate), asc(leads.dealerName), asc(leads.id));

      return buildFinanceiroPartnerDashboard({ partner, competence, leads: records });
    }),
  );

  const plannedNet = entries.reduce((sum, item) => sum + (item.plannedNetInvestment ?? 0), 0);
  const hasPlan = entries.some(item => item.plannedNetInvestment != null);
  const actualLeads = entries.reduce((sum, item) => sum + item.actualLeads, 0);
  const estimatedImpressions = entries.reduce((sum, item) => sum + (item.estimatedImpressions ?? 0), 0);

  return {
    competence,
    period,
    planAvailable: hasPlan,
    partners: entries,
    total: {
      plannedNetInvestment: hasPlan ? round(plannedNet) : null,
      actualLeads,
      referenceCpl: hasPlan && actualLeads > 0 ? round(plannedNet / actualLeads) : null,
      estimatedImpressions: hasPlan ? estimatedImpressions : null,
    },
  };
}
