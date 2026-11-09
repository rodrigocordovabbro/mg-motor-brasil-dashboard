import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadsExportResult } from "../shared/leadsExport";
import type { V2Filters } from "../shared/v2Types";

const hooks = vi.hoisted(() => ({
  stateIndex: 0,
  refIndex: 0,
  values: [] as any[],
  setters: [] as any[],
  refs: [] as any[],
  effects: [] as (() => unknown)[],
  mutate: vi.fn(),
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
      client: { leads: { exportCSV: { mutate: hooks.mutate } } },
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

function button(tree: any) {
  return tree.props.children[0];
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
    expect(hooks.values[1]).toContain("51 Leads exportados");
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
