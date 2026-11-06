import type { V2Dashboard, V2Filters } from "./v2Types";

export const COMMERCIAL_UPLOAD_KINDS = [
  "lead-goals",
  "sales-goals",
  "sales",
] as const;

export type CommercialUploadKind = (typeof COMMERCIAL_UPLOAD_KINDS)[number];

export type CommercialSourceRow = {
  /** Stable only inside the uploaded workbook, suitable for a mapping form key. */
  key: string;
  /** The exact source label as supplied by the workbook, without fuzzy rewriting. */
  sourceLabel: string;
  state: string | null;
  value: number | null;
  /** Explicitly linked dashboard dealer labels; never inferred from a substring. */
  rawDealers: string[];
  /** Raw targets retained when an immutable mapping-only revision canonicalizes them. */
  originalRawDealers?: string[];
};

export type CommercialPreview = {
  kind: CommercialUploadKind;
  competence: string;
  asOf: string | null;
  sourceWeek?: number;
  fileName: string;
  fileSha256: string;
  rows: CommercialSourceRow[];
  total: number | null;
  warnings: string[];
  availableDealers: string[];
};

export type CommercialUploadInput = {
  kind: CommercialUploadKind;
  competence: string;
  asOf?: string;
  sourceWeek?: number;
  fileName: string;
  base64: string;
};

export type CommercialCommitInput = CommercialUploadInput & {
  mappings?: Record<string, string[]>;
};

export type CommercialActor = { id: number; username: string };

export type CommercialCommitResult = {
  importId: number;
  alreadyImported: boolean;
  total: number | null;
  rows: number;
  warnings: string[];
};

export type CommercialReconciliationResult = {
  competence: string;
  revised: number;
  importIds: number[];
  alreadyReconciled: boolean;
};

export type CommercialStatusFile = {
  sourceWeek?: number | null;
  kind: CommercialUploadKind;
  configured: boolean;
  fileName: string | null;
  total: number | null;
  asOf: string | null;
  importedAt: string | null;
  rows: number;
  warnings: string[];
};

export type CommercialStatus = {
  competence: string;
  files: CommercialStatusFile[];
};

export type CommercialSourceSnapshot = CommercialStatusFile & {
  competence: string;
};

export type CommercialUnmappedRow = {
  kind: CommercialUploadKind;
  key: string;
  sourceLabel: string;
  state: string | null;
  value: number | null;
};

export type CommercialPerformance = V2Dashboard["dealerPerformance"] & {
  warnings: string[];
  sources: CommercialSourceSnapshot[];
  unmapped?: CommercialUnmappedRow[];
};

export type CommercialPerformanceRequest = {
  dashboard: V2Dashboard;
  filters: V2Filters;
};
