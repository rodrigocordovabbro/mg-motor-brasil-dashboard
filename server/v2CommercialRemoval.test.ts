import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./v2Db", () => ({ getV2Pool: vi.fn() }));

import { readCommercialStatus, removeCommercialSource } from "./v2Commercial";
import { getV2Pool } from "./v2Db";

function storedRow(
  kind: "lead-goals" | "sales-goals" | "sales",
  id: number,
  removedAt: string | null = null
) {
  return {
    id,
    kind,
    competence: "2026-11",
    asOf: kind === "sales" ? "2026-11-04" : null,
    sourceWeek: kind === "sales" ? 1 : null,
    fileName: `${kind}.xlsx`,
    fileSha256: `${kind}-${id}`,
    total: 16600,
    rowCount: 1,
    rowsJson: "[]",
    warningsJson: "[]",
    importedAt: "2026-11-05T12:00:00.000Z",
    removedAt,
  };
}

describe("commercial source removal", () => {
  afterEach(() => {
    vi.mocked(getV2Pool).mockReset();
  });

  it("reports the current id and hides a removed latest row without falling back to history", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([
        [
          storedRow("lead-goals", 12, "2026-11-05T13:00:00.000Z"),
          storedRow("lead-goals", 11),
          storedRow("sales", 20),
        ],
        [],
      ]);
    vi.mocked(getV2Pool).mockReturnValue({ execute } as never);

    const status = await readCommercialStatus("2026-11");
    expect(status.files).toEqual([
      expect.objectContaining({
        kind: "lead-goals",
        id: null,
        configured: false,
      }),
      expect.objectContaining({
        kind: "sales-goals",
        id: null,
        configured: false,
      }),
      expect.objectContaining({ kind: "sales", id: 20, configured: true }),
    ]);
  });

  it("soft-removes only the expected current version and appends an audit event", async () => {
    const beginTransaction = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn().mockResolvedValue(undefined);
    const rollback = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn();
    const execute = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT i.id,s.removedAt"))
        return [[{ id: 44, removedAt: null }], []];
      return [[], []];
    });
    const connection = { beginTransaction, commit, rollback, release, execute };
    vi.mocked(getV2Pool).mockReturnValue({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      removeCommercialSource(
        { kind: "lead-goals", competence: "2026-11", expectedImportId: 44 },
        { id: 7, username: "admin", role: "admin" }
      )
    ).resolves.toEqual({ success: true, removed: true });
    expect(
      execute.mock.calls.some(call =>
        String(call[0]).includes("v2_commercial_import_state")
      )
    ).toBe(true);
    expect(
      execute.mock.calls.some(call =>
        String(call[0]).includes("v2_commercial_import_audit")
      )
    ).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects a stale expected id without mutating lifecycle state", async () => {
    const beginTransaction = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT i.id,s.removedAt"))
        return [[{ id: 45, removedAt: null }], []];
      return [[], []];
    });
    const connection = {
      beginTransaction,
      commit,
      rollback: vi.fn(),
      release: vi.fn(),
      execute,
    };
    vi.mocked(getV2Pool).mockReturnValue({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      removeCommercialSource(
        { kind: "sales", competence: "2026-11", expectedImportId: 44 },
        { id: 7, username: "admin", role: "admin" }
      )
    ).resolves.toEqual({ success: false, removed: false });
    expect(commit).toHaveBeenCalledOnce();
    expect(
      execute.mock.calls.filter(call =>
        String(call[0]).includes("INSERT INTO v2_commercial_import_")
      ).length
    ).toBe(0);
  });

  it("enforces the administrator role at the service boundary", async () => {
    const getConnection = vi.fn();
    vi.mocked(getV2Pool).mockReturnValue({ getConnection } as never);

    await expect(
      removeCommercialSource(
        { kind: "sales", competence: "2026-11", expectedImportId: 44 },
        { id: 7, username: "client", role: "client" }
      )
    ).rejects.toThrow("Apenas administradores");
    expect(getConnection).not.toHaveBeenCalled();
  });
});
