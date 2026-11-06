export const LEADS_SYNC_SOURCE_ID = 1;
export const LEADS_SYNC_ALLOWED_SHEETS = [
  "Site",
  "Meta",
  "Tiktok - Live",
  "Tikok",
  "Weebmotors",
  "Uol",
  "Mercado Livre",
  "Interlagos",
] as const;

export type LeadsSyncAllowedSheet = (typeof LEADS_SYNC_ALLOWED_SHEETS)[number];
export type LeadsSyncOrigin = "gws" | "server";

export type LeadsSyncActor = {
  id: number;
  username: string;
};

export type LeadsSyncValueRange = {
  range: string;
  values: unknown[][];
};

export type LeadsSnapshotInput = {
  spreadsheetId: string;
  valueRanges: LeadsSyncValueRange[];
};

export type LeadsSyncSourceCount = {
  name: string;
  count: number;
  minDate: string | null;
  maxDate: string | null;
};

export type LeadsSyncResult = {
  changed: boolean;
  importedAt: string;
  totalRows: number;
  inserted: number;
  updated: number;
  sourceCounts: LeadsSyncSourceCount[];
  latestLeadDate: string | null;
};

export type LeadsSyncConnectionStatus = {
  configured: boolean;
  message?: string;
};

export const LEADS_SYNC_CONFIGURATION_MESSAGE =
  "Google Sheets não configurado. Configure GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON e acesso de Leitor à planilha-base.";

export type LeadsSyncImportRequest = {
  snapshot: LeadsSnapshotInput;
  actor: LeadsSyncActor;
  origin: LeadsSyncOrigin;
};
