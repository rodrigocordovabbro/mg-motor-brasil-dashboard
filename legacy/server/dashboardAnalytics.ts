import { classifyProduct, classifyRegion } from "./campaignTaxonomy";

export type AnalyticsRow = {
  campaign: string;
  campaign_id: string;
  date: string;
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
  budget_amount: number | null;
  campaign_status: string;
  bidding_strategy_type: string;
  optimization_score: number | null;
  search_impression_share: number | null;
  search_budget_lost_impression_share: number | null;
};

export type GoalConfig = {
  goalType: "MEDIA_BUDGET" | "REGIONAL_LEADS";
  scopeKey: string;
  region: string | null;
  monthlyLeadGoal: number | null;
  monthlyBudgetGoal: number | null;
};

export type CampaignHealth = "Saudável" | "Atenção" | "Crítico";

type Totals = {
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
};

export type AggregatedCampaign = Totals & {
  campaignId: string;
  campaign: string;
  product: string;
  regionKey: string;
  region: string;
  regionType: "regional" | "national" | "unclassified";
  monthlyLeadGoal: number | null;
  budget: number;
  googleStatus: string;
  biddingStrategyType: string;
  optimizationScore: number | null;
  searchImpressionShare: number | null;
  searchBudgetLostImpressionShare: number | null;
  cpa: number;
  ctr: number;
  cpc: number;
  conversionRate: number;
  status: CampaignHealth;
};

const DAY_MS = 86_400_000;
export const MIN_RANKING_CONVERSIONS = 3;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function parseUtcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return formatUtcDate(new Date(parseUtcDate(date).getTime() + days * DAY_MS));
}

function daysInMonth(date: string) {
  const parsed = parseUtcDate(date);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
}

function summarizeRows(rows: AnalyticsRow[]): Totals {
  return rows.reduce(
    (total, row) => ({
      spend: total.spend + row.spend,
      conversions: total.conversions + row.conversions,
      clicks: total.clicks + row.clicks,
      impressions: total.impressions + row.impressions,
    }),
    { spend: 0, conversions: 0, clicks: 0, impressions: 0 },
  );
}

function metricsFromTotals(total: Totals) {
  return {
    investment: round(total.spend),
    conversions: round(total.conversions, 1),
    cpa: round(safeDivide(total.spend, total.conversions)),
    ctr: round(safeDivide(total.clicks, total.impressions) * 100),
    conversionRate: round(safeDivide(total.conversions, total.clicks) * 100),
    cpc: round(safeDivide(total.spend, total.clicks)),
  };
}

function percentDelta(current: number | null, reference: number | null) {
  if (current == null || reference == null || reference === 0) return null;
  return round(((current - reference) / Math.abs(reference)) * 100, 1);
}

function exactDayMetrics(rows: AnalyticsRow[], date: string) {
  const dayRows = rows.filter(row => row.date === date);
  return dayRows.length > 0 ? metricsFromTotals(summarizeRows(dayRows)) : null;
}

function movingAverageMetrics(rows: AnalyticsRow[], referenceDate: string, windowDays: number) {
  const dateFrom = addDays(referenceDate, -(windowDays - 1));
  const windowRows = rows.filter(row => row.date >= dateFrom && row.date <= referenceDate);
  const coveredDays = new Set(windowRows.map(row => row.date));
  if (coveredDays.size < windowDays) return null;
  const totals = summarizeRows(windowRows);
  const totalMetrics = metricsFromTotals(totals);
  return {
    investment: round(totalMetrics.investment / windowDays),
    conversions: round(totalMetrics.conversions / windowDays, 1),
    cpa: totalMetrics.cpa,
    ctr: totalMetrics.ctr,
    conversionRate: totalMetrics.conversionRate,
    cpc: totalMetrics.cpc,
  };
}

const COMPARISON_METRICS = [
  { key: "investment", label: "Investimento", format: "currency", preference: "contextual" },
  { key: "conversions", label: "Conversões", format: "number", preference: "higher" },
  { key: "cpa", label: "CPA Médio", format: "currency", preference: "lower" },
  { key: "ctr", label: "CTR", format: "percent", preference: "higher" },
  { key: "conversionRate", label: "Taxa de Conversão", format: "percent", preference: "higher" },
  { key: "cpc", label: "CPC Médio", format: "currency", preference: "lower" },
] as const;

export function buildDailyComparison(
  rows: AnalyticsRow[],
  referenceDateOverride?: string,
) {
  const availableDates = Array.from(new Set(rows.map(row => row.date))).sort();
  const referenceDate = referenceDateOverride ?? availableDates.at(-1) ?? null;
  if (!referenceDate) {
    return { referenceDate: null, previousDate: null, weekAgoDate: null, cards: [], table: [], campaigns: [] };
  }

  const previousDate = addDays(referenceDate, -1);
  const weekAgoDate = addDays(referenceDate, -7);
  const d1 = exactDayMetrics(rows, referenceDate);
  const d2 = exactDayMetrics(rows, previousDate);
  const weekAgo = exactDayMetrics(rows, weekAgoDate);
  const average7d = movingAverageMetrics(rows, referenceDate, 7);
  const average30d = movingAverageMetrics(rows, referenceDate, 30);

  const table = COMPARISON_METRICS.map(metric => {
    const key = metric.key;
    const currentValue = d1?.[key] ?? null;
    const previousValue = d2?.[key] ?? null;
    const weekAgoValue = weekAgo?.[key] ?? null;
    return {
      ...metric,
      d1: currentValue,
      d2: previousValue,
      deltaVsD2: percentDelta(currentValue, previousValue),
      weekAgo: weekAgoValue,
      deltaVsWeekAgo: percentDelta(currentValue, weekAgoValue),
      average7d: average7d?.[key] ?? null,
      average30d: average30d?.[key] ?? null,
    };
  });

  const campaignMap = new Map<
    string,
    {
      campaignId: string;
      campaign: string;
      budget: number | null;
      d1Rows: AnalyticsRow[];
      d2Rows: AnalyticsRow[];
    }
  >();

  for (const row of rows.filter(item => item.date === referenceDate || item.date === previousDate)) {
    const item = campaignMap.get(row.campaign_id) ?? {
      campaignId: row.campaign_id,
      campaign: row.campaign,
      budget: null,
      d1Rows: [],
      d2Rows: [],
    };
    item.campaign = row.campaign;
    if (row.date === referenceDate) {
      item.d1Rows.push(row);
      item.budget = row.budget_amount ?? item.budget;
    } else {
      item.d2Rows.push(row);
      if (item.budget == null) item.budget = row.budget_amount;
    }
    campaignMap.set(row.campaign_id, item);
  }

  const campaigns = Array.from(campaignMap.values())
    .map(item => {
      const current = item.d1Rows.length > 0 ? metricsFromTotals(summarizeRows(item.d1Rows)) : null;
      const previous = item.d2Rows.length > 0 ? metricsFromTotals(summarizeRows(item.d2Rows)) : null;
      return {
        campaignId: item.campaignId,
        campaign: item.campaign,
        budget: item.budget == null ? null : round(item.budget),
        d1: current
          ? { investment: current.investment, conversions: current.conversions, cpa: current.cpa }
          : null,
        d2: previous
          ? { investment: previous.investment, conversions: previous.conversions, cpa: previous.cpa }
          : null,
        deltas: {
          investment: percentDelta(current?.investment ?? null, previous?.investment ?? null),
          conversions: percentDelta(current?.conversions ?? null, previous?.conversions ?? null),
          cpa: percentDelta(current?.cpa ?? null, previous?.cpa ?? null),
        },
      };
    })
    .sort((left, right) => (right.d1?.investment ?? -1) - (left.d1?.investment ?? -1));

  return {
    referenceDate,
    previousDate,
    weekAgoDate,
    cards: table,
    table,
    campaigns,
  };
}

function averageNullable(values: Array<number | null>) {
  const available = values.filter((value): value is number => value != null);
  return available.length > 0 ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

export function aggregateCampaigns(rows: AnalyticsRow[], goals: GoalConfig[], averageCpa: number) {
  const regionalGoals = new Map(
    goals
      .filter(goal => goal.goalType === "REGIONAL_LEADS")
      .map(goal => [goal.scopeKey, goal.monthlyLeadGoal] as const),
  );
  const grouped = new Map<string, AnalyticsRow[]>();
  for (const row of rows) grouped.set(row.campaign_id, [...(grouped.get(row.campaign_id) ?? []), row]);

  return Array.from(grouped.entries())
    .map(([campaignId, campaignRows]): AggregatedCampaign => {
      const sortedRows = [...campaignRows].sort((left, right) => left.date.localeCompare(right.date));
      const latest = sortedRows.at(-1)!;
      const totals = summarizeRows(campaignRows);
      const cpa = round(safeDivide(totals.spend, totals.conversions));
      const region = classifyRegion(latest.campaign);
      let status: CampaignHealth = "Saudável";
      if (totals.spend > 0 && totals.conversions <= 0) status = "Crítico";
      else if (averageCpa > 0 && cpa >= averageCpa * 2) status = "Crítico";
      else if (averageCpa > 0 && cpa >= averageCpa * 1.35) status = "Atenção";

      return {
        campaignId,
        campaign: latest.campaign,
        product: classifyProduct(latest.campaign),
        regionKey: region.key,
        region: region.label,
        regionType: region.type,
        monthlyLeadGoal: region.type === "regional" ? (regionalGoals.get(region.key) ?? null) : null,
        budget: round(latest.budget_amount ?? 0),
        googleStatus: latest.campaign_status,
        biddingStrategyType: latest.bidding_strategy_type,
        optimizationScore:
          latest.optimization_score == null ? null : round(latest.optimization_score * 100, 1),
        searchImpressionShare:
          latest.search_impression_share == null ? null : round(latest.search_impression_share * 100, 1),
        searchBudgetLostImpressionShare:
          averageNullable(campaignRows.map(row => row.search_budget_lost_impression_share)) == null
            ? null
            : round(
                (averageNullable(campaignRows.map(row => row.search_budget_lost_impression_share)) ?? 0) *
                  100,
                1,
              ),
        spend: round(totals.spend),
        conversions: round(totals.conversions, 1),
        clicks: round(totals.clicks),
        impressions: round(totals.impressions),
        cpa,
        ctr: round(safeDivide(totals.clicks, totals.impressions) * 100),
        cpc: round(safeDivide(totals.spend, totals.clicks)),
        conversionRate: round(safeDivide(totals.conversions, totals.clicks) * 100),
        status,
      };
    })
    .sort((left, right) => right.spend - left.spend);
}

export function buildPacing(
  rows: AnalyticsRow[],
  monthlyBudgetGoal: number | null,
  lastClosedDateOverride?: string,
) {
  const availableDates = Array.from(new Set(rows.map(row => row.date))).sort();
  const lastClosedDate = lastClosedDateOverride ?? availableDates.at(-1) ?? null;
  if (!lastClosedDate || monthlyBudgetGoal == null || monthlyBudgetGoal <= 0) return null;

  const monthPrefix = lastClosedDate.slice(0, 7);
  const monthRows = rows.filter(row => row.date.startsWith(monthPrefix) && row.date <= lastClosedDate);
  const dailySpend = new Map<string, number>();
  for (const row of monthRows) dailySpend.set(row.date, (dailySpend.get(row.date) ?? 0) + row.spend);

  const totalDays = daysInMonth(lastClosedDate);
  const closedDays = parseUtcDate(lastClosedDate).getUTCDate();
  const remainingDays = Math.max(totalDays - closedDays, 0);
  const invested = round(Array.from(dailySpend.values()).reduce((sum, value) => sum + value, 0));
  const remaining = round(Math.max(monthlyBudgetGoal - invested, 0));
  const idealDaily = round(monthlyBudgetGoal / totalDays);
  const averageDaily = round(safeDivide(invested, closedDays));
  const idealDailyRemaining = remainingDays > 0 ? round(remaining / remainingDays) : 0;
  const projected = round(averageDaily * totalDays);
  const idealToDate = (monthlyBudgetGoal / totalDays) * closedDays;

  let realCumulative = 0;
  const series = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    if (day <= closedDays) realCumulative += dailySpend.get(date) ?? 0;
    return {
      date,
      real: day <= closedDays ? round(realCumulative) : null,
      ideal: round((monthlyBudgetGoal / totalDays) * day),
      projection: round(averageDaily * day),
      monthlyGoal: round(monthlyBudgetGoal),
    };
  });

  return {
    competencia: monthPrefix,
    lastClosedDate,
    monthlyGoal: round(monthlyBudgetGoal),
    invested,
    remaining,
    projected,
    projectedDifference: round(projected - monthlyBudgetGoal),
    closedDays,
    remainingDays,
    totalDays,
    idealDaily,
    averageDaily,
    idealDailyRemaining,
    pacePercent: round(safeDivide(invested, idealToDate) * 100, 1),
    achievedPercent: round(safeDivide(invested, monthlyBudgetGoal) * 100, 1),
    projectedPercent: round(safeDivide(projected, monthlyBudgetGoal) * 100, 1),
    series,
  };
}

export function buildRankings(campaigns: AggregatedCampaign[]) {
  const isEligible = (campaign: AggregatedCampaign) =>
    campaign.spend > 0 && campaign.conversions >= MIN_RANKING_CONVERSIONS && campaign.cpa > 0;
  const eligible = campaigns.filter(isEligible);
  const excluded = campaigns.filter(campaign => !isEligible(campaign));
  const pick = (campaign: AggregatedCampaign) => ({
    campaignId: campaign.campaignId,
    campaign: campaign.campaign,
    product: campaign.product,
    conversions: campaign.conversions,
    spend: campaign.spend,
    cpa: campaign.cpa,
  });
  return {
    criteria: {
      minimumConversions: MIN_RANKING_CONVERSIONS,
      requirePositiveSpend: true,
      message: `Somente campanhas com investimento e ao menos ${MIN_RANKING_CONVERSIONS} conversões entram no ranking.`,
    },
    best: [...eligible].sort((left, right) => left.cpa - right.cpa).slice(0, 10).map(pick),
    worst: [...eligible].sort((left, right) => right.cpa - left.cpa).slice(0, 10).map(pick),
    excludedCount: excluded.length,
    excluded: excluded.map(campaign => ({
      campaignId: campaign.campaignId,
      campaign: campaign.campaign,
      spend: campaign.spend,
      conversions: campaign.conversions,
      reason:
        campaign.spend <= 0
          ? "Sem investimento no período."
          : campaign.conversions < MIN_RANKING_CONVERSIONS
            ? `Abaixo da amostra mínima de ${MIN_RANKING_CONVERSIONS} conversões.`
            : "CPA indisponível para comparação segura.",
    })),
  };
}

function aggregateDimension(
  campaigns: AggregatedCampaign[],
  dimension: (campaign: AggregatedCampaign) => { key: string; label: string },
) {
  const grouped = new Map<string, Totals & { key: string; label: string; monthlyLeadGoal: number }>();
  for (const campaign of campaigns) {
    const item = dimension(campaign);
    const current = grouped.get(item.key) ?? {
      key: item.key,
      label: item.label,
      spend: 0,
      conversions: 0,
      clicks: 0,
      impressions: 0,
      monthlyLeadGoal: 0,
    };
    current.spend += campaign.spend;
    current.conversions += campaign.conversions;
    current.clicks += campaign.clicks;
    current.impressions += campaign.impressions;
    current.monthlyLeadGoal = Math.max(current.monthlyLeadGoal, campaign.monthlyLeadGoal ?? 0);
    grouped.set(item.key, current);
  }
  return Array.from(grouped.values());
}

export function buildProductPerformance(campaigns: AggregatedCampaign[]) {
  const totalSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  return aggregateDimension(campaigns, campaign => ({ key: campaign.product, label: campaign.product }))
    .map(item => ({
      product: item.label,
      spend: round(item.spend),
      conversions: round(item.conversions, 1),
      participation: round(safeDivide(item.spend, totalSpend) * 100, 1),
      ctr: round(safeDivide(item.clicks, item.impressions) * 100),
      cpa: round(safeDivide(item.spend, item.conversions)),
    }))
    .sort((left, right) => right.spend - left.spend);
}

export function buildRegionPerformance(campaigns: AggregatedCampaign[], averageCpa: number) {
  return aggregateDimension(campaigns, campaign => ({ key: campaign.regionKey, label: campaign.region }))
    .map(item => {
      const cpa = round(safeDivide(item.spend, item.conversions));
      const deviation = averageCpa > 0 ? round(((cpa - averageCpa) / averageCpa) * 100, 1) : 0;
      return {
        regionKey: item.key,
        region: item.label,
        spend: round(item.spend),
        conversions: round(item.conversions, 1),
        cpa,
        deviation,
        monthlyLeadGoal: item.monthlyLeadGoal || null,
        classification: deviation <= -15 ? "Favorável" : deviation >= 15 ? "Desfavorável" : "Neutro",
      };
    })
    .sort((left, right) => right.spend - left.spend);
}

type ActionType =
  | "INCREASE_BUDGET"
  | "SET_TARGET_CPA"
  | "SWITCH_BIDDING_STRATEGY"
  | "REDUCE_WASTE"
  | "IMPROVE_CVR"
  | "REFRESH_CREATIVE"
  | "IMPROVE_AD_RANK"
  | "AUDIT_MEASUREMENT"
  | "VALIDATE_VALUE_STRATEGY"
  | "REVIEW_BIDDING";

type RecommendationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const MIN_STRATEGY_CHANGE_CONVERSIONS = 15;
export const MAX_TARGET_CPA_REDUCTION_PERCENT = 15;
export const MAX_DAILY_BUDGET_INCREASE_PERCENT = 15;

const STRATEGY_LABELS: Record<string, string> = {
  MAXIMIZE_CONVERSIONS: "Maximizar conversões",
  TARGET_CPA: "CPA desejado",
  MAXIMIZE_CONVERSION_VALUE: "Maximizar valor de conversão",
  TARGET_ROAS: "ROAS desejado",
  MAXIMIZE_CLICKS: "Maximizar cliques",
  MANUAL_CPC: "CPC manual",
  ENHANCED_CPC: "CPC otimizado",
  UNAVAILABLE: "Estratégia indisponível",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function strategyLabel(strategy: string) {
  return STRATEGY_LABELS[strategy] ?? strategy.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, letter => letter.toUpperCase());
}

function formatBrl(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function roundToStep(value: number, step = 1) {
  return round(Math.round(value / step) * step, 2);
}

function isTrafficBidding(strategy: string) {
  return ["MAXIMIZE_CLICKS", "MANUAL_CPC", "ENHANCED_CPC"].includes(strategy);
}

function isValueBidding(strategy: string) {
  return ["MAXIMIZE_CONVERSION_VALUE", "TARGET_ROAS"].includes(strategy);
}

function budgetIncreaseBlockedReasons(
  campaign: AggregatedCampaign,
  averageCpa: number,
  pacing: ReturnType<typeof buildPacing>,
) {
  const budgetLoss = campaign.searchBudgetLostImpressionShare;
  const underPace = pacing != null && pacing.pacePercent < 95;
  const efficient = averageCpa > 0 && campaign.cpa > 0 && campaign.cpa <= averageCpa * 1.15;
  const hasRegionalEvidence = campaign.regionType === "regional" && campaign.monthlyLeadGoal != null;
  return [
    campaign.googleStatus !== "ENABLED" ? "A campanha não está ativa no Google Ads." : null,
    !underPace ? "A conta não está abaixo do ritmo ideal de investimento." : null,
    !efficient ? "O CPA não está dentro da faixa eficiente para escalar." : null,
    !hasRegionalEvidence ? "A região ou a meta regional não foi identificada com segurança." : null,
    budgetLoss == null ? "A perda de impressões por orçamento está indisponível." : null,
    budgetLoss != null && budgetLoss < 20 ? "A perda de impressões por orçamento é inferior a 20%." : null,
    campaign.conversions < MIN_RANKING_CONVERSIONS ? "A amostra de conversões é insuficiente." : null,
    campaign.budget <= 0 ? "O orçamento diário atual está indisponível." : null,
  ].filter((reason): reason is string => reason != null);
}

export function buildRecommendations(
  campaigns: AggregatedCampaign[],
  averageCpa: number,
  pacing: ReturnType<typeof buildPacing>,
) {
  const pacePercent = pacing?.pacePercent ?? null;
  const accountDailyHeadroom = pacing == null
    ? 0
    : Math.max(pacing.idealDailyRemaining - pacing.averageDaily, 0);
  let remainingDailyHeadroom = accountDailyHeadroom;
  const scalableCampaigns = campaigns
    .filter(campaign => {
      const strategy = campaign.biddingStrategyType?.trim() || "UNAVAILABLE";
      return (
        campaign.conversions > 0 &&
        !isTrafficBidding(strategy) &&
        !isValueBidding(strategy) &&
        budgetIncreaseBlockedReasons(campaign, averageCpa, pacing).length === 0
      );
    })
    .sort((left, right) => left.cpa - right.cpa || right.conversions - left.conversions);
  const budgetAllocations = new Map<string, { current: number; recommended: number; changePercent: number }>();

  for (const campaign of scalableCampaigns) {
    const paceGap = Math.max(95 - (pacePercent ?? 95), 0);
    const requestedPercent = clamp(Math.floor(paceGap / 5) * 5 || 5, 5, MAX_DAILY_BUDGET_INCREASE_PERCENT);
    const requestedIncrease = round(campaign.budget * (requestedPercent / 100), 2);
    const minimumUsefulIncrease = round(Math.max(campaign.budget * 0.05, 1), 2);
    const approvedIncrease = round(Math.min(requestedIncrease, remainingDailyHeadroom), 2);
    if (approvedIncrease < minimumUsefulIncrease) continue;
    const recommended = round(campaign.budget + approvedIncrease, 2);
    budgetAllocations.set(campaign.campaignId, {
      current: campaign.budget,
      recommended,
      changePercent: round((approvedIncrease / campaign.budget) * 100, 1),
    });
    remainingDailyHeadroom = round(Math.max(remainingDailyHeadroom - approvedIncrease, 0), 2);
  }

  const recommendations = campaigns
    .map(campaign => {
      if (campaign.googleStatus !== "ENABLED" || campaign.spend <= 0) return null;

      const currentStrategy = campaign.biddingStrategyType?.trim() || "UNAVAILABLE";
      const currentStrategyLabel = strategyLabel(currentStrategy);
      const benchmarkCpa = averageCpa > 0 ? averageCpa : campaign.cpa;
      const highCpa = benchmarkCpa > 0 && campaign.cpa > benchmarkCpa * 1.15;
      const severeCpa = benchmarkCpa > 0 && campaign.cpa > benchmarkCpa * 1.5;
      const hasStrategySample = campaign.conversions >= MIN_STRATEGY_CHANGE_CONVERSIONS;
      const hasLandingPageSignal = campaign.clicks >= 100 && campaign.conversionRate > 0 && campaign.conversionRate < 3;
      const hasCreativeSignal = campaign.impressions >= 1_000 && campaign.ctr > 0 && campaign.ctr < 6;
      const allocation = budgetAllocations.get(campaign.campaignId) ?? null;
      const blockedReasons = budgetIncreaseBlockedReasons(campaign, averageCpa, pacing);
      const hasRegionalEvidence = campaign.regionType === "regional" && campaign.monthlyLeadGoal != null;
      const safeTargetCpa = campaign.cpa > 0
        ? roundToStep(Math.max(benchmarkCpa * 1.05, campaign.cpa * (1 - MAX_TARGET_CPA_REDUCTION_PERCENT / 100)))
        : null;

      let actionType: ActionType | null = null;
      let description = "";
      let rationale = "";
      let recommendedStrategy = currentStrategy;
      let recommendedTargetCpa: number | null = null;
      let recommendedDailyBudget: number | null = null;
      let parameterLabel = "";
      let currentValue: number | string | null = null;
      let recommendedValue: number | string | null = null;
      let parameterFormat: "currency" | "percent" | "number" | "text" = "text";
      let expectedImpact = "";
      let risk = "";
      let priority: RecommendationPriority = "MEDIUM";
      let steps: string[] = [];

      if (campaign.conversions <= 0) {
        actionType = "AUDIT_MEASUREMENT";
        parameterLabel = "Sinal de conversão primária";
        currentValue = `${campaign.conversions} conversões em ${campaign.clicks} cliques`;
        recommendedValue = "Evento primário validado, ativo e sem duplicidade";
        description = `Auditar a mensuração antes de alterar ${currentStrategyLabel} ou o orçamento diário de ${formatBrl(campaign.budget)}.`;
        rationale = `${formatBrl(campaign.spend)} investidos e ${campaign.clicks} cliques sem conversões; sem validar a tag, uma mudança de lance não tem base confiável.`;
        expectedImpact = "Restabelecer um sinal de conversão confiável para que a estratégia automatizada possa aprender e para separar falha de mídia de falha de medição.";
        risk = "Reduzir orçamento ou trocar a estratégia antes da auditoria pode mascarar uma falha de tracking e atrasar a recuperação.";
        priority = campaign.spend >= Math.max(benchmarkCpa * 3, 1) ? "CRITICAL" : "HIGH";
        steps = [
          "No Google Ads, abrir Metas > Conversões > Resumo e conferir quais ações estão marcadas como primárias.",
          "Validar a tag com Tag Assistant e comparar uma conversão de teste com o CRM, sem criar eventos duplicados.",
          "Confirmar janela de conversão, modelo de atribuição e Conversões Otimizadas antes de editar lances.",
          `Manter temporariamente ${currentStrategyLabel}; somente após o sinal validado decidir entre Maximizar conversões e CPA desejado.`,
        ];
      } else if (isValueBidding(currentStrategy)) {
        actionType = "VALIDATE_VALUE_STRATEGY";
        parameterLabel = "Critério de decisão";
        currentValue = "CPA sem receita/valor no dataset";
        recommendedValue = "ROAS e valor de conversão reconciliados";
        description = `Validar os valores enviados antes de julgar ${currentStrategyLabel} somente pelo CPA observado de ${formatBrl(campaign.cpa)}.`;
        rationale = "Estratégias orientadas a valor devem ser avaliadas por receita e ROAS; o dataset atual contém conversões e CPA, mas não expõe valor de conversão para uma troca segura.";
        expectedImpact = "Evitar uma troca incorreta de estratégia e habilitar decisões por valor econômico real, não apenas por volume de Leads.";
        risk = "Trocar para uma estratégia de volume sem reconciliar receita pode aumentar Leads e reduzir qualidade ou margem.";
        priority = highCpa ? "HIGH" : "MEDIUM";
        steps = [
          "Abrir Metas > Conversões e verificar se cada ação envia valor dinâmico e moeda BRL.",
          "Reconciliar valor de conversão e receita do Google Ads com o CRM no mesmo período da tarefa.",
          "Validar se a campanha deve otimizar para Maximizar valor de conversão ou ROAS desejado conforme o volume disponível.",
          "Definir o ROAS-alvo somente após a reconciliação; não converter o CPA médio em ROAS sem receita observada.",
        ];
      } else if (isTrafficBidding(currentStrategy) && hasStrategySample) {
        actionType = "SWITCH_BIDDING_STRATEGY";
        recommendedStrategy = "MAXIMIZE_CONVERSIONS";
        recommendedTargetCpa = roundToStep(Math.max(benchmarkCpa * 1.1, campaign.cpa * 1.1));
        parameterLabel = "Estratégia de lances";
        currentValue = currentStrategyLabel;
        recommendedValue = strategyLabel(recommendedStrategy);
        description = `Migrar de ${currentStrategyLabel} para ${strategyLabel(recommendedStrategy)}; usar ${formatBrl(recommendedTargetCpa)} como limite de controle, sem CPA-alvo no primeiro ciclo de aprendizado.`;
        rationale = `${campaign.conversions} conversões fornecem amostra para sair de uma estratégia orientada a tráfego; o CPA observado é ${formatBrl(campaign.cpa)} e a referência da conta é ${formatBrl(benchmarkCpa)}.`;
        expectedImpact = "Direcionar a automação para conversões em vez de cliques, com leitura separada do período de aprendizado.";
        risk = "A campanha pode oscilar durante o aprendizado; não combinar a troca com alterações de orçamento, segmentação ou criativo.";
        priority = "HIGH";
        steps = [
          "Abrir Campanhas > selecionar a campanha > Configurações > Lances > Alterar estratégia de lances.",
          `Selecionar ${strategyLabel(recommendedStrategy)} sem inserir CPA desejado no primeiro ciclo.`,
          `Usar ${formatBrl(recommendedTargetCpa)} como limite de controle: interromper e revisar se o CPA superar esse valor após a fase de aprendizado.`,
          "Monitorar por pelo menos 7 dias e não fazer outra alteração estrutural no mesmo intervalo.",
        ];
      } else if (highCpa && hasLandingPageSignal) {
        actionType = "IMPROVE_CVR";
        const targetConversionRate = round(Math.min(Math.max(campaign.conversionRate + 0.8, 3), 5), 1);
        parameterLabel = "Taxa de conversão pós-clique";
        currentValue = campaign.conversionRate;
        recommendedValue = targetConversionRate;
        parameterFormat = "percent";
        description = `Elevar a taxa de conversão de ${campaign.conversionRate}% para ${targetConversionRate}% antes de restringir a entrega com CPA-alvo; manter ${currentStrategyLabel} e o orçamento diário de ${formatBrl(campaign.budget)}.`;
        rationale = `${campaign.clicks} cliques e ${campaign.conversions} conversões produziram CPA de ${formatBrl(campaign.cpa)}. A taxa pós-clique de ${campaign.conversionRate}% aponta primeiro para página, oferta ou formulário, não apenas para a estratégia de lance.`;
        expectedImpact = `Aumentar a eficiência pós-clique e reduzir o CPA sem cortar volume prematuramente; meta operacional inicial de ${targetConversionRate}% de conversão.`;
        risk = "Alterar lance e página ao mesmo tempo elimina a leitura causal; manter estratégia, orçamento e segmentação estáveis durante o teste.";
        priority = severeCpa ? "CRITICAL" : "HIGH";
        steps = [
          "No Google Ads, abrir Anúncios e recursos > Páginas de destino e identificar URL, dispositivo e campanha com pior taxa de conversão.",
          "Comparar formulário e página com o anúncio: promessa, preço, disponibilidade, localização e chamada para ação devem ser consistentes.",
          "Executar uma única variação de página ou formulário, sem alterar lances, orçamento, públicos ou criativos no mesmo ciclo.",
          `Reavaliar após pelo menos 100 novos cliques; manter a mudança se a taxa atingir ${targetConversionRate}% sem piorar a qualidade dos Leads.`,
        ];
      } else if (highCpa && hasCreativeSignal) {
        actionType = "REFRESH_CREATIVE";
        const targetCtr = round(Math.min(Math.max(campaign.ctr + 1, 6), 8), 1);
        parameterLabel = "CTR dos anúncios e recursos";
        currentValue = campaign.ctr;
        recommendedValue = targetCtr;
        parameterFormat = "percent";
        description = `Elevar o CTR de ${campaign.ctr}% para ${targetCtr}% com uma renovação controlada de criativos; manter ${currentStrategyLabel}, CPA-alvo e orçamento inalterados nesta etapa.`;
        rationale = `${campaign.impressions} impressões e ${campaign.clicks} cliques resultaram em CTR de ${campaign.ctr}% e CPA de ${formatBrl(campaign.cpa)}. A baixa resposta ao anúncio deve ser tratada antes de apertar o CPA-alvo.`;
        expectedImpact = `Atrair tráfego mais aderente e levar o CTR a pelo menos ${targetCtr}%, criando base melhor para uma futura decisão de lance.`;
        risk = "Trocar todos os recursos simultaneamente pode perder aprendizados; preservar controles e substituir apenas itens fracos por rodada.";
        priority = severeCpa ? "CRITICAL" : "HIGH";
        steps = [
          "Abrir Anúncios e recursos e filtrar recursos com avaliação Baixa ou combinações com pouca entrega.",
          "Substituir primeiro títulos, descrições e imagens fracos por mensagens específicas do produto e da região da campanha.",
          "Manter ao menos um criativo de controle e não alterar orçamento, lance ou página de destino no mesmo ciclo.",
          `Reavaliar após 1.000 novas impressões; manter a rodada se o CTR alcançar ${targetCtr}% sem elevar o CPA.`,
        ];
      } else if (highCpa && hasStrategySample) {
        actionType = "SET_TARGET_CPA";
        recommendedStrategy = "TARGET_CPA";
        recommendedTargetCpa = safeTargetCpa;
        parameterLabel = "CPA observado → CPA-alvo";
        currentValue = campaign.cpa;
        recommendedValue = recommendedTargetCpa;
        parameterFormat = "currency";
        description = `Alterar a configuração para ${strategyLabel(recommendedStrategy)} com CPA-alvo inicial de ${formatBrl(recommendedTargetCpa ?? campaign.cpa)}; CPA observado atual: ${formatBrl(campaign.cpa)}.`;
        rationale = `${campaign.conversions} conversões dão amostra para uma meta; o CPA está ${round(((campaign.cpa / benchmarkCpa) - 1) * 100, 1)}% acima da referência de ${formatBrl(benchmarkCpa)}. A redução proposta é limitada a ${MAX_TARGET_CPA_REDUCTION_PERCENT}% por ciclo.`;
        expectedImpact = `Reduzir o CPA em direção a ${formatBrl(recommendedTargetCpa ?? benchmarkCpa)} sem aplicar um corte brusco que elimine volume.`;
        risk = "Um CPA-alvo agressivo pode restringir entrega; reverter se as conversões caírem mais de 20% sem melhora proporcional de eficiência.";
        priority = severeCpa ? "CRITICAL" : "HIGH";
        steps = [
          "Abrir Campanhas > selecionar a campanha > Configurações > Lances > Alterar estratégia de lances.",
          `Selecionar ${strategyLabel(recommendedStrategy)} e informar exatamente ${formatBrl(recommendedTargetCpa ?? campaign.cpa)}.`,
          "Não alterar orçamento, segmentação ou anúncios no mesmo dia, preservando a leitura causal.",
          "Reavaliar após 7 dias ou 30 conversões; reverter se o volume cair mais de 20% sem redução proporcional do CPA.",
        ];
      } else if (highCpa) {
        actionType = "REDUCE_WASTE";
        const wasteReferenceCpa = safeTargetCpa ?? benchmarkCpa;
        parameterLabel = "CPA de referência para liberar nova estratégia";
        currentValue = campaign.cpa;
        recommendedValue = wasteReferenceCpa;
        parameterFormat = "currency";
        description = `Reduzir tráfego improdutivo mantendo ${currentStrategyLabel}; não definir CPA-alvo enquanto houver somente ${campaign.conversions} conversões.`;
        rationale = `CPA de ${formatBrl(campaign.cpa)} acima da referência de ${formatBrl(benchmarkCpa)}, mas abaixo da amostra mínima de ${MIN_STRATEGY_CHANGE_CONVERSIONS} conversões para uma troca segura de estratégia.`;
        expectedImpact = "Aproximar o CPA da referência por limpeza de tráfego antes de restringir a automação com uma meta prematura.";
        risk = "Negativas ou exclusões amplas podem remover demanda relevante; aplicar mudanças em blocos pequenos e registrar cada exclusão.";
        priority = severeCpa ? "CRITICAL" : "HIGH";
        steps = [
          "No Google Ads, abrir Termos de pesquisa e ordenar por custo sem conversão; não gerar relatório separado.",
          "Adicionar como negativas somente consultas inequivocamente irrelevantes; revisar correspondência antes de salvar.",
          "Em Performance Max, revisar insights de termos, grupos de recursos e posicionamentos inadequados.",
          "Ao concluir, registrar no dashboard somente as palavras-chave negativas efetivamente aplicadas.",
          `Manter ${currentStrategyLabel} até atingir ${MIN_STRATEGY_CHANGE_CONVERSIONS} conversões; então reavaliar CPA desejado em torno de ${formatBrl(wasteReferenceCpa)}.`,
        ];
      } else if (allocation) {
        actionType = "INCREASE_BUDGET";
        recommendedDailyBudget = allocation.recommended;
        parameterLabel = "Orçamento diário";
        currentValue = allocation.current;
        recommendedValue = allocation.recommended;
        parameterFormat = "currency";
        description = `Aumentar o orçamento diário de ${formatBrl(allocation.current)} para ${formatBrl(allocation.recommended)} (+${allocation.changePercent}%), mantendo ${currentStrategyLabel}.`;
        rationale = `CPA eficiente de ${formatBrl(campaign.cpa)}, ${campaign.searchBudgetLostImpressionShare}% de perda por orçamento e pacing da conta em ${pacePercent}%. O aumento cabe no headroom diário calculado de ${formatBrl(accountDailyHeadroom)}.`;
        expectedImpact = "Recuperar parte da demanda perdida por orçamento sem ultrapassar o ritmo necessário para consumir a verba mensal.";
        risk = `Limite por ciclo: ${MAX_DAILY_BUDGET_INCREASE_PERCENT}%. Interromper novos aumentos se o CPA superar ${formatBrl(benchmarkCpa * 1.15)}.`;
        priority = "MEDIUM";
        steps = [
          "Abrir Campanhas > selecionar a campanha > Configurações > Orçamento.",
          `Substituir ${formatBrl(allocation.current)} por ${formatBrl(allocation.recommended)}; não arredondar para outro valor.`,
          `Manter ${currentStrategyLabel} e não alterar o CPA-alvo no mesmo ciclo.`,
          `Reavaliar em 72 horas; não ampliar novamente se o CPA superar ${formatBrl(benchmarkCpa * 1.15)} ou o pacing atingir 100%.`,
        ];
      } else {
        const impressionShare = campaign.searchImpressionShare;
        const optimizationScore = campaign.optimizationScore;
        const lowImpressionShare = impressionShare != null && impressionShare < 40;
        const lowOptimizationScore = optimizationScore != null && optimizationScore < 70;
        if (!lowImpressionShare && !lowOptimizationScore) return null;
        actionType = "IMPROVE_AD_RANK";
        if (lowImpressionShare) {
          const targetShare = round(Math.min((impressionShare ?? 0) + 10, 60), 1);
          parameterLabel = "Parcela de impressões de pesquisa";
          currentValue = impressionShare;
          recommendedValue = targetShare;
          parameterFormat = "percent";
        } else {
          parameterLabel = "Índice de otimização";
          currentValue = optimizationScore;
          recommendedValue = 80;
          parameterFormat = "percent";
        }
        description = `Melhorar ranking e relevância sem alterar ${currentStrategyLabel}, orçamento ou CPA-alvo neste ciclo.`;
        rationale = lowImpressionShare
          ? `Parcela de impressões em ${impressionShare}%; há espaço de cobertura sem evidência suficiente para escalar orçamento.`
          : `Índice de otimização em ${optimizationScore}%; priorizar recomendações de qualidade que não alterem automaticamente a verba.`;
        expectedImpact = "Ganhar cobertura por relevância e qualidade antes de pagar mais pela mesma demanda.";
        risk = "Aplicar recomendações automáticas sem revisão pode ampliar segmentação ou alterar lances; aceitar somente itens coerentes com a campanha.";
        priority = "LOW";
        steps = [
          "Abrir a campanha e revisar a página Recomendações sem aplicar tudo automaticamente.",
          "Atualizar recursos com baixa força, URLs e mensagens alinhadas ao grupo ou produto da campanha.",
          "Revisar termos, públicos e páginas de destino antes de qualquer expansão de correspondência.",
          "Medir a parcela de impressões e o CPA por 7 dias mantendo orçamento e estratégia inalterados.",
        ];
      }

      if (!actionType) return null;
      const signatureTarget = [
        recommendedStrategy,
        recommendedTargetCpa?.toFixed(2) ?? "na",
        recommendedDailyBudget?.toFixed(2) ?? "na",
        String(recommendedValue ?? "na"),
      ].join("|");

      return {
        sourceSignature: `${campaign.campaignId}:${actionType}:${signatureTarget}`.slice(0, 255),
        campaignId: campaign.campaignId,
        campaign: campaign.campaign,
        product: campaign.product,
        region: campaign.regionType === "regional" ? campaign.region : null,
        monthlyLeadGoal: hasRegionalEvidence ? campaign.monthlyLeadGoal : null,
        actionType,
        description,
        rationale,
        evidence: {
          status: campaign.status,
          spend: campaign.spend,
          conversions: campaign.conversions,
          clicks: campaign.clicks,
          cpa: campaign.cpa,
          currentCpa: campaign.cpa,
          benchmarkCpa,
          recommendedTargetCpa,
          currentStrategy,
          currentStrategyLabel,
          recommendedStrategy,
          recommendedStrategyLabel: strategyLabel(recommendedStrategy),
          currentDailyBudget: campaign.budget,
          recommendedDailyBudget,
          budgetChangePercent: allocation?.changePercent ?? null,
          parameterLabel,
          currentValue,
          recommendedValue,
          parameterFormat,
          optimizationScore: campaign.optimizationScore,
          searchImpressionShare: campaign.searchImpressionShare,
          searchBudgetLostImpressionShare: campaign.searchBudgetLostImpressionShare,
          pacingPercent: pacePercent,
          accountDailyBudgetHeadroom: accountDailyHeadroom,
          monthlyLeadGoal: hasRegionalEvidence ? campaign.monthlyLeadGoal : null,
          strategySampleMinimum: MIN_STRATEGY_CHANGE_CONVERSIONS,
        },
        expectedImpact,
        risk,
        priority,
        steps,
        budgetIncreaseEligible: allocation != null,
        budgetIncreaseBlockedReasons: blockedReasons,
      };
    })
    .filter((recommendation): recommendation is NonNullable<typeof recommendation> => recommendation != null)
    .sort((left, right) => {
      const order: Record<RecommendationPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[left.priority] - order[right.priority] || right.evidence.spend - left.evidence.spend;
    });

  return {
    recommendations,
    policy: {
      onePrimaryActionPerCampaign: true,
      minimumConversionsForScaling: MIN_RANKING_CONVERSIONS,
      minimumConversionsForStrategyChange: MIN_STRATEGY_CHANGE_CONVERSIONS,
      maximumTargetCpaReductionPercent: MAX_TARGET_CPA_REDUCTION_PERCENT,
      maximumDailyBudgetIncreasePercent: MAX_DAILY_BUDGET_INCREASE_PERCENT,
      minimumBudgetLossForScaling: 20,
      requiresRegionalGoalForScaling: true,
      totalDailyBudgetHeadroom: round(accountDailyHeadroom, 2),
      allocatedDailyBudgetIncrease: round(accountDailyHeadroom - remainingDailyHeadroom, 2),
      message:
        "Cada campanha recebe no máximo uma ação primária. Mudanças de estratégia exigem amostra; CPA-alvo e orçamento têm limites por ciclo; aumentos somados não excedem o headroom diário da conta.",
    },
  };
}
