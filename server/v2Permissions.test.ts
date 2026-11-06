import { beforeEach, describe, it, expect, vi } from "vitest";
import { CRM_DEALERS, OFFICIAL_DEALERS } from "../shared/dealerRegistry";
import {
  controlForCRM,
  dashboardForClient,
  requireAdministrator,
} from "./v2Permissions";
import type { V2Dashboard } from "../shared/v2Types";
import type { DispatchReport } from "../shared/v2Dispatch";
const state = vi.hoisted(() => ({
  role: "client" as "admin" | "client" | null,
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
  commitCommercialUpload: vi.fn(),
  readCommercialStatus: vi.fn(),
  removeCommercialSource: vi.fn(),
}));
vi.mock("./v2Db", () => ({
  getV2Goal: vi.fn(async () => 16600),
  saveV2Goal: vi.fn(),
}));
vi.mock("./v2Leads", () => ({ getV2Dashboard: vi.fn() }));
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
import { setDispatchManual } from "./v2Dispatch";
import { removeCommercialSource } from "./v2Commercial";
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
  it("cliente recebe leitura sem contatos ou avisos técnicos, com totais preservados", async () => {
    const d = dashboard();
    vi.mocked(getV2Dashboard).mockResolvedValue(d as any);
    const result = await caller().leads.dashboard(filters);
    expect(result.summary.total).toBe(2);
    expect(result.dealerPerformance.totals.salesGoal).toBe(722);
    expect(result.notes).toEqual([]);
    expect(result.dealerPerformance.warnings).toEqual([]);
    expect(result.dealerPerformance.unmapped).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Pessoa privada de fixture");
    expect(result.recent.rows[0].dealer).toBe("Dealer original");
    expect(result.recent.rows[0].state).toBe("São Paulo");
  });
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
