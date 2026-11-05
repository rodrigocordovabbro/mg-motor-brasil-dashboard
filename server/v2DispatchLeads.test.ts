import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchReport } from "../shared/v2Dispatch";

const mock = vi.hoisted(() => {
  const state = {
    sourceReady: true,
    metadata: { days: [] as unknown[] } as Record<string, any>,
    rows: [
      {
        id: 10,
        rowNumber: 5,
        storeName: "Loja A",
        crmResponsible: "Responsável A",
        syonetIntegration: "OK",
        bbroIntegration: "NÃO",
      },
    ] as Record<string, unknown>[],
    leads: [
      {
        id: 1,
        date: "2026-11-01",
        hour: null,
        name: "Lead 1",
        model: "MG 4",
        version: "V",
        channel: "Meta",
        campaign: "C1",
        dealer: "Loja A",
        city: "São Paulo",
        state: "SP",
        crm: "Não informado",
      },
      {
        id: 2,
        date: "2026-11-01",
        hour: null,
        name: "Lead 2",
        model: "MG 4",
        version: "V",
        channel: "Meta",
        campaign: "C1",
        dealer: "outros",
        city: "São Paulo",
        state: "SP",
        crm: "Não informado",
      },
      {
        id: 3,
        date: "2026-11-02",
        hour: null,
        name: "Lead 3",
        model: "MG 5",
        version: "V",
        channel: "Site",
        campaign: "C2",
        dealer: "Nova Loja sem cadastro",
        city: "Campinas",
        state: "SP",
        crm: "Não informado",
      },
    ] as Record<string, unknown>[],
    sql: [] as string[],
    cellsPrepared: false,
    connection: null as any,
  };
  const execute = vi.fn();
  const query = vi.fn();
  const getConnection = vi.fn();
  return { state, execute, query, getConnection };
});

vi.mock("./v2Db", () => ({
  getV2Pool: () => ({
    execute: mock.execute,
    query: mock.query,
    getConnection: mock.getConnection,
  }),
}));

const report = (): DispatchReport => ({
  id: 1,
  title: "Envios teste",
  fileName: "envios.xlsx",
  dateFrom: "2026-11-01",
  dateTo: "2026-11-04",
  generatedLabel: "04/11/2026",
  importedAt: "2026-11-04T12:00:00.000Z",
  information: [],
  days: [
    {
      date: "2026-11-01",
      label: "01/nov",
      sourceTotal: 205,
      computedTotal: 205,
    },
  ],
  rows: [
    {
      id: 10,
      rowNumber: 5,
      storeName: "Loja A",
      crmResponsible: "Responsável A",
      syonetIntegration: "OK",
      bbroIntegration: "NÃO",
      cells: [
        {
          id: 205,
          rowNumber: 5,
          date: "2026-11-01",
          syonet: "OK",
          sourceManual: "OK",
          volume: 205,
          validation: {
            isOk: true,
            version: 1,
            reviewerLabel: "Wini",
            updatedBy: "operator",
            updatedAt: "2026-11-04T12:00:00.000Z",
          },
        },
      ],
    },
  ],
  totals: {
    computed: 205,
    sourceDailySum: 205,
    declaredInInstructions: 205,
    sourceManualOk: 1,
    auditedOk: 1,
    manualOverridden: 1,
  },
  notes: [],
});

vi.mock("./v2Dispatch", () => ({
  getDispatchReport: vi.fn(async () => report()),
}));

import { getLeadControl, prepareLeadControl } from "./v2DispatchLeads";
import { filterV2LeadRows } from "./v2Leads";

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.sourceReady = true;
  mock.state.metadata = { days: [] };
  mock.state.rows = [
    {
      id: 10,
      rowNumber: 5,
      storeName: "Loja A",
      crmResponsible: "Responsável A",
      syonetIntegration: "OK",
      bbroIntegration: "NÃO",
    },
  ];
  mock.state.sql = [];
  mock.state.cellsPrepared = false;
  mock.execute.mockImplementation(async (sql: string, params?: unknown[]) => {
    mock.state.sql.push(sql);
    if (sql.includes("FROM v2_sources"))
      return [
        mock.state.sourceReady
          ? [
              {
                name: "Base leads",
                importedAt: new Date("2026-11-04T12:00:00Z"),
              },
            ]
          : [],
        [],
      ];
    if (sql.includes("SELECT metadata FROM v2_dispatch_reports"))
      return [[{ metadata: JSON.stringify(mock.state.metadata) }], []];
    if (sql.includes("FROM v2_leads")) return [mock.state.leads, []];
    return [[], []];
  });
  mock.query.mockImplementation(async () => [[], []]);
  mock.state.connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      mock.state.sql.push(sql);
      if (sql.includes("SELECT id,metadata"))
        return [[{ id: 1, metadata: JSON.stringify(mock.state.metadata) }], []];
      if (sql.includes("SELECT importedAt FROM v2_sources"))
        return [
          mock.state.sourceReady
            ? [{ importedAt: new Date("2026-11-04T12:00:00Z") }]
            : [],
          [],
        ];
      if (sql.includes("FROM v2_leads")) return [mock.state.leads, []];
      if (sql.includes("SELECT id,rowNumber,storeName"))
        return [mock.state.rows, []];
      if (sql.startsWith("INSERT INTO v2_dispatch_rows")) {
        const id = 20 + mock.state.rows.length;
        mock.state.rows.push({
          id,
          rowNumber: Number(params?.[1]),
          storeName: String(params?.[2]),
          crmResponsible: "",
          syonetIntegration: "",
          bbroIntegration: "",
        });
        return [{ insertId: id }, []];
      }
      if (sql.startsWith("UPDATE v2_dispatch_reports")) {
        mock.state.metadata = JSON.parse(String(params?.[0]));
        return [{}, []];
      }
      if (sql.includes("INSERT IGNORE INTO v2_dispatch_cells")) {
        const affectedRows = mock.state.cellsPrepared ? 0 : 1;
        mock.state.cellsPrepared = true;
        return [{ affectedRows }, []];
      }
      throw new Error(`SQL não esperado: ${sql}`);
    }),
  };
  mock.getConnection.mockResolvedValue(mock.state.connection);
});

describe("dashboard lead dispatch", () => {
  it("usa o mesmo filtro exato do dashboard e preserva cada linha", () => {
    const rows = mock.state.leads as any;
    expect(
      filterV2LeadRows(rows, {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-02",
        channel: "Meta",
        search: "lead 2",
      }).map(row => row.id)
    ).toEqual([2]);
  });

  it("calcula volumes diários da base, mantém aliases e não perde dealer novo", async () => {
    const result = await getLeadControl(1, {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-02",
    });
    expect(result.volumeMode).toBe("dashboard-leads");
    expect(result.leadSource).toMatchObject({ status: "READY", total: 3 });
    expect(result.days.map(day => day.computedTotal)).toEqual([2, 1]);
    expect(result.totals.computed).toBe(3);
    expect(
      result.rows.find(row => row.storeName === "Loja A")?.cells[0].volume
    ).toBe(1);
    expect(
      result.rows.find(row => row.storeName === "Leads em qualificação")
        ?.rawDealers
    ).toEqual(["outros"]);
    expect(
      result.rows.find(row => row.storeName === "Nova Loja sem cadastro")
    ).toMatchObject({
      metadataMatched: false,
      rawDealers: ["Nova Loja sem cadastro"],
    });
    expect(
      result.rows.find(row => row.storeName === "Loja A")?.cells[0].validation
        ?.version
    ).toBe(1);
  });

  it("recorta também os totais de validação ao período visível, sem carregar a fotografia inteira", async () => {
    const result = await getLeadControl(1, {
      dateFrom: "2026-11-02",
      dateTo: "2026-11-02",
    });
    expect(result.totals.sourceManualOk).toBe(0);
    expect(result.totals.auditedOk).toBe(0);
    expect(result.totals.manualOverridden).toBe(0);
    expect(result.totals.declaredInInstructions).toBeNull();
    expect(result.information).toEqual([]);
  });

  it("não transforma fonte ausente em contagem zero", async () => {
    mock.state.sourceReady = false;
    const result = await getLeadControl(1, {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-02",
    });
    expect(result.leadSource).toMatchObject({
      status: "NOT_CONFIGURED",
      total: null,
      importedAt: null,
    });
    expect(result.totals.computed).toBeNull();
    expect(result.days.every(day => day.computedTotal === null)).toBe(true);
    expect(result.rows[0].cells.every(cell => cell.volume === null)).toBe(true);
  });
});

describe("lead-control preparation", () => {
  it("persiste mapeamento explícito, cria células sem tocar checks e é idempotente", async () => {
    const filters = { dateFrom: "2026-11-01", dateTo: "2026-11-02" };
    const first = await prepareLeadControl(
      1,
      filters,
      new Date("2026-11-05T12:00:00Z")
    );
    const second = await prepareLeadControl(
      1,
      filters,
      new Date("2026-11-05T12:00:00Z")
    );
    expect(first).toEqual({
      date: "2026-11-04",
      added: true,
      missingSource: false,
    });
    expect(second).toEqual({
      date: "2026-11-04",
      added: false,
      missingSource: false,
    });
    expect(mock.state.metadata.leadDealerMap).toMatchObject({
      outros: expect.any(Number),
      "Nova Loja sem cadastro": expect.any(Number),
    });
    expect(
      mock.state.sql.some(sql => /v2_dispatch_(checks|check_audit)/.test(sql))
    ).toBe(false);
    expect(
      mock.state.sql.some(sql => sql.includes("UPDATE v2_dispatch_cells"))
    ).toBe(false);
  });
});
