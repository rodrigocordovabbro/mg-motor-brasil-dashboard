import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const mock = vi.hoisted(() => {
  const state: {
    report: Record<string, unknown>;
    imports: Record<string, unknown>[];
    rows: Record<string, unknown>[];
    sql: string[];
    params: unknown[][];
    failOn: string | null;
  } = {
    report: {
      id: 1,
      fileSha256: "old-source-hash",
      metadata: {
        days: [
          {
            date: "2026-11-01",
            label: "01/nov",
            sourceTotal: 10,
            computedTotal: 10,
          },
          {
            date: "2026-11-02",
            label: "02/nov",
            sourceTotal: 20,
            computedTotal: 20,
          },
          {
            date: "2026-11-03",
            label: "03/nov",
            sourceTotal: 30,
            computedTotal: 30,
          },
          {
            date: "2026-11-04",
            label: "04/nov",
            sourceTotal: 40,
            computedTotal: 40,
          },
          {
            date: "2026-11-05",
            label: "05/nov",
            sourceTotal: 50,
            computedTotal: 50,
          },
        ],
      },
    },
    imports: [],
    rows: [{ id: 101, rowNumber: 5, storeName: "Loja A" }],
    sql: [],
    params: [],
    failOn: null,
  };
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(),
  };
  const getConnection = vi.fn(() => Promise.resolve(connection));
  return { state, connection, getConnection };
});

vi.mock("./v2Db", () => ({
  getV2Pool: () => ({ getConnection: mock.getConnection }),
}));

import {
  importDispatchWorkbook,
  parseDispatchWorkbook,
} from "./v2DispatchXlsx";

async function fixtureBase64(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Envios");
  worksheet.getCell("A1").value =
    "Registros de envios · 01/11/2026 a 05/11/2026 · gerado em 05/11/2026";
  const headers = [
    "NOME DA LOJA",
    "Responsável por CRM",
    "Integração Syonet",
    "Integração API BBRO",
  ];
  headers.forEach(
    (value, index) => (worksheet.getCell(4, index + 1).value = value)
  );
  const days = [
    ["01/nov", 10],
    ["02/nov", 20],
    ["03/nov", 30],
    ["04/nov", 40],
    ["05/nov", 50],
  ];
  days.forEach(([label, total], dayIndex) => {
    const start = 6 + dayIndex * 4;
    worksheet.getCell(3, start).value = label;
    ["SYONET", "Manual", "Vol. Lead"].forEach((value, offset) => {
      worksheet.getCell(4, start + offset).value = value;
    });
    worksheet.getCell(5, start).value = "OK";
    worksheet.getCell(5, start + 1).value = dayIndex === 0 ? " OK " : "";
    worksheet.getCell(5, start + 2).value = total;
    worksheet.getCell(6, start).value = "NÃO";
    worksheet.getCell(6, start + 1).value = "";
    worksheet.getCell(6, start + 2).value = 0;
  });
  worksheet.getRow(5).values = ["Loja A", "Responsável A", "OK", "OK"];
  worksheet.getRow(6).values = ["Loja B", "Responsável B", "NÃO", ""];
  days.forEach(([, total], dayIndex) => {
    const start = 6 + dayIndex * 4;
    worksheet.getCell(5, start).value = "OK";
    worksheet.getCell(5, start + 1).value = dayIndex === 0 ? " OK " : "";
    worksheet.getCell(5, start + 2).value = total;
    worksheet.getCell(6, start).value = "NÃO";
    worksheet.getCell(6, start + 1).value = "";
    worksheet.getCell(6, start + 2).value = 0;
  });
  worksheet.getCell(7, 1).value = "TOTAL";
  days.forEach(([, total], dayIndex) => {
    worksheet.getCell(7, 8 + dayIndex * 4).value = total;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.report = {
    id: 1,
    fileSha256: "old-source-hash",
    metadata: {
      days: [
        {
          date: "2026-11-01",
          label: "01/nov",
          sourceTotal: 10,
          computedTotal: 10,
        },
        {
          date: "2026-11-02",
          label: "02/nov",
          sourceTotal: 20,
          computedTotal: 20,
        },
        {
          date: "2026-11-03",
          label: "03/nov",
          sourceTotal: 30,
          computedTotal: 30,
        },
        {
          date: "2026-11-04",
          label: "04/nov",
          sourceTotal: 40,
          computedTotal: 40,
        },
        {
          date: "2026-11-05",
          label: "05/nov",
          sourceTotal: 50,
          computedTotal: 50,
        },
      ],
    },
  };
  mock.state.imports = [];
  mock.state.rows = [{ id: 101, rowNumber: 5, storeName: "Loja A" }];
  mock.state.sql = [];
  mock.state.params = [];
  mock.state.failOn = null;
  mock.getConnection.mockResolvedValue(mock.connection);
  mock.connection.execute.mockImplementation(
    async (sql: string, params: unknown[]) => {
      mock.state.sql.push(sql);
      mock.state.params.push(params);
      if (mock.state.failOn && sql.includes(mock.state.failOn))
        throw new Error("db test failure");
      if (sql.includes("SELECT id,fileSha256,metadata"))
        return [[mock.state.report], []];
      if (sql.includes("FROM v2_dispatch_imports"))
        return [mock.state.imports, []];
      if (sql.includes("SELECT id,rowNumber,storeName"))
        return [mock.state.rows, []];
      if (sql.includes("INSERT INTO v2_dispatch_rows"))
        return [{ insertId: 102 }, []];
      return [{}, []];
    }
  );
});

describe("parseDispatchWorkbook", () => {
  it("lê somente Envios, preserva strings e reconcilia os totais da fonte", async () => {
    const parsed = await parseDispatchWorkbook(
      "envios.xlsx",
      await fixtureBase64()
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].storeName).toBe("Loja A");
    expect(parsed.rows[0].cells[0].sourceManual).toBe(" OK ");
    expect(parsed.days.map(day => day.sourceTotal)).toEqual([
      10, 20, 30, 40, 50,
    ]);
    expect(parsed.days.map(day => day.computedTotal)).toEqual([
      10, 20, 30, 40, 50,
    ]);
    expect(parsed.warnings).toEqual([]);
  });
});

describe("importDispatchWorkbook", () => {
  const actor = { id: 7, username: "operator-test-only" };
  const now = new Date("2026-11-05T12:00:00.000Z"); // cutoff 2026-11-04 em São Paulo

  it("atualiza a fonte até D-1, preserva o futuro e nunca escreve checks", async () => {
    const result = await importDispatchWorkbook(
      1,
      "envios.xlsx",
      await fixtureBase64(),
      actor,
      now
    );
    expect(result).toMatchObject({
      reportId: 1,
      rowsUpdated: 2,
      daysImported: 4,
      addedDays: 0,
      skippedFutureDays: 1,
      checksPreserved: true,
    });
    const sourceUpserts = mock.state.sql.filter(sql =>
      sql.includes("ON DUPLICATE KEY UPDATE syonet")
    );
    expect(sourceUpserts).toHaveLength(8);
    const sourceUpsertParams = mock.state.params.filter((params, index) =>
      mock.state.sql[index].includes("ON DUPLICATE KEY UPDATE syonet")
    );
    expect(
      sourceUpsertParams.some(params => params.includes("2026-11-05"))
    ).toBe(false);
    expect(mock.state.sql.some(sql => sql.includes("v2_dispatch_checks"))).toBe(
      false
    );
    expect(mock.connection.commit).toHaveBeenCalledOnce();
    expect(mock.connection.rollback).not.toHaveBeenCalled();
  });

  it("retorna noop quando o hash já tem auditoria, sem reler/escrever células", async () => {
    mock.state.imports = [
      {
        id: 1,
        reportId: 1,
        metadata: {
          days: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
        },
      },
    ];
    const result = await importDispatchWorkbook(
      1,
      "envios.xlsx",
      await fixtureBase64(),
      actor,
      now
    );
    expect(result.alreadyImported).toBe(true);
    expect(
      mock.state.sql.some(sql => sql.includes("ON DUPLICATE KEY UPDATE"))
    ).toBe(false);
    expect(mock.connection.commit).toHaveBeenCalledOnce();
  });

  it("preenche só o dia antes futuro quando o mesmo arquivo volta a ser enviado após virar D-1", async () => {
    mock.state.imports = [
      {
        id: 1,
        reportId: 1,
        metadata: {
          days: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
          applications: [
            { actorId: 7, at: "2026-11-05T12:00:00Z", days: ["2026-11-04"] },
          ],
        },
      },
    ];
    const result = await importDispatchWorkbook(
      1,
      "envios.xlsx",
      await fixtureBase64(),
      actor,
      new Date("2026-11-06T12:00:00Z")
    );
    expect(result.daysImported).toBe(1);
    expect(result.alreadyImported).not.toBe(true);
    const sourceParams = mock.state.params.filter((params, index) =>
      mock.state.sql[index].includes("ON DUPLICATE KEY UPDATE syonet")
    );
    expect(sourceParams).toHaveLength(2);
    expect(sourceParams.every(params => params.includes("2026-11-05"))).toBe(
      true
    );
    expect(mock.state.sql.some(sql => sql.includes("v2_dispatch_checks"))).toBe(
      false
    );
    const metadataParam = mock.state.params.find((params, index) =>
      mock.state.sql[index].startsWith("UPDATE v2_dispatch_imports")
    );
    const metadata = JSON.parse(String(metadataParam?.[0]));
    expect(metadata.days).toHaveLength(5);
    expect(metadata.applications).toHaveLength(2);
    expect(metadata.applications[1].actorId).toBe(actor.id);
  });
  it("faz rollback quando uma escrita de fonte falha, sem teste contra banco real", async () => {
    mock.state.failOn = "UPDATE v2_dispatch_reports";
    await expect(
      importDispatchWorkbook(
        1,
        "envios.xlsx",
        await fixtureBase64(),
        actor,
        now
      )
    ).rejects.toThrow("db test failure");
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
    expect(mock.connection.commit).not.toHaveBeenCalled();
    expect(mock.connection.release).toHaveBeenCalledOnce();
  });
});
