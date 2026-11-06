import {
  OFFICIAL_MODELS,
  UNIDENTIFIED_MODEL,
  normalizeModelKey,
  resolveOfficialModel,
  type OfficialModel,
} from "../shared/modelRegistry";
import { groupedStateLabel } from "../shared/stateRegistry";
import type {
  ModelAnalysis,
  ModelDetail,
  ModelSourceDiagnostic,
  ModelVersionCount,
  ModelVersionStatus,
} from "../shared/modelAnalysis";
import type { V2Count, V2Lead } from "../shared/v2Types";
import {
  resolveRegisteredDealer,
  type ExtraDealerRegistryEntry,
} from "../shared/dealerRegistryExtensions";

const MISSING_VERSION = "Não informado";
const NOT_INFORMED_VERSION = "Não informada";
const MASKED_DIAGNOSTIC_VALUE = "[valor não exibido]";

export type ModelVersionResolution = {
  version: string;
  status: ModelVersionStatus;
  reason: string;
};

type VersionRule = {
  label: string;
  status: ModelVersionStatus;
  reason: string;
};

type ModelAccumulator = {
  model: string;
  leads: number;
  versionsIdentified: number;
  versionsMissing: number;
  versionsInvalid: number;
  versions: Map<string, ModelVersionCount>;
  channels: Map<string, number>;
  states: Map<string, number>;
  dealers: Map<string, number>;
};

const versionRules = new Map<string, VersionRule>();

function registerVersion(values: string[], rule: VersionRule) {
  for (const value of values) versionRules.set(normalizeModelKey(value), rule);
}

registerVersion(["Conforto", "comfort"], {
  label: "Comfort",
  status: "IDENTIFIED",
  reason: "versão reconhecida explicitamente no campo VERSION",
});
registerVersion(["Luxury"], {
  label: "Luxury",
  status: "IDENTIFIED",
  reason: "versão reconhecida explicitamente no campo VERSION",
});
registerVersion(["X-Power", "x-power_(awd)", "XPOWER"], {
  label: "XPOWER",
  status: "IDENTIFIED",
  reason: "versão reconhecida explicitamente no campo VERSION",
});
registerVersion(["AWD 77kWh"], {
  label: "AWD77kWh",
  status: "IDENTIFIED",
  reason: "versão reconhecida explicitamente no campo VERSION",
});

for (const value of [
  "64 KW ELÉTRICO COMFORT",
  "64 KW ELÉTRICO LUXURY",
  "64 KW ELÉTRICO X-POWER",
  "43 KW ELÉTRICO COMFORT",
  "43 KW ELÉTRICO LUXURY",
  "54 KW ELÉTRICO LUXURY",
]) {
  registerVersion([value], {
    label: value,
    status: "IDENTIFIED",
    reason:
      "especificação reconhecida explicitamente no campo VERSION; texto original preservado",
  });
}

const contactVersionKeys = new Set(
  ["whatsapp", "e-mail", "email", "ligação"].map(normalizeModelKey)
);

function asRaw(value: unknown): string {
  return value == null ? "" : String(value);
}

function normalizedText(value: unknown): string {
  return asRaw(value).trim();
}

function isMissingVersion(rawVersion: string): boolean {
  const key = normalizeModelKey(rawVersion);
  return !key || key === normalizeModelKey(MISSING_VERSION);
}

function isExplicitXPowerModel(rawModel: string): boolean {
  const key = normalizeModelKey(rawModel);
  return key === "xpower" || key === "mg4xpower";
}

function containsContactData(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return (
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text) ||
    /https?:\/\//i.test(text) ||
    /(?:^|[^\d])\+?\d[\d\s().-]{7,}\d(?:$|[^\d])/.test(text) ||
    /\b\d{8,}\b/.test(text) ||
    /\b(?:telefone|celular|phone|contacto)\s*[:=]/i.test(text) ||
    /\b(?:email|e-mail)\s*[:=]/i.test(text) ||
    /\n|\r/.test(text)
  );
}

/**
 * Diagnostics may be returned to administrators, but model/version columns
 * must never become an accidental contact-data channel.
 */
export function safeDiagnosticLabel(value: string): string {
  const text = value.trim();
  return containsContactData(text) ? MASKED_DIAGNOSTIC_VALUE : text;
}

export function resolveModelVersion(
  rawModel: unknown,
  rawVersion: unknown
): ModelVersionResolution {
  const model = asRaw(rawModel);
  const version = normalizedText(rawVersion);
  const versionKey = normalizeModelKey(version);

  if (isMissingVersion(version)) {
    if (isExplicitXPowerModel(model)) {
      return {
        version: "XPOWER",
        status: "IDENTIFIED",
        reason:
          "versão identificada pela origem mapeada do campo MODEL (XPOWER)",
      };
    }
    return {
      version: MISSING_VERSION,
      status: "MISSING",
      reason: "valor de versão ausente ou Não informado",
    };
  }

  if (contactVersionKeys.has(versionKey)) {
    return {
      version: NOT_INFORMED_VERSION,
      status: "INVALID",
      reason: "preferência de contato não é versão",
    };
  }

  if (versionKey === normalizeModelKey("URBAN")) {
    return {
      version: NOT_INFORMED_VERSION,
      status: "INVALID",
      reason: "URBAN repete o modelo; não informa trim",
    };
  }

  const rule = versionRules.get(versionKey);
  if (rule) {
    // Full KW specifications are recognized, but their source text remains
    // unchanged: this code never converts KW to kWh or infers power.
    const isFullSpecification =
      versionKey.includes("kw") && versionKey.includes("eletrico");
    return {
      version: isFullSpecification ? version : rule.label,
      status: rule.status,
      reason: rule.reason,
    };
  }

  return {
    version,
    status: "INVALID",
    reason: "valor de versão desconhecido; preservado sem inferência",
  };
}

function increment(map: Map<string, number>, label: string) {
  map.set(label, (map.get(label) ?? 0) + 1);
}

function countLabel(value: unknown): string {
  const label = normalizedText(value);
  return label || "Não informado";
}

function sortedCounts(map: Map<string, number>): V2Count[] {
  return [...map]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
    );
}

function sortedVersions(
  map: Map<string, ModelVersionCount>
): ModelVersionCount[] {
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
  );
}

function modelSortIndex(model: string): number {
  const index = OFFICIAL_MODELS.indexOf(model as OfficialModel);
  return index >= 0 ? index : OFFICIAL_MODELS.length;
}

function newAccumulator(model: string): ModelAccumulator {
  return {
    model,
    leads: 0,
    versionsIdentified: 0,
    versionsMissing: 0,
    versionsInvalid: 0,
    versions: new Map(),
    channels: new Map(),
    states: new Map(),
    dealers: new Map(),
  };
}

function addVersion(
  accumulator: ModelAccumulator,
  resolution: ModelVersionResolution
) {
  const label = safeDiagnosticLabel(resolution.version);
  const current = accumulator.versions.get(label) ?? {
    label,
    count: 0,
    status: resolution.status,
  };
  current.count++;
  accumulator.versions.set(label, current);
  if (resolution.status === "IDENTIFIED") accumulator.versionsIdentified++;
  if (resolution.status === "MISSING") accumulator.versionsMissing++;
  if (resolution.status === "INVALID") accumulator.versionsInvalid++;
}

function diagnosticKey(
  originalModel: string,
  originalVersion: string,
  model: string,
  resolution: ModelVersionResolution,
  reason: string
): string {
  return JSON.stringify([
    originalModel,
    originalVersion,
    model,
    resolution.version,
    resolution.status,
    reason,
  ]);
}

function addDiagnostic(
  diagnostics: Map<string, ModelSourceDiagnostic>,
  row: V2Lead,
  model: string,
  resolution: ModelVersionResolution
) {
  const originalModel = asRaw(row.model);
  const originalVersion = asRaw(row.version);
  const reason =
    model === UNIDENTIFIED_MODEL
      ? `modelo não identificado; ${resolution.reason}`
      : resolution.reason;
  const key = diagnosticKey(
    originalModel,
    originalVersion,
    model,
    resolution,
    reason
  );
  const current = diagnostics.get(key);
  if (current) {
    current.count++;
    return;
  }
  diagnostics.set(key, {
    originalModel: safeDiagnosticLabel(originalModel),
    originalVersion: safeDiagnosticLabel(originalVersion),
    model,
    version: safeDiagnosticLabel(resolution.version),
    versionStatus: resolution.status,
    reason,
    count: 1,
  });
}

function detailFromAccumulator(
  accumulator: ModelAccumulator,
  total: number
): ModelDetail {
  return {
    model: accumulator.model,
    leads: accumulator.leads,
    sharePercent: total ? (accumulator.leads / total) * 100 : null,
    versionsIdentified: accumulator.versionsIdentified,
    versionsMissing: accumulator.versionsMissing,
    versionsInvalid: accumulator.versionsInvalid,
    versions: sortedVersions(accumulator.versions),
    channels: sortedCounts(accumulator.channels),
    states: sortedCounts(accumulator.states),
    dealers: sortedCounts(accumulator.dealers),
  };
}

/**
 * Aggregates every row in the already-filtered dashboard slice. This function
 * intentionally has no pagination input: `recent.rows` is only a view of the
 * result and must never limit model/versions totals.
 */
export function aggregateModelAnalysis(
  rows: V2Lead[],
  extraDealers: readonly ExtraDealerRegistryEntry[] = []
): ModelAnalysis {
  if (rows.length === 0) {
    return {
      total: 0,
      classified: 0,
      unclassified: 0,
      coveragePercent: null,
      versionsIdentified: 0,
      versionsMissing: 0,
      versionsInvalid: 0,
      models: [],
      daily: [],
      diagnostics: [],
    };
  }

  const accumulators = new Map<string, ModelAccumulator>();
  const diagnostics = new Map<string, ModelSourceDiagnostic>();
  const daily = new Map<
    string,
    { total: number; models: Record<string, number> }
  >();
  let classified = 0;
  let versionsIdentified = 0;
  let versionsMissing = 0;
  let versionsInvalid = 0;

  for (const row of rows) {
    const resolvedModel = resolveOfficialModel(asRaw(row.model));
    const model = resolvedModel ?? UNIDENTIFIED_MODEL;
    if (resolvedModel) classified++;

    const resolution = resolveModelVersion(row.model, row.version);
    if (resolution.status === "IDENTIFIED") versionsIdentified++;
    if (resolution.status === "MISSING") versionsMissing++;
    if (resolution.status === "INVALID") versionsInvalid++;

    const accumulator = accumulators.get(model) ?? newAccumulator(model);
    accumulator.leads++;
    addVersion(accumulator, resolution);
    increment(accumulator.channels, countLabel(row.channel));
    increment(accumulator.states, groupedStateLabel(countLabel(row.state)));
    const dealer = countLabel(row.dealer);
    increment(
      accumulator.dealers,
      resolveRegisteredDealer(dealer, extraDealers) ?? dealer
    );
    accumulators.set(model, accumulator);
    addDiagnostic(diagnostics, row, model, resolution);

    const date = countLabel(row.date);
    const day = daily.get(date) ?? { total: 0, models: {} };
    day.total++;
    day.models[model] = (day.models[model] ?? 0) + 1;
    daily.set(date, day);
  }

  const total = rows.length;
  const models = [...accumulators.values()]
    .sort(
      (a, b) =>
        modelSortIndex(a.model) - modelSortIndex(b.model) ||
        a.model.localeCompare(b.model, "pt-BR")
    )
    .map(accumulator => detailFromAccumulator(accumulator, total));

  return {
    total,
    classified,
    unclassified: total - classified,
    coveragePercent: (classified / total) * 100,
    versionsIdentified,
    versionsMissing,
    versionsInvalid,
    models,
    daily: [...daily]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        total: value.total,
        models: value.models,
      })),
    diagnostics: [...diagnostics.values()].sort(
      (a, b) =>
        b.count - a.count ||
        a.model.localeCompare(b.model, "pt-BR") ||
        a.version.localeCompare(b.version, "pt-BR")
    ),
  };
}
