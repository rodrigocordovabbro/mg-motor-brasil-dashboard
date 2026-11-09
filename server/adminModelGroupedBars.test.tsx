import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildAdminModelDailySeries,
  DailySeries,
  modelColor,
} from "../client/src/components/V2AdminModelInsights";
import type { AdminModelInsights } from "../shared/adminModelInsights";
import { OFFICIAL_MODELS, UNIDENTIFIED_MODEL } from "../shared/modelRegistry";

const dailyData: Pick<AdminModelInsights, "daily" | "mix"> = {
  daily: [
    {
      date: "2026-11-01",
      total: 6,
      denominator: 6,
      models: {
        "MG 4": 2,
        "MG Urban": 0,
        "MG S5": 3,
        "MG Cyberster": 0,
        "IM 6": 0,
        [UNIDENTIFIED_MODEL]: 1,
      },
      sourceAvailable: true,
    },
    {
      date: "2026-11-02",
      total: 0,
      denominator: 0,
      models: { "MG 4": 0 },
      sourceAvailable: true,
    },
    {
      date: "2026-11-03",
      total: null,
      denominator: null,
      models: {},
      sourceAvailable: false,
    },
  ],
  mix: {
    total: 6,
    denominator: 6,
    models: [
      {
        model: "MG 4",
        count: 2,
        denominator: 6,
        sharePercent: 33.3333,
        identified: true,
      },
      {
        model: "MG Urban",
        count: 0,
        denominator: 6,
        sharePercent: 0,
        identified: true,
      },
      {
        model: "MG S5",
        count: 3,
        denominator: 6,
        sharePercent: 50,
        identified: true,
      },
      {
        model: UNIDENTIFIED_MODEL,
        count: 1,
        denominator: 6,
        sharePercent: 16.6667,
        identified: false,
      },
    ],
    identifiedTotal: 5,
    unidentifiedTotal: 1,
  },
};

describe("gráfico diário administrativo agrupado por modelo", () => {
  it("gera uma série por modelo, reconcilia a soma, preserva zero e marca N/D", () => {
    const allModels = buildAdminModelDailySeries(dailyData, "Todos");

    expect(allModels[0].models.map(point => point.model)).toEqual([
      "MG 4",
      "MG Urban",
      "MG S5",
      "MG Cyberster",
      "IM 6",
      UNIDENTIFIED_MODEL,
    ]);
    expect(
      allModels[0].models.reduce((sum, point) => sum + (point.value ?? 0), 0)
    ).toBe(allModels[0].total);
    expect(allModels[0].models.map(point => point.value)).toEqual([
      2, 0, 3, 0, 0, 1,
    ]);
    expect(allModels[1].models.map(point => point.value)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(allModels[2].models.map(point => point.value)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("exibe somente o modelo selecionado sem preencher sua ausência com barra", () => {
    const selected = buildAdminModelDailySeries(dailyData, "MG S5");

    expect(selected.map(day => day.models)).toEqual([
      [{ model: "MG S5", value: 3 }],
      [{ model: "MG S5", value: 0 }],
      [{ model: "MG S5", value: null }],
    ]);
  });

  it("renderiza barras lado a lado, legenda completa e cores canônicas distintas", () => {
    const html = renderToStaticMarkup(
      <DailySeries
        data={dailyData as AdminModelInsights}
        selectedModel="Todos"
      />
    );
    const colors = [...OFFICIAL_MODELS, UNIDENTIFIED_MODEL].map(modelColor);

    expect(new Set(colors).size).toBe(6);
    expect(html).toContain("Série diária de Leads agrupada por modelo");
    expect(html).toContain("Legenda de cores por modelo");
    expect(html).toContain("Total: 6");
    expect(html).toContain('data-value="0"');
    expect(html).toContain('data-value="N/D"');
    for (const model of [...OFFICIAL_MODELS, UNIDENTIFIED_MODEL]) {
      expect(html).toContain(
        `data-testid="admin-model-insights-legend-${model}"`
      );
      expect(html).toContain(`data-model="${model}"`);
    }
    for (const color of colors) expect(html).toContain(color);

    const selectedHtml = renderToStaticMarkup(
      <DailySeries
        data={dailyData as AdminModelInsights}
        selectedModel="MG S5"
      />
    );
    expect(selectedHtml).toContain("Leads por dia · MG S5");
    expect(selectedHtml).toContain(
      'data-testid="admin-model-insights-legend-MG S5"'
    );
    expect(selectedHtml).not.toContain(
      'data-testid="admin-model-insights-legend-MG 4"'
    );
  });
});
