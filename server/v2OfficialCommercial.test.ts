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
  it("does not compare monthly goals or general sales to a lead period starting mid-month", () => {
    const snapshot = stored(
      "sales",
      [row("unit", "INDIANA SALVADOR", 2, ["Inglaterra Salvador"], "BA")],
      144,
      filters.dateTo
    );
    snapshot.retailMtd = 144;
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, dateFrom: "2026-11-02" },
      new Map([
        ["sales", snapshot],
        [
          "lead-goals",
          stored(
            "lead-goals",
            [
              row(
                "goal",
                "INDIANA SALVADOR",
                50,
                ["Inglaterra Salvador"],
                "BA"
              ),
            ],
            50
          ),
        ],
        [
          "sales-goals",
          stored(
            "sales-goals",
            [row("goal", "INDIANA SALVADOR", 5, ["Inglaterra Salvador"], "BA")],
            5
          ),
        ],
      ]),
      780
    );
    expect(performance.totals).toMatchObject({
      sales: null,
      conversionRate: null,
      salesGoal: null,
      leadGoal: null,
    });
    expect(
      performance.rows.find(row => row.dealer === "Inglaterra Salvador")
    ).toMatchObject({ sales: null, salesGoal: null, leadGoal: null });
  });

  it("compares only the same metric and date, counts collective sources once, and omits distribution warnings under filters", () => {
    const unit = row(
      "WEEKLY_REG:unit",
      "INDIANA SALVADOR",
      3,
      ["Inglaterra Salvador"],
      "BA"
    );
    unit.weeklySales = {
      sourceSheet: "WEEKLY_REG",
      sourceLabel: unit.sourceLabel,
      values: [1, 3, null, null, null, null],
    };
    const group = row("WEEKLY_REG:group", "BALTIC BARUERI/GUARULHOS", 5);
    group.weeklySales = {
      sourceSheet: "WEEKLY_REG",
      sourceLabel: group.sourceLabel,
      values: [2, 5, null, null, null, null],
    };
    const snapshot = stored("sales", [unit, group], 144, filters.dateTo);
    snapshot.registrationMtd = 8;
    snapshot.registrationAsOf = filters.dateTo;
    snapshot.retailMtd = 144;
    snapshot.retailAsOf = filters.dateTo;
    const latest = new Map([["sales" as const, snapshot]]);
    const general = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      latest
    );
    expect(
      general.warnings.some(
        warning =>
          warning.includes("difere do snapshot") ||
          warning.includes("não distribuído")
      )
    ).toBe(false);
    const divergent = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      new Map([["sales", { ...snapshot, registrationMtd: 9 }]])
    );
    expect(
      divergent.warnings.some(warning =>
        warning.includes("Registration difere")
      )
    ).toBe(true);
    expect(
      divergent.warnings.some(warning => warning.includes("Retail difere"))
    ).toBe(false);
    const narrowed = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, dealer: "Inglaterra Salvador" },
      latest
    );
    expect(
      narrowed.warnings.some(
        warning =>
          warning.includes("difere do snapshot") ||
          warning.includes("não distribuído")
      )
    ).toBe(false);
    const otherDate = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      new Map([
        [
          "sales",
          { ...snapshot, registrationMtd: 9, registrationAsOf: "2026-11-05" },
        ],
      ])
    );
    expect(
      otherDate.warnings.some(warning =>
        warning.includes("não foram equiparados")
      )
    ).toBe(true);
    expect(
      otherDate.warnings.some(warning =>
        warning.includes("Registration difere")
      )
    ).toBe(false);
  });

  it("maps the explicit EUROVILLE BH/JF/UB source to one collective Registration snapshot without rewriting its label", () => {
    const group = row(
      "WEEKLY_REG:W2_Reg:7",
      "EUROVILLE BH/JF/UB",
      12,
      [],
      "MG"
    );
    group.weeklySales = {
      sourceSheet: "WEEKLY_REG",
      sourceLabel: group.sourceLabel,
      values: [7, 12, null, null, null, null],
    };
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      new Map([["sales", stored("sales", [group], 144, filters.dateTo)]])
    );
    expect(performance.unmapped).toEqual([]);
    expect(performance.groupedGoals).toContainEqual(
      expect.objectContaining({
        sourceLabel: "EUROVILLE BH/JF/UB",
        dealers: [
          "Euroville Belo Horizonte",
          "Euroville Juiz de Fora",
          "Euroville Uberlândia",
        ],
        value: 12,
      })
    );
    expect(
      performance.rows
        .filter(row => row.dealer.startsWith("Euroville"))
        .every(row => row.sales === null)
    ).toBe(true);
    expect(group.sourceLabel).toBe("EUROVILLE BH/JF/UB");
  });

  it("keeps Registration weekly dealer values separate from general Retail and uses the weekly cut for ratios", () => {
    const unit = row(
      "WEEKLY_REG:W2_Reg:3",
      "INDIANA SALVADOR",
      3,
      ["Inglaterra Salvador"],
      "BA"
    );
    unit.weeklySales = {
      sourceSheet: "WEEKLY_REG",
      sourceLabel: unit.sourceLabel,
      values: [1, 3, null, null, null, null],
    };
    const collective = row(
      "WEEKLY_REG:W2_Reg:4",
      "BALTIC BARUERI/GUARULHOS",
      5
    );
    collective.weeklySales = {
      sourceSheet: "WEEKLY_REG",
      sourceLabel: collective.sourceLabel,
      values: [3, 5, null, null, null, null],
    };
    const snapshot = stored("sales", [unit, collective], 144, filters.dateTo);
    snapshot.registrationMtd = 151;
    snapshot.registrationAsOf = "2026-11-05";
    snapshot.retailMtd = 144;
    snapshot.retailAsOf = "2026-11-05";
    const latest = new Map([["sales" as const, snapshot]]);
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      latest
    );
    expect(performance.dealerSalesKind).toBe("registration");
    expect(
      performance.rows.find(row => row.dealer === "Inglaterra Salvador")
    ).toMatchObject({ sales: 3, conversionRate: 0.75, leadsPerSale: 4 / 3 });
    expect(performance.generalRegistrationMTD?.value).toBe(151);
    expect(performance.generalRetailMTD?.value).toBe(144);
    expect(performance.totals.sales).toBe(144);
    expect(
      performance.groupedGoals?.find(row => row.kind === "sales")?.weeklySales
        ?.sourceSheet
    ).toBe("WEEKLY_REG");
    expect(
      performance.rows
        .filter(row => row.dealer.startsWith("Baltic"))
        .every(row => row.sales === null)
    ).toBe(true);
    const mismatched = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, dateTo: "2026-11-03" },
      latest
    );
    expect(
      mismatched.rows.find(row => row.dealer === "Inglaterra Salvador")
    ).toMatchObject({ sales: null, conversionRate: null, leadsPerSale: null });
    const narrowed = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, model: "MG 4" },
      latest
    );
    expect(
      narrowed.rows.find(row => row.dealer === "Inglaterra Salvador")
        ?.weeklySales
    ).toBeUndefined();
  });

  it("never copies weekly snapshots or raw mappings into the unmapped public contract", () => {
    const source = row("retail:unknown", "Unmapped source", 4, [], null);
    source.weeklySales = {
      sourceSheet: "WEEKLY_RET",
      sourceLabel: source.sourceLabel,
      values: [2, 4, null, null, null, null],
    };
    const performance = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, channel: "Meta" },
      new Map([["sales", stored("sales", [source], 4, filters.dateTo)]])
    );
    const result = performance.unmapped!.find(
      row => row.sourceLabel === "Unmapped source"
    )!;
    expect(result).toEqual({
      kind: "sales",
      key: "retail:unknown",
      sourceLabel: "Unmapped source",
      state: null,
      value: 4,
    });
    expect(result).not.toHaveProperty("weeklySales");
    expect(result).not.toHaveProperty("rawDealers");
  });

  it("keeps Retail weeks on unit rows, computes dealer ratios independently of the general Registration label date, and hides ratios outside the matching cut", () => {
    const source = row(
      "retail:unit",
      "INDIANA SALVADOR",
      2,
      ["Inglaterra Salvador"],
      "BA"
    );
    source.weeklySales = {
      sourceLabel: "INDIANA SALVADOR",
      sourceSheet: "WEEKLY_RET",
      values: [1, 2, null, null, null, null],
    };
    const snapshot = stored("sales", [source], 9, filters.dateTo);
    snapshot.registrationMtd = 12;
    snapshot.registrationAsOf = "2026-11-05";
    snapshot.retailMtd = 9;
    const latest = new Map([["sales" as const, snapshot]]);
    const matched = buildOfficialCommercialPerformance(
      dashboard(),
      filters,
      latest
    );
    const dealer = matched.rows.find(
      row => row.dealer === "Inglaterra Salvador"
    )!;
    expect(dealer.sales).toBe(2);
    expect(dealer.conversionRate).toBe(0.5);
    expect(dealer.leadsPerSale).toBe(2);
    expect(dealer.weeklySales?.[0].values).toEqual([
      1,
      2,
      null,
      null,
      null,
      null,
    ]);
    const filtered = buildOfficialCommercialPerformance(
      dashboard(),
      { ...filters, channel: "Meta" },
      latest
    );
    const hidden = filtered.rows.find(
      row => row.dealer === "Inglaterra Salvador"
    )!;
    expect(hidden.sales).toBeNull();
    expect(hidden.conversionRate).toBeNull();
    expect(hidden.leadsPerSale).toBeNull();
    expect(hidden.weeklySales).toBeUndefined();
  });

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
    expect(performance.totals.sales).toBeNull();
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
