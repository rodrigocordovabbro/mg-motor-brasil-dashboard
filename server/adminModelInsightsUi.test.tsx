import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import V2AdminModelInsights from "../client/src/components/V2AdminModelInsights";
import type {
  AdminModelInsights,
  AdminModelMatrix,
} from "../shared/adminModelInsights";
import type { ModelAnalysis } from "../shared/modelAnalysis";

function modelAnalysis(): ModelAnalysis {
  return {
    total: 4,
    classified: 3,
    unclassified: 1,
    coveragePercent: 75,
    versionsIdentified: 2,
    versionsMissing: 1,
    versionsInvalid: 1,
    models: [
      {
        model: "MG 4",
        leads: 3,
        sharePercent: 75,
        versionsIdentified: 2,
        versionsMissing: 1,
        versionsInvalid: 0,
        versions: [
          { label: "Comfort", count: 2, status: "IDENTIFIED" },
          { label: "", count: 1, status: "MISSING" },
        ],
        channels: [{ label: "Meta", count: 2 }],
        states: [{ label: "São Paulo", count: 3 }],
        dealers: [{ label: "Dealer Norte", count: 3 }],
      },
      {
        model: "MG S5",
        leads: 1,
        sharePercent: 25,
        versionsIdentified: 0,
        versionsMissing: 0,
        versionsInvalid: 1,
        versions: [{ label: "", count: 1, status: "INVALID" }],
        channels: [{ label: "Site", count: 1 }],
        states: [{ label: "Rio de Janeiro", count: 1 }],
        dealers: [{ label: "Dealer Sul", count: 1 }],
      },
      {
        model: "Modelo não identificado",
        leads: 0,
        sharePercent: 0,
        versionsIdentified: 0,
        versionsMissing: 0,
        versionsInvalid: 0,
        versions: [],
        channels: [],
        states: [],
        dealers: [],
      },
    ],
    daily: [],
    diagnostics: [],
  };
}

function matrix(dimension: AdminModelMatrix["dimension"]): AdminModelMatrix {
  const category =
    dimension === "state"
      ? "São Paulo"
      : dimension === "channel"
        ? "Meta"
        : dimension === "dealer"
          ? "Dealer Norte"
          : "Campanha principal";
  return {
    dimension,
    total: 4,
    denominator: 4,
    categories: [
      {
        label: category,
        count: 3,
        denominator: 4,
        sharePercent: 75,
        identified: true,
      },
      {
        label:
          dimension === "state" ? "Estado não identificado" : "Não informado",
        count: 1,
        denominator: 4,
        sharePercent: 25,
        identified: false,
      },
    ],
    rows: [
      {
        model: "MG 4",
        count: 3,
        denominator: 4,
        identified: true,
        cells: [
          {
            category,
            model: "MG 4",
            count: 2,
            categoryDenominator: 3,
            modelDenominator: 3,
            shareOfCategoryPercent: 66.6667,
            shareOfModelPercent: 66.6667,
          },
          {
            category:
              dimension === "state"
                ? "Estado não identificado"
                : "Não informado",
            model: "MG 4",
            count: 1,
            categoryDenominator: 1,
            modelDenominator: 3,
            shareOfCategoryPercent: 100,
            shareOfModelPercent: 33.3333,
          },
        ],
      },
      {
        model: "MG S5",
        count: 1,
        denominator: 4,
        identified: true,
        cells: [
          {
            category,
            model: "MG S5",
            count: 1,
            categoryDenominator: 3,
            modelDenominator: 1,
            shareOfCategoryPercent: 33.3333,
            shareOfModelPercent: 100,
          },
          {
            category:
              dimension === "state"
                ? "Estado não identificado"
                : "Não informado",
            model: "MG S5",
            count: 0,
            categoryDenominator: 1,
            modelDenominator: 1,
            shareOfCategoryPercent: 0,
            shareOfModelPercent: 0,
          },
        ],
      },
    ],
  };
}

function fixture(
  overrides: Partial<AdminModelInsights> = {}
): AdminModelInsights {
  return {
    status: "READY",
    audience: "admin",
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-05",
      cutoffDate: "2026-11-05",
      days: 5,
      filters: {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        channel: "Meta",
      },
    },
    source: {
      name: "LEADS MG — Base",
      importedAt: "2026-11-05T12:00:00Z",
      mode: "authenticated-import",
      totalRows: 100,
      invalidDateRows: 0,
      earliestLeadDate: "2026-10-01",
      latestLeadDate: "2026-11-04",
      currentCoverage: "PARTIAL",
      previousCoverage: "COVERED",
    },
    total: 4,
    mix: {
      total: 4,
      denominator: 4,
      models: [
        {
          model: "MG 4",
          count: 3,
          denominator: 4,
          sharePercent: 75,
          identified: true,
        },
        {
          model: "MG S5",
          count: 1,
          denominator: 4,
          sharePercent: 25,
          identified: true,
        },
      ],
      identifiedTotal: 4,
      unidentifiedTotal: 0,
    },
    modelAnalysis: modelAnalysis(),
    matrices: {
      state: matrix("state"),
      channel: matrix("channel"),
      dealer: matrix("dealer"),
      campaign: matrix("campaign"),
    },
    daily: [
      {
        date: "2026-11-04",
        total: 2,
        denominator: 2,
        models: { "MG 4": 2 },
        sourceAvailable: true,
      },
      {
        date: "2026-11-05",
        total: null,
        denominator: null,
        models: {},
        sourceAvailable: false,
      },
    ],
    comparison: {
      status: "AVAILABLE",
      currentPeriod: { dateFrom: "2026-11-01", dateTo: "2026-11-05", days: 5 },
      previousPeriod: { dateFrom: "2026-10-27", dateTo: "2026-10-31", days: 5 },
      rows: [
        {
          model: "MG 4",
          identified: true,
          currentCount: 3,
          currentDenominator: 4,
          currentSharePercent: 75,
          previousCount: 2,
          previousDenominator: 3,
          previousSharePercent: 66.6667,
          deltaCount: 1,
          deltaSharePP: 8.3333,
        },
      ],
      note: "Comparação calculada com a janela anterior de mesmo número de dias e os mesmos filtros dimensionais.",
    },
    opportunities: [
      {
        dimension: "channel",
        group: "Meta",
        model: "MG 4",
        groupCount: 40,
        groupDenominator: 40,
        modelCount: 36,
        actualSharePercent: 90,
        expectedSharePercent: 75,
        expectedCount: 30,
        gapPP: 15,
        estimatedVolumeDifference: 6,
        sampleThreshold: 30,
      },
    ],
    quality: {
      lowSampleThreshold: 30,
      unknownModelCount: 0,
      missingStateCount: 1,
      missingDealerCount: 1,
      missingCampaignCount: 1,
      versionsMissing: 1,
      versionsInvalid: 1,
      versionByModel: [
        {
          model: "MG 4",
          denominator: 3,
          identified: 2,
          missing: 1,
          invalid: 0,
          missingOrInvalidSharePercent: 33.3333,
        },
      ],
      gaps: [
        {
          dimension: "state",
          code: "MISSING",
          label: "Estado não identificado",
          model: "MG 4",
          count: 1,
          denominator: 4,
          sharePercent: 25,
          commercialEligible: false,
        },
      ],
    },
    insights: [
      {
        kind: "CONCENTRATION",
        priority: 68,
        dimension: "channel",
        model: "MG 4",
        group: "Meta",
        count: 3,
        sharePercent: 100,
        title: "Concentração de MG 4 em channel",
        detail: "3 de 3 Leads de MG 4 estão em Meta (100,0%).",
      },
      {
        kind: "LOW_SAMPLE",
        priority: 95,
        dimension: "model",
        count: 4,
        sharePercent: 100,
        title: "Baixa amostra do recorte",
        detail:
          "O recorte tem 4 Leads; leituras de mix devem ser tratadas como indicativas abaixo de 30.",
      },
    ],
    limits: {
      maxInsights: 50,
      insightsTruncated: false,
      maxOpportunities: 100,
      opportunitiesTruncated: false,
      matricesTruncated: false,
    },
    notes: [
      "Análise exclusiva do Administrador operacional; usa a população integral filtrada antes da paginação da tabela.",
      "Os benchmarks de mix são participação descritiva do mesmo recorte, não são metas, vendas, conversão, CPL nem prova de envio CRM.",
    ],
    ...overrides,
  };
}

describe("UI da análise administrativa por modelo", () => {
  it("renderiza seletor local, KPIs, matrizes completas, legenda de denominadores e gaps agregados", () => {
    const html = renderToStaticMarkup(
      <V2AdminModelInsights data={fixture()} />
    );

    expect(html).toContain('data-testid="admin-model-insights"');
    expect(html).toContain('data-testid="admin-model-insights-local-filter"');
    expect(html).toContain('<option value="Todos" selected="">Todos</option>');
    expect(html).toContain('<option value="MG 4">MG 4</option>');
    expect(html).toContain('data-testid="admin-model-insights-kpi-identified"');
    expect(html).toContain("Modelos identificados");
    expect(html).toContain("Modelo × Estado");
    expect(html).toContain("Modelo × Canal");
    expect(html).toContain("Modelo × Dealer");
    expect(html).toContain("Modelo × Campanha");
    expect(html).toContain("share do grupo");
    expect(html).toContain("denominador global");
    expect(html).toContain("Oportunidades de mix");
    expect(html).toContain("Sugestão verificável");
    expect(html).toContain("não são metas, vendas, conversão, CPL");
    expect(html).toContain("Modelos, versões e diagnóstico sanitizado");
  });

  it("preserva N/D para dia sem cobertura e não inventa zero futuro", () => {
    const html = renderToStaticMarkup(
      <V2AdminModelInsights data={fixture()} />
    );
    const futureIndex = html.indexOf(
      'data-testid="admin-model-insights-day-2026-11-05"'
    );
    expect(futureIndex).toBeGreaterThan(-1);
    expect(html.slice(futureIndex, futureIndex + 600)).toContain("N/D");
    expect(html.slice(futureIndex, futureIndex + 600)).not.toContain(
      "05/11/2026: 0 Leads"
    );
  });

  it("mantém estados de carregamento, erro, fonte desconhecida e recorte vazio explícitos", () => {
    expect(renderToStaticMarkup(<V2AdminModelInsights loading />)).toContain(
      "Carregando análise por modelo"
    );
    expect(
      renderToStaticMarkup(
        <V2AdminModelInsights error="Falha segura" onRetry={() => undefined} />
      )
    ).toContain("Falha segura");

    const notConfigured = fixture({
      status: "NOT_CONFIGURED",
      total: 0,
      source: {
        ...fixture().source,
        name: null,
        importedAt: null,
        totalRows: null,
        invalidDateRows: null,
        earliestLeadDate: null,
        latestLeadDate: null,
        currentCoverage: "NOT_CONFIGURED",
        previousCoverage: "NOT_CONFIGURED",
      },
    });
    expect(
      renderToStaticMarkup(<V2AdminModelInsights data={notConfigured} />)
    ).toContain("Fonte não configurada");

    const empty = fixture({
      total: 0,
      mix: {
        ...fixture().mix,
        total: 0,
        denominator: 0,
        models: [],
        identifiedTotal: 0,
        unidentifiedTotal: 0,
      },
    });
    expect(
      renderToStaticMarkup(<V2AdminModelInsights data={empty} />)
    ).toContain("Nenhum Lead no recorte");
  });

  it("não expõe contatos, IDs ou linhas individuais no detalhamento administrativo", () => {
    const html = renderToStaticMarkup(
      <V2AdminModelInsights data={fixture()} />
    );
    expect(html).not.toContain("@example");
    expect(html).not.toContain("99999");
    expect(html).not.toContain("Fixture");
    expect(html).toContain("Nenhuma linha individual, contato ou credencial");
  });
  it("apresenta fonte não configurada do painel sem payload analítico ou zeros", () => {
    const html = renderToStaticMarkup(
      <V2AdminModelInsights sourceStatus="NOT_CONFIGURED" />
    );
    expect(html).toContain("Fonte não configurada");
    expect(html).toContain("permanecem N/D");
    expect(html).toContain("D-1");
    expect(html).not.toContain("Total de Leads</");
  });
});
