import { describe, expect, it } from "vitest";
import type {
  HistoricalLeadPace,
  HistoricalLeadPaceScenario,
} from "../shared/historicalLeadPace";
import type { V2Dashboard } from "../shared/v2Types";
import { buildOverviewPdfReportModel } from "../client/src/lib/overviewPdfReport";

function scenario(
  key: "lastMonth" | "last3Months",
  projection: number | null,
  projectedDifference: number | null,
  gapToDate: number | null,
  gapPercent: number | null,
  status: HistoricalLeadPaceScenario["status"] = "READY"
): HistoricalLeadPaceScenario {
  return {
    key,
    label: key === "lastMonth" ? "Último mês" : "Média de 3 meses",
    status,
    referenceMonths:
      key === "lastMonth" ? ["2026-10"] : ["2026-08", "2026-09", "2026-10"],
    expectedShare: 0.5,
    expectedToDate: 180,
    gapToDate,
    gapPercent,
    projection,
    projectedDifference,
    paceStatus: "ON_TRACK",
    points: [],
    warnings: [],
  };
}

function historical(
  scope: "GLOBAL" | "FILTERED" = "GLOBAL"
): HistoricalLeadPace {
  return {
    competence: "2026-11",
    asOfDate: "2026-11-09",
    lastAvailableDate: "2026-11-09",
    daysInMonth: 30,
    current: 200,
    goal: scope === "GLOBAL" ? 5200 : null,
    scope,
    reference: [],
    lastMonth: scenario("lastMonth", 5100, -100, -20, -0.1),
    last3Months: scenario("last3Months", 5300, 100, 40, 0.2),
  };
}

function fixture(): V2Dashboard {
  return {
    status: "READY",
    checkedAt: "2026-11-10T15:30:00.000Z",
    source: {
      name: "authorized fixture",
      importedAt: "2026-11-10T15:00:00.000Z",
      mode: "authenticated-import",
      totalRows: 4793,
      invalidDateRows: 0,
      earliestLeadDate: "2026-11-01",
      latestLeadDate: "2026-11-09",
    },
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-09",
      cutoffDate: "2026-11-09",
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    summary: {
      total: 4793,
      models: 2,
      dealers: 2,
      states: 1,
      cities: 2,
      crmRate: null,
      crmDelivered: null,
      topModel: null,
      topState: null,
      peakHour: null,
    },
    pacing: {
      competence: "2026-11",
      goal: 5200,
      current: 200,
      closedDays: 9,
      daysInMonth: 30,
      daysRemaining: 21,
      averagePerDay: 22.2,
      requiredPerDay: 238,
      projection: 5100,
      projectedDifference: -100,
      remainingToGoal: 5000,
      progressPercent: 3.8,
      status: "BEHIND",
    },
    historicalPace: historical(),
    daily: [
      {
        date: "2026-11-01",
        total: 0,
        channels: {},
        cumulative: 0,
        sourceAvailable: true,
        pace: 0,
      },
      {
        date: "2026-11-02",
        total: 3,
        channels: { Meta: 3 },
        cumulative: 3,
        sourceAvailable: true,
        pace: 1,
      },
      {
        date: "2026-11-03",
        total: null,
        channels: {},
        cumulative: null,
        sourceAvailable: false,
        pace: null,
      },
    ],
    channels: [
      { label: "Meta", count: 3 },
      { label: "Site", count: 0 },
    ],
    models: [],
    states: [],
    cities: [],
    dealers: [],
    hours: [],
    campaigns: [],
    versions: [],
    crm: [],
    recent: { rows: [], total: 0, page: 1, pageSize: 20 },
    dealerPerformance: {
      available: false,
      sourceName: null,
      updatedAt: null,
      rows: [],
      totals: {
        leads: 200,
        leadGoal: 5200,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
      generalRegistrationMTD: null,
      generalRetailMTD: null,
    },
    notes: [],
  };
}

describe("Overview PDF report model", () => {
  it("uses the selected scenario, official totals, and dynamic source dates", () => {
    const first = fixture();
    const firstModel = buildOverviewPdfReportModel(first, "pt-BR", "lastMonth");

    expect(firstModel.leads.projection).toBe(5100);
    expect(firstModel.leads.projectedDifference).toBe(-100);
    expect(firstModel.leads.cumulativeDifference).toBe(-20);
    expect(firstModel.leads.realized).toBe(200);
    expect(firstModel.daily.periodTotal).toBe(4793);
    expect(firstModel.daily.activeChannelCount).toBe(1);
    expect(firstModel.daily.availableDayCount).toBe(2);
    expect(firstModel.source.lagging).toBe(false);

    const second = fixture();
    second.summary.total = 17;
    second.source.latestLeadDate = "2026-11-05";
    second.historicalPace!.current = 4;
    second.historicalPace!.last3Months.projection = 25;
    second.historicalPace!.last3Months.projectedDifference = 2;
    const secondModel = buildOverviewPdfReportModel(second, "en");

    expect(secondModel.daily.periodTotal).toBe(17);
    expect(secondModel.leads.realized).toBe(4);
    expect(secondModel.leads.projection).toBe(25);
    expect(secondModel.source.latestLeadDate).toBe("2026-11-05");
    expect(secondModel.source.lagging).toBe(true);
    expect(secondModel.leads.projection).not.toBe(firstModel.leads.projection);
  });

  it("preserves a valid filtered forecast without comparing it with the global target", () => {
    const data = fixture();
    data.historicalPace = historical("FILTERED");
    data.historicalPace.last3Months.projection = 9999;
    data.historicalPace.last3Months.projectedDifference = 9999;
    data.historicalPace.last3Months.gapToDate = 9999;

    const model = buildOverviewPdfReportModel(data, "en", "last3Months");

    expect(model.leads.goal).toBeNull();
    expect(model.leads.projection).toBe(9999);
    expect(model.leads.projectedDifference).toBeNull();
    expect(model.leads.cumulativeDifference).toBeNull();
    expect(model.leads.targetAttainmentPercent).toBeNull();
  });
  it("keeps the competence actuals aligned with the captured historical curve on a multi-month request", () => {
    const data = fixture();
    data.period.dateFrom = "2026-09-01";
    data.summary.total = 12345;
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.leads.realized).toBe(200);
    expect(model.leads.realizedScope).toBe("month");
    expect(model.leads.competence).toBe("2026-11");
    expect(model.daily.periodTotal).toBe(12345);
  });
  it("preserves authorized dealer sales in filtered scope and keeps missing general totals unavailable", () => {
    const data = fixture();
    data.historicalPace = historical("FILTERED");
    data.dealerPerformance.totals.salesGoal = 45;
    data.dealerPerformance.totals.conversionRate = 0.0345;
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.sales.goal).toBe(45);
    expect(model.sales.conversionRate).toBe(0.0345);
    expect(model.sales.retail).toBeNull();
    expect(model.sales.registration).toBeNull();
  });
  it("labels dealer rankings as Registration without changing the separate general totals", () => {
    const data = fixture();
    data.dealerPerformance.dealerSalesKind = "registration";
    data.dealerPerformance.generalRegistrationMTD = {
      value: 151,
      asOf: "2026-11-09",
      sourceSheet: "DAILY_FUP",
      label: "MTD Registration",
    };
    data.dealerPerformance.generalRetailMTD = {
      value: 144,
      asOf: "2026-11-09",
      sourceSheet: "DAILY_FUP",
      label: "Retail",
    };
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.sales.dealerSalesKind).toBe("registration");
    expect(model.sales.registration).toBe(151);
    expect(model.sales.retail).toBe(144);
  });
  it("never invents a forecast when the historical scenario is unavailable", () => {
    const data = fixture();
    data.historicalPace!.last3Months.status = "NO_HISTORY";
    data.historicalPace!.last3Months.projection = null;
    expect(buildOverviewPdfReportModel(data, "en").leads.projection).toBeNull();
  });
  it("preserves a returned SOURCE_LAG estimate and marks the source as lagging", () => {
    const data = fixture();
    data.source.latestLeadDate = "2026-11-08";
    data.historicalPace!.last3Months.status = "SOURCE_LAG";
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.leads.projection).toBe(5300);
    expect(model.source.lagging).toBe(true);
  });
  it("counts channels from the authorized daily graph when the overview client has no distribution summary", () => {
    const data = fixture();
    data.channels = [];
    data.daily[1].channels = { Meta: 2, Site: 1 };
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.daily.activeChannelCount).toBe(2);
    expect(model.daily.channels.map(item => item.key)).toEqual([
      "Meta",
      "Site",
    ]);
  });
  it("does not present missing coverage as zero realized or zero active channels", () => {
    const data = fixture();
    data.historicalPace!.lastAvailableDate = null;
    data.historicalPace!.current = 0;
    data.daily = [
      {
        date: "2026-11-03",
        total: null,
        channels: {},
        cumulative: null,
        sourceAvailable: false,
        pace: null,
      },
    ];
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.leads.realized).toBeNull();
    expect(model.daily.periodTotal).toBeNull();
    expect(model.daily.activeChannelCount).toBeNull();
    expect(model.leads.targetAttainmentPercent).toBeNull();
  });
  it("preserves a real zero period total when source coverage is confirmed", () => {
    const data = fixture();
    data.summary.total = 0;
    data.daily = [
      {
        date: "2026-11-01",
        total: 0,
        channels: {},
        cumulative: 0,
        sourceAvailable: true,
        pace: 0,
      },
    ];
    data.channels = [];
    const model = buildOverviewPdfReportModel(data, "en");
    expect(model.daily.periodTotal).toBe(0);
    expect(model.daily.activeChannelCount).toBe(0);
  });
});
