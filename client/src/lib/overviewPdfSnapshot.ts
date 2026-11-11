import type { V2Dashboard } from "@shared/v2Types";

/** A non-security render key. Only aggregate report fields participate; no contacts or search terms. */
export function getOverviewPdfSnapshotVersion(data: V2Dashboard): string {
  const value = JSON.stringify({
    status: data.status,
    period: data.period,
    latestLeadDate: data.source?.latestLeadDate ?? null,
    summary: data.summary?.total,
    pacing: data.pacing,
    historicalPace: data.historicalPace,
    daily: data.daily,
    channels: data.channels,
    dealerRegistry: data.dealerRegistry
      ?.map(item => ({ name: item.name, state: item.state }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          String(a.state).localeCompare(String(b.state))
      ),
    sales: {
      available: data.dealerPerformance?.available,
      dealerSalesKind: data.dealerPerformance?.dealerSalesKind,
      totals: data.dealerPerformance?.totals,
      rows: data.dealerPerformance?.rows,
      registration: data.dealerPerformance?.generalRegistrationMTD,
      retail: data.dealerPerformance?.generalRetailMTD,
    },
  });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `overview-${(hash >>> 0).toString(16)}`;
}

/** Wait for React to commit the refreshed aggregate and finish existing chart animations. */
export async function waitForOverviewPdfSnapshot(
  root: HTMLElement,
  version: string,
  changed: boolean
): Promise<void> {
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("Overview document is unavailable.");
  const started = Date.now();
  while (root.dataset.overviewPdfVersion !== version) {
    if (!root.isConnected || Date.now() - started > 3_000) {
      throw new Error("The refreshed Overview has not finished rendering.");
    }
    await new Promise<void>(resolve => view.setTimeout(resolve, 25));
  }
  await new Promise<void>(resolve =>
    view.setTimeout(resolve, changed ? 1_650 : 50)
  );
  if (!root.isConnected || root.dataset.overviewPdfVersion !== version) {
    throw new Error("The Overview changed during PDF preparation.");
  }
}
