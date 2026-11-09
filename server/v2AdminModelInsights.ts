import type { RowDataPacket } from "mysql2/promise";
import {
  UNIDENTIFIED_MODEL,
  OFFICIAL_MODELS,
  resolveOfficialModel,
} from "../shared/modelRegistry";
import {
  resolveBrazilianState,
  UNIDENTIFIED_STATE,
} from "../shared/stateRegistry";
import { addIsoDays, resolveDashboardPeriod } from "../shared/dashboardDates";
import type { ExtraDealerRegistryEntry } from "../shared/dealerRegistryExtensions";
import { resolveRegisteredDealer } from "../shared/dealerRegistryExtensions";
import type { ModelAnalysis, ModelDetail } from "../shared/modelAnalysis";
import {
  aggregateModelAnalysis,
  resolveModelVersion,
  safeDiagnosticLabel,
} from "./v2ModelAnalysis";
import {
  filterV2LeadRows,
  readV2LeadsForPeriod,
  readV2LeadCoverage,
} from "./v2Leads";
import { getV2Pool } from "./v2Db";
import { readExtraDealerRegistry } from "./v2DealerRegistry";
import type { V2Filters, V2Lead } from "../shared/v2Types";
import type {
  AdminModelComparison,
  AdminModelComparisonRow,
  AdminModelInsight,
  AdminModelInsights,
  AdminModelInsightsCoverage,
  AdminModelInsightsDimension,
  AdminModelInsightsFilters,
  AdminModelInsightsSource,
  AdminModelMatrix,
  AdminModelMatrixCell,
  AdminModelMatrixCategory,
  AdminModelMatrixRow,
  AdminModelMix,
  AdminModelMixOpportunity,
  AdminModelQuality,
  AdminModelQualityGap,
  AdminModelVersionQuality,
} from "../shared/adminModelInsights";

export const ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD = 30;
export const ADMIN_MODEL_INSIGHTS_GAP_THRESHOLD_PP = 5;
export const ADMIN_MODEL_INSIGHTS_MAX_INSIGHTS = 50;
export const ADMIN_MODEL_INSIGHTS_MAX_OPPORTUNITIES = 100;

const MASKED_LABEL = "[valor não exibido]";
const DIMENSIONS: readonly AdminModelInsightsDimension[] = [
  "state",
  "channel",
  "dealer",
  "campaign",
];

type SourceMetadata = {
  configured: boolean;
  name: string | null;
  importedAt: string | null;
  totalRows: number | null;
  invalidDateRows: number | null;
  earliestLeadDate: string | null;
  latestLeadDate: string | null;
};

type SourceRow = RowDataPacket & {
  name?: unknown;
  importedAt?: unknown;
  totalRows?: unknown;
  invalidDateRows?: unknown;
  earliestLeadDate?: unknown;
  latestLeadDate?: unknown;
};

type ModelValue = { label: string; identified: boolean };
type DimensionValue = { label: string; identified: boolean };

type MatrixAccumulator = {
  total: number;
  categories: Map<string, { count: number; identified: boolean }>;
  models: Map<
    string,
    {
      count: number;
      identified: boolean;
      categories: Map<string, number>;
    }
  >;
};

function asFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  const text = String(value);
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return iso ?? null;
}

function asIsoTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeLabel(value: unknown, fallback = "Não informado"): string {
  const text = String(value ?? "").trim();
  return safeDiagnosticLabel(text || fallback) || fallback;
}

function safeModel(value: string): string {
  return safeDiagnosticLabel(value) || UNIDENTIFIED_MODEL;
}

function canonicalModel(row: V2Lead): ModelValue {
  const resolved = resolveOfficialModel(String(row.model ?? ""));
  return {
    label: safeModel(resolved ?? UNIDENTIFIED_MODEL),
    identified: resolved !== null,
  };
}

function canonicalDimension(
  dimension: AdminModelInsightsDimension,
  row: V2Lead,
  extraDealers: readonly ExtraDealerRegistryEntry[]
): DimensionValue {
  if (dimension === "state") {
    const state = resolveBrazilianState(String(row.state ?? ""));
    return {
      label: safeLabel(state?.name ?? UNIDENTIFIED_STATE),
      identified: state !== null,
    };
  }
  if (dimension === "dealer") {
    const raw = String(row.dealer ?? "").trim();
    const registered = raw ? resolveRegisteredDealer(raw, extraDealers) : null;
    return {
      label: safeLabel(registered ?? raw),
      identified: registered !== null,
    };
  }
  if (dimension === "campaign") {
    const raw = String(row.campaign ?? "").trim();
    const label = safeLabel(raw);
    return {
      label,
      identified: Boolean(raw) && label !== MASKED_LABEL,
    };
  }
  const raw = String(row.channel ?? "").trim();
  const label = safeLabel(raw);
  return { label, identified: Boolean(raw) && label !== MASKED_LABEL };
}

function emptyMatrixAccumulator(): MatrixAccumulator {
  return { total: 0, categories: new Map(), models: new Map() };
}

function addMatrixRow(
  accumulator: MatrixAccumulator,
  row: V2Lead,
  dimension: AdminModelInsightsDimension,
  extraDealers: readonly ExtraDealerRegistryEntry[]
): void {
  const model = canonicalModel(row);
  const category = canonicalDimension(dimension, row, extraDealers);
  accumulator.total++;
  const currentCategory = accumulator.categories.get(category.label) ?? {
    count: 0,
    identified: category.identified,
  };
  currentCategory.count++;
  currentCategory.identified =
    currentCategory.identified || category.identified;
  accumulator.categories.set(category.label, currentCategory);
  const currentModel = accumulator.models.get(model.label) ?? {
    count: 0,
    identified: model.identified,
    categories: new Map<string, number>(),
  };
  currentModel.count++;
  currentModel.identified = currentModel.identified || model.identified;
  currentModel.categories.set(
    category.label,
    (currentModel.categories.get(category.label) ?? 0) + 1
  );
  accumulator.models.set(model.label, currentModel);
}

function modelSort(a: string, b: string): number {
  const ai = OFFICIAL_MODELS.indexOf(a as (typeof OFFICIAL_MODELS)[number]);
  const bi = OFFICIAL_MODELS.indexOf(b as (typeof OFFICIAL_MODELS)[number]);
  const aIndex = ai < 0 ? OFFICIAL_MODELS.length : ai;
  const bIndex = bi < 0 ? OFFICIAL_MODELS.length : bi;
  return aIndex - bIndex || a.localeCompare(b, "pt-BR");
}

function countSort(
  a: { count: number; label: string },
  b: { count: number; label: string }
): number {
  return b.count - a.count || a.label.localeCompare(b.label, "pt-BR");
}

function buildMatrix(
  dimension: AdminModelInsightsDimension,
  rows: readonly V2Lead[],
  extraDealers: readonly ExtraDealerRegistryEntry[]
): AdminModelMatrix {
  const accumulator = emptyMatrixAccumulator();
  for (const row of rows)
    addMatrixRow(accumulator, row, dimension, extraDealers);
  const categories = [...accumulator.categories.entries()]
    .map(
      ([label, value]): AdminModelMatrixCategory => ({
        label: safeDiagnosticLabel(label),
        count: value.count,
        denominator: accumulator.total,
        sharePercent: accumulator.total
          ? (value.count / accumulator.total) * 100
          : null,
        identified: value.identified,
      })
    )
    .sort(countSort);
  const models = [...accumulator.models.entries()].sort(([a], [b]) =>
    modelSort(a, b)
  );
  const matrixRows: AdminModelMatrixRow[] = models.map(([model, value]) => {
    const modelLabel = safeModel(model);
    const cells: AdminModelMatrixCell[] = categories.map(category => {
      const count = value.categories.get(category.label) ?? 0;
      const categoryDenominator = category.count;
      const modelDenominator = value.count;
      return {
        category: category.label,
        model: modelLabel,
        count,
        categoryDenominator,
        modelDenominator,
        shareOfCategoryPercent: categoryDenominator
          ? (count / categoryDenominator) * 100
          : null,
        shareOfModelPercent: modelDenominator
          ? (count / modelDenominator) * 100
          : null,
      };
    });
    return {
      model: modelLabel,
      count: value.count,
      denominator: accumulator.total,
      identified: value.identified,
      cells,
    };
  });
  return {
    dimension,
    total: accumulator.total,
    denominator: accumulator.total,
    categories,
    rows: matrixRows,
  };
}

function buildMix(rows: readonly V2Lead[]): AdminModelMix {
  const counts = new Map<string, { count: number; identified: boolean }>();
  for (const row of rows) {
    const model = canonicalModel(row);
    const current = counts.get(model.label) ?? {
      count: 0,
      identified: model.identified,
    };
    current.count++;
    current.identified = current.identified || model.identified;
    counts.set(model.label, current);
  }
  const total = rows.length;
  const models = [...counts.entries()]
    .map(([model, value]) => ({
      model: safeModel(model),
      count: value.count,
      denominator: total,
      sharePercent: total ? (value.count / total) * 100 : null,
      identified: value.identified,
    }))
    .sort((a, b) => modelSort(a.model, b.model));
  return {
    total,
    denominator: total,
    models,
    identifiedTotal: models
      .filter(model => model.identified)
      .reduce((sum, model) => sum + model.count, 0),
    unidentifiedTotal: models
      .filter(model => !model.identified)
      .reduce((sum, model) => sum + model.count, 0),
  };
}

function sanitizeModelAnalysis(analysis: ModelAnalysis): ModelAnalysis {
  const sanitizeDetail = (detail: ModelDetail): ModelDetail => ({
    ...detail,
    model: safeModel(detail.model),
    versions: detail.versions.map(version => ({
      ...version,
      label: safeDiagnosticLabel(version.label),
    })),
    channels: detail.channels.map(item => ({
      ...item,
      label: safeDiagnosticLabel(item.label),
    })),
    states: detail.states.map(item => ({
      ...item,
      label: safeDiagnosticLabel(item.label),
    })),
    dealers: detail.dealers.map(item => ({
      ...item,
      label: safeDiagnosticLabel(item.label),
    })),
  });
  return {
    ...analysis,
    models: analysis.models.map(sanitizeDetail),
    daily: analysis.daily.map(day => ({
      ...day,
      date: safeDiagnosticLabel(day.date),
      models: Object.fromEntries(
        Object.entries(day.models).map(([model, count]) => [
          safeModel(model),
          count,
        ])
      ),
    })),
    diagnostics: analysis.diagnostics.map(diagnostic => ({
      ...diagnostic,
      originalModel: safeDiagnosticLabel(diagnostic.originalModel),
      originalVersion: safeDiagnosticLabel(diagnostic.originalVersion),
      model: safeModel(diagnostic.model),
      version: safeDiagnosticLabel(diagnostic.version),
      reason: safeDiagnosticLabel(diagnostic.reason),
    })),
  };
}

function coverageFor(
  dateFrom: string,
  dateTo: string,
  source: SourceMetadata
): AdminModelInsightsCoverage {
  if (!source.configured) return "NOT_CONFIGURED";
  if (!source.earliestLeadDate || !source.latestLeadDate) return "NOT_COVERED";
  if (dateFrom >= source.earliestLeadDate && dateTo <= source.latestLeadDate)
    return "COVERED";
  if (dateTo < source.earliestLeadDate || dateFrom > source.latestLeadDate)
    return "NOT_COVERED";
  return "PARTIAL";
}

function coverageContains(date: string, source: SourceMetadata): boolean {
  return Boolean(
    source.configured &&
      source.earliestLeadDate &&
      source.latestLeadDate &&
      date >= source.earliestLeadDate &&
      date <= source.latestLeadDate
  );
}

function buildDaily(
  period: { dateFrom: string; dateTo: string },
  rows: readonly V2Lead[],
  source: SourceMetadata
): AdminModelInsights["daily"] {
  const byDate = new Map<
    string,
    { total: number; models: Record<string, number> }
  >();
  for (const row of rows) {
    const current = byDate.get(row.date) ?? { total: 0, models: {} };
    current.total++;
    const model = canonicalModel(row).label;
    current.models[model] = (current.models[model] ?? 0) + 1;
    byDate.set(row.date, current);
  }
  const result: AdminModelInsights["daily"] = [];
  for (
    let date = period.dateFrom;
    date <= period.dateTo;
    date = addIsoDays(date, 1)
  ) {
    const sourceAvailable = coverageContains(date, source);
    const value = byDate.get(date);
    result.push({
      date,
      total: sourceAvailable ? (value?.total ?? 0) : null,
      denominator: sourceAvailable ? (value?.total ?? 0) : null,
      models: sourceAvailable ? (value?.models ?? {}) : {},
      sourceAvailable,
    });
  }
  return result;
}

function dayCount(dateFrom: string, dateTo: string): number {
  let count = 0;
  for (let date = dateFrom; date <= dateTo; date = addIsoDays(date, 1)) count++;
  return count;
}

function buildComparison(
  currentPeriod: { dateFrom: string; dateTo: string },
  previousPeriod: { dateFrom: string; dateTo: string },
  currentRows: readonly V2Lead[],
  previousRows: readonly V2Lead[],
  previousAvailable: boolean,
  sourceConfigured: boolean,
  currentCoverage: AdminModelInsightsCoverage,
  previousCoverage: AdminModelInsightsCoverage
): AdminModelComparison {
  const currentCounts = new Map<
    string,
    { count: number; identified: boolean }
  >();
  const previousCounts = new Map<
    string,
    { count: number; identified: boolean }
  >();
  for (const row of currentRows) {
    const model = canonicalModel(row);
    const value = currentCounts.get(model.label) ?? {
      count: 0,
      identified: model.identified,
    };
    value.count++;
    value.identified = value.identified || model.identified;
    currentCounts.set(model.label, value);
  }
  if (previousAvailable) {
    for (const row of previousRows) {
      const model = canonicalModel(row);
      const value = previousCounts.get(model.label) ?? {
        count: 0,
        identified: model.identified,
      };
      value.count++;
      value.identified = value.identified || model.identified;
      previousCounts.set(model.label, value);
    }
  }
  const labels = new Set([...currentCounts.keys(), ...previousCounts.keys()]);
  const currentDenominator = currentRows.length;
  const previousDenominator = previousAvailable ? previousRows.length : null;
  const rows = [...labels]
    .sort(modelSort)
    .map((model): AdminModelComparisonRow => {
      const current = currentCounts.get(model) ?? {
        count: 0,
        identified: model !== UNIDENTIFIED_MODEL,
      };
      const previous = previousAvailable
        ? previousCounts.get(model)
        : undefined;
      const currentShare = currentDenominator
        ? (current.count / currentDenominator) * 100
        : null;
      const previousShare =
        previousAvailable && previousDenominator
          ? ((previous?.count ?? 0) / previousDenominator) * 100
          : previousAvailable
            ? null
            : null;
      return {
        model: safeModel(model),
        identified: current.identified || previous?.identified === true,
        currentCount: current.count,
        currentDenominator,
        currentSharePercent: currentShare,
        previousCount: previousAvailable ? (previous?.count ?? 0) : null,
        previousDenominator,
        previousSharePercent: previousShare,
        deltaCount: previousAvailable
          ? current.count - (previous?.count ?? 0)
          : null,
        deltaSharePP:
          previousAvailable && currentShare !== null && previousShare !== null
            ? currentShare - previousShare
            : null,
      };
    });
  let note: string;
  let status: AdminModelComparison["status"];
  if (!sourceConfigured) {
    status = "NOT_CONFIGURED";
    note = "Comparação indisponível: a fonte de Leads não está configurada.";
  } else if (!previousAvailable) {
    status = "NOT_AVAILABLE";
    note = `Comparação indisponível: a cobertura histórica da janela anterior (${previousPeriod.dateFrom} a ${previousPeriod.dateTo}) não foi confirmada (cobertura atual: ${currentCoverage}; histórica: ${previousCoverage}).`;
  } else {
    status = "AVAILABLE";
    note =
      "Comparação calculada com a janela anterior de mesmo número de dias e os mesmos filtros dimensionais.";
  }
  return {
    status,
    currentPeriod: {
      ...currentPeriod,
      days: dayCount(currentPeriod.dateFrom, currentPeriod.dateTo),
    },
    previousPeriod: {
      ...previousPeriod,
      days: dayCount(previousPeriod.dateFrom, previousPeriod.dateTo),
    },
    rows,
    note: safeDiagnosticLabel(note),
  };
}

function qualityGapKey(
  dimension: AdminModelQualityGap["dimension"],
  code: AdminModelQualityGap["code"],
  label: string,
  model: string | undefined
): string {
  return JSON.stringify([dimension, code, label, model ?? ""]);
}

function buildQuality(
  rows: readonly V2Lead[],
  modelAnalysis: ModelAnalysis,
  extraDealers: readonly ExtraDealerRegistryEntry[]
): AdminModelQuality {
  const total = rows.length;
  const gaps = new Map<string, AdminModelQualityGap>();
  const addGap = (
    dimension: AdminModelQualityGap["dimension"],
    code: AdminModelQualityGap["code"],
    label: string,
    model: string | undefined,
    count = 1
  ) => {
    const safe = safeDiagnosticLabel(label || "Não informado");
    const key = qualityGapKey(dimension, code, safe, model);
    const current = gaps.get(key) ?? {
      dimension,
      code,
      label: safe,
      ...(model ? { model: safeModel(model) } : {}),
      count: 0,
      denominator: total,
      sharePercent: total ? null : null,
      commercialEligible: false as const,
    };
    current.count += count;
    current.sharePercent = total ? (current.count / total) * 100 : null;
    gaps.set(key, current);
  };
  let missingStateCount = 0;
  let missingDealerCount = 0;
  let missingCampaignCount = 0;
  for (const row of rows) {
    const model = canonicalModel(row);
    if (!model.identified)
      addGap("model", "UNKNOWN", UNIDENTIFIED_MODEL, undefined);
    const rawState = String(row.state ?? "").trim();
    if (!resolveBrazilianState(rawState)) {
      missingStateCount++;
      addGap(
        "state",
        rawState ? "UNKNOWN" : "MISSING",
        UNIDENTIFIED_STATE,
        model.label
      );
    }
    const rawDealer = String(row.dealer ?? "").trim();
    const registeredDealer = rawDealer
      ? resolveRegisteredDealer(rawDealer, extraDealers)
      : null;
    if (!registeredDealer) {
      if (!rawDealer) missingDealerCount++;
      addGap(
        "dealer",
        rawDealer ? "UNRECONCILED" : "MISSING",
        safeLabel(rawDealer),
        model.label
      );
    }
    const rawCampaign = String(row.campaign ?? "").trim();
    if (!rawCampaign) {
      missingCampaignCount++;
      addGap("campaign", "MISSING", "Não informado", model.label);
    } else if (safeLabel(rawCampaign) === MASKED_LABEL) {
      addGap("campaign", "INVALID", MASKED_LABEL, model.label);
    }
    const version = resolveModelVersion(row.model, row.version);
    if (version.status === "MISSING")
      addGap("version", "MISSING", version.version, model.label);
    if (version.status === "INVALID")
      addGap("version", "INVALID", version.version, model.label);
  }
  const versionByModel: AdminModelVersionQuality[] = modelAnalysis.models.map(
    model => {
      const identified = model.versionsIdentified;
      const missing = model.versionsMissing;
      const invalid = model.versionsInvalid;
      return {
        model: safeModel(model.model),
        denominator: model.leads,
        identified,
        missing,
        invalid,
        missingOrInvalidSharePercent: model.leads
          ? ((missing + invalid) / model.leads) * 100
          : null,
      };
    }
  );
  return {
    lowSampleThreshold: ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD,
    unknownModelCount: modelAnalysis.unclassified,
    missingStateCount,
    missingDealerCount,
    missingCampaignCount,
    versionsMissing: modelAnalysis.versionsMissing,
    versionsInvalid: modelAnalysis.versionsInvalid,
    versionByModel,
    gaps: [...gaps.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
    ),
  };
}

function opportunitySort(
  a: AdminModelMixOpportunity,
  b: AdminModelMixOpportunity
) {
  return (
    Math.abs(b.gapPP) - Math.abs(a.gapPP) ||
    b.groupCount - a.groupCount ||
    a.dimension.localeCompare(b.dimension) ||
    a.group.localeCompare(b.group, "pt-BR") ||
    a.model.localeCompare(b.model, "pt-BR")
  );
}

type BuiltOpportunities = {
  items: AdminModelMixOpportunity[];
  truncated: boolean;
};

function buildOpportunities(
  matrices: AdminModelInsights["matrices"],
  mix: AdminModelMix
): BuiltOpportunities {
  const result: AdminModelMixOpportunity[] = [];
  const mixByModel = new Map(mix.models.map(model => [model.model, model]));
  for (const dimension of DIMENSIONS) {
    const matrix = matrices[dimension];
    for (const category of matrix.categories) {
      if (
        !category.identified ||
        category.count < ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD
      )
        continue;
      for (const row of matrix.rows) {
        if (!row.identified) continue;
        const cell = row.cells.find(item => item.category === category.label);
        const modelMix = mixByModel.get(row.model);
        if (!cell || !modelMix || modelMix.sharePercent === null) continue;
        const actualSharePercent = cell.shareOfCategoryPercent ?? 0;
        const expectedSharePercent = modelMix.sharePercent;
        const gapPP = actualSharePercent - expectedSharePercent;
        if (Math.abs(gapPP) < ADMIN_MODEL_INSIGHTS_GAP_THRESHOLD_PP) continue;
        const expectedCount = category.count * (expectedSharePercent / 100);
        result.push({
          dimension,
          group: safeDiagnosticLabel(category.label),
          model: safeModel(row.model),
          groupCount: category.count,
          groupDenominator: category.count,
          modelCount: cell.count,
          actualSharePercent,
          expectedSharePercent,
          expectedCount,
          gapPP,
          estimatedVolumeDifference: cell.count - expectedCount,
          sampleThreshold: ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD,
        });
      }
    }
  }
  const ordered = result.sort(opportunitySort);
  return {
    items: ordered.slice(0, ADMIN_MODEL_INSIGHTS_MAX_OPPORTUNITIES),
    truncated: ordered.length > ADMIN_MODEL_INSIGHTS_MAX_OPPORTUNITIES,
  };
}

function buildInsights(
  mix: AdminModelMix,
  matrices: AdminModelInsights["matrices"],
  quality: AdminModelQuality,
  opportunities: readonly AdminModelMixOpportunity[]
): AdminModelInsight[] {
  const result: AdminModelInsight[] = [];
  if (mix.total === 0) {
    result.push({
      kind: "QUALITY_GAP",
      priority: 100,
      dimension: "model",
      title: "Sem Leads no recorte",
      detail:
        "O recorte aplicado retornou zero registros. Isso é diferente de fonte ausente; nenhum benchmark comercial foi gerado.",
    });
  } else if (mix.total < ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD) {
    result.push({
      kind: "LOW_SAMPLE",
      priority: 95,
      dimension: "model",
      count: mix.total,
      sharePercent: 100,
      title: "Baixa amostra do recorte",
      detail: `O recorte tem ${mix.total} Leads; leituras de mix devem ser tratadas como indicativas abaixo de ${ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD}.`,
    });
  }
  for (const model of mix.models) {
    if (model.count < ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD) {
      result.push({
        kind: "LOW_SAMPLE",
        priority: 85,
        dimension: "model",
        model: model.model,
        count: model.count,
        sharePercent: model.sharePercent,
        title: `Baixa amostra em ${model.model}`,
        detail: `${model.model} tem ${model.count} Leads no recorte, abaixo do mínimo de ${ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD}.`,
      });
    }
  }
  for (const model of quality.versionByModel) {
    const affected = model.missing + model.invalid;
    if (affected > 0) {
      result.push({
        kind: "VERSION_GAP",
        priority: 76,
        dimension: "version",
        model: model.model,
        count: affected,
        sharePercent: model.missingOrInvalidSharePercent,
        title: `Versão faltante ou inválida em ${model.model}`,
        detail: `${affected} de ${model.denominator} Leads de ${model.model} não têm versão identificada de forma válida.`,
      });
    }
  }
  for (const gap of quality.gaps) {
    if (
      gap.dimension === "model" ||
      gap.dimension === "state" ||
      gap.dimension === "dealer" ||
      gap.dimension === "campaign"
    ) {
      result.push({
        kind: "QUALITY_GAP",
        priority: gap.dimension === "model" ? 82 : 70,
        dimension: gap.dimension,
        model: gap.model,
        group: gap.label,
        count: gap.count,
        sharePercent: gap.sharePercent,
        title: `Qualidade: ${gap.label}`,
        detail: `${gap.count} Leads estão sem identificação comercial confiável em ${gap.dimension}; não entram em oportunidades de mix.`,
      });
    }
  }
  for (const dimension of ["channel", "dealer"] as const) {
    const matrix = matrices[dimension];
    for (const row of matrix.rows) {
      if (!row.identified || row.count < ADMIN_MODEL_INSIGHTS_SAMPLE_THRESHOLD)
        continue;
      const top = [...row.cells]
        .filter(cell => cell.count > 0)
        .sort(
          (a, b) =>
            b.count - a.count || a.category.localeCompare(b.category, "pt-BR")
        )[0];
      if (!top || (top.shareOfModelPercent ?? 0) < 70) continue;
      result.push({
        kind: "CONCENTRATION",
        priority: 68,
        dimension,
        model: row.model,
        group: top.category,
        count: top.count,
        sharePercent: top.shareOfModelPercent,
        title: `Concentração de ${row.model} em ${dimension}`,
        detail: `${top.count} de ${row.count} Leads de ${row.model} estão em ${top.category} (${(top.shareOfModelPercent ?? 0).toFixed(1)}%).`,
      });
    }
  }
  for (const opportunity of opportunities) {
    result.push({
      kind: "MIX_GAP",
      priority: 60 + Math.min(20, Math.abs(opportunity.gapPP)),
      dimension: opportunity.dimension,
      model: opportunity.model,
      group: opportunity.group,
      count: opportunity.modelCount,
      sharePercent: opportunity.actualSharePercent,
      title: `Gap de mix: ${opportunity.model} em ${opportunity.group}`,
      detail: `Participação observada ${opportunity.actualSharePercent.toFixed(1)}% versus benchmark ${opportunity.expectedSharePercent.toFixed(1)}%; gap ${opportunity.gapPP.toFixed(1)} p.p. em grupo com ${opportunity.groupCount} Leads.`,
    });
  }
  return result
    .map(item => ({
      ...item,
      title: safeDiagnosticLabel(item.title),
      detail: safeDiagnosticLabel(item.detail),
      model: item.model ? safeModel(item.model) : item.model,
      group: item.group ? safeDiagnosticLabel(item.group) : item.group,
    }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.count ?? 0) - (a.count ?? 0) ||
        a.title.localeCompare(b.title, "pt-BR")
    );
}

function buildNotes(
  status: AdminModelInsights["status"],
  source: AdminModelInsightsSource,
  total: number,
  comparison: AdminModelComparison,
  opportunitiesTruncated: boolean
): string[] {
  const notes = [
    "Análise exclusiva do Administrador operacional; usa a população integral filtrada antes da paginação da tabela.",
    "Os benchmarks de mix são participação descritiva do mesmo recorte, não são metas, vendas, conversão, CPL nem prova de envio CRM.",
    "Modelos só são conciliados por aliases explícitos do cadastro; campanha, dealer, estado ou substring nunca inferem modelo.",
    "Registros sem UF, dealer ou campanha permanecem nas contagens e matrizes, mas ficam fora das oportunidades comerciais e aparecem como gaps de qualidade.",
    "Denominadores estão presentes em mix, matrizes, daily, comparação e oportunidades; filtros dimensionais continuam aplicados ao mesmo recorte.",
  ];
  if (status === "NOT_CONFIGURED")
    notes.push(
      "Fonte não configurada: a resposta não transforma ausência de fonte em zero."
    );
  else if (total === 0)
    notes.push(
      "O recorte possui zero Leads reais; nenhum registro foi substituído ou simulado."
    );
  if (source.currentCoverage !== "COVERED")
    notes.push(
      `A cobertura do período solicitado é ${source.currentCoverage}; dias fora da cobertura aparecem como N/D.`
    );
  notes.push(comparison.note);
  if (opportunitiesTruncated)
    notes.push(
      `A lista de oportunidades foi limitada a ${ADMIN_MODEL_INSIGHTS_MAX_OPPORTUNITIES}; as matrizes completas não foram truncadas.`
    );
  return notes.map(note => safeDiagnosticLabel(note));
}

export async function readAdminModelInsightsSource(): Promise<SourceMetadata> {
  const [rows] = await getV2Pool().query<SourceRow[]>(
    "SELECT name,importedAt,totalRows,invalidDateRows FROM v2_sources WHERE id=1"
  );
  const row = rows[0];
  if (!row) {
    return {
      configured: false,
      name: null,
      importedAt: null,
      totalRows: null,
      invalidDateRows: null,
      earliestLeadDate: null,
      latestLeadDate: null,
    };
  }
  const coverage = row.importedAt
    ? await readV2LeadCoverage()
    : { earliestLeadDate: null, latestLeadDate: null };
  return {
    configured: Boolean(row.importedAt),
    name: row.name == null ? null : safeDiagnosticLabel(String(row.name)),
    importedAt: asIsoTimestamp(row.importedAt),
    totalRows: asFiniteNumber(row.totalRows),
    invalidDateRows: asFiniteNumber(row.invalidDateRows),
    earliestLeadDate: coverage.earliestLeadDate,
    latestLeadDate: coverage.latestLeadDate,
  };
}

export function buildAdminModelInsights(
  rows: readonly V2Lead[],
  input: AdminModelInsightsFilters,
  sourceMetadata: SourceMetadata,
  extraDealers: readonly ExtraDealerRegistryEntry[] = [],
  previousRows: readonly V2Lead[] = [],
  now = new Date()
): AdminModelInsights {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const days = dayCount(period.dateFrom, period.dateTo);
  const previousDateTo = addIsoDays(period.dateFrom, -1);
  const previousDateFrom = addIsoDays(previousDateTo, -(days - 1));
  const currentCoverage = coverageFor(
    period.dateFrom,
    period.dateTo,
    sourceMetadata
  );
  const previousCoverage = coverageFor(
    previousDateFrom,
    previousDateTo,
    sourceMetadata
  );
  const source: AdminModelInsightsSource = {
    name: sourceMetadata.name,
    importedAt: sourceMetadata.importedAt,
    mode: "authenticated-import",
    totalRows: sourceMetadata.totalRows,
    invalidDateRows: sourceMetadata.invalidDateRows,
    earliestLeadDate: sourceMetadata.earliestLeadDate,
    latestLeadDate: sourceMetadata.latestLeadDate,
    currentCoverage,
    previousCoverage,
  };
  const modelAnalysis = sanitizeModelAnalysis(
    aggregateModelAnalysis([...rows], extraDealers)
  );
  const mix = buildMix(rows);
  const matrices = {
    state: buildMatrix("state", rows, extraDealers),
    channel: buildMatrix("channel", rows, extraDealers),
    dealer: buildMatrix("dealer", rows, extraDealers),
    campaign: buildMatrix("campaign", rows, extraDealers),
  };
  const previousAvailable =
    sourceMetadata.configured && previousCoverage === "COVERED";
  const comparison = buildComparison(
    period,
    { dateFrom: previousDateFrom, dateTo: previousDateTo },
    rows,
    previousRows,
    previousAvailable,
    sourceMetadata.configured,
    currentCoverage,
    previousCoverage
  );
  const quality = buildQuality(rows, modelAnalysis, extraDealers);
  const builtOpportunities = buildOpportunities(matrices, mix);
  const opportunities = builtOpportunities.items;
  const insights = buildInsights(mix, matrices, quality, opportunities);
  const notes = buildNotes(
    sourceMetadata.configured ? "READY" : "NOT_CONFIGURED",
    source,
    rows.length,
    comparison,
    builtOpportunities.truncated
  );
  const filters: AdminModelInsightsFilters = {
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    ...(input.model ? { model: safeDiagnosticLabel(input.model) } : {}),
    ...(input.channel ? { channel: safeDiagnosticLabel(input.channel) } : {}),
    ...(input.campaign
      ? { campaign: safeDiagnosticLabel(input.campaign) }
      : {}),
    ...(input.dealer ? { dealer: safeDiagnosticLabel(input.dealer) } : {}),
    ...(input.search ? { search: "[busca aplicada]" } : {}),
  };
  return {
    status: sourceMetadata.configured ? "READY" : "NOT_CONFIGURED",
    audience: "admin",
    period: {
      ...period,
      days,
      filters,
    },
    source,
    total: rows.length,
    mix,
    modelAnalysis,
    matrices,
    daily: buildDaily(period, rows, sourceMetadata),
    comparison,
    opportunities,
    quality,
    insights: insights.slice(0, ADMIN_MODEL_INSIGHTS_MAX_INSIGHTS),
    limits: {
      maxInsights: ADMIN_MODEL_INSIGHTS_MAX_INSIGHTS,
      insightsTruncated: insights.length > ADMIN_MODEL_INSIGHTS_MAX_INSIGHTS,
      maxOpportunities: ADMIN_MODEL_INSIGHTS_MAX_OPPORTUNITIES,
      opportunitiesTruncated: builtOpportunities.truncated,
      matricesTruncated: false,
    },
    notes,
  };
}

export async function getAdminModelInsights(
  input: AdminModelInsightsFilters,
  now = new Date()
): Promise<AdminModelInsights> {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const normalizedInput: V2Filters = {
    ...input,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
  };
  const days = dayCount(period.dateFrom, period.dateTo);
  const previousDateTo = addIsoDays(period.dateFrom, -1);
  const previousDateFrom = addIsoDays(previousDateTo, -(days - 1));
  const previousInput: V2Filters = {
    ...normalizedInput,
    dateFrom: previousDateFrom,
    dateTo: previousDateTo,
  };
  const [currentRaw, previousRaw, extraDealers, sourceMetadata] =
    await Promise.all([
      readV2LeadsForPeriod(period.dateFrom, period.dateTo),
      readV2LeadsForPeriod(previousDateFrom, previousDateTo),
      // The extra registry is a read-only lookup used by the same dashboard
      // dealer reconciliation path; it does not register or mutate anything.
      readExtraDealerRegistry(),
      readAdminModelInsightsSource(),
    ]);
  const currentRows = filterV2LeadRows(
    currentRaw,
    normalizedInput,
    now,
    extraDealers
  );
  const previousRows = filterV2LeadRows(
    previousRaw,
    previousInput,
    now,
    extraDealers
  );
  return buildAdminModelInsights(
    currentRows,
    normalizedInput,
    sourceMetadata,
    extraDealers,
    previousRows,
    now
  );
}
