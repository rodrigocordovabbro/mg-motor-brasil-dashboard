import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { MonthlyMediaPlan } from "../shared/v2MediaPlan";
import type { MediaPlanProjectionRead } from "../shared/v2MediaPlanProjections";

const mock = vi.hoisted(() => ({
  plans: [] as MonthlyMediaPlan[],
  role: "client",
  username: "cliente",
  loading: false,
  error: null as Error | null,
  projection: undefined as MediaPlanProjectionRead | undefined,
  save: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({
          data: { role: mock.role, username: mock.username },
        }),
      },
    },
    mediaPlan: {
      plans: {
        useQuery: () => ({
          data: mock.plans,
          isLoading: mock.loading,
          error: mock.error,
        }),
      },
      projections: {
        useQuery: () => ({
          data: mock.projection,
          isFetching: false,
          error: null,
        }),
      },
      updateProjections: { useMutation: () => ({ mutateAsync: mock.save }) },
    },
    useUtils: () => ({
      mediaPlan: {
        plans: { invalidate: vi.fn() },
        projections: { invalidate: vi.fn() },
      },
    }),
  },
}));
import {
  MediaChannelTick,
  MediaPlanDashboard,
} from "../client/src/components/MediaPlanDashboard";

// Fixture isolada: nunca consultada ou gravada no banco real.
const fixture: MonthlyMediaPlan = {
  month: "2026-10",
  titlePt: "Plano de Mídia — Outubro de 2026",
  titleEn: "Media plan — October 2026",
  sourceFile: "fixture.xlsx",
  sourceSheet: "Media",
  formulaCount: 0,
  updatedAt: "2026-10-01T12:00:00Z",
  mode: "FINANCIAL",
  sourceNotePt: "Fonte isolada de teste.",
  sourceNoteEn: "Isolated test source.",
  rows: [
    {
      id: "fixture-row",
      sourceRow: 1,
      channel: "Meta Ads (via Publya)",
      product: "Line-up",
      investment: 1000,
      commission: 40,
      netInvestment: 960,
      leads: 10,
      cpl: 96,
    },
  ],
  totals: [
    {
      sourceRow: 2,
      label: "Line-up",
      product: "Line-up",
      investment: 1000,
      commission: 40,
      netInvestment: 960,
      leads: 10,
      cpl: 96,
    },
  ],
  total: {
    sourceRow: 3,
    label: "Total",
    product: null,
    investment: 1000,
    commission: 40,
    netInvestment: 960,
    leads: 10,
    cpl: 96,
  },
};
beforeEach(() => {
  mock.plans = [structuredClone(fixture)];
  mock.role = "client";
  mock.username = "cliente";
  mock.loading = false;
  mock.error = null;
  mock.projection = undefined;
  mock.save.mockClear();
});
function html() {
  return renderToStaticMarkup(<MediaPlanDashboard initialMonth="2026-10" />);
}
function kpi(markup: string, id: string) {
  return (
    markup
      .split(`data-testid="media-plan-kpi-${id}"`)[1]
      ?.split("</div></div>")[0] ?? ""
  );
}

describe("layout integral do Plano de Mídia", () => {
  it("usa a largura do contêiner principal sem centralizador ou margens duplicadas", () => {
    const markup = html();
    expect(markup).toMatch(
      /^<div data-testid="media-plan-dashboard" class="w-full min-w-0 space-y-5 pb-6 text-sm">/
    );
    expect(markup).not.toContain("max-w-[1680px]");
    expect(markup).not.toContain("<main");
    expect(markup).toContain("lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]");
    expect(markup).toContain("text-[28px]");
    expect(markup).toContain("text-lg font-semibold");
    expect(markup).not.toContain("text-[9px]");
    expect(markup).not.toContain("text-[10px]");
  });
  it("mantém conciliação em faixa própria entre a alocação e a tabela", () => {
    const markup = html();
    expect(markup).toContain(
      '</section><section data-testid="media-plan-reconciliation"'
    );
    expect(markup.indexOf("media-plan-allocation")).toBeLessThan(
      markup.indexOf("media-plan-reconciliation")
    );
    expect(markup.indexOf("media-plan-reconciliation")).toBeLessThan(
      markup.indexOf('aria-label="Plano de mídia detalhado"')
    );
    expect(markup).toContain("sm:grid-cols-2 xl:grid-cols-4");
  });
  it("contém a rolagem da tabela e permite acesso por teclado", () => {
    const markup = html();
    expect(markup).toContain(
      'class="mg-media-table-scroll" role="region" aria-label="Plano de mídia detalhado" tabindex="0"'
    );
    expect(markup).toContain("min-w-[1380px] w-full text-left tabular-nums");
    const css = readFileSync(
      new URL("../client/src/index.css", import.meta.url),
      "utf8"
    );
    expect(css).toMatch(/\.mg-media-table-scroll\s*\{[^}]*overflow-x: auto/);
    expect(css).toContain(".mg-media-table-scroll:focus-visible");
    expect(css).toContain(".mg-media-table-scroll td:nth-child(n + 5)");
  });
  it("preserva fonte, orçamento, leads, CPL e valores não informados sem salvar nada", () => {
    const before = structuredClone(mock.plans);
    const markup = html();
    expect(kpi(markup, "gross")).toContain("1.000");
    expect(kpi(markup, "net")).toContain("960");
    expect(kpi(markup, "leads")).toMatch(/>10$/);
    expect(kpi(markup, "cpl")).toContain("96,00");
    expect(markup).toContain("N/D");
    expect(markup).toContain("Fonte isolada de teste.");
    expect(markup).not.toContain("Editar projeções");
    expect(mock.plans).toEqual(before);
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("preserva total manual e permissão de edição exclusiva do proprietário", () => {
    mock.role = "admin";
    mock.username = "rodrigo";
    mock.projection = {
      monthId: "2026-10",
      version: 2,
      values: { globalLeads: 20, products: {}, rows: {} },
    };
    const markup = html();
    expect(kpi(markup, "leads")).toMatch(/>20$/);
    expect(kpi(markup, "cpl")).toContain("48,00");
    expect(markup).toContain("Total manual; projeções detalhadas mantidas.");
    expect(markup).toContain("Editar projeções");
    expect(mock.plans[0].total.leads).toBe(10);
    expect(mock.plans[0].rows[0].leads).toBe(10);
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("mantém estados de carregamento, falha e mês ausente sem dados artificiais", () => {
    mock.loading = true;
    expect(html()).toContain("Carregando plano aprovado");
    mock.loading = false;
    mock.error = new Error("fixture");
    expect(html()).toContain("Plano indisponível");
    mock.error = null;
    mock.plans = [];
    const markup = html();
    expect(markup).toContain("Nenhum plano disponível para este mês");
    expect(markup).not.toContain("media-plan-kpi");
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("quebra nomes longos de canais em linhas sem abreviar o conteúdo", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <MediaChannelTick
          x={144}
          y={40}
          payload={{ value: "Meta Ads (via Publya)" }}
        />
      </svg>
    );
    expect(markup).toContain('font-size="12"');
    expect(markup).toContain("<title>Meta Ads (via Publya)</title>");
    expect((markup.match(/<tspan/g) ?? []).length).toBe(2);
    expect(markup).toContain("Meta Ads (via");
    expect(markup).toContain("Publya)");
  });
});
