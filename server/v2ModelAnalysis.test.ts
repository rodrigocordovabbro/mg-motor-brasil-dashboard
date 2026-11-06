import { describe, expect, it } from "vitest";
import {
  groupedModelLabel,
  resolveOfficialModel,
  UNIDENTIFIED_MODEL,
} from "../shared/modelRegistry";
import { aggregateV2Leads, matchesV2LeadFilters } from "./v2Leads";
import { dashboardForClient } from "./v2Permissions";
import { aggregateModelAnalysis, resolveModelVersion } from "./v2ModelAnalysis";
import type { V2Dashboard, V2Lead } from "../shared/v2Types";

const now = new Date("2026-11-05T15:00:00Z");
const source: V2Dashboard["source"] = {
  name: "Fixture de análise",
  importedAt: "2026-11-05T12:00:00Z",
  mode: "authenticated-import",
  totalRows: 2_000,
  invalidDateRows: 0,
};

function lead(
  id: number,
  model: string,
  version = "Não informado",
  date = "2026-11-04"
): V2Lead {
  return {
    id,
    date,
    hour: 10,
    name: `Lead ${id}`,
    model,
    version,
    channel: id % 2 ? "Meta" : "Google Ads",
    campaign: "Campanha de teste",
    dealer: id % 2 ? "Dealer A" : "Dealer B",
    city: "São Paulo",
    state: "SP",
    crm: "Não informado",
  };
}

describe("registro de modelos e aliases de formulários reais", () => {
  it("resolve somente os quatro aliases novos por igualdade normalizada", () => {
    const aliases: Array<[string, string]> = [
      ["Formulário -  Ago/26 - MG4 Prospecção - 13.08.26 (Novo)", "MG 4"],
      ["Formulário - Ago e Set/26 - Retargeting - MG4 - 11.09.26", "MG 4"],
      ["Formulário - Ago e Set/26 - MGS5 2 - 11.09.26", "MG S5"],
      [
        "Formulário - Ago e Set/26 - Cyberster 2 - Prospecção - 11.09.26",
        "MG Cyberster",
      ],
    ];
    for (const [raw, expected] of aliases) {
      expect(resolveOfficialModel(raw)).toBe(expected);
      expect(groupedModelLabel(raw)).toBe(expected);
    }
    expect(resolveOfficialModel("Formulário - Ago/26 - MG4 Prospecção")).toBe(
      null
    );
    expect(resolveOfficialModel("Campanha Retargeting MG4")).toBeNull();
  });
});

describe("classificação explícita de versões", () => {
  it("distingue ausente, contato, trims, especificações e desconhecido", () => {
    expect(resolveModelVersion("MG4", "")).toEqual({
      version: "Não informado",
      status: "MISSING",
      reason: "valor de versão ausente ou Não informado",
    });
    expect(resolveModelVersion("MG4", "Não informado").status).toBe("MISSING");

    for (const value of ["whatsapp", "e-mail", "ligação"]) {
      const result = resolveModelVersion("MG4", value);
      expect(result.version).toBe("Não informada");
      expect(result.status).toBe("INVALID");
      expect(result.reason).toContain("preferência de contato");
    }

    expect(resolveModelVersion("MG4", "Conforto")).toMatchObject({
      version: "Comfort",
      status: "IDENTIFIED",
    });
    expect(resolveModelVersion("MG4", "comfort")).toMatchObject({
      version: "Comfort",
      status: "IDENTIFIED",
    });
    expect(resolveModelVersion("MG4", "Luxury")).toMatchObject({
      version: "Luxury",
      status: "IDENTIFIED",
    });
    expect(resolveModelVersion("MG4", "X-Power")).toMatchObject({
      version: "XPOWER",
      status: "IDENTIFIED",
    });
    expect(resolveModelVersion("MG4", "x-power_(awd)")).toMatchObject({
      version: "XPOWER",
      status: "IDENTIFIED",
    });
    expect(resolveModelVersion("MG4", "AWD 77kWh")).toMatchObject({
      version: "AWD77kWh",
      status: "IDENTIFIED",
    });

    for (const specification of [
      "64 KW ELÉTRICO COMFORT",
      "64 KW ELÉTRICO LUXURY",
      "64 KW ELÉTRICO X-POWER",
      "43 KW ELÉTRICO COMFORT",
      "43 KW ELÉTRICO LUXURY",
      "54 KW ELÉTRICO LUXURY",
    ]) {
      expect(resolveModelVersion("MG4", specification)).toMatchObject({
        version: specification,
        status: "IDENTIFIED",
      });
    }

    expect(resolveModelVersion("MG Urban", "URBAN")).toMatchObject({
      version: "Não informada",
      status: "INVALID",
    });
    expect(resolveModelVersion("MG4", "Sport Pro")).toMatchObject({
      version: "Sport Pro",
      status: "INVALID",
    });
  });

  it("identifica XPOWER explicitamente no MODEL somente quando a versão está vazia", () => {
    const result = resolveModelVersion("XPOWER", "");
    expect(result).toMatchObject({ version: "XPOWER", status: "IDENTIFIED" });
    expect(result.reason).toContain("campo MODEL");
    expect(resolveModelVersion("MG4", "Sport Pro").version).toBe("Sport Pro");
  });
});

describe("agregação completa de modelos", () => {
  it("mantém desconhecidos, versões e diagnósticos reconciliados", () => {
    const rows = [
      lead(1, "MG4", "Conforto"),
      lead(2, "MGS5", "whatsapp"),
      lead(3, "Modelo que não existe", "versão futura"),
      lead(4, "XPOWER", ""),
    ];
    const analysis = aggregateModelAnalysis(rows);

    expect(analysis.total).toBe(4);
    expect(analysis.classified).toBe(3);
    expect(analysis.unclassified).toBe(1);
    expect(analysis.coveragePercent).toBe(75);
    expect(analysis.versionsIdentified).toBe(2);
    expect(analysis.versionsMissing).toBe(0);
    expect(analysis.versionsInvalid).toBe(2);
    expect(analysis.models.reduce((sum, model) => sum + model.leads, 0)).toBe(
      4
    );
    expect(
      analysis.models.find(model => model.model === "MG 4")?.versions
    ).toEqual(
      expect.arrayContaining([
        { label: "Comfort", count: 1, status: "IDENTIFIED" },
        { label: "XPOWER", count: 1, status: "IDENTIFIED" },
      ])
    );
    expect(
      analysis.models.find(model => model.model === UNIDENTIFIED_MODEL)?.leads
    ).toBe(1);
    expect(
      analysis.diagnostics.reduce((sum, item) => sum + item.count, 0)
    ).toBe(rows.length);
  });

  it("não expõe e-mail ou telefone mesmo se um label futuro vier contaminado", () => {
    const rows = [lead(1, "MG4", "pessoa@example.com")];
    rows[0].model = "+55 (11) 99999-0000";
    const analysis = aggregateModelAnalysis(rows);
    const serialized = JSON.stringify(analysis.diagnostics);
    expect(serialized).not.toContain("pessoa@example.com");
    expect(serialized).not.toContain("99999-0000");
    expect(analysis.diagnostics[0].originalModel).toBe("[valor não exibido]");
    expect(analysis.diagnostics[0].originalVersion).toBe("[valor não exibido]");
  });

  it("usa todas as linhas filtradas, não apenas as 50 da lista recente", () => {
    const rows = Array.from({ length: 75 }, (_, index) =>
      lead(index + 1, index % 3 === 0 ? "MG4" : "MGS5", "Não informado")
    );
    const analysis = aggregateModelAnalysis(rows);
    expect(analysis.total).toBe(75);
    expect(analysis.models.reduce((sum, model) => sum + model.leads, 0)).toBe(
      75
    );
    expect(analysis.versionsMissing).toBe(75);
    expect(analysis.daily[0].total).toBe(75);

    const dashboard = aggregateV2Leads(
      rows,
      { dateFrom: "2026-11-01", dateTo: "2026-11-04", page: 1 },
      null,
      source,
      now
    );
    expect(dashboard.recent.rows).toHaveLength(50);
    expect(dashboard.recent.total).toBe(75);
    expect(dashboard.modelAnalysis?.total).toBe(75);
    expect(
      dashboard.modelAnalysis?.models.reduce(
        (sum, model) => sum + model.leads,
        0
      )
    ).toBe(75);
  });

  it("reconcilia o filtro, data.models e a matriz regional para desconhecidos", () => {
    const rows = [lead(1, "modelo sem de-para"), lead(2, "MG4")];
    const dashboard = aggregateV2Leads(
      rows,
      {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-04",
        model: UNIDENTIFIED_MODEL,
      },
      null,
      source,
      now
    );
    expect(dashboard.summary.total).toBe(1);
    expect(dashboard.models).toEqual([{ label: UNIDENTIFIED_MODEL, count: 1 }]);
    expect(dashboard.regionalModels?.models).toContain(UNIDENTIFIED_MODEL);
    expect(
      dashboard.regionalModels?.regions.reduce(
        (sum, region) => sum + (region.counts[UNIDENTIFIED_MODEL] ?? 0),
        0
      )
    ).toBe(1);
    expect(matchesV2LeadFilters(rows[0], { model: UNIDENTIFIED_MODEL })).toBe(
      true
    );
    expect(matchesV2LeadFilters(rows[1], { model: UNIDENTIFIED_MODEL })).toBe(
      false
    );
  });

  it("busca a versão bruta e o rótulo canônico, sem canonizar contato", () => {
    const rows = [lead(1, "MG4", "Conforto"), lead(2, "MG4", "whatsapp")];
    const query = (search: string) =>
      aggregateV2Leads(
        rows,
        { dateFrom: "2026-11-01", dateTo: "2026-11-04", search },
        null,
        source,
        now
      ).summary.total;

    expect(query("Conforto")).toBe(1);
    expect(query("Comfort")).toBe(1);
    expect(query("whatsapp")).toBe(1);
    expect(query("Não informada")).toBe(0);
  });

  it("retorna estrutura vazia sem inventar cobertura, modelos ou dias", () => {
    expect(aggregateModelAnalysis([])).toEqual({
      total: 0,
      classified: 0,
      unclassified: 0,
      coveragePercent: null,
      versionsIdentified: 0,
      versionsMissing: 0,
      versionsInvalid: 0,
      models: [],
      daily: [],
      diagnostics: [],
    });
  });
});

describe("diagnóstico por papel", () => {
  it("mantém diagnósticos para administrador e zera-os para cliente/BBRO", () => {
    const data = aggregateV2Leads(
      [lead(1, "Modelo sem de-para", "versão futura")],
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      null,
      source,
      now
    );
    expect(data.modelAnalysis?.diagnostics.length).toBeGreaterThan(0);
    const client = dashboardForClient(data);
    expect(client.modelAnalysis?.diagnostics).toEqual([]);
    expect(client.options.models).toContain(UNIDENTIFIED_MODEL);
  });
});
