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
  sourceTotal: number;
  computedTotal: number;
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
  volume: number;
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
};
export type DispatchReport = DispatchReportSummary & {
  importedAt: string;
  information: { label: string; value: string }[];
  days: DispatchDay[];
  rows: DispatchRow[];
  totals: {
    computed: number;
    sourceDailySum: number;
    declaredInInstructions: number | null;
    sourceManualOk: number;
    auditedOk: number;
    manualOverridden: number;
  };
  notes: string[];
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
export function effectiveManualOk(
  cell: Pick<DispatchCell, "sourceManual" | "validation">
) {
  return cell.validation
    ? cell.validation.isOk
    : cell.sourceManual.trim().toUpperCase() === "OK";
}
