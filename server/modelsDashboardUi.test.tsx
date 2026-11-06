import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import V2ModelsDashboard from "../client/src/components/V2ModelsDashboard";
import type { ModelAnalysis, ModelDetail } from "../shared/modelAnalysis";
import { UNIDENTIFIED_MODEL } from "../shared/modelRegistry";

function detail(
  model: string,
  leads: number,
  versions: ModelDetail["versions"],
  channels: ModelDetail["channels"],
  states: ModelDetail["states"],
  dealers: ModelDetail["dealers"]
): ModelDetail {
  return {
    model,
    leads,
    sharePercent: leads * 10,
    versionsIdentified: versions
      .filter(item => item.status === "IDENTIFIED")
      .reduce((sum, item) => sum + item.count, 0),
    versionsMissing: versions
      .filter(item => item.status === "MISSING")
      .reduce((sum, item) => sum + item.count, 0),
    versionsInvalid: versions
      .filter(item => item.status === "INVALID")
      .reduce((sum, item) => sum + item.count, 0),
    versions,
    channels,
    states,
    dealers,
  };
}

const fixture: ModelAnalysis = {
  total: 10,
  classified: 9,
  unclassified: 1,
  coveragePercent: 90,
  versionsIdentified: 5,
  versionsMissing: 3,
  versionsInvalid: 2,
  models: [
    detail(
      "MG 4",
      3,
      [
        { label: "Comfort", count: 1, status: "IDENTIFIED" },
        { label: "Luxury", count: 1, status: "IDENTIFIED" },
        { label: "XPOWER", count: 1, status: "IDENTIFIED" },
      ],
      [
        { label: "Meta", count: 2 },
        { label: "Site", count: 1 },
      ],
      [{ label: "SP", count: 3 }],
      [{ label: "São Paulo", count: 3 }]
    ),
    detail(
      "MG Urban",
      2,
      [
        { label: "", count: 1, status: "MISSING" },
        { label: "whatsapp", count: 1, status: "INVALID" },
      ],
      [{ label: "Meta", count: 2 }],
      [{ label: "RJ", count: 2 }],
      [{ label: "Rio", count: 2 }]
    ),
    detail(
      "MG S5",
      1,
      [{ label: "AWD77kWh", count: 1, status: "IDENTIFIED" }],
      [{ label: "Site", count: 1 }],
      [{ label: "MG", count: 1 }],
      [{ label: "Belo Horizonte", count: 1 }]
    ),
    detail(
      "MG Cyberster",
      1,
      [{ label: "", count: 1, status: "MISSING" }],
      [{ label: "Meta", count: 1 }],
      [{ label: "PR", count: 1 }],
      [{ label: "Curitiba", count: 1 }]
    ),
    detail(
      "IM 6",
      2,
      [
        { label: "email", count: 1, status: "INVALID" },
        { label: "AWD77kWh", count: 1, status: "IDENTIFIED" },
      ],
      [{ label: "Site", count: 2 }],
      [{ label: "SC", count: 2 }],
      [{ label: "Florianópolis", count: 2 }]
    ),
    detail(
      UNIDENTIFIED_MODEL,
      1,
      [{ label: "Não informado", count: 1, status: "MISSING" }],
      [{ label: "Site", count: 1 }],
      [{ label: "BA", count: 1 }],
      [{ label: "Salvador", count: 1 }]
    ),
  ],
  daily: [],
  diagnostics: [
    {
      originalModel: "MG4",
      originalVersion: "whatsapp",
      model: "MG 4",
      version: "whatsapp",
      versionStatus: "INVALID",
      reason: "valor de contato não é versão",
      count: 1,
    },
  ],
};

describe("dashboard isolado de modelos", () => {
  it("é honesto quando não recebe análise ou recebe zero leads", () => {
    const withoutData = renderToStaticMarkup(<V2ModelsDashboard />);
    const withZero = renderToStaticMarkup(
      <V2ModelsDashboard analysis={{ ...fixture, total: 0, models: [] }} />
    );

    for (const html of [withoutData, withZero]) {
      expect(html).toContain("Análise de modelos indisponível");
      expect(html).toContain("não cria catálogo, versões ou números");
      expect(html).not.toContain("models-local-filter");
    }
  });

  it("renderiza os cinco modelos, a categoria não identificada e status de versão reais", () => {
    const html = renderToStaticMarkup(<V2ModelsDashboard analysis={fixture} />);

    expect(html).toContain('data-testid="models-dashboard"');
    expect(html).toContain("10 leads analisados");
    expect(html).toContain("9");
    expect(html).toContain("90,0%");
    expect(html).toContain(UNIDENTIFIED_MODEL);
    expect(html).toContain("MG 4");
    expect(html).toContain("MG Urban");
    expect(html).toContain("MG S5");
    expect(html).toContain("MG Cyberster");
    expect(html).toContain("IM 6");
    expect(html).toContain("Comfort");
    expect(html).toContain("Luxury");
    expect(html).toContain("XPOWER");
    expect(html).toContain("AWD77kWh");
    expect(html).toContain("Não informada");
    expect(html).toContain("Valor não é versão");
    expect(html).not.toContain("whatsapp");
    expect(html).toContain("Matriz modelo × versão");
    expect(html).toContain("não altera os filtros globais");
    expect((html.match(/data-testid="models-summary-/g) || []).length).toBe(4);
  });

  it("expõe diagnósticos somente no modo de gestão e sem campos de contato", () => {
    const clientHtml = renderToStaticMarkup(
      <V2ModelsDashboard analysis={fixture} />
    );
    const managerHtml = renderToStaticMarkup(
      <V2ModelsDashboard analysis={fixture} canManage />
    );

    expect(clientHtml).not.toContain("models-diagnostics");
    expect(managerHtml).toContain("models-diagnostics");
    expect(managerHtml).toContain("Diagnósticos técnicos de origem");
    expect(managerHtml).toContain("Modelo original");
    expect(managerHtml).toContain("Versão original");
    expect(managerHtml).toContain("Motivo");
    expect(managerHtml).toContain("Nenhum contato é incluído");
    expect(managerHtml).toContain("valor de contato não é versão");
  });
});
