import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2OpportunityTable } from "../client/src/components/V2OpportunityTable";
import type { V2Lead } from "../shared/v2Types";

const opportunity: V2Lead = {
  id: 7,
  date: "2026-11-08",
  hour: 0,
  name: "Pessoa de teste com nome completo e sobrenomes longos",
  email: "opportunity@example.test",
  phone: "+55 (85) 90000-0000",
  interestVehicle: "MG 4 XPower — interesse original",
  model: "MG4",
  version: "XPower",
  channel: "Meta",
  campaign: "Campanha de teste",
  dealer: "Iguauto Fortaleza",
  city: "Fortaleza",
  state: "CE",
  crm: "Syonet",
};

function render(
  rows: V2Lead[] = [opportunity],
  clientMode = false,
  locale: "en" | "pt-BR" = "pt-BR"
) {
  return renderToStaticMarkup(
    <V2OpportunityTable rows={rows} clientMode={clientMode} locale={locale} />
  );
}

describe("tabela de oportunidades da aba Leads", () => {
  it("mostra nome completo, e-mail, telefone e interesse sem truncar nomes", () => {
    const html = render();
    for (const label of [
      "Nome completo",
      "E-mail",
      "Telefone",
      "Carro de interesse",
    ])
      expect(html).toContain(label);
    for (const value of [
      opportunity.name,
      opportunity.email!,
      opportunity.phone!,
      opportunity.interestVehicle!,
      opportunity.channel,
      opportunity.dealer,
      "00h",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("truncate");
    expect(html.match(/scope="col"/g)).toHaveLength(10);
    expect(html).toContain("overflow-x-auto");
  });

  it.each(["en", "pt-BR"] as const)(
    "não expõe nome/e-mail/telefone em texto ou atributos de apresentação (%s)",
    locale => {
      const html = render([opportunity], true, locale);
      for (const value of [
        opportunity.name,
        opportunity.email!,
        opportunity.phone!,
      ])
        expect(html).not.toContain(value);
      expect(html).toContain(
        locale === "en"
          ? "Hidden name in client mode"
          : "Nome oculto no modo cliente"
      );
      expect(html).toContain(
        locale === "en"
          ? "Hidden in presentation mode"
          : "Oculto no modo apresentação"
      );
      expect(html).toContain(opportunity.interestVehicle!);
      expect(html).not.toContain("mailto:");
      expect(html).not.toContain("tel:");
    }
  );

  it("não inventa contatos e preserva modelo/versão como fallback do mesmo registro", () => {
    const html = render([
      { ...opportunity, email: null, phone: undefined, interestVehicle: null },
    ]);
    expect(html).toContain("Não informado");
    expect(html).toContain("MG4 · XPower");
    expect(html).not.toContain(opportunity.email!);
    expect(html).not.toContain(opportunity.phone!);
  });

  it("mostra oportunidade e informações não fornecidas em inglês", () => {
    const html = render(
      [
        {
          ...opportunity,
          email: "",
          phone: null,
          interestVehicle: null,
          model: "Não informado",
          version: "Indisponível",
        },
      ],
      false,
      "en"
    );
    for (const label of [
      "Full name",
      "Email",
      "Phone",
      "Vehicle of interest",
      "Lead opportunities",
      "Not provided",
      "00:00",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("Não informado");
    expect(html).not.toContain("Indisponível");
  });

  it("escapa HTML sem inserir scripts ou links a partir dos campos da origem", () => {
    const html = render([
      {
        ...opportunity,
        name: '<script>alert("fixture")</script>',
        email: 'x"><img src=x onerror=alert(1)>',
        phone: "+001234",
        interestVehicle: "<b>MG 4</b>",
      },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>MG 4</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("+001234");
  });

  it.each(["pt-BR", "en"] as const)(
    "cobre vazio com as dez colunas e sem criar linhas (%s)",
    locale => {
      const html = render([], false, locale);
      expect(html).toContain('colSpan="10"');
      expect(html).toContain(
        locale === "en"
          ? "No opportunity found"
          : "Nenhuma oportunidade encontrada"
      );
    }
  );

  it("mantém oportunidades de mesmo nome distintas por seus dados, sem deduplicação de pessoas na UI", () => {
    const html = render([
      opportunity,
      {
        ...opportunity,
        id: 8,
        email: "second@example.test",
        phone: "+550000000002",
      },
    ]);
    expect(html).toContain("second@example.test");
    expect(html).toContain(opportunity.email!);
    expect(html.split(opportunity.name)).toHaveLength(3);
  });
});
