import { beforeEach, describe, expect, it, vi } from "vitest";
import { addIsoDays, getDashboardCutoffDate } from "../shared/dashboardDates";
import type { V2Lead } from "../shared/v2Types";

const mock = vi.hoisted(() => {
  const rows: V2Lead[] = [];
  const readRows = vi.fn(async () => rows.map(row => ({ ...row })));
  return {
    rows,
    readRows,
    execute: vi.fn(),
    role: "admin" as "admin" | "client" | "bbro" | null,
    source: {
      status: "READY" as string,
      importedAt: "2026-11-08T12:00:00.000Z" as string | null,
    },
    registryRows: [] as Record<string, unknown>[],
  };
});

vi.mock("./v2Auth", () => ({
  readV2Session: vi.fn(async () =>
    mock.role
      ? { id: 7, username: "fixture", role: mock.role, sessionVersion: 0 }
      : null
  ),
  loginV2: vi.fn(),
  logoutV2: vi.fn(),
}));

vi.mock("./v2Db", () => ({
  getV2Pool: () => ({ execute: mock.execute }),
  getV2Goal: vi.fn(async () => null),
  saveV2Goal: vi.fn(),
}));

vi.mock("./v2Leads", async () => {
  const actual = await vi.importActual<typeof import("./v2Leads")>("./v2Leads");
  return { ...actual, readV2LeadsForPeriod: mock.readRows };
});

import { appRouter } from "./routers";
import { exportV2LeadsCSV } from "./v2LeadsExport";

const cutoff = getDashboardCutoffDate();
const dateFrom = addIsoDays(cutoff, -7);

function lead(id: number, overrides: Partial<V2Lead> = {}): V2Lead {
  return {
    id,
    date: addIsoDays(dateFrom, id % 8),
    hour: id % 24,
    name: `Pessoa ${id}`,
    model: "MG 4",
    version: "Comfort",
    channel: "Site",
    campaign: "Campanha fixture",
    dealer: "Dealer fixture",
    city: "Belo Horizonte",
    state: "MG",
    crm: "Pendente",
    ...overrides,
  };
}

function caller() {
  const res = { setHeader: vi.fn() };
  return {
    api: appRouter.createCaller({
      req: { headers: {}, socket: { remoteAddress: "fixture" } },
      res,
      user: null,
    } as any),
    res,
  };
}

function resetSourceAndPool() {
  mock.source = {
    status: "READY",
    importedAt: "2026-11-08T12:00:00.000Z",
  };
  mock.registryRows = [
    {
      id: 1,
      label: "Alias Extra",
      normalizedKey: "alias extra",
      state: "SP",
      sourceImportId: null,
      createdBy: 7,
      createdByUsername: "fixture",
      createdAt: "2026-11-08T12:00:00.000Z",
    },
  ];
  mock.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM v2_sources")) return [[mock.source], []];
    if (sql.includes("FROM v2_dealer_registry")) return [mock.registryRows, []];
    throw new Error(`Consulta inesperada no fixture: ${sql}`);
  });
}

beforeEach(() => {
  mock.role = "admin";
  mock.rows.splice(0);
  mock.readRows.mockClear();
  mock.execute.mockClear();
  resetSourceAndPool();
});

describe("leads.exportCSV", () => {
  it("exporta 60+ linhas antes da paginação com o recorte canônico e ordem do dashboard", async () => {
    const selected = Array.from({ length: 61 }, (_, index) =>
      lead(index + 1, {
        date: addIsoDays(dateFrom, index % 8),
        hour: index % 24,
        name: `Pessoa selecionada ${index + 1}`,
        model: index % 2 ? "4" : "MG 4",
        campaign: "Campanha alvo",
        dealer: "Alias Extra",
        state: "S.Paulo",
      })
    );
    mock.rows.push(
      ...selected,
      lead(100, { model: "IM 6" }),
      lead(101, { channel: "Meta" }),
      lead(102, { campaign: "Outra campanha" }),
      lead(103, { dealer: "Outro dealer" }),
      lead(104, { date: addIsoDays(dateFrom, -1) })
    );

    const { api, res } = caller();
    const result = await api.leads.exportCSV({
      dateFrom,
      dateTo: cutoff,
      model: "MG 4",
      channel: "Site",
      campaign: "Campanha alvo",
      dealer: "Alias Extra",
      search: "selecionada",
      page: 10_000,
    });

    expect(result.count).toBe(61);
    expect(result.nameMasked).toBe(false);
    expect(result.fileName).toBe(`leads_${dateFrom}_${cutoff}.csv`);
    expect(result.period).toEqual({
      dateFrom,
      dateTo: cutoff,
      cutoffDate: cutoff,
    });
    expect(mock.readRows).toHaveBeenCalledWith(dateFrom, cutoff);
    expect(result.csv.split("\r\n").filter(Boolean)).toHaveLength(62);
    expect(result.csv).toContain("Pessoa selecionada 61");
    expect(result.csv).not.toContain("IM 6");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store"
    );

    const body = result.csv.split("\r\n").filter(Boolean).slice(1);
    const datesAndHours = body.map(row => {
      const values = row.split(";");
      return `${values[0]} ${values[1]}`;
    });
    expect(datesAndHours[0]).toBe(`${cutoff} 23`);
    expect(datesAndHours.at(-1)).toBe(`${dateFrom} 0`);
  });

  it("mantém aliases extras para filtrar e preserva modelo/dealer originais no CSV", async () => {
    mock.rows.push(
      lead(1, {
        model: "4",
        dealer: "Alias Extra",
        date: cutoff,
      })
    );

    const result = await exportV2LeadsCSV({
      dateFrom,
      dateTo: cutoff,
      model: "MG 4",
      dealer: "Alias Extra",
    });

    expect(result.count).toBe(1);
    expect(result.csv).toContain(";4;");
    expect(result.csv).toContain(";Alias Extra;");
    expect(result.csv).not.toContain(";MG 4;Comfort;");
    expect(result.csv).not.toContain("Dealer Extra");
  });

  it("emite BOM, CRLF, campos escapados e neutraliza fórmulas sem alterar a hora 0", async () => {
    mock.rows.push(
      lead(1, {
        hour: 0,
        name: "=2+2",
        model: '+modelo; "unicode 🚗"',
        version: "versão\r\ncompleta",
        channel: "\t@canal",
        campaign: 'Campanha; "com aspas"',
        dealer: "-dealer",
        city: "Cidade",
        state: "SP",
        crm: "+crm",
        date: cutoff,
      })
    );

    const result = await exportV2LeadsCSV({
      dateFrom,
      dateTo: cutoff,
    });

    expect(result.csv.startsWith("\uFEFFData;Hora;Lead;Modelo;Versão")).toBe(
      true
    );
    expect(result.csv).toContain("\r\n");
    expect(result.csv).toContain("'=2+2");
    expect(result.csv).toContain("'\\t@canal".replace("\\t", "\t"));
    expect(result.csv).toContain("'-dealer");
    expect(result.csv).toContain('"Campanha; ""com aspas"""');
    expect(result.csv).toContain('"versão\r\ncompleta"');
    expect(result.csv).toContain("🚗");
    expect(result.csv).toMatch(/;0;'/u);
    expect(result.csv).not.toMatch(
      /headersJson|valuesJson|payload|email|telefone|\bid\b/i
    );
  });

  it("aplica apenas a projeção autorizada: UF agrupada para não-admin e nome conforme clientMode", async () => {
    mock.rows.push(
      lead(1, {
        name: "Nome autorizado",
        state: "SP",
        date: cutoff,
      })
    );

    mock.role = "admin";
    const admin = await caller().api.leads.exportCSV({
      dateFrom,
      dateTo: cutoff,
      clientMode: false,
    });
    expect(admin.csv).toContain("Nome autorizado");
    expect(admin.csv).toContain(";SP;");
    expect(admin.nameMasked).toBe(false);

    mock.role = "client";
    const client = await caller().api.leads.exportCSV({
      dateFrom,
      dateTo: cutoff,
      clientMode: true,
    });
    expect(client.csv).toContain("Nome oculto no modo cliente");
    expect(client.csv).toContain(";São Paulo;");
    expect(client.csv).not.toContain("Nome autorizado");
    expect(client.nameMasked).toBe(true);

    mock.role = "bbro";
    const bbro = await caller().api.leads.exportCSV({
      dateFrom,
      dateTo: cutoff,
      clientMode: false,
    });
    expect(bbro.csv).toContain("Nome autorizado");
    expect(bbro.csv).toContain(";São Paulo;");
  });

  it("rejeita data posterior a D-1 no router, antes de ler tabelas", async () => {
    const { api } = caller();
    await expect(
      api.leads.exportCSV({
        dateFrom: cutoff,
        dateTo: addIsoDays(cutoff, 1),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.readRows).not.toHaveBeenCalled();
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it("não retorna zero fictício quando a fonte está ausente", async () => {
    mock.source = { status: "NOT_CONFIGURED", importedAt: null };
    const { api } = caller();

    await expect(
      api.leads.exportCSV({ dateFrom, dateTo: cutoff })
    ).rejects.toThrow("fonte de Leads não está configurada");
    expect(mock.readRows).not.toHaveBeenCalled();
  });

  it("rejeita tanto excesso de linhas quanto CSV acima de 16 MiB, sem truncar", async () => {
    mock.rows.push(
      ...Array.from({ length: 100_001 }, (_, index) =>
        lead(index + 1, { date: cutoff, hour: 0 })
      )
    );
    await expect(
      exportV2LeadsCSV({ dateFrom, dateTo: cutoff })
    ).rejects.toThrow("estreite o período");

    mock.rows.splice(0);
    mock.rows.push(
      lead(1, {
        date: cutoff,
        name: "x".repeat(17 * 1024 * 1024),
      })
    );
    await expect(
      exportV2LeadsCSV({ dateFrom, dateTo: cutoff })
    ).rejects.toThrow("estreite o período");
  });

  it("exige a mesma sessão protegida do dashboard", async () => {
    mock.role = null;
    const { api } = caller();
    await expect(
      api.leads.exportCSV({ dateFrom, dateTo: cutoff })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mock.execute).not.toHaveBeenCalled();
    expect(mock.readRows).not.toHaveBeenCalled();
  });
});
