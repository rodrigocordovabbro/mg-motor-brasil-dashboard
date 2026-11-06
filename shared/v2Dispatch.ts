export type DispatchReportSummary = {
  id: number;
  title: string;
  fileName: string;
  dateFrom: string;
  dateTo: string;
  generatedLabel: string;
};

export type DispatchDay = {
  date: string;
  label: string;
  sourceTotal: number | null;
  computedTotal: number | null;
  pending?: boolean;
};

export type DispatchLeadSource = {
  status: "READY" | "NOT_CONFIGURED";
  name: string;
  importedAt: string | null;
  total: number | null;
};

export type DispatchValidation = {
  isOk: boolean;
  version: number;
  reviewerLabel: string;
  updatedBy: string;
  updatedAt: string;
};

export type DispatchCell = {
  id: number;
  rowNumber: number;
  date: string;
  syonet: string;
  sourceManual: string;
  volume: number | null;
  /** Computed from v2_leads when volumeMode is dashboard-leads. */
  leadVolume?: number | null;
  sourcePending?: boolean;
  /** Import timestamp for the source manual value, when supplied by XLSX. */
  sourceManualImportedAt?: string;
  validation: DispatchValidation | null;
};

export type DispatchRow = {
  id: number;
  rowNumber: number;
  storeName: string;
  crmResponsible: string;
  syonetIntegration: string;
  bbroIntegration: string;
  cells: DispatchCell[];
  /** Original dealer values that were assigned to this registered row. */
  rawDealers?: string[];
  /** True only when the raw dealer was deterministically matched to metadata. */
  metadataMatched?: boolean;
};

export type DispatchReport = DispatchReportSummary & {
  importedAt: string;
  information: { label: string; value: string }[];
  days: DispatchDay[];
  rows: DispatchRow[];
  /** Original imported row identity/order, when available to report consumers. */
  sourceRows?: Array<{
    rowId: number;
    storeName: string;
    rowNumber: number;
  }>;
  totals: {
    computed: number | null;
    sourceDailySum: number | null;
    declaredInInstructions: number | null;
    sourceManualOk: number;
    auditedOk: number;
    manualOverridden: number;
    pendingDays?: number;
  };
  notes: string[];
  /** Optional contract used by the lead-control view; legacy reports omit it. */
  volumeMode?: "dashboard-leads";
  leadSource?: DispatchLeadSource;
};

export type DispatchAuditEntry = {
  id: number;
  isOk: boolean;
  previousIsOk: boolean | null;
  reviewerLabel: string;
  changedBy: string;
  createdAt: string;
  version: number;
};

export function currentManualValidation(
  cell: Pick<DispatchCell, "sourceManualImportedAt" | "validation">
): DispatchValidation | null {
  const validation = cell.validation;
  const sourceManualImportedAt = cell.sourceManualImportedAt;
  if (
    !validation ||
    !sourceManualImportedAt ||
    validation.updatedAt >= sourceManualImportedAt
  ) {
    return validation;
  }
  return null;
}

export function effectiveManualOk(
  cell: Pick<
    DispatchCell,
    "sourceManual" | "sourceManualImportedAt" | "validation"
  >
) {
  return (
    currentManualValidation(cell)?.isOk ??
    cell.sourceManual.trim().toUpperCase() === "OK"
  );
}
