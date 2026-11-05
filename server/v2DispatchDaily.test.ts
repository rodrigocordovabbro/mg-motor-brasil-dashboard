import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const state: {
    metadata: Record<string, unknown>;
    rows: { id: number }[];
    inserts: unknown[][];
    sql: string[];
  } = {
    metadata: { days: [] },
    rows: [{ id: 10 }, { id: 11 }],
    inserts: [],
    sql: [],
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

import { prepareDispatchDay } from "./v2DispatchDaily";

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.metadata = { days: [] };
  mock.state.rows = [{ id: 10 }, { id: 11 }];
  mock.state.inserts = [];
  mock.state.sql = [];
  mock.connection.execute.mockImplementation(
    async (sql: string, params: unknown[]) => {
      mock.state.sql.push(sql);
      if (sql.includes("SELECT id,metadata")) {
        return [[{ id: 1, metadata: JSON.stringify(mock.state.metadata) }], []];
      }
      if (sql.includes("SELECT id FROM v2_dispatch_rows"))
        return [mock.state.rows, []];
      if (sql.includes("INSERT IGNORE INTO v2_dispatch_cells")) {
        mock.state.inserts.push(params);
        return [{}, []];
      }
      if (sql.includes("UPDATE v2_dispatch_reports")) {
        mock.state.metadata = JSON.parse(String(params[0]));
        return [{}, []];
      }
      throw new Error(`SQL não esperado no teste: ${sql}`);
    }
  );
  mock.getConnection.mockResolvedValue(mock.connection);
});

describe("prepareDispatchDay", () => {
  const now = new Date("2026-11-05T12:00:00.000Z"); // D-1 em São Paulo = 04/11/2026

  it("faz catch-up de todos os dias ausentes até D-1 e cria um placeholder por loja", async () => {
    mock.state.metadata = {
      days: [
        {
          date: "2026-11-01",
          label: "01/nov",
          sourceTotal: 548,
          computedTotal: 548,
        },
      ],
    };

    await expect(prepareDispatchDay(1, now)).resolves.toEqual({
      date: "2026-11-04",
      added: true,
      missingSource: true,
    });
    const days = mock.state.metadata.days as {
      date: string;
      pending?: boolean;
    }[];
    expect(days.map(day => day.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(days.slice(1).every(day => day.pending === true)).toBe(true);
    expect(mock.state.inserts).toHaveLength(6);
    expect(mock.state.inserts[0]).toEqual([
      10,
      "2026-11-02",
      "",
      "",
      null,
      true,
    ]);
    expect(
      mock.state.sql.some(sql => /v2_dispatch_(checks|check_audit)/.test(sql))
    ).toBe(false);
    expect(mock.state.sql.some(sql => sql.includes("FOR UPDATE"))).toBe(true);
    expect(mock.connection.commit).toHaveBeenCalledOnce();
  });

  it("é idempotente na segunda abertura e não duplica dias/células", async () => {
    mock.state.metadata = {
      days: [
        {
          date: "2026-11-01",
          label: "01/nov",
          sourceTotal: 548,
          computedTotal: 548,
        },
        {
          date: "2026-11-02",
          label: "02/nov",
          sourceTotal: null,
          computedTotal: null,
          pending: true,
        },
        {
          date: "2026-11-03",
          label: "03/nov",
          sourceTotal: null,
          computedTotal: null,
          pending: true,
        },
        {
          date: "2026-11-04",
          label: "04/nov",
          sourceTotal: null,
          computedTotal: null,
          pending: true,
        },
      ],
    };

    const first = await prepareDispatchDay(1, now);
    const insertedAfterFirst = mock.state.inserts.length;
    const second = await prepareDispatchDay(1, now);
    expect(first).toEqual({
      date: "2026-11-04",
      added: false,
      missingSource: true,
    });
    expect(second).toEqual(first);
    expect(mock.state.inserts).toHaveLength(insertedAfterFirst);
    expect(mock.connection.commit).toHaveBeenCalledTimes(2);
  });

  it("limita o catch-up a 370 dias mesmo com um relatório muito antigo", async () => {
    mock.state.metadata = {
      days: [
        {
          date: "2025-01-01",
          label: "01/jan",
          sourceTotal: 1,
          computedTotal: 1,
        },
      ],
    };
    mock.state.rows = [];

    const result = await prepareDispatchDay(1, now);
    const days = mock.state.metadata.days as {
      date: string;
      pending?: boolean;
    }[];
    expect(result.added).toBe(true);
    expect(days).toHaveLength(371); // dia original + janela bounded de 370 dias
    expect(days.at(-1)?.date).toBe("2026-11-04");
    expect(days.slice(1).every(day => day.pending === true)).toBe(true);
  });
});
