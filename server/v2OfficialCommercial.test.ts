import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./v2Db", () => ({ getV2Pool: vi.fn() }));
import type { CommercialStoredImport } from "./v2Commercial";
import type { CommercialSourceRow } from "../shared/v2Commercial";
import {
  buildOfficialCommercialPerformance,
  reconcileCommercialDealers,
} from "./v2Commercial";
import { getV2Pool } from "./v2Db";
import type { V2Dashboard, V2Filters } from "../shared/v2Types";

const filters: V2Filters = {
  dateFrom: "2026-11-01",
  dateTo: "2026-11-04",
};

function row(
  key: string,
  sourceLabel: string,
  value: number | null,
  rawDealers: string[] = [],
  state: string | null = "SP"
): CommercialSourceRow {
  return { key, sourceLabel, state, value, rawDealers };
}

function stored(
  kind: CommercialStoredImport["kind"],
  rows: CommercialSourceRow[],
  total: number | null,
  asOf: string | null = null
): CommercialStoredImport {
  return {
    id: Number(
      kind === "lead-goals" ? 30000 : kind === "sales-goals" ? 30001 : 30002
    ),
    kind,
    competence: "2026-11",
    asOf,
    sourceWeek: kind === "sales" ? 1 : null,
    fileName: `${kind}.xlsx`,
    fileSha256: `${kind}-sha`,
    total,
    rowCount: rows.length,
    rows,
    warnings: [],
    importedAt: "2026-11-04T18:00:00.000Z",
  };
}

function dashboard(): V2Dashboard {
  const dealerRows = [
    {
      dealer: "Savol São Caetano",
      state: "MG",
      leads: 2,
      leadGoal: null,
      sales: null,
      salesGoal: null,
      conversionRate: null,
    },
    {
      dealer: "Savol São Caetano do Sul",
      state: "RJ",
      leads: 3,
      leadGoal: null,
      sales: null,
      salesGoal: null,
      conversionRate: null,
    },
    {
      dealer: "Indiana Salvador",
      state: "BA",
      leads: 4,
      leadGoal: null,
      sales: null,
      salesGoal: null,
      conversionRate: null,
    },
    {
      dealer: "Dealer não cadastrado",
      state: "SP",
      leads: 1,
      leadGoal: null,
      sales: null,
      salesGoal: null,
      conversionRate: null,
    },
  ];
  return {
    status: "READY",
    source: {
      name: "fixture",
      importedAt: "2026-11-04T18:00:00.000Z",
      mode: "authenticated-import",
      totalRows: 10,
      invalidDateRows: 0,
    },
    period: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      cutoffDate: filters.dateTo,
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    summary: {
      total: 10,
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
      goal: 722,
      current: 10,
      closedDays: 4,
      daysInMonth: 30,
      daysRemaining: 26,
      averagePerDay: 2.5,
      requiredPerDay: 27.384615384615383,
      projection: 75,
      projectedDifference: -647,
      remainingToGoal: 712,
      progressPercent: 1.3850415512465374,
      status: "BEHIND",
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
    recent: { rows: [], total: 10, page: 1, pageSize: 50 },
    dealerPerformance: {
      available: false,
      sourceName: null,
      updatedAt: null,
      rows: dealerRows,
      totals: {
        leads: 10,
        leadGoal: null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
    },
    notes: [],
  };
}

describe("official commercial performance", () => {
  it("builds all official units, canonicalizes aliases, preserves unknown leads, and uses registry state", () => {
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      new Map([
        [
          "lead-goals",
          stored(
            "lead-goals",
            [
              row("leads:savol", "SAVOL/SP", 11),
              row("leads:sinal", "SINAL AV INDIANOPOLIS", 7),
              row("leads:savol-group", "SAVOL SÃO CAETANO/ANÁLIA", 20),
            ],
            722
          ),
        ],
        [
          "sales-goals",
          stored(
            "sales-goals",
            [row("sales-goal:baltic", "BALTIC BARUERI/GUARULHOS", 2)],
            2
          ),
        ],
        [
          "sales",
          stored(
            "sales",
            [row("sales:baltic", "BALTIC BARUERI/GUARULHOS", 0)],
            0,
            "2026-11-04"
          ),
        ],
      ])
    );

    expect(performance.rows).toHaveLength(42); // 41 official units + one unmatched raw unit.
    expect(performance.totals.leads).toBe(10);
    expect(performance.totals.leadGoal).toBe(722);
    expect(performance.totals.sales).toBe(0);
    expect(performance.totals.salesGoal).toBe(2);

    const savol = performance.rows.find(
      row => row.dealer === "Savol São Caetano do Sul"
    );
    expect(savol).toMatchObject({ leads: 5, state: "SP", leadGoal: 11 });
    expect(
      performance.rows.filter(row => row.dealer.includes("Savol São Caetano"))
        .length
    ).toBe(1);

    const inglaterra = performance.rows.find(
      row => row.dealer === "Inglaterra Salvador"
    );
    expect(inglaterra).toMatchObject({ leads: 4, state: "BA" });
    expect(
      performance.rows.some(row => row.dealer === "Dealer não cadastrado")
    ).toBe(true);
    expect(
      performance.unmapped?.some(
        row => row.sourceLabel === "SINAL AV INDIANOPOLIS"
      )
    ).toBe(false);
    expect(
      performance.rows.find(row => row.dealer === "Sinal Av Indianopolis")
        ?.salesGoal
    ).not.toBe(7);
    expect(
      performance.unmapped?.some(
        row => row.sourceLabel === "SAVOL SÃO CAETANO/ANÁLIA"
      )
    ).toBe(false);
  });

  it("keeps collective goals and sales in groupedGoals without repeating them in units", () => {
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      new Map([
        [
          "sales-goals",
          stored("sales-goals", [row("g", "BALTIC BARUERI/GUARULHOS", 2)], 2),
        ],
        [
          "sales",
          stored(
            "sales",
            [row("s", "BALTIC BARUERI/GUARULHOS", 0)],
            0,
            "2026-11-04"
          ),
        ],
      ])
    );

    const collectiveGoal = performance.groupedGoals?.find(
      group => group.kind === "sales-goals"
    );
    const collectiveSales = performance.groupedGoals?.find(
      group => group.kind === "sales"
    );
    expect(collectiveGoal).toMatchObject({
      sourceLabel: "BALTIC BARUERI/GUARULHOS",
      dealers: ["Baltic Alphaville", "Baltic Guarulhos - Shopping Maia"],
      value: 2,
      leads: 0,
    });
    expect(collectiveSales).toMatchObject({ value: 0, leads: 0 });
    expect(
      performance.rows
        .filter(row => row.dealer.startsWith("Baltic"))
        .every(row => row.salesGoal === null && row.sales === null)
    ).toBe(true);
  });

  it("counts a raw alias in the collective group without assigning it to a unit", () => {
    const fixture = dashboard();
    fixture.dealerPerformance.rows.push({
      dealer: "HG ARACAJU",
      state: "SE",
      leads: 6,
      leadGoal: null,
      sales: null,
      salesGoal: null,
      conversionRate: null,
    });
    const performance = buildOfficialCommercialPerformance(
      fixture,
      filters,
      new Map([
        ["sales-goals", stored("sales-goals", [row("hg", "HG/SE", 2, [])], 2)],
      ])
    );
    const group = performance.groupedGoals?.find(
      group => group.sourceLabel === "HG/SE"
    );
    expect(group).toMatchObject({
      dealers: ["London Aracaju", "London Shopping Riomar"],
      leads: 6,
      value: 2,
    });
    expect(
      performance.rows.find(row => row.dealer === "HG ARACAJU")
    ).toMatchObject({
      leads: 6,
      salesGoal: null,
    });
    expect(performance.unreconciledDealers).toContainEqual({
      sourceLabel: "HG ARACAJU",
      leads: 6,
    });
  });

  it("does not mark an official source outside a dealer filter as unmapped", () => {
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, dealer: "Baltic Alphaville" },
      new Map([
        ["lead-goals", stored("lead-goals", [row("s", "SAVOL/SP", 11)], 722)],
      ])
    );
    expect(performance.unmapped).toEqual([]);
    expect(performance.rows).toHaveLength(1);
    expect(performance.rows[0].dealer).toBe("Baltic Alphaville");
  });

  it("does not compare unit or collective goals to a channel subset", () => {
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, channel: "Meta" },
      new Map([
        [
          "lead-goals",
          stored(
            "lead-goals",
            [
              row("u", "SAVOL/SP", 11),
              row("g", "SAVOL SÃO CAETANO/ANÁLIA", 20),
            ],
            722
          ),
        ],
      ])
    );
    expect(performance.totals.leadGoal).toBeNull();
    expect(
      performance.rows.find(row => row.dealer === "Savol São Caetano do Sul")
        ?.leadGoal
    ).toBeNull();
    expect(
      performance.groupedGoals?.find(
        group => group.sourceLabel === "SAVOL SÃO CAETANO/ANÁLIA"
      )?.value
    ).toBeNull();
    expect(
      performance.warnings.some(warning =>
        warning.includes("recorte de modelo")
      )
    ).toBe(true);
  });

  it("reconciles a partial SAVOL mapping into its registered group immutably and idempotently", async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: vi.fn(),
    };
    let latestRow: Record<string, unknown> = {
      id: 1,
      kind: "lead-goals",
      competence: "2026-11",
      asOf: null,
      sourceWeek: null,
      fileName: "leads.xlsx",
      fileSha256: "source-sha",
      total: 722,
      rowCount: 1,
      rowsJson: JSON.stringify([
        row("savol-group", "SAVOL SÃO CAETANO/ANÁLIA", 20, [
          "Savol São Caetano do Sul",
        ]),
      ]),
      warningsJson: "[]",
      importedAt: "2026-11-04T18:00:00.000Z",
    };
    connection.execute.mockImplementation(
      async (sql: string, values?: unknown[]) => {
        if (sql.includes("ORDER BY id DESC")) return [[latestRow], []];
        if (sql.includes("SELECT id FROM v2_commercial_imports"))
          return [[], []];
        if (sql.includes("INSERT INTO v2_commercial_imports")) {
          latestRow = {
            ...latestRow,
            id: 904,
            mappingSha256: values?.[7],
            rowsJson: values?.[10],
          };
          return [{ insertId: 904 }, []];
        }
        throw new Error(`Unexpected SQL in reconciliation test: ${sql}`);
      }
    );
    const pool = {
      getConnection: vi.fn().mockResolvedValue(connection),
    } as unknown as ReturnType<typeof getV2Pool>;
    vi.mocked(getV2Pool).mockReturnValue(pool);

    const first = await reconcileCommercialDealers("2026-11", {
      id: 7,
      username: "dbrodrigo",
    });
    expect(first).toMatchObject({
      revised: 1,
      importIds: [904],
      alreadyReconciled: false,
    });
    const inserted = JSON.parse(
      String(latestRow.rowsJson)
    ) as CommercialSourceRow[];
    expect(inserted[0].rawDealers).toEqual([
      "Savol São Caetano do Sul",
      "Savol - Shopping Anália Franco",
    ]);
    expect(inserted[0].originalRawDealers).toEqual([
      "Savol São Caetano do Sul",
    ]);

    const second = await reconcileCommercialDealers("2026-11", {
      id: 7,
      username: "dbrodrigo",
    });
    expect(second).toMatchObject({
      revised: 0,
      importIds: [],
      alreadyReconciled: true,
    });
    expect(
      connection.execute.mock.calls.filter(call =>
        String(call[0]).includes("INSERT INTO v2_commercial_imports")
      )
    ).toHaveLength(1);
  });
});

afterEach(() => {
  vi.mocked(getV2Pool).mockReset();
});

it("preserva meta de vendas vazia como null e meta zero como zero real", () => {
  const result = buildOfficialCommercialPerformance(
    dashboard(),
    filters,
    new Map([
      [
        "sales-goals",
        stored(
          "sales-goals",
          [
            row("empty", "STEFANINI CAMPINAS", null),
            row("zero", "STEFANINI PIRACICABA", 0),
          ],
          0
        ),
      ],
    ])
  );
  expect(
    result.rows.find(row => row.dealer === "Stefanini Campinas")?.salesGoal
  ).toBeNull();
  expect(
    result.rows.find(row => row.dealer === "Stefanini Piracicaba")?.salesGoal
  ).toBe(0);
});

it("vincula a meta autorizada de Indianópolis sem alterar a meta de Europa", () => {
  const result = buildOfficialCommercialPerformance(
    dashboard(),
    filters,
    new Map([
      [
        "sales-goals",
        stored("sales-goals", [row("new", "SINAL AV INDIANOPOLIS", 7)], 7),
      ],
    ])
  );
  expect(
    result.rows.find(row => row.dealer === "Sinal Av. Indianópolis")?.salesGoal
  ).toBe(7);
  expect(
    result.rows.find(row => row.dealer === "Sinal Av. Europa")?.salesGoal
  ).toBeNull();
  expect(result.unmapped).toEqual([]);
});
