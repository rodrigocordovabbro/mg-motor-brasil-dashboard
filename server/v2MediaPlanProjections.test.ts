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
  assertV2MediaPlanProjectionOwner,
  readMediaPlanProjections,
  updateMediaPlanProjections,
} from "./v2MediaPlanProjections";
import { getMediaPlan } from "./mediaPlans";
import {
  applyMediaPlanProjectionOverrides,
  type MediaPlanProjectionValues,
} from "../shared/v2MediaPlanProjections";

const owner = { id: 7, username: "rodrigo", role: "admin" as const };
const otherAdmin = { id: 8, username: "ana", role: "admin" as const };
const client = { id: 9, username: "rodrigo", role: "client" as const };

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

describe("owner-only media forecast projections", () => {
  it("fails closed for every non-owner before opening a connection", async () => {
    expect(() => assertV2MediaPlanProjectionOwner(owner)).not.toThrow();
    expect(() => assertV2MediaPlanProjectionOwner(otherAdmin)).toThrow(
      "Rodrigo"
    );
    expect(() => assertV2MediaPlanProjectionOwner(client)).toThrow("Rodrigo");
    await expect(
      updateMediaPlanProjections(
        { monthId: "2026-10", expectedVersion: 0, values: { globalLeads: 0 } },
        otherAdmin
      )
    ).rejects.toThrow("Rodrigo");
    expect(mock.getConnection).not.toHaveBeenCalled();
    expect(mock.poolExecute).not.toHaveBeenCalled();
  });

  it("reads a missing month override as version zero and empty sparse values", async () => {
    await expect(readMediaPlanProjections(" 2026-10 ")).resolves.toEqual({
      monthId: "2026-10",
      version: 0,
      values: { products: {}, rows: {} },
    });
    expect(mock.poolExecute).toHaveBeenCalledTimes(2);
  });

  it("accepts zero, preserves the expected version and audits numeric old/new JSON", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([[{ version: 0 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValue([{}, []]);

    await expect(
      updateMediaPlanProjections(
        {
          monthId: "2026-10",
          expectedVersion: 0,
          values: {
            globalLeads: 0,
            products: { "Line-up": 8844 },
            rows: { "oct-lineup-google": 0 },
          },
        },
        owner
      )
    ).resolves.toMatchObject({
      success: true,
      monthId: "2026-10",
      version: 1,
      values: {
        globalLeads: 0,
        products: { "Line-up": 8844 },
        rows: { "oct-lineup-google": 0 },
      },
    });
    expect(mock.connection.execute).toHaveBeenCalledWith(
      expect.stringContaining("v2_media_plan_projection_audit"),
      [
        "2026-10",
        1,
        "rodrigo",
        owner.id,
        JSON.stringify({ products: {}, rows: {} }),
        JSON.stringify({
          globalLeads: 0,
          products: { "Line-up": 8844 },
          rows: { "oct-lineup-google": 0 },
        }),
      ]
    );
    expect(mock.connection.commit).toHaveBeenCalledOnce();
  });

  it("rejects stale versions and never writes source plans", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([[{ version: 3 }], []]);
    await expect(
      updateMediaPlanProjections(
        {
          monthId: "2026-10",
          expectedVersion: 2,
          values: { globalLeads: 9000 },
        },
        owner
      )
    ).rejects.toThrow("Outra pessoa");
    expect(mock.connection.execute).toHaveBeenCalledTimes(2);
    expect(mock.connection.commit).not.toHaveBeenCalled();
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
  });

  it("accepts only existing projected row keys and products", async () => {
    await expect(
      updateMediaPlanProjections(
        {
          monthId: "2026-10",
          expectedVersion: 0,
          values: { products: { Unknown: 1 } },
        },
        owner
      )
    ).rejects.toThrow("produto");
    await expect(
      updateMediaPlanProjections(
        {
          monthId: "2026-10",
          expectedVersion: 0,
          values: { rows: { "oct-im6-forbes": 1 } },
        },
        owner
      )
    ).rejects.toThrow("não possui Leads");
    expect(mock.getConnection).not.toHaveBeenCalled();
  });
});

describe("forecast calculation", () => {
  it("preserves every approved monthly forecast and CPL when overrides are empty", () => {
    for (const month of ["2026-10", "2026-09", "2026-08", "2026-07"]) {
      const source = getMediaPlan(month);
      if (!source) throw new Error(`fixture missing: ${month}`);
      const result = applyMediaPlanProjectionOverrides(source, {
        version: 0,
        values: { products: {}, rows: {} },
      });
      expect(result.total.leads).toBe(source.total.leads);
      expect(result.total.cpl).toBe(source.total.cpl);
    }
  });

  it("recomputes row/product/global CPLs without changing source budget or actual investment", () => {
    const source = getMediaPlan("2026-10");
    if (!source) throw new Error("fixture missing");
    const before = JSON.parse(JSON.stringify(source));
    const values: MediaPlanProjectionValues = {
      products: {},
      rows: { "oct-lineup-google": 0, "oct-lineup-meta": 6000 },
    };
    const result = applyMediaPlanProjectionOverrides(source, {
      version: 2,
      values,
    });
    const google = result.rows.find(row => row.id === "oct-lineup-google");
    const lineup = result.totals.find(total => total.product === "Line-up");
    expect(google?.leads).toBe(0);
    expect(google?.cpl).toBeNull();
    expect(lineup?.leads).toBe(7_431);
    expect(lineup?.cpl).toBeCloseTo(720_000 / 7_431, 8);
    expect(result.total.leads).toBe(9_510);
    expect(result.total.cpl).toBeCloseTo(969_600 / 9_510, 8);
    expect(result.total.netInvestment).toBe(source.total.netInvestment);
    expect(result.total.actualInvestment).toBe(source.total.actualInvestment);
    expect(source).toEqual(before);
  });

  it("lets a product total win over its row values and keeps row forecasts unchanged", () => {
    const source = getMediaPlan("2026-10");
    if (!source) throw new Error("fixture missing");
    const result = applyMediaPlanProjectionOverrides(source, {
      version: 1,
      values: {
        products: { "Line-up": 10_000 },
        rows: { "oct-lineup-google": 1 },
      },
    });
    expect(
      result.totals.find(total => total.product === "Line-up")?.leads
    ).toBe(10_000);
    expect(result.rows.find(row => row.id === "oct-lineup-google")?.leads).toBe(
      1
    );
    expect(result.total.leads).toBe(12_079);
  });

  it("keeps the detail intact for a manual global total and marks the UI hint", () => {
    const source = getMediaPlan("2026-10");
    if (!source) throw new Error("fixture missing");
    const result = applyMediaPlanProjectionOverrides(source, {
      version: 5,
      values: { globalLeads: 10_600, products: {}, rows: {} },
    });
    expect(result.total.leads).toBe(10_600);
    expect(result.total.cpl).toBeCloseTo(969_600 / 10_600, 8);
    expect(result.totals.map(total => total.leads)).toEqual([8844, 2079]);
    expect(result.projectionOverrides?.hint).toBe(
      "Total manual; projeções detalhadas mantidas"
    );
  });

  it("does not fabricate a product split when approved product leads are unavailable", () => {
    const source = getMediaPlan("2026-08");
    if (!source) throw new Error("fixture missing");
    const result = applyMediaPlanProjectionOverrides(source, {
      version: 0,
      values: { products: {}, rows: {} },
    });
    expect(result.total.leads).toBe(source.total.leads);
    expect(result.totals.every(total => total.leads == null)).toBe(true);
  });
});

it("locks version zero before reading a first media projection", async () => {
  await updateMediaPlanProjections(
    { monthId: "2026-10", expectedVersion: 0, values: { globalLeads: 12000 } },
    owner
  );
  expect(mock.connection.execute.mock.calls[0][0]).toContain(
    "VALUES (?,0,?) ON DUPLICATE KEY UPDATE monthId"
  );
  expect(mock.connection.execute.mock.calls[1][0]).toContain("SELECT version");
});
