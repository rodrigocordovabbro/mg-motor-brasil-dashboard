import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import V2HistoricalLeadPaceCard from "../client/src/components/V2HistoricalLeadPaceCard";
import type {
  HistoricalLeadPace,
  HistoricalLeadPaceScenario,
} from "../shared/historicalLeadPace";

const readyScenario = (
  overrides: Partial<HistoricalLeadPaceScenario> = {}
): HistoricalLeadPaceScenario => ({
  key: "last3Months",
  label: "Média dos últimos 3 meses",
  status: "READY",
  referenceMonths: ["2026-08", "2026-09", "2026-10"],
  expectedShare: 0.245,
  expectedToDate: 4060,
  gapToDate: 8,
  gapPercent: 0.2,
  projection: 16520,
  projectedDifference: -80,
  paceStatus: "BEHIND",
  points: [
    { date: "2026-11-01", day: 1, real: 0, plan: 180, projection: null },
    { date: "2026-11-08", day: 8, real: 4068, plan: 4060, projection: 16520 },
    { date: "2026-11-09", day: 9, real: null, plan: 4700, projection: 16580 },
    { date: "2026-11-30", day: 30, real: null, plan: 16600, projection: 16520 },
  ],
  warnings: [],
  ...overrides,
});

const base: HistoricalLeadPace = {
  competence: "2026-11",
  asOfDate: "2026-11-08",
  lastAvailableDate: "2026-11-08",
  daysInMonth: 30,
  current: 0,
  goal: 16600,
  scope: "GLOBAL",
  reference: [
    {
      competence: "2026-08",
      total: 14437,
      available: true,
      reason: null,
      cumulative: [480, 14437],
    },
    {
      competence: "2026-09",
      total: 9935,
      available: true,
      reason: null,
      cumulative: [330, 9935],
    },
    {
      competence: "2026-10",
      total: 10737,
      available: true,
      reason: null,
      cumulative: [360, 10737],
    },
  ],
  lastMonth: readyScenario({
    key: "lastMonth",
    label: "Último mês",
    referenceMonths: ["2026-10"],
  }),
  last3Months: readyScenario(),
};

const html = (data: HistoricalLeadPace = base) =>
  renderToStaticMarkup(
    <V2HistoricalLeadPaceCard
      data={data}
      actions={<button>Atualizar base</button>}
    />
  );

describe("V2HistoricalLeadPaceCard", () => {
  it("mostra o contrato pronto, janela padrão de 3 meses e ações do cabeçalho", () => {
    const markup = html({ ...base, current: 4068 });
    expect(markup).toContain('data-testid="historical-lead-pace-card"');
    expect(markup).toContain("Leads Plan — ritmo e projeção");
    expect(markup).toContain("Atualizar base");
    expect(markup).toContain("Últimos 3 meses");
    expect(markup).toContain("Último mês");
    expect(markup).toContain("4.068");
    expect(markup).toContain("16.600");
    expect(markup).toContain("08/11/2026");
    expect(markup).toContain("Plano");
    expect(markup).toContain("Real");
    expect(markup).toContain("Projeção");
    expect(markup).toContain("Corte da fonte");
    expect(markup).toContain("Método:");
  });

  it("preserva zero real, nulos futuros e tabela de auditoria sem transformar nulo em zero", () => {
    const markup = html();
    expect(markup).toContain('aria-label="Atingimento da meta de Leads"');
    expect(markup).toContain("Leads realizados no mês");
    expect(markup).toMatch(/Leads realizados no mês[\s\S]*?>0</);
    expect(markup).toContain("Tabela diária para auditoria");
    expect(markup).toContain("—");
    expect(markup).not.toContain("realizado 0 no futuro");
  });

  it("exibe aviso forte e não inventa certeza quando o histórico não está pronto", () => {
    const noHistory = readyScenario({
      status: "NO_HISTORY",
      referenceMonths: [],
      points: [
        {
          date: "2026-11-08",
          day: 8,
          real: 4068,
          plan: null,
          projection: null,
        },
      ],
      projection: null,
      projectedDifference: null,
      paceStatus: "UNAVAILABLE",
      warnings: ["Histórico insuficiente para comparação."],
    });
    const markup = html({ ...base, last3Months: noHistory });
    expect(markup).toContain("Sem histórico comparável");
    expect(markup).toContain("Histórico insuficiente para comparação.");
    expect(markup).toContain("Projeção de fechamento");
    expect(markup).toContain("N/D");
    expect(markup).not.toContain("Últimos 3 meses (3 disponíveis)");
  });

  it("mostra atraso da fonte e mantém séries reais sem fallback linear", () => {
    const lagging = readyScenario({
      status: "SOURCE_LAG",
      warnings: ["A fonte histórica está atrasada."],
      points: [
        {
          date: "2026-11-08",
          day: 8,
          real: 4068,
          plan: 4060,
          projection: null,
        },
      ],
      projection: null,
    });
    const markup = html({
      ...base,
      last3Months: lagging,
      lastAvailableDate: "2026-11-04",
    });
    expect(markup).toContain("Fonte atrasada");
    expect(markup).toContain("A fonte histórica está atrasada.");
    expect(markup).toContain("N/D");
    expect(markup).toContain("Corte da fonte");
  });

  it("explica meta global fora de recorte filtrado e não oferece progresso comparável", () => {
    const markup = html({ ...base, scope: "FILTERED", current: 4068 });
    expect(markup).toContain("Meta global; não aplicável ao recorte");
    expect(markup).toContain(
      "a meta global não é comparada a este subconjunto"
    );
    expect(markup).toContain("Sem comparação global");
    expect(markup).not.toContain('aria-label="Atingimento da meta de Leads"');
  });

  it("mantém forecast válido quando a meta é nula e exibe status das referências", () => {
    const markup = html({
      ...base,
      goal: null,
      last3Months: readyScenario({ paceStatus: "NO_GOAL", projection: 12000 }),
      reference: [
        {
          competence: "2026-10",
          total: null,
          available: false,
          reason: "Sem volume",
          cumulative: [],
        },
      ],
    });
    expect(markup).toContain("Meta mensal");
    expect(markup).toContain("Sem meta global cadastrada");
    expect(markup).toContain("12.000");
    expect(markup).toContain("Sem volume");
    expect(markup).toContain("N/D");
    expect(markup).not.toContain("Meta 16.600");
  });

  it("mostra 19,5% para diferença fracionária 0,195 e destaca pace negativo", () => {
    const positive = html({
      ...base,
      current: 4068,
      last3Months: readyScenario({ gapPercent: 0.195, paceStatus: "AHEAD" }),
    });
    expect(positive).toContain("+19,5%");
    expect(positive).toContain("À frente");
    const negative = html({
      ...base,
      last3Months: readyScenario({ gapPercent: -0.2, paceStatus: "BEHIND" }),
    });
    expect(negative).toContain("−20,0%");
    expect(negative).toContain("border-red-200");
  });
});
