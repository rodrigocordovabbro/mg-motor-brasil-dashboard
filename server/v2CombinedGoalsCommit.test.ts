import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn(async () => connection),
    execute: vi.fn(),
  };
  return { connection, pool, failSalesInsert: false };
});

vi.mock("./v2Db", () => ({ getV2Pool: () => mock.pool }));

import {
  commitCombinedGoalsUpload,
  previewCombinedGoalsUpload,
} from "./v2Commercial";

const MODEL_PATH =
  "/home/ubuntu/upload/pasted_file_sfMdrj_Planilhasemtítulo.xlsx";

async function modelBase64(): Promise<string> {
  return (await readFile(MODEL_PATH)).toString("base64");
}

function configureEmptyImportDatabase(): void {
  mock.connection.execute.mockImplementation(
    async (sql: string, args: unknown[] = []) => {
      if (sql.startsWith("SELECT DISTINCT BINARY dealer")) return [[], []];
      if (sql.startsWith("SELECT id,label,normalizedKey,state,sourceImportId"))
        return [[], []];
      if (sql.includes("WHERE i.kind=? AND i.competence=? AND i.fileSha256="))
        return [[], []];
      if (sql.startsWith("SELECT id FROM v2_commercial_imports"))
        return [[], []];
      if (sql.startsWith("INSERT INTO v2_commercial_imports")) {
        if (mock.failSalesInsert && args[0] === "sales-goals")
          throw new Error("sales source failed");
        return [{ insertId: args[0] === "lead-goals" ? 101 : 102 }, []];
      }
      if (sql.startsWith("SELECT goal,sourceKind,sourceImportId"))
        return [
          [{ goal: 16600, sourceKind: "manual", sourceImportId: null }],
          [],
        ];
      throw new Error(`Consulta não prevista no fixture: ${sql}`);
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.failSalesInsert = false;
  mock.connection.beginTransaction.mockResolvedValue(undefined);
  mock.connection.commit.mockResolvedValue(undefined);
  mock.connection.rollback.mockResolvedValue(undefined);
  mock.connection.release.mockReturnValue(undefined);
  configureEmptyImportDatabase();
  mock.pool.execute.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT DISTINCT BINARY dealer")) return [[], []];
    if (sql.startsWith("SELECT id,label,normalizedKey,state,sourceImportId"))
      return [[], []];
    throw new Error(`Consulta de pool não prevista no fixture: ${sql}`);
  });
});

describe("combined goals commit", () => {
  it("previews both values on one row and only suggests official mappings", async () => {
    const preview = await previewCombinedGoalsUpload({
      competence: "2026-11",
      fileName: "Planilhasemtítulo.xlsx",
      base64: await modelBase64(),
    });

    expect(preview).toMatchObject({
      competence: "2026-11",
      fileName: "Planilhasemtítulo.xlsx",
      leadTotal: 10579,
      salesTotal: 591,
    });
    expect(preview.rows[0]).toMatchObject({
      key: "Página1:2",
      sourceLabel: "SAVOL/SP",
      leadGoal: 394,
      salesGoal: 22,
      rawDealers: ["Savol São Caetano do Sul"],
    });
    expect(preview.availableDealers).toContain("Savol São Caetano do Sul");
    expect(mock.pool.execute).toHaveBeenCalledTimes(2);
    expect(mock.connection.beginTransaction).not.toHaveBeenCalled();
  });

  it("writes both existing source kinds in one transaction and preserves manual lead goal", async () => {
    const result = await commitCombinedGoalsUpload(
      {
        competence: "2026-11",
        fileName: "Planilhasemtítulo.xlsx",
        base64: await modelBase64(),
      },
      { id: 7, username: "fixture-admin", role: "admin" }
    );

    expect(result).toMatchObject({
      alreadyImported: false,
      lead: { importId: 101, total: 10579, rows: 31 },
      sales: { importId: 102, total: 591, rows: 31 },
    });
    expect(mock.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(mock.connection.commit).toHaveBeenCalledOnce();
    expect(mock.connection.rollback).not.toHaveBeenCalled();
    expect(mock.connection.release).toHaveBeenCalledOnce();

    const inserts = mock.connection.execute.mock.calls.filter(([sql]) =>
      String(sql).startsWith("INSERT INTO v2_commercial_imports")
    );
    expect(inserts).toHaveLength(2);
    expect(inserts.map(([, args]) => (args as unknown[])[0])).toEqual([
      "lead-goals",
      "sales-goals",
    ]);
    expect(
      mock.connection.execute.mock.calls.some(([sql]) =>
        String(sql).startsWith("INSERT INTO v2_lead_goals")
      )
    ).toBe(false);
  });

  it("rolls back both source writes when sales-goals fails", async () => {
    mock.failSalesInsert = true;

    await expect(
      commitCombinedGoalsUpload(
        {
          competence: "2026-11",
          fileName: "Planilhasemtítulo.xlsx",
          base64: await modelBase64(),
        },
        { id: 7, username: "fixture-admin", role: "admin" }
      )
    ).rejects.toThrow("sales source failed");

    expect(mock.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(mock.connection.commit).not.toHaveBeenCalled();
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
    expect(mock.connection.release).toHaveBeenCalledOnce();
  });
});
