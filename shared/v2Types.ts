export type V2Filters = {
  dateFrom: string;
  dateTo: string;
  model?: string;
  channel?: string;
  campaign?: string;
  dealer?: string;
  search?: string;
  page?: number;
};
export type V2Count = { label: string; count: number };
export type V2CommercialGroupRecord = {
  kind: "lead-goals" | "sales-goals" | "sales";
  key: string;
  sourceLabel: string;
  dealers: string[];
  value: number | null;
  leads: number;
};
export type V2Lead = {
  id: number;
  date: string;
  hour: number | null;
  name: string;
  model: string;
  version: string;
  channel: string;
  campaign: string;
  dealer: string;
  city: string;
  state: string;
  crm: string;
};
export type V2Pacing = {
  competence: string;
  goal: number | null;
  current: number;
  closedDays: number;
  daysInMonth: number;
  daysRemaining: number;
  averagePerDay: number;
  requiredPerDay: number | null;
  projection: number;
  projectedDifference: number | null;
  remainingToGoal: number | null;
  progressPercent: number | null;
  status: "AHEAD" | "BEHIND" | "ON_TRACK" | "NO_GOAL";
};
export type V2Dashboard = {
  status: "READY" | "NOT_CONFIGURED";
  source: {
    name: string;
    importedAt: string | null;
    mode: "authenticated-import";
    totalRows: number;
    invalidDateRows: number;
  };
  period: { dateFrom: string; dateTo: string; cutoffDate: string };
  options: {
    models: string[];
    channels: string[];
    campaigns: string[];
    dealers: string[];
  };
  summary: {
    total: number;
    models: number;
    dealers: number;
    states: number;
    cities: number;
    crmRate: number | null;
    crmDelivered: number | null;
    topModel: V2Count | null;
    topState: V2Count | null;
    peakHour: V2Count | null;
  };
  pacing: V2Pacing;
  daily: {
    date: string;
    total: number;
    channels: Record<string, number>;
    cumulative: number;
    pace: number | null;
  }[];
  channels: V2Count[];
  models: V2Count[];
  states: V2Count[];
  cities: V2Count[];
  dealers: V2Count[];
  hours: V2Count[];
  campaigns: V2Count[];
  versions: V2Count[];
  crm: V2Count[];
  recent: { rows: V2Lead[]; total: number; page: number; pageSize: number };
  dealerPerformance: {
    warnings?: string[];
    unmapped?: Array<{
      kind: "lead-goals" | "sales-goals" | "sales";
      key: string;
      sourceLabel: string;
      state: string | null;
      value: number | null;
    }>;
    unreconciledDealers?: Array<{ sourceLabel: string; leads: number }>;
    groupedGoals?: V2CommercialGroupRecord[];
    available: boolean;
    sourceName: string | null;
    updatedAt: string | null;
    rows: {
      dealer: string;
      state: string;
      leads: number;
      leadGoal: number | null;
      sales: number | null;
      salesGoal: number | null;
      conversionRate: number | null;
    }[];
    totals: {
      leads: number;
      leadGoal: number | null;
      sales: number | null;
      salesGoal: number | null;
      conversionRate: number | null;
    };
  };
  notes: string[];
};
