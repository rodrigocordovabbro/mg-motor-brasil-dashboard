import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEAD_PERIOD_PRESETS,
  resolveLeadPeriodPreset,
} from "../shared/leadPeriodPresets";

const mock = vi.hoisted(() => ({
  index: 0,
  values: [] as any[],
  setters: [] as any[],
  query: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => ({ current: value }),
    useState: (initial: any) => {
      const index = mock.index++;
      if (!Object.hasOwn(mock.values, index))
        mock.values[index] =
          typeof initial === "function" ? initial() : initial;
      mock.setters[index] ??= vi.fn(next => {
        mock.values[index] =
          typeof next === "function" ? next(mock.values[index]) : next;
      });
      return [mock.values[index], mock.setters[index]];
    },
  };
});
vi.mock("@/lib/trpc", () => ({
  trpc: { leads: { dashboard: { useQuery: mock.query } } },
}));
import Dashboard from "../client/src/components/V2LeadsDashboard";

function findElement(node: any, predicate: (element: any) => boolean): any {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElement(item, predicate);
      if (found) return found;
    }
  } else if (node && typeof node === "object" && node.props) {
    if (predicate(node)) return node;
    return findElement(node.props.children, predicate);
  }
  return null;
}
function panel() {
  mock.index = 0;
  const tree = Dashboard({
    authenticated: true,
    clientMode: false,
    canManage: false,
  });
  const filters = findElement(
    tree,
    element => element.type?.name === "FilterBar"
  );
  expect(filters).not.toBeNull();
  return filters;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
  vi.stubGlobal("window", { location: { search: "" } });
  mock.index = 0;
  mock.values = [];
  mock.setters = [];
  mock.query.mockReset().mockImplementation(filters => ({
    data: {
      status: "READY",
      period: { ...filters, cutoffDate: "2026-11-04" },
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      source: { name: "Fonte de teste", importedAt: "2026-11-05T12:00:00Z" },
      notes: [],
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aplicação dos filtros do painel", () => {
  it.each(LEAD_PERIOD_PRESETS)(
    "%s aplica os campos e a consulta no mesmo clique",
    preset => {
      const filters = panel();
      const period = resolveLeadPeriodPreset(preset, "2026-11-04");
      filters.props.onPreset(preset);
      expect(mock.values[1]).toMatchObject(period);
      expect(mock.values[2]).toMatchObject(period);
      panel();
      expect(mock.query.mock.calls.at(-1)?.[0]).toMatchObject(period);
    }
  );
  it("Buscar aplica o período manual e preserva o modelo", () => {
    const filters = panel();
    filters.props.setDraft({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      model: "MG 4",
      page: 1,
    });
    expect(mock.values[3]).toBe("");
    panel().props.onSearch();
    panel();
    expect(mock.query.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      model: "MG 4",
    });
  });
  it("não aplica datas invertidas e informa o problema", () => {
    const filters = panel();
    filters.props.setDraft({
      dateFrom: "2026-10-31",
      dateTo: "2026-10-01",
      page: 1,
    });
    panel().props.onSearch();
    expect(mock.values[2]).toMatchObject({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
    });
    expect(mock.values[4]).toMatch(/inicial/);
  });
  it("Enter no formulário executa Buscar e o campo vazio permanece controlado", () => {
    const filters = panel();
    const view = filters.type(filters.props);
    const input = findElement(
      view,
      element =>
        element.type === "input" &&
        element.props["aria-label"] === "Data inicial"
    );
    input.props.onChange({ target: { value: "" } });
    expect(mock.values[1].dateFrom).toBe("");
    filters.props.setDraft({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      page: 1,
    });
    const refreshed = panel();
    const form = findElement(
      refreshed.type(refreshed.props),
      element => element.type === "form"
    );
    const preventDefault = vi.fn();
    form.props.onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mock.values[2]).toMatchObject({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
  });
});
