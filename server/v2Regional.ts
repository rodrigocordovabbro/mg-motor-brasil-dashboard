import { OFFICIAL_MODELS, resolveOfficialModel } from "../shared/modelRegistry";
import {
  BRAZILIAN_REGIONS,
  resolveBrazilianState,
  UNIDENTIFIED_STATE,
  UNIDENTIFIED_REGION,
} from "../shared/stateRegistry";
import type {
  RegionalModelDistribution,
  RegionalModelRow,
} from "../shared/regionalTypes";
import type { V2Lead } from "../shared/v2Types";
export const UNIDENTIFIED_MODEL = "Modelo não identificado";
export function aggregateRegionalModels(
  rows: V2Lead[]
): RegionalModelDistribution {
  const models: string[] = [...OFFICIAL_MODELS];
  const regions = new Map<string, RegionalModelRow>();
  const states = new Map<string, RegionalModelRow>();
  let unidentifiedStateCount = 0,
    unidentifiedModelCount = 0;
  const add = (
    map: Map<string, RegionalModelRow>,
    label: string,
    model: string
  ) => {
    const row = map.get(label) ?? { label, total: 0, counts: {} };
    row.total++;
    row.counts[model] = (row.counts[model] ?? 0) + 1;
    map.set(label, row);
  };
  for (const row of rows) {
    const state = resolveBrazilianState(row.state);
    const model = resolveOfficialModel(row.model);
    if (!state) unidentifiedStateCount++;
    if (!model) unidentifiedModelCount++;
    add(states, state?.name ?? UNIDENTIFIED_STATE, model ?? UNIDENTIFIED_MODEL);
    add(
      regions,
      state?.region ?? UNIDENTIFIED_REGION,
      model ?? UNIDENTIFIED_MODEL
    );
  }
  if (unidentifiedModelCount) models.push(UNIDENTIFIED_MODEL);
  const fill = (row: RegionalModelRow): RegionalModelRow => ({
    ...row,
    counts: Object.fromEntries(
      models.map(model => [model, row.counts[model] ?? 0])
    ),
  });
  return {
    models,
    regions: [...BRAZILIAN_REGIONS, UNIDENTIFIED_REGION].flatMap(label =>
      regions.has(label) ? [fill(regions.get(label)!)] : []
    ),
    states: [...states.values()]
      .sort(
        (a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR")
      )
      .map(fill),
    total: rows.length,
    unidentifiedStateCount,
    unidentifiedModelCount,
  };
}
