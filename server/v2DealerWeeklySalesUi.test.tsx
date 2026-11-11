import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import V2DealerWeeklySales from "../client/src/components/V2DealerWeeklySales";
import type { V2Dashboard } from "../shared/v2Types";

const performance: V2Dashboard["dealerPerformance"] = {
  available: true,
  sourceName: "fixture",
  updatedAt: null,
  totals: {
    leads: 20,
    leadGoal: null,
    sales: 2,
    salesGoal: null,
    conversionRate: 0.1,
  },
  rows: [
    {
      dealer: "Dealer oficial",
      state: "SP",
      leads: 20,
      leadGoal: null,
      sales: 2,
      salesGoal: null,
      conversionRate: 0.1,
      leadsPerSale: 10,
      weeklySales: [
        {
          sourceLabel: "DEALER ORIGINAL",
          sourceSheet: "WEEKLY_RET",
          values: [1, 2, null, null, null, null],
        },
      ],
    },
  ],
};
describe("weekly Retail presentation", () => {
  it("renders English labels, original dealer names, W4 as monthly reference and N/A for missing weeks", () => {
    const html = renderToStaticMarkup(
      <V2DealerWeeklySales performance={performance} locale="en" />
    );
    expect(html).toContain("Weekly Retail by dealer");
    expect(html).toContain("W4 — Month");
    expect(html).toContain("Leads per sale");
    expect(html).toContain("DEALER ORIGINAL");
    expect(html).toContain("N/A");
    expect(html).not.toContain("Conversão");
  });
  it("renders Registration labels for a WEEKLY_REG snapshot and preserves the source label", () => {
    const registration = {
      ...performance,
      dealerSalesKind: "registration" as const,
      rows: performance.rows.map(row => ({
        ...row,
        weeklySales: row.weeklySales?.map(weekly => ({
          ...weekly,
          sourceSheet: "WEEKLY_REG" as const,
        })),
      })),
    };
    const html = renderToStaticMarkup(
      <V2DealerWeeklySales performance={registration} locale="en" />
    );
    expect(html).toContain("Weekly Registration by dealer");
    expect(html).toContain('aria-label="Weekly Registration by dealer"');
    expect(html).toContain("DEALER ORIGINAL");
    expect(html).not.toContain("Weekly Retail by dealer");
  });
  it("does not allocate collective Retail among linked dealer units", () => {
    const grouped = {
      ...performance,
      rows: [],
      groupedGoals: [
        {
          kind: "sales" as const,
          key: "group",
          sourceLabel: "GRUPO ORIGINAL",
          dealers: ["Loja A", "Loja B"],
          value: 2,
          leads: 20,
          weeklySales: {
            sourceLabel: "GRUPO ORIGINAL",
            sourceSheet: "WEEKLY_RET" as const,
            values: [1, 2, null, null, null, null],
          },
        },
      ],
    };
    const html = renderToStaticMarkup(
      <V2DealerWeeklySales performance={grouped} locale="en" />
    );
    expect(html).toContain("collective, no allocation");
    expect(html).toContain("Loja A / Loja B");
    expect(html).toContain("10%");
  });
  it("does not show invented weekly data for a legacy snapshot", () => {
    expect(
      renderToStaticMarkup(
        <V2DealerWeeklySales performance={{ ...performance, rows: [] }} />
      )
    ).toBe("");
  });
});
