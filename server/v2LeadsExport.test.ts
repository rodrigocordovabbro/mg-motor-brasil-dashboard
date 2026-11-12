import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { addIsoDays, getDashboardCutoffDate } from "../shared/dashboardDates";
import type { V2Lead } from "../shared/v2Types";

const mock = vi.hoisted(() => {
  const rows: V2Lead[] = [];
  const readRows = vi.fn(async () => rows.map(row => ({ ...row })));
  return {
    rows,
    readRows,
    execute: vi.fn(),
    role: "admin" as "admin" | "client" | "client_admin" | "bbro" | null,
    source: {
      status: "READY" as string,
      importedAt: "2026-11-08T12:00:00.000Z" as string | null,
    },
    registryRows: [] as Record<string, unknown>[],
    contactRows: [] as Record<string, unknown>[],
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
import {
  buildLeadsExportXlsx,
  exportV2LeadsCSV,
  exportV2LeadsExcel,
} from "./v2LeadsExport";

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

function contactProvenance(
  id: number,
  email: string,
  phone: string,
  interestVehicle: string,
  sourceSheet = "Meta"
): Record<string, unknown> {
  return {
    id,
    sourceSheet,
    model: "MG 4",
    version: "Comfort",
    headersJson: JSON.stringify(["email", "phone_number", "interest_model"]),
    valuesJson: JSON.stringify([email, phone, interestVehicle]),
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
  mock.contactRows = [];
  mock.execute.mockImplementation(async (sql: string, ids?: number[]) => {
    if (sql.includes("FROM v2_sources")) return [[mock.source], []];
    if (sql.includes("FROM v2_dealer_registry")) return [mock.registryRows, []];
    if (sql.includes("WHERE l.id IN")) {
      const selected = new Set(ids ?? []);
      return [mock.contactRows.filter(row => selected.has(Number(row.id))), []];
    }
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

    expect(
      result.csv.startsWith(
        "\uFEFFData;Hora;Nome;E-mail;Telefone;Carro de interesse;Modelo;Versão"
      )
    ).toBe(true);
    expect(result.csv).toContain("\r\n");
    expect(result.csv).toContain("'=2+2");
    expect(result.csv).toContain("'\\t@canal".replace("\\t", "\t"));
    expect(result.csv).toContain("'-dealer");
    expect(result.csv).toContain('"Campanha; ""com aspas"""');
    expect(result.csv).toContain('"versão\r\ncompleta"');
    expect(result.csv).toContain("🚗");
    expect(result.csv).toMatch(/;0;'/u);
    expect(result.csv).not.toMatch(/headersJson|valuesJson|payload|\bid\b/i);
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

    mock.role = "client_admin";
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
    await expect(
      api.leads.exportExcel({
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
    await expect(
      api.leads.exportExcel({ dateFrom, dateTo: cutoff })
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
    await expect(
      api.leads.exportExcel({ dateFrom, dateTo: cutoff })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mock.execute).not.toHaveBeenCalled();
    expect(mock.readRows).not.toHaveBeenCalled();
  });
});

describe("leads.exportExcel and complete opportunity details", () => {
  it("enriquece toda a população filtrada em lotes de cinquenta, sem payload privado", async () => {
    const selected = Array.from({ length: 61 }, (_, index) =>
      lead(index + 1, {
        date: addIsoDays(dateFrom, index % 8),
        hour: index % 24,
        campaign: "Campanha completa",
        dealer: "Dealer completo",
      })
    );
    mock.rows.push(
      ...selected,
      lead(100, { campaign: "Outra campanha" }),
      lead(101, { dealer: "Outro dealer" })
    );
    mock.contactRows.push(
      ...selected.map(row =>
        contactProvenance(
          row.id,
          `person-${row.id}@example.invalid`,
          `+55011${String(row.id).padStart(4, "0")}`,
          "MG 4 Comfort"
        )
      )
    );

    const result = await exportV2LeadsCSV({
      dateFrom,
      dateTo: cutoff,
      campaign: "Campanha completa",
      dealer: "Dealer completo",
      page: 9999,
    });

    expect(result.count).toBe(61);
    expect(result.csv).toContain("person-61@example.invalid");
    expect(result.csv).toContain("'+550110061");
    expect(result.csv).not.toContain("headersJson");
    expect(result.csv).not.toContain("valuesJson");
    expect(result.csv).not.toContain("payload");
    expect(result.csv).not.toMatch(/\bid\b/i);

    const contactCalls = mock.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("WHERE l.id IN")
    );
    expect(contactCalls).toHaveLength(2);
    expect(contactCalls.map(([, ids]) => (ids as number[]).length)).toEqual([
      50, 11,
    ]);
    const excel = await exportV2LeadsExcel({
      dateFrom,
      dateTo: cutoff,
      campaign: "Campanha completa",
      dealer: "Dealer completo",
      page: 9999,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(excel.xlsxBase64, "base64") as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0]
    );
    const sheet = workbook.getWorksheet("Oportunidades")!;
    expect(excel.count).toBe(61);
    expect(sheet.rowCount).toBe(62);
    expect(sheet.autoFilter).toBe("A1:N62");
    const emails = Array.from(
      { length: 61 },
      (_, index) => sheet.getCell(index + 2, 4).value
    );
    expect(emails).toContain("person-61@example.invalid");
    expect(emails).toHaveLength(61);
  });

  it("vincula contatos por ID físico quando duas oportunidades têm o mesmo nome", async () => {
    mock.rows.push(
      lead(201, { name: "Pessoa repetida", date: cutoff, hour: 12 }),
      lead(202, { name: "Pessoa repetida", date: cutoff, hour: 11 })
    );
    mock.contactRows.push(
      contactProvenance(201, "first@example.invalid", "+550000000201", "MG S5"),
      contactProvenance(202, "second@example.invalid", "+550000000202", "IM 6")
    );

    const result = await exportV2LeadsCSV({ dateFrom, dateTo: cutoff });

    expect(result.count).toBe(2);
    expect(result.csv).toContain("first@example.invalid");
    expect(result.csv).toContain("second@example.invalid");
    expect(result.csv).toContain("'+550000000201");
    expect(result.csv).toContain("'+550000000202");
    expect(result.csv).toContain("MG S5");
    expect(result.csv).toContain("IM 6");
  });

  it("mantém o interesse original da mesma linha no modo apresentação, sem exportar nome nem contatos", async () => {
    mock.rows.push(
      lead(301, {
        name: "Nome privado",
        email: "private@example.invalid",
        phone: "+55000000301",
        model: "MG4",
        version: "Conforto",
        date: cutoff,
      })
    );
    mock.contactRows.push(
      contactProvenance(
        301,
        "must-not-be-read@example.invalid",
        "+55000000999",
        "MG S5 original"
      )
    );

    const result = await exportV2LeadsCSV({
      dateFrom,
      dateTo: cutoff,
      clientMode: true,
    });

    expect(result.nameMasked).toBe(true);
    expect(result.csv).toContain("Nome oculto no modo cliente");
    expect(result.csv).toContain("Oculto no modo apresentação");
    expect(result.csv).toContain("MG S5 original");
    expect(result.csv).not.toContain("private@example.invalid");
    expect(result.csv).not.toContain("must-not-be-read@example.invalid");
    expect(result.csv).not.toContain("+55000000999");
    expect(
      mock.execute.mock.calls.some(([sql]) =>
        String(sql).includes("WHERE l.id IN")
      )
    ).toBe(true);
  });

  it("gera XLSX real em uma aba CRM filtrável com células de texto e telefone intacto", async () => {
    mock.rows.push(
      lead(401, {
        name: "Nome XLSX",
        channel: "=canal",
        date: cutoff,
        hour: 0,
      }),
      lead(402, { name: "Segundo XLSX", date: cutoff, hour: 1 })
    );
    mock.contactRows.push(
      contactProvenance(
        401,
        "xlsx@example.invalid",
        "+550110000401",
        "MG 4 XPower"
      ),
      contactProvenance(402, "zero@example.invalid", "001234", "MG S5")
    );

    const result = await caller().api.leads.exportExcel({
      dateFrom,
      dateTo: cutoff,
      locale: "pt-BR",
    });

    expect(result.fileName).toBe(`leads_${dateFrom}_${cutoff}.xlsx`);
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(result.count).toBe(2);
    const bytes = Buffer.from(result.xlsxBase64, "base64");
    expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      "Oportunidades",
    ]);
    const worksheet = workbook.getWorksheet("Oportunidades")!;
    expect(worksheet.autoFilter).toBe("A1:N3");
    expect(worksheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(
      Array.from(worksheet.getRow(1).values as unknown[]).slice(1)
    ).toEqual([
      "Data",
      "Hora",
      "Nome",
      "E-mail",
      "Telefone",
      "Carro de interesse",
      "Modelo",
      "Versão",
      "Canal",
      "Campanha",
      "Concessionária",
      "Cidade",
      "UF",
      "CRM",
    ]);

    const plusPhone = worksheet.getCell(2, 5);
    const leadingZeroPhone = worksheet.getCell(3, 5);
    expect(plusPhone.value).toBe("001234");
    expect(leadingZeroPhone.value).toBe("+550110000401");
    expect(plusPhone.type).toBe(ExcelJS.ValueType.String);
    expect(leadingZeroPhone.type).toBe(ExcelJS.ValueType.String);
    expect(plusPhone.numFmt).toBe("@");
    expect(plusPhone.hyperlink).toBeUndefined();
    expect(worksheet.getCell(3, 9).value).toBe("=canal");
    expect(worksheet.getCell(3, 9).type).toBe(ExcelJS.ValueType.String);
  });

  it("mantém cabeçalhos EN e mascara nome, e-mail e telefone no XLSX de apresentação", async () => {
    mock.role = "client_admin";
    mock.rows.push(
      lead(501, {
        name: "Nome que não pode sair",
        email: "private-en@example.invalid",
        phone: "+55000000501",
        date: cutoff,
      })
    );
    mock.contactRows.push(
      contactProvenance(
        501,
        "private-provenance@example.invalid",
        "+55000000901",
        "MG S5 original"
      )
    );

    const result = await caller().api.leads.exportExcel({
      dateFrom,
      dateTo: cutoff,
      clientMode: true,
      locale: "en",
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(result.xlsxBase64, "base64") as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0]
    );
    const worksheet = workbook.getWorksheet("Opportunities")!;
    expect(
      Array.from(worksheet.getRow(1).values as unknown[]).slice(1, 7)
    ).toEqual([
      "Date",
      "Time",
      "Name",
      "Email",
      "Phone",
      "Vehicle of interest",
    ]);
    expect(worksheet.getCell(2, 3).value).toBe("Hidden name in client mode");
    expect(worksheet.getCell(2, 4).value).toBe("Hidden in presentation mode");
    expect(worksheet.getCell(2, 5).value).toBe("Hidden in presentation mode");
    expect(worksheet.getCell(2, 6).value).toBe("MG S5 original");
    expect(result.nameMasked).toBe(true);
    const cellValues = JSON.stringify(worksheet.getSheetValues());
    expect(cellValues).not.toContain("private-en@example.invalid");
    expect(cellValues).not.toContain("private-provenance@example.invalid");
    expect(cellValues).not.toContain("+55000000901");
    expect(
      mock.execute.mock.calls.some(([sql]) =>
        String(sql).includes("WHERE l.id IN")
      )
    ).toBe(true);
  });

  it("representa desconhecidos explicitamente e rejeita célula XLSX acima de 32.767 caracteres", async () => {
    mock.rows.push(
      lead(601, {
        model: "modelo sem cadastro",
        version: "versão não cadastrada",
        date: cutoff,
      })
    );
    const csv = await exportV2LeadsCSV({ dateFrom, dateTo: cutoff });
    expect(csv.csv).toContain("Não informado");

    await expect(
      buildLeadsExportXlsx([lead(602, { campaign: "x".repeat(32_768) })], {
        dateFrom,
        dateTo: cutoff,
      })
    ).rejects.toThrow("32.767");
  });

  it("bloqueia o perfil Cliente antes de qualquer leitura para os dois formatos", async () => {
    mock.role = "client";
    const { api } = caller();
    await expect(
      api.leads.exportExcel({ dateFrom, dateTo: cutoff, clientMode: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      api.leads.exportCSV({ dateFrom, dateTo: cutoff, clientMode: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.readRows).not.toHaveBeenCalled();
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
