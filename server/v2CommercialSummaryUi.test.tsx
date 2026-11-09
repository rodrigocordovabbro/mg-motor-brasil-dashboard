import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { V2Dashboard } from "../shared/v2Types";
import type { V2CommercialSummaryProps } from "../client/src/components/V2CommercialSummary";

const editorState = vi.hoisted(() => ({ props: null as any }));

vi.mock("../client/src/components/V2SalesGoalEditor", () => ({
  default: (props: any) => {
    editorState.props = props;
    return props.canManage ? (
      <button type="button" data-testid="mock-sales-goal-editor">
        Edit sales goal
      </button>
    ) : null;
  },
}));

import { V2CommercialSummary } from "../client/src/components/V2CommercialSummary";

type Performance = V2Dashboard["dealerPerformance"];

type RenderProps = Partial<
  Omit<V2CommercialSummaryProps, "performance" | "competence" | "onUpdated">
>;

function performanceFixture(overrides: Partial<Performance> = {}): Performance {
  const base: Performance = {
    available: true,
    sourceName: "DAILY_FUP.xlsx",
    updatedAt: "2026-11-09T12:00:00.000Z",
    generalRegistrationMTD: {
      value: 90,
      asOf: "2026-11-08",
      sourceSheet: "DAILY_FUP",
      label: "MTD Registration",
    },
    generalRetailMTD: {
      value: 84,
      asOf: "2026-11-09",
      sourceSheet: "DAILY_FUP",
      label: "Retail",
    },
    salesGoalOrigin: "manual",
    warnings: [],
    unmapped: [],
    rows: [],
    totals: {
      leads: 16600,
      leadGoal: 16600,
      sales: 84,
      salesGoal: 591,
      conversionRate: 84 / 16600,
    },
  };

  return {
    ...base,
    ...overrides,
    totals: { ...base.totals, ...(overrides.totals ?? {}) },
  };
}

function renderSummary(
  performance: Performance = performanceFixture(),
  props: RenderProps = {},
  onUpdated = vi.fn()
) {
  return renderToStaticMarkup(
    <V2CommercialSummary
      performance={performance}
      competence="2026-11"
      canManage={false}
      onUpdated={onUpdated}
      {...props}
    />
  );
}

function metricValue(html: string, testId: string): string {
  const escaped = testId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<[^>]+data-testid="${escaped}-value"[^>]*>([^<]*)</[^>]+>`)
  );
  if (!match) throw new Error(`Metric value not found: ${testId}`);
  return match[1];
}

describe("V2CommercialSummary", () => {
  it("renders the two ordered KPI blocks and keeps Registration/Retail source values distinct", () => {
    const html = renderSummary();
    const leadsBlock = html.indexOf(
      'data-testid="v2-commercial-summary-leads"'
    );
    const salesBlock = html.indexOf(
      'data-testid="v2-commercial-summary-sales"'
    );

    expect(leadsBlock).toBeGreaterThanOrEqual(0);
    expect(salesBlock).toBeGreaterThan(leadsBlock);
    expect(html).toContain("Leads");
    expect(html).toContain("Meta de Leads");
    expect(html).toContain("Leads entregues");
    expect(html).toContain("Vendas");
    expect(html).toContain("Meta de vendas");
    expect(html).toContain("Vendas totais (MTD Registration)");
    expect(html).toContain("Retail");
    expect(html).toContain("Sem Test Drive e Direct Sales");
    expect(html).toContain("8 de nov.");
    expect(html).toContain("9 de nov.");
    expect(metricValue(html, "v2-commercial-summary-registration")).toBe("90");
    expect(metricValue(html, "v2-commercial-summary-retail")).toBe("84");
    expect(metricValue(html, "v2-commercial-summary-sales-goal")).toBe("591");
    expect(metricValue(html, "v2-commercial-summary-lead-goal")).toBe("16.600");
    expect(metricValue(html, "v2-commercial-summary-conversion")).toContain(
      ",51%"
    );
  });

  it("renders real zero values while representing null and unavailable values as N/D", () => {
    const zero = performanceFixture({
      generalRegistrationMTD: {
        value: 0,
        asOf: "2026-11-08",
        sourceSheet: "DAILY_FUP",
        label: "MTD Registration",
      },
      generalRetailMTD: {
        value: 0,
        asOf: "2026-11-09",
        sourceSheet: "DAILY_FUP",
        label: "Retail",
      },
      totals: {
        leads: 0,
        leadGoal: 0,
        sales: 0,
        salesGoal: null,
        conversionRate: 0,
      },
    });
    const zeroHtml = renderSummary(zero);

    expect(metricValue(zeroHtml, "v2-commercial-summary-leads-delivered")).toBe(
      "0"
    );
    expect(metricValue(zeroHtml, "v2-commercial-summary-lead-goal")).toBe("0");
    expect(metricValue(zeroHtml, "v2-commercial-summary-registration")).toBe(
      "0"
    );
    expect(metricValue(zeroHtml, "v2-commercial-summary-retail")).toBe("0");
    expect(metricValue(zeroHtml, "v2-commercial-summary-conversion")).toContain(
      "0,00%"
    );
    expect(metricValue(zeroHtml, "v2-commercial-summary-sales-goal")).toBe(
      "N/D"
    );

    const unavailableHtml = renderSummary(
      performanceFixture({
        available: false,
        totals: {
          leads: 0,
          leadGoal: 0,
          sales: 0,
          salesGoal: 0,
          conversionRate: 0,
        },
      })
    );
    expect(
      metricValue(unavailableHtml, "v2-commercial-summary-leads-delivered")
    ).toBe("N/D");
    expect(
      metricValue(unavailableHtml, "v2-commercial-summary-registration")
    ).toBe("N/D");
    expect(metricValue(unavailableHtml, "v2-commercial-summary-retail")).toBe(
      "N/D"
    );
    expect(
      metricValue(unavailableHtml, "v2-commercial-summary-conversion")
    ).toBe("N/D");
  });

  it("hides global metadata and goals for a narrowed parent filter", () => {
    const html = renderSummary(performanceFixture(), {
      generalComparable: false,
    });

    expect(metricValue(html, "v2-commercial-summary-leads-delivered")).toBe(
      "16.600"
    );
    expect(metricValue(html, "v2-commercial-summary-lead-goal")).toBe("N/D");
    expect(metricValue(html, "v2-commercial-summary-sales-goal")).toBe("N/D");
    expect(metricValue(html, "v2-commercial-summary-registration")).toBe("N/D");
    expect(metricValue(html, "v2-commercial-summary-retail")).toBe("N/D");
    expect(metricValue(html, "v2-commercial-summary-conversion")).toBe("N/D");
    expect(html).toContain("Total global não comparável a este filtro");
    expect(html).not.toContain("MTD Registration ·");
    expect(html).not.toContain("Retail ·");
  });

  it("never falls back from a missing Retail source to Registration", () => {
    const html = renderSummary(
      performanceFixture({
        generalRetailMTD: null,
        totals: {
          leads: 16600,
          leadGoal: 16600,
          sales: null,
          salesGoal: 591,
          conversionRate: null,
        },
      })
    );

    expect(metricValue(html, "v2-commercial-summary-registration")).toBe("90");
    expect(metricValue(html, "v2-commercial-summary-retail")).toBe("N/D");
    expect(metricValue(html, "v2-commercial-summary-conversion")).toBe("N/D");
    expect(html).toContain("Retail ·");
  });

  it("supports English labels and UTC date-only references", () => {
    const html = renderSummary(performanceFixture(), { locale: "en" });

    expect(html).toContain("Commercial summary");
    expect(html).toContain("Lead goal");
    expect(html).toContain("Leads delivered");
    expect(html).toContain("Sales goal");
    expect(html).toContain("Total sales (MTD Registration)");
    expect(html).toContain("Excluding Test Drive and Direct Sales");
    expect(html).toContain("Nov 8, 2026");
    expect(html).toContain("Nov 9, 2026");
    expect(html).not.toContain("Meta de Leads");
    expect(metricValue(html, "v2-commercial-summary-lead-goal")).toBe("16,600");
  });

  it("keeps the sales-goal action and passes the permission/current goal contract", () => {
    const onUpdated = vi.fn();
    renderSummary(performanceFixture(), { canManage: false }, onUpdated);
    expect(editorState.props.canManage).toBe(false);

    const html = renderSummary(
      performanceFixture(),
      { canManage: true },
      onUpdated
    );
    expect(html).toContain('data-testid="mock-sales-goal-editor"');
    expect(editorState.props.canManage).toBe(true);
    expect(editorState.props.competence).toBe("2026-11");
    expect(editorState.props.currentGoal).toBe(591);
    expect(editorState.props.onSaved).toBe(onUpdated);

    editorState.props.onSaved();
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });
});
