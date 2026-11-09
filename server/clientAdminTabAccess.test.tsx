import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  index: 0,
  values: [] as any[],
  setters: [] as any[],
  refs: [] as any[],
  dashboardQuery: vi.fn(),
  refetch: vi.fn(),
  replaceState: vi.fn(),
}));

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => {
      const index = mock.index++;
      mock.refs[index] ??= { current: initial };
      return mock.refs[index];
    },
    useState: (initial: any) => {
      const index = mock.index++;
      if (!Object.hasOwn(mock.values, index)) {
        mock.values[index] =
          typeof initial === "function" ? initial() : initial;
      }
      mock.setters[index] ??= vi.fn((next: any) => {
        mock.values[index] =
          typeof next === "function" ? next(mock.values[index]) : next;
      });
      return [mock.values[index], mock.setters[index]];
    },
  };
});

vi.mock("@shared/dashboardDates", () => ({
  addIsoDays: (value: string) => value,
  capDateAtDashboardCutoff: (value: string) => value,
  getDashboardCutoffDate: () => "2026-11-04",
  resolveDashboardPeriod: (dateFrom: string, dateTo: string) => ({
    dateFrom,
    dateTo,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      leads: { dashboard: { invalidate: vi.fn() } },
      dispatch: { leadControl: { invalidate: vi.fn() } },
    }),
    leads: {
      syncBase: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      dashboard: {
        useQuery: (...args: any[]) => mock.dashboardQuery(...args),
      },
    },
  },
}));

import Dashboard from "../client/src/components/V2LeadsDashboard";

type DashboardProps = Partial<Parameters<typeof Dashboard>[0]>;
type BaseTab = "Lojas & CRM" | "Regiões" | "Leads";

const dashboardFixture = {
  status: "READY",
  source: {
    name: "isolated test source",
    importedAt: "2026-11-04T12:00:00.000Z",
    mode: "authenticated-import",
    totalRows: 1,
    invalidDateRows: 0,
    latestLeadDate: "2026-11-04",
  },
  period: {
    dateFrom: "2026-11-01",
    dateTo: "2026-11-04",
    cutoffDate: "2026-11-04",
  },
  options: { models: [], channels: [], campaigns: [], dealers: [] },
} as any;

function createWindow(search = "?module=leads") {
  return {
    location: {
      href: `https://mgmotors.test/${search}`,
      search,
    },
    history: { replaceState: mock.replaceState },
    requestAnimationFrame: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scrollY: 0,
    scrollTo: vi.fn(),
  };
}

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

function findAll(node: any, predicate: (element: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap(item => findAll(item, predicate));
  if (!node || typeof node !== "object" || !node.props) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...findAll(node.props.children, predicate),
  ];
}

function renderDashboard(props: DashboardProps = {}) {
  mock.index = 0;
  return Dashboard({
    authenticated: true,
    clientMode: false,
    canManage: false,
    clientView: false,
    overviewOnly: false,
    locale: "pt-BR",
    ...props,
  });
}

function navigation(tree: any) {
  const result = findElement(
    tree,
    element => element.type?.name === "LeadsSectionNavigation"
  );
  expect(result).not.toBeNull();
  return result;
}

function panel(tree: any) {
  const result = findElement(tree, element => element.props.id === "mg-leads-panel");
  expect(result).not.toBeNull();
  return result;
}

function renderNavigationButtons(tree: any) {
  const nav = navigation(tree);
  return findAll(
    nav.type(nav.props),
    element => element.type === "button" && element.props.role === "tab"
  );
}

beforeEach(() => {
  vi.stubGlobal("window", createWindow());
  mock.index = 0;
  mock.values = [];
  mock.setters = [];
  mock.refs = [];
  mock.replaceState.mockReset();
  mock.refetch.mockReset();
  mock.dashboardQuery.mockReset().mockReturnValue({
    data: dashboardFixture,
    isLoading: false,
    isFetching: false,
    refetch: mock.refetch,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acesso e persistência das abas do dashboard de Leads", () => {
  it.each([
    {
      name: "client_admin",
      props: {
        canManage: false,
        clientView: true,
        overviewOnly: false,
        locale: "en" as const,
      },
    },
    {
      name: "BBRO",
      props: {
        canManage: false,
        clientView: false,
        overviewOnly: false,
        locale: "en" as const,
      },
    },
  ])(
    "mantém $name em Stores & CRM, Regions e Leads após os efeitos",
    ({ props }) => {
      let tree = renderDashboard(props);

      for (const [tab, content] of [
        ["Lojas & CRM", "StoresCrmTab"],
        ["Regiões", "RegionsTab"],
        ["Leads", "LeadsTableTab"],
      ] as const) {
        navigation(tree).props.onChange(tab as BaseTab);

        // The first render contains the pre-effect tree. The second one proves
        // that the state survives the real normalization effect.
        renderDashboard(props);
        tree = renderDashboard(props);

        expect(navigation(tree).props.activeTab).toBe(tab);
        expect(
          findElement(panel(tree), element => element.type?.name === content)
        ).not.toBeNull();
      }
    }
  );

  it("mantém o cliente restrito somente em Overview mesmo após tentativa de troca", () => {
    const props = {
      canManage: false,
      clientView: true,
      overviewOnly: true,
      locale: "en" as const,
    };
    let tree = renderDashboard(props);

    expect(navigation(tree).props.activeTab).toBe("Visão Geral");
    const buttons = renderNavigationButtons(tree);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.children).toContain("Overview");
    expect(
      findElement(panel(tree), element => element.type?.name === "OverviewTab")
    ).not.toBeNull();

    navigation(tree).props.onChange("Leads");
    renderDashboard(props);
    tree = renderDashboard(props);

    expect(navigation(tree).props.activeTab).toBe("Visão Geral");
    expect(
      findElement(panel(tree), element => element.type?.name === "OverviewTab")
    ).not.toBeNull();
  });

  it.each([
    {
      name: "client_admin",
      props: {
        canManage: false,
        clientView: true,
        overviewOnly: false,
        locale: "en" as const,
      },
    },
    {
      name: "BBRO",
      props: {
        canManage: false,
        clientView: false,
        overviewOnly: false,
        locale: "en" as const,
      },
    },
  ])(
    "nega a aba administrativa de análise por modelo para $name",
    ({ props }) => {
      vi.stubGlobal("window", createWindow("?module=leads&tab=model-analysis"));
      let tree = renderDashboard(props);

      expect(navigation(tree).props.activeTab).toBe("Visão Geral");
      expect(
        renderNavigationButtons(tree).some(button =>
          String(button.props.children).includes("Model analysis")
        )
      ).toBe(false);

      navigation(tree).props.onChange("Análise por modelo");
      renderDashboard(props);
      tree = renderDashboard(props);

      expect(navigation(tree).props.activeTab).toBe("Visão Geral");
      expect(mock.replaceState).toHaveBeenCalled();
    }
  );
});
