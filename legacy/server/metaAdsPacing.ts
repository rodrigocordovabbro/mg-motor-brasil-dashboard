export type MetaAdsPacingDailyInput = {
  date: string;
  spend: number;
};

export type MetaAdsPacingStatus = "ON_TRACK" | "AHEAD" | "BEHIND" | "NOT_STARTED";

export type MetaAdsMonthlyPacingPlan = {
  competence: string;
  monthlyNetBudget: number;
  source: "USER_CONFIRMED_NET_BUDGET";
};

export type MetaAdsPacing = {
  competence: string;
  monthlyNetBudget: number;
  calendarDays: number;
  coveredDays: number;
  daysRemaining: number;
  dataThroughDate: string;
  dailyPlannedSpend: number;
  actualSpend: number;
  plannedSpendToDate: number;
  varianceToPlan: number;
  pacingPercent: number;
  projectedMonthlySpend: number;
  projectedVarianceToBudget: number;
  remainingBudget: number;
  requiredDailySpend: number;
  status: MetaAdsPacingStatus;
  source: MetaAdsMonthlyPacingPlan["source"];
  daily: Array<{
    date: string;
    actualSpend: number;
    plannedSpend: number;
    actualCumulativeSpend: number;
    plannedCumulativeSpend: number;
  }>;
};

export const META_ADS_MONTHLY_PACING_PLANS: ReadonlyArray<MetaAdsMonthlyPacingPlan> = [
  {
    competence: "2026-10",
    monthlyNetBudget: 129_296.43,
    source: "USER_CONFIRMED_NET_BUDGET",
  },
];

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function monthStart(competence: string) {
  return `${competence}-01`;
}

function daysInMonth(competence: string) {
  const [year, month] = competence.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countDaysInclusive(from: string, to: string) {
  const start = new Date(`${from}T12:00:00.000Z`).getTime();
  const end = new Date(`${to}T12:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function classifyPacing(actualSpend: number, plannedSpend: number): MetaAdsPacingStatus {
  if (plannedSpend <= 0) return "NOT_STARTED";
  const deviation = (actualSpend - plannedSpend) / plannedSpend;
  if (deviation > 0.05) return "AHEAD";
  if (deviation < -0.05) return "BEHIND";
  return "ON_TRACK";
}

/**
 * Builds month-to-date pacing only when the full configured month is selected.
 * This avoids treating a custom date range as a monthly pacing baseline.
 */
export function buildMetaAdsPacing(input: {
  dateFrom: string;
  dateTo: string;
  daily: MetaAdsPacingDailyInput[];
}): MetaAdsPacing | null {
  if (!isIsoDate(input.dateFrom) || !isIsoDate(input.dateTo)) return null;
  const competence = input.dateFrom.slice(0, 7);
  if (input.dateTo.slice(0, 7) !== competence || input.dateFrom !== monthStart(competence)) {
    return null;
  }

  const plan = META_ADS_MONTHLY_PACING_PLANS.find(item => item.competence === competence);
  if (!plan) return null;

  const periodDaily = input.daily
    .filter(item => isIsoDate(item.date) && item.date >= input.dateFrom && item.date <= input.dateTo)
    .sort((left, right) => left.date.localeCompare(right.date));
  const dataThroughDate = periodDaily.at(-1)?.date;
  if (!dataThroughDate) return null;

  const calendarDays = daysInMonth(competence);
  const coveredDays = countDaysInclusive(monthStart(competence), dataThroughDate);
  const daysRemaining = Math.max(0, calendarDays - coveredDays);
  const dailyPlannedSpend = plan.monthlyNetBudget / calendarDays;
  const spendByDate = new Map<string, number>();
  for (const item of periodDaily) {
    spendByDate.set(item.date, (spendByDate.get(item.date) ?? 0) + item.spend);
  }

  let actualCumulativeSpend = 0;
  let plannedCumulativeSpend = 0;
  const daily = Array.from({ length: coveredDays }, (_, index) => {
    const date = addDays(monthStart(competence), index);
    const actualSpend = spendByDate.get(date) ?? 0;
    actualCumulativeSpend += actualSpend;
    plannedCumulativeSpend += dailyPlannedSpend;
    return {
      date,
      actualSpend: round(actualSpend),
      plannedSpend: round(dailyPlannedSpend),
      actualCumulativeSpend: round(actualCumulativeSpend),
      plannedCumulativeSpend: round(plannedCumulativeSpend),
    };
  });

  const actualSpend = round(actualCumulativeSpend);
  const plannedSpendToDate = round(dailyPlannedSpend * coveredDays);
  const varianceToPlan = round(actualSpend - plannedSpendToDate);
  const pacingPercent = plannedSpendToDate > 0
    ? round((actualSpend / plannedSpendToDate) * 100, 1)
    : 0;
  const projectedMonthlySpend = coveredDays > 0
    ? round((actualSpend / coveredDays) * calendarDays)
    : 0;
  const remainingBudget = round(plan.monthlyNetBudget - actualSpend);
  const requiredDailySpend = daysRemaining > 0
    ? round(Math.max(0, remainingBudget) / daysRemaining)
    : 0;

  return {
    competence,
    monthlyNetBudget: plan.monthlyNetBudget,
    calendarDays,
    coveredDays,
    daysRemaining,
    dataThroughDate,
    dailyPlannedSpend: round(dailyPlannedSpend),
    actualSpend,
    plannedSpendToDate,
    varianceToPlan,
    pacingPercent,
    projectedMonthlySpend,
    projectedVarianceToBudget: round(projectedMonthlySpend - plan.monthlyNetBudget),
    remainingBudget,
    requiredDailySpend,
    status: classifyPacing(actualSpend, plannedSpendToDate),
    source: plan.source,
    daily,
  };
}
