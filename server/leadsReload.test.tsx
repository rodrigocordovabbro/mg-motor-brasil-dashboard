import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeLeadsReload,
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
  competence = "2026-11"
) {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  return V2LeadsReloadButton({ competence, onReload });
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
