import { addIsoDays, getDashboardCutoffDate } from "@shared/dashboardDates";
import {
  getDashboardDataSnapshot,
  upsertDashboardDataSnapshot,
} from "./db";
import { META_ADS_ACCOUNT_ID, META_ADS_ACCOUNT_NAME } from "./metaAdsService";

const WINDSOR_API_URL = "https://connectors.windsor.ai/facebook";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ROWS = 100_000;
const SNAPSHOT_PERIOD_KEY = "1900-01-01";

const INVENTORY_FIELDS = [
  "account_id",
  "account_name",
  "campaign_id",
  "campaign",
  "campaign_effective_status",
  "campaign_status",
  "adset_id",
  "adset_name",
  "adset_effective_status",
  "adset_status",
  "ad_id",
  "ad_name",
  "effective_status",
  "creative_id",
  "thumbnail_url",
  "image_url",
  "promoted_post_full_picture",
  "placement_ad_thumbnail_url",
  "effective_instagram_media__thumbnail_url",
  "effective_instagram_media__media_type",
  "effective_instagram_media__media_url",
  "effective_instagram_media__permalink",
  "facebook_permalink_url",
  "instagram_permalink_url",
  "instream_video_desktop_preview_url",
  "instream_video_mobile_preview_url",
] as const;

const STORY_FIELDS = ["account_id", "ad_id", "creative_id", "object_story_spec"] as const;

type RawRow = Record<string, unknown>;
type InventorySource = "windsor-live" | "persistent-snapshot";

type InventorySnapshotPayload = {
  capturedAt: string;
  inventoryRows: RawRow[];
  storyRows: RawRow[];
  storyDetailsAvailable: boolean;
};

type InventoryCacheEntry = {
  expiresAt: number;
  value: MetaCreativeInventory;
};

export type MetaCreativeFormat = "IMAGE" | "VIDEO" | "CAROUSEL" | "UNKNOWN";
export type MetaCreativeOperationalStatus =
  | "ACTIVE"
  | "CAMPAIGN_PAUSED"
  | "ADSET_PAUSED"
  | "AD_PAUSED"
  | "DISABLED";

export type MetaCarouselCard = {
  position: number;
  name: string | null;
  description: string | null;
  link: string | null;
  imageHash: string | null;
  videoId: string | null;
  previewUrl: string | null;
};

export type MetaCreativeInventoryItem = {
  id: string;
  adId: string;
  creativeId: string;
  name: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  campaignStatus: string;
  adsetStatus: string;
  adStatus: string;
  operationalStatus: MetaCreativeOperationalStatus;
  operationalLabel: string;
  isActive: boolean;
  format: MetaCreativeFormat;
  mediaType: string | null;
  previewUrl: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  videoPreviewUrl: string | null;
  permalinkUrl: string | null;
  cards: MetaCarouselCard[];
  carouselCardCount: number;
  carouselCardsWithPreview: number;
  carouselMediaComplete: boolean;
};

export type MetaCreativeInventory = {
  account: {
    id: string;
    name: string;
  };
  queryWindow: {
    dateFrom: string;
    dateTo: string;
  };
  creatives: MetaCreativeInventoryItem[];
  coverage: {
    scope: string;
    totalRows: number;
    totalAds: number;
    uniqueCreatives: number;
    activeAds: number;
    inactiveAds: number;
    withPreview: number;
    withoutPreview: number;
    truncated: boolean;
    formats: Record<MetaCreativeFormat, number>;
    carouselCards: number;
    carouselCardsWithPreview: number;
    storyDetailsAvailable: boolean;
  };
  warnings: string[];
  metadata: {
    source: InventorySource;
    updatedAt: string;
    cacheHit: boolean;
    stale: boolean;
    includeObjectsWithoutInsights: true;
    maxRows: number;
  };
};

const cache = new Map<string, InventoryCacheEntry>();
const inFlight = new Map<string, Promise<MetaCreativeInventory>>();

function rowsFromPayload(payload: unknown): RawRow[] {
  if (!payload || typeof payload !== "object") return [];
  if ("error" in payload && (payload as { error?: unknown }).error) {
    const error = (payload as { error?: { message?: unknown } }).error;
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "A fonte Meta Ads recusou a consulta de inventário",
    );
  }
  if (!("data" in payload)) return [];
  const rows = (payload as { data?: unknown }).data;
  return Array.isArray(rows)
    ? rows.filter((row): row is RawRow => typeof row === "object" && row !== null)
    : [];
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function safeUrl(value: unknown): string | null {
  const candidate = stringOrEmpty(value);
  return /^https?:\/\//i.test(candidate) ? candidate : null;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mergeRows(rows: RawRow[]) {
  const byAd = new Map<string, RawRow>();
  rows.forEach((row, index) => {
    const adId = stringOrEmpty(row.ad_id);
    const creativeId = stringOrEmpty(row.creative_id);
    const key = adId || (creativeId ? `creative:${creativeId}` : `row:${index}`);
    const current = byAd.get(key);
    if (!current) {
      byAd.set(key, { ...row });
      return;
    }
    for (const [field, value] of Object.entries(row)) {
      const existing = current[field];
      const existingEmpty = existing == null || stringOrEmpty(existing) === "";
      const incomingPresent = value != null && (typeof value === "object" || stringOrEmpty(value) !== "");
      if (existingEmpty && incomingPresent) current[field] = value;
    }
  });
  return Array.from(byAd.values());
}

function buildStoryIndex(rows: RawRow[]) {
  const byAd = new Map<string, Record<string, unknown>>();
  const byCreative = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const story = parseObject(row.object_story_spec);
    if (!story) continue;
    const adId = stringOrEmpty(row.ad_id);
    const creativeId = stringOrEmpty(row.creative_id);
    if (adId) byAd.set(adId, story);
    if (creativeId) byCreative.set(creativeId, story);
  }
  return { byAd, byCreative };
}

function parseCarouselCards(story: Record<string, unknown> | null): MetaCarouselCard[] {
  if (!story) return [];
  const linkData = parseObject(story.link_data);
  const attachments = linkData?.child_attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => ({
      position: index + 1,
      name: stringOrEmpty(item.name) || null,
      description: stringOrEmpty(item.description) || null,
      link: safeUrl(item.link),
      imageHash: stringOrEmpty(item.image_hash) || null,
      videoId: stringOrEmpty(item.video_id) || null,
      previewUrl: safeUrl(item.picture) ?? safeUrl(item.image_url),
    }));
}

function normalizeStatus(value: unknown) {
  return stringOrEmpty(value).toUpperCase() || "UNKNOWN";
}

function deriveOperationalStatus(input: {
  campaignStatus: string;
  adsetStatus: string;
  adStatus: string;
}): Pick<MetaCreativeInventoryItem, "operationalStatus" | "operationalLabel" | "isActive"> {
  if (input.campaignStatus !== "ACTIVE") {
    return {
      operationalStatus: "CAMPAIGN_PAUSED",
      operationalLabel: "Campanha pausada",
      isActive: false,
    };
  }
  if (input.adsetStatus !== "ACTIVE") {
    return {
      operationalStatus: "ADSET_PAUSED",
      operationalLabel: "Conjunto pausado",
      isActive: false,
    };
  }
  if (input.adStatus !== "ACTIVE") {
    return {
      operationalStatus: "AD_PAUSED",
      operationalLabel: "Anúncio pausado",
      isActive: false,
    };
  }
  if ([input.campaignStatus, input.adsetStatus, input.adStatus].every(status => status === "ACTIVE")) {
    return { operationalStatus: "ACTIVE", operationalLabel: "Ativo", isActive: true };
  }
  return { operationalStatus: "DISABLED", operationalLabel: "Desativado", isActive: false };
}

function resolveFormat(mediaType: string, cards: MetaCarouselCard[]): MetaCreativeFormat {
  if (mediaType === "CAROUSEL_ALBUM" || cards.length > 1) return "CAROUSEL";
  if (mediaType === "VIDEO") return "VIDEO";
  if (mediaType === "IMAGE") return "IMAGE";
  return "UNKNOWN";
}

function firstUrl(...values: unknown[]) {
  for (const value of values) {
    const url = safeUrl(value);
    if (url) return url;
  }
  return null;
}

export function buildMetaCreativeInventory(
  inventoryRows: RawRow[],
  storyRows: RawRow[],
  input: {
    source: InventorySource;
    updatedAt: string;
    cacheHit: boolean;
    stale: boolean;
    storyDetailsAvailable: boolean;
    dateFrom: string;
    dateTo: string;
  },
): MetaCreativeInventory {
  const storyIndex = buildStoryIndex(storyRows);
  const mergedRows = mergeRows(inventoryRows);

  const creatives = mergedRows
    .map((row, index): MetaCreativeInventoryItem => {
      const adId = stringOrEmpty(row.ad_id);
      const creativeId = stringOrEmpty(row.creative_id);
      const campaignStatus = normalizeStatus(row.campaign_effective_status ?? row.campaign_status);
      const adsetStatus = normalizeStatus(row.adset_effective_status ?? row.adset_status);
      const adStatus = normalizeStatus(row.effective_status);
      const operational = deriveOperationalStatus({ campaignStatus, adsetStatus, adStatus });
      const story = storyIndex.byAd.get(adId) ?? storyIndex.byCreative.get(creativeId) ?? null;
      const cards = parseCarouselCards(story);
      const mediaType = normalizeStatus(row.effective_instagram_media__media_type);
      const format = resolveFormat(mediaType, cards);
      const mediaUrl = safeUrl(row.effective_instagram_media__media_url);
      const thumbnailUrl = firstUrl(
        row.effective_instagram_media__thumbnail_url,
        row.promoted_post_full_picture,
        row.placement_ad_thumbnail_url,
        row.image_url,
        row.thumbnail_url,
      );
      const videoPreviewUrl = firstUrl(
        row.instream_video_desktop_preview_url,
        row.instream_video_mobile_preview_url,
      );
      const previewUrl =
        format === "VIDEO" ? thumbnailUrl : firstUrl(mediaUrl, thumbnailUrl);
      const carouselCardsWithPreview = cards.filter(card => card.previewUrl).length;

      return {
        id: adId || creativeId || `meta-row-${index + 1}`,
        adId,
        creativeId,
        name: stringOrEmpty(row.ad_name) || "Anúncio sem nome",
        campaignId: stringOrEmpty(row.campaign_id),
        campaignName: stringOrEmpty(row.campaign) || "Campanha sem nome",
        adsetId: stringOrEmpty(row.adset_id),
        adsetName: stringOrEmpty(row.adset_name) || "Conjunto sem nome",
        campaignStatus,
        adsetStatus,
        adStatus,
        ...operational,
        format,
        mediaType: mediaType === "UNKNOWN" ? null : mediaType,
        previewUrl,
        mediaUrl,
        thumbnailUrl,
        videoPreviewUrl,
        permalinkUrl: firstUrl(
          row.effective_instagram_media__permalink,
          row.instagram_permalink_url,
          row.facebook_permalink_url,
        ),
        cards,
        carouselCardCount: cards.length,
        carouselCardsWithPreview,
        carouselMediaComplete: cards.length === 0 || carouselCardsWithPreview === cards.length,
      };
    })
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });

  const formats: Record<MetaCreativeFormat, number> = {
    IMAGE: 0,
    VIDEO: 0,
    CAROUSEL: 0,
    UNKNOWN: 0,
  };
  for (const creative of creatives) formats[creative.format] += 1;

  const withPreview = creatives.filter(creative => creative.previewUrl).length;
  const activeAds = creatives.filter(creative => creative.isActive).length;
  const carouselCards = creatives.reduce((sum, creative) => sum + creative.carouselCardCount, 0);
  const carouselCardsWithPreview = creatives.reduce(
    (sum, creative) => sum + creative.carouselCardsWithPreview,
    0,
  );
  const warnings: string[] = [];
  if (creatives.length > 0 && activeAds === 0) {
    warnings.push("Todos os criativos retornados estão desativados no momento.");
  }
  if (withPreview < creatives.length) {
    warnings.push(`${creatives.length - withPreview} anúncio(s) não possuem URL de prévia na fonte.`);
  }
  if (carouselCardsWithPreview < carouselCards) {
    warnings.push(
      `${carouselCards - carouselCardsWithPreview} cartão(ões) de carrossel possuem identificação, mas não URL individual na fonte.`,
    );
  }
  if (!input.storyDetailsAvailable) {
    warnings.push("Os detalhes internos de carrossel não estavam disponíveis nesta atualização.");
  }
  if (inventoryRows.length >= MAX_ROWS) {
    warnings.push("A fonte atingiu o limite máximo de linhas; a cobertura pode estar truncada.");
  }

  return {
    account: {
      id: META_ADS_ACCOUNT_ID,
      name: stringOrEmpty(mergedRows[0]?.account_name) || META_ADS_ACCOUNT_NAME,
    },
    queryWindow: { dateFrom: input.dateFrom, dateTo: input.dateTo },
    creatives,
    coverage: {
      scope: "Todos os anúncios acessíveis retornados pela conexão Meta, inclusive sem insights no período",
      totalRows: inventoryRows.length,
      totalAds: creatives.length,
      uniqueCreatives: new Set(creatives.map(item => item.creativeId).filter(Boolean)).size,
      activeAds,
      inactiveAds: creatives.length - activeAds,
      withPreview,
      withoutPreview: creatives.length - withPreview,
      truncated: inventoryRows.length >= MAX_ROWS,
      formats,
      carouselCards,
      carouselCardsWithPreview,
      storyDetailsAvailable: input.storyDetailsAvailable,
    },
    warnings,
    metadata: {
      source: input.source,
      updatedAt: input.updatedAt,
      cacheHit: input.cacheHit,
      stale: input.stale,
      includeObjectsWithoutInsights: true,
      maxRows: MAX_ROWS,
    },
  };
}

async function fetchWindsorRows(
  fields: readonly string[],
  dateFrom: string,
  dateTo: string,
): Promise<RawRow[]> {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY não configurada");

  const params = new URLSearchParams({
    api_key: apiKey,
    fields: fields.join(","),
    date_from: dateFrom,
    date_to: dateTo,
    filter: JSON.stringify([["account_id", "eq", META_ADS_ACCOUNT_ID]]),
    _max_rows: String(MAX_ROWS),
    include_objects_without_insights: "true",
  });
  const response = await fetch(`${WINDSOR_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": "MG-Motors-Dashboard/1.0" },
  });
  if (!response.ok) throw new Error(`Windsor.ai Meta Ads respondeu HTTP ${response.status}`);
  return rowsFromPayload(await response.json());
}

async function readPersistentInventory() {
  const stored = await getDashboardDataSnapshot<InventorySnapshotPayload>({
    source: "META_ADS",
    periodFrom: SNAPSHOT_PERIOD_KEY,
    periodTo: SNAPSHOT_PERIOD_KEY,
  });
  if (!stored || !Array.isArray(stored.payload.inventoryRows)) return undefined;
  return {
    payload: stored.payload,
    refreshedAt: stored.refreshedAt,
  };
}

async function persistInventory(payload: InventorySnapshotPayload, dataThroughDate: string) {
  try {
    await upsertDashboardDataSnapshot({
      source: "META_ADS",
      periodFrom: SNAPSHOT_PERIOD_KEY,
      periodTo: SNAPSHOT_PERIOD_KEY,
      dataThroughDate,
      sourceName: "windsor-live-creative-inventory",
      payload,
      refreshedAt: Date.parse(payload.capturedAt),
    });
  } catch (error) {
    console.warn(
      "[Meta Ads] Não foi possível persistir o inventário de criativos:",
      error instanceof Error ? error.message : error,
    );
  }
}

function buildFromSnapshot(
  payload: InventorySnapshotPayload,
  input: {
    source: InventorySource;
    cacheHit: boolean;
    stale: boolean;
    dateFrom: string;
    dateTo: string;
  },
) {
  return buildMetaCreativeInventory(payload.inventoryRows, payload.storyRows, {
    ...input,
    updatedAt: payload.capturedAt,
    storyDetailsAvailable: payload.storyDetailsAvailable,
  });
}

export async function loadMetaCreativeInventory(
  options: { forceRefresh?: boolean } = {},
): Promise<MetaCreativeInventory> {
  const key = META_ADS_ACCOUNT_ID;
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      metadata: { ...cached.value.metadata, cacheHit: true },
    };
  }

  const requestKey = options.forceRefresh ? `${key}:force` : key;
  const pending = inFlight.get(requestKey);
  if (pending) {
    const result = await pending;
    return { ...result, metadata: { ...result.metadata, cacheHit: true } };
  }

  const operation = (async () => {
    const dateTo = getDashboardCutoffDate();
    const dateFrom = addIsoDays(dateTo, -30);
    let persistent: Awaited<ReturnType<typeof readPersistentInventory>>;
    try {
      persistent = await readPersistentInventory();
    } catch (error) {
      console.warn(
        "[Meta Ads] Snapshot persistente de criativos indisponível:",
        error instanceof Error ? error.message : error,
      );
    }

    const persistentAge = persistent ? Date.now() - persistent.refreshedAt : Number.POSITIVE_INFINITY;
    if (!options.forceRefresh && persistent && persistentAge <= CACHE_TTL_MS) {
      const value = buildFromSnapshot(persistent.payload, {
        source: "persistent-snapshot",
        cacheHit: true,
        stale: false,
        dateFrom,
        dateTo,
      });
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }

    try {
      const [inventoryRows, storyResult] = await Promise.all([
        fetchWindsorRows(INVENTORY_FIELDS, dateFrom, dateTo),
        fetchWindsorRows(STORY_FIELDS, dateFrom, dateTo)
          .then(rows => ({ rows, available: true }))
          .catch(error => {
            console.warn(
              "[Meta Ads] Detalhes de carrossel indisponíveis:",
              error instanceof Error ? error.message : error,
            );
            return { rows: [] as RawRow[], available: false };
          }),
      ]);
      const capturedAt = new Date().toISOString();
      const payload: InventorySnapshotPayload = {
        capturedAt,
        inventoryRows,
        storyRows: storyResult.rows,
        storyDetailsAvailable: storyResult.available,
      };
      const value = buildFromSnapshot(payload, {
        source: "windsor-live",
        cacheHit: false,
        stale: false,
        dateFrom,
        dateTo,
      });
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      void persistInventory(payload, dateTo);
      return value;
    } catch (error) {
      if (!persistent) throw error;
      console.warn(
        "[Meta Ads] Inventário ao vivo indisponível; usando snapshot persistente:",
        error instanceof Error ? error.message : error,
      );
      const value = buildFromSnapshot(persistent.payload, {
        source: "persistent-snapshot",
        cacheHit: true,
        stale: true,
        dateFrom,
        dateTo,
      });
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }
  })();

  inFlight.set(requestKey, operation);
  try {
    return await operation;
  } finally {
    inFlight.delete(requestKey);
  }
}

export function clearMetaCreativeInventoryCache() {
  cache.clear();
}
