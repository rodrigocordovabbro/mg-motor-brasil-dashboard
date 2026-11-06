export type RegionalModelRow = {
  label: string;
  total: number;
  counts: Record<string, number>;
};
export type RegionalModelDistribution = {
  models: string[];
  regions: RegionalModelRow[];
  states: RegionalModelRow[];
  total: number;
  unidentifiedStateCount: number;
  unidentifiedModelCount: number;
};
