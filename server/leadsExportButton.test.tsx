import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LeadsExportResult,
  LeadsExcelExportResult,
} from "../shared/leadsExport";
import type { V2Filters } from "../shared/v2Types";

const hooks = vi.hoisted(() => ({
  stateIndex: 0,
  refIndex: 0,
  values: [] as any[],
  setters: [] as any[],
  refs: [] as any[],
  effects: [] as (() => unknown)[],
  mutate: vi.fn(),
  mutateExcel: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  link: {
    href: "",
    download: "",
    click: vi.fn(),
    remove: vi.fn(),
  },
  appendChild: vi.fn(),
}));

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.stateIndex++;
      if (!(index in hooks.values))
        hooks.values[index] =
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
      hooks.setters[index] ??= vi.fn((next: unknown) => {
        hooks.values[index] =
          typeof next === "function"
            ? (next as (current: unknown) => unknown)(hooks.values[index])
            : next;
      });
      return [hooks.values[index], hooks.setters[index]];
    },
    useRef: (initial: unknown) => {
      const index = hooks.refIndex++;
      hooks.refs[index] ??= { current: initial };
      return hooks.refs[index];
    },
    useEffect: (effect: () => unknown) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        leads: {
          exportCSV: { mutate: hooks.mutate },
          exportExcel: { mutate: hooks.mutateExcel },
        },
      },
    }),
  },
}));

import { V2LeadsExportButton } from "../client/src/components/V2LeadsExportButton";

const filters: V2Filters = {
  dateFrom: "2026-10-01",
  dateTo: "2026-10-31",
  model: "MG 4",
  channel: "Meta",
  campaign: "Campanha Teste",
  dealer: "MG Motors Centro",
  search: "Belo Horizonte",
  page: 7,
};

function exportResult(
  changes: Partial<LeadsExportResult> = {}
): LeadsExportResult {
  return {
    fileName: "leads-2026-10.csv",
    mimeType: "text/csv;charset=utf-8",
    csv: "\uFEFFdate,name\n2026-10-01,Ana\n",
    count: 51,
    nameMasked: false,
    period: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      cutoffDate: "2026-10-31",
    },
    ...changes,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function render(
  overrides: Partial<Parameters<typeof V2LeadsExportButton>[0]> = {}
) {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  return V2LeadsExportButton({
    filters,
    count: 51,
    clientMode: false,
    ...overrides,
  });
}

function button(tree: any, format: "csv" | "xlsx" = "csv"): any {
  if (!tree) return undefined;
  if (Array.isArray(tree))
    return tree.map(child => button(child, format)).find(Boolean);
  if (tree.type === "button" && tree.props["data-export-format"] === format)
    return tree;
  return button(tree.props?.children, format);
}

async function settle<T>(promise: Promise<T>) {
  await promise;
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  hooks.values = [];
  hooks.setters = [];
  hooks.refs = [];
  hooks.effects = [];
  hooks.mutate.mockReset();
  hooks.mutateExcel.mockReset();
  hooks.createObjectURL.mockReset().mockReturnValue("blob:test-export");
  hooks.revokeObjectURL.mockReset();
  hooks.link.href = "";
  hooks.link.download = "";
  hooks.link.click.mockReset();
  hooks.link.remove.mockReset();
  hooks.appendChild.mockReset();
  vi.stubGlobal("URL", {
    createObjectURL: hooks.createObjectURL,
    revokeObjectURL: hooks.revokeObjectURL,
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => hooks.link),
    body: { appendChild: hooks.appendChild },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("V2LeadsExportButton", () => {
  const xlsxResult = (
    changes: Partial<LeadsExcelExportResult> = {}
  ): LeadsExcelExportResult => ({
    fileName: "leads_2026-10-01_2026-10-31.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsxBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).toString(
      "base64"
    ),
    count: 51,
    nameMasked: false,
    period: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      cutoffDate: "2026-10-31",
    },
    ...changes,
  });

  it("offers Excel and CSV with contact fields in both languages", () => {
    const en = render({ locale: "en" });
    expect(button(en, "xlsx").props.children).toContain("Download Excel");
    expect(button(en, "csv").props.children).toContain("Download CSV");
    expect(button(en, "xlsx").props.title).toContain(
      "full name, email, phone and vehicle"
    );
    const pt = render();
    expect(button(pt, "xlsx").props.children).toContain("Exportar Excel");
    expect(button(pt, "csv").props.title).toContain(
      "nome completo, e-mail, telefone"
    );
  });

  it("downloads Excel bytes, not base64 text, with the applied filters and no pagination", async () => {
    const result = xlsxResult();
    hooks.mutateExcel.mockResolvedValue(result);
    await settle(button(render(), "xlsx").props.onClick());
    expect(hooks.mutateExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        ...filters,
        page: undefined,
        clientMode: false,
      })
    );
    expect(hooks.mutate).not.toHaveBeenCalled();
    const blob = hooks.createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe(result.mimeType);
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      0x50, 0x4b, 0x03, 0x04, 1, 2, 3,
    ]);
    expect(hooks.link.download).toBe(result.fileName);
    expect(hooks.link.click).toHaveBeenCalledOnce();
    expect(hooks.values[1]).toContain("51 oportunidades exportadas (Excel)");
    vi.advanceTimersByTime(1000);
    expect(hooks.revokeObjectURL).toHaveBeenCalledWith("blob:test-export");
  });

  it("uses one lock across Excel and CSV while exporting", async () => {
    const pending = deferred<LeadsExcelExportResult>();
    hooks.mutateExcel.mockReturnValue(pending.promise);
    const tree = render();
    const first = button(tree, "xlsx").props.onClick();
    await button(tree, "csv").props.onClick();
    expect(hooks.mutateExcel).toHaveBeenCalledOnce();
    expect(hooks.mutate).not.toHaveBeenCalled();
    expect(button(render(), "xlsx").props.disabled).toBe(true);
    expect(button(render(), "csv").props.disabled).toBe(true);
    pending.resolve(xlsxResult({ count: 0 }));
    await settle(first);
  });

  it("rejects an unmasked Excel response in presentation mode", async () => {
    hooks.mutateExcel.mockResolvedValue(xlsxResult({ nameMasked: false }));
    await settle(button(render({ clientMode: true }), "xlsx").props.onClick());
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    expect(hooks.values[2]).toBe(true);
  });

  it("does not download an Excel response with stale filters or the wrong format", async () => {
    const pending = deferred<LeadsExcelExportResult>();
    hooks.mutateExcel.mockReturnValue(pending.promise);
    const request = button(render(), "xlsx").props.onClick();
    render({ filters: { ...filters, dealer: "Dealer diferente" } });
    pending.resolve(xlsxResult());
    await settle(request);
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    hooks.mutateExcel.mockResolvedValue(exportResult());
    await settle(button(render(), "xlsx").props.onClick());
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects non-Excel binary content and a mismatched period", async () => {
    hooks.mutateExcel.mockResolvedValue(
      xlsxResult({ xlsxBase64: Buffer.from("not a ZIP").toString("base64") })
    );
    await settle(button(render(), "xlsx").props.onClick());
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    hooks.mutateExcel.mockResolvedValue(
      xlsxResult({
        period: {
          dateFrom: "2026-10-02",
          dateTo: filters.dateTo,
          cutoffDate: "2026-10-31",
        },
      })
    );
    await settle(button(render(), "xlsx").props.onClick());
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
  });

  it("bloqueia zero registros, estado não READY do pai e o botão ocupado", async () => {
    expect(button(render({ count: 0 })).props.disabled).toBe(true);
    expect(button(render({ count: 51, disabled: true })).props.disabled).toBe(
      true
    );

    const pending = deferred<LeadsExportResult>();
    hooks.mutate.mockReturnValue(pending.promise);
    const request = button(render()).props.onClick();
    expect(button(render()).props.disabled).toBe(true);
    expect(hooks.mutate).toHaveBeenCalledOnce();

    pending.resolve(exportResult({ count: 0 }));
    await settle(request);
  });

  it("rejects a masked response when the requested view includes complete contacts", async () => {
    hooks.mutate.mockResolvedValue(exportResult({ nameMasked: true }));
    await settle(button(render({ clientMode: false }), "csv").props.onClick());
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    hooks.mutateExcel.mockResolvedValue(xlsxResult({ nameMasked: true }));
    await settle(button(render({ clientMode: false }), "xlsx").props.onClick());
    expect(hooks.createObjectURL).not.toHaveBeenCalled();
  });

  it("envia um snapshot com todas as dimensões, modo cliente e page indefinida", async () => {
    hooks.mutate.mockResolvedValue(exportResult({ count: 0 }));
    const request = button(render({ clientMode: true })).props.onClick();

    expect(hooks.mutate).toHaveBeenCalledWith({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      model: "MG 4",
      channel: "Meta",
      campaign: "Campanha Teste",
      dealer: "MG Motors Centro",
      search: "Belo Horizonte",
      page: undefined,
      clientMode: true,
    });
    await settle(request);
  });

  it("não dispara duas exportações enquanto a primeira está pendente", async () => {
    const pending = deferred<LeadsExportResult>();
    hooks.mutate.mockReturnValue(pending.promise);
    const tree = render();
    const first = button(tree).props.onClick();

    button(tree).props.onClick();
    expect(hooks.mutate).toHaveBeenCalledOnce();
    expect(button(render()).props.disabled).toBe(true);

    pending.resolve(exportResult({ count: 0 }));
    await settle(first);
  });

  it("descarta o resultado obsoleto depois de mudança de filtro sem novo clique", async () => {
    const pending = deferred<LeadsExportResult>();
    hooks.mutate.mockReturnValue(pending.promise);
    const first = button(render()).props.onClick();

    render({ filters: { ...filters, model: "MG 5" } });
    pending.resolve(exportResult());
    await settle(first);

    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    expect(hooks.values[1]).toBe(
      "Os filtros mudaram. Exporte novamente o recorte atual."
    );
    expect(hooks.values[2]).toBe(true);
  });

  it("não publica eventos nem baixa arquivo depois do unmount", async () => {
    const pending = deferred<LeadsExportResult>();
    hooks.mutate.mockReturnValue(pending.promise);
    const tree = render();
    const cleanup = hooks.effects[0]?.() as (() => void) | undefined;
    const request = button(tree).props.onClick();
    const setterCallsBeforeUnmount = hooks.setters.map(
      setter => setter.mock.calls.length
    );

    cleanup?.();
    pending.resolve(exportResult());
    await settle(request);

    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    expect(hooks.values[0]).toBe(true);
    expect(hooks.setters.map(setter => setter.mock.calls.length)).toEqual(
      setterCallsBeforeUnmount
    );
  });

  it("libera a trava após erro da API e permite nova tentativa", async () => {
    hooks.mutate
      .mockRejectedValueOnce(new Error("detalhe interno"))
      .mockResolvedValueOnce(exportResult({ count: 0 }));

    await settle(button(render()).props.onClick());
    expect(hooks.values[0]).toBe(false);
    expect(hooks.values[2]).toBe(true);
    expect(hooks.values[1]).toContain("Não foi possível exportar");

    await settle(button(render()).props.onClick());
    expect(hooks.mutate).toHaveBeenCalledTimes(2);
  });

  it("exige nameMasked no modo cliente e não baixa resposta desmascarada", async () => {
    hooks.mutate.mockResolvedValue(exportResult({ nameMasked: false }));

    await settle(button(render({ clientMode: true })).props.onClick());

    expect(hooks.createObjectURL).not.toHaveBeenCalled();
    expect(hooks.values[2]).toBe(true);
    expect(hooks.values[1]).toContain("Não foi possível exportar");
  });

  it("baixa CSV BOM com mais de 50 registros, nome correto e revoga a URL no timer", async () => {
    const result = exportResult({
      count: 51,
      nameMasked: true,
      fileName: "leads-client-2026-10.csv",
    });
    hooks.mutate.mockResolvedValue(result);

    await settle(button(render({ clientMode: true })).props.onClick());

    expect(hooks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ clientMode: true, page: undefined })
    );
    expect(hooks.createObjectURL).toHaveBeenCalledOnce();
    const blob = hooks.createObjectURL.mock.calls[0][0] as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(blob.size).toBe(new TextEncoder().encode(result.csv).length);
    expect(hooks.appendChild).toHaveBeenCalledWith(hooks.link);
    expect(hooks.link.download).toBe("leads-client-2026-10.csv");
    expect(hooks.link.click).toHaveBeenCalledOnce();
    expect(hooks.link.remove).toHaveBeenCalledOnce();
    expect(hooks.values[1]).toContain("51 oportunidades exportadas (CSV)");
    expect(hooks.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(hooks.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.revokeObjectURL).toHaveBeenCalledWith("blob:test-export");
  });

  it("revoga URL pendente e cancela o timer durante o unmount", async () => {
    hooks.mutate.mockResolvedValue(exportResult());
    const tree = render();
    await settle(button(tree).props.onClick());
    const cleanup = hooks.effects[0]?.() as (() => void) | undefined;

    cleanup?.();
    expect(hooks.revokeObjectURL).toHaveBeenCalledOnce();
    expect(hooks.revokeObjectURL).toHaveBeenCalledWith("blob:test-export");
    vi.advanceTimersByTime(1000);
    expect(hooks.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
