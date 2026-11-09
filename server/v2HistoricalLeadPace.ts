import type {
  HistoricalLeadPace,
  HistoricalLeadPacePoint,
  HistoricalLeadPaceReference,
  HistoricalLeadPaceScenario,
} from "../shared/historicalLeadPace";
import {
  groupedModelLabel,
  resolveOfficialModel,
  UNIDENTIFIED_MODEL,
} from "../shared/modelRegistry";
import { resolveRegisteredDealer } from "../shared/dealerRegistryExtensions";
import { resolveBrazilianState } from "../shared/stateRegistry";
import { resolveModelVersion } from "./v2ModelAnalysis";
import { isLegacyLeadChannelActive } from "./v2LeadCounting";
import { resolveDashboardPeriod } from "../shared/dashboardDates";
import type { ExtraDealerRegistryEntry } from "../shared/dealerRegistryExtensions";
import type { V2Dashboard, V2Filters, V2Lead } from "../shared/v2Types";

export type HistoricalLeadPaceWindow = {
  dateFrom: string;
  dateTo: string;
  competence: string;
};

/**
 * Rows already selected by filterV2LeadRows can be supplied by the dashboard
 * aggregator. This keeps the production path on the canonical selector while
 * retaining a pure, directly testable fallback for callers of this module.
 */
export type HistoricalLeadPacePrepared = {
  filteredRows: readonly V2Lead[];
};

type SourceCoverage = {
  configured: boolean;
  earliest: string | null;
  latest: string | null;
};

type HistoricalMonth = {
  competence: string;
  total: number | null;
  available: boolean;
  reason: string | null;
  cumulative: number[];
  normalized: number[];
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthStart(competence: string): string {
  return `${competence}-01`;
}

function daysInMonth(competence: string): number {
  const [year, month] = competence.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(competence: string, amount: number): string {
  const [year, month] = competence.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function monthEnd(competence: string): string {
  return `${competence}-${String(daysInMonth(competence)).padStart(2, "0")}`;
}

function monthLabel(competence: string): string {
  return MONTH_FORMATTER.format(new Date(`${competence}-01T00:00:00.000Z`));
}

function isDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function minDate(values: readonly V2Lead[]): string | null {
  let result: string | null = null;
  for (const row of values) {
    if (!isDate(row.date)) continue;
    if (result === null || row.date < result) result = row.date;
  }
  return result;
}

function maxDate(values: readonly V2Lead[]): string | null {
  let result: string | null = null;
  for (const row of values) {
    if (!isDate(row.date)) continue;
    if (result === null || row.date > result) result = row.date;
  }
  return result;
}

/** The database read must cover the selected period and the three prior months. */
export function historicalLeadPaceWindow(
  input: V2Filters,
  now = new Date()
): HistoricalLeadPaceWindow {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const competence = period.dateTo.slice(0, 7);
  const historyStart = monthStart(addMonths(competence, -3));
  return {
    dateFrom: period.dateFrom < historyStart ? period.dateFrom : historyStart,
    dateTo: period.dateTo,
    competence,
  };
}

function matchesDimensions(
  row: V2Lead,
  input: Pick<
    V2Filters,
    "model" | "channel" | "campaign" | "dealer" | "search"
  >,
  extraDealers: readonly ExtraDealerRegistryEntry[]
): boolean {
  const lowerSearch = input.search?.toLocaleLowerCase("pt-BR");
  const modelMatches =
    !input.model ||
    (input.model === UNIDENTIFIED_MODEL
      ? resolveOfficialModel(row.model) === null
      : row.model === input.model ||
        groupedModelLabel(row.model) === input.model);
  const searchValues = [
    row.name,
    row.model,
    resolveOfficialModel(row.model) ?? "",
    row.version,
    row.channel,
    row.campaign,
    row.dealer,
    resolveRegisteredDealer(row.dealer, extraDealers) ?? "",
    row.city,
    row.state,
    resolveBrazilianState(row.state)?.name ?? "",
  ];
  if (lowerSearch) {
    const version = resolveModelVersion(row.model, row.version);
    if (version.status === "IDENTIFIED") searchValues.push(version.version);
  }
  return (
    modelMatches &&
    (!input.channel || row.channel === input.channel) &&
    (!input.campaign || row.campaign === input.campaign) &&
    (!input.dealer ||
      row.dealer === input.dealer ||
      resolveRegisteredDealer(row.dealer, extraDealers) === input.dealer) &&
    (!lowerSearch ||
      searchValues.some(value =>
        value.toLocaleLowerCase("pt-BR").includes(lowerSearch)
      ))
  );
}

function canonicalRows(
  all: readonly V2Lead[],
  input: V2Filters,
  window: HistoricalLeadPaceWindow,
  extraDealers: readonly ExtraDealerRegistryEntry[]
): V2Lead[] {
  return all.filter(
    row =>
      row.date >= window.dateFrom &&
      row.date <= window.dateTo &&
      isLegacyLeadChannelActive(row.channel, row.date) &&
      matchesDimensions(row, input, extraDealers)
  );
}

function sourceCoverage(
  source: V2Dashboard["source"],
  all: readonly V2Lead[]
): SourceCoverage {
  const configured = Boolean(source.importedAt);
  if (!configured) return { configured: false, earliest: null, latest: null };

  // Older fixtures do not carry the range fields. Derive only for that
  // compatibility case; an explicit null remains an unavailable source.
  const earliest =
    source.earliestLeadDate === undefined
      ? minDate(all)
      : isDate(source.earliestLeadDate)
        ? source.earliestLeadDate
        : null;
  const latest =
    source.latestLeadDate === undefined
      ? maxDate(all)
      : isDate(source.latestLeadDate)
        ? source.latestLeadDate
        : null;
  return { configured, earliest, latest };
}

function covered(
  coverage: SourceCoverage,
  dateFrom: string,
  dateTo: string
): boolean {
  return Boolean(
    coverage.configured &&
      coverage.earliest &&
      coverage.latest &&
      coverage.earliest <= dateFrom &&
      coverage.latest >= dateTo
  );
}

function dailyCounts(
  rows: readonly V2Lead[],
  competence: string
): { counts: number[]; total: number } {
  const days = daysInMonth(competence);
  const counts = Array.from({ length: days }, () => 0);
  for (const row of rows) {
    if (!row.date.startsWith(`${competence}-`)) continue;
    const day = Number(row.date.slice(8, 10));
    if (day >= 1 && day <= days) counts[day - 1]++;
  }
  return { counts, total: counts.reduce((sum, count) => sum + count, 0) };
}

/**
 * Resample a cumulative calendar curve through its normalized day position.
 * Index zero is an explicit zero, so the final target day always equals total.
 */
function resampleCumulative(
  counts: readonly number[],
  targetDays: number,
  total: number
): number[] {
  if (total <= 0) return [];
  const cumulative = [0];
  for (const count of counts) cumulative.push(cumulative.at(-1)! + count);
  const sourceDays = counts.length;
  return Array.from({ length: targetDays }, (_, index) => {
    const targetDay = index + 1;
    const position = (targetDay / targetDays) * sourceDays;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const lowerValue = cumulative[Math.min(lower, sourceDays)] ?? total;
    const upperValue = cumulative[Math.min(upper, sourceDays)] ?? total;
    const value =
      lower === upper
        ? lowerValue
        : lowerValue + (upperValue - lowerValue) * (position - lower);
    return targetDay === targetDays ? total : value;
  });
}

function createHistoricalMonth(
  competence: string,
  targetDays: number,
  rows: readonly V2Lead[],
  coverage: SourceCoverage
): HistoricalMonth {
  const start = monthStart(competence);
  const end = monthEnd(competence);
  if (!coverage.configured) {
    return {
      competence,
      total: null,
      available: false,
      reason: "NO_SOURCE",
      cumulative: [],
      normalized: [],
    };
  }
  if (!covered(coverage, start, end)) {
    return {
      competence,
      total: null,
      available: false,
      reason: "SOURCE_LAG",
      cumulative: [],
      normalized: [],
    };
  }
  const monthRows = rows.filter(row => row.date >= start && row.date <= end);
  const daily = dailyCounts(monthRows, competence);
  if (daily.total <= 0) {
    return {
      competence,
      total: 0,
      available: false,
      reason: "EMPTY_MONTH",
      cumulative: [],
      normalized: [],
    };
  }
  const cumulative = resampleCumulative(daily.counts, targetDays, daily.total);
  return {
    competence,
    total: daily.total,
    available: true,
    reason: null,
    cumulative,
    normalized: cumulative.map(value => value / daily.total),
  };
}

function makeReference(month: HistoricalMonth): HistoricalLeadPaceReference {
  return {
    competence: month.competence,
    total: month.total,
    available: month.available,
    reason: month.reason,
    cumulative: month.cumulative,
  };
}

function isValidHistory(month: HistoricalMonth): boolean {
  return month.available && month.total !== null && month.total > 0;
}

function meanCurve(
  months: readonly HistoricalMonth[],
  targetDays: number
): number[] | null {
  if (months.length === 0 || months.some(month => !isValidHistory(month))) {
    return null;
  }
  const result = Array.from(
    { length: targetDays },
    (_, day) =>
      months.reduce((sum, month) => sum + month.normalized[day], 0) /
      months.length
  );
  result[result.length - 1] = 1;
  return result;
}

function historicalReasonLabel(reason: string | null): string {
  switch (reason) {
    case "NO_SOURCE":
      return "fonte não configurada";
    case "SOURCE_LAG":
      return "cobertura da fonte incompleta";
    case "EMPTY_MONTH":
      return "mês coberto sem Leads positivos";
    default:
      return "histórico indisponível";
  }
}

function buildScenario(
  key: HistoricalLeadPaceScenario["key"],
  label: string,
  months: readonly HistoricalMonth[],
  allMonths: readonly HistoricalMonth[],
  points: HistoricalLeadPacePoint[],
  coverage: SourceCoverage,
  asOfDate: string,
  asOfDay: number,
  goal: number | null,
  current: number,
  curve: number[] | null
): HistoricalLeadPaceScenario {
  const sourceAvailableAsOf = covered(coverage, asOfDate, asOfDate);
  const historyReady = curve !== null;
  let status: HistoricalLeadPaceScenario["status"];
  if (!coverage.configured) status = "NO_SOURCE";
  else if (!sourceAvailableAsOf) status = "SOURCE_LAG";
  else if (!historyReady) status = "NO_HISTORY";
  else status = "READY";

  const expectedShare = curve ? (curve[asOfDay - 1] ?? null) : null;
  const expectedToDate =
    goal !== null && expectedShare !== null
      ? Math.round(goal * expectedShare)
      : null;
  const gapToDate =
    expectedToDate === null || !sourceAvailableAsOf
      ? null
      : current - expectedToDate;
  const gapPercent =
    gapToDate !== null && expectedToDate !== null && expectedToDate > 0
      ? gapToDate! / expectedToDate
      : null;
  const canProject =
    status === "READY" &&
    expectedShare !== null &&
    expectedShare > 0 &&
    sourceAvailableAsOf;
  const projection = canProject ? Math.round(current / expectedShare!) : null;
  const projectedDifference =
    projection === null || goal === null ? null : projection - goal;

  const scenarioPoints = points.map(point => ({ ...point }));
  if (curve && canProject && projection !== null && expectedShare !== null) {
    const asOfIndex = asOfDay - 1;
    const remainingShare = 1 - expectedShare;
    for (let index = 0; index < scenarioPoints.length; index++) {
      if (index < asOfIndex) {
        scenarioPoints[index].plan =
          goal === null ? null : Math.round(goal * curve[index]);
        scenarioPoints[index].projection = null;
        continue;
      }
      scenarioPoints[index].plan =
        goal === null ? null : Math.round(goal * curve[index]);
      if (index === asOfIndex) {
        scenarioPoints[index].projection = current;
      } else if (remainingShare <= 0) {
        scenarioPoints[index].projection = projection;
      } else {
        const continuation = (curve[index] - expectedShare) / remainingShare;
        scenarioPoints[index].projection = Math.round(
          current + (projection - current) * continuation
        );
      }
    }
  } else if (curve && goal !== null) {
    for (let index = 0; index < scenarioPoints.length; index++) {
      scenarioPoints[index].plan = Math.round(goal * curve[index]);
      scenarioPoints[index].projection = null;
    }
  }

  const warnings: string[] = [];
  if (status === "NO_SOURCE") {
    warnings.push("Fonte de Leads não configurada.");
  } else if (status === "SOURCE_LAG") {
    warnings.push(
      `A fonte de Leads não cobre o corte de ${asOfDate}; a projeção fica indisponível.`
    );
  } else if (status === "NO_HISTORY") {
    const missing = months
      .filter(month => !isValidHistory(month))
      .map(
        month =>
          `${monthLabel(month.competence)} (${historicalReasonLabel(month.reason)})`
      );
    warnings.push(
      key === "last3Months"
        ? "A média de 3 meses exige os três meses fechados, cobertos e com volume positivo."
        : "O último mês fechado não tem histórico coberto e positivo suficiente."
    );
    if (missing.length) warnings.push(`Indisponível: ${missing.join(", ")}.`);
  }
  if (goal === null) {
    warnings.push("Meta mensal não aplicada a este recorte.");
  }
  if (
    key === "last3Months" &&
    allMonths.some(month => !isValidHistory(month))
  ) {
    const invalid = allMonths.filter(month => !isValidHistory(month));
    if (status !== "NO_HISTORY") {
      warnings.push(
        `Referência incompleta: ${invalid
          .map(month => monthLabel(month.competence))
          .join(", ")}.`
      );
    }
  }

  let paceStatus: HistoricalLeadPaceScenario["paceStatus"];
  if (goal === null) paceStatus = "NO_GOAL";
  else if (status !== "READY" || expectedToDate === null)
    paceStatus = "UNAVAILABLE";
  else if (current > expectedToDate) paceStatus = "AHEAD";
  else if (current < expectedToDate) paceStatus = "BEHIND";
  else paceStatus = "ON_TRACK";

  return {
    key,
    label,
    status,
    referenceMonths: months.map(month => month.competence),
    expectedShare,
    expectedToDate,
    gapToDate,
    gapPercent,
    projection,
    projectedDifference,
    paceStatus,
    points: scenarioPoints,
    warnings,
  };
}

function currentRealPoints(
  competence: string,
  days: number,
  asOfDate: string,
  rows: readonly V2Lead[],
  coverage: SourceCoverage
): {
  points: HistoricalLeadPacePoint[];
  current: number;
  lastAvailableDate: string | null;
} {
  const start = monthStart(competence);
  const usableRows = rows.filter(
    row => row.date >= start && row.date <= asOfDate
  );
  const latest = coverage.latest;
  const sourceRows =
    coverage.configured && latest
      ? usableRows.filter(
          row =>
            (!coverage.earliest || row.date >= coverage.earliest) &&
            row.date <= latest
        )
      : [];
  const daily = dailyCounts(sourceRows, competence).counts;
  let cumulative = 0;
  const points: HistoricalLeadPacePoint[] = [];
  for (let index = 0; index < days; index++) {
    const date = `${competence}-${String(index + 1).padStart(2, "0")}`;
    const coveredDate = covered(coverage, date, date);
    const beforeCutoff = date <= asOfDate;
    if (coveredDate && beforeCutoff) {
      cumulative += daily[index] ?? 0;
      points.push({
        date,
        day: index + 1,
        real: cumulative,
        plan: null,
        projection: null,
      });
    } else {
      points.push({
        date,
        day: index + 1,
        real: null,
        plan: null,
        projection: null,
      });
    }
  }
  const current = cumulative;
  const lastAvailableDate =
    coverage.configured &&
    coverage.earliest &&
    coverage.latest &&
    coverage.earliest <= asOfDate &&
    coverage.latest >= start
      ? coverage.latest < asOfDate
        ? coverage.latest
        : asOfDate
      : null;
  return { points, current, lastAvailableDate };
}

/**
 * Build the historical Lead Pace payload without touching the database or
 * mutating the dashboard input. Source and rows are the dashboard's real
 * analytical population; no spreadsheet totals or linear fallback are used.
 */
export function buildHistoricalLeadPace(
  all: V2Lead[],
  input: V2Filters,
  goal: number | null,
  source: V2Dashboard["source"],
  now = new Date(),
  extraDealers: readonly ExtraDealerRegistryEntry[] = [],
  prepared?: HistoricalLeadPacePrepared
): HistoricalLeadPace {
  const window = historicalLeadPaceWindow(input, now);
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const competence = window.competence;
  const targetDays = daysInMonth(competence);
  const asOfDate = period.dateTo;
  const asOfDay = Number(asOfDate.slice(8, 10));
  const coverage = sourceCoverage(source, all);
  const narrowed = Boolean(
    input.model ||
      input.channel ||
      input.campaign ||
      input.dealer ||
      input.search
  );
  const effectiveGoal = narrowed ? null : goal;
  const filteredRows = prepared
    ? [...prepared.filteredRows]
    : canonicalRows(all, input, window, extraDealers);
  const current = currentRealPoints(
    competence,
    targetDays,
    asOfDate,
    filteredRows,
    coverage
  );

  const referenceMonths = [-3, -2, -1].map(offset =>
    createHistoricalMonth(
      addMonths(competence, offset),
      targetDays,
      filteredRows,
      coverage
    )
  );
  const references = referenceMonths.map(makeReference);
  const lastMonthCurve = meanCurve([referenceMonths[2]], targetDays);
  const last3Curve = meanCurve(referenceMonths, targetDays);
  const basePoints = current.points;
  const last3Label = `Média de 3 meses — ${monthLabel(
    referenceMonths[0].competence
  )} a ${monthLabel(referenceMonths[2].competence)}`;
  const lastMonthLabel = `Último mês — ${monthLabel(
    referenceMonths[2].competence
  )}`;
  const lastMonth = buildScenario(
    "lastMonth",
    lastMonthLabel,
    [referenceMonths[2]],
    referenceMonths,
    basePoints,
    coverage,
    asOfDate,
    asOfDay,
    effectiveGoal,
    current.current,
    lastMonthCurve
  );
  const last3Months = buildScenario(
    "last3Months",
    last3Label,
    referenceMonths,
    referenceMonths,
    basePoints,
    coverage,
    asOfDate,
    asOfDay,
    effectiveGoal,
    current.current,
    last3Curve
  );

  return {
    competence,
    asOfDate,
    lastAvailableDate: current.lastAvailableDate,
    daysInMonth: targetDays,
    current: current.current,
    goal: effectiveGoal,
    scope: narrowed ? "FILTERED" : "GLOBAL",
    reference: references,
    lastMonth,
    last3Months,
  };
}
