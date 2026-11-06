import type { V2Dashboard, V2Filters } from "./v2Types";
import type { UserRole } from "./accountRoles";

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
  /** General DAILY_FUP snapshot; optional for backwards-compatible clients. */
  registrationMtd?: number | null;
  /** File-label date of the general registration snapshot, date-only. */
  registrationAsOf?: string | null;
  /** Optional fixed source label, normally DAILY_FUP. */
  sourceSheet?: string;
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

export type CommercialActor = {
  id: number;
  username: string;
  /** Optional for backwards-compatible import/reconciliation callers. */
  role?: UserRole;
};

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

export type CommercialSourceRemovalInput = {
  kind: CommercialUploadKind;
  competence: string;
  expectedImportId: number;
};

export type CommercialSourceRemovalResult = {
  success: boolean;
  removed: boolean;
};

export type CommercialStatusFile = {
  sourceWeek?: number | null;
  kind: CommercialUploadKind;
  /** Current snapshot id, or null when the current snapshot was removed. */
  id: number | null;
  configured: boolean;
  fileName: string | null;
  total: number | null;
  asOf: string | null;
  importedAt: string | null;
  rows: number;
  warnings: string[];
  /** General DAILY_FUP snapshot; absent on legacy rows and non-sales kinds. */
  registrationMtd?: number | null;
  /** File-label date of the general registration snapshot, date-only. */
  registrationAsOf?: string | null;
  /** Optional fixed source label, normally DAILY_FUP. */
  sourceSheet?: string;
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

export type CommercialGeneralRegistration = {
  value: number;
  asOf: string | null;
  sourceSheet: "DAILY_FUP";
  label: "MTD Registration";
};

export type CommercialPerformance = V2Dashboard["dealerPerformance"] & {
  warnings: string[];
  sources: CommercialSourceSnapshot[];
  unmapped?: CommercialUnmappedRow[];
  generalRegistrationMTD?: CommercialGeneralRegistration | null;
};

export type CommercialPerformanceRequest = {
  dashboard: V2Dashboard;
  filters: V2Filters;
};
