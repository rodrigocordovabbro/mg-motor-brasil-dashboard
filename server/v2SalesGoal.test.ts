import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(),
  };
  return {
    poolExecute: vi.fn(),
    getConnection: vi.fn(() => Promise.resolve(connection)),
    connection,
  };
});

vi.mock("./v2Db", () => ({
  getV2Pool: () => ({
    execute: mock.poolExecute,
    getConnection: mock.getConnection,
  }),
}));

import {
  assertV2SalesGoalOwner,
  getV2SalesTotalGoal,
  saveV2SalesTotalGoal,
} from "./v2SalesGoal";
import {
  buildOfficialCommercialPerformance,
  type CommercialStoredImport,
} from "./v2Commercial";
import type { V2Dashboard } from "../shared/v2Types";

const owner = { id: 7, username: "rodrigo", role: "admin" as const };
const otherAdmin = { id: 8, username: "ana", role: "admin" as const };
const client = { id: 9, username: "rodrigo", role: "client" as const };

function dashboardFixture(): V2Dashboard {
  return {
    status: "READY",
    source: {
      name: "LEADS MG",
      importedAt: "2026-11-05T00:00:00.000Z",
      mode: "authenticated-import",
      totalRows: 20,
      invalidDateRows: 0,
    },
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      cutoffDate: "2026-11-04",
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    summary: {
      total: 20,
      models: 0,
      dealers: 2,
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
      goal: null,
      current: 20,
      closedDays: 4,
      daysInMonth: 30,
      daysRemaining: 26,
      averagePerDay: 5,
      requiredPerDay: null,
      projection: 150,
      projectedDifference: null,
      remainingToGoal: null,
      progressPercent: null,
      status: "NO_GOAL",
    },
    daily: [],
    channels: [],
    models: [],
    states: [],
    cities: [],
    dealers: [
      { label: "Dealer A", count: 12 },
      { label: "Dealer B", count: 8 },
    ],
    hours: [],
    campaigns: [],
    versions: [],
    crm: [],
    recent: { rows: [], total: 0, page: 1, pageSize: 50 },
    dealerPerformance: {
      available: false,
      sourceName: null,
      updatedAt: null,
      rows: [
        {
          dealer: "Dealer A",
          state: "SP",
          leads: 12,
          leadGoal: null,
          sales: null,
          salesGoal: null,
          conversionRate: null,
        },
        {
          dealer: "Dealer B",
          state: "SP",
          leads: 8,
          leadGoal: null,
          sales: null,
          salesGoal: null,
          conversionRate: null,
        },
      ],
      totals: {
        leads: 20,
        leadGoal: null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
    },
    notes: [],
  };
}

function salesGoalImport(): CommercialStoredImport {
  return {
    id: 1,
    kind: "sales-goals",
    competence: "2026-11",
    asOf: null,
    sourceWeek: null,
    fileName: "metavendas.xlsx",
    fileSha256: "sales-goal-file",
    total: 722,
    rowCount: 1,
    rows: [
      {
        key: "group-1",
        sourceLabel: "Grupo A/B",
        state: null,
        value: 722,
        rawDealers: ["Dealer A", "Dealer B"],
      },
    ],
    warnings: [],
    importedAt: "2026-11-05T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.getConnection.mockResolvedValue(mock.connection);
  mock.connection.beginTransaction.mockResolvedValue(undefined);
  mock.connection.commit.mockResolvedValue(undefined);
  mock.connection.rollback.mockResolvedValue(undefined);
  mock.connection.release.mockReturnValue(undefined);
  mock.poolExecute.mockResolvedValue([[], []]);
  mock.connection.execute.mockResolvedValue([[], []]);
});

describe("manual monthly total sales goals", () => {
  it("allows only the named admin owner and fails closed before touching the database", async () => {
    expect(() => assertV2SalesGoalOwner(owner)).not.toThrow();
    expect(() => assertV2SalesGoalOwner(otherAdmin)).toThrow("Rodrigo");
    expect(() => assertV2SalesGoalOwner(client)).toThrow("Rodrigo");

    await expect(
      saveV2SalesTotalGoal({ competence: "2026-11", goal: 0 }, otherAdmin)
    ).rejects.toThrow("Rodrigo");
    await expect(
      saveV2SalesTotalGoal({ competence: "2026-11", goal: 0 }, client)
    ).rejects.toThrow("Rodrigo");
    expect(mock.getConnection).not.toHaveBeenCalled();
    expect(mock.poolExecute).not.toHaveBeenCalled();
  });

  it("trims and validates the monthly key, including the legitimate zero value", async () => {
    await expect(
      saveV2SalesTotalGoal({ competence: " 2026-11 ", goal: 0 }, owner)
    ).resolves.toEqual({ success: true });
    expect(mock.connection.execute).toHaveBeenNthCalledWith(
      2,
      "SELECT goal FROM v2_sales_total_goals WHERE competence=? FOR UPDATE",
      ["2026-11"]
    );
    expect(mock.connection.execute.mock.calls[2][1]).toEqual([
      "2026-11",
      0,
      owner.id,
    ]);
    await expect(
      saveV2SalesTotalGoal({ competence: "2026-13", goal: 1 }, owner)
    ).rejects.toThrow("AAAA-MM");
    await expect(
      saveV2SalesTotalGoal({ competence: "2026-11", goal: 10_000_001 }, owner)
    ).rejects.toThrow("0 e 10.000.000");
  });

  it("reads a missing override as null and never imports a fallback into the new table", async () => {
    await expect(getV2SalesTotalGoal("2026-11")).resolves.toBeNull();
    expect(mock.poolExecute).toHaveBeenCalledWith(
      "SELECT goal FROM v2_sales_total_goals WHERE competence=? LIMIT 1",
      ["2026-11"]
    );
  });

  it("overwrites the monthly row and audits old/new values without touching source rows", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([[{ goal: 722 }], []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []]);

    await expect(
      saveV2SalesTotalGoal({ competence: "2026-11", goal: 800 }, owner)
    ).resolves.toEqual({ success: true });
    expect(mock.connection.execute).toHaveBeenNthCalledWith(
      3,
      "INSERT INTO v2_sales_total_goals (competence,goal,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE goal=VALUES(goal),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
      ["2026-11", 800, owner.id]
    );
    expect(mock.connection.execute).toHaveBeenNthCalledWith(
      4,
      "INSERT INTO v2_sales_total_goal_audit (competence,oldGoal,newGoal,accountId) VALUES (?,?,?,?)",
      ["2026-11", 722, 800, owner.id]
    );
    expect(
      mock.connection.execute.mock.calls.every(
        ([sql]) => !String(sql).includes("v2_commercial_imports")
      )
    ).toBe(true);
    expect(mock.connection.commit).toHaveBeenCalledOnce();
    expect(mock.connection.rollback).not.toHaveBeenCalled();
  });

  it("keeps different competence keys independent and rolls back failures", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([[{ goal: 0 }], []]);
    await expect(
      saveV2SalesTotalGoal({ competence: "2026-12", goal: 4_000 }, owner)
    ).resolves.toEqual({ success: true });
    expect(mock.connection.execute.mock.calls[0][1]).toEqual(["2026-12"]);

    const failure = new Error("fake database failure");
    mock.connection.execute.mockReset();
    mock.connection.execute.mockRejectedValueOnce(failure);
    await expect(
      saveV2SalesTotalGoal({ competence: "2027-01", goal: 1 }, owner)
    ).rejects.toBe(failure);
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
    expect(mock.connection.release).toHaveBeenCalledTimes(2);
  });

  it("overrides only the global total, preserves source rows/group targets, and keeps zero valid", () => {
    const dashboard = dashboardFixture();
    const latest = new Map([["sales-goals" as const, salesGoalImport()]]);
    const beforeRows = JSON.parse(
      JSON.stringify(dashboard.dealerPerformance.rows)
    );
    const beforeSource = JSON.parse(JSON.stringify(salesGoalImport()));

    const result = buildOfficialCommercialPerformance(
      dashboard,
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      latest,
      0
    );

    expect(result.available).toBe(true);
    expect(result.totals.salesGoal).toBe(0);
    expect(result.salesGoalOrigin).toBe("manual");
    expect(result.groupedGoals?.[0]).toMatchObject({
      value: 722,
      dealers: ["Dealer A", "Dealer B"],
    });
    expect(result.rows.every(row => row.salesGoal === null)).toBe(true);
    expect(dashboard.dealerPerformance.rows).toEqual(beforeRows);
    expect(salesGoalImport()).toEqual(beforeSource);

    const filtered = buildOfficialCommercialPerformance(
      dashboard,
      {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-04",
        model: "SUV",
      },
      latest,
      900
    );
    expect(filtered.totals.salesGoal).toBeNull();
    expect(filtered.salesGoalOrigin).toBe("unavailable");
  });

  it("shows a manual total even when no commercial import exists without inventing sales", () => {
    const result = buildOfficialCommercialPerformance(
      dashboardFixture(),
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      new Map(),
      0
    );
    expect(result.available).toBe(true);
    expect(result.sourceName).toBeNull();
    expect(result.totals.salesGoal).toBe(0);
    expect(result.totals.sales).toBeNull();
  });
});

it("locks the competence key before reading an absent sales goal", async () => {
  await saveV2SalesTotalGoal({ competence: "2026-11", goal: 900 }, owner);
  expect(mock.connection.execute.mock.calls[0][0]).toContain(
    "INSERT INTO v2_sales_total_goal_locks"
  );
  expect(mock.connection.execute.mock.calls[0][0]).toContain(
    "ON DUPLICATE KEY UPDATE"
  );
  expect(mock.connection.execute.mock.calls[1][0]).toContain("SELECT goal");
  expect(mock.connection.execute.mock.calls[3][1]).toEqual([
    "2026-11",
    null,
    900,
    owner.id,
  ]);
});
