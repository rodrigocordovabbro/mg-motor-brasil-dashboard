import { describe, expect, it, vi } from "vitest";
import type {
  HistoricalLeadPace,
  HistoricalLeadPacePoint,
  HistoricalLeadPaceScenario,
} from "../shared/historicalLeadPace";

const reactMocks = vi.hoisted(() => {
  const useMemo = vi.fn((factory: () => unknown) => factory());
  const useState = vi.fn(
    (initial: unknown) =>
      [
        typeof initial === "function" ? (initial as () => unknown)() : initial,
        vi.fn(),
      ] as const
  );
  return { useMemo, useState };
});

const rechartsMocks = vi.hoisted(() => {
  const stub = (displayName: string) => {
    const Component = () => null;
    Component.displayName = displayName;
    return Component;
  };
  return {
    Bar: stub("Bar"),
    CartesianGrid: stub("CartesianGrid"),
    ComposedChart: stub("ComposedChart"),
    LabelList: stub("LabelList"),
    Line: stub("Line"),
    ReferenceLine: stub("ReferenceLine"),
    ResponsiveContainer: stub("ResponsiveContainer"),
    Tooltip: stub("Tooltip"),
    XAxis: stub("XAxis"),
    YAxis: stub("YAxis"),
  };
});

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: reactMocks.useMemo,
    useState: reactMocks.useState,
  };
});

vi.mock("recharts", () => rechartsMocks);

import { Bar, LabelList, Line, Tooltip } from "recharts";
import V2HistoricalLeadPaceCard, {
  buildHistoricalPaceChartRows,
} from "../client/src/components/V2HistoricalLeadPaceCard";

/** Synthetic-only fixtures: this test never reads the application database. */
const basePoints = (
  futureReal: number | null = null
): HistoricalLeadPacePoint[] => [
  { date: "2026-11-01", day: 1, real: 0, plan: 1, projection: null },
  { date: "2026-11-02", day: 2, real: 2, plan: 2, projection: null },
  { date: "2026-11-03", day: 3, real: 3, plan: 4, projection: 3 },
  { date: "2026-11-04", day: 4, real: futureReal, plan: 5, projection: 6 },
];

const scenarioFor = (
  points: HistoricalLeadPacePoint[],
  overrides: Partial<HistoricalLeadPaceScenario> = {}
): HistoricalLeadPaceScenario => ({
  key: "last3Months",
  label: "Média sintética dos últimos 3 meses",
  status: "READY",
  referenceMonths: ["2026-08", "2026-09", "2026-10"],
  expectedShare: 0.4,
  expectedToDate: 4,
  gapToDate: -1,
  gapPercent: -0.2,
  projection: 6,
  projectedDifference: -4,
  paceStatus: "BEHIND",
  points,
  warnings: [],
  ...overrides,
});

const fixture = (
  options: {
    lastAvailableDate?: string | null;
    futureReal?: number | null;
    planDay2?: number | null;
    asOfDate?: string;
  } = {}
): HistoricalLeadPace => {
  const points = basePoints(options.futureReal);
  if (options.planDay2 !== undefined)
    points[1] = { ...points[1], plan: options.planDay2 };
  const last3Months = scenarioFor(points);
  const lastMonth = scenarioFor(
    points.map(point => ({ ...point })),
    {
      key: "lastMonth",
      label: "Último mês sintético",
      referenceMonths: ["2026-10"],
    }
  );
  return {
    competence: "2026-11",
    asOfDate: options.asOfDate ?? "2026-11-03",
    lastAvailableDate:
      options.lastAvailableDate === undefined
        ? "2026-11-03"
        : options.lastAvailableDate,
    daysInMonth: 31,
    current: 3,
    goal: 10,
    scope: "GLOBAL",
    reference: [
      {
        competence: "2026-10",
        total: 10,
        available: true,
        reason: null,
        cumulative: [1, 2, 3, 4],
      },
    ],
    lastMonth,
    last3Months,
  };
};

type TreeNode = {
  type?: unknown;
  props?: Record<string, unknown>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function walkTree(tree: unknown, visit: (node: TreeNode) => void) {
  if (Array.isArray(tree)) {
    tree.forEach(child => walkTree(child, visit));
    return;
  }
  if (!isObject(tree)) return;
  if ("type" in tree || "props" in tree) visit(tree as TreeNode);
  const props = isObject(tree.props) ? tree.props : null;
  if (props && "children" in props) walkTree(props.children, visit);
}

function findByType(tree: unknown, type: unknown): TreeNode[] {
  const matches: TreeNode[] = [];
  walkTree(tree, node => {
    if (node.type === type) matches.push(node);
  });
  return matches;
}

function findNodes(
  tree: unknown,
  predicate: (node: TreeNode) => boolean
): TreeNode[] {
  const matches: TreeNode[] = [];
  walkTree(tree, node => {
    if (predicate(node)) matches.push(node);
  });
  return matches;
}

function textContent(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!isObject(tree)) return "";
  const props = isObject(tree.props) ? tree.props : null;
  return props && "children" in props ? textContent(props.children) : "";
}

function renderCard(
  data: HistoricalLeadPace,
  locale: "pt-BR" | "en" = "pt-BR"
) {
  return V2HistoricalLeadPaceCard({ data, locale });
}

describe("V2HistoricalLeadPaceCard: barra real e séries acumuladas", () => {
  it("renderiza a barra Realizado, LabelList e linhas nomeadas no mesmo eixo", () => {
    reactMocks.useState.mockClear();
    const tree = renderCard(fixture());
    const bars = findByType(tree, Bar);
    const lines = findByType(tree, Line);
    const realBar = bars.find(node => node.props?.dataKey === "real");

    expect(reactMocks.useState.mock.calls.map(call => call[0])).toEqual([
      "last3Months",
      false,
    ]);
    expect(realBar).toBeDefined();
    expect(realBar?.props).toMatchObject({
      dataKey: "real",
      name: "Realizado acumulado",
    });
    expect(lines.some(node => node.props?.dataKey === "real")).toBe(false);

    const planLine = lines.find(node => node.props?.dataKey === "plan");
    const projectionLine = lines.find(
      node => node.props?.dataKey === "projection"
    );
    expect(planLine?.props).toMatchObject({
      dataKey: "plan",
      name: "Planejado do mês",
    });
    expect(projectionLine?.props).toMatchObject({
      dataKey: "projection",
      name: "Projeção de fechamento",
    });
    expect(projectionLine?.props?.strokeDasharray).toBeTruthy();

    const series = [...bars, ...lines].filter(node =>
      ["real", "plan", "projection"].includes(String(node.props?.dataKey))
    );
    const axisIds = new Set(
      series.map(node =>
        node.props?.yAxisId === undefined ? "default" : node.props.yAxisId
      )
    );
    expect(axisIds.size).toBe(1);

    const realLabel =
      realBar &&
      findByType(realBar, LabelList).find(
        node => node.props?.dataKey === "real"
      );
    expect(realLabel).toBeDefined();
    const formatter = realLabel?.props?.formatter;
    expect(typeof formatter).toBe("function");
    expect((formatter as (value: number | null) => unknown)(null)).toBe("");
    expect((formatter as (value: number | null) => unknown)(0)).toBe("0");
  });

  it("mantém a janela padrão e calcula a janela de último mês quando selecionada", () => {
    reactMocks.useState.mockClear();
    const defaultTree = renderCard(fixture());
    expect(textContent(defaultTree)).toContain(
      "Média sintética dos últimos 3 meses"
    );
    expect(reactMocks.useState.mock.calls.map(call => call[0])).toEqual([
      "last3Months",
      false,
    ]);

    reactMocks.useState.mockClear();
    reactMocks.useState.mockImplementationOnce(
      () => ["lastMonth", vi.fn()] as const
    );
    const lastMonthTree = renderCard(fixture());
    expect(textContent(lastMonthTree)).toContain("Último mês sintético");
  });

  it("passa locale ao tooltip e mostra detalhes EN sem perder zero real", () => {
    reactMocks.useState.mockClear();
    const tree = renderCard(fixture(), "en");
    const tooltip = findByType(tree, Tooltip)[0];
    const content = tooltip?.props?.content as TreeNode | undefined;
    expect(content?.props).toMatchObject({ locale: "en" });

    const renderTooltip = content?.type as
      | ((props: Record<string, unknown>) => unknown)
      | undefined;
    const details = renderTooltip?.({
      active: true,
      label: 8,
      locale: "en",
      payload: [
        {
          name: "Cumulative actuals",
          value: 0,
          color: "#e2212d",
          payload: { real: 0, dailyReal: 0, gapToPlan: 0 },
        },
      ],
    });
    const detailsText = textContent(details);
    expect(detailsText).toContain("Day 8");
    expect(detailsText).toContain("0 Leads");
    expect(detailsText).toContain("Leads for the day:");
    expect(detailsText).toContain(
      "Cumulative difference vs. Planned this month:"
    );
    expect(detailsText).not.toContain("Dia");
    expect(detailsText).not.toContain("Diferença");
  });

  it("mantém plano/projeção e calcula real, delta diário e gap sem fabricar futuro", () => {
    const rows = buildHistoricalPaceChartRows(fixture(), fixture().last3Months);

    expect(rows.map(row => row.real)).toEqual([0, 2, 3, null]);
    expect(rows.map(row => row.plan)).toEqual([1, 2, 4, 5]);
    expect(rows.map(row => row.projection)).toEqual([null, null, 3, 6]);
    expect(rows.map(row => row.dailyReal)).toEqual([0, 2, 1, null]);
    expect(rows.map(row => row.gapToPlan)).toEqual([-1, 0, -1, null]);
  });

  it("suprime um real numérico indevido depois do corte da fonte", () => {
    const data = fixture({ futureReal: 99 });
    const rows = buildHistoricalPaceChartRows(data, data.last3Months);

    expect(rows.map(row => row.real)).toEqual([0, 2, 3, null]);
    expect(rows[3]?.dailyReal).toBeNull();
    expect(rows[3]?.gapToPlan).toBeNull();
  });

  it("limita o real ao último dia disponível quando a fonte está atrasada", () => {
    const data = fixture({ lastAvailableDate: "2026-11-02" });
    const rows = buildHistoricalPaceChartRows(data, data.last3Months);

    expect(rows.map(row => row.real)).toEqual([0, 2, null, null]);
    expect(rows.map(row => row.dailyReal)).toEqual([0, 2, null, null]);
    expect(rows.map(row => row.plan)).toEqual([1, 2, 4, 5]);
    expect(rows.map(row => row.projection)).toEqual([null, null, 3, 6]);
  });

  it("representa fonte indisponível com real totalmente nulo, inclusive o zero inicial", () => {
    const data = fixture({ lastAvailableDate: null });
    const rows = buildHistoricalPaceChartRows(data, data.last3Months);

    expect(rows.every(row => row.real === null)).toBe(true);
    expect(rows.every(row => row.dailyReal === null)).toBe(true);
    expect(rows.every(row => row.gapToPlan === null)).toBe(true);
  });

  it("mantém gap nulo quando o plano daquele dia é desconhecido", () => {
    const data = fixture({ planDay2: null });
    const rows = buildHistoricalPaceChartRows(data, data.last3Months);

    expect(rows[0]?.gapToPlan).toBe(-1);
    expect(rows[1]?.real).toBe(2);
    expect(rows[1]?.gapToPlan).toBeNull();
  });

  it("expõe séries históricas somente quando solicitado e preserva zero como valor válido", () => {
    const data = fixture();
    const rows = buildHistoricalPaceChartRows(data, data.last3Months, true);

    expect(rows.map(row => row.historical_0)).toEqual([1, 2, 3, 4]);
    expect(rows[0]?.real).toBe(0);
    expect(rows[0]?.dailyReal).toBe(0);
  });

  it("oferece rolagem para 31 pontos sem alterar o cálculo das linhas", () => {
    const points = Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      return {
        date: `2027-01-${String(day).padStart(2, "0")}`,
        day,
        real: day <= 30 ? day - 1 : null,
        plan: day,
        projection: day >= 30 ? 29 : null,
      } satisfies HistoricalLeadPacePoint;
    });
    const base = fixture({
      asOfDate: "2027-01-30",
      lastAvailableDate: "2027-01-30",
    });
    const data: HistoricalLeadPace = {
      ...base,
      competence: "2027-01",
      current: 29,
      last3Months: { ...base.last3Months, points },
      lastMonth: {
        ...base.lastMonth,
        points: points.map(point => ({ ...point })),
      },
    };
    const rows = buildHistoricalPaceChartRows(data, data.last3Months);
    const tree = renderCard(data);
    const chartRegion = findNodes(
      tree,
      node =>
        node.props?.["aria-label"] ===
        "Barras de Leads realizados acumulados comparadas ao Planejado do mês e à projeção de fechamento"
    )[0];
    const scrollable =
      chartRegion &&
      findNodes(chartRegion, node => {
        const className = node.props?.className;
        const style = isObject(node.props?.style) ? node.props.style : null;
        return (
          (typeof className === "string" &&
            /overflow-(x-)?auto|overflow-x-scroll/.test(className)) ||
          style?.overflowX === "auto" ||
          style?.overflowX === "scroll"
        );
      });

    expect(rows).toHaveLength(31);
    expect(rows[29]?.real).toBe(29);
    expect(rows[30]?.real).toBeNull();
    expect(rows[29]?.projection).toBe(29);
    expect(rows[30]?.projection).toBe(29);
    expect(scrollable?.length ?? 0).toBeGreaterThan(0);
  });
});
