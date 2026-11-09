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
  syncBaseMutation: vi.fn(),
  exportCSV: vi.fn(),
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
      client: { leads: { exportCSV: { mutate: mock.exportCSV } } },
    }),
    leads: {
      syncBase: { useMutation: () => ({ mutateAsync: mock.syncBaseMutation }) },
      dashboard: { useQuery: mock.query },
    },
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
function panel(canManage = false) {
  mock.index = 0;
  const tree = Dashboard({
    authenticated: true,
    clientMode: false,
    canManage,
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
  mock.syncBaseMutation.mockReset();
  mock.exportCSV.mockReset();
  mock.invalidateLeads.mockReset();
  mock.invalidateCRM.mockReset();
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
  it("normaliza a URL legada de Modelos para Visão Geral e preserva parâmetros", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://mgmotors.test/?module=leads&tab=models&foo=bar",
        search: "?module=leads&tab=models&foo=bar",
      },
      history: { replaceState },
      requestAnimationFrame: vi.fn(),
    });
    mock.index = 0;

    const tree = Dashboard({
      authenticated: true,
      clientMode: false,
      canManage: false,
    });
    const navigation = findElement(
      tree,
      element => element.type?.name === "LeadsSectionNavigation"
    );

    expect(navigation.props.activeTab).toBe("Visão Geral");
    expect(replaceState).toHaveBeenCalledOnce();
    const normalized = new URL(
      replaceState.mock.calls[0][2],
      "https://mgmotors.test"
    );
    expect(normalized.searchParams.get("module")).toBe("leads");
    expect(normalized.searchParams.get("foo")).toBe("bar");
    expect(normalized.searchParams.has("tab")).toBe(false);
  });

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

function findOverview(canManage = false) {
  mock.index = 0;
  const tree = Dashboard({
    authenticated: true,
    clientMode: false,
    canManage,
  });
  return findElement(tree, element => element.type?.name === "OverviewTab");
}

function versionedDashboard(
  importedAt = "2026-11-04T12:00:00Z",
  totalRows = 2
) {
  return {
    status: "READY",
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      cutoffDate: "2026-11-04",
    },
    options: { models: [], channels: [], campaigns: [], dealers: [] },
    source: {
      name: "Fonte de teste",
      importedAt,
      totalRows,
      latestLeadDate: "2026-11-04",
    },
    pacing: { competence: "2026-11", current: 3 },
    summary: { total: 3 },
    notes: [],
  };
}

function syncVersion(importedAt = "2026-11-05T14:00:00Z", totalRows = 3) {
  return {
    changed: true,
    importedAt,
    totalRows,
    inserted: 1,
    updated: 0,
    sourceCounts: [],
    latestLeadDate: "2026-11-04",
  };
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
  const refetch = vi.fn().mockResolvedValue({
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
  expect(mock.values[6]).toContain("Não foi possível atualizar a base");
});

it("aguarda o sync administrativo antes de invalidar/refazer a leitura e confirma a mesma versão SQL", async () => {
  const original = versionedDashboard();
  const syncResult = syncVersion();
  const fresh = {
    ...original,
    checkedAt: "2026-11-05T15:00:00Z",
    source: {
      ...original.source,
      importedAt: syncResult.importedAt,
      totalRows: syncResult.totalRows,
    },
    pacing: { competence: "2026-11", current: 9 },
    summary: { total: 9 },
  };
  const events: string[] = [];
  mock.syncBaseMutation.mockImplementation(async () => {
    events.push("sync");
    return syncResult;
  });
  mock.invalidateLeads.mockImplementation(() => {
    events.push("invalidate leads");
  });
  mock.invalidateCRM.mockImplementation(() => {
    events.push("invalidate crm");
  });
  const refetch = vi.fn().mockImplementation(async () => {
    events.push("refetch");
    return { data: fresh, error: null };
  });
  mock.query.mockReturnValue({
    data: original,
    isLoading: false,
    isFetching: false,
    refetch,
  });

  const result = await findOverview(true).props.onReloadMonth(
    (stage: string) => {
      events.push(`phase ${stage}`);
    }
  );

  expect(events).toEqual([
    "phase syncing",
    "sync",
    "phase refreshing",
    "invalidate leads",
    "invalidate crm",
    "refetch",
  ]);
  expect(result.newImport).toBe(true);
  expect(result.sync).toMatchObject({ totalRows: syncResult.totalRows });
  expect(mock.syncBaseMutation).toHaveBeenCalledOnce();
  expect(refetch).toHaveBeenCalledOnce();
});

it("não invalida nem refaz a leitura quando a sincronização administrativa falha", async () => {
  const data = versionedDashboard();
  const refetch = vi.fn();
  mock.syncBaseMutation.mockRejectedValue({
    data: { code: "PRECONDITION_FAILED" },
  });
  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch,
  });

  await expect(findOverview(true).props.onReloadMonth()).rejects.toMatchObject({
    data: { code: "PRECONDITION_FAILED" },
  });

  expect(mock.invalidateLeads).not.toHaveBeenCalled();
  expect(mock.invalidateCRM).not.toHaveBeenCalled();
  expect(refetch).not.toHaveBeenCalled();
  expect(mock.values[6]).toContain("Conexão Google pendente");
});

it("não declara sucesso nem preservação incorreta se a leitura fresca falha após o commit", async () => {
  const data = versionedDashboard();
  const syncResult = syncVersion();
  const refetch = vi.fn().mockRejectedValue(new Error("leitura indisponível"));
  mock.syncBaseMutation.mockResolvedValue(syncResult);
  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch,
  });

  await expect(findOverview(true).props.onReloadMonth()).rejects.toMatchObject({
    code: "LEADS_RELOAD_VERSION_NOT_CONFIRMED",
  });

  expect(mock.values[6]).toBe(
    "A planilha foi importada, mas o painel ainda não confirmou a nova versão. Atualize os indicadores."
  );
  expect(mock.values[6]).not.toContain("preservados");
});

it("rejeita uma leitura fresca ainda anterior à versão retornada pelo sync", async () => {
  const data = versionedDashboard();
  const syncResult = syncVersion();
  const refetch = vi.fn().mockResolvedValue({
    data: versionedDashboard(),
    error: null,
  });
  mock.syncBaseMutation.mockResolvedValue(syncResult);
  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch,
  });

  await expect(findOverview(true).props.onReloadMonth()).rejects.toMatchObject({
    code: "LEADS_RELOAD_VERSION_NOT_CONFIRMED",
  });

  expect(refetch).toHaveBeenCalledOnce();
  expect(mock.values[6]).toBe(
    "A planilha foi importada, mas o painel ainda não confirmou a nova versão. Atualize os indicadores."
  );
});

it("desabilita preset, campos e busca enquanto a sincronização administrativa está pendente", async () => {
  const data = versionedDashboard();
  const syncResult = syncVersion();
  let resolveSync!: (result: typeof syncResult) => void;
  const pendingSync = new Promise<typeof syncResult>(resolve => {
    resolveSync = resolve;
  });
  mock.syncBaseMutation.mockReturnValue(pendingSync);
  const fresh = {
    ...data,
    source: {
      ...data.source,
      importedAt: syncResult.importedAt,
      totalRows: syncResult.totalRows,
    },
  };
  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({ data: fresh, error: null }),
  });

  const reload = findOverview(true).props.onReloadMonth();
  await Promise.resolve();
  const filters = panel(true);
  const renderedFilters = filters.type(filters.props);
  const fieldset = findElement(
    renderedFilters,
    element => element.type === "fieldset"
  );
  const appliedBefore = mock.values[2];

  expect(filters.props.isFetching).toBe(true);
  expect(fieldset.props.disabled).toBe(true);
  filters.props.onPreset("Mês");
  filters.props.onSearch();
  expect(mock.values[2]).toBe(appliedBefore);

  resolveSync(syncResult);
  await reload;
});

it("retira modelos da inicial e mantém canais, estados e concessionárias", () => {
  const channels = [{ label: "Meta", count: 7 }];
  mock.query.mockReturnValue({
    data: {
      status: "READY",
      period: {
        dateFrom: "2026-11-01",
        dateTo: "2026-11-04",
        cutoffDate: "2026-11-04",
      },
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      source: {},
      notes: [],
      channels,
      states: [],
      dealers: [],
      daily: [],
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const overview = findOverview();
  const body = overview.type(overview.props);
  expect(
    findElement(
      body,
      element => element.props.title === "Distribuição por modelo"
    )
  ).toBeNull();
  for (const title of [
    "Distribuição por canal",
    "Distribuição por estado",
    "Distribuição por concessionária",
  ]) {
    expect(
      findElement(body, element => element.props.title === title)
    ).not.toBeNull();
  }
  const heading = findElement(
    body,
    element => element.props.title === "Distribuição por canal"
  );
  const card = findElement(
    body,
    element => element.props.children?.[0] === heading
  );
  expect(card.props.className).toContain("lg:col-span-2");
});

it("posiciona um único total por dia na última barra empilhada, não em cada canal", () => {
  mock.query.mockReturnValue({
    data: {
      status: "READY",
      period: {},
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      source: {},
      notes: [],
      channels: [],
      states: [],
      dealers: [],
      daily: [
        {
          date: "2026-11-01",
          total: 5,
          cumulative: 5,
          pace: null,
          channels: { Meta: 5, Site: 0 },
        },
      ],
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const overview = findOverview();
  const body = overview.type(overview.props);
  const chart = findElement(
    body,
    element => element.type?.name === "DailyChart"
  );
  mock.index = 0;
  const chartTree = chart.type(chart.props);
  const labels: any[] = [];
  const visit = (node: any) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node?.props) return;
    if (
      node.type?.displayName === "LabelList" ||
      node.type?.name === "LabelList"
    )
      labels.push(node);
    visit(node.props.children);
  };
  visit(chartTree);
  expect(labels).toHaveLength(1);
  expect(labels[0].props.dataKey).toBe("total");
  expect(labels[0].props.position).toBe("top");
  expect(labels[0].props.formatter(1353)).toBe("1.353");
  expect(labels[0].props.formatter(0)).toBe("0");
});

it("informa explicitamente período sem Leads em vez de renderizar eixos sem barras", () => {
  mock.query.mockReturnValue({
    data: {
      status: "READY",
      period: {},
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      source: {},
      notes: [],
      channels: [],
      states: [],
      dealers: [],
      daily: [
        {
          date: "2026-11-01",
          total: 0,
          cumulative: 0,
          pace: null,
          channels: {},
        },
      ],
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const overview = findOverview();
  const body = overview.type(overview.props);
  const chart = findElement(
    body,
    element => element.type?.name === "DailyChart"
  );
  mock.index = 0;
  const empty = chart.type(chart.props);
  expect(empty.props.label).toBe("Nenhum Lead no período selecionado.");
});

it("não transforma pontos sem fonte em zeros, rótulos ou acumulado contínuo", () => {
  mock.query.mockReturnValue({
    data: {
      status: "READY",
      period: {},
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      source: {},
      notes: [],
      channels: [],
      states: [],
      dealers: [],
      daily: [
        {
          date: "2026-11-01",
          total: 5,
          cumulative: 5,
          pace: null,
          channels: { Meta: 5 },
          sourceAvailable: true,
        },
        {
          date: "2026-11-02",
          total: 2,
          cumulative: 7,
          pace: null,
          channels: { Site: 2 },
          sourceAvailable: true,
        },
        {
          date: "2026-11-03",
          total: null,
          cumulative: 5,
          pace: null,
          channels: {},
          sourceAvailable: false,
        },
      ],
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const overview = findOverview();
  const body = overview.type(overview.props);
  const chart = findElement(
    body,
    element => element.type?.name === "DailyChart"
  );
  const chartTree = chart.type(chart.props);
  let chartData: any[] | undefined;
  const labels: any[] = [];
  const visit = (node: any) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node?.props) return;
    if (Array.isArray(node.props.data) && node.props.data[0]?.date)
      chartData = node.props.data;
    if (
      node.type?.displayName === "LabelList" ||
      node.type?.name === "LabelList"
    )
      labels.push(node);
    visit(node.props.children);
  };
  visit(chartTree);
  expect(chartData).toBeDefined();
  expect(chartData?.[0]["channel:Site"]).toBe(0);
  expect(chartData?.[1]["channel:Meta"]).toBe(0);
  expect(chartData?.[2].total).toBeNull();
  expect(chartData?.[2]["channel:Meta"]).toBeNull();
  expect(chartData?.[2].cumulative).toBeNull();
  expect(labels).toHaveLength(1);
  expect(labels[0].props.formatter(null)).toBe("");
  expect(labels[0].props.formatter(0)).toBe("0");
});

it("aguarda a atualização quando todo o período está fora da fonte", () => {
  mock.query.mockReturnValue({
    data: {
      status: "READY",
      period: {},
      options: { models: [], channels: [], campaigns: [], dealers: [] },
      source: {},
      notes: [],
      channels: [],
      states: [],
      dealers: [],
      daily: [
        {
          date: "2026-11-08",
          total: null,
          cumulative: null,
          pace: null,
          channels: {},
          sourceAvailable: false,
        },
      ],
    },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  const overview = findOverview();
  const chart = findElement(
    overview.type(overview.props),
    element => element.type?.name === "DailyChart"
  );
  expect(chart.type(chart.props).props.label).toBe(
    "Aguardando atualização da fonte para este período"
  );
});

it.each([true, false])(
  "prioriza Leads Plan na tela inicial e preserva controles do perfil canManage=%s",
  canManage => {
    const history = { competence: "2026-11", asOfDate: "2026-11-04" };
    const data = {
      ...versionedDashboard(),
      historicalPace: history,
      channels: [{ label: "Meta", count: 3 }],
      daily: [
        {
          date: "2026-11-01",
          total: 3,
          cumulative: 3,
          pace: 10,
          channels: { Meta: 3 },
          sourceAvailable: true,
        },
      ],
    };
    mock.query.mockReturnValue({
      data,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const overview = findOverview(canManage);
    const tree = overview.type(overview.props);
    const first = tree.props.children[0];
    expect(first.type.name).toBe("V2HistoricalLeadPaceCard");
    expect(first.props.data).toBe(history);
    expect(
      findElement(tree, element => element.type?.name === "PacingCard")
    ).toBeNull();
    const reload = findElement(
      first.props.actions,
      element => element.type?.name === "V2LeadsReloadButton"
    );
    expect(reload.props.onReload).toBe(overview.props.onReloadMonth);
    expect(reload.props.syncExternal).toBe(canManage);
    expect(reload.props.competence).toBe("2026-11");
    const goals = findElement(
      first.props.actions,
      element => element.type?.name === "V2MonthlyGoalEditor"
    );
    expect(Boolean(goals)).toBe(canManage);
    const daily = findElement(
      tree,
      element => element.type?.name === "DailyChart"
    );
    expect(daily.props.showPace).toBe(false);
    const dailyTree = daily.type(daily.props);
    expect(
      findElement(dailyTree, element => element.props.dataKey === "pace")
    ).toBeNull();
    expect(
      findElement(dailyTree, element => element.props.dataKey === "cumulative")
    ).not.toBeNull();
  }
);

it("aba Leads exporta os filtros aplicados, ignora a página e bloqueia durante fetch", async () => {
  const data = {
    ...versionedDashboard(),
    status: "READY" as const,
    recent: { rows: [], total: 12, page: 3, pageSize: 10 },
  };
  const refetch = vi.fn();
  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch,
  });
  vi.stubGlobal("window", {
    location: {
      href: "https://mgmotors.test/?module=leads",
      search: "?module=leads",
    },
    history: { replaceState: vi.fn() },
    requestAnimationFrame: vi.fn(),
    scrollY: 0,
    scrollTo: vi.fn(),
  });

  const renderDashboard = () => {
    mock.index = 0;
    return Dashboard({
      authenticated: true,
      clientMode: false,
      canManage: false,
    });
  };
  const findExportButton = (dashboard: any) => {
    const leadsTable = findElement(
      dashboard,
      element => element.type?.name === "LeadsTableTab"
    );
    const heading = findElement(
      leadsTable.type(leadsTable.props),
      element => element.type?.name === "CardHeading"
    );
    return findElement(
      heading.type(heading.props),
      element => element.type?.name === "V2LeadsExportButton"
    );
  };
  const initial = renderDashboard();
  const navigation = findElement(
    initial,
    element => element.type?.name === "LeadsSectionNavigation"
  );
  const leadsTab = findElement(
    navigation.type(navigation.props),
    element =>
      element.type === "button" &&
      (Array.isArray(element.props.children)
        ? element.props.children.includes("Leads")
        : element.props.children === "Leads")
  );
  leadsTab.props.onClick();

  let tree = renderDashboard();
  let filterBar = findElement(
    tree,
    element => element.type?.name === "FilterBar"
  );
  let exportButton = findExportButton(tree);
  expect(exportButton.props.filters).toEqual({
    dateFrom: "2026-11-01",
    dateTo: "2026-11-04",
    page: 1,
  });

  filterBar.props.setDraft({
    ...filterBar.props.draft,
    model: "Rascunho não aplicado",
    page: 9,
  });
  tree = renderDashboard();
  exportButton = findExportButton(tree);
  expect(exportButton.props.filters.model).toBeUndefined();
  expect(exportButton.props.filters.page).toBe(1);

  filterBar = findElement(tree, element => element.type?.name === "FilterBar");
  filterBar.props.onSearch();
  tree = renderDashboard();
  exportButton = findExportButton(tree);
  expect(exportButton.props.filters).toMatchObject({
    model: "Rascunho não aplicado",
    page: 1,
  });

  mock.exportCSV.mockResolvedValue({
    fileName: "leads.csv",
    mimeType: "text/csv;charset=utf-8",
    csv: "\uFEFFid\n",
    count: 0,
    nameMasked: false,
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      cutoffDate: "2026-11-04",
    },
  });
  const renderedExportButton = exportButton.type(exportButton.props);
  const exportControl = findElement(
    renderedExportButton,
    element => element.type === "button"
  );
  await exportControl.props.onClick();
  expect(mock.exportCSV).toHaveBeenCalledWith({
    dateFrom: "2026-11-01",
    dateTo: "2026-11-04",
    cutoffDate: "2026-11-04",
    model: "Rascunho não aplicado",
    page: undefined,
    clientMode: false,
  });

  mock.query.mockReturnValue({
    data,
    isLoading: false,
    isFetching: true,
    refetch,
  });
  tree = renderDashboard();
  exportButton = findExportButton(tree);
  expect(exportButton.props.disabled).toBe(true);
});
