import { describe, expect, it } from "vitest";
import type { CommercialStoredImport } from "./v2Commercial";
import { buildOfficialCommercialPerformance } from "./v2Commercial";
import type { CommercialSourceRow } from "../shared/v2Commercial";
import type { V2Dashboard, V2Filters } from "../shared/v2Types";

const filters: V2Filters = {
  dateFrom: "2026-11-01",
  dateTo: "2026-11-04",
};

function dashboardFixture(leads = 1353): V2Dashboard {
  return {
    status: "READY",
    source: {
      name: "LEADS MG",
      importedAt: "2026-11-05T00:00:00.000Z",
      mode: "authenticated-import",
      totalRows: leads,
      invalidDateRows: 0,
    },
    period: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      cutoffDate: filters.dateTo,
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    summary: {
      total: leads,
      models: 0,
      dealers: 1,
      states: 1,
      cities: 0,
      crmRate: null,
      crmDelivered: null,
      topModel: null,
      topState: null,
      peakHour: null,
    },
    pacing: {
      competence: "2026-11",
      goal: 16_600,
      current: leads,
      closedDays: 4,
      daysInMonth: 30,
      daysRemaining: 26,
      averagePerDay: leads / 4,
      requiredPerDay: (16_600 - leads) / 26,
      projection: (leads * 30) / 4,
      projectedDifference: (leads * 30) / 4 - 16_600,
      remainingToGoal: 16_600 - leads,
      progressPercent: (leads / 16_600) * 100,
      status: "BEHIND",
    },
    daily: [],
    channels: [],
    models: [],
    states: [],
    cities: [],
    dealers: [{ label: "Barigui Curitiba", count: leads }],
    hours: [],
    campaigns: [],
    versions: [],
    crm: [],
    recent: { rows: [], total: leads, page: 1, pageSize: 50 },
    dealerPerformance: {
      available: false,
      sourceName: null,
      updatedAt: null,
      rows: [
        {
          dealer: "Barigui Curitiba",
          state: "PR",
          leads,
          leadGoal: null,
          sales: null,
          salesGoal: null,
          conversionRate: null,
        },
      ],
      totals: {
        leads,
        leadGoal: null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
    },
    notes: [],
  };
}

function sourceSalesImport(
  registrationMtd = 43,
  retailMtd?: number | null
): CommercialStoredImport {
  const row: CommercialSourceRow = {
    key: "sales:barigui-curitiba",
    sourceLabel: "Barigui Curitiba",
    state: "PR",
    value: 0,
    rawDealers: ["Barigui Curitiba"],
  };
  return {
    id: 1,
    kind: "sales",
    competence: "2026-11",
    asOf: "2026-11-04",
    sourceWeek: 0,
    registrationMtd,
    registrationAsOf: "2026-11-05",
    sourceSheet: "DAILY_FUP",
    fileName: "FUP_2026-11-05.xlsx",
    fileSha256: "sales-fixture-sha",
    total: 0,
    rowCount: 1,
    rows: [row],
    warnings: [],
    importedAt: "2026-11-05T00:00:00.000Z",
    ...(retailMtd !== undefined
      ? { retailMtd, retailAsOf: "2026-11-08" }
      : {}),
  };
}

function latestSales(
  registrationMtd = 43,
  retailMtd?: number | null
): ReadonlyMap<CommercialStoredImport["kind"], CommercialStoredImport> {
  return new Map([["sales", sourceSalesImport(registrationMtd, retailMtd)]]);
}

describe("general MTD conversion", () => {
  it("uses general Retail for the global aggregate while keeping Registration separate and dealer sales weekly", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(),
      filters,
      latestSales(90, 84)
    );

    expect(result.totals.sales).toBe(84);
    expect(result.totals.conversionRate).toBeCloseTo(84 / 1353, 10);
    expect(result.generalRegistrationMTD).toEqual({
      value: 90,
      asOf: "2026-11-05",
      sourceSheet: "DAILY_FUP",
      label: "MTD Registration",
    });
    expect(result.generalRetailMTD).toEqual({
      value: 84,
      asOf: "2026-11-08",
      sourceSheet: "DAILY_FUP",
      label: "Retail",
    });
    expect(
      result.rows.find(row => row.dealer === "Barigui Curitiba")
    ).toMatchObject({ sales: 0, conversionRate: null });
  });

  it("keeps global Retail unavailable when the new Retail field is explicitly null", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(),
      filters,
      latestSales(90, null)
    );

    expect(result.generalRegistrationMTD?.value).toBe(90);
    expect(result.generalRetailMTD).toBeNull();
    expect(result.totals.sales).toBeNull();
    expect(result.totals.conversionRate).toBeNull();
  });

  it("keeps general MTD Registration as a reference without using it as global Retail when the Retail snapshot is absent", () => {
    const dashboard = dashboardFixture();
    const latest = latestSales();
    const beforeDashboard = JSON.parse(JSON.stringify(dashboard));
    const beforeLatest = JSON.parse(JSON.stringify([...latest.entries()]));

    const result = buildOfficialCommercialPerformance(
      dashboard,
      filters,
      latest
    );

    expect(result.totals.leads).toBe(1353);
    expect(result.totals.sales).toBeNull();
    expect(result.totals.conversionRate).toBeNull();
    expect(result.generalRegistrationMTD).toEqual({
      value: 43,
      asOf: "2026-11-05",
      sourceSheet: "DAILY_FUP",
      label: "MTD Registration",
    });

    const barigui = result.rows.find(row => row.dealer === "Barigui Curitiba");
    expect(barigui).toMatchObject({
      leads: 1353,
      sales: 0,
      conversionRate: null,
    });
    expect(result.rows.filter(row => row.sales !== null)).toEqual([
      expect.objectContaining({ dealer: "Barigui Curitiba", sales: 0 }),
    ]);
    expect(dashboard).toEqual(beforeDashboard);
    expect([...latest.entries()]).toEqual(beforeLatest);
  });

  it("keeps global sales unavailable when there are no leads and no Retail snapshot", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(0),
      filters,
      latestSales()
    );

    expect(result.totals.sales).toBeNull();
    expect(result.totals.leads).toBe(0);
    expect(result.totals.conversionRate).toBeNull();
    expect(
      result.rows.find(row => row.dealer === "Barigui Curitiba")
    ).toMatchObject({
      leads: 0,
      sales: 0,
      conversionRate: null,
    });
  });

  it("keeps a legitimate zero general Retail value and exposes a zero aggregate rate", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(),
      filters,
      latestSales(0, 0)
    );

    expect(result.totals.sales).toBe(0);
    expect(result.totals.conversionRate).toBe(0);
    expect(result.generalRegistrationMTD?.value).toBe(0);
    expect(result.generalRetailMTD?.value).toBe(0);
    expect(
      result.rows.find(row => row.dealer === "Barigui Curitiba")
    ).toMatchObject({
      sales: 0,
      conversionRate: null,
    });
  });

  it("does not expose the global MTD conversion for a model-filtered subset", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(),
      { ...filters, model: "MG4" },
      latestSales()
    );

    expect(result.totals.sales).toBeNull();
    expect(result.totals.conversionRate).toBeNull();
    expect(
      result.rows.find(row => row.dealer === "Barigui Curitiba")
    ).toMatchObject({
      sales: null,
      conversionRate: null,
    });
  });

  it("preserves a manual sales goal and keeps weekly dealer sales separate when Retail is unavailable", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(),
      filters,
      latestSales(),
      660
    );

    expect(result.totals.salesGoal).toBe(660);
    expect(result).toMatchObject({ salesGoalOrigin: "manual" });
    expect(result.totals.sales).toBeNull();
    expect(result.totals.conversionRate).toBeNull();
    expect(result.generalRegistrationMTD?.value).toBe(43);
    expect(
      result.rows.find(row => row.dealer === "Barigui Curitiba")
    ).toMatchObject({
      sales: 0,
      salesGoal: null,
    });
    expect(result.rows.filter(row => row.sales !== null)).toHaveLength(1);
  });
});
