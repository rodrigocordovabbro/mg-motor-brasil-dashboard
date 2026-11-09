export type HistoricalLeadPaceScenarioKey = "lastMonth" | "last3Months";

export type HistoricalLeadPaceReference = {
  competence: string;
  total: number | null;
  available: boolean;
  reason: string | null;
  /** Cumulative historical volume resampled onto each day of the target month. */
  cumulative: number[];
};

export type HistoricalLeadPacePoint = {
  date: string;
  day: number;
  real: number | null;
  plan: number | null;
  /** Estimate only from the last confirmed actual day onwards. */
  projection: number | null;
};

export type HistoricalLeadPaceScenario = {
  key: HistoricalLeadPaceScenarioKey;
  label: string;
  status: "READY" | "NO_HISTORY" | "SOURCE_LAG" | "NO_SOURCE";
  referenceMonths: string[];
  expectedShare: number | null;
  expectedToDate: number | null;
  gapToDate: number | null;
  gapPercent: number | null;
  projection: number | null;
  projectedDifference: number | null;
  paceStatus: "AHEAD" | "BEHIND" | "ON_TRACK" | "NO_GOAL" | "UNAVAILABLE";
  points: HistoricalLeadPacePoint[];
  warnings: string[];
};

export type HistoricalLeadPace = {
  competence: string;
  asOfDate: string;
  lastAvailableDate: string | null;
  daysInMonth: number;
  current: number;
  goal: number | null;
  scope: "GLOBAL" | "FILTERED";
  reference: HistoricalLeadPaceReference[];
  lastMonth: HistoricalLeadPaceScenario;
  last3Months: HistoricalLeadPaceScenario;
};
