import {
  addIsoDays,
  DASHBOARD_TIME_ZONE,
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "@shared/dashboardDates";
import {
  getDashboardDataSnapshot,
  upsertDashboardDataSnapshot,
} from "./db";

export const TIKTOK_ADS_ACCOUNT_ID = "7668787778449719316";
export const TIKTOK_ADS_ACCOUNT_NAME = "Ag. BBRO - MG Motor Brasil - AUT";
export const TIKTOK_ADS_TIMEZONE = DASHBOARD_TIME_ZONE;
export const TIKTOK_ADS_EARLIEST_VERIFIED_DATE = "2026-08-13";

const WINDSOR_API_URL = "https://connectors.windsor.ai/tiktok";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ROWS = "100000";

export const TIKTOK_QUERY_FIELDS = {
  daily: [
    "account_id",
    "account_name",
    "currency",
    "date",
    "spend",
    "onsite_form",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
    "engagements",
    "engagement_rate",
    "comments",
    "shares",
    "average_video_play",
  ],
  campaignDaily: [
    "date",
    "campaign_id",
    "campaign",
    "spend",
    "onsite_form",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "engagements",
    "comments",
    "shares",
    "average_video_play",
  ],
  adGroupDaily: [
    "date",
    "campaign_id",
    "campaign",
    "ad_group_id",
    "ad_group_name",
    "spend",
    "onsite_form",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "engagements",
    "comments",
    "shares",
    "average_video_play",
  ],
  campaigns: [
    "campaign_id",
    "campaign",
    "campaign_operation_status",
    "campaign_status",
    "campaign_optimization_goal",
    "spend",
    "onsite_form",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "engagements",
    "comments",
    "shares",
    "average_video_play",
  ],
  adGroups: [
    "campaign_id",
    "campaign",
    "ad_group_id",
    "ad_group_name",
    "ad_group_operation_status",
    "adgroup_status",
    "placement",
    "placement_type",
    "budget",
    "bid_strategy",
    "spend",
    "onsite_form",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "engagements",
    "comments",
    "shares",
    "average_video_play",
  ],
  ads: [
    "campaign_id",
    "campaign",
    "ad_group_id",
    "ad_group_name",
    "ad_id",
    "ad_name",
    "ad_operation_status",
    "ad_status",
    "ad_text",
    "ad_format",
    "call_to_action",
    "video_id",
    "video_thumbnail_url",
    "video_url",
    "image_url",
    "ad_url",
    "spend",
    "onsite_form",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "engagements",
    "comments",
    "shares",
    "average_video_play",
  ],
  demographics: [
    "age",
    "gender",
    "spend",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "ctr",
  ],
  regions: [
    "province_name",
    "spend",
    "conversions",
    "impressions",
    "reach",
    "clicks",
    "ctr",
  ],
} as const;

export type TikTokQueryName = keyof typeof TIKTOK_QUERY_FIELDS;
export type TikTokRawRow = Record<string, unknown>;
export type TikTokQueryBundle = Record<TikTokQueryName, TikTokRawRow[]>;

type TikTokCacheSource = "windsor-live" | "persistent-snapshot";
type CacheEntry = {
  expiresAt: number;
  bundle: TikTokQueryBundle;
  source: TikTokCacheSource;
  updatedAt: string;
  cacheHit: boolean;
};
type CachedEntry = Omit<CacheEntry, "cacheHit">;
type TikTokCachePayload = { bundle: TikTokQueryBundle; updatedAt: string };

const cache = new Map<string, CachedEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();
let boundsCache:
  | {
      expiresAt: number;
      value: ReturnType<typeof buildBounds>;
    }
  | undefined;

function rowsFromPayload(payload: unknown): TikTokRawRow[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return [];
  const rows = (payload as { data?: unknown }).data;
  return Array.isArray(rows)
    ? rows.filter(
        (row): row is TikTokRawRow => typeof row === "object" && row !== null,
      )
    : [];
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function nullableCost(spend: number, results: number) {
  return results > 0 ? round(spend / results) : null;
}

function validUrl(value: unknown) {
  const url = stringOrEmpty(value);
  return /^https?:\/\//i.test(url) ? url : null;
}

function extractModel(...names: unknown[]) {
  const normalized = names
    .map(stringOrEmpty)
    .join(" ")
    .toUpperCase()
    .replace(/[\s_-]+/g, " ");
  if (/\bMG\s*4\b/.test(normalized) && normalized.includes("URBAN")) return "MG4 URBAN";
  if (/\bMG\s*4\b/.test(normalized)) return "MG4";
  if (/\bMG\s*S?5\b/.test(normalized)) return "MGS5";
  if (normalized.includes("CYBERSTER")) return "CYBERSTER";
  return "Outros";
}

function metricsFromRow(row: TikTokRawRow, resultField: "onsite_form" | "conversions") {
  const spend = numberOrZero(row.spend);
  const results = numberOrZero(row[resultField]);
  const impressions = numberOrZero(row.impressions);
  const clicks = numberOrZero(row.clicks);
  const engagements = numberOrZero(row.engagements);
  return {
    spend: round(spend),
    results: round(results),
    costPerResult: nullableCost(spend, results),
    impressions: round(impressions),
    reach: round(numberOrZero(row.reach)),
    clicks: round(clicks),
    ctr: round(safeDivide(clicks, impressions) * 100),
    cpc: nullableCost(spend, clicks),
    cpm: impressions > 0 ? round((spend / impressions) * 1000) : null,
    engagements: round(engagements),
    engagementRate: round(safeDivide(engagements, impressions) * 100),
    comments: round(numberOrZero(row.comments)),
    shares: round(numberOrZero(row.shares)),
    averageVideoPlay: round(numberOrZero(row.average_video_play)),
  };
}

async function fetchWindsorRows(
  fields: readonly string[],
  dateFrom: string,
  dateTo: string,
) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY não configurada");

  const params = new URLSearchParams({
    api_key: apiKey,
    fields: fields.join(","),
    date_from: dateFrom,
    date_to: dateTo,
    filter: JSON.stringify([["account_id", "eq", TIKTOK_ADS_ACCOUNT_ID]]),
    _max_rows: MAX_ROWS,
  });
  const response = await fetch(`${WINDSOR_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { "User-Agent": "MG-Motors-Dashboard/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Windsor.ai TikTok Ads respondeu HTTP ${response.status}`);
  }
  return rowsFromPayload(await response.json());
}

function validateLiveBundle(
  bundle: TikTokQueryBundle,
  dateFrom: string,
  dateTo: string,
) {
  const required: TikTokQueryName[] = [
    "daily",
    "campaignDaily",
    "adGroupDaily",
    "campaigns",
    "adGroups",
    "ads",
  ];
  const empty = required.filter(name => bundle[name].length === 0);
  if (empty.length) {
    throw new Error(
      `Windsor.ai não retornou dados TikTok Ads completos para o período: ${empty.join(", ")}`,
    );
  }

  const foreignAccount = bundle.daily.find(row => {
    const accountId = stringOrEmpty(row.account_id);
    return accountId && accountId !== TIKTOK_ADS_ACCOUNT_ID;
  });
  if (foreignAccount) throw new Error("Windsor.ai retornou uma conta TikTok Ads inesperada");

  const dates = bundle.daily.map(row => stringOrEmpty(row.date)).filter(Boolean);
  if (
    dates.some(
      date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < dateFrom || date > dateTo,
    )
  ) {
    throw new Error("Windsor.ai retornou datas TikTok Ads fora do período solicitado");
  }
}

async function fetchLiveBundle(
  dateFrom: string,
  dateTo: string,
): Promise<TikTokQueryBundle> {
  const entries = await Promise.all(
    (Object.entries(TIKTOK_QUERY_FIELDS) as Array<[
      TikTokQueryName,
      readonly string[],
    ]>).map(async ([name, fields]) => [name, await fetchWindsorRows(fields, dateFrom, dateTo)] as const),
  );
  const bundle = Object.fromEntries(entries) as TikTokQueryBundle;
  validateLiveBundle(bundle, dateFrom, dateTo);
  return bundle;
}

function isQueryBundle(value: unknown): value is TikTokQueryBundle {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (Object.keys(TIKTOK_QUERY_FIELDS) as TikTokQueryName[]).every(name =>
    Array.isArray(record[name]),
  );
}

async function readPersistentBundle(dateFrom: string, dateTo: string) {
  try {
    const stored = await getDashboardDataSnapshot<TikTokCachePayload>({
      source: "TIKTOK_ADS",
      periodFrom: dateFrom,
      periodTo: dateTo,
    });
    if (!stored || stored.dataThroughDate < dateTo || !isQueryBundle(stored.payload.bundle)) {
      return undefined;
    }
    return {
      bundle: stored.payload.bundle,
      source: "persistent-snapshot" as const,
      updatedAt:
        typeof stored.payload.updatedAt === "string"
          ? stored.payload.updatedAt
          : new Date(stored.refreshedAt).toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    } satisfies CachedEntry;
  } catch (error) {
    console.warn(
      "[TikTok Ads] Snapshot persistente indisponível:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

async function persistBundle(
  dateFrom: string,
  dateTo: string,
  bundle: TikTokQueryBundle,
  updatedAt: string,
) {
  const dataThroughDate = bundle.daily.reduce((latest, row) => {
    const date = stringOrEmpty(row.date);
    return date > latest ? date : latest;
  }, "");
  if (!dataThroughDate) return;

  try {
    await upsertDashboardDataSnapshot({
      source: "TIKTOK_ADS",
      periodFrom: dateFrom,
      periodTo: dateTo,
      dataThroughDate,
      sourceName: "windsor-live",
      payload: { bundle, updatedAt } satisfies TikTokCachePayload,
      refreshedAt: Date.parse(updatedAt),
    });
  } catch (error) {
    console.warn(
      "[TikTok Ads] Não foi possível persistir o snapshot:",
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
      const persistent = await readPersistentBundle(dateFrom, dateTo);
      if (persistent) {
        cache.set(key, persistent);
        return { ...persistent, cacheHit: true };
      }
    }

    try {
      const bundle = await fetchLiveBundle(dateFrom, dateTo);
      const updatedAt = new Date().toISOString();
      const entry: CachedEntry = {
        bundle,
        source: "windsor-live",
        updatedAt,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      cache.set(key, entry);
      await persistBundle(dateFrom, dateTo, bundle, updatedAt);
      return { ...entry, cacheHit: false };
    } catch (error) {
      const persistent = await readPersistentBundle(dateFrom, dateTo);
      if (!persistent) throw error;
      cache.set(key, persistent);
      return { ...persistent, cacheHit: true };
    }
  })();

  inFlight.set(requestKey, operation);
  try {
    return await operation;
  } finally {
    inFlight.delete(requestKey);
  }
}

function aggregateDimension(rows: TikTokRawRow[], dimension: "age" | "gender") {
  const groups = new Map<
    string,
    { spend: number; conversions: number; impressions: number; reach: number; clicks: number }
  >();
  for (const row of rows) {
    const key = stringOrEmpty(row[dimension]) || "NONE";
    const current = groups.get(key) ?? {
      spend: 0,
      conversions: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
    };
    current.spend += numberOrZero(row.spend);
    current.conversions += numberOrZero(row.conversions);
    current.impressions += numberOrZero(row.impressions);
    current.reach += numberOrZero(row.reach);
    current.clicks += numberOrZero(row.clicks);
    groups.set(key, current);
  }
  return Array.from(groups.entries())
    .map(([key, values]) => ({
      key,
      spend: round(values.spend),
      conversions: round(values.conversions),
      costPerConversion: nullableCost(values.spend, values.conversions),
      impressions: round(values.impressions),
      reach: round(values.reach),
      clicks: round(values.clicks),
      ctr: round(safeDivide(values.clicks, values.impressions) * 100),
    }))
    .sort(
      (left, right) =>
        right.conversions - left.conversions || right.spend - left.spend,
    );
}

export function buildTikTokAdsData(
  bundle: TikTokQueryBundle,
  metadata: Pick<CacheEntry, "source" | "updatedAt" | "cacheHit">,
  dateFrom: string,
  dateTo: string,
) {
  const daily = bundle.daily
    .map(row => {
      const metrics = metricsFromRow(row, "onsite_form");
      return {
        date: stringOrEmpty(row.date),
        spend: metrics.spend,
        leads: metrics.results,
        conversions: round(numberOrZero(row.conversions)),
        cpl: metrics.costPerResult,
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        cpc: metrics.cpc,
        cpm: metrics.cpm,
        engagements: metrics.engagements,
        engagementRate: metrics.engagementRate,
        comments: metrics.comments,
        shares: metrics.shares,
        averageVideoPlay: metrics.averageVideoPlay,
      };
    })
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((left, right) => left.date.localeCompare(right.date));

  const campaignDaily = bundle.campaignDaily
    .map(row => {
      const metrics = metricsFromRow(row, "onsite_form");
      return {
        date: stringOrEmpty(row.date),
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign),
        spend: metrics.spend,
        leads: metrics.results,
        conversions: round(numberOrZero(row.conversions)),
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        cpl: metrics.costPerResult,
        engagements: metrics.engagements,
      };
    })
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.campaignId)
    .sort((left, right) => left.date.localeCompare(right.date));

  const adGroupDaily = bundle.adGroupDaily
    .map(row => {
      const metrics = metricsFromRow(row, "onsite_form");
      return {
        date: stringOrEmpty(row.date),
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign),
        adGroupId: stringOrEmpty(row.ad_group_id),
        adGroupName: stringOrEmpty(row.ad_group_name),
        spend: metrics.spend,
        leads: metrics.results,
        conversions: round(numberOrZero(row.conversions)),
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        cpl: metrics.costPerResult,
        engagements: metrics.engagements,
      };
    })
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.adGroupId)
    .sort((left, right) => left.date.localeCompare(right.date));

  const totals = daily.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.leads += row.leads;
      acc.conversions += row.conversions;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.engagements += row.engagements;
      acc.comments += row.comments;
      acc.shares += row.shares;
      acc.weightedVideoPlay += row.averageVideoPlay * row.impressions;
      return acc;
    },
    {
      spend: 0,
      leads: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
      engagements: 0,
      comments: 0,
      shares: 0,
      weightedVideoPlay: 0,
    },
  );
  const reach = bundle.campaigns.reduce(
    (sum, row) => sum + numberOrZero(row.reach),
    0,
  );

  const campaigns = bundle.campaigns
    .map(row => {
      const metrics = metricsFromRow(row, "onsite_form");
      return {
        id: stringOrEmpty(row.campaign_id),
        name: stringOrEmpty(row.campaign) || "Campanha sem nome",
        status:
          stringOrEmpty(row.campaign_operation_status || row.campaign_status) || "UNKNOWN",
        deliveryStatus: stringOrEmpty(row.campaign_status) || "UNKNOWN",
        objective: stringOrEmpty(row.campaign_optimization_goal),
        spend: metrics.spend,
        leads: metrics.results,
        cpl: metrics.costPerResult,
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        engagements: metrics.engagements,
        averageVideoPlay: metrics.averageVideoPlay,
      };
    })
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const adGroups = bundle.adGroups
    .map(row => {
      const metrics = metricsFromRow(row, "onsite_form");
      return {
        id: stringOrEmpty(row.ad_group_id),
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign),
        name: stringOrEmpty(row.ad_group_name) || "Grupo sem nome",
        status: stringOrEmpty(row.ad_group_operation_status) || "UNKNOWN",
        deliveryStatus: stringOrEmpty(row.adgroup_status) || "UNKNOWN",
        placement: stringOrEmpty(row.placement || row.placement_type),
        budget: round(numberOrZero(row.budget)),
        bidStrategy: stringOrEmpty(row.bid_strategy),
        spend: metrics.spend,
        leads: metrics.results,
        cpl: metrics.costPerResult,
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        engagements: metrics.engagements,
        averageVideoPlay: metrics.averageVideoPlay,
      };
    })
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const ads = bundle.ads
    .map(row => {
      const metrics = metricsFromRow(row, "onsite_form");
      const name = stringOrEmpty(row.ad_name) || "Anúncio sem nome";
      return {
        id: stringOrEmpty(row.ad_id),
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign),
        adGroupId: stringOrEmpty(row.ad_group_id),
        adGroupName: stringOrEmpty(row.ad_group_name),
        name,
        text: stringOrEmpty(row.ad_text),
        format: stringOrEmpty(row.ad_format),
        callToAction: stringOrEmpty(row.call_to_action),
        status: stringOrEmpty(row.ad_operation_status) || "UNKNOWN",
        deliveryStatus: stringOrEmpty(row.ad_status) || "UNKNOWN",
        model: extractModel(name, row.ad_group_name, row.campaign),
        videoId: stringOrEmpty(row.video_id),
        thumbnailUrl: validUrl(row.video_thumbnail_url) || validUrl(row.image_url),
        videoUrl: validUrl(row.video_url),
        adUrl: validUrl(row.ad_url),
        spend: metrics.spend,
        leads: metrics.results,
        cpl: metrics.costPerResult,
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        engagements: metrics.engagements,
        comments: metrics.comments,
        shares: metrics.shares,
        averageVideoPlay: metrics.averageVideoPlay,
      };
    })
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const modelMap = new Map<string, { ads: number; spend: number; leads: number }>();
  for (const ad of ads) {
    const current = modelMap.get(ad.model) ?? { ads: 0, spend: 0, leads: 0 };
    current.ads += 1;
    current.spend += ad.spend;
    current.leads += ad.leads;
    modelMap.set(ad.model, current);
  }
  const models = Array.from(modelMap.entries())
    .map(([model, values]) => ({
      model,
      ads: values.ads,
      spend: round(values.spend),
      leads: round(values.leads),
      cpl: nullableCost(values.spend, values.leads),
    }))
    .sort((left, right) => right.leads - left.leads || right.spend - left.spend);

  const genders = aggregateDimension(bundle.demographics, "gender").map(item => ({
    gender: item.key,
    ...item,
  }));
  const ages = aggregateDimension(bundle.demographics, "age").map(item => ({
    age: item.key,
    ...item,
  }));
  const regions = bundle.regions
    .map(row => {
      const metrics = metricsFromRow(row, "conversions");
      return {
        region: stringOrEmpty(row.province_name) || "Não informado",
        spend: metrics.spend,
        conversions: metrics.results,
        costPerConversion: metrics.costPerResult,
        impressions: metrics.impressions,
        reach: metrics.reach,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
      };
    })
    .sort(
      (left, right) =>
        right.conversions - left.conversions || right.spend - left.spend,
    );

  const dataThroughDate = daily.at(-1)?.date ?? dateTo;
  return {
    account: {
      id: TIKTOK_ADS_ACCOUNT_ID,
      name: stringOrEmpty(bundle.daily[0]?.account_name) || TIKTOK_ADS_ACCOUNT_NAME,
      currency: stringOrEmpty(bundle.daily[0]?.currency) || "BRL",
      timezone: TIKTOK_ADS_TIMEZONE,
      datasource: "tiktok",
    },
    period: { dateFrom, dateTo },
    summary: {
      spend: round(totals.spend),
      leads: round(totals.leads),
      conversions: round(totals.conversions),
      cpl: nullableCost(totals.spend, totals.leads),
      impressions: round(totals.impressions),
      reach: round(reach),
      clicks: round(totals.clicks),
      ctr: round(safeDivide(totals.clicks, totals.impressions) * 100),
      cpc: nullableCost(totals.spend, totals.clicks),
      cpm:
        totals.impressions > 0
          ? round((totals.spend / totals.impressions) * 1000)
          : null,
      engagements: round(totals.engagements),
      engagementRate: round(
        safeDivide(totals.engagements, totals.impressions) * 100,
      ),
      comments: round(totals.comments),
      shares: round(totals.shares),
      averageVideoPlay:
        totals.impressions > 0
          ? round(totals.weightedVideoPlay / totals.impressions)
          : 0,
    },
    daily,
    dailyBreakdown: {
      campaigns: campaignDaily,
      adGroups: adGroupDaily,
    },
    models,
    campaigns,
    adGroups,
    ads,
    demographics: { genders, ages },
    regions,
    highlights: {
      topModel: models[0] ?? null,
      topCampaign: campaigns[0] ?? null,
      topAdGroup: adGroups[0] ?? null,
      topAd: ads[0] ?? null,
      topGender: genders[0] ?? null,
      topAge: ages[0] ?? null,
      topRegion: regions[0] ?? null,
    },
    metadata: {
      ...metadata,
      dataThroughDate,
      rowCounts: Object.fromEntries(
        Object.entries(bundle).map(([name, rows]) => [name, rows.length]),
      ),
      cacheTtlSeconds: CACHE_TTL_MS / 1000,
      leadMetric: "onsite_form" as const,
      segmentedResultMetric: "conversions" as const,
      demographicLeadsAvailable: false,
      regionalLeadsAvailable: false,
    },
  };
}

export async function loadTikTokAdsData(
  dateFrom: string,
  dateTo: string,
  options: { forceRefresh?: boolean } = {},
) {
  const period = resolveDashboardPeriod(dateFrom, dateTo);
  const result = await loadBundle(period.dateFrom, period.dateTo, options);
  return buildTikTokAdsData(
    result.bundle,
    {
      source: result.source,
      updatedAt: result.updatedAt,
      cacheHit: result.cacheHit,
    },
    period.dateFrom,
    period.dateTo,
  );
}

function buildBounds(rows: TikTokRawRow[]) {
  const dates = rows
    .map(row => stringOrEmpty(row.date))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return {
    earliestDate: dates[0] ?? TIKTOK_ADS_EARLIEST_VERIFIED_DATE,
    latestDate: dates.at(-1) ?? getDashboardCutoffDate(),
    timezone: TIKTOK_ADS_TIMEZONE,
  };
}

export async function getTikTokAdsBounds() {
  if (boundsCache && boundsCache.expiresAt > Date.now()) return boundsCache.value;
  const cutoffDate = getDashboardCutoffDate();
  const start = addIsoDays(cutoffDate, -92);
  try {
    const rows = await fetchWindsorRows(TIKTOK_QUERY_FIELDS.daily, start, cutoffDate);
    if (!rows.length) throw new Error("Windsor.ai não retornou limites TikTok Ads");
    const raw = buildBounds(rows);
    const value = {
      ...raw,
      latestDate: raw.latestDate > cutoffDate ? cutoffDate : raw.latestDate,
    };
    boundsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.warn(
      "[TikTok Ads] Limites ao vivo indisponíveis:",
      error instanceof Error ? error.message : error,
    );
    const value = {
      earliestDate: TIKTOK_ADS_EARLIEST_VERIFIED_DATE,
      latestDate: cutoffDate,
      timezone: TIKTOK_ADS_TIMEZONE,
    };
    boundsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }
}

export function clearTikTokAdsCache() {
  cache.clear();
  boundsCache = undefined;
}
