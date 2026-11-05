export type DashboardModuleId = "google-ads" | "meta-ads" | "tiktok-ads" | "social-organic" | "leads" | "media-plan" | "access-history";
export type GoogleAdsTabId = "overview" | "daily" | "investment" | "optimizations" | "history";

export type DashboardRoute = {
  module: DashboardModuleId;
  googleTab: GoogleAdsTabId;
};

export const DEFAULT_GOOGLE_ADS_TAB: GoogleAdsTabId = "overview";
export const GOOGLE_ADS_TAB_IDS: readonly GoogleAdsTabId[] = [
  "overview",
  "daily",
  "investment",
  "optimizations",
  "history",
];

const DASHBOARD_MODULE_IDS: readonly DashboardModuleId[] = ["google-ads", "meta-ads", "tiktok-ads", "social-organic", "leads", "media-plan", "access-history"];

function isGoogleAdsTab(value: string | null): value is GoogleAdsTabId {
  return value !== null && GOOGLE_ADS_TAB_IDS.includes(value as GoogleAdsTabId);
}

function isDashboardModule(value: string | null): value is DashboardModuleId {
  return value !== null && DASHBOARD_MODULE_IDS.includes(value as DashboardModuleId);
}

export function resolveDashboardRoute(search: string): DashboardRoute {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const requestedModule = params.get("module");
  const googleTab = isGoogleAdsTab(tab) ? tab : DEFAULT_GOOGLE_ADS_TAB;

  if (isDashboardModule(requestedModule)) {
    return { module: requestedModule, googleTab };
  }

  if (tab === "leads") {
    return { module: "leads", googleTab };
  }

  return { module: "google-ads", googleTab };
}

export function buildDashboardSearch(
  currentSearch: string,
  module: DashboardModuleId,
  googleTab: GoogleAdsTabId,
): string {
  const params = new URLSearchParams(currentSearch);
  params.set("module", module);

  if (module === "google-ads") {
    params.set("tab", googleTab);
  } else if (module === "leads") {
    params.set("tab", "leads");
  } else {
    params.delete("tab");
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
