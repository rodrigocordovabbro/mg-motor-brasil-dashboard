import { showDealerInCommercialTable } from "./dealerPresentation";
import { officialDealer, normalizeDealerKey } from "./dealerRegistry";
import type { V2Dashboard } from "./v2Types";

export type OverviewDealerRanking = {
  dealer: string;
  leads: number;
  sales: number;
  conversionRate: number;
};

/** Read-only ordering of comparable unit ratios already returned by the authenticated dashboard. */
export function buildOverviewDealerRankings(
  data: Pick<V2Dashboard, "dealerPerformance" | "dealerRegistry">
) {
  const registered = new Set(
    (data.dealerRegistry ?? []).map(row => normalizeDealerKey(row.name))
  );
  const eligible: OverviewDealerRanking[] = data.dealerPerformance.available
    ? data.dealerPerformance.rows
        .filter(
          row =>
            showDealerInCommercialTable(row.dealer) &&
            (officialDealer(row.dealer) ||
              registered.has(normalizeDealerKey(row.dealer)))
        )
        .filter(
          row =>
            Number.isFinite(row.leads) &&
            row.leads > 0 &&
            row.sales != null &&
            Number.isFinite(row.sales) &&
            row.sales >= 0 &&
            row.conversionRate != null &&
            Number.isFinite(row.conversionRate) &&
            row.conversionRate >= 0
        )
        .map(row => ({
          dealer: row.dealer,
          leads: row.leads,
          sales: row.sales!,
          conversionRate: row.conversionRate!,
        }))
    : [];
  const tie = (a: OverviewDealerRanking, b: OverviewDealerRanking) =>
    a.dealer.localeCompare(b.dealer, "pt-BR");
  return {
    eligibleCount: eligible.length,
    top: [...eligible]
      .sort((a, b) => b.conversionRate - a.conversionRate || tie(a, b))
      .slice(0, 10),
    bottom: [...eligible]
      .sort((a, b) => a.conversionRate - b.conversionRate || tie(a, b))
      .slice(0, 10),
  };
}
