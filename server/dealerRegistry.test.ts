import { describe, expect, it } from "vitest";
import {
  OFFICIAL_DEALERS,
  resolveOfficialDealer,
  resolveCommercialDealers,
} from "../shared/dealerRegistry";
import { aggregateV2Leads, matchesV2LeadFilters } from "./v2Leads";
import type { V2Lead } from "../shared/v2Types";
const lead = (dealer: string, id = 1): V2Lead => ({
  id,
  date: "2026-11-02",
  hour: 10,
  name: "Teste isolado",
  model: "MG4",
  version: "-",
  channel: "Google Ads",
  campaign: "Teste",
  dealer,
  city: "São Paulo",
  state: "SP",
  crm: "-",
});

describe("Cadastro oficial MG Sales e fonte original preservada", () => {
  it("tem41unidades distintas e mantém Indianópolis separada de Europa", () => {
    expect(OFFICIAL_DEALERS).toHaveLength(41);
    expect(new Set(OFFICIAL_DEALERS.map(x => x.name)).size).toBe(41);
    expect(resolveOfficialDealer("SINAL AV INDIANOPOLIS")).toBe(
      "Sinal Av. Indianópolis"
    );
    expect(resolveCommercialDealers("SINAL AV INDIANOPOLIS")).toEqual([
      "Sinal Av. Indianópolis",
    ]);
  });
  it("resolve pontuação, acento, cadastro e apelidos de uma unidade sem usar UF residencial", () => {
    expect(resolveOfficialDealer("barigui mandarim - florianópolis/sc")).toBe(
      "Barigui Florianópolis"
    );
    expect(resolveOfficialDealer("Stefanini Campinas - 3964540")).toBe(
      "Stefanini Campinas"
    );
    expect(resolveOfficialDealer("savol zl - são paulo/sp")).toBe(
      "Savol - Shopping Anália Franco"
    );
    expect(resolveOfficialDealer("TECAR - SIA BRASILIA")).toBe(
      "Tecar SIA Brasília"
    );
  });
  it("não decide a unidade de um grupo a partir de um nome genérico", () => {
    expect(resolveOfficialDealer("JAVEP BAURU")).toBeNull();
    expect(resolveOfficialDealer("La Fontaine Joinville")).toBeNull();
    expect(resolveOfficialDealer("Bastazini Manaus")).toBeNull();
    expect(resolveOfficialDealer("São Caetano")).toBeNull();
  });
  it("preserva as duas metas de Leads SAVOL e BALTIC como individuais", () => {
    expect(resolveCommercialDealers("SAVOL/SP")).toEqual([
      "Savol São Caetano do Sul",
    ]);
    expect(resolveCommercialDealers("SAVOL ZL/SP")).toEqual([
      "Savol - Shopping Anália Franco",
    ]);
    expect(resolveCommercialDealers("BALTIC/SP")).toEqual([
      "Baltic Alphaville",
    ]);
    expect(resolveCommercialDealers("BALTIC GUA/SP")).toEqual([
      "Baltic Guarulhos - Shopping Maia",
    ]);
  });
  it("representa uma meta coletiva como duas unidades, não como uma alocação falsa", () => {
    expect(resolveCommercialDealers("BALTIC BARUERI/GUARULHOS")).toEqual([
      "Baltic Alphaville",
      "Baltic Guarulhos - Shopping Maia",
    ]);
    expect(resolveCommercialDealers("SAVOL SÃO CAETANO/ANÁLIA")).toHaveLength(
      2
    );
    expect(resolveCommercialDealers("HG/SE")).toHaveLength(2);
  });
  it("consolida apenas na distribuição e conserva cada Lead e seu nome original", () => {
    const original = [
      lead("Barigui — Curitiba/PR"),
      lead("BARIGUI - CURITIBA", 2),
      lead("Dealer fora da lista", 3),
    ];
    const data = aggregateV2Leads(
      original,
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      100,
      {
        name: "Fixture",
        importedAt: "2026-11-04T12:00:00Z",
        mode: "authenticated-import",
        totalRows: 3,
        invalidDateRows: 0,
      },
      new Date("2026-11-05T15:00:00Z")
    );
    expect(data.summary.total).toBe(3);
    expect(data.dealers).toContainEqual({
      label: "Barigui Curitiba",
      count: 2,
    });
    expect(
      data.dealerPerformance.rows.find(x => x.dealer === "Barigui Curitiba")
        ?.state
    ).toBe("PR");
    expect(data.options.dealers).toContain("Autobel Campo Grande (EM BREVE)");
    expect(data.recent.rows.find(x => x.id === 1)?.dealer).toBe(
      "Barigui — Curitiba/PR"
    );
    expect(
      matchesV2LeadFilters(original[0], { dealer: "Barigui Curitiba" })
    ).toBe(true);
    expect(
      matchesV2LeadFilters(original[0], { dealer: "Barigui Florianópolis" })
    ).toBe(false);
  });
});
