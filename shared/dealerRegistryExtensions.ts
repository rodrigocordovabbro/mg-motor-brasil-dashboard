import {
  OFFICIAL_DEALERS,
  normalizeDealerKey,
  resolveCommercialDealers,
  resolveOfficialDealer,
  type OfficialDealer,
} from "./dealerRegistry";
import { resolveBrazilianState } from "./stateRegistry";

export type ExtraDealerRegistryEntry = {
  id: number;
  /** Exact source label retained as the display/name value. */
  name: string;
  /** Alias of name for callers that use the persisted column terminology. */
  label: string;
  normalizedKey: string;
  state: string | null;
  sourceImportId: number | null;
  createdBy: number;
  createdByUsername: string;
  createdAt: string;
};

export type DealerRegistryListItem = {
  name: string;
  state: string | null;
};

export type DealerRegistryEntry = DealerRegistryListItem & {
  origin: "official" | "extra";
  normalizedKey: string;
  extra?: ExtraDealerRegistryEntry;
};

export type DealerRegistrationPendingReason =
  | "explicit-group"
  | "unknown-group-acronym";

export type DealerRegistrationSkipReason =
  | "blank-label"
  | "total-label"
  | "already-known"
  | "explicit-mapping"
  | "duplicate-in-upload";

export type DealerRegistrationPending = {
  rowKey: string;
  sourceLabel: string;
  state: string | null;
  reason: DealerRegistrationPendingReason;
};

export type DealerRegistrationSkipped = {
  rowKey: string;
  sourceLabel: string;
  reason: DealerRegistrationSkipReason;
};

const asExtraKey = (entry: ExtraDealerRegistryEntry): string =>
  entry.normalizedKey || normalizeDealerKey(entry.name);

function extrasByKey(
  extras: readonly ExtraDealerRegistryEntry[]
): Map<string, ExtraDealerRegistryEntry> {
  const result = new Map<string, ExtraDealerRegistryEntry>();
  for (const entry of extras) {
    const key = asExtraKey(entry);
    if (key && !result.has(key)) result.set(key, entry);
  }
  return result;
}

/**
 * Lists the official 41 units followed by persisted extras. The official
 * catalogue wins if an old/invalid duplicate happens to be supplied by a
 * caller, so the static registry and its aliases remain authoritative.
 */
export function combinedDealerRegistry(
  extras: readonly ExtraDealerRegistryEntry[] = []
): DealerRegistryEntry[] {
  const seen = new Set<string>();
  const result: DealerRegistryEntry[] = [];
  for (const dealer of OFFICIAL_DEALERS) {
    const normalizedKey = normalizeDealerKey(dealer.name);
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push({
      name: dealer.name,
      state: dealer.state,
      origin: "official",
      normalizedKey,
    });
  }
  for (const extra of extras) {
    const normalizedKey = asExtraKey(extra);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push({
      name: extra.name,
      state: extra.state,
      origin: "extra",
      normalizedKey,
      extra,
    });
  }
  return result;
}

/** Dashboard-safe list shape: original display label plus validated UF/null. */
export function dealerRegistryList(
  extras: readonly ExtraDealerRegistryEntry[] = []
): DealerRegistryListItem[] {
  return combinedDealerRegistry(extras).map(({ name, state }) => ({
    name,
    state,
  }));
}

export function findDealerRegistryEntry(
  raw: string,
  extras: readonly ExtraDealerRegistryEntry[] = []
): DealerRegistryEntry | undefined {
  const officialName = resolveOfficialDealer(raw);
  if (officialName) {
    const official = OFFICIAL_DEALERS.find(
      dealer => dealer.name === officialName
    );
    if (official)
      return {
        name: official.name,
        state: official.state,
        origin: "official",
        normalizedKey: normalizeDealerKey(official.name),
      };
  }
  const dynamic = extrasByKey(extras).get(normalizeDealerKey(raw));
  if (!dynamic) return undefined;
  return {
    name: dynamic.name,
    state: dynamic.state,
    origin: "extra",
    normalizedKey: asExtraKey(dynamic),
    extra: dynamic,
  };
}

/**
 * Resolves only an exact official alias or an exact persisted extra. It never
 * uses substring, base-name, city, or UF guessing for a new unit.
 */
export function resolveRegisteredDealer(
  raw: string,
  extras: readonly ExtraDealerRegistryEntry[] = []
): string | null {
  return findDealerRegistryEntry(raw, extras)?.name ?? null;
}

/**
 * Resolves known commercial groups first, then exact official/dynamic units.
 * Existing collective mappings remain collective; no new allocation is
 * invented for an unknown group.
 */
export function resolveCommercialDealersWithRegistry(
  sourceLabel: string,
  state: string | null | undefined,
  extras: readonly ExtraDealerRegistryEntry[] = []
): string[] {
  const staticDealers = resolveCommercialDealers(sourceLabel, state);
  if (staticDealers.length) return [...new Set(staticDealers)];
  const dynamic = resolveRegisteredDealer(sourceLabel, extras);
  return dynamic ? [dynamic] : [];
}

export function countDealerOccurrences(
  rows: readonly { dealer: string }[],
  extras: readonly ExtraDealerRegistryEntry[] = []
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = resolveRegisteredDealer(row.dealer, extras) ?? row.dealer;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
    );
}

function normalizedWithoutTrailingState(value: string): string {
  return normalizeDealerKey(
    value.trim().replace(/(?:[/\\,;\s-])([A-Za-z]{2})\s*$/, "")
  );
}

export function isCommercialTotalLabel(value: string): boolean {
  const compact = normalizeDealerKey(value).replace(/ /g, "");
  return (
    compact === "total" ||
    compact === "totais" ||
    compact === "monthlytotal" ||
    compact === "totalmensal" ||
    compact === "grandtotal" ||
    compact === "totalgeral" ||
    compact.startsWith("total")
  );
}

function isUnknownGroupAcronym(value: string): boolean {
  const withoutState = normalizedWithoutTrailingState(value);
  if (!withoutState || withoutState.includes(" ")) return false;
  const originalBase = value
    .trim()
    .replace(/(?:[/\\,;\s-])([A-Za-z]{2})\s*$/, "")
    .trim();
  return (
    originalBase.length <= 12 &&
    /^[A-Z0-9][A-Z0-9&._-]*$/.test(originalBase) &&
    withoutState.length <= 12
  );
}

/**
 * Returns a pending reason for labels that are not safe to turn into a unit.
 * Known official aliases and known collectives are checked by the caller first;
 * the helper also recognizes them defensively for direct callers.
 */
export function classifyNonDealerLabel(
  value: string,
  state?: string | null
): DealerRegistrationPendingReason | null {
  const normalized = normalizeDealerKey(value);
  if (!normalized) return "explicit-group";
  if (resolveCommercialDealers(value, state).length) return "explicit-group";
  if (/\b(grupo|group|coletivo|coletiva|holding|regional)\b/.test(normalized))
    return "explicit-group";
  return isUnknownGroupAcronym(value) ? "unknown-group-acronym" : null;
}

export function validatedDealerState(
  suppliedState: string | null | undefined,
  sourceLabel?: string
): string | null {
  const supplied = suppliedState?.trim();
  const fromSupplied = supplied ? resolveBrazilianState(supplied) : null;
  if (fromSupplied) return fromSupplied.uf;
  const fromLabel = sourceLabel ? resolveBrazilianState(sourceLabel) : null;
  return fromLabel?.uf ?? null;
}

export function isKnownDealerOrGroup(
  sourceLabel: string,
  state: string | null | undefined,
  extras: readonly ExtraDealerRegistryEntry[] = []
): boolean {
  return (
    resolveCommercialDealersWithRegistry(sourceLabel, state, extras).length > 0 ||
    classifyNonDealerLabel(sourceLabel, state) !== null
  );
}

export function officialRegistryEntry(
  dealer: OfficialDealer
): DealerRegistryEntry {
  return {
    name: dealer.name,
    state: dealer.state,
    origin: "official",
    normalizedKey: normalizeDealerKey(dealer.name),
  };
}

export { normalizeDealerKey };
