import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildOverviewDealerRankings } from "../shared/overviewDealerRankings";
import { V2OverviewDealerRankings } from "../client/src/components/V2OverviewDealerRankings";
import type { V2Dashboard } from "../shared/v2Types";

function fixture(): V2Dashboard {
  return {
    dealerPerformance: {
      available: true,
      rows: [
        {
          dealer: "Sinal Av. Europa",
          leads: 50,
          sales: 5,
          conversionRate: 0.1,
        },
        {
          dealer: "Iguauto Fortaleza",
          leads: 100,
          sales: 3,
          conversionRate: 0.03,
        },
        { dealer: "Barigui Curitiba", leads: 30, sales: 0, conversionRate: 0 },
        {
          dealer: "DRSUL Porto Alegre",
          leads: 30,
          sales: null,
          conversionRate: null,
        },
        {
          dealer: "Autobel Campo Grande (EM BREVE)",
          leads: 10,
          sales: 9,
          conversionRate: 0.9,
        },
        {
          dealer: "Unknown private source",
          leads: 10,
          sales: 10,
          conversionRate: 1,
        },
        { dealer: "Tecar Goiânia", leads: 0, sales: 5, conversionRate: null },
      ],
      groupedGoals: [
        {
          kind: "sales",
          sourceLabel: "BALTIC",
          dealers: ["Baltic Alphaville", "Baltic Guarulhos - Shopping Maia"],
          leads: 50,
          value: 40,
        },
      ],
      totals: { leads: 100, sales: 10 },
    },
  } as unknown as V2Dashboard;
}

describe("Overview dealer rankings", () => {
  it("sorts unit ratios, keeps true zero sales and never rates absent or collective sales", () => {
    const data = fixture();
    const original = JSON.stringify(data);
    const result = buildOverviewDealerRankings(data);
    expect(result.eligibleCount).toBe(3);
    expect(result.top.map(row => row.dealer)).toEqual([
      "Sinal Av. Europa",
      "Iguauto Fortaleza",
      "Barigui Curitiba",
    ]);
    expect(result.bottom.map(row => row.dealer)).toEqual([
      "Barigui Curitiba",
      "Iguauto Fortaleza",
      "Sinal Av. Europa",
    ]);
    expect(result.bottom[0].sales).toBe(0);
    expect(JSON.stringify(data)).toBe(original);
  });
  it("returns no ranking without a comparable source or with null ratios from incompatible filters", () => {
    const data = fixture();
    data.dealerPerformance.available = false;
    expect(buildOverviewDealerRankings(data).eligibleCount).toBe(0);
    data.dealerPerformance.available = true;
    data.dealerPerformance.rows.forEach(row => {
      row.conversionRate = null;
    });
    expect(buildOverviewDealerRankings(data).top).toEqual([]);
  });
  it("ranks registered extra dealers with deterministic ties and caps each list at 10", () => {
    const data = fixture();
    data.dealerRegistry = Array.from({ length: 24 }, (_, i) => ({
      name: `Registered ${String(i).padStart(2, "0")}`,
      state: "SP",
    }));
    data.dealerPerformance.rows = data.dealerRegistry.map(row => ({
      dealer: row.name,
      state: "SP",
      leads: 100,
      sales: 2,
      conversionRate: 0.02,
      leadGoal: null,
      salesGoal: null,
    }));
    const result = buildOverviewDealerRankings(data);
    expect(result.top).toHaveLength(10);
    expect(result.bottom).toHaveLength(10);
    expect(result.eligibleCount).toBe(24);
    expect(result.top[0].dealer).toBe("Registered 00");
  });
  it("prints English Top and Bottom labels, actual values and no personal/unknown source data", () => {
    const html = renderToStaticMarkup(
      <V2OverviewDealerRankings data={fixture()} locale="en" />
    );
    expect(html).toContain("Top 10 — Conversion");
    expect(html).toContain("Bottom 10 — Conversion");
    expect(html).toContain("10.00%");
    expect(html).toContain("0.00%");
    expect(html).toContain("data-overview-pdf-only");
    expect(html).toContain("display:none");
    expect(html).not.toContain("Unknown private source");
    expect(html).not.toContain("EM BREVE");
  });
  it("labels dealer ratios as Registration when the active dealer snapshot is REG", () => {
    const data = fixture();
    data.dealerPerformance.dealerSalesKind = "registration";
    const html = renderToStaticMarkup(
      <V2OverviewDealerRankings data={data} locale="en" />
    );
    expect(html).toContain(
      "Dealer conversion — Top 10 &amp; Bottom 10 · Registration"
    );
    expect(html).toContain("5 Registration");
    expect(html).not.toContain("5 Retail");
  });
  it("shows absence instead of filling a leaderboard with fake zeroes", () => {
    const data = fixture();
    data.dealerPerformance.available = false;
    const html = renderToStaticMarkup(
      <V2OverviewDealerRankings data={data} locale="pt-BR" />
    );
    expect(html).toContain("N/D");
    expect(html).not.toContain("Sinal Av. Europa");
  });
});
