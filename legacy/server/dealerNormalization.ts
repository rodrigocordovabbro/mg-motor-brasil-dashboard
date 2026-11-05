import dealerMappingSource from "./data/dealer-aliases.json";
import officialDealerSource from "./data/official-dealers.json";
import dealerAuditOverridesSource from "./data/dealer-audit-overrides.json";

type DealerMappingRow = {
  source: string;
  sourceKey: string;
  canonical: string;
  canonicalKey: string;
};

type DealerMappingSource = {
  sourceWorkbook: string;
  sourceSheet: string;
  sourceHeaders: string[];
  sourceModifiedAt: string;
  sourceRowCount: number;
  mappingCount: number;
  uniqueAliasCount: number;
  canonicalCount: number;
  mappings: DealerMappingRow[];
};

export type OfficialDealer = {
  name: string;
  code: string | null;
  operationalArea: string | null;
};

type OfficialDealerSource = {
  sourceWorkbook: string;
  sourceSheet: string;
  sourceHeaders: string[];
  sourceSha256: string;
  generatedAt: string;
  dealerCount: number;
  dealers: OfficialDealer[];
};

type DealerAuditOverridesSource = {
  generatedAt: string;
  sources: string[];
  mappings: Array<{ sourceKey: string; canonical: string }>;
  qualificationKeys: string[];
  additionalOfficialLeadDealerLocations?: Array<{
    name: string;
    operationalArea: string;
  }>;
  additionalOfficialLeadDealerKeys: string[];
};

const mappingSource = dealerMappingSource as DealerMappingSource;
const officialDirectory = officialDealerSource as OfficialDealerSource;
const dealerAuditOverrides = dealerAuditOverridesSource as DealerAuditOverridesSource;

export function normalizeDealerLookupKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const canonicalByAlias = new Map<string, string>();
for (const mapping of mappingSource.mappings) {
  canonicalByAlias.set(mapping.sourceKey, mapping.canonical);
}
for (const mapping of dealerAuditOverrides.mappings) {
  canonicalByAlias.set(mapping.sourceKey, mapping.canonical);
}

const DEALER_QUALIFICATION_KEYS = new Set([
  "INDISPONIVEL",
  "UNAVAILABLE",
  "OUTRO",
  "OUTROS",
  "OTHER",
  "OTHERS",
  "N A",
  "NA",
  "NOT AVAILABLE",
  "NAO INFORMADO",
  "NAO SE APLICA",
  "SEM CONCESSIONARIA",
  "SEM DEALER",
  "DEALER INDISPONIVEL",
  "NENHUM",
  "NONE",
  "A DEFINIR",
  "A CONFIRMAR",
  ...dealerAuditOverrides.qualificationKeys,
]);

export function isDealerQualificationPlaceholder(value: string): boolean {
  const key = normalizeDealerLookupKey(value);
  return key.length === 0 || DEALER_QUALIFICATION_KEYS.has(key);
}

export function canonicalizeDealerName(value: string): string {
  const original = value.trim();
  if (!original) return original;
  let canonical = original;
  const visited = new Set<string>();
  for (let index = 0; index < 4; index += 1) {
    const key = normalizeDealerLookupKey(canonical);
    if (!key || visited.has(key)) break;
    visited.add(key);
    const next = canonicalByAlias.get(key);
    if (!next) break;
    canonical = next;
    if (normalizeDealerLookupKey(next) === key) break;
  }
  return canonical;
}

export function canonicalizeDealerForAnalytics(value: string): string {
  if (isDealerQualificationPlaceholder(value)) return "Indisponível";
  return canonicalizeDealerName(value);
}

export function isExplicitDealerAlias(value: string): boolean {
  const original = value.trim();
  return original.length > 0 && canonicalByAlias.has(normalizeDealerLookupKey(original));
}

export function getDealerMappingStats(): {
  sourceWorkbook: string;
  sourceSheet: string;
  sourceModifiedAt: string;
  sourceRowCount: number;
  mappingCount: number;
  uniqueAliasCount: number;
  canonicalCount: number;
} {
  return {
    sourceWorkbook: mappingSource.sourceWorkbook,
    sourceSheet: mappingSource.sourceSheet,
    sourceModifiedAt: mappingSource.sourceModifiedAt,
    sourceRowCount: mappingSource.sourceRowCount,
    mappingCount: mappingSource.mappingCount,
    uniqueAliasCount: mappingSource.uniqueAliasCount,
    canonicalCount: mappingSource.canonicalCount,
  };
}

export function getOfficialDealers(): readonly OfficialDealer[] {
  return officialDirectory.dealers;
}

export function getOfficialLeadDealers(): readonly OfficialDealer[] {
  const additional = (dealerAuditOverrides.additionalOfficialLeadDealerLocations ?? []).map(dealer => ({
    name: dealer.name,
    code: null,
    operationalArea: dealer.operationalArea,
  }));
  return [...officialDirectory.dealers, ...additional];
}

export function getAdditionalOfficialLeadDealerKeys(): ReadonlySet<string> {
  return new Set(dealerAuditOverrides.additionalOfficialLeadDealerKeys);
}

export function getOfficialDealerDirectoryStats(): {
  sourceWorkbook: string;
  sourceSheet: string;
  sourceSha256: string;
  generatedAt: string;
  dealerCount: number;
} {
  return {
    sourceWorkbook: officialDirectory.sourceWorkbook,
    sourceSheet: officialDirectory.sourceSheet,
    sourceSha256: officialDirectory.sourceSha256,
    generatedAt: officialDirectory.generatedAt,
    dealerCount: officialDirectory.dealerCount,
  };
}
