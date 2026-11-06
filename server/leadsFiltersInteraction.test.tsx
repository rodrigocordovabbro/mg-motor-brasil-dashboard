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
  invalidateLeads: vi.fn(),
  invalidateCRM: vi.fn(),
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
  trpc: {
    useUtils: () => ({
      leads: { dashboard: { invalidate: mock.invalidateLeads } },
      dispatch: { leadControl: { invalidate: mock.invalidateCRM } },
    }),
    leads: { dashboard: { useQuery: mock.query } },
  },
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

function findOverview() {
  mock.index = 0;
  const tree = Dashboard({
    authenticated: true,
    clientMode: false,
    canManage: false,
  });
  return findElement(tree, element => element.type?.name === "OverviewTab");
}
it("reconsulta uma vez, invalida os caches sem fetch duplicado e mantém confirmação no shell", async () => {
  const original = {
    status: "READY",
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      cutoffDate: "2026-11-04",
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    source: { importedAt: "2026-11-04T12:00:00Z" },
    pacing: { competence: "2026-11", current: 3 },
    summary: { total: 3 },
    notes: [],
  };
  const fresh = {
    ...original,
    checkedAt: "2026-11-05T15:00:00Z",
    source: {
      importedAt: "2026-11-05T14:00:00Z",
      latestLeadDate: "2026-11-04",
    },
    pacing: { competence: "2026-11", current: 9 },
    summary: { total: 9 },
  };
  const refetch = vi.fn().mockResolvedValue({ data: fresh, error: null });
  mock.query.mockReturnValue({
    data: original,
    isLoading: false,
    isFetching: false,
    refetch,
  });
  const result = await findOverview().props.onReloadMonth();
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
  expect(mock.invalidateLeads).toHaveBeenCalledWith(undefined, {
    refetchType: "none",
  });
  expect(mock.invalidateCRM).toHaveBeenCalledWith(undefined, {
    refetchType: "none",
  });
  expect(result.monthlyTotal).toBe(9);
  expect(result.newImport).toBe(true);
  expect(mock.values[6]).toContain("9 Leads");
});
it("rejeita fonte ausente mesmo quando a query HTTP resolveu sem erro", async () => {
  const data = {
    status: "READY",
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      cutoffDate: "2026-11-04",
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    source: { importedAt: "2026-11-04T12:00:00Z" },
    notes: [],
  };
  const refetch = vi
    .fn()
    .mockResolvedValue({
      data: { ...data, status: "NOT_CONFIGURED" },
      error: null,
    });
  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch,
  });
  await expect(findOverview().props.onReloadMonth()).rejects.toThrow(
    "não configurada"
  );
  expect(mock.values[6]).toBeNull();
});
