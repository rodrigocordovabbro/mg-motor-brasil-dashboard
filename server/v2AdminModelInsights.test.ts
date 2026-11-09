import { beforeEach, describe, expect, it, vi } from "vitest";
import type { V2Lead } from "../shared/v2Types";
import { UNIDENTIFIED_MODEL } from "../shared/modelRegistry";
import {
  buildAdminModelInsights,
  getAdminModelInsights,
} from "./v2AdminModelInsights";
import type { AdminModelInsightsFilters } from "../shared/adminModelInsights";

const mocks = vi.hoisted(() => ({
  role: null as "admin" | "client" | "client_admin" | "bbro" | null,
  rows: [] as V2Lead[],
  readRows: vi.fn(),
  filterRows: vi.fn(),
  readCoverage: vi.fn(),
  query: vi.fn(),
  readExtras: vi.fn(),
}));

vi.mock("./v2Leads", () => ({
  getV2Dashboard: vi.fn(),
  readV2LeadsForPeriod: mocks.readRows,
  filterV2LeadRows: mocks.filterRows,
  readV2LeadCoverage: mocks.readCoverage,
}));
vi.mock("./v2Db", () => ({
  getV2Pool: () => ({ query: mocks.query }),
}));
vi.mock("./v2DealerRegistry", () => ({
  readExtraDealerRegistry: mocks.readExtras,
}));
vi.mock("./v2Auth", () => ({
  readV2Session: vi.fn(async () =>
    mocks.role
      ? {
          id: 10,
          username: "fixture-admin",
          role: mocks.role,
          sessionVersion: 0,
        }
      : null
  ),
  loginV2: vi.fn(),
  logoutV2: vi.fn(),
}));

import { appRouter } from "./routers";

const now = new Date("2026-11-05T15:00:00Z");
const filters = { dateFrom: "2026-11-01", dateTo: "2026-11-04" };

function source(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    name: "LEADS MG — Base",
    importedAt: "2026-11-05T12:00:00Z",
    totalRows: 1000,
    invalidDateRows: 0,
    earliestLeadDate: "2026-10-01",
    latestLeadDate: "2026-11-04",
    ...overrides,
  };
}

function lead(
  id: number,
  model = "MG4",
  overrides: Partial<V2Lead> = {}
): V2Lead {
  return {
    id,
    date: "2026-11-01",
    hour: 10,
    name: `Fixture ${id}`,
    model,
    version: "Conforto",
    channel: id % 2 ? "Meta" : "Google",
    campaign: "Campanha A",
    dealer: "Dealer A",
    city: "São Paulo",
    state: "SP",
    crm: "Não informado",
    ...overrides,
  };
}

function caller() {
  return appRouter.createCaller({
    req: { headers: {}, socket: { remoteAddress: "fixture" } },
    res: { setHeader: vi.fn() },
    user: null,
  } as any);
}

function configureRouteMocks() {
  mocks.readRows.mockImplementation(async (from: string, to: string) =>
    mocks.rows.filter(row => row.date >= from && row.date <= to)
  );
  mocks.readCoverage.mockResolvedValue({
    earliestLeadDate: "2026-10-01",
    latestLeadDate: "2026-11-04",
  });
  mocks.filterRows.mockImplementation(
    (rows: V2Lead[], input: AdminModelInsightsFilters) =>
      rows.filter(
        row =>
          row.date >= input.dateFrom &&
          row.date <= input.dateTo &&
          (!input.model ||
            row.model === input.model ||
            input.model === "MG 4") &&
          (!input.channel || row.channel === input.channel) &&
          (!input.campaign || row.campaign === input.campaign) &&
          (!input.dealer || row.dealer === input.dealer)
      )
  );
  mocks.query.mockResolvedValue([
    [
      {
        name: "LEADS MG — Base",
        importedAt: "2026-11-05T12:00:00Z",
        totalRows: mocks.rows.length,
        invalidDateRows: 0,
        earliestLeadDate: "2026-10-01",
        latestLeadDate: "2026-11-04",
      },
    ],
    [],
  ]);
  mocks.readExtras.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = null;
  mocks.rows = [];
  configureRouteMocks();
});

describe("contrato e cálculos da análise administrativa por modelo", () => {
  it("reconcilia total, mix, matrizes e denominadores usando todas as linhas", () => {
    const rows = [
      lead(1, "MG4", { state: "SP", campaign: "Campanha A" }),
      lead(2, "MGS5", { state: "RJ", campaign: "Campanha B", version: "" }),
      lead(3, "modelo desconhecido", {
        state: "",
        dealer: "",
        campaign: "",
        version: "Sport Pro",
      }),
      lead(4, "MG4", {
        campaign: "+55 (11) 99999-0000",
        version: "pessoa@example.com",
      }),
    ];
    const result = buildAdminModelInsights(
      rows,
      filters,
      source(),
      [],
      [],
      now
    );

    expect(result.status).toBe("READY");
    expect(result.total).toBe(4);
    expect(result.modelAnalysis.total).toBe(4);
    expect(result.mix.models.reduce((sum, model) => sum + model.count, 0)).toBe(
      4
    );
    expect(result.mix.denominator).toBe(4);
    for (const matrix of Object.values(result.matrices)) {
      expect(matrix.total).toBe(4);
      expect(matrix.denominator).toBe(4);
      expect(
        matrix.categories.reduce((sum, category) => sum + category.count, 0)
      ).toBe(4);
      expect(matrix.rows.reduce((sum, row) => sum + row.count, 0)).toBe(4);
      for (const category of matrix.categories) {
        expect(
          matrix.rows.reduce(
            (sum, row) =>
              sum +
              (row.cells.find(cell => cell.category === category.label)
                ?.count ?? 0),
            0
          )
        ).toBe(category.count);
      }
    }
    expect(result.mix.unidentifiedTotal).toBe(1);
    expect(result.modelAnalysis.unclassified).toBe(1);
    expect(result.quality.missingStateCount).toBe(1);
    expect(result.quality.missingDealerCount).toBe(1);
    expect(result.quality.missingCampaignCount).toBe(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("99999-0000");
    expect(serialized).not.toContain("pessoa@example.com");
    expect(
      result.modelAnalysis.diagnostics.some(
        item => item.model === UNIDENTIFIED_MODEL
      )
    ).toBe(true);
  });

  it("calcula benchmark do mix no mesmo recorte, com amostra mínima e gap em p.p.", () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, index) =>
        lead(index + 1, "MG4", { campaign: "Campanha A" })
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        lead(index + 41, "MG4", { campaign: "Campanha B" })
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        lead(index + 51, "MGS5", { campaign: "Campanha B" })
      ),
    ];
    const result = buildAdminModelInsights(
      rows,
      filters,
      source(),
      [],
      [],
      now
    );
    const opportunity = result.opportunities.find(
      item =>
        item.dimension === "campaign" &&
        item.group === "Campanha A" &&
        item.model === "MG 4"
    );
    expect(opportunity).toBeDefined();
    expect(opportunity).toMatchObject({
      groupCount: 40,
      groupDenominator: 40,
      modelCount: 40,
      actualSharePercent: 100,
      expectedSharePercent: expect.closeTo(83.333333, 5),
      gapPP: expect.closeTo(16.666666, 5),
      sampleThreshold: 30,
    });
    expect(opportunity?.expectedCount).toBeCloseTo(33.333333, 5);
    expect(opportunity?.estimatedVolumeDifference).toBeCloseTo(6.666666, 5);
    expect(result.opportunities.every(item => item.groupCount >= 30)).toBe(
      true
    );
  });

  it("sinaliza baixa amostra, versão faltante/inválida e mantém desconhecidos", () => {
    const rows = [
      lead(1, "MG4", { version: "" }),
      lead(2, "modelo desconhecido", { version: "Sport Pro" }),
      lead(3, "MG4", { version: "whatsapp" }),
    ];
    const result = buildAdminModelInsights(
      rows,
      filters,
      source(),
      [],
      [],
      now
    );
    expect(result.insights.some(item => item.kind === "LOW_SAMPLE")).toBe(true);
    expect(result.quality.unknownModelCount).toBe(1);
    expect(result.quality.versionsMissing).toBe(1);
    expect(result.quality.versionsInvalid).toBe(2);
    expect(
      result.quality.gaps.some(
        gap => gap.code === "UNKNOWN" && gap.dimension === "model"
      )
    ).toBe(true);
    expect(
      result.quality.gaps.every(gap => gap.commercialEligible === false)
    ).toBe(true);
  });

  it("não compara histórico atrasado e distingue zero coberto de fonte ausente", () => {
    const delayed = buildAdminModelInsights(
      [lead(1)],
      filters,
      source({ earliestLeadDate: "2026-11-01", latestLeadDate: "2026-11-02" }),
      [],
      [],
      now
    );
    expect(delayed.source.currentCoverage).toBe("PARTIAL");
    expect(delayed.comparison.status).toBe("NOT_AVAILABLE");
    expect(delayed.comparison.rows[0]?.previousCount).toBeNull();
    expect(delayed.daily.find(day => day.date === "2026-11-03")).toMatchObject({
      total: null,
      sourceAvailable: false,
    });

    const historical = buildAdminModelInsights(
      [lead(1, "MG4")],
      filters,
      source(),
      [],
      [
        lead(2, "MGS5", { date: "2026-10-28" }),
        lead(3, "MG4", { date: "2026-10-29" }),
      ],
      now
    );
    expect(historical.comparison.status).toBe("AVAILABLE");
    expect(historical.comparison.currentPeriod.days).toBe(4);
    expect(historical.comparison.previousPeriod).toMatchObject({
      dateFrom: "2026-10-28",
      dateTo: "2026-10-31",
      days: 4,
    });
    expect(historical.comparison.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "MG 4",
          currentCount: 1,
          currentDenominator: 1,
          previousCount: 1,
          previousDenominator: 2,
        }),
      ])
    );

    const zero = buildAdminModelInsights([], filters, source(), [], [], now);
    expect(zero.status).toBe("READY");
    expect(zero.total).toBe(0);
    expect(
      zero.daily.every(day => day.total === 0 && day.sourceAvailable)
    ).toBe(true);
    expect(zero.notes.join(" ")).toContain("zero Leads reais");

    const absent = buildAdminModelInsights(
      [],
      filters,
      source({
        configured: false,
        importedAt: null,
        earliestLeadDate: null,
        latestLeadDate: null,
      }),
      [],
      [],
      now
    );
    expect(absent.status).toBe("NOT_CONFIGURED");
    expect(absent.daily.every(day => day.total === null)).toBe(true);
    expect(absent.comparison.status).toBe("NOT_CONFIGURED");
  });
});

describe("rota protegida da análise administrativa", () => {
  it("nega sessão ausente e perfis não administrativos antes da leitura", async () => {
    const unauthenticated = caller();
    await expect(
      unauthenticated.leads.modelInsights(filters)
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    mocks.role = "client";
    const client = caller();
    await expect(client.leads.modelInsights(filters)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.readRows).not.toHaveBeenCalled();
  });

  it("aceita somente Administrador e conserva os filtros aplicados", async () => {
    mocks.role = "admin";
    mocks.rows = [
      lead(1, "MG4", { campaign: "Campanha A" }),
      lead(2, "MGS5", { campaign: "Campanha B" }),
    ];
    configureRouteMocks();
    const result = await caller().leads.modelInsights({
      ...filters,
      model: "MG4",
      campaign: "Campanha A",
      page: 99,
    });
    expect(result.audience).toBe("admin");
    expect(result.total).toBe(1);
    expect(result.period.filters.model).toBe("MG4");
    expect(result.period.filters.campaign).toBe("Campanha A");
    expect(result.period.filters.search).toBeUndefined();
    expect(result.limits.matricesTruncated).toBe(false);
    expect(mocks.readRows).toHaveBeenCalled();
    expect(mocks.filterRows).toHaveBeenCalled();
  });

  it("usa a cobertura canônica corrigida mesmo quando limites físicos discordam", async () => {
    mocks.rows = [lead(1, "MG4", { date: "2026-11-04" })];
    configureRouteMocks();
    mocks.query.mockResolvedValue([
      [
        {
          name: "Fixture",
          importedAt: "2026-11-05T12:00:00Z",
          totalRows: 1,
          invalidDateRows: 0,
          earliestLeadDate: "2026-11-05",
          latestLeadDate: "2026-11-05",
        },
      ],
      [],
    ]);
    mocks.readCoverage.mockResolvedValue({
      earliestLeadDate: "2026-11-04",
      latestLeadDate: "2026-11-04",
    });
    const result = await getAdminModelInsights(
      { dateFrom: "2026-11-04", dateTo: "2026-11-04" },
      now
    );
    expect(result.source.latestLeadDate).toBe("2026-11-04");
    expect(result.source.currentCoverage).toBe("COVERED");
    expect(result.daily[0]).toMatchObject({
      date: "2026-11-04",
      total: 1,
      sourceAvailable: true,
    });
    expect(mocks.query.mock.calls[0][0]).not.toContain("MIN(leadDate)");
  });
});
