import {
  addIsoDays,
  DASHBOARD_TIME_ZONE,
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "@shared/dashboardDates";
import { buildFollowerAnalysis } from "./socialFollowerAnalysis";

export const INSTAGRAM_ORGANIC_ACCOUNT_ID = "28842093312063059";
export const INSTAGRAM_ORGANIC_ACCOUNT_NAME = "mgmotorbrasil";
export const TIKTOK_ORGANIC_ACCOUNT_ID = "_000Yp1HuE6qKa98yQHXTVpA29y_auJ0C49W";
export const TIKTOK_ORGANIC_ACCOUNT_NAME = "MG Motor Brasil";

export type SocialOrganicPlatform = "instagram" | "tiktok";

const WINDSOR_INSTAGRAM_API_URL = "https://connectors.windsor.ai/instagram";
const WINDSOR_TIKTOK_ORGANIC_API_URL = "https://connectors.windsor.ai/tiktok_organic";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ROWS = "100000";

export const INSTAGRAM_ORGANIC_FIELDS = {
  dailyCore: [
    "account_id",
    "account_name",
    "date",
    "reach_1d",
    "total_interactions",
    "views",
  ],
  dailyFollowers: ["account_id", "account_name", "date", "follower_count_1d"],
  profile: ["account_id", "account_name", "username", "followers_count", "media_count"],
  media: [
    "account_id",
    "media_id",
    "timestamp",
    "media_caption",
    "media_type",
    "media_product_type",
    "media_permalink",
    "media_url",
    "media_thumbnail_url",
    "media_reach",
    "media_views",
    "media_engagement",
    "media_like_count",
    "media_comments_count",
    "media_saved",
    "media_shares",
    "media_follows",
  ],
} as const;

export const TIKTOK_ORGANIC_FIELDS = {
  daily: [
    "account_id",
    "account_name",
    "date",
    "total_followers_count",
    "daily_total_followers",
    "followers_count",
    "daily_lost_followers",
    "unique_video_views",
    "video_views",
    "engaged_audience",
    "likes",
    "comments",
    "shares",
    "profile_views",
    "bio_link_clicks",
  ],
  profile: [
    "account_id",
    "account_name",
    "username",
    "display_name",
    "total_followers_count",
    "videos_count",
    "profile_deep_link",
    "profile_image",
  ],
  media: [
    "account_id",
    "account_name",
    "video_id",
    "video_caption",
    "video_create_datetime",
    "video_views_count",
    "video_reach",
    "video_likes",
    "video_comments",
    "video_shares",
    "video_favorites",
    "video_new_followers",
    "video_profile_views",
    "video_average_time_watched",
    "video_full_watched_rate",
    "video_duration",
    "video_share_url",
    "video_thumbnail_url",
  ],
} as const;

export type SocialOrganicRawRow = Record<string, unknown>;

type SocialOrganicBundle = {
  currentDaily: SocialOrganicRawRow[];
  previousDaily: SocialOrganicRawRow[];
  currentMedia: SocialOrganicRawRow[];
  previousMedia: SocialOrganicRawRow[];
  profile: SocialOrganicRawRow[];
};

type CacheEntry = {
  expiresAt: number;
  bundle: SocialOrganicBundle;
  updatedAt: string;
  cacheHit: boolean;
};

type CachedEntry = Omit<CacheEntry, "cacheHit">;
const cache = new Map<string, CachedEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();

function rowsFromPayload(payload: unknown): SocialOrganicRawRow[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return [];
  const rows = (payload as { data?: unknown }).data;
  return Array.isArray(rows)
    ? rows.filter(
        (row): row is SocialOrganicRawRow => typeof row === "object" && row !== null,
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

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? round((numerator / denominator) * 100) : null;
}

function validUrl(value: unknown) {
  const url = stringOrEmpty(value);
  return /^https?:\/\//i.test(url) ? url : null;
}

function diffInDays(dateFrom: string, dateTo: string) {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}

export function resolveSocialOrganicComparisonPeriod(dateFrom: string, dateTo: string) {
  const period = resolveDashboardPeriod(dateFrom, dateTo);
  const days = diffInDays(period.dateFrom, period.dateTo);
  const previousDateTo = addIsoDays(period.dateFrom, -1);
  const previousDateFrom = addIsoDays(previousDateTo, -(days - 1));
  return {
    ...period,
    days,
    previousDateFrom,
    previousDateTo,
  };
}

async function fetchWindsorRows(
  platform: SocialOrganicPlatform,
  fields: readonly string[],
  options: { dateFrom?: string; dateTo?: string },
) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY não configurada");

  const params = new URLSearchParams({
    api_key: apiKey,
    fields: fields.join(","),
    _max_rows: MAX_ROWS,
  });
  if (options.dateFrom) params.set("date_from", options.dateFrom);
  if (options.dateTo) params.set("date_to", options.dateTo);

  const endpoint =
    platform === "instagram" ? WINDSOR_INSTAGRAM_API_URL : WINDSOR_TIKTOK_ORGANIC_API_URL;
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { "User-Agent": "MG-Motors-Dashboard/1.0" },
  });
  if (!response.ok) {
    const sourceName = platform === "instagram" ? "Instagram" : "TikTok Orgânico";
    throw new Error(`Windsor.ai ${sourceName} respondeu HTTP ${response.status}`);
  }
  return rowsFromPayload(await response.json());
}

async function fetchOptionalFollowerRows(dateFrom: string, dateTo: string) {
  try {
    return await fetchWindsorRows("instagram", INSTAGRAM_ORGANIC_FIELDS.dailyFollowers, {
      dateFrom,
      dateTo,
    });
  } catch (error) {
    console.warn("[Social Organic] Histórico de seguidores indisponível", {
      dateFrom,
      dateTo,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

function isWithinPeriod(value: unknown, dateFrom: string, dateTo: string) {
  const date = stringOrEmpty(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= dateFrom && date <= dateTo;
}

export function normalizeTikTokDailySourceRows(rows: SocialOrganicRawRow[]) {
  return rows
    .filter(row => stringOrEmpty(row.account_id) === TIKTOK_ORGANIC_ACCOUNT_ID)
    .map(row => ({
      account_id: row.account_id,
      account_name: row.account_name,
      date: row.date,
      follower_count_1d: numberOrZero(row.daily_total_followers),
      reach_1d: numberOrZero(row.unique_video_views),
      total_interactions:
        numberOrZero(row.likes) + numberOrZero(row.comments) + numberOrZero(row.shares),
      accounts_engaged: numberOrZero(row.engaged_audience),
      likes: numberOrZero(row.likes),
      comments: numberOrZero(row.comments),
      shares: numberOrZero(row.shares),
      profile_views: numberOrZero(row.profile_views),
      profile_links_taps: numberOrZero(row.bio_link_clicks),
      views: numberOrZero(row.video_views),
    }));
}

export function normalizeTikTokMediaSourceRows(rows: SocialOrganicRawRow[]) {
  return rows
    .filter(
      row =>
        stringOrEmpty(row.account_id) === TIKTOK_ORGANIC_ACCOUNT_ID &&
        Boolean(stringOrEmpty(row.video_id)),
    )
    .map(row => ({
      account_id: row.account_id,
      media_id: row.video_id,
      timestamp: row.video_create_datetime,
      media_caption: row.video_caption,
      media_type: "VIDEO",
      media_product_type: "TIKTOK_VIDEO",
      media_permalink: row.video_share_url,
      media_thumbnail_url: row.video_thumbnail_url,
      media_reach: row.video_reach,
      media_views: row.video_views_count,
      media_engagement:
        numberOrZero(row.video_likes) +
        numberOrZero(row.video_comments) +
        numberOrZero(row.video_shares) +
        numberOrZero(row.video_favorites),
      media_like_count: row.video_likes,
      media_comments_count: row.video_comments,
      media_saved: row.video_favorites,
      media_shares: row.video_shares,
      media_follows: row.video_new_followers,
    }));
}

function normalizeTikTokProfileRows(rows: SocialOrganicRawRow[]) {
  return rows
    .filter(row => stringOrEmpty(row.account_id) === TIKTOK_ORGANIC_ACCOUNT_ID)
    .map(row => ({
      account_id: row.account_id,
      account_name: row.account_name,
      username: row.username || row.display_name || row.account_name,
      followers_count: row.total_followers_count,
      media_count: row.videos_count,
    }));
}

function mergeDailySourceRows(...groups: SocialOrganicRawRow[][]) {
  const merged = new Map<string, SocialOrganicRawRow>();
  for (const rows of groups) {
    for (const row of rows) {
      const accountId = stringOrEmpty(row.account_id);
      const date = stringOrEmpty(row.date);
      if (!accountId || !date) continue;
      const key = `${accountId}:${date}`;
      merged.set(key, { ...(merged.get(key) ?? {}), ...row });
    }
  }
  return Array.from(merged.values());
}

async function fetchInstagramLiveBundle(dateFrom: string, dateTo: string) {
  const comparison = resolveSocialOrganicComparisonPeriod(dateFrom, dateTo);
  const [
    currentCore,
    previousCore,
    currentFollowers,
    previousFollowers,
    allCurrentMedia,
    allPreviousMedia,
    allProfile,
  ] = await Promise.all([
      fetchWindsorRows("instagram", INSTAGRAM_ORGANIC_FIELDS.dailyCore, { dateFrom, dateTo }),
      fetchWindsorRows("instagram", INSTAGRAM_ORGANIC_FIELDS.dailyCore, {
        dateFrom: comparison.previousDateFrom,
        dateTo: comparison.previousDateTo,
      }),
      fetchOptionalFollowerRows(dateFrom, dateTo),
      fetchOptionalFollowerRows(comparison.previousDateFrom, comparison.previousDateTo),
      fetchWindsorRows("instagram", INSTAGRAM_ORGANIC_FIELDS.media, { dateFrom, dateTo }),
      fetchWindsorRows("instagram", INSTAGRAM_ORGANIC_FIELDS.media, {
        dateFrom: comparison.previousDateFrom,
        dateTo: comparison.previousDateTo,
      }),
      fetchWindsorRows("instagram", INSTAGRAM_ORGANIC_FIELDS.profile, {}),
    ]);

  const allCurrentDaily = mergeDailySourceRows(currentCore, currentFollowers);
  const allPreviousDaily = mergeDailySourceRows(previousCore, previousFollowers);

  const forMgAccount = (row: SocialOrganicRawRow) =>
    stringOrEmpty(row.account_id) === INSTAGRAM_ORGANIC_ACCOUNT_ID;
  const currentDaily = allCurrentDaily.filter(forMgAccount);
  const previousDaily = allPreviousDaily.filter(forMgAccount);
  const currentMedia = allCurrentMedia.filter(forMgAccount);
  const previousMedia = allPreviousMedia.filter(forMgAccount);
  const profile = allProfile.filter(forMgAccount);

  if (!currentDaily.length) {
    throw new Error("Windsor.ai não retornou dados orgânicos do Instagram para o período");
  }
  return { currentDaily, previousDaily, currentMedia, previousMedia, profile };
}

async function fetchTikTokLiveBundle(dateFrom: string, dateTo: string) {
  const comparison = resolveSocialOrganicComparisonPeriod(dateFrom, dateTo);
  const [rawCurrentDaily, rawPreviousDaily, rawCurrentMedia, rawPreviousMedia, rawProfile] =
    await Promise.all([
      fetchWindsorRows("tiktok", TIKTOK_ORGANIC_FIELDS.daily, { dateFrom, dateTo }),
      fetchWindsorRows("tiktok", TIKTOK_ORGANIC_FIELDS.daily, {
        dateFrom: comparison.previousDateFrom,
        dateTo: comparison.previousDateTo,
      }),
      fetchWindsorRows("tiktok", TIKTOK_ORGANIC_FIELDS.media, { dateFrom, dateTo }),
      fetchWindsorRows("tiktok", TIKTOK_ORGANIC_FIELDS.media, {
        dateFrom: comparison.previousDateFrom,
        dateTo: comparison.previousDateTo,
      }),
      fetchWindsorRows("tiktok", TIKTOK_ORGANIC_FIELDS.profile, {}),
    ]);

  const currentDaily = normalizeTikTokDailySourceRows(rawCurrentDaily).filter(row =>
    isWithinPeriod(row.date, dateFrom, dateTo),
  );
  const previousDaily = normalizeTikTokDailySourceRows(rawPreviousDaily).filter(row =>
    isWithinPeriod(row.date, comparison.previousDateFrom, comparison.previousDateTo),
  );
  const currentMedia = normalizeTikTokMediaSourceRows(rawCurrentMedia).filter(row =>
    isWithinPeriod(row.timestamp, dateFrom, dateTo),
  );
  const previousMedia = normalizeTikTokMediaSourceRows(rawPreviousMedia).filter(row =>
    isWithinPeriod(row.timestamp, comparison.previousDateFrom, comparison.previousDateTo),
  );
  const profile = normalizeTikTokProfileRows(rawProfile);

  if (!currentDaily.length) {
    throw new Error("Windsor.ai não retornou dados orgânicos do TikTok para o período");
  }
  return { currentDaily, previousDaily, currentMedia, previousMedia, profile };
}

async function fetchLiveBundle(
  platform: SocialOrganicPlatform,
  dateFrom: string,
  dateTo: string,
) {
  return platform === "instagram"
    ? fetchInstagramLiveBundle(dateFrom, dateTo)
    : fetchTikTokLiveBundle(dateFrom, dateTo);
}

async function loadBundle(
  platform: SocialOrganicPlatform,
  dateFrom: string,
  dateTo: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CacheEntry> {
  const key = `${platform}:${dateFrom}:${dateTo}`;
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached, cacheHit: true };
  }

  const requestKey = `${options.forceRefresh ? "force" : "default"}:${key}`;
  const pending = inFlight.get(requestKey);
  if (pending) return { ...(await pending), cacheHit: true };

  const operation = (async (): Promise<CacheEntry> => {
    const bundle = await fetchLiveBundle(platform, dateFrom, dateTo);
    const entry: CachedEntry = {
      bundle,
      updatedAt: new Date().toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    cache.set(key, entry);
    return { ...entry, cacheHit: false };
  })();

  inFlight.set(requestKey, operation);
  try {
    return await operation;
  } finally {
    inFlight.delete(requestKey);
  }
}

type DailyRow = {
  date: string;
  newFollowers: number;
  dailyReach: number;
  interactions: number;
  accountsEngaged: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  replies: number;
  reposts: number;
  profileLinkTaps: number;
  profileViews: number;
  views: number;
  engagementRate: number | null;
};

function normalizeDailyRows(rows: SocialOrganicRawRow[]): DailyRow[] {
  const daily = new Map<string, Omit<DailyRow, "engagementRate">>();
  for (const row of rows) {
    const date = stringOrEmpty(row.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const current = daily.get(date) ?? {
      date,
      newFollowers: 0,
      dailyReach: 0,
      interactions: 0,
      accountsEngaged: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      replies: 0,
      reposts: 0,
      profileLinkTaps: 0,
      profileViews: 0,
      views: 0,
    };
    current.newFollowers += numberOrZero(row.follower_count_1d);
    current.dailyReach += numberOrZero(row.reach_1d);
    current.interactions += numberOrZero(row.total_interactions);
    current.accountsEngaged += numberOrZero(row.accounts_engaged);
    current.likes += numberOrZero(row.likes);
    current.comments += numberOrZero(row.comments);
    current.saves += numberOrZero(row.saves);
    current.shares += numberOrZero(row.shares);
    current.replies += numberOrZero(row.replies);
    current.reposts += numberOrZero(row.reposts);
    current.profileLinkTaps += numberOrZero(row.profile_links_taps);
    current.profileViews += numberOrZero(row.profile_views);
    current.views += numberOrZero(row.views);
    daily.set(date, current);
  }
  return Array.from(daily.values())
    .map(row => ({
      ...row,
      newFollowers: round(row.newFollowers),
      dailyReach: round(row.dailyReach),
      interactions: round(row.interactions),
      accountsEngaged: round(row.accountsEngaged),
      likes: round(row.likes),
      comments: round(row.comments),
      saves: round(row.saves),
      shares: round(row.shares),
      replies: round(row.replies),
      reposts: round(row.reposts),
      profileLinkTaps: round(row.profileLinkTaps),
      profileViews: round(row.profileViews),
      views: round(row.views),
      engagementRate: safeRate(row.interactions, row.dailyReach),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

type PeriodSummary = Omit<DailyRow, "date" | "engagementRate"> & {
  engagementRate: number | null;
};

function summarizeDaily(rows: DailyRow[]): PeriodSummary {
  const totals = rows.reduce(
    (acc, row) => {
      acc.newFollowers += row.newFollowers;
      acc.dailyReach += row.dailyReach;
      acc.interactions += row.interactions;
      acc.accountsEngaged += row.accountsEngaged;
      acc.likes += row.likes;
      acc.comments += row.comments;
      acc.saves += row.saves;
      acc.shares += row.shares;
      acc.replies += row.replies;
      acc.reposts += row.reposts;
      acc.profileLinkTaps += row.profileLinkTaps;
      acc.profileViews += row.profileViews;
      acc.views += row.views;
      return acc;
    },
    {
      newFollowers: 0,
      dailyReach: 0,
      interactions: 0,
      accountsEngaged: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      replies: 0,
      reposts: 0,
      profileLinkTaps: 0,
      profileViews: 0,
      views: 0,
    },
  );
  return {
    ...Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, round(value)]),
    ),
    engagementRate: safeRate(totals.interactions, totals.dailyReach),
  } as PeriodSummary;
}

export function buildMetricComparison(current: number | null, previous: number | null) {
  if (current == null || previous == null) {
    return { current, previous, absoluteChange: null, percentChange: null };
  }
  const absoluteChange = round(current - previous);
  const percentChange =
    previous === 0 ? (current === 0 ? 0 : null) : round((absoluteChange / previous) * 100);
  return { current, previous, absoluteChange, percentChange };
}

function buildComparisons(current: PeriodSummary, previous: PeriodSummary) {
  const keys = Object.keys(current) as Array<keyof PeriodSummary>;
  return Object.fromEntries(
    keys.map(key => [key, buildMetricComparison(current[key], previous[key])]),
  ) as Record<keyof PeriodSummary, ReturnType<typeof buildMetricComparison>>;
}

export function normalizeOrganicMedia(rows: SocialOrganicRawRow[]) {
  const byId = new Map<string, ReturnType<typeof mediaFromRow>>();
  for (const row of rows) {
    const media = mediaFromRow(row);
    if (!media.id) continue;
    const existing = byId.get(media.id);
    if (!existing || media.reach > existing.reach || media.engagements > existing.engagements) {
      byId.set(media.id, media);
    }
  }
  return Array.from(byId.values()).sort(
    (left, right) => right.reach - left.reach || right.engagements - left.engagements,
  );
}

function mediaFromRow(row: SocialOrganicRawRow) {
  const reach = numberOrZero(row.media_reach);
  const engagements = numberOrZero(row.media_engagement);
  return {
    id: stringOrEmpty(row.media_id),
    timestamp: stringOrEmpty(row.timestamp),
    caption: stringOrEmpty(row.media_caption),
    type: stringOrEmpty(row.media_type) || "UNKNOWN",
    productType: stringOrEmpty(row.media_product_type),
    permalink: validUrl(row.media_permalink),
    thumbnailUrl: validUrl(row.media_thumbnail_url) || validUrl(row.media_url),
    reach: round(reach),
    views: round(numberOrZero(row.media_views)),
    engagements: round(engagements),
    engagementRate: safeRate(engagements, reach),
    likes: round(numberOrZero(row.media_like_count)),
    comments: round(numberOrZero(row.media_comments_count)),
    saves: round(numberOrZero(row.media_saved)),
    shares: round(numberOrZero(row.media_shares)),
    follows: round(numberOrZero(row.media_follows)),
  };
}

function buildContentSummary(rows: ReturnType<typeof normalizeOrganicMedia>) {
  return rows.reduce(
    (acc, media) => {
      acc.published += 1;
      acc.reach += media.reach;
      acc.views += media.views;
      acc.engagements += media.engagements;
      return acc;
    },
    { published: 0, reach: 0, views: 0, engagements: 0 },
  );
}

function mergePublishedContentInteractions(
  summary: PeriodSummary,
  rows: ReturnType<typeof normalizeOrganicMedia>,
): PeriodSummary {
  if (!rows.length) return summary;
  const contentInteractions = rows.reduce(
    (acc, media) => {
      acc.likes += media.likes;
      acc.comments += media.comments;
      acc.saves += media.saves;
      acc.shares += media.shares;
      return acc;
    },
    { likes: 0, comments: 0, saves: 0, shares: 0 },
  );
  return {
    ...summary,
    likes: round(contentInteractions.likes),
    comments: round(contentInteractions.comments),
    saves: round(contentInteractions.saves),
    shares: round(contentInteractions.shares),
  };
}

export function buildSocialOrganicData(
  bundle: SocialOrganicBundle,
  metadata: Pick<CacheEntry, "updatedAt" | "cacheHit">,
  dateFrom: string,
  dateTo: string,
  platform: SocialOrganicPlatform = "instagram",
) {
  const comparisonPeriod = resolveSocialOrganicComparisonPeriod(dateFrom, dateTo);
  const daily = normalizeDailyRows(bundle.currentDaily);
  const previousDaily = normalizeDailyRows(bundle.previousDaily);
  const contents = normalizeOrganicMedia(bundle.currentMedia);
  const previousContents = normalizeOrganicMedia(bundle.previousMedia);
  const summary = mergePublishedContentInteractions(summarizeDaily(daily), contents);
  const previousSummary = mergePublishedContentInteractions(
    summarizeDaily(previousDaily),
    previousContents,
  );
  const contentSummary = buildContentSummary(contents);
  const previousContentSummary = buildContentSummary(previousContents);
  const profile = bundle.profile[0] ?? {};
  const topByEngagement = [...contents].sort(
    (left, right) => right.engagements - left.engagements || right.reach - left.reach,
  )[0] ?? null;
  const topByFollows = [...contents].sort(
    (left, right) => right.follows - left.follows || right.engagements - left.engagements,
  )[0] ?? null;
  const followerAnalysis = buildFollowerAnalysis(daily, contents, platform);

  return {
    platform,
    connection: {
      instagram: { status: "connected" as const, connector: "instagram" },
      tiktok: {
        status: "connected" as const,
        connector: "tiktok_organic",
      },
    },
    account: {
      id:
        stringOrEmpty(profile.account_id) ||
        (platform === "instagram" ? INSTAGRAM_ORGANIC_ACCOUNT_ID : TIKTOK_ORGANIC_ACCOUNT_ID),
      username:
        stringOrEmpty(profile.username || profile.account_name) ||
        (platform === "instagram" ? INSTAGRAM_ORGANIC_ACCOUNT_NAME : TIKTOK_ORGANIC_ACCOUNT_NAME),
      followersCurrent: round(numberOrZero(profile.followers_count)),
      mediaCountCurrent: round(numberOrZero(profile.media_count)),
      timezone: DASHBOARD_TIME_ZONE,
    },
    period: {
      dateFrom,
      dateTo,
      days: comparisonPeriod.days,
      previousDateFrom: comparisonPeriod.previousDateFrom,
      previousDateTo: comparisonPeriod.previousDateTo,
    },
    summary,
    previousSummary,
    comparisons: buildComparisons(summary, previousSummary),
    contentComparison: {
      published: buildMetricComparison(contentSummary.published, previousContentSummary.published),
      reach: buildMetricComparison(contentSummary.reach, previousContentSummary.reach),
      views: buildMetricComparison(contentSummary.views, previousContentSummary.views),
      engagements: buildMetricComparison(
        contentSummary.engagements,
        previousContentSummary.engagements,
      ),
    },
    daily,
    contents,
    followerAnalysis,
    highlights: {
      topByReach: contents[0] ?? null,
      topByEngagement,
      topByFollows: topByFollows?.follows ? topByFollows : null,
      strongestInteraction: ([
        ["likes", summary.likes],
        ["shares", summary.shares],
        ["saves", summary.saves],
        ["comments", summary.comments],
      ] as Array<[string, number]>).sort((left, right) => right[1] - left[1])[0],
    },
    metadata: {
      source: "windsor-live" as const,
      updatedAt: metadata.updatedAt,
      cacheHit: metadata.cacheHit,
      dataThroughDate: daily.at(-1)?.date ?? dateTo,
      rowCounts: {
        daily: bundle.currentDaily.length,
        previousDaily: bundle.previousDaily.length,
        media: contents.length,
        previousMedia: previousContents.length,
      },
      definitions: {
        newFollowers:
          platform === "instagram"
            ? "Novos seguidores reportados por dia; não representa crescimento líquido"
            : "Crescimento líquido diário de seguidores: ganhos menos perdas, conforme o TikTok",
        dailyReach: "Soma do alcance diário; não representa alcance único deduplicado do período",
        engagementRate: "Interações divididas pela soma do alcance diário",
        followersCurrent: "Total atual do perfil reportado pela fonte",
        interactionMix:
          platform === "instagram"
            ? "Curtidas, comentários, salvamentos e compartilhamentos dos conteúdos publicados no período"
            : "Curtidas, comentários e compartilhamentos da série diária; visualizações de perfil reportadas separadamente",
      },
    },
  };
}

export async function loadSocialOrganicData(
  platform: SocialOrganicPlatform,
  dateFrom: string,
  dateTo: string,
  options: { forceRefresh?: boolean } = {},
) {
  const period = resolveDashboardPeriod(dateFrom, dateTo);
  const result = await loadBundle(platform, period.dateFrom, period.dateTo, options);
  return buildSocialOrganicData(
    result.bundle,
    { updatedAt: result.updatedAt, cacheHit: result.cacheHit },
    period.dateFrom,
    period.dateTo,
    platform,
  );
}

export function getSocialOrganicBounds() {
  const latestDate = getDashboardCutoffDate();
  return {
    earliestDate: addIsoDays(latestDate, -92),
    latestDate,
    timezone: DASHBOARD_TIME_ZONE,
    instagramStatus: "connected" as const,
    tiktokStatus: "connected" as const,
  };
}

export function clearSocialOrganicCache() {
  cache.clear();
}
