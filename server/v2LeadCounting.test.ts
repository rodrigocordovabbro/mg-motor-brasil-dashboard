import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countLegacyCompatibleLeads,
  isLegacyLeadChannelActive,
  legacyConsolidatedModel,
  legacyCorrectedDate,
  projectLegacyLeadCounting,
  type LeadCountingInput,
} from "./v2LeadCounting";
import type { V2Lead } from "../shared/v2Types";

const state = vi.hoisted(() => ({
  version: 0,
  raw: [] as any[],
  execute: vi.fn(),
  query: vi.fn(),
}));
vi.mock("./v2Db", () => ({
  getV2Pool: () => ({ execute: state.execute, query: state.query }),
}));
import {
  aggregateV2Leads,
  readV2LeadsForPeriod,
  V2_COUNTING_SOURCE_SELECT,
} from "./v2Leads";

function site(
  id: number,
  overrides: Record<string, string> = {}
): LeadCountingInput {
  const values = {
    data: "02/11/2026",
    "Criação do ticket - Carimbo de data/hora": "2026-11-03T01:00:00Z",
    "Modelo de Interesse": "MG4",
    Estado: "São Paulo",
    Cidade: "São Paulo",
    Concessionária: "Dealer de teste",
    "Nome do solicitante": "Pessoa de teste",
    "E-mail do solicitante": "TESTE@example.invalid",
    "Número de telefone do solicitante": "+55 (11) 0000-0000",
    "Canal / Campanha": "Campanha de teste",
    ...overrides,
  };
  const lead: V2Lead = {
    id,
    date: "2026-11-02",
    hour: 10,
    model: "MG 4",
    dealer: "Dealer de teste",
    name: "Pessoa de teste",
    channel: "Site",
    campaign: "Campanha de teste",
    version: "Versão de teste",
    state: "SP",
    city: "São Paulo",
    crm: "Não informado",
  };
  return {
    lead,
    provenance: {
      sourceSheet: "Site",
      headersJson: JSON.stringify(Object.keys(values)),
      valuesJson: JSON.stringify(Object.values(values)),
      sourceTimestampRaw: values["Criação do ticket - Carimbo de data/hora"],
    },
  };
}
function raw(input: LeadCountingInput) {
  return { ...input.lead, ...input.provenance };
}
function channelInput(
  sheet: string,
  channel: string,
  values: Record<string, string>
): LeadCountingInput {
  const value = site(9);
  return {
    lead: { ...value.lead, channel },
    provenance: {
      sourceSheet: sheet,
      headersJson: JSON.stringify(Object.keys(values)),
      valuesJson: JSON.stringify(Object.values(values)),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.version++;
  state.raw = [];
  state.query.mockImplementation(async () => [
    [{ importedAt: `version-${state.version}`, totalRows: state.raw.length }],
    [],
  ]);
  state.execute.mockImplementation(async () => [state.raw, []]);
});

describe("regra histórica de Leads", () => {
  it("reproduz os modelos do ETL sem modificar o modelo original exibido", () => {
    expect(
      [
        "CYBERSTER",
        "IM 6",
        "MG4 Urban",
        "MG5",
        "S5",
        "XPOWER",
        "4",
        "outro",
      ].map(legacyConsolidatedModel)
    ).toEqual([
      "CYBERSTER",
      "IM6",
      "MG4 URBAN",
      "MGS5",
      "MGS5",
      "MG4",
      "MG4",
      "",
    ]);
    const input = site(1, { "Modelo de Interesse": "4" });
    expect(countLegacyCompatibleLeads([input])[0].model).toBe("MG 4");
  });
  it("usa o calendário do ETL, não um deslocamento por timezone nem fallback para ontem", () => {
    expect(legacyCorrectedDate("2026-11-06T01:00:00Z", false)).toBe(
      "2026-11-06"
    );
    expect(legacyCorrectedDate("11/02/2026", false)).toBe("2026-02-11");
    expect(legacyCorrectedDate("11/2/26", false)).toBe("2026-11-02");
    expect(legacyCorrectedDate("02/11/26", true)).toBe("2026-11-02");
    expect(
      legacyCorrectedDate(
        "Tue Jun 01 2026 00:00:00 GMT-0400 (Chile Standard Time)",
        false
      )
    ).toBe("2026-06-01");
    expect(legacyCorrectedDate("31/02/2026", true)).toBeNull();
    expect(legacyCorrectedDate("", true)).toBeNull();
  });
  it("prioriza Site.data no Data do CSV e só usa o carimbo quando data está vazio", () => {
    const value = site(1);
    expect(projectLegacyLeadCounting(value).lead.date).toBe("2026-11-02");
    const expected = createHash("sha256")
      .update(
        [
          "02/11/2026",
          "mg4",
          "sp",
          "são paulo",
          "dealer de teste",
          "pessoa de teste",
          "teste@example.invalid",
          "551100000000",
          "site",
          "2026-11-02",
        ].join("\u001f")
      )
      .digest("hex");
    expect(projectLegacyLeadCounting(value).contentHash).toBe(expected);
    expect(projectLegacyLeadCounting(site(1, { data: "" })).lead.date).toBe(
      "2026-11-03"
    );
  });
  it("deduplica conteúdo normalizado ignorando ID, versão e campanha, antes do filtro", () => {
    const a = site(1),
      b = site(2, {
        "E-mail do solicitante": "  teste@example.invalid  ",
        "Número de telefone do solicitante": "55 11 0000 0000",
      });
    b.lead.version = "Outra versão";
    b.lead.campaign = "Outra campanha";
    const before = structuredClone([a, b]);
    const result = countLegacyCompatibleLeads([a, b]);
    expect(result.map(v => v.id)).toEqual([1]);
    expect([a, b]).toEqual(before);
    const filtered = aggregateV2Leads(
      result,
      {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        campaign: "Outra campanha",
      },
      null,
      {
        name: "Fixture",
        importedAt: "2026-11-06T12:00:00Z",
        mode: "authenticated-import",
        totalRows: 2,
        invalidDateRows: 0,
      },
      new Date("2026-11-06T15:00:00Z")
    );
    expect(filtered.summary.total).toBe(0);
  });
  it("não deduplica pessoas com contato diferente nem linhas sem proveniência identificável", () => {
    const result = countLegacyCompatibleLeads([
      site(1),
      site(2, { "E-mail do solicitante": "outro@example.invalid" }),
    ]);
    expect(result).toHaveLength(2);
    expect(
      countLegacyCompatibleLeads([
        { lead: site(1).lead },
        { lead: site(2).lead },
      ])
    ).toHaveLength(2);
  });
  it("exclui modelo, data ou dealer inválidos da análise, preservando a entrada", () => {
    const inputs = [
      site(1, { "Modelo de Interesse": "não reconhecido" }),
      site(2, { Concessionária: "" }),
      site(3, { data: "31/02/2026" }),
    ];
    const before = structuredClone(inputs);
    expect(countLegacyCompatibleLeads(inputs)).toEqual([]);
    expect(inputs).toEqual(before);
  });
  it("Meta usa form_name, não a coluna Modelo, e mantém a origem para o canal reportado", () => {
    const input = channelInput("Meta", "Meta", {
      created_time: "2026-11-02T01:00:00Z",
      Modelo: "modelo inválido",
      form_name: "[LD] MG4 Urban",
      "em_qual_concessionária_gostaria_de_ser_atendido?_": "Dealer de teste",
      full_name: "Pessoa",
      phone_number: "1100000000",
      email: "t@example.invalid",
      Cidade: "São Paulo",
      Estado: "SP",
    });
    const result = projectLegacyLeadCounting(input);
    expect(result.valid).toBe(true);
    expect(result.lead.date).toBe("2026-11-02");
    expect(result.lead.channel).toBe("Meta");
    input.provenance!.valuesJson = JSON.stringify(
      JSON.parse(String(input.provenance!.valuesJson)).map((v: string) =>
        v === "[LD] MG4 Urban" ? "form sem modelo" : v
      )
    );
    expect(projectLegacyLeadCounting(input).valid).toBe(false);
  });
  it("Mercado Livre usa Usuario_legal e Chave_2/3 para o hash", () => {
    const values = {
      data: "2026-11-02",
      modelo: "MG4",
      Concessionaria: "Dealer",
      Usuario_legal: "Pessoa",
      Usuario_preferred: "apelido",
      Chave_2: "t@example.invalid",
      Chave_3: "1100000000",
      Estado: "SP",
      Cidade: "São Paulo",
    };
    const a = channelInput("Mercado Livre", "Mercado Livre", values);
    const b = channelInput("Mercado Livre", "Mercado Livre", {
      ...values,
      Usuario_preferred: "outro apelido",
    });
    expect(countLegacyCompatibleLeads([a, b])).toHaveLength(1);
    const c = channelInput("Mercado Livre", "Mercado Livre", {
      ...values,
      Chave_2: "outro@example.invalid",
    });
    expect(countLegacyCompatibleLeads([a, c])).toHaveLength(2);
  });
  it("aplica os limites de ciclo sem ocultar TikTok Live", () => {
    expect(isLegacyLeadChannelActive("UOL", "2026-07-31")).toBe(true);
    expect(isLegacyLeadChannelActive("UOL", "2026-08-01")).toBe(false);
    expect(isLegacyLeadChannelActive("TikTok", "2026-09-01")).toBe(false);
    expect(isLegacyLeadChannelActive("Interlagos", "2026-09-01")).toBe(false);
    expect(isLegacyLeadChannelActive("TikTok Live", "2026-11-05")).toBe(true);
  });
  it("não vaza payload, contato ou hash na linha retornada", () => {
    const row = countLegacyCompatibleLeads([site(1)])[0];
    const text = JSON.stringify(row);
    expect(Object.keys(row)).toEqual(Object.keys(site(1).lead));
    expect(text).not.toMatch(
      /headersJson|valuesJson|contentHash|example\.invalid|551100000000/
    );
  });
});

describe("seleção compartilhada do dashboard", () => {
  it("corrige o calendário antes de selecionar o período e não usa números fixos", async () => {
    const corrected = site(1, { data: "01/11/2026" });
    corrected.lead.date = "2026-10-31";
    state.raw = [raw(corrected), raw(site(2, { data: "03/11/2026" }))];
    const rows = await readV2LeadsForPeriod("2026-11-01", "2026-11-02");
    expect(rows.map(v => v.id)).toEqual([1]);
    expect(state.execute).toHaveBeenCalledWith(V2_COUNTING_SOURCE_SELECT);
    expect(V2_COUNTING_SOURCE_SELECT).not.toContain("WHERE leadDate");
    expect(V2_COUNTING_SOURCE_SELECT).toContain("WHEN 'Site' THEN 0");
  });
  it("cacheia só a projeção segura, recarrega na nova importação e não permite mutação do cache", async () => {
    state.raw = [raw(site(1)), raw(site(2))];
    const first = await readV2LeadsForPeriod("2026-11-01", "2026-11-05");
    first[0].name = "mutação externa";
    const second = await readV2LeadsForPeriod("2026-11-01", "2026-11-05");
    expect(second[0].name).toBe("Pessoa de teste");
    expect(state.execute).toHaveBeenCalledTimes(1);
    state.version++;
    state.raw.push(
      raw(site(3, { "E-mail do solicitante": "novo@example.invalid" }))
    );
    expect(await readV2LeadsForPeriod("2026-11-01", "2026-11-05")).toHaveLength(
      2
    );
    expect(state.execute).toHaveBeenCalledTimes(2);
  });
  it("recarrega quando só o hash da fotografia muda no mesmo segundo", async () => {
    let hash = "fixture-a";
    state.query.mockImplementation(async () => [
      [
        {
          importedAt: `same-second-${state.version}`,
          totalRows: 2,
          inputSha256: hash,
        },
      ],
      [],
    ]);
    state.raw = [raw(site(1)), raw(site(2))];
    expect(await readV2LeadsForPeriod("2026-11-01", "2026-11-05")).toHaveLength(
      1
    );
    hash = "fixture-b";
    state.raw = [
      raw(site(1)),
      raw(site(2, { "E-mail do solicitante": "outro@example.invalid" })),
    ];
    expect(await readV2LeadsForPeriod("2026-11-01", "2026-11-05")).toHaveLength(
      2
    );
    expect(state.execute).toHaveBeenCalledTimes(2);
  });
  it("mantém um dia JS de uma casa no mesmo calendário", () => {
    expect(legacyCorrectedDate("Mon Jan 1 2026", false)).toBe("2026-01-01");
    expect(legacyCorrectedDate("Mon Jan 01 2026", false)).toBe("2026-01-01");
  });
  it("mantém somas, pacing, regiões, modelos, tabela e D-1 na mesma população", async () => {
    state.raw = [
      raw(site(1)),
      raw(site(2)),
      raw(
        site(3, {
          data: "05/11/2026",
          "E-mail do solicitante": "outro@example.invalid",
        })
      ),
      raw(site(4, { data: "06/11/2026" })),
    ];
    const rows = await readV2LeadsForPeriod("2026-11-01", "2026-11-06");
    const d = aggregateV2Leads(
      rows,
      { dateFrom: "2026-11-01", dateTo: "2026-11-06" },
      300,
      {
        name: "Fixture",
        importedAt: "2026-11-06T12:00:00Z",
        mode: "authenticated-import",
        totalRows: 4,
        invalidDateRows: 0,
      },
      new Date("2026-11-06T15:00:00Z")
    );
    expect(d.period.dateTo).toBe("2026-11-05");
    expect(d.summary.total).toBe(2);
    expect(d.pacing.current).toBe(2);
    expect(d.daily.reduce((n, v) => n + v.total, 0)).toBe(2);
    expect(d.daily.at(-1)?.cumulative).toBe(2);
    expect(d.channels.reduce((n, v) => n + v.count, 0)).toBe(2);
    expect(d.dealers.reduce((n, v) => n + v.count, 0)).toBe(2);
    expect(d.models.reduce((n, v) => n + v.count, 0)).toBe(2);
    expect(d.modelAnalysis?.total).toBe(2);
    expect(d.regionalModels?.total).toBe(2);
    expect(d.recent.total).toBe(2);
    expect(d.dealerPerformance.totals.leads).toBe(2);
    expect(d.source.totalRows).toBe(4);
  });
});
