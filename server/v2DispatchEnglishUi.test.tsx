import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchReport } from "../shared/v2Dispatch";

const state = vi.hoisted(() => ({
  report: null as DispatchReport | null,
  role: "admin" as "admin" | "client" | "bbro",
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
        leadControl: { invalidate: vi.fn(), setData: vi.fn() },
        report: { invalidate: vi.fn(), setData: vi.fn() },
        reports: { invalidate: vi.fn() },
        history: { invalidate: vi.fn() },
      },
    }),
    auth: {
      me: {
        useQuery: () =>
          query({
            id: 1,
            username: "rodrigo",
            role: state.role,
            sessionVersion: 0,
          }),
      },
    },
    dispatch: {
      reports: {
        useQuery: () => query(state.report ? [state.report] : []),
      },
      leadControl: {
        useQuery: () => query(state.report),
      },
      history: { useQuery: () => query([]) },
      prepareLeadControl: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      setManual: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import V2DispatchControl from "../client/src/components/V2DispatchControl";

function TestControl(props: {
  authenticated?: boolean;
  embedded?: boolean;
  canManage?: boolean;
  clientMode?: boolean;
  locale?: "pt-BR" | "en";
}) {
  return V2DispatchControl(props);
}

function renderControl(props: { locale?: "pt-BR" | "en" } = {}) {
  return renderToStaticMarkup(
    React.createElement(TestControl, {
      authenticated: true,
      embedded: true,
      canManage: true,
      clientMode: false,
      ...props,
    })
  );
}

function fixture(): DispatchReport {
  return {
    id: 1,
    title: "Dispatch fixture",
    fileName: "english-ui-test.xlsx",
    dateFrom: "2026-11-04",
    dateTo: "2026-11-04",
    generatedLabel: "Nov 4, 2026",
    importedAt: "2026-11-05T12:00:00Z",
    information: [],
    notes: [],
    days: [
      {
        date: "2026-11-04",
        label: "Nov 04",
        sourceTotal: 3,
        computedTotal: 3,
      },
    ],
    rows: [
      {
        id: 1,
        rowNumber: 5,
        storeName: "Autobrand Recife",
        crmResponsible: "João da Silva",
        syonetIntegration: "OK",
        bbroIntegration: "NO",
        cells: [
          {
            id: 1,
            rowNumber: 5,
            date: "2026-11-04",
            syonet: "OK",
            sourceManual: "OK",
            sourceManualImportedAt: "2026-11-05T12:00:00Z",
            volume: 1234,
            validation: null,
          },
        ],
      },
    ],
    totals: {
      computed: 1234,
      sourceDailySum: 3,
      declaredInInstructions: null,
      sourceManualOk: 1,
      auditedOk: 0,
      manualOverridden: 0,
    },
  };
}

beforeEach(() => {
  state.report = fixture();
  state.role = "admin";
});

describe("V2 dispatch English UI", () => {
  it("renders English SSR copy while preserving raw store and CRM names", () => {
    const html = renderControl({ locale: "en" });

    expect(html).toContain("Stores &amp; CRM — dispatch control");
    expect(html).toContain("STORE NAME");
    expect(html).toContain("CRM owner");
    expect(html).toContain("Syonet integration");
    expect(html).toContain("BBRO API integration");
    expect(html).toContain("Lead Vol.");
    expect(html).toContain("Expand dispatch sheet");
    expect(html).toContain("Store and day control table");
    expect(html).toContain("Dispatch from");
    expect(html).toContain("Through yesterday (D-1)");
    expect(html).toContain("Registered integration");
    expect(html).toContain("Show CRM owners");
    expect(html).toContain("Source: File");
    expect(html).toContain("Autobrand Recife");
    expect(html).toContain("João da Silva");
    expect(html).toContain("1,234");
    expect(html).toContain('style="background-color:#e8f4ef;color:#145645"');
    expect(html).toContain('style="background-color:#17624f"');
    expect(html).not.toContain("NOME DA LOJA");
    expect(html).not.toContain("Responsável por CRM");
    expect(html).not.toContain("Mostrar responsáveis CRM");
  });

  it("keeps the Portuguese default and the same source/manual color treatment", () => {
    const html = renderControl();

    expect(html).toContain("Lojas &amp; CRM — controle de envios");
    expect(html).toContain("NOME DA LOJA");
    expect(html).toContain("Vol. Lead");
    expect(html).toContain("Expandir planilha");
    expect(html).toContain("Origem: Arquivo");
    expect(html).toContain('style="background-color:#e8f4ef;color:#145645"');
    expect(html).toContain('style="background-color:#17624f"');
    expect(html).not.toContain("Lead Vol.");
  });
});
