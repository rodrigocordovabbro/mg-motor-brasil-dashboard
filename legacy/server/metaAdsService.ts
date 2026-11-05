import {
  addIsoDays,
  DASHBOARD_TIME_ZONE,
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "@shared/dashboardDates";
import snapshotFile from "./data/mg-motors-meta-ads.json" with { type: "json" };
import {
  getDashboardDataSnapshot,
  upsertDashboardDataSnapshot,
} from "./db";
import { buildMetaAdsPacing } from "./metaAdsPacing";

export const META_ADS_ACCOUNT_ID = "1418731006678061";
export const META_ADS_ACCOUNT_NAME = "Ag. BBRO - MG Motor Brasil - AUT";
export const META_ADS_TIMEZONE = DASHBOARD_TIME_ZONE;

const WINDSOR_API_URL = "https://connectors.windsor.ai/facebook";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ROWS = "100000";

const QUERY_FIELDS = {
  daily: [
    "account_id",
    "account_name",
    "account_currency",
    "account_timezone",
    "date",
    "spend",
    "actions_lead",
    "cost_per_action_type_lead",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
  ],
  campaigns: [
    "campaign_id",
    "campaign",
    "campaign_effective_status",
    "campaign_status",
    "campaign_objective",
    "spend",
    "actions_lead",
    "cost_per_action_type_lead",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
  ],
  adsets: [
    "campaign_id",
    "campaign",
    "adset_id",
    "adset_name",
    "adset_effective_status",
    "adset_status",
    "adset_targeting",
    "spend",
    "actions_lead",
    "cost_per_action_type_lead",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
  ],
  creatives: [
    "campaign_id",
    "campaign",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "creative_id",
    "thumbnail_url",
    "image_url",
    "promoted_post_full_picture",
    "placement_ad_thumbnail_url",
    "effective_instagram_media__thumbnail_url",
    "spend",
    "actions_lead",
    "cost_per_action_type_lead",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
  ],
  demographics: [
    "age",
    "gender",
    "spend",
    "actions_lead",
    "cost_per_action_type_lead",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
  ],
  regions: [
    "region",
    "spend",
    "actions_lead",
    "cost_per_action_type_lead",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
  ],
} as const;

type QueryName = keyof typeof QUERY_FIELDS;
type RawRow = Record<string, unknown>;
type QueryBundle = Record<QueryName, RawRow[]>;

type MetaSnapshot = {
  capturedAt: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  data: QueryBundle;
};

type CacheEntry = {
  expiresAt: number;
  bundle: QueryBundle;
  source: "windsor-live" | "validated-snapshot" | "persistent-snapshot";
  updatedAt: string;
  cacheHit: boolean;
};

type CachedMetaEntry = Omit<CacheEntry, "cacheHit">;
type MetaCachePayload = { bundle: QueryBundle; updatedAt: string };

const snapshot = snapshotFile as unknown as MetaSnapshot;
const cache = new Map<string, CachedMetaEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();
let boundsCache:
  | {
      expiresAt: number;
      value: ReturnType<typeof buildBounds>;
    }
  | undefined;

function rowsFromPayload(payload: unknown): RawRow[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return [];
  const rows = (payload as { data?: unknown }).data;
  return Array.isArray(rows)
    ? rows.filter((row): row is RawRow => typeof row === "object" && row !== null)
    : [];
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function nullableCpl(spend: number, leads: number) {
  return leads > 0 ? round(spend / leads) : null;
}

function parseTargeting(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getNamedItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item =>
      item && typeof item === "object" && "name" in item
        ? stringOrEmpty((item as { name?: unknown }).name)
        : "",
    )
    .filter(Boolean);
}

function buildTargetingSummary(targeting: Record<string, unknown> | null) {
  if (!targeting) return [];
  const summaries: string[] = [];
  const ageMin = numberOrZero(targeting.age_min);
  const ageMax = numberOrZero(targeting.age_max);
  if (ageMin || ageMax) summaries.push(`Idade ${ageMin || "?"}–${ageMax || "+"}`);

  const customAudiences = getNamedItems(targeting.custom_audiences);
  if (customAudiences.length) summaries.push(`Públicos: ${customAudiences.slice(0, 3).join(", ")}`);

  const lookalikes = getNamedItems(targeting.lookalike_spec);
  if (lookalikes.length) summaries.push(`Semelhantes: ${lookalikes.slice(0, 3).join(", ")}`);

  const excluded = getNamedItems(targeting.excluded_custom_audiences);
  if (excluded.length) summaries.push(`Exclui: ${excluded.slice(0, 2).join(", ")}`);

  const interests: string[] = [];
  const behaviors: string[] = [];
  if (Array.isArray(targeting.flexible_spec)) {
    for (const spec of targeting.flexible_spec) {
      if (!spec || typeof spec !== "object") continue;
      interests.push(...getNamedItems((spec as Record<string, unknown>).interests));
      behaviors.push(...getNamedItems((spec as Record<string, unknown>).behaviors));
    }
  }
  if (interests.length) summaries.push(`Interesses: ${interests.slice(0, 4).join(", ")}`);
  if (behaviors.length) summaries.push(`Comportamentos: ${behaviors.slice(0, 3).join(", ")}`);

  const geo = targeting.geo_locations;
  if (geo && typeof geo === "object") {
    const cities = getNamedItems((geo as Record<string, unknown>).cities);
    if (cities.length) summaries.push(`${cities.length} cidades segmentadas`);
  }

  const platforms = Array.isArray(targeting.publisher_platforms)
    ? targeting.publisher_platforms.map(stringOrEmpty).filter(Boolean)
    : [];
  if (platforms.length) summaries.push(`Plataformas: ${platforms.join(", ")}`);
  return summaries;
}

function collectAudienceCatalog(rows: RawRow[]) {
  const interests = new Set<string>();
  const customAudiences = new Set<string>();
  const excludedAudiences = new Set<string>();
  const behaviors = new Set<string>();

  for (const row of rows) {
    const targeting = parseTargeting(row.adset_targeting);
    if (!targeting) continue;
    getNamedItems(targeting.custom_audiences).forEach(item => customAudiences.add(item));
    getNamedItems(targeting.excluded_custom_audiences).forEach(item => excludedAudiences.add(item));
    if (!Array.isArray(targeting.flexible_spec)) continue;
    for (const spec of targeting.flexible_spec) {
      if (!spec || typeof spec !== "object") continue;
      getNamedItems((spec as Record<string, unknown>).interests).forEach(item => interests.add(item));
      getNamedItems((spec as Record<string, unknown>).behaviors).forEach(item => behaviors.add(item));
    }
  }

  return {
    interests: Array.from(interests).sort((left, right) => left.localeCompare(right, "pt-BR")),
    customAudiences: Array.from(customAudiences).sort((left, right) => left.localeCompare(right, "pt-BR")),
    excludedAudiences: Array.from(excludedAudiences).sort((left, right) => left.localeCompare(right, "pt-BR")),
    behaviors: Array.from(behaviors).sort((left, right) => left.localeCompare(right, "pt-BR")),
  };
}

function extractModel(...names: unknown[]) {
  const normalized = names.map(stringOrEmpty).join(" ").toUpperCase().replace(/[\s_-]+/g, " ");
  if (/\bMG\s*4\b/.test(normalized)) return "MG4";
  if (/\bMG\s*5\b/.test(normalized)) return "MG5";
  if (normalized.includes("CYBERSTER")) return "Cyberster";
  return "Outros";
}

const CREATIVE_IMAGE_FIELDS = [
  "placement_ad_thumbnail_url",
  "effective_instagram_media__thumbnail_url",
  "image_url",
  "promoted_post_full_picture",
  "thumbnail_url",
] as const;

type CreativeImageField = (typeof CREATIVE_IMAGE_FIELDS)[number];

function creativeImageCandidates(row: RawRow) {
  return CREATIVE_IMAGE_FIELDS.map(field => ({
    field,
    url: stringOrEmpty(row[field]),
  })).filter(candidate => /^https?:\/\//i.test(candidate.url));
}

function canonicalImageIdentity(value: string) {
  try {
    const url = new URL(value);
    // Meta varia host e query string temporária para o mesmo arquivo. O caminho
    // contém a identidade estável do asset e permite detectar thumbnails
    // genéricos reutilizados entre creative_ids distintos.
    return url.pathname;
  } catch {
    return null;
  }
}

function buildCreativeImageUsage(rows: RawRow[]) {
  const ownersByImage = new Map<string, Set<string>>();
  for (const row of rows) {
    const owner = stringOrEmpty(row.creative_id) || stringOrEmpty(row.ad_id);
    if (!owner) continue;
    for (const candidate of creativeImageCandidates(row)) {
      const identity = canonicalImageIdentity(candidate.url);
      if (!identity) continue;
      const owners = ownersByImage.get(identity) ?? new Set<string>();
      owners.add(owner);
      ownersByImage.set(identity, owners);
    }
  }
  return ownersByImage;
}

function pickCreativeImage(
  row: RawRow,
  ownersByImage: Map<string, Set<string>>,
): { url: string | null; source: CreativeImageField | null } {
  for (const candidate of creativeImageCandidates(row)) {
    const identity = canonicalImageIdentity(candidate.url);
    if (!identity) continue;
    const owners = ownersByImage.get(identity);
    if (!owners || owners.size !== 1) continue;
    return { url: candidate.url, source: candidate.field };
  }
  return { url: null, source: null };
}

async function fetchWindsorRows(fields: readonly string[], dateFrom: string, dateTo: string) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY não configurada");

  const params = new URLSearchParams({
    api_key: apiKey,
    fields: fields.join(","),
    date_from: dateFrom,
    date_to: dateTo,
    filter: JSON.stringify([["account_id", "eq", META_ADS_ACCOUNT_ID]]),
    _max_rows: MAX_ROWS,
  });
  const response = await fetch(`${WINDSOR_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { "User-Agent": "MG-Motors-Dashboard/1.0" },
  });
  if (!response.ok) throw new Error(`Windsor.ai Meta Ads respondeu HTTP ${response.status}`);
  return rowsFromPayload(await response.json());
}

async function fetchLiveBundle(dateFrom: string, dateTo: string): Promise<QueryBundle> {
  const entries = await Promise.all(
    (Object.entries(QUERY_FIELDS) as Array<[QueryName, readonly string[]]>).map(
      async ([name, fields]) => [name, await fetchWindsorRows(fields, dateFrom, dateTo)] as const,
    ),
  );
  const bundle = Object.fromEntries(entries) as QueryBundle;
  if (bundle.daily.length === 0 || bundle.campaigns.length === 0) {
    throw new Error("Windsor.ai não retornou dados Meta Ads para o período");
  }
  return bundle;
}

function fallbackBundle(dateFrom: string, dateTo: string) {
  if (dateFrom !== snapshot.dateFrom || dateTo !== snapshot.dateTo) return null;
  return snapshot.data;
}

function isQueryBundle(value: unknown): value is QueryBundle {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (Object.keys(QUERY_FIELDS) as QueryName[]).every(name => Array.isArray(record[name]));
}

async function readPersistentMetaBundle(dateFrom: string, dateTo: string) {
  try {
    const stored = await getDashboardDataSnapshot<MetaCachePayload>({
      source: "META_ADS",
      periodFrom: dateFrom,
      periodTo: dateTo,
    });
    if (!stored || stored.dataThroughDate < dateTo || !isQueryBundle(stored.payload.bundle)) {
      return undefined;
    }

    const entry: CachedMetaEntry = {
      bundle: stored.payload.bundle,
      source: "persistent-snapshot",
      updatedAt:
        typeof stored.payload.updatedAt === "string"
          ? stored.payload.updatedAt
          : new Date(stored.refreshedAt).toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    return entry;
  } catch (error) {
    console.warn(
      "[Meta Ads] Snapshot persistente indisponível:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

async function persistMetaBundle(
  dateFrom: string,
  dateTo: string,
  bundle: QueryBundle,
  updatedAt: string,
) {
  const dataThroughDate = bundle.daily.reduce((latest, row) => {
    const date = stringOrEmpty(row.date);
    return date > latest ? date : latest;
  }, "");
  if (!dataThroughDate) return;

  try {
    await upsertDashboardDataSnapshot({
      source: "META_ADS",
      periodFrom: dateFrom,
      periodTo: dateTo,
      dataThroughDate,
      sourceName: "windsor-live",
      payload: { bundle, updatedAt } satisfies MetaCachePayload,
      refreshedAt: Date.parse(updatedAt),
    });
  } catch (error) {
    console.warn(
      "[Meta Ads] Não foi possível persistir o snapshot:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function loadBundle(
  dateFrom: string,
  dateTo: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CacheEntry> {
  const key = `${dateFrom}:${dateTo}`;
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached, cacheHit: true };
  }

  const requestKey = `${options.forceRefresh ? "force" : "default"}:${key}`;
  const pending = inFlight.get(requestKey);
  if (pending) return { ...(await pending), cacheHit: true };

  const operation = (async (): Promise<CacheEntry> => {
    if (!options.forceRefresh) {
      const persistent = await readPersistentMetaBundle(dateFrom, dateTo);
      if (persistent) {
        cache.set(key, persistent);
        return { ...persistent, cacheHit: true };
      }
    }

    try {
      const bundle = await fetchLiveBundle(dateFrom, dateTo);
      const updatedAt = new Date().toISOString();
      const entry: CachedMetaEntry = {
        bundle,
        source: "windsor-live",
        updatedAt,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      cache.set(key, entry);
      await persistMetaBundle(dateFrom, dateTo, bundle, updatedAt);
      return { ...entry, cacheHit: false };
    } catch (error) {
      const persistent = await readPersistentMetaBundle(dateFrom, dateTo);
      if (persistent) {
        cache.set(key, persistent);
        return { ...persistent, cacheHit: true };
      }

      const bundle = fallbackBundle(dateFrom, dateTo);
      if (!bundle) throw error;
      console.warn(
        "[Meta Ads] Usando snapshot validado:",
        error instanceof Error ? error.message : error,
      );
      const entry: CachedMetaEntry = {
        bundle,
        source: "validated-snapshot",
        updatedAt: snapshot.capturedAt,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      cache.set(key, entry);
      return { ...entry, cacheHit: false };
    }
  })();

  inFlight.set(requestKey, operation);
  try {
    return await operation;
  } finally {
    inFlight.delete(requestKey);
  }
}

function aggregateRows<T extends string>(rows: RawRow[], dimension: T) {
  const groups = new Map<
    string,
    { spend: number; leads: number; impressions: number; clicks: number }
  >();
  for (const row of rows) {
    const key = stringOrEmpty(row[dimension]) || "unknown";
    const current = groups.get(key) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0 };
    current.spend += numberOrZero(row.spend);
    current.leads += numberOrZero(row.actions_lead);
    current.impressions += numberOrZero(row.impressions);
    current.clicks += numberOrZero(row.clicks);
    groups.set(key, current);
  }
  return groups;
}

export function buildMetaAdsData(
  bundle: QueryBundle,
  metadata: Pick<CacheEntry, "source" | "updatedAt" | "cacheHit">,
  dateFrom: string,
  dateTo: string,
) {
  const daily = bundle.daily
    .map(row => {
      const spend = numberOrZero(row.spend);
      const leads = numberOrZero(row.actions_lead);
      const impressions = numberOrZero(row.impressions);
      const clicks = numberOrZero(row.clicks);
      return {
        date: stringOrEmpty(row.date),
        spend: round(spend),
        leads: round(leads),
        cpl: nullableCpl(spend, leads),
        impressions: round(impressions),
        clicks: round(clicks),
        ctr: round(safeDivide(clicks, impressions) * 100),
      };
    })
    .filter(row => row.date.length === 10)
    .sort((left, right) => left.date.localeCompare(right.date));

  const totals = daily.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.leads += row.leads;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      return acc;
    },
    { spend: 0, leads: 0, impressions: 0, clicks: 0 },
  );
  const reach = bundle.campaigns.reduce((sum, row) => sum + numberOrZero(row.reach), 0);

  const campaigns = bundle.campaigns
    .map(row => {
      const spend = numberOrZero(row.spend);
      const leads = numberOrZero(row.actions_lead);
      return {
        id: stringOrEmpty(row.campaign_id),
        name: stringOrEmpty(row.campaign) || "Campanha sem nome",
        objective: stringOrEmpty(row.campaign_objective),
        status: stringOrEmpty(row.campaign_effective_status || row.campaign_status) || "UNKNOWN",
        spend: round(spend),
        leads: round(leads),
        cpl: nullableCpl(spend, leads),
        impressions: round(numberOrZero(row.impressions)),
        reach: round(numberOrZero(row.reach)),
        clicks: round(numberOrZero(row.clicks)),
      };
    })
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const audiences = bundle.adsets
    .map(row => {
      const spend = numberOrZero(row.spend);
      const leads = numberOrZero(row.actions_lead);
      const targeting = parseTargeting(row.adset_targeting);
      return {
        id: stringOrEmpty(row.adset_id),
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign),
        name: stringOrEmpty(row.adset_name) || "Conjunto sem nome",
        status: stringOrEmpty(row.adset_effective_status || row.adset_status) || "UNKNOWN",
        spend: round(spend),
        leads: round(leads),
        cpl: nullableCpl(spend, leads),
        impressions: round(numberOrZero(row.impressions)),
        reach: round(numberOrZero(row.reach)),
        clicks: round(numberOrZero(row.clicks)),
        targetingSummary: buildTargetingSummary(targeting),
      };
    })
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const creativeImageUsage = buildCreativeImageUsage(bundle.creatives);
  const creatives = bundle.creatives
    .map(row => {
      const spend = numberOrZero(row.spend);
      const leads = numberOrZero(row.actions_lead);
      const adId = stringOrEmpty(row.ad_id);
      const creativeId = stringOrEmpty(row.creative_id);
      const image = pickCreativeImage(row, creativeImageUsage);
      return {
        id: adId || creativeId,
        adId,
        creativeId,
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign),
        adsetId: stringOrEmpty(row.adset_id),
        adsetName: stringOrEmpty(row.adset_name),
        name: stringOrEmpty(row.ad_name) || "Criativo sem nome",
        model: extractModel(row.ad_name, row.adset_name, row.campaign),
        spend: round(spend),
        leads: round(leads),
        cpl: nullableCpl(spend, leads),
        impressions: round(numberOrZero(row.impressions)),
        reach: round(numberOrZero(row.reach)),
        clicks: round(numberOrZero(row.clicks)),
        imageUrl: image.url,
        imageSource: image.source,
      };
    })
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const modelMap = new Map<string, { ads: number; spend: number; leads: number }>();
  for (const creative of creatives) {
    const current = modelMap.get(creative.model) ?? { ads: 0, spend: 0, leads: 0 };
    current.ads += 1;
    current.spend += creative.spend;
    current.leads += creative.leads;
    modelMap.set(creative.model, current);
  }
  const models = Array.from(modelMap.entries())
    .map(([model, values]) => ({
      model,
      ads: values.ads,
      spend: round(values.spend),
      leads: round(values.leads),
      cpl: nullableCpl(values.spend, values.leads),
    }))
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const genders = Array.from(aggregateRows(bundle.demographics, "gender").entries())
    .map(([gender, values]) => ({
      gender,
      spend: round(values.spend),
      leads: round(values.leads),
      cpl: nullableCpl(values.spend, values.leads),
      impressions: round(values.impressions),
      clicks: round(values.clicks),
    }))
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const ages = Array.from(aggregateRows(bundle.demographics, "age").entries())
    .map(([age, values]) => ({
      age,
      spend: round(values.spend),
      leads: round(values.leads),
      cpl: nullableCpl(values.spend, values.leads),
      impressions: round(values.impressions),
      clicks: round(values.clicks),
    }))
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const regions = bundle.regions
    .map(row => ({
      region: stringOrEmpty(row.region) || "Não informado",
      spend: round(numberOrZero(row.spend)),
      impressions: round(numberOrZero(row.impressions)),
      reach: round(numberOrZero(row.reach)),
      clicks: round(numberOrZero(row.clicks)),
      leads: null,
      cpl: null,
    }))
    .sort((left, right) => right.reach - left.reach || right.spend - left.spend);

  const dataThroughDate = daily.at(-1)?.date ?? dateTo;
  const pacing = buildMetaAdsPacing({ dateFrom, dateTo, daily });
  return {
    account: {
      id: META_ADS_ACCOUNT_ID,
      name: stringOrEmpty(bundle.daily[0]?.account_name) || META_ADS_ACCOUNT_NAME,
      currency: stringOrEmpty(bundle.daily[0]?.account_currency) || "BRL",
      timezone: stringOrEmpty(bundle.daily[0]?.account_timezone) || META_ADS_TIMEZONE,
      datasource: "facebook",
    },
    period: { dateFrom, dateTo },
    summary: {
      spend: round(totals.spend),
      leads: round(totals.leads),
      cpl: round(safeDivide(totals.spend, totals.leads)),
      impressions: round(totals.impressions),
      reach: round(reach),
      clicks: round(totals.clicks),
      ctr: round(safeDivide(totals.clicks, totals.impressions) * 100),
    },
    daily,
    pacing,
    models,
    campaigns,
    audiences,
    audienceCatalog: collectAudienceCatalog(bundle.adsets),
    creatives,
    demographics: { genders, ages },
    regions,
    highlights: {
      topModel: models[0] ?? null,
      topAudience: audiences[0] ?? null,
      topCreative: creatives[0] ?? null,
      topGender: genders[0] ?? null,
      topAge: ages[0] ?? null,
      topRegionByReach: regions[0] ?? null,
    },
    metadata: {
      ...metadata,
      dataThroughDate,
      rowCounts: Object.fromEntries(
        Object.entries(bundle).map(([name, rows]) => [name, rows.length]),
      ),
      cacheTtlSeconds: CACHE_TTL_MS / 1000,
      regionalLeadsAvailable: false,
    },
  };
}

export async function loadMetaAdsData(
  dateFrom: string,
  dateTo: string,
  options: { forceRefresh?: boolean } = {},
) {
  const period = resolveDashboardPeriod(dateFrom, dateTo);
  const result = await loadBundle(period.dateFrom, period.dateTo, options);
  return buildMetaAdsData(
    result.bundle,
    { source: result.source, updatedAt: result.updatedAt, cacheHit: result.cacheHit },
    period.dateFrom,
    period.dateTo,
  );
}

function buildBounds(rows: RawRow[]) {
  const dates = rows
    .map(row => stringOrEmpty(row.date))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return {
    earliestDate: dates[0] ?? snapshot.dateFrom,
    latestDate: dates.at(-1) ?? snapshot.dateTo,
    timezone: stringOrEmpty(rows[0]?.account_timezone) || META_ADS_TIMEZONE,
  };
}

function capBoundsAtCutoff(
  value: ReturnType<typeof buildBounds>,
  cutoffDate: string,
): ReturnType<typeof buildBounds> {
  return {
    ...value,
    earliestDate: value.earliestDate > cutoffDate ? cutoffDate : value.earliestDate,
    latestDate: cutoffDate,
  };
}

export async function getMetaAdsBounds() {
  if (boundsCache && boundsCache.expiresAt > Date.now()) return boundsCache.value;
  const cutoffDate = getDashboardCutoffDate();
  const start = addIsoDays(cutoffDate, -92);
  try {
    const rows = await fetchWindsorRows(QUERY_FIELDS.daily, start, cutoffDate);
    const value = capBoundsAtCutoff(buildBounds(rows), cutoffDate);
    boundsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.warn(
      "[Meta Ads] Limites ao vivo indisponíveis; usando snapshot:",
      error instanceof Error ? error.message : error,
    );
    const value = capBoundsAtCutoff(buildBounds(snapshot.data.daily), cutoffDate);
    boundsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }
}

export function clearMetaAdsCache() {
  cache.clear();
  boundsCache = undefined;
}
