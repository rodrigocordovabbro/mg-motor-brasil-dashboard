import { beforeEach, describe, it, expect, vi } from "vitest";
import { CRM_DEALERS, OFFICIAL_DEALERS } from "../shared/dealerRegistry";
import { BRAZILIAN_STATES, UNIDENTIFIED_STATE } from "../shared/stateRegistry";
import {
  controlForCRM,
  dashboardForClient,
  dashboardForOverviewClient,
  dispatchForClient,
  requireAdministrator,
} from "./v2Permissions";
import type { V2Dashboard } from "../shared/v2Types";
import type { DispatchReport } from "../shared/v2Dispatch";
const state = vi.hoisted(() => ({
  role: "client" as "admin" | "client" | "client_admin" | "bbro" | null,
}));
vi.mock("./v2Auth", () => ({
  readV2Session: vi.fn(async () =>
    state.role
      ? { id: 77, username: "fixture", role: state.role, sessionVersion: 0 }
      : null
  ),
  loginV2: vi.fn(),
  logoutV2: vi.fn(),
}));
vi.mock("./v2Accounts", () => ({
  listV2Accounts: vi.fn(async () => []),
  createV2Account: vi.fn(async () => ({
    id: 78,
    username: "fixture-new",
    role: "client",
    isActive: true,
    createdAt: null,
  })),
  updateV2Account: vi.fn(),
  resetV2AccountPassword: vi.fn(),
}));
vi.mock("./v2Commercial", () => ({
  previewCommercialUpload: vi.fn(),
  previewCombinedGoalsUpload: vi.fn(),
  commitCombinedGoalsUpload: vi.fn(),
  commitCommercialUpload: vi.fn(),
  readCommercialStatus: vi.fn(),
  removeCommercialSource: vi.fn(),
}));
vi.mock("./v2MediaPlanProjections", () => ({
  readPlansWithProjections: vi.fn(async () => []),
  readMediaPlanProjections: vi.fn(),
  updateMediaPlanProjections: vi.fn(),
}));
vi.mock("./v2Db", () => ({
  getV2Goal: vi.fn(async () => 16600),
  saveV2Goal: vi.fn(),
}));
vi.mock("./v2Leads", () => ({ getV2Dashboard: vi.fn() }));
vi.mock("./v2LeadsExport", () => ({
  exportV2LeadsCSV: vi.fn(),
}));
vi.mock("./v2Dispatch", () => ({
  listDispatchReports: vi.fn(async () => []),
  getDispatchReport: vi.fn(),
  setDispatchManual: vi.fn(),
  getDispatchHistory: vi.fn(),
}));
vi.mock("./v2DispatchLeads", () => ({
  getLeadControl: vi.fn(),
  prepareLeadControl: vi.fn(),
}));
vi.mock("./v2DispatchDaily", () => ({ prepareDispatchDay: vi.fn() }));
vi.mock("./v2DispatchXlsx", () => ({ importDispatchWorkbook: vi.fn() }));
import { appRouter } from "./routers";
import { getV2Dashboard } from "./v2Leads";
import { listV2Accounts, createV2Account } from "./v2Accounts";
import { getDispatchHistory, setDispatchManual } from "./v2Dispatch";
import { removeCommercialSource } from "./v2Commercial";
import { prepareLeadControl } from "./v2DispatchLeads";
import { listDispatchReports } from "./v2Dispatch";
import { readPlansWithProjections } from "./v2MediaPlanProjections";
import { exportV2LeadsCSV } from "./v2LeadsExport";
const filters = { dateFrom: "2026-11-01", dateTo: "2026-11-04" };
function caller() {
  return appRouter.createCaller({
    req: { headers: {}, socket: { remoteAddress: "fixture" } },
    res: { setHeader: vi.fn() },
    user: null,
  } as any);
}
function dashboard(): V2Dashboard {
  return {
    status: "READY",
    source: {
      name: "Nome de arquivo privado",
      importedAt: "2026-11-05T12:00:00Z",
      mode: "authenticated-import",
      totalRows: 2,
      invalidDateRows: 0,
    },
    period: { ...filters, cutoffDate: "2026-11-04" },
    options: { models: ["4", "IM6"], channels: [], campaigns: [], dealers: [] },
    summary: {
      total: 2,
      models: 2,
      dealers: 0,
      states: 1,
      cities: 1,
      crmRate: null,
      crmDelivered: null,
      topModel: { label: "MG 4", count: 1 },
      topState: { label: "São Paulo", count: 2 },
      peakHour: null,
    },
    pacing: {
      competence: "2026-11",
      goal: 16600,
      current: 2,
      closedDays: 4,
      daysInMonth: 30,
      daysRemaining: 26,
      averagePerDay: 0.5,
      requiredPerDay: 0,
      projection: 15,
      projectedDifference: 0,
      remainingToGoal: 16598,
      progressPercent: 0,
      status: "BEHIND",
    },
    daily: [],
    channels: [],
    models: [
      { label: "4", count: 1 },
      { label: "IM6", count: 1 },
    ],
    states: [],
    cities: [],
    dealers: [],
    hours: [],
    campaigns: [],
    versions: [],
    crm: [],
    recent: {
      rows: [
        {
          id: 1,
          date: "2026-11-01",
          hour: 12,
          name: "Pessoa privada de fixture",
          model: "4",
          version: "",
          channel: "",
          campaign: "",
          dealer: "Dealer original",
          city: "Cidade",
          state: "SP",
          crm: "Contato privado",
        },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    },
    dealerPerformance: {
      available: true,
      sourceName: null,
      updatedAt: null,
      rows: [],
      totals: {
        leads: 2,
        leadGoal: 16600,
        sales: 0,
        salesGoal: 722,
        conversionRate: null,
      },
      warnings: ["Mensagem SQL privada"],
      unmapped: [
        {
          kind: "lead-goals",
          key: "a",
          sourceLabel: "Rótulo de origem privado",
          state: null,
          value: 7,
        },
      ],
      unreconciledDealers: [],
    },
    notes: ["Nota técnica privada"],
  };
}
function dispatchReport(): DispatchReport {
  return {
    id: 1,
    title: "Envios fixture",
    fileName: "fixture.xlsx",
    dateFrom: "2026-11-04",
    dateTo: "2026-11-04",
    generatedLabel: "04/11/2026",
    importedAt: "2026-11-05T12:00:00Z",
    information: [
      { label: "Informação técnica privada", value: "valor privado" },
    ],
    notes: ["Nota técnica privada"],
    days: [
      { date: "2026-11-04", label: "04/nov", sourceTotal: 2, computedTotal: 2 },
    ],
    rows: [
      {
        id: 1,
        rowNumber: 5,
        storeName: "Autobrand Recife",
        crmResponsible: "Responsável CRM fixture",
        syonetIntegration: "OK",
        bbroIntegration: "NÃO",
        cells: [
          {
            id: 1,
            rowNumber: 5,
            date: "2026-11-04",
            syonet: "OK",
            sourceManual: "",
            volume: 2,
            validation: null,
          },
        ],
      },
    ],
    totals: {
      computed: 2,
      sourceDailySum: 2,
      declaredInInstructions: null,
      sourceManualOk: 0,
      auditedOk: 0,
      manualOverridden: 0,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.role = "client";
});
describe("permissões na API", () => {
  it("cliente não pode executar operações administrativas nem consultar gestão", async () => {
    const c = caller();
    for (const action of [
      () => c.accounts.list(),
      () =>
        c.accounts.create({
          username: "fixture-new",
          password: "senha-fixture-apenas",
          role: "admin",
        }),
      () => c.leads.updateGoal({ competence: "2026-11", goal: 100 }),
      () => c.leads.goal({ competence: "2026-11" }),
      () => c.commercial.status({ competence: "2026-11" }),
      () =>
        c.commercial.preview({
          kind: "lead-goals",
          competence: "2026-11",
          fileName: "fixture.xlsx",
          base64: "AA==",
        }),
      () =>
        c.commercial.remove({
          kind: "sales",
          competence: "2026-11",
          expectedImportId: 1,
        }),
      () => c.dispatch.setManual({ cellId: 1, isOk: true, expectedVersion: 0 }),
      () => c.dispatch.prepareDay({ reportId: 1 }),
      () => c.dispatch.prepareLeadControl({ reportId: 1, filters }),
      () => c.dispatch.history({ cellId: 1 }),
    ])
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createV2Account).not.toHaveBeenCalled();
    expect(setDispatchManual).not.toHaveBeenCalled();
    expect(removeCommercialSource).not.toHaveBeenCalled();
  });
  it("BBRO pode marcar Manual, consultar histórico e preparar o controle", async () => {
    state.role = "bbro";
    const api = caller();

    await api.dispatch.setManual({ cellId: 1, isOk: true, expectedVersion: 0 });
    await api.dispatch.history({ cellId: 1 });
    await api.dispatch.prepareLeadControl({ reportId: 1, filters });

    expect(setDispatchManual).toHaveBeenCalledWith(
      1,
      true,
      0,
      expect.objectContaining({ id: 77, role: "bbro" })
    );
    expect(getDispatchHistory).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ role: "bbro", id: 77 })
    );
    expect(prepareLeadControl).toHaveBeenCalledWith(
      1,
      filters,
      undefined,
      true
    );
  });
  it("administrador encaminha sua identidade à gestão e preserva acesso completo", async () => {
    state.role = "admin";
    await caller().accounts.list();
    expect(listV2Accounts).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin", id: 77 })
    );
    const d = dashboard();
    vi.mocked(getV2Dashboard).mockResolvedValue(d as any);
    expect((await caller().leads.dashboard(filters)).notes).toEqual(d.notes);
  });
  it.each(["client", "client_admin"] as const)(
    "remove metadados de arquivo da resposta do perfil %s sem alterar os totais",
    async role => {
      state.role = role;
      const d = dashboard();
      d.dealerPerformance.sourceName = "IMPORT_SOURCE_PRIVATE.xlsx";
      (d.dealerPerformance as any).sources = [
        {
          kind: "sales",
          fileName: "IMPORT_SOURCE_PRIVATE.xlsx",
          id: 880011,
          warnings: ["IMPORT_METADATA_PRIVATE"],
        },
      ];
      vi.mocked(getV2Dashboard).mockResolvedValue(d as any);
      const result = await caller().leads.dashboard(filters);
      expect(result.dealerPerformance.sourceName).toBeNull();
      expect((result.dealerPerformance as any).sources).toBeUndefined();
      expect(result.dealerPerformance.totals).toEqual(
        d.dealerPerformance.totals
      );
      expect(JSON.stringify(result)).not.toContain("IMPORT_SOURCE_PRIVATE");
      expect(JSON.stringify(result)).not.toContain("IMPORT_METADATA_PRIVATE");
      expect((d.dealerPerformance as any).sources).toHaveLength(1);
    }
  );
  it("cliente recebe dealers agregados na Visão Geral, sem Leads individuais ou análises restritas", async () => {
    const d = dashboard();
    d.states = BRAZILIAN_STATES.slice(0, 12).map((state, index) => ({
      label: state.name,
      count: 12 - index,
    }));
    d.states.push({ label: UNIDENTIFIED_STATE, count: 1000 });
    d.cities = [{ label: "Cidade privada", count: 2 }];
    d.regionalModels = {
      models: ["MG 4"],
      regions: [{ label: "Região privada", total: 2, counts: { "MG 4": 2 } }],
      states: [{ label: "Estado privado", total: 2, counts: { "MG 4": 2 } }],
      total: 2,
      unidentifiedModelCount: 0,
    } as any;
    d.modelAnalysis = { unclassified: 0, diagnostics: [] } as any;
    d.dealerPerformance.rows = [
      {
        dealer: "Sinal Av. Europa",
        state: "SP",
        leads: 2,
        leadGoal: null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
    ];
    vi.mocked(getV2Dashboard).mockResolvedValue(d as any);
    const result = await caller().leads.dashboard(filters);
    expect(result.summary.total).toBe(2);
    expect(result.dealerPerformance.totals.salesGoal).toBe(722);
    expect(result.notes).toEqual([]);
    expect(result.dealerPerformance.warnings).toEqual([]);
    expect(result.dealerPerformance.unmapped).toEqual([]);
    expect(result.recent.rows).toEqual([]);
    expect(result.dealerPerformance.rows).toEqual(d.dealerPerformance.rows);
    expect(result.states).toHaveLength(10);
    expect(
      result.states.some(state => state.label === UNIDENTIFIED_STATE)
    ).toBe(false);
    expect(result.regionalModels).toBeUndefined();
    expect(result.modelAnalysis).toBeUndefined();
    expect(result.cities).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Pessoa privada de fixture");
    expect(JSON.stringify(result)).not.toContain("Contato privado");
    expect(JSON.stringify(result)).not.toContain("Cidade privada");
  });
  it("preserva zero, nulos e metas coletivas sem rateio ou detalhes privados nas linhas", () => {
    const d = dashboard();
    const rows = [
      {
        dealer: "Sinal Av. Europa",
        state: "SP",
        leads: 2,
        leadGoal: null,
        sales: 0,
        salesGoal: null,
        conversionRate: 0,
      },
      {
        dealer: "Dealer registrado por arquivo",
        state: "RJ",
        leads: 0,
        leadGoal: null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
    ];
    d.dealerPerformance.rows = rows.map(row => ({
      ...row,
      privateLeadName: "Nome pessoal que não deve ser exposto",
    }));
    d.dealerRegistry = [{ name: "Dealer registrado por arquivo", state: "RJ" }];
    d.dealerPerformance.groupedGoals = [
      {
        kind: "lead-goals",
        key: "Chave de arquivo privada",
        sourceLabel: "Nome de arquivo privado.xlsx",
        dealers: rows.map(row => row.dealer),
        value: 30,
        leads: 2,
      },
    ];
    const before = JSON.stringify(d);
    const result = dashboardForOverviewClient(d);

    expect(result.dealerPerformance.rows).toEqual(rows);
    expect(result.dealerRegistry).toEqual(d.dealerRegistry);
    expect(result.dealerPerformance.groupedGoals).toEqual([
      {
        kind: "lead-goals",
        key: "collective-1",
        sourceLabel: "Collective network goal",
        dealers: rows.map(row => row.dealer),
        value: 30,
        leads: 2,
      },
    ]);
    expect(result.dealerPerformance.sourceName).toBeNull();
    expect(result.recent.rows).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(
      "Nome pessoal que não deve ser exposto"
    );
    expect(JSON.stringify(result)).not.toContain("Nome de arquivo privado");
    expect(JSON.stringify(result)).not.toContain("Chave de arquivo privada");
    expect(JSON.stringify(d)).toBe(before);
  });
  it("ADM - Cliente preserva a leitura legada sem receber avisos técnicos", async () => {
    state.role = "client_admin";
    const d = dashboard();
    vi.mocked(getV2Dashboard).mockResolvedValue(d as any);
    const result = await caller().leads.dashboard(filters);
    expect(JSON.stringify(result)).toContain("Pessoa privada de fixture");
    expect(JSON.stringify(result)).toContain("Contato privado");
    expect(result.recent.rows[0].dealer).toBe("Dealer original");
    expect(result.recent.rows[0].model).toBe(d.recent.rows[0].model);
    expect(result.recent.rows[0].state).toBe("São Paulo");
  });
  it("cliente é bloqueado antes de carregar Plano, Controle ou exportação", async () => {
    const api = caller();
    await expect(api.mediaPlan.plans()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(api.dispatch.reports()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      api.dispatch.leadControl({ reportId: 1, filters })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      api.leads.exportCSV({ ...filters, clientMode: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(readPlansWithProjections).not.toHaveBeenCalled();
    expect(listDispatchReports).not.toHaveBeenCalled();
    expect(exportV2LeadsCSV).not.toHaveBeenCalled();
  });
  it.each(["client", "bbro"] as const)(
    "%s recebe nomes de loja e responsáveis CRM no controle",
    role => {
      const result = dispatchForClient(dispatchReport());
      expect(result.rows[0].storeName).toBe("Autobrand Recife");
      expect(result.rows[0].crmResponsible).toBe("Responsável CRM fixture");
      expect(result.information).toEqual([]);
      expect(result.notes).toEqual([]);
      expect(role).toMatch(/client|bbro/);
    }
  );
  it("erros técnicos do backend não chegam ao cliente", async () => {
    vi.mocked(getV2Dashboard).mockRejectedValue(
      new Error("SQL segredo-private")
    );
    await expect(caller().leads.dashboard(filters)).rejects.toThrow(
      "Dados temporariamente indisponíveis"
    );
    state.role = null;
    await expect(caller().accounts.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
describe("projeções sem alteração da fonte", () => {
  it("mantém exatamente 40 lojas CRM, sem remover Indianópolis do cadastro de 41", () => {
    const rows = OFFICIAL_DEALERS.map((dealer, index) => ({
      id: index + 1,
      rowNumber: index + 1,
      storeName: dealer.name,
      crmResponsible: "",
      syonetIntegration: "",
      bbroIntegration: "",
      cells: [
        {
          id: index + 1,
          rowNumber: index + 1,
          date: "2026-11-04",
          syonet: "",
          sourceManual: "",
          volume: null,
          leadVolume: 1,
          validation: null,
        },
      ],
    }));
    const r = {
      id: 1,
      title: "fixture",
      fileName: "fixture",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      generatedLabel: "",
      importedAt: "",
      information: [],
      notes: [],
      days: [
        {
          date: "2026-11-04",
          label: "04/nov",
          sourceTotal: 41,
          computedTotal: 41,
        },
      ],
      rows,
      totals: {
        computed: 41,
        sourceDailySum: 41,
        declaredInInstructions: null,
        sourceManualOk: 0,
        auditedOk: 0,
        manualOverridden: 0,
      },
    } satisfies DispatchReport;
    const before = JSON.stringify(r);
    const result = controlForCRM(r);
    expect(CRM_DEALERS).toHaveLength(40);
    expect(result.rows).toHaveLength(40);
    expect(
      result.rows.some(row => row.storeName === "Sinal Av. Indianópolis")
    ).toBe(false);
    expect(result.totals.computed).toBe(40);
    expect(result.dashboardTotal).toBe(41);
    expect(JSON.stringify(r)).toBe(before);
    expect(OFFICIAL_DEALERS).toHaveLength(41);
  });
  it("papel não informado falha fechado e máscara não modifica os dados originais", () => {
    expect(() => requireAdministrator(undefined)).toThrow();
    const d = dashboard();
    const before = JSON.stringify(d);
    dashboardForClient(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("Edições exclusivas da conta Rodrigo", () => {
  it.each(["client", "bbro"] as const)(
    "bloqueia CRUD de usuários e todas as mutações admin/owner para perfil %s",
    async role => {
      state.role = role;
      const api = caller();
      const actions = [
        () => api.accounts.list(),
        () =>
          api.accounts.create({
            username: "fixture-new",
            password: "senha-fixture-apenas",
            role: "admin",
          }),
        () => api.accounts.update({ id: 78, role: "client" }),
        () =>
          api.accounts.resetPassword({
            id: 78,
            password: "senha-fixture-atualizada",
          }),
        () => api.leads.goal({ competence: "2026-11" }),
        () => api.leads.updateGoal({ competence: "2026-11", goal: 100 }),
        () => api.leads.salesGoal({ competence: "2026-11" }),
        () => api.leads.updateSalesGoal({ competence: "2026-11", goal: 900 }),
        () => api.mediaPlan.projections({ monthId: "2026-10" }),
        () =>
          api.mediaPlan.updateProjections({
            monthId: "2026-10",
            expectedVersion: 0,
            values: { globalLeads: 12000 },
          }),
        () => api.dispatch.report({ reportId: 1 }),
        () => api.dispatch.prepareDay({ reportId: 1 }),
        () =>
          api.dispatch.importWorkbook({
            reportId: 1,
            fileName: "fixture.xlsx",
            base64: "AA==",
          }),
        () => api.commercial.status({ competence: "2026-11" }),
        () =>
          api.commercial.preview({
            kind: "lead-goals",
            competence: "2026-11",
            fileName: "fixture.xlsx",
            base64: "AA==",
          }),
        () =>
          api.commercial.commit({
            kind: "lead-goals",
            competence: "2026-11",
            fileName: "fixture.xlsx",
            base64: "AA==",
          }),
        () =>
          api.commercial.remove({
            kind: "sales",
            competence: "2026-11",
            expectedImportId: 1,
          }),
      ];
      for (const action of actions)
        await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  );

  it("cliente não pode marcar Manual, consultar histórico ou preparar controle", async () => {
    state.role = "client";
    const api = caller();
    for (const action of [
      () =>
        api.dispatch.setManual({ cellId: 1, isOk: true, expectedVersion: 0 }),
      () => api.dispatch.history({ cellId: 1 }),
      () => api.dispatch.prepareLeadControl({ reportId: 1, filters }),
    ])
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

it.each(["client", "bbro"] as const)(
  "%s não pode pré-visualizar nem importar as duas metas",
  async role => {
    state.role = role;
    const api = caller();
    const input = {
      competence: "2026-11",
      fileName: "metas.xlsx",
      base64: "YWJj",
    };
    await expect(api.commercial.previewGoals(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(api.commercial.commitGoals(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  }
);

describe("sincronização externa de Leads", () => {
  it.each(["client", "bbro"] as const)(
    "bloqueia %s antes de ler a fonte externa",
    async role => {
      state.role = role;
      await expect(caller().leads.syncBase()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller().leads.syncConnection()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  );
  it("exige sessão antes de acessar sincronização", async () => {
    state.role = null;
    await expect(caller().leads.syncBase()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

it("informa configuração pendente ao administrador sem sucesso fictício", async () => {
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON", "");
  try {
    state.role = "admin";
    await expect(caller().leads.syncBase()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(await caller().leads.syncConnection()).toMatchObject({
      configured: false,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});

it("usa IDs, nomes e ordem da fotografia atual e inclui qualificação sem somar aliases duplicados", () => {
  const r = dispatchReport();
  const base = r.rows[0];
  const old = {
    ...base,
    id: 10,
    rowNumber: 1,
    storeName: "Autobrand Recife",
    cells: base.cells.map(c => ({ ...c, volume: 0, leadVolume: 0 })),
  };
  const source = {
    ...base,
    id: 11,
    rowNumber: 5,
    storeName: "Autobrand Recife - Recife/PE",
    cells: base.cells.map(c => ({ ...c, volume: 3, leadVolume: 3 })),
  };
  const qualification = {
    ...base,
    id: 12,
    rowNumber: 6,
    storeName: "— Equipe repassa (loja não identificada) —",
    cells: base.cells.map(c => ({ ...c, volume: 2, leadVolume: 2 })),
  };
  r.rows = [old, source, qualification];
  r.sourceRows = [
    { rowId: 11, storeName: source.storeName, rowNumber: 5 },
    { rowId: 12, storeName: qualification.storeName, rowNumber: 6 },
  ];
  r.totals.computed = 5;
  const before = structuredClone(r);
  const result = controlForCRM(r);
  expect(result.rows.map(row => row.id)).toEqual([11, 12]);
  expect(result.rows.map(row => row.storeName)).toEqual([
    source.storeName,
    qualification.storeName,
  ]);
  expect(result.totals.computed).toBe(5);
  expect(result.days[0].computedTotal).toBe(5);
  expect(r).toEqual(before);
});

it("mantém dealer novo e grupo ambíguo com volume positivo sem inferir unidade ou esconder oportunidades", () => {
  const r = dispatchReport();
  const base = r.rows[0];
  r.volumeMode = "dashboard-leads";
  r.rows = [
    {
      ...base,
      cells: base.cells.map(c => ({ ...c, volume: 3, leadVolume: 3 })),
    },
    {
      ...base,
      id: 20,
      storeName: "Dealer novo da fonte",
      crmResponsible: "",
      syonetIntegration: "",
      bbroIntegration: "",
      metadataMatched: false,
      cells: base.cells.map(c => ({ ...c, volume: 2, leadVolume: 2 })),
    },
    {
      ...base,
      id: 21,
      storeName: "JAVEP BAURU",
      crmResponsible: "",
      syonetIntegration: "",
      bbroIntegration: "",
      metadataMatched: false,
      cells: base.cells.map(c => ({ ...c, volume: 1, leadVolume: 1 })),
    },
    {
      ...base,
      id: 22,
      storeName: "Linha auxiliar antiga",
      cells: base.cells.map(c => ({ ...c, volume: 0, leadVolume: 0 })),
    },
  ];
  r.totals.computed = 6;
  const before = structuredClone(r);
  const result = controlForCRM(r);
  expect(result.rows.map(row => row.storeName)).toEqual([
    "Autobrand Recife",
    "Dealer novo da fonte",
    "JAVEP BAURU",
  ]);
  expect(result.totals.computed).toBe(6);
  expect(result.days[0].computedTotal).toBe(6);
  expect(result.rows[1].syonetIntegration).toBe("");
  expect(r).toEqual(before);
});

it("soma volumes de aliases de uma unidade mas conserva controle e ID da fonte escolhida", () => {
  const r = dispatchReport();
  const base = r.rows[0];
  r.volumeMode = "dashboard-leads";
  r.rows = [
    {
      ...base,
      cells: base.cells.map(c => ({ ...c, volume: 2, leadVolume: 2 })),
    },
    {
      ...base,
      id: 20,
      storeName: "Autobrand Recife - Recife/PE",
      cells: base.cells.map(c => ({ ...c, volume: 1, leadVolume: 1 })),
    },
  ];
  r.totals.computed = 3;
  const before = structuredClone(r);
  const result = controlForCRM(r);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].id).toBe(base.id);
  expect(result.rows[0].cells[0].leadVolume).toBe(3);
  expect(result.rows[0].cells[0].validation).toEqual(base.cells[0].validation);
  expect(result.totals.computed).toBe(3);
  expect(r).toEqual(before);
});
