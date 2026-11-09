import type { ModelAnalysis } from "./modelAnalysis";
import type { UserRole } from "./accountRoles";

export type AdminModelInsightsStatus = "READY" | "NOT_CONFIGURED";
export type AdminModelInsightsDimension =
  | "state"
  | "channel"
  | "dealer"
  | "campaign";
export type AdminModelInsightsCoverage =
  | "COVERED"
  | "PARTIAL"
  | "NOT_COVERED"
  | "NOT_CONFIGURED";

/** The route accepts the same applied filters as the Leads table; pagination is never used. */
export type AdminModelInsightsFilters = {
  dateFrom: string;
  dateTo: string;
  model?: string;
  channel?: string;
  campaign?: string;
  dealer?: string;
  search?: string;
};

export type AdminModelInsightsSource = {
  name: string | null;
  importedAt: string | null;
  mode: "authenticated-import";
  totalRows: number | null;
  invalidDateRows: number | null;
  earliestLeadDate: string | null;
  latestLeadDate: string | null;
  currentCoverage: AdminModelInsightsCoverage;
  previousCoverage: AdminModelInsightsCoverage;
};

export type AdminModelMixRow = {
  model: string;
  count: number;
  denominator: number;
  sharePercent: number | null;
  identified: boolean;
};

export type AdminModelMix = {
  total: number;
  denominator: number;
  models: AdminModelMixRow[];
  identifiedTotal: number;
  unidentifiedTotal: number;
};

export type AdminModelMatrixCategory = {
  label: string;
  count: number;
  denominator: number;
  sharePercent: number | null;
  identified: boolean;
};

export type AdminModelMatrixCell = {
  category: string;
  model: string;
  count: number;
  /** Denominator for the model share inside this category. */
  categoryDenominator: number;
  /** Denominator for the category share inside this model. */
  modelDenominator: number;
  shareOfCategoryPercent: number | null;
  shareOfModelPercent: number | null;
};

export type AdminModelMatrixRow = {
  model: string;
  count: number;
  denominator: number;
  identified: boolean;
  cells: AdminModelMatrixCell[];
};

/** Matrices contain every observed category; they are never page-limited. */
export type AdminModelMatrix = {
  dimension: AdminModelInsightsDimension;
  total: number;
  denominator: number;
  categories: AdminModelMatrixCategory[];
  rows: AdminModelMatrixRow[];
};

export type AdminModelInsightsDaily = {
  date: string;
  total: number | null;
  denominator: number | null;
  models: Record<string, number>;
  sourceAvailable: boolean;
};

export type AdminModelComparisonRow = {
  model: string;
  identified: boolean;
  currentCount: number;
  currentDenominator: number;
  currentSharePercent: number | null;
  previousCount: number | null;
  previousDenominator: number | null;
  previousSharePercent: number | null;
  deltaCount: number | null;
  deltaSharePP: number | null;
};

export type AdminModelComparison = {
  status: "AVAILABLE" | "NOT_AVAILABLE" | "NOT_CONFIGURED";
  currentPeriod: { dateFrom: string; dateTo: string; days: number };
  previousPeriod: { dateFrom: string; dateTo: string; days: number };
  rows: AdminModelComparisonRow[];
  note: string;
};

export type AdminModelMixOpportunity = {
  dimension: AdminModelInsightsDimension;
  group: string;
  model: string;
  groupCount: number;
  groupDenominator: number;
  modelCount: number;
  actualSharePercent: number;
  expectedSharePercent: number;
  expectedCount: number;
  gapPP: number;
  /** Actual minus benchmark volume; positive means above the recorte share. */
  estimatedVolumeDifference: number;
  sampleThreshold: number;
};

export type AdminModelVersionQuality = {
  model: string;
  denominator: number;
  identified: number;
  missing: number;
  invalid: number;
  missingOrInvalidSharePercent: number | null;
};

export type AdminModelQualityGap = {
  dimension: "model" | "version" | AdminModelInsightsDimension;
  code: "UNKNOWN" | "MISSING" | "INVALID" | "UNRECONCILED";
  label: string;
  model?: string;
  count: number;
  denominator: number;
  sharePercent: number | null;
  commercialEligible: false;
};

export type AdminModelQuality = {
  lowSampleThreshold: number;
  unknownModelCount: number;
  missingStateCount: number;
  missingDealerCount: number;
  missingCampaignCount: number;
  versionsMissing: number;
  versionsInvalid: number;
  versionByModel: AdminModelVersionQuality[];
  gaps: AdminModelQualityGap[];
};

export type AdminModelInsightKind =
  | "LOW_SAMPLE"
  | "CONCENTRATION"
  | "MIX_GAP"
  | "QUALITY_GAP"
  | "VERSION_GAP";

export type AdminModelInsight = {
  kind: AdminModelInsightKind;
  priority: number;
  dimension?: "model" | "version" | AdminModelInsightsDimension;
  model?: string;
  group?: string;
  count?: number;
  sharePercent?: number | null;
  title: string;
  detail: string;
};

export type AdminModelInsights = {
  status: AdminModelInsightsStatus;
  /** This endpoint is deliberately admin-only; the field documents the contract. */
  audience: Extract<UserRole, "admin">;
  period: {
    dateFrom: string;
    dateTo: string;
    cutoffDate: string;
    days: number;
    filters: AdminModelInsightsFilters;
  };
  source: AdminModelInsightsSource;
  total: number;
  mix: AdminModelMix;
  /** Existing dashboard model/version aggregation, built from the full filtered population. */
  modelAnalysis: ModelAnalysis;
  matrices: {
    state: AdminModelMatrix;
    channel: AdminModelMatrix;
    dealer: AdminModelMatrix;
    campaign: AdminModelMatrix;
  };
  daily: AdminModelInsightsDaily[];
  comparison: AdminModelComparison;
  opportunities: AdminModelMixOpportunity[];
  quality: AdminModelQuality;
  insights: AdminModelInsight[];
  limits: {
    maxInsights: number;
    insightsTruncated: boolean;
    maxOpportunities: number;
    opportunitiesTruncated: boolean;
    matricesTruncated: false;
  };
  notes: string[];
};
