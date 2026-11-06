import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommercialSourceRow,
  CommercialUploadKind,
} from "../shared/v2Commercial";
import type {
  ParsedCombinedGoalsWorkbook,
  ParsedCommercialWorkbook,
} from "./v2CommercialParser";

const mock = vi.hoisted(() => ({
  parsedCommercial: null as ParsedCommercialWorkbook | null,
  parsedCombined: null as ParsedCombinedGoalsWorkbook | null,
  failSalesInsert: false,
  connection: null as any,
  pool: null as any,
}));

vi.mock("./v2Db", () => ({ getV2Pool: () => mock.pool }));
vi.mock("./v2CommercialParser", async () => {
  const actual = await vi.importActual<typeof import("./v2CommercialParser")>(
    "./v2CommercialParser"
  );
  return {
    ...actual,
    parseCommercialWorkbook: vi.fn(async () => mock.parsedCommercial),
    parseCombinedGoalsUpload: vi.fn(async () => mock.parsedCombined),
  };
});

import {
  buildOfficialCommercialPerformance,
  commitCombinedGoalsUpload,
  commitCommercialUpload,
  previewCommercialUpload,
  previewCombinedGoalsUpload,
} from "./v2Commercial";
import type { V2Dashboard, V2Filters } from "../shared/v2Types";

type RegistryRow = {
  id: number;
  label: string;
  normalizedKey: string;
  state: string | null;
  sourceImportId: number | null;
  createdBy: number;
  createdByUsername: string;
  createdAt: Date;
};

type ImportRow = {
  id: number;
  kind: CommercialUploadKind;
  competence: string;
  asOf: string | null;
  sourceWeek: number | null;
  asOfKey: string;
  fileSha256: string;
  mappingSha256: string;
  total: number | null;
  rowCount: number;
  rowsJson: string;
  warningsJson: string;
  removedAt: null;
};

const registry = new Map<string, RegistryRow>();
const imports: ImportRow[] = [];
let nextRegistryId = 1;
let nextImportId = 100;
let transactionSnapshot:
  | { registry: Map<string, RegistryRow>; imports: ImportRow[] }
  | undefined;

function cloneRegistry(source: Map<string, RegistryRow>) {
  return new Map(
    [...source].map(([key, value]) => [key, { ...value }] as const)
  );
}

function cloneImports(source: ImportRow[]) {
  return source.map(item => ({ ...item }));
}

function sourceRow(
  sourceLabel: string,
  key = "row-1",
  value: number | null = 7,
  state: string | null = "SP"
): CommercialSourceRow {
  return { key, sourceLabel, state, value, rawDealers: [] };
}

function parsedCommercial(
  kind: CommercialUploadKind = "sales-goals",
  row = sourceRow("Nova Unidade/SP"),
  fileSha256 = "f".repeat(64)
): ParsedCommercialWorkbook {
  return {
    kind,
    competence: "2026-11",
    asOf: kind === "sales" ? "2026-11-04" : null,
    sourceWeek: kind === "sales" ? 1 : undefined,
    fileName: `${kind}.xlsx`,
    fileSha256,
    rows: [row],
    total: row.value,
    warnings: [],
  };
}

function parsedCombined(
  row = sourceRow("Nova Unidade/SP"),
  fileSha256 = "c".repeat(64)
): ParsedCombinedGoalsWorkbook {
  return {
    competence: "2026-11",
    fileName: "combined.xlsx",
    fileSha256,
    rows: [
      {
        key: row.key,
        sourceLabel: row.sourceLabel,
        state: row.state,
        leadGoal: row.value,
        salesGoal: row.value,
      },
    ],
    leadTotal: row.value,
    salesTotal: row.value,
    warnings: [],
  };
}

function configureDatabase(): void {
  registry.clear();
  imports.splice(0);
  nextRegistryId = 1;
  nextImportId = 100;
  transactionSnapshot = undefined;
  mock.failSalesInsert = false;

  const execute = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT id,label,normalizedKey,state,sourceImportId"))
      return [[...registry.values()], []];
    if (sql.startsWith("SELECT DISTINCT BINARY dealer")) return [[], []];

    if (
      sql.includes(
        "WHERE i.kind=? AND i.competence=? AND i.fileSha256=? AND i.asOfKey=? AND i.mappingSha256=?"
      )
    ) {
      const [kind, competence, fileSha256, asOfKey, mappingSha256] = args;
      return [
        imports.filter(
          item =>
            item.kind === kind &&
            item.competence === competence &&
            item.fileSha256 === fileSha256 &&
            item.asOfKey === asOfKey &&
            item.mappingSha256 === mappingSha256
        ),
        [],
      ];
    }
    if (
      sql.includes(
        "WHERE i.kind=? AND i.competence=? ORDER BY i.id DESC LIMIT 1"
      )
    ) {
      const [kind, competence] = args;
      const matches = imports.filter(
        item => item.kind === kind && item.competence === competence
      );
      return [matches.length ? [matches.at(-1)] : [], []];
    }
    if (sql.startsWith("SELECT id FROM v2_commercial_imports")) {
      const [kind, competence, fileSha256] = args;
      return [
        imports.filter(
          item =>
            item.kind === kind &&
            item.competence === competence &&
            item.fileSha256 === fileSha256
        ),
        [],
      ];
    }
    if (sql.startsWith("INSERT INTO v2_commercial_imports")) {
      if (mock.failSalesInsert && args[0] === "sales-goals")
        throw new Error("sales source failed");
      const item: ImportRow = {
        id: nextImportId++,
        kind: String(args[0]) as CommercialUploadKind,
        competence: String(args[1]),
        asOf: args[2] == null ? null : String(args[2]),
        sourceWeek: args[3] == null ? null : Number(args[3]),
        asOfKey: String(args[4]),
        fileSha256: String(args[6]),
        mappingSha256: String(args[7]),
        total: args[8] == null ? null : Number(args[8]),
        rowCount: Number(args[9]),
        rowsJson: String(args[10]),
        warningsJson: String(args[11]),
        removedAt: null,
      };
      imports.push(item);
      return [{ insertId: item.id }, []];
    }
    if (sql.startsWith("SELECT goal,sourceKind,sourceImportId"))
      return [
        [{ goal: 16600, sourceKind: "manual", sourceImportId: null }],
        [],
      ];
    if (sql.startsWith("INSERT INTO v2_lead_goals"))
      return [{ insertId: 1 }, []];
    if (sql.startsWith("INSERT INTO v2_goal_audit"))
      return [{ insertId: 1 }, []];

    if (sql.startsWith("INSERT INTO v2_dealer_registry")) {
      const [
        label,
        normalizedKey,
        state,
        ,
        sourceImportId,
        createdBy,
        username,
      ] = args;
      const key = String(normalizedKey);
      if (registry.has(key)) return [{ affectedRows: 0 }, []];
      registry.set(key, {
        id: nextRegistryId++,
        label: String(label),
        normalizedKey: key,
        state: state == null ? null : String(state),
        sourceImportId: sourceImportId == null ? null : Number(sourceImportId),
        createdBy: Number(createdBy),
        createdByUsername: String(username),
        createdAt: new Date("2026-11-05T12:00:00.000Z"),
      });
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes("WHERE normalizedKey=?")) {
      const item = registry.get(String(args[0]));
      return [item ? [item] : [], []];
    }
    throw new Error(`SQL de integração não suportado: ${sql}`);
  });

  const connection = {
    execute,
    beginTransaction: vi.fn(async () => {
      transactionSnapshot = {
        registry: cloneRegistry(registry),
        imports: cloneImports(imports),
      };
    }),
    commit: vi.fn(async () => {
      transactionSnapshot = undefined;
    }),
    rollback: vi.fn(async () => {
      if (!transactionSnapshot) return;
      registry.clear();
      for (const [key, value] of transactionSnapshot.registry)
        registry.set(key, value);
      imports.splice(0, imports.length, ...transactionSnapshot.imports);
      transactionSnapshot = undefined;
    }),
    release: vi.fn(),
  };
  mock.connection = connection;
  mock.pool = {
    execute,
    getConnection: vi.fn(async () => connection),
  };
}

const actor = { id: 7, username: "fixture-admin", role: "admin" as const };
const uploadInput = {
  kind: "sales-goals" as const,
  competence: "2026-11",
  fileName: "sales-goals.xlsx",
  base64: "ignored-by-parser-mock",
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.parsedCommercial = parsedCommercial();
  mock.parsedCombined = parsedCombined();
  configureDatabase();
});

describe("commercial upload and dynamic dealer registry integration", () => {
  it("preview only suggests a prospective label and never writes the registry", async () => {
    const preview = await previewCommercialUpload(uploadInput);

    expect(preview.rows[0]?.rawDealers).toEqual(["Nova Unidade/SP"]);
    expect(preview.availableDealers).toContain("Nova Unidade/SP");
    expect(registry.size).toBe(0);
    expect(mock.connection).toBeDefined();
    expect(mock.connection.beginTransaction).not.toHaveBeenCalled();
    expect(
      mock.pool.execute.mock.calls.some(([sql]: [string]) =>
        String(sql).startsWith("INSERT INTO v2_dealer_registry")
      )
    ).toBe(false);
  });

  it("inserts a new dealer after the source import in the same transaction", async () => {
    const result = await commitCommercialUpload(uploadInput, actor);
    const created = [...registry.values()][0];

    expect(result).toMatchObject({ importId: 100, alreadyImported: false });
    expect(created).toMatchObject({
      label: "Nova Unidade/SP",
      state: "SP",
      sourceImportId: 100,
      createdBy: 7,
      createdByUsername: "fixture-admin",
    });
    expect(mock.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(mock.connection.commit).toHaveBeenCalledOnce();
    const calls = mock.connection.execute.mock.calls.map((call: unknown[]) =>
      String(call[0])
    );
    expect(
      calls.findIndex((sql: string) =>
        sql.startsWith("INSERT INTO v2_commercial_imports")
      )
    ).toBeLessThan(
      calls.findIndex((sql: string) =>
        sql.startsWith("INSERT INTO v2_dealer_registry")
      )
    );
  });

  it("does not duplicate an official alias or an explicit mapping to another unit", async () => {
    mock.parsedCommercial = parsedCommercial(
      "sales-goals",
      sourceRow("SINAL/SP"),
      "a".repeat(64)
    );
    await commitCommercialUpload(uploadInput, actor);
    expect(registry.size).toBe(0);

    configureDatabase();
    mock.parsedCommercial = parsedCommercial(
      "sales-goals",
      sourceRow("Nova Unidade/SP"),
      "b".repeat(64)
    );
    await commitCommercialUpload(
      {
        ...uploadInput,
        base64: "explicit",
        mappings: { "row-1": ["Stefanini Campinas"] },
      },
      actor
    );
    expect(registry.size).toBe(0);
    const stored = JSON.parse(
      imports[0]?.rowsJson ?? "[]"
    ) as CommercialSourceRow[];
    expect(stored[0]?.rawDealers).toEqual(["Stefanini Campinas"]);
  });

  it("combined goals create one extra with the lead import as origin and roll back both sources and registry on failure", async () => {
    const combinedInput = {
      competence: "2026-11",
      fileName: "combined.xlsx",
      base64: "ignored-by-parser-mock",
    };
    const success = await commitCombinedGoalsUpload(combinedInput, actor);
    expect(success).toMatchObject({
      alreadyImported: false,
      lead: { importId: 100 },
      sales: { importId: 101 },
    });
    expect(registry.size).toBe(1);
    expect([...registry.values()][0]?.sourceImportId).toBe(100);
    expect(imports).toHaveLength(2);

    configureDatabase();
    mock.failSalesInsert = true;
    await expect(
      commitCombinedGoalsUpload(combinedInput, actor)
    ).rejects.toThrow("sales source failed");
    expect(mock.connection.commit).not.toHaveBeenCalled();
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("keeps a confirmed extra as a 42nd+ row even when it has no leads", () => {
    const dashboard = {
      status: "READY",
      source: {
        name: "fixture",
        importedAt: "2026-11-05T12:00:00.000Z",
        mode: "authenticated-import",
        totalRows: 0,
        invalidDateRows: 0,
      },
      period: {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-04",
        cutoffDate: "2026-11-04",
      },
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      dealerRegistry: [{ name: "Nova Unidade/SP", state: "SP" }],
      summary: {
        total: 0,
        models: 0,
        dealers: 0,
        states: 0,
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
        current: 0,
        closedDays: 4,
        daysInMonth: 30,
        daysRemaining: 26,
        averagePerDay: 0,
        requiredPerDay: null,
        projection: 0,
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
      dealers: [],
      hours: [],
      campaigns: [],
      versions: [],
      crm: [],
      recent: { rows: [], total: 0, page: 1, pageSize: 50 },
      dealerPerformance: {
        available: false,
        sourceName: null,
        updatedAt: null,
        rows: [],
        totals: {
          leads: 0,
          leadGoal: null,
          sales: null,
          salesGoal: null,
          conversionRate: null,
        },
      },
      notes: [],
    } satisfies V2Dashboard;

    const performance = buildOfficialCommercialPerformance(
      dashboard,
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" } satisfies V2Filters,
      new Map(),
      0
    );
    expect(performance.rows).toHaveLength(42);
    expect(performance.rows).toContainEqual(
      expect.objectContaining({
        dealer: "Nova Unidade/SP",
        state: "SP",
        leads: 0,
      })
    );
    expect(performance.unreconciledDealers).not.toContainEqual(
      expect.objectContaining({ sourceLabel: "Nova Unidade/SP" })
    );
  });
});

it("identifies prospective new dealers in the combined preview without writing", async () => {
  mock.parsedCombined = {
    competence: "2026-11",
    fileName: "metas.xlsx",
    fileSha256: "a".repeat(64),
    rows: [
      {
        key: "new-row",
        sourceLabel: "Nova Unidade/SP",
        state: "SP",
        leadGoal: 10,
        salesGoal: 2,
      },
    ],
    leadTotal: 10,
    salesTotal: 2,
    warnings: [],
  };
  const p = await previewCombinedGoalsUpload({
    competence: "2026-11",
    fileName: "metas.xlsx",
    base64: "YWJj",
  });
  expect(p.rows[0].isNewDealer).toBe(true);
  expect(p.newDealers).toEqual([{ name: "Nova Unidade/SP", state: "SP" }]);
  expect(registry.size).toBe(0);
  expect(mock.connection.beginTransaction).not.toHaveBeenCalled();
});
