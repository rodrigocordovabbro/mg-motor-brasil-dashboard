import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HistoricalLeadPace,
  HistoricalLeadPacePoint,
  HistoricalLeadPaceReference,
  HistoricalLeadPaceScenario,
} from "../shared/historicalLeadPace";

const reactMocks = vi.hoisted(() => {
  const state = { showHistorical: false };
  const useMemo = vi.fn((factory: () => unknown) => factory());
  const useState = vi.fn((initial: unknown) => {
    const value =
      initial === false
        ? state.showHistorical
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
    return [value, vi.fn()] as const;
  });
  return { state, useMemo, useState };
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

import { Bar, Line } from "recharts";
import V2HistoricalLeadPaceCard from "../client/src/components/V2HistoricalLeadPaceCard";
import { getHistoricalMonthStyle } from "../client/src/components/historicalLeadPaceColors";

const expectedStyles = {
  "2026-08": { color: "#7c3aed", dasharray: "8 4" },
  "2026-09": { color: "#b45309", dasharray: "12 3 2 3" },
  "2026-10": { color: "#0e7490", dasharray: "2 3" },
  "2026-12": { color: "#b45309", dasharray: "12 3 2 3" },
  "2027-01": { color: "#0e7490", dasharray: "2 3" },
  "2027-02": { color: "#7c3aed", dasharray: "8 4" },
} as const;

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

function styleOf(node: TreeNode): Record<string, unknown> {
  return isObject(node.props?.style) ? node.props.style : {};
}

const points: HistoricalLeadPacePoint[] = [
  { date: "2026-11-01", day: 1, real: 0, plan: 1, projection: null },
  { date: "2026-11-02", day: 2, real: 2, plan: 2, projection: null },
  { date: "2026-11-03", day: 3, real: 3, plan: 4, projection: 5 },
  { date: "2026-11-04", day: 4, real: null, plan: 5, projection: 6 },
];

const referenceFor = (
  competence: string,
  overrides: Partial<HistoricalLeadPaceReference> = {}
): HistoricalLeadPaceReference => ({
  competence,
  total: 10,
  available: true,
  reason: null,
  cumulative: [1, 2, 3, 4],
  ...overrides,
});

const scenarioFor = (
  referenceMonths: string[],
  overrides: Partial<HistoricalLeadPaceScenario> = {}
): HistoricalLeadPaceScenario => ({
  key: "last3Months",
  label: "Média sintética dos últimos 3 meses",
  status: "READY",
  referenceMonths,
  expectedShare: 0.4,
  expectedToDate: 4,
  gapToDate: -1,
  gapPercent: -0.2,
  projection: 6,
  projectedDifference: -4,
  paceStatus: "BEHIND",
  points: points.map(point => ({ ...point })),
  warnings: [],
  ...overrides,
});

const fixture = (
  references: HistoricalLeadPaceReference[] = [
    referenceFor("2026-08"),
    referenceFor("2026-09"),
    referenceFor("2026-10"),
  ]
): HistoricalLeadPace => ({
  competence: "2026-11",
  asOfDate: "2026-11-03",
  lastAvailableDate: "2026-11-03",
  daysInMonth: 30,
  current: 3,
  goal: 10,
  scope: "GLOBAL",
  reference: references,
  lastMonth: scenarioFor(["2026-10"], {
    key: "lastMonth",
    label: "Último mês sintético",
  }),
  last3Months: scenarioFor(references.map(reference => reference.competence)),
});

function renderCard(data: HistoricalLeadPace, showHistorical = true) {
  reactMocks.state.showHistorical = showHistorical;
  return V2HistoricalLeadPaceCard({ data });
}

describe("cores mensais do histórico de Leads Plan", () => {
  beforeEach(() => {
    reactMocks.state.showHistorical = false;
    reactMocks.useMemo.mockClear();
    reactMocks.useState.mockClear();
  });

  it("mantém três cores e padrões distintos em ago/set/out e atravessa dez/jan/fev sem colisão indevida", () => {
    expect(getHistoricalMonthStyle("2026-08")).toEqual(
      expectedStyles["2026-08"]
    );
    expect(getHistoricalMonthStyle("2026-09")).toEqual(
      expectedStyles["2026-09"]
    );
    expect(getHistoricalMonthStyle("2026-10")).toEqual(
      expectedStyles["2026-10"]
    );
    expect(
      new Set(
        ["2026-08", "2026-09", "2026-10"].map(
          competence => getHistoricalMonthStyle(competence).color
        )
      ).size
    ).toBe(3);

    expect(getHistoricalMonthStyle("2026-12")).toEqual(
      expectedStyles["2026-12"]
    );
    expect(getHistoricalMonthStyle("2027-01")).toEqual(
      expectedStyles["2027-01"]
    );
    expect(getHistoricalMonthStyle("2027-02")).toEqual(
      expectedStyles["2027-02"]
    );
    expect(
      new Set(
        ["2026-12", "2027-01", "2027-02"].map(
          competence => getHistoricalMonthStyle(competence).color
        )
      ).size
    ).toBe(3);
  });

  it("deriva a cor pela competência, não pela posição após filtrar ou reordenar", () => {
    const competences = ["2026-08", "2026-09", "2026-10"];
    const expectedByCompetence = new Map(
      competences.map(competence => [
        competence,
        getHistoricalMonthStyle(competence),
      ])
    );
    const orders = [
      ["2026-10", "2026-08", "2026-09"],
      ["2026-09", "2026-10"],
      ["2026-08", "2026-10", "2026-09"],
    ];

    orders.forEach(order => {
      order.forEach(competence => {
        expect(getHistoricalMonthStyle(competence)).toEqual(
          expectedByCompetence.get(competence)
        );
      });
    });
  });

  it("mantém linha, legenda, tabela e swatch coerentes sem alterar plano, barras ou projeção", () => {
    const data = fixture();
    const tree = renderCard(data);
    const lines = findByType(tree, Line);
    const historicalLines = lines.filter(node =>
      String(node.props?.dataKey ?? "").startsWith("historical_")
    );

    expect(historicalLines).toHaveLength(3);
    expect(
      findByType(tree, Bar).find(node => node.props?.dataKey === "real")
    ).toMatchObject({ props: { fill: "#e2212d", dataKey: "real" } });
    expect(lines.find(node => node.props?.dataKey === "plan")).toMatchObject({
      props: { stroke: "#2563eb", strokeWidth: 3 },
    });
    expect(
      lines.find(node => node.props?.dataKey === "projection")
    ).toMatchObject({
      props: { stroke: "#16a34a", strokeWidth: 3, strokeDasharray: "7 5" },
    });

    data.reference.forEach((reference, index) => {
      const style =
        expectedStyles[reference.competence as keyof typeof expectedStyles];
      const line = historicalLines.find(
        node => node.props?.dataKey === `historical_${index}`
      );
      expect(line).toMatchObject({
        props: {
          name: expect.any(String),
          stroke: style.color,
          strokeDasharray: style.dasharray,
          strokeWidth: 2,
        },
      });

      const label = String(line?.props?.name);
      const legend = findNodes(
        tree,
        node =>
          node.type === "span" &&
          textContent(node).includes(`${label} (histórico)`)
      )[0];
      expect(legend).toBeDefined();
      const legendSwatch = findNodes(legend, node => node.type === "i")[0];
      expect(styleOf(legendSwatch).borderColor).toBe(style.color);

      const referenceRow = findNodes(
        tree,
        node => node.type === "tr" && textContent(node).includes(label)
      )[0];
      expect(referenceRow).toBeDefined();
      expect(styleOf(referenceRow).backgroundColor).toBe(`${style.color}0a`);
      const referenceCell = findNodes(
        referenceRow,
        node => node.type === "td"
      )[0];
      expect(styleOf(referenceCell)).toMatchObject({
        color: style.color,
        borderLeftColor: style.color,
      });
      const tableSwatch = findNodes(
        referenceCell,
        node => node.type === "i"
      )[0];
      expect(styleOf(tableSwatch).backgroundColor).toBe(style.color);
    });
  });

  it("não cria linha ou legenda para referência indisponível e mantém nulos como ausência de dado", () => {
    const data = fixture([
      referenceFor("2026-08"),
      referenceFor("2026-09", {
        available: false,
        total: null,
        reason: "NO_SOURCE",
        cumulative: [],
      }),
      referenceFor("2026-10"),
    ]);
    const tree = renderCard(data);
    const historicalLines = findByType(tree, Line).filter(node =>
      String(node.props?.dataKey ?? "").startsWith("historical_")
    );

    expect(historicalLines).toHaveLength(2);
    expect(
      historicalLines.some(node => node.props?.dataKey === "historical_1")
    ).toBe(false);
    expect(textContent(tree)).not.toContain("setembro de 2026 (histórico)");
    const unavailableReferenceRow = findNodes(
      tree,
      node =>
        node.type === "tr" && textContent(node).includes("setembro de 2026")
    )[0];
    expect(unavailableReferenceRow).toBeDefined();
    expect(textContent(unavailableReferenceRow)).toContain("—");
    expect(textContent(unavailableReferenceRow)).not.toContain("10");
  });

  it("usa fallback neutro somente para competência inválida", () => {
    expect(getHistoricalMonthStyle("2026-00")).toEqual({
      color: "#64748b",
      dasharray: "4 3",
    });
    expect(getHistoricalMonthStyle("2026-13")).toEqual({
      color: "#64748b",
      dasharray: "4 3",
    });
    expect(getHistoricalMonthStyle("sem-competência")).toEqual({
      color: "#64748b",
      dasharray: "4 3",
    });
  });
});
