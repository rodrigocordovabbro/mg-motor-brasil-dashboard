import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  index: 0,
  refIndex: 0,
  states: [] as any[],
  refs: [] as any[],
  effects: [] as any[],
  preview: vi.fn(),
  commit: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => {
      const i = mocks.index++;
      if (!(i in mocks.states))
        mocks.states[i] = typeof initial === "function" ? initial() : initial;
      return [
        mocks.states[i],
        (next: any) => {
          mocks.states[i] =
            typeof next === "function" ? next(mocks.states[i]) : next;
        },
      ];
    },
    useRef: (initial: any) => {
      const i = mocks.refIndex++;
      mocks.refs[i] ??= { current: initial };
      return mocks.refs[i];
    },
    useMemo: (factory: any) => factory(),
    useEffect: (effect: any) => {
      mocks.effects.push(effect);
    },
  };
});
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      commercial: { status: { invalidate: mocks.invalidate } },
      leads: {
        dashboard: { invalidate: mocks.invalidate },
        goal: { invalidate: mocks.invalidate },
      },
    }),
    commercial: {
      status: {
        useQuery: () => ({
          data: { files: [] },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      preview: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.preview }),
      },
      commit: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.commit }),
      },
      remove: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
    },
  },
}));
import Uploads from "../client/src/components/V2CommercialUploads";
class MockReader {
  static all: MockReader[] = [];
  result: any = null;
  onload: any;
  onerror: any;
  onabort: any;
  onprogress: any;
  readAsDataURL = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    MockReader.all.push(this);
  }
}
function find(node: any, predicate: (x: any) => boolean): any {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
  } else if (node?.props) {
    if (predicate(node)) return node;
    return find(node.props.children, predicate);
  }
  return null;
}
function root() {
  mocks.index = 0;
  mocks.refIndex = 0;
  return Uploads({
    competence: "2026-11",
    canManage: true,
    onUpdated: vi.fn(),
  });
}
function card() {
  return find(root(), x => x.type?.name === "SourceCard");
}
function view() {
  const c = card();
  return c.type(c.props);
}
function button(text: string) {
  return find(
    view(),
    x =>
      x.type === "button" &&
      Array.isArray(x.props.children) &&
      (x.props.children.includes(text) ||
        (text === "Pré-visualizar" &&
          x.props.children.includes("Processando…")))
  );
}
const file = (size = 256, name = "261108_FUP.xlsx") => ({ name, size }) as File;
const preview = {
  kind: "sales",
  competence: "2026-11",
  asOf: "2026-11-07",
  fileName: "261108_FUP.xlsx",
  fileSha256: "test-sha",
  rows: [
    {
      key: "a",
      sourceLabel: "Barigui Curitiba",
      state: "PR",
      value: 0,
      rawDealers: ["Barigui Curitiba"],
    },
  ],
  total: 84,
  warnings: [],
  availableDealers: ["Barigui Curitiba"],
};
async function drain() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
beforeEach(() => {
  mocks.states = [];
  mocks.refs = [];
  mocks.effects = [];
  vi.clearAllMocks();
  MockReader.all = [];
  vi.stubGlobal("FileReader", MockReader);
  mocks.preview.mockResolvedValue(preview);
  mocks.commit.mockResolvedValue({
    total: 84,
    rows: 1,
    alreadyImported: false,
    warnings: [],
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("progresso real do arquivo comercial", () => {
  it("mantém prévia/importação desabilitadas até 100% e só confirma após prévia válida", async () => {
    card().props.onFile(file());
    const r = MockReader.all[0];
    expect(r.readAsDataURL).toHaveBeenCalledOnce();
    expect(card().props.reading).toBe(true);
    expect(
      find(view(), x => x.props.role === "progressbar").props["aria-valuenow"]
    ).toBe(0);
    expect(button("Pré-visualizar")?.props.disabled).toBe(true);
    expect(button("Confirmar arquivo").props.disabled).toBe(true);
    card().props.onPreview();
    expect(mocks.preview).not.toHaveBeenCalled();
    r.onprogress({ lengthComputable: true, total: 256, loaded: 128 });
    expect(
      find(view(), x => x.props.role === "progressbar").props["aria-valuenow"]
    ).toBe(50);
    r.onprogress({ lengthComputable: true, total: 256, loaded: 256 });
    expect(
      find(view(), x => x.props.role === "progressbar").props["aria-valuenow"]
    ).toBe(99);
    r.result =
      "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,dGVzdA==";
    r.onload();
    expect(card().props.reading).toBe(false);
    expect(
      find(view(), x => x.props.role === "progressbar").props["aria-valuenow"]
    ).toBe(100);
    expect(button("Pré-visualizar").props.disabled).toBe(false);
    expect(button("Confirmar arquivo").props.disabled).toBe(true);
    card().props.onPreview();
    await drain();
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(button("Confirmar arquivo").props.disabled).toBe(false);
    card().props.onCommit();
    card().props.onCommit();
    await drain();
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.commit.mock.calls[0][0].base64).toBe("dGVzdA==");
    expect(card().props.draft.readProgress).toBeNull();
    expect(button("Confirmar arquivo").props.disabled).toBe(true);
  });
  it.each(["onerror", "onabort"] as const)(
    "libera leitura após %s e não permite enviar arquivo parcial",
    handler => {
      card().props.onFile(file());
      const r = MockReader.all[0];
      r[handler]?.();
      expect(card().props.reading).toBe(false);
      expect(card().props.draft.base64).toBe("");
      expect(card().props.draft.readProgress).toBeNull();
      expect(card().props.draft.error).toBeTruthy();
      card().props.onPreview();
      expect(mocks.preview).not.toHaveBeenCalled();
      card().props.onFile(file());
      expect(MockReader.all).toHaveLength(2);
    }
  );
  it("não marca 100% se a conversão falha e impede duas leituras simultâneas", () => {
    card().props.onFile(file());
    card().props.onFile(file());
    expect(MockReader.all).toHaveLength(1);
    const r = MockReader.all[0];
    r.result = "";
    r.onload();
    expect(card().props.draft.readProgress).toBeNull();
    expect(card().props.reading).toBe(false);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("rejeita arquivo vazio/grande sem iniciar leitura e sem alterar a fonte ativa", () => {
    card().props.onFile(file(0));
    expect(MockReader.all).toHaveLength(0);
    expect(card().props.draft.error).toContain("vazio");
    card().props.onFile(file(1_048_577));
    expect(MockReader.all).toHaveLength(0);
    expect(card().props.draft.error).toContain("1 MiB");
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("compartilha ocupação com o cartão de metas sem permitir seleção durante outra operação", () => {
    const combined = find(
      root(),
      x => x.type?.name === "V2CombinedGoalsUpload"
    );
    combined.props.onBusyChange(true);
    expect(card().props.busy).toBe(true);
    card().props.onFile(file());
    expect(MockReader.all).toHaveLength(0);
    combined.props.onBusyChange(false);
    card().props.onFile(file());
    expect(MockReader.all).toHaveLength(1);
    expect(
      find(root(), x => x.type?.name === "V2CombinedGoalsUpload").props
        .externalBusy
    ).toBe(true);
  });
  it("aborta a leitura e descarta o callback do arquivo depois de fechar o painel", () => {
    card().props.onFile(file());
    const reader = MockReader.all[0];
    const cleanup = mocks.effects.at(-1)();
    cleanup();
    const before = JSON.parse(JSON.stringify(mocks.states));
    reader.result = "data:application/octet-stream;base64,dGVzdA==";
    reader.onload();
    expect(reader.abort).toHaveBeenCalledOnce();
    expect(mocks.states).toEqual(before);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("não publica uma prévia antiga na interface depois de unmount", async () => {
    let resolvePreview!: (value: unknown) => void;
    mocks.preview.mockReturnValue(
      new Promise(resolve => {
        resolvePreview = resolve;
      })
    );
    card().props.onFile(file());
    const reader = MockReader.all[0];
    reader.result = "data:application/octet-stream;base64,dGVzdA==";
    reader.onload();
    card().props.onPreview();
    const cleanup = mocks.effects.at(-1)();
    cleanup();
    const before = JSON.parse(JSON.stringify(mocks.states));
    resolvePreview(preview);
    await drain();
    expect(mocks.states).toEqual(before);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
