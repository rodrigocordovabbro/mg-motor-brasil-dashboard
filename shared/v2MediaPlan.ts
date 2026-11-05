export type MediaPlanFunnel = "AWARENESS" | "CONSIDERATION" | "CONVERSION";
export type MediaPlanMode = "DELIVERY" | "FINANCIAL" | "HYBRID";
export type MediaPlanStatus = "PAID" | "PAYABLES" | "NOT_INFORMED";

export type MediaPlanContextItem = {
  id: string;
  labelPt: string;
  labelEn: string;
  value: number;
  notePt?: string;
  noteEn?: string;
};

export type MediaPlanRow = {
  id: string;
  sourceRow: number;
  funnel?: MediaPlanFunnel;
  channel: string;
  publisher?: string;
  product: string;
  objectivePt?: string;
  objectiveEn?: string;
  investment: number;
  commission?: number;
  netInvestment?: number;
  actualInvestment?: number;
  status?: MediaPlanStatus;
  cpm?: number;
  impressions?: number;
  ctr?: number;
  clicks?: number;
  connectRate?: number;
  visits?: number;
  cvr?: number;
  leads?: number | null;
  cpl?: number | null;
};

export type MediaPlanTotal = {
  sourceRow: number;
  label: string;
  product: string | null;
  investment: number;
  commission?: number;
  netInvestment?: number;
  actualInvestment?: number;
  impressions?: number;
  ctr?: number;
  clicks?: number;
  visits?: number;
  cvr?: number;
  leads?: number;
  cpl?: number;
};

export type MonthlyMediaPlan = {
  month: string;
  titlePt: string;
  titleEn: string;
  sourceFile: string;
  sourceSheet: string;
  formulaCount: number;
  updatedAt: string;
  mode: MediaPlanMode;
  sourceNotePt: string;
  sourceNoteEn: string;
  rows: MediaPlanRow[];
  totals: MediaPlanTotal[];
  total: MediaPlanTotal;
  contextItems?: MediaPlanContextItem[];
};
