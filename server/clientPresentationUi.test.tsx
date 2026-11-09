import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegionalModelDistribution } from "../shared/regionalTypes";
import type { V2Dashboard } from "../shared/v2Types";

const state = vi.hoisted(() => ({
  dashboard: null as V2Dashboard | null,
}));

vi.mock("@shared/dashboardDates", () => ({
  getDashboardCutoffDate: () => "2026-11-04",
  capDateAtDashboardCutoff: (value: string) => value,
  resolveDashboardPeriod: (dateFrom: string, dateTo: string) => ({
    dateFrom,
    dateTo,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      leads: {
        dashboard: { invalidate: vi.fn() },
        goal: { invalidate: vi.fn() },
        salesGoal: { invalidate: vi.fn() },
      },
      dispatch: { leadControl: { invalidate: vi.fn() } },
      commercial: { status: { invalidate: vi.fn() } },
    }),
    auth: {
      me: { useQuery: () => ({ data: null, isLoading: false, error: null }) },
    },
    leads: {
      dashboard: {
        useQuery: () => ({
          data: state.dashboard,
          isLoading: false,
          isFetching: false,
          refetch: vi.fn(),
        }),
      },
      syncBase: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      goal: {
        useQuery: () => ({
          data: null,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      updateGoal: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      salesGoal: {
        useQuery: () => ({
          data: null,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      updateSalesGoal: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    commercial: {
      status: {
        useQuery: () => ({
          data: { files: [] },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      preview: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      commit: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      remove: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
}));

// Presentation tests do not exercise upload/editor behavior; keep those writes out of the SSR fixture.
vi.mock("../client/src/components/V2CommercialUploads", () => ({
  default: () => null,
}));
vi.mock("../client/src/components/V2MonthlyGoalEditor", () => ({
  default: () => null,
}));
vi.mock("../client/src/components/V2SalesGoalEditor", () => ({
  default: () => null,
}));

import V2RegionalModelMatrix from "../client/src/components/newcomponentV2RegionalModelMatrix";
import V2LeadsDashboard from "../client/src/components/V2LeadsDashboard";

const regionalModels: RegionalModelDistribution = {
  models: ["MG 4", "MG Urban"],
  regions: [
    { label: "Norte", total: 1234, counts: { "MG 4": 900, "MG Urban": 334 } },
  ],
  states: [
    { label: "Pará", total: 1234, counts: { "MG 4": 900, "MG Urban": 334 } },
  ],
  total: 1234,
  unidentifiedStateCount: 0,
  unidentifiedModelCount: 0,
};

function dashboardFixture(): V2Dashboard {
  return {
    status: "READY",
    checkedAt: "2026-11-05T15:00:00.000Z",
    source: {
      name: "Canonical Leads source",
      importedAt: "2026-11-05T12:00:00.000Z",
      mode: "authenticated-import",
      totalRows: 1234,
      invalidDateRows: 0,
      earliestLeadDate: "2026-11-01",
      latestLeadDate: "2026-11-04",
    },
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      cutoffDate: "2026-11-04",
    },
    options: {
      models: ["MG 4", "MG Urban"],
      channels: ["Meta"],
      campaigns: ["Canonical campaign"],
      dealers: ["Sinal Av. Europa"],
    },
    summary: {
      total: 1234,
      models: 2,
      dealers: 1,
      states: 1,
      cities: 1,
      crmRate: 0.5,
      crmDelivered: 617,
      topModel: { label: "MG 4", count: 900 },
      topState: { label: "Pará", count: 1234 },
      peakHour: { label: "10", count: 400 },
    },
    pacing: {
      competence: "2026-11",
      goal: 1600,
      current: 1234,
      closedDays: 4,
      daysInMonth: 30,
      daysRemaining: 26,
      averagePerDay: 308.5,
      requiredPerDay: 14.1,
      projection: 9255,
      projectedDifference: 7655,
      remainingToGoal: 366,
      progressPercent: 77.125,
      status: "AHEAD",
    },
    daily: [
      {
        date: "2026-11-04",
        total: 1234,
        channels: { Meta: 1234 },
        cumulative: 1234,
        sourceAvailable: true,
        pace: 200,
      },
    ],
    channels: [{ label: "Meta", count: 1234 }],
    models: [
      { label: "MG 4", count: 900 },
      { label: "MG Urban", count: 334 },
    ],
    states: [{ label: "Pará", count: 1234 }],
    regionalModels,
    cities: [{ label: "Belém", count: 1234 }],
    dealers: [{ label: "MG São Paulo", count: 1234 }],
    hours: [{ label: "10", count: 400 }],
    campaigns: [{ label: "Canonical campaign", count: 1234 }],
    versions: [],
    crm: [{ label: "Syonet", count: 617 }],
    recent: { rows: [], total: 1234, page: 1, pageSize: 20 },
    dealerPerformance: {
      available: true,
      sourceName: "DAILY_FUP.xlsx",
      updatedAt: "2026-11-05T12:00:00.000Z",
      generalRegistrationMTD: {
        value: 90,
        asOf: "2026-11-04",
        sourceSheet: "DAILY_FUP",
        label: "MTD Registration",
      },
      generalRetailMTD: {
        value: 84,
        asOf: "2026-11-04",
        sourceSheet: "DAILY_FUP",
        label: "Retail",
      },
      salesGoalOrigin: "manual",
      warnings: [],
      unmapped: [],
      rows: [
        {
          dealer: "Sinal Av. Europa",
          state: "SP",
          leads: 1234,
          leadGoal: 1600,
          sales: 84,
          salesGoal: 100,
          conversionRate: 84 / 1234,
        },
      ],
      totals: {
        leads: 1234,
        leadGoal: 1600,
        sales: 84,
        salesGoal: 100,
        conversionRate: 84 / 1234,
      },
    },
    notes: [],
  };
}

type DashboardProps = Partial<Parameters<typeof V2LeadsDashboard>[0]>;

function renderDashboard(props: DashboardProps = {}) {
  state.dashboard = dashboardFixture();
  const clientOnly = props.overviewOnly === true;
  vi.stubGlobal("window", {
    location: {
      href: clientOnly
        ? "https://mgmotors.test/?module=leads&tab=stores"
        : "https://mgmotors.test/?module=leads",
      search: clientOnly ? "?module=leads&tab=stores" : "?module=leads",
    },
    history: { replaceState: vi.fn() },
    requestAnimationFrame: vi.fn(),
    scrollY: 0,
    scrollTo: vi.fn(),
  });
  return renderToStaticMarkup(
    <V2LeadsDashboard
      authenticated
      clientMode={false}
      canManage={false}
      clientView={false}
      overviewOnly={false}
      locale="pt-BR"
      {...props}
    />
  );
}

function metricValue(html: string, testId: string) {
  const escaped = testId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<[^>]+data-testid="${escaped}-value"[^>]*>([^<]*)</[^>]+>`)
  );
  if (!match) throw new Error(`Metric value not found: ${testId}`);
  return match[1];
}

beforeEach(() => {
  vi.stubGlobal("window", {
    location: {
      href: "https://mgmotors.test/?module=leads&tab=stores",
      search: "?module=leads&tab=stores",
    },
    history: { replaceState: vi.fn() },
    requestAnimationFrame: vi.fn(),
    scrollY: 0,
    scrollTo: vi.fn(),
  });
});

describe("client presentation UI", () => {
  it("keeps client presentation to one English Overview tab and preserves both commercial source values", () => {
    const html = renderDashboard({
      clientView: true,
      overviewOnly: true,
      locale: "en",
    });

    expect((html.match(/role="tab"/g) || []).length).toBe(1);
    expect(html).toContain(">Overview</button>");
    expect(html).not.toContain("Stores &amp; CRM");
    expect(html).not.toContain("Regions");
    expect(html).not.toContain("Leads</button>");
    expect(html).toContain('data-testid="v2-commercial-summary"');
    expect(metricValue(html, "v2-commercial-summary-registration")).toBe("90");
    expect(metricValue(html, "v2-commercial-summary-retail")).toBe("84");
    expect(html).not.toContain('data-testid="admin-model-delivery"');
    expect(html).not.toContain("Channel distribution");
    expect(html).toContain("Sales and goals by dealer");
    expect(html).toContain("Dealer / source");
    expect(html).toContain("Lead goal · unit");
    expect(html).toContain("Sales goal · unit");
    expect(html).toContain("Conversion");
    expect(html).toContain("Sinal Av. Europa");
    expect(html).toContain(">1,600<");
    expect(html).toContain(">84<");
    expect(html).toContain(">100<");
    expect(html).toContain(">6.8%<");
    expect(html).not.toContain("Update source");
    expect(html).not.toContain("Update goals");
    expect(html).not.toContain("Upload");
    expect(html).toContain("<table");
  });

  it("localizes the dashboard filter shell in English without translating source field values", () => {
    const html = renderDashboard({
      clientView: true,
      overviewOnly: true,
      locale: "en",
    });

    expect(html).toContain("Lead filters");
    expect(html).toContain("Start date");
    expect(html).toContain("End date");
    expect(html).not.toContain("Filtros de leads");
    expect(html).not.toContain("Data inicial");
    expect(html).not.toContain("Data final");
  });

  it.each([
    {
      name: "administrator operational view",
      props: {
        canManage: true,
        clientView: false,
        overviewOnly: false,
        locale: "pt-BR" as const,
      },
      visible: true,
    },
    {
      name: "administrator presentation view",
      props: {
        canManage: true,
        clientView: true,
        overviewOnly: false,
        locale: "en" as const,
      },
      visible: false,
    },
    {
      name: "BBRO view",
      props: {
        canManage: false,
        clientView: false,
        overviewOnly: false,
        locale: "pt-BR" as const,
      },
      visible: false,
    },
  ])(
    "$name exposes the model delivery card only to the operational administrator",
    ({ props, visible }) => {
      const html = renderDashboard(props);
      expect(html.includes('data-testid="admin-model-delivery"')).toBe(visible);
    }
  );
});

describe("regional model matrix presentation", () => {
  it("localizes structural labels while preserving Brazilian region names and model IDs", () => {
    const html = renderToStaticMarkup(
      <V2RegionalModelMatrix data={regionalModels} locale="en" />
    );

    expect(html).toContain("Regional view");
    expect(html).toContain("Leads by model and region");
    expect(html).toContain("By region");
    expect(html).toContain("By state");
    expect(html).toContain("Region");
    expect(html).toContain("Returned total");
    expect(html).toContain("Source total: 1,234");
    expect(html).toContain("Norte");
    expect(html).toContain("MG 4");
    expect(html).toContain("MG Urban");
    expect(html).not.toContain("Leitura Regional");
    expect(html).not.toContain("Leads por modelo e região");
    expect(html).not.toContain("Por região");
    expect(html).not.toContain("Por estado");
  });

  it("keeps the Portuguese default when locale is omitted", () => {
    const html = renderToStaticMarkup(
      <V2RegionalModelMatrix data={regionalModels} />
    );

    expect(html).toContain("Leitura Regional");
    expect(html).toContain("Leads por modelo e região");
    expect(html).toContain("Total da fonte: 1.234");
    expect(html).not.toContain("Regional view");
  });
});
