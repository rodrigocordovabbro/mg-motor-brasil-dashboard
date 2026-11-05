import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchReport } from "../shared/v2Dispatch";
const state = vi.hoisted(() => ({
  report: null as unknown,
  list: [] as unknown[],
  error: null as unknown,
}));
vi.mock("@shared/dashboardDates", () => ({
  getDashboardCutoffDate: () => "2026-11-04",
}));
const query = (data: unknown, error: unknown = null) => ({
  data,
  error,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(),
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dispatch: {
        report: { invalidate: vi.fn(), setData: vi.fn() },
        reports: { invalidate: vi.fn() },
        history: { invalidate: vi.fn() },
      },
    }),
    dispatch: {
      reports: { useQuery: () => query(state.list, state.error) },
      report: { useQuery: () => query(state.report) },
      history: { useQuery: () => query([]) },
      prepareDay: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      importWorkbook: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      setManual: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
}));
import V2DispatchControl from "../client/src/components/V2DispatchControl";
function TestControl(props: {
  authenticated?: boolean;
  embedded?: boolean;
  clientMode?: boolean;
}) {
  return V2DispatchControl(props);
}
function fixture(): DispatchReport {
  return {
    id: 1,
    title: "Envios teste",
    fileName: "fixture-test-only.xlsx",
    dateFrom: "2026-11-04",
    dateTo: "2026-11-05",
    generatedLabel: "05/11/2026",
    importedAt: "2026-11-05T12:00:00Z",
    information: [],
    notes: [],
    days: [
      { date: "2026-11-04", label: "04/nov", sourceTotal: 3, computedTotal: 3 },
      { date: "2026-11-05", label: "05/nov", sourceTotal: 9, computedTotal: 9 },
    ],
    rows: [
      {
        id: 1,
        rowNumber: 5,
        storeName: "Loja  teste (EM BREVE)",
        crmResponsible: "Contato de teste restrito",
        syonetIntegration: "OK",
        bbroIntegration: "NÃO",
        cells: [
          {
            id: 1,
            rowNumber: 5,
            date: "2026-11-04",
            syonet: "OK",
            sourceManual: "OK",
            volume: 3,
            validation: null,
          },
          {
            id: 2,
            rowNumber: 5,
            date: "2026-11-05",
            syonet: "OK",
            sourceManual: "",
            volume: 9,
            validation: null,
          },
        ],
      },
    ],
    totals: {
      computed: 12,
      sourceDailySum: 12,
      declaredInInstructions: null,
      sourceManualOk: 1,
      auditedOk: 0,
      manualOverridden: 0,
    },
  };
}
beforeEach(() => {
  state.report = fixture();
  state.list = [state.report];
  state.error = null;
});
describe("Lojas & CRM operational clone", () => {
  it("renders exact column groups and names, only through D-1", () => {
    const html = renderToStaticMarkup(
      React.createElement(TestControl, {
        authenticated: true,
        embedded: true,
        clientMode: false,
      })
    );
    expect(html).toContain("NOME DA LOJA");
    expect(html).toContain("Integração Syonet");
    expect(html).toContain("Integração API BBRO");
    expect(html).toContain("Vol. Lead");
    expect(html).toContain("LEADs Status");
    expect(html).toContain("Loja  teste (EM BREVE)");
    expect(html).toContain("Contato de teste restrito");
    expect(html).toContain("04/nov");
    expect(html).not.toContain("05/nov");
    expect(html).not.toContain("Como ler");
    expect(html).toContain("checked");
  });
  it("hides CRM contacts in client presentation unless explicitly shown", () => {
    const html = renderToStaticMarkup(
      React.createElement(TestControl, {
        authenticated: true,
        clientMode: true,
      })
    );
    expect(html).toContain("Restrito");
    expect(html).not.toContain("Contato de teste restrito");
  });
  it("does not invent zero volume or OK for a day awaiting source", () => {
    const report = fixture();
    report.days = [
      {
        date: "2026-11-04",
        label: "04/nov",
        sourceTotal: null,
        computedTotal: null,
        pending: true,
      },
    ];
    report.rows[0].cells = [
      {
        id: 1,
        rowNumber: 5,
        date: "2026-11-04",
        syonet: "",
        sourceManual: "",
        volume: null,
        sourcePending: true,
        validation: null,
      },
    ];
    state.report = report;
    const html = renderToStaticMarkup(
      React.createElement(TestControl, { authenticated: true, embedded: true })
    );
    expect(html).toContain("Aguardando fonte");
    expect(html).toContain("Volume aguardando arquivo atualizado");
    expect(
      html.match(/<input[^>]+aria-label="Manual Pendente[^>]+>/)?.[0]
    ).not.toContain('checked=""');
    expect(html).toContain("Pendente");
  });
  it("announces source-read errors accessibly", () => {
    state.list = [];
    state.report = null;
    state.error = new Error("Falha de leitura teste");
    const html = renderToStaticMarkup(
      React.createElement(TestControl, { authenticated: true })
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Falha de leitura teste");
  });
  it("does not show the operational source without login", () => {
    const html = renderToStaticMarkup(
      React.createElement(TestControl, { authenticated: false })
    );
    expect(html).toContain("Login necessário");
    expect(html).not.toContain("Loja  teste");
  });
});
