import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveManualOk } from "../shared/v2Dispatch";
const mock = vi.hoisted(() => ({
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  getConnection: vi.fn(),
}));
vi.mock("./v2Db", () => ({
  getV2Pool: () => ({
    getConnection: mock.getConnection,
    execute: mock.execute,
    query: mock.execute,
  }),
}));
import {
  assertDispatchVersion,
  setDispatchManual,
  getDispatchReport,
  listDispatchReports,
} from "./v2Dispatch";
import { appRouter } from "./routers";
const actor = { id: 7, username: "operator-test-only" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.getConnection.mockResolvedValue(mock);
});
describe("manual source and version", () => {
  it("preserves imported OK without inventing a reviewer", () => {
    expect(effectiveManualOk({ sourceManual: "OK", validation: null })).toBe(
      true
    );
    expect(effectiveManualOk({ sourceManual: "", validation: null })).toBe(
      false
    );
  });
  it("permits clearing an imported OK without editing its source", () => {
    expect(
      effectiveManualOk({
        sourceManual: "OK",
        validation: {
          isOk: false,
          version: 1,
          reviewerLabel: "Wini",
          updatedBy: "test",
          updatedAt: "2026-11-05T12:00:00Z",
        },
      })
    ).toBe(false);
  });
  it("rejects stale versions", () => {
    expect(() => assertDispatchVersion(2, 1)).toThrow("Outra pessoa");
    expect(() => assertDispatchVersion(0, 0)).not.toThrow();
  });
});
describe("manual transaction", () => {
  it("locks source cell, writes only check/audit and commits correct identity", async () => {
    mock.execute
      .mockResolvedValueOnce([[{ id: 3 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([
        [{ updatedAt: new Date("2026-11-05T12:00:00Z") }],
        [],
      ]);
    const saved = await setDispatchManual(3, true, 0, actor);
    expect(saved).toEqual({
      isOk: true,
      version: 1,
      reviewerLabel: "Wini",
      updatedBy: actor.username,
      updatedAt: "2026-11-05T12:00:00.000Z",
    });
    expect(mock.execute.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(mock.execute.mock.calls[2][1]).toEqual([
      3,
      true,
      1,
      "Wini",
      actor.id,
    ]);
    expect(mock.execute.mock.calls[3][1]).toEqual([
      3,
      null,
      true,
      "Wini",
      actor.id,
      1,
    ]);
    expect(
      mock.execute.mock.calls.some(([sql]) =>
        /UPDATE v2_dispatch_(cells|rows|reports)/.test(sql)
      )
    ).toBe(false);
    expect(mock.commit).toHaveBeenCalledOnce();
    expect(mock.rollback).not.toHaveBeenCalled();
    expect(mock.release).toHaveBeenCalledOnce();
  });
  it("supports removing and reconfirming with next version", async () => {
    mock.execute
      .mockResolvedValueOnce([[{ id: 3 }], []])
      .mockResolvedValueOnce([[{ isOk: 1, version: 2 }], []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([
        [{ updatedAt: new Date("2026-11-05T12:00:00Z") }],
        [],
      ]);
    const saved = await setDispatchManual(3, false, 2, actor);
    expect(saved.isOk).toBe(false);
    expect(saved.version).toBe(3);
    expect(mock.execute.mock.calls[3][1]).toEqual([
      3,
      true,
      false,
      "Wini",
      actor.id,
      3,
    ]);
  });
  it("rolls back a stale write without overwriting a colleague", async () => {
    mock.execute
      .mockResolvedValueOnce([[{ id: 3 }], []])
      .mockResolvedValueOnce([[{ isOk: 1, version: 1 }], []]);
    await expect(setDispatchManual(3, false, 0, actor)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mock.execute).toHaveBeenCalledTimes(2);
    expect(mock.rollback).toHaveBeenCalledOnce();
    expect(mock.release).toHaveBeenCalledOnce();
    expect(mock.commit).not.toHaveBeenCalled();
  });
  it("rejects nonexistent cells", async () => {
    mock.execute.mockResolvedValueOnce([[], []]);
    await expect(setDispatchManual(99, true, 0, actor)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mock.rollback).toHaveBeenCalledOnce();
  });
  it("rolls back when the audit write fails", async () => {
    mock.execute
      .mockResolvedValueOnce([[{ id: 3 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{}, []])
      .mockRejectedValueOnce(new Error("test failure"));
    await expect(setDispatchManual(3, true, 0, actor)).rejects.toThrow(
      "test failure"
    );
    expect(mock.rollback).toHaveBeenCalledOnce();
    expect(mock.commit).not.toHaveBeenCalled();
  });
});
describe("protected source reading", () => {
  it("preserves original strings, dates, zero volumes and ignores instructions", async () => {
    mock.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            title: "Envios teste",
            fileName: "test-only.xlsx",
            dateFrom: "2026-11-01",
            dateTo: "2026-11-05",
            generatedLabel: "05/11/2026",
            importedAt: new Date("2026-11-05T12:00:00Z"),
            metadata: JSON.stringify({
              days: [{ date: "2026-11-05", label: "05/nov", sourceTotal: 0 }],
              information: [{ label: "ignored", value: "ignored" }],
            }),
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            rowNumber: 5,
            storeName: "Loja  teste (EM BREVE)",
            crmResponsible: "Responsible test",
            syonetIntegration: "NÃO",
            bbroIntegration: "",
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 2,
            rowId: 1,
            rowNumber: 5,
            dispatchDate: "2026-11-05",
            syonet: "NÃO",
            sourceManual: "OK",
            volume: 0,
            version: null,
          },
        ],
        [],
      ]);
    const report = await getDispatchReport(1);
    expect(report.rows[0].storeName).toBe("Loja  teste (EM BREVE)");
    expect(report.rows[0].cells[0].date).toBe("2026-11-05");
    expect(report.rows[0].cells[0].volume).toBe(0);
    expect(report.rows[0].cells[0].validation).toBeNull();
    expect(report.information).toEqual([]);
    expect(report.totals.declaredInInstructions).toBeNull();
    expect(report.totals.sourceManualOk).toBe(1);
    expect(report.totals.auditedOk).toBe(0);
  });
  it("rejects unknown reports without fake empty data", async () => {
    mock.execute.mockResolvedValueOnce([[], []]);
    await expect(getDispatchReport(99)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("returns empty report list when no source imported", async () => {
    mock.execute.mockResolvedValueOnce([[], []]);
    expect(await listDispatchReports()).toEqual([]);
  });
  it("requires authentication for reading and manual writes", async () => {
    const caller = appRouter.createCaller({
      req: { headers: {} } as any,
      res: { setHeader: vi.fn() } as any,
      user: null,
    });
    await expect(caller.dispatch.reports()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.dispatch.setManual({ cellId: 1, isOk: true, expectedVersion: 0 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mock.getConnection).not.toHaveBeenCalled();
  });
});
