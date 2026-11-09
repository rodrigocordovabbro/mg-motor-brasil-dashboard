import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeLeadsReload,
  LEADS_RELOAD_VERSION_NOT_CONFIRMED,
  type LeadsReloadResult,
} from "../shared/leadsReload";

const hooks = vi.hoisted(() => ({
  stateIndex: 0,
  refIndex: 0,
  values: [] as any[],
  refs: [] as any[],
  effects: [] as (() => unknown)[],
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.stateIndex++;
      if (!(i in hooks.values)) hooks.values[i] = initial;
      return [
        hooks.values[i],
        (value: unknown) => {
          hooks.values[i] = value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = hooks.refIndex++;
      hooks.refs[i] ??= { current: initial };
      return hooks.refs[i];
    },
    useEffect: (effect: () => unknown) => {
      hooks.effects.push(effect);
    },
  };
});
import { V2LeadsReloadButton } from "../client/src/components/V2LeadsReloadButton";
import { V2LeadsReloadDialog } from "../client/src/components/V2LeadsReloadDialog";

function fixture(change: Partial<LeadsReloadResult> = {}): LeadsReloadResult {
  return {
    competence: "2026-11",
    total: 120,
    monthlyTotal: 150,
    checkedAt: "2026-11-06T03:35:00Z",
    importedAt: "2026-11-05T17:00:00Z",
    latestLeadDate: "2026-11-04",
    requestedDateTo: "2026-11-05",
    newImport: false,
    ...change,
  };
}
function view(
  onReload: () => Promise<LeadsReloadResult>,
  competence = "2026-11",
  syncExternal = false,
  showFeedback = true
) {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  return V2LeadsReloadButton({
    competence,
    onReload,
    syncExternal,
    showFeedback,
  });
}
function popup(tree: any) {
  return tree.props.children[2];
}
function deferred() {
  let resolve!: (value: LeadsReloadResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<LeadsReloadResult>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  hooks.values = [];
  hooks.refs = [];
  hooks.effects = [];
});

describe("consulta da base de Leads", () => {
  it("distingue consulta, cobertura e importação externa sem inventar atualização", () => {
    const message = describeLeadsReload(fixture());
    expect(message).toContain("150 Leads no acumulado de 11/2026");
    expect(message).toContain("04/11/2026");
    expect(message).toContain("05/11/2026");
    expect(message).toContain("Nenhuma nova importação registrada");
    expect(message).toContain("não foi sincronizada por este botão");
  });
  it("informa nova importação somente quando o resultado a identifica", () => {
    const message = describeLeadsReload(
      fixture({ newImport: true, latestLeadDate: "2026-11-05" })
    );
    expect(message).toContain("Nova importação encontrada no banco");
    expect(message).not.toContain("a base ainda não cobre");
  });
  it("resume uma planilha conferida sem declarar importação nova", () => {
    const message = describeLeadsReload(
      fixture({
        sync: { changed: false, inserted: 0, updated: 0, totalRows: 120 },
      })
    );
    expect(message).toContain("Planilha conferida não houve mudanças");
    expect(message).not.toContain("Nova importação encontrada");
  });
  it("trava dois cliques antes da nova renderização e mantém o estado ocupado até concluir", async () => {
    const pending = deferred();
    const reload = vi.fn(() => pending.promise);
    const button = view(reload).props.children[0];
    button.props.onClick();
    button.props.onClick();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(view(reload).props.children[0].props.disabled).toBe(true);
    pending.resolve(fixture());
    await pending.promise;
    await Promise.resolve();
    expect(hooks.values[0]).toBe(false);
    expect(hooks.values[1]).toContain("Consulta concluída");
  });
  it("mantém a ajuda de busy visível quando o feedback final está oculto", async () => {
    const pending = deferred();
    const reload = vi.fn(() => pending.promise);
    view(reload, "2026-11", true, false).props.children[0].props.onClick();
    const busyView = view(reload, "2026-11", true, false);
    expect(busyView.props.children[0].props.disabled).toBe(true);
    expect(busyView.props.children[1].props.children).toContain(
      "Lendo planilha-base e importando"
    );
    pending.resolve(fixture());
    await pending.promise;
    await Promise.resolve();
  });
  it("não informa sucesso se a consulta falha e permite tentar novamente", async () => {
    const pending = deferred();
    const reload = vi.fn(() => pending.promise);
    view(reload).props.children[0].props.onClick();
    pending.reject(new Error("Banco indisponível"));
    await pending.promise.catch(() => {});
    await Promise.resolve();
    expect(hooks.values[2]).toBe(true);
    expect(hooks.values[1]).toContain("dados anteriores foram mantidos");
    expect(hooks.values[0]).toBe(false);
  });
  it("identifica sessão expirada sem vazar o erro técnico", async () => {
    const pending = deferred();
    const reload = () => pending.promise;
    view(reload).props.children[0].props.onClick();
    pending.reject({
      data: { code: "UNAUTHORIZED" },
      message: "private-details",
    });
    await pending.promise.catch(() => {});
    await Promise.resolve();
    expect(hooks.values[1]).toContain("Faça login novamente");
    expect(hooks.values[1]).not.toContain("private-details");
  });
  it("explica FORBIDDEN como operação administrativa sem sugerir alteração de permissões", async () => {
    const pending = deferred();
    const reload = () => pending.promise;
    view(reload, "2026-11", true).props.children[0].props.onClick();
    pending.reject({ data: { code: "FORBIDDEN" }, message: "private-details" });
    await pending.promise.catch(() => {});
    await Promise.resolve();
    expect(hooks.values[1]).toContain("Apenas administradores");
    expect(hooks.values[1]).toContain("Nenhuma permissão foi alterada");
    expect(hooks.values[1]).not.toContain("private-details");
  });
  it("não publica mensagem de uma competência anterior após mudança de mês", async () => {
    const pending = deferred();
    const reload = () => pending.promise;
    view(reload).props.children[0].props.onClick();
    view(reload, "2026-10");
    hooks.effects.at(-1)?.();
    pending.resolve(fixture());
    await pending.promise;
    await Promise.resolve();
    expect(hooks.values[1]).toBeNull();
  });
});

describe("popup da atualização da base de Leads", () => {
  it("abre imediatamente, acompanha os estágios e só mostra sucesso após resolver", async () => {
    const pending = deferred();
    let notifyStage: ((stage: "syncing" | "refreshing") => void) | undefined;
    const reload = vi.fn(
      (onStage?: (stage: "syncing" | "refreshing") => void) => {
        notifyStage = onStage;
        return pending.promise;
      }
    );

    view(reload, "2026-11", true, false).props.children[0].props.onClick();
    let current = popup(view(reload, "2026-11", true, false));
    expect(current.props.open).toBe(true);
    expect(current.props.busy).toBe(true);
    expect(current.props.stage).toBe("syncing");
    expect(current.props.outcome).toBeNull();

    notifyStage?.("refreshing");
    current = popup(view(reload, "2026-11", true, false));
    expect(current.props.stage).toBe("refreshing");
    expect(current.props.outcome).toBeNull();

    pending.resolve(fixture());
    await pending.promise;
    await Promise.resolve();
    current = popup(view(reload, "2026-11", true, false));
    expect(current.props.busy).toBe(false);
    expect(current.props.outcome).toMatchObject({
      type: "success",
      result: { total: 120, monthlyTotal: 150 },
    });
  });

  it("mantém erro de versão não confirmada honesto e permite fechar para tentar de novo", async () => {
    const pending = deferred();
    const reload = vi.fn(() => pending.promise);
    view(reload, "2026-11", true, false).props.children[0].props.onClick();
    pending.reject({ code: LEADS_RELOAD_VERSION_NOT_CONFIRMED });
    await pending.promise.catch(() => {});
    await Promise.resolve();

    const current = popup(view(reload, "2026-11", true, false));
    expect(current.props.open).toBe(true);
    expect(current.props.outcome).toMatchObject({
      type: "error",
      code: LEADS_RELOAD_VERSION_NOT_CONFIRMED,
    });
    expect(current.props.outcome.message).toContain(
      "ainda não confirmou a nova versão"
    );
    expect(current.props.outcome.message).not.toContain(
      "dados anteriores foram mantidos"
    );

    current.props.onClose();
    expect(popup(view(reload, "2026-11", true, false)).props.open).toBe(false);
  });

  it("mantém a tela final aberta até Fechar e permite uma nova tentativa", async () => {
    const first = deferred();
    const second = deferred();
    const reload = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    view(reload).props.children[0].props.onClick();
    first.resolve(fixture());
    await first.promise;
    await Promise.resolve();

    const completed = popup(view(reload));
    expect(completed.props.open).toBe(true);
    expect(completed.props.outcome.result.monthlyTotal).toBe(150);
    expect(completed.props.outcome.result.total).toBe(120);

    completed.props.onClose();
    expect(popup(view(reload)).props.open).toBe(false);
    view(reload).props.children[0].props.onClick();
    expect(reload).toHaveBeenCalledTimes(2);
    second.resolve(fixture({ monthlyTotal: 151 }));
    await second.promise;
    await Promise.resolve();
  });

  it("não permite escape ou clique externo enquanto ocupado nem usa percentual falso", () => {
    const onClose = vi.fn();
    const loading = V2LeadsReloadDialog({
      open: true,
      busy: true,
      stage: "refreshing",
      outcome: null,
      onClose,
    });
    const content = loading.props.children;
    const preventDefault = vi.fn();
    loading.props.onOpenChange(false);
    content.props.onEscapeKeyDown({ preventDefault });
    content.props.onPointerDownOutside({ preventDefault });
    expect(onClose).not.toHaveBeenCalled();
    expect(content.props.showCloseButton).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(loading)).not.toContain("%");

    const completed = V2LeadsReloadDialog({
      open: true,
      busy: false,
      stage: "refreshing",
      outcome: {
        type: "success",
        result: fixture(),
        description: describeLeadsReload(fixture()),
      },
      onClose,
    });
    completed.props.onOpenChange(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("não aplica setters assíncronos depois do unmount", async () => {
    const pending = deferred();
    const reload = vi.fn(() => pending.promise);
    const tree = view(reload);
    const setup = hooks.effects.at(-1);
    const cleanup = setup?.() as (() => void) | undefined;
    tree.props.children[0].props.onClick();
    const busyMessage = hooks.values[1];
    cleanup?.();

    pending.resolve(fixture());
    await pending.promise;
    await Promise.resolve();
    expect(hooks.values[1]).toBe(busyMessage);
    expect(hooks.values[0]).toBe(true);
  });
});
