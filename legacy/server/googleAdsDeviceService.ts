import { MG_MOTORS_ACCOUNT_ID } from "./dashboardService";

const WINDSOR_API_URL = "https://connectors.windsor.ai/google_ads";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type GoogleAdsDeviceRow = {
  device: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  account_id: string;
  datasource: string;
};

type DeviceCacheEntry = {
  expiresAt: number;
  value: GoogleAdsDeviceMix;
};

export type GoogleAdsDeviceMix = {
  period: { dateFrom: string; dateTo: string };
  dataThroughDate: string | null;
  source: "windsor-live" | "cache";
  devices: Array<{
    device: string;
    label: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    impressionShare: number;
  }>;
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
  };
};

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Mobile",
  DESKTOP: "Desktop",
  TABLET: "Tablet",
  CONNECTED_TV: "TV conectada",
  OTHER: "Outros",
  UNKNOWN: "Não informado",
};

const deviceCache = new Map<string, DeviceCacheEntry>();

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeDeviceRows(payload: unknown): GoogleAdsDeviceRow[] {
  const data = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && "data" in payload
      ? (payload as { data?: unknown }).data
      : [];

  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map(row => ({
      device: String(row.device ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
      date: String(row.date ?? ""),
      impressions: numberOrZero(row.impressions),
      clicks: numberOrZero(row.clicks),
      spend: numberOrZero(row.spend),
      conversions: numberOrZero(row.conversions),
      account_id: String(row.account_id ?? ""),
      datasource: String(row.datasource ?? ""),
    }))
    .filter(
      row =>
        row.account_id === MG_MOTORS_ACCOUNT_ID &&
        row.datasource === "google_ads" &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.date),
    );
}

export function buildGoogleAdsDeviceMix(
  rows: GoogleAdsDeviceRow[],
  dateFrom: string,
  dateTo: string,
): Omit<GoogleAdsDeviceMix, "source"> {
  const filteredRows = rows.filter(row => row.date >= dateFrom && row.date <= dateTo);
  const grouped = new Map<string, Omit<GoogleAdsDeviceMix["devices"][number], "label" | "impressionShare">>();

  for (const row of filteredRows) {
    const current = grouped.get(row.device) ?? {
      device: row.device,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
    };
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    current.spend += row.spend;
    current.conversions += row.conversions;
    grouped.set(row.device, current);
  }

  const totals = Array.from(grouped.values()).reduce(
    (total, item) => ({
      impressions: total.impressions + item.impressions,
      clicks: total.clicks + item.clicks,
      spend: total.spend + item.spend,
      conversions: total.conversions + item.conversions,
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  );

  const devices = Array.from(grouped.values())
    .map(item => ({
      ...item,
      label: DEVICE_LABELS[item.device] ?? item.device.replaceAll("_", " "),
      impressions: round(item.impressions),
      clicks: round(item.clicks),
      spend: round(item.spend),
      conversions: round(item.conversions, 1),
      impressionShare: totals.impressions > 0 ? round((item.impressions / totals.impressions) * 100, 1) : 0,
    }))
    .sort((left, right) => right.impressions - left.impressions);

  return {
    period: { dateFrom, dateTo },
    dataThroughDate: filteredRows.reduce((latest, row) => (row.date > latest ? row.date : latest), "") || null,
    devices,
    totals: {
      impressions: round(totals.impressions),
      clicks: round(totals.clicks),
      spend: round(totals.spend),
      conversions: round(totals.conversions, 1),
    },
  };
}

export function clearGoogleAdsDeviceCache() {
  deviceCache.clear();
}

export async function loadGoogleAdsDeviceMix(dateFrom: string, dateTo: string): Promise<GoogleAdsDeviceMix> {
  const cacheKey = `${dateFrom}:${dateTo}`;
  const cached = deviceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, source: "cache" };
  }

  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) throw new Error("WINDSOR_API_KEY não configurada");

  const params = new URLSearchParams({
    api_key: apiKey,
    fields: "device,impressions,clicks,spend,conversions,date,campaign_id,account_id,datasource",
    date_from: dateFrom,
    date_to: dateTo,
    filter: JSON.stringify([["account_id", "eq", MG_MOTORS_ACCOUNT_ID]]),
    _max_rows: "100000",
  });
  const response = await fetch(`${WINDSOR_API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(25_000),
    headers: { "User-Agent": "MG-Motors-Dashboard/1.0" },
  });
  if (!response.ok) throw new Error(`Windsor.ai respondeu HTTP ${response.status}`);

  const mix = buildGoogleAdsDeviceMix(normalizeDeviceRows(await response.json()), dateFrom, dateTo);
  if (!mix.devices.length) throw new Error("Windsor.ai não retornou dados de dispositivos para o período");

  const value: GoogleAdsDeviceMix = { ...mix, source: "windsor-live" };
  deviceCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
