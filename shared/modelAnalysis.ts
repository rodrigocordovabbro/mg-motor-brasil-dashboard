import type { V2Count } from "./v2Types";

export type ModelVersionStatus = "IDENTIFIED" | "MISSING" | "INVALID";
export type ModelVersionCount = {
  label: string;
  count: number;
  status: ModelVersionStatus;
};
export type ModelDetail = {
  model: string;
  leads: number;
  sharePercent: number | null;
  versionsIdentified: number;
  versionsMissing: number;
  versionsInvalid: number;
  versions: ModelVersionCount[];
  channels: V2Count[];
  states: V2Count[];
  dealers: V2Count[];
};
export type ModelSourceDiagnostic = {
  originalModel: string;
  originalVersion: string;
  model: string;
  version: string;
  versionStatus: ModelVersionStatus;
  reason: string;
  count: number;
};
export type ModelAnalysis = {
  total: number;
  classified: number;
  unclassified: number;
  coveragePercent: number | null;
  versionsIdentified: number;
  versionsMissing: number;
  versionsInvalid: number;
  models: ModelDetail[];
  daily: { date: string; total: number; models: Record<string, number> }[];
  /** Administrators only; other roles receive an empty list. No contact fields. */
  diagnostics: ModelSourceDiagnostic[];
};
