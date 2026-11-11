import type { V2Dashboard, V2Filters } from "./v2Types";

export type DealerSalesKind = "registration" | "retail";

/** A monthly total/goal cannot be compared against a lead period starting mid-month. */
export function isMonthToDateCommercialPeriod(
  period: Pick<V2Filters, "dateFrom" | "dateTo">
): boolean {
  const competence = period.dateTo.slice(0, 7);
  return (
    period.dateFrom === `${competence}-01` && period.dateFrom <= period.dateTo
  );
}

/** Use the server identity, then the preserved weekly source for old snapshots. Never rename an unknown metric. */
export function getDealerSalesKind(
  performance: V2Dashboard["dealerPerformance"]
): DealerSalesKind | null {
  const declared = performance.dealerSalesKind;
  if (declared === "registration" || declared === "retail") return declared;
  const weekly = [
    ...(performance.rows ?? []).flatMap(row => row.weeklySales ?? []),
    ...(performance.groupedGoals ?? []).flatMap(source =>
      source.weeklySales ? [source.weeklySales] : []
    ),
  ];
  if (weekly.some(source => source.sourceSheet === "WEEKLY_REG"))
    return "registration";
  if (weekly.some(source => source.sourceSheet === "WEEKLY_RET"))
    return "retail";
  return null;
}
