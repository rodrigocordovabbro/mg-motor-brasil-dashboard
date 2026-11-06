import { describe, expect, it } from "vitest";
import {
  OFFICIAL_MODELS,
  groupedModelLabel,
  resolveOfficialModel,
} from "../shared/modelRegistry";
import { aggregateV2Leads, matchesV2LeadFilters } from "./v2Leads";
import type { V2Dashboard, V2Lead } from "../shared/v2Types";

const now = new Date("2026-11-05T15:00:00Z");

const source: V2Dashboard["source"] = {
  name: "Fixture de modelos",
  importedAt: "2026-11-05T12:00:00Z",
  mode: "authenticated-import",
  totalRows: 6,
  invalidDateRows: 0,
};

const lead = (id: number, model: string, dealer: string): V2Lead => ({
  id,
  date: "2026-11-04",
  hour: 10 + id,
  name: `Lead ${id}`,
  model,
  version: `Versão ${id}`,
  channel: id % 2 ? "Meta" : "Google Ads",
  campaign: `Campanha ${id}`,
  dealer,
  city: "São Paulo",
  state: "SP",
  crm: "Não informado",
});

const fixtureLeads: V2Lead[] = [
  lead(1, "MG4", "Dealer MG4"),
  lead(
    2,
    "Formulário - Ago e Set/26 - Urban 2 - 10.09.26 (Model)",
    "Dealer Urban Form"
  ),
  lead(3, "MG4Urban", "Dealer Urban Alias"),
  lead(4, "MGS5", "Dealer S5"),
  lead(5, "Cyberster", "Dealer Cyberster"),
  lead(6, "IM6", "Dealer IM6"),
];

describe("registro oficial de modelos MG", () => {
  it("expõe exatamente os cinco grupos oficiais", () => {
    expect(OFFICIAL_MODELS).toEqual([
      "MG 4",
      "MG Urban",
      "MG S5",
      "MG Cyberster",
      "IM 6",
    ]);
  });

  it("resolve os cinco grupos por aliases, sem inferência por substring", () => {
    const aliases: Record<string, string> = {
      "4": "MG 4",
      MG4: "MG 4",
      XPOWER: "MG 4",
      S5: "MG S5",
      MGS5: "MG S5",
      Cyberster: "MG Cyberster",
      IM6: "IM 6",
      MGIM6: "IM 6",
    };

    for (const [raw, canonical] of Object.entries(aliases)) {
      expect(resolveOfficialModel(raw)).toBe(canonical);
      expect(groupedModelLabel(raw)).toBe(canonical);
    }

    expect(resolveOfficialModel("MG4 e MG S5")).toBeNull();
    expect(groupedModelLabel("MG4 e MG S5")).toBe("MG4 e MG S5");
    expect(resolveOfficialModel("MG4Urbanizado")).toBeNull();
    expect(groupedModelLabel("MG4Urbanizado")).toBe("MG4Urbanizado");
  });

  it("dá precedência ao Urban sobre os aliases parecidos com MG4", () => {
    for (const raw of ["MG4Urban", "4URBAN", "MGRURBAN", "Urban"]) {
      expect(resolveOfficialModel(raw)).toBe("MG Urban");
      expect(resolveOfficialModel(raw)).not.toBe("MG 4");
    }
    expect(resolveOfficialModel("MG4")).toBe("MG 4");
    expect(resolveOfficialModel("m.g.-4")).toBe("MG 4");
  });

  it("resolve os formulários conhecidos de Urban", () => {
    expect(
      resolveOfficialModel(
        "Formulário - Ago e Set/26 - Urban 2 - 10.09.26 (Model)"
      )
    ).toBe("MG Urban");
    expect(
      resolveOfficialModel(
        "Formulário - Ago e Set/26 - Retargeting - URBAN - 11.09.26"
      )
    ).toBe("MG Urban");
  });

  it("normaliza caixa, pontuação e acentos, mantendo labels desconhecidos", () => {
    expect(resolveOfficialModel("  mG- s5  ")).toBe("MG S5");
    expect(resolveOfficialModel("cýberster")).toBe("MG Cyberster");
    expect(resolveOfficialModel("modelo MG4 e MG S5")).toBeNull();
    expect(groupedModelLabel("modelo MG4 e MG S5")).toBe(
      "modelo MG4 e MG S5"
    );
  });
});

describe("integração de modelos na agregação de Leads V2", () => {
  it("agrupa as seis fixtures nos cinco oficiais, sem perder nem alterar os Leads", () => {
    const dashboard = aggregateV2Leads(
      fixtureLeads,
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      null,
      source,
      now
    );

    expect(dashboard.summary.total).toBe(6);
    expect(dashboard.recent.total).toBe(6);
    expect(dashboard.models.reduce((total, item) => total + item.count, 0)).toBe(
      6
    );
    expect(dashboard.summary.models).toBe(5);

    expect(dashboard.models).toEqual(
      expect.arrayContaining(
        OFFICIAL_MODELS.map(label => ({
          label,
          count: label === "MG Urban" ? 2 : 1,
        }))
      )
    );
    expect(new Set(dashboard.options.models)).toEqual(new Set(OFFICIAL_MODELS));

    for (const original of fixtureLeads) {
      expect(dashboard.recent.rows).toContainEqual(original);
    }
  });

  it("filtra MG 4 canônico sem capturar Urban e aceita filtro raw exato", () => {
    const mg4 = fixtureLeads[0];
    const urban = fixtureLeads[2];
    const unresolved = lead(99, "MG4 e MG S5", "Dealer desconhecido");

    expect(matchesV2LeadFilters(mg4, { model: "MG 4" })).toBe(true);
    expect(matchesV2LeadFilters(urban, { model: "MG 4" })).toBe(false);
    expect(matchesV2LeadFilters(urban, { model: "MG Urban" })).toBe(true);
    expect(matchesV2LeadFilters(mg4, { model: "MG4" })).toBe(true);
    expect(matchesV2LeadFilters(urban, { model: "MG4" })).toBe(false);
    expect(
      matchesV2LeadFilters(unresolved, { model: "MG4 e MG S5" })
    ).toBe(true);
    expect(matchesV2LeadFilters(unresolved, { model: "MG 4" })).toBe(false);
  });

  it("consolida o formulário e MG4Urban em MG Urban e busca IM 6 por alias", () => {
    const urbanForm = fixtureLeads[1];
    const urbanAlias = fixtureLeads[2];
    const im6 = fixtureLeads[5];

    expect(groupedModelLabel(urbanForm.model)).toBe("MG Urban");
    expect(groupedModelLabel(urbanAlias.model)).toBe("MG Urban");
    expect(matchesV2LeadFilters(urbanForm, { model: "MG Urban" })).toBe(true);
    expect(matchesV2LeadFilters(urbanAlias, { model: "MG Urban" })).toBe(true);
    expect(matchesV2LeadFilters(im6, { search: "IM 6" })).toBe(true);
  });
});
