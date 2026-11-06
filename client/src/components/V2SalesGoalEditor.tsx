import { Check, Edit3, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

const MAX_SALES_TOTAL_GOAL = 10_000_000;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type V2SalesGoalEditorProps = {
  competence: string;
  currentGoal: number | null;
  canManage?: boolean;
  onSaved: () => void;
};

function numberFormat(value: number | null): string {
  return value == null
    ? "Indisponível"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
        value
      );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  )
    return error.message;
  return "Não foi possível salvar a meta total. Tente novamente.";
}

export default function V2SalesGoalEditor({
  competence,
  currentGoal,
  canManage = false,
  onSaved,
}: V2SalesGoalEditorProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(competence);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const auth = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const owner =
    canManage &&
    auth.data?.role === "admin" &&
    auth.data.username === "rodrigo";
  const validMonth = MONTH_PATTERN.test(month);
  const goal = trpc.leads.salesGoal.useQuery(
    { competence: month },
    {
      enabled: open && owner && validMonth,
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
    }
  );
  const update = trpc.leads.updateSalesGoal.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!open) {
      setMonth(competence);
      setDraft("");
      setDirty(false);
    }
  }, [competence, open]);

  useEffect(() => {
    if (open && !dirty && goal.data?.competence === month)
      setDraft(goal.data.goal == null ? "" : String(goal.data.goal));
  }, [open, dirty, goal.data, month]);

  const setOpened = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    setError(null);
    setNotice(null);
    requestId.current += 1;
    if (next) {
      setMonth(competence);
      setDraft("");
      setDirty(false);
    }
  };

  const changeMonth = (next: string) => {
    if (saving) return;
    requestId.current += 1;
    setMonth(next);
    setDraft("");
    setDirty(false);
    setError(null);
    setNotice(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !owner || !validMonth || goal.isFetching || goal.error)
      return;
    const value = draft.trim();
    if (!/^\d+$/.test(value)) {
      setError(
        `Informe uma meta total inteira entre 0 e ${MAX_SALES_TOTAL_GOAL.toLocaleString("pt-BR")}.`
      );
      return;
    }
    const target = Number(value);
    if (
      !Number.isSafeInteger(target) ||
      target < 0 ||
      target > MAX_SALES_TOTAL_GOAL
    ) {
      setError(
        `Informe uma meta total inteira entre 0 e ${MAX_SALES_TOTAL_GOAL.toLocaleString("pt-BR")}.`
      );
      return;
    }
    const savedMonth = month;
    const operation = ++requestId.current;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await update.mutateAsync({ competence: savedMonth, goal: target });
      if (operation !== requestId.current || savedMonth !== month) return;
      await Promise.all([
        utils.leads.salesGoal.invalidate({ competence: savedMonth }),
        utils.leads.dashboard.invalidate(),
        Promise.resolve(onSaved()),
      ]);
      if (operation !== requestId.current || savedMonth !== month) return;
      setNotice(
        `Meta total de ${savedMonth.split("-").reverse().join("/")} salva: ${numberFormat(target)} vendas.`
      );
      setOpen(false);
    } catch (cause) {
      if (operation !== requestId.current || savedMonth !== month) return;
      setError(errorMessage(cause));
    } finally {
      if (operation === requestId.current) setSaving(false);
    }
  };

  if (!owner) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setOpened(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#e2212d] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#c91c28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        <Edit3 className="h-4 w-4" aria-hidden="true" /> Editar meta total
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpened(false);
          }}
        >
          <div
            className="w-[min(420px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-total-goal-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="sales-total-goal-title"
                  className="text-sm font-bold text-slate-900"
                >
                  Meta total mensal de vendas
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  O valor substitui somente o total global do mês. As metas das
                  lojas e dos grupos permanecem no arquivo MetaVendas.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar editor"
                onClick={() => setOpened(false)}
                disabled={saving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <label className="block">
                <span className="v2-label">Competência da meta</span>
                <input
                  type="month"
                  required
                  value={month}
                  disabled={saving}
                  onChange={event => changeMonth(event.target.value)}
                  className="v2-input w-full"
                />
              </label>
              {month === competence &&
              currentGoal != null &&
              goal.data?.goal == null ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                  Valor atual exibido no dashboard (fallback importado):{" "}
                  <strong>{numberFormat(currentGoal)}</strong>. Salvar cria um
                  override manual explícito.
                </p>
              ) : null}
              <label className="block">
                <span className="v2-label">Novo total de vendas</span>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  max={MAX_SALES_TOTAL_GOAL}
                  step={1}
                  value={draft}
                  disabled={
                    saving ||
                    goal.isFetching ||
                    !validMonth ||
                    Boolean(goal.error)
                  }
                  onChange={event => {
                    setDraft(event.target.value);
                    setDirty(true);
                    setError(null);
                  }}
                  className="v2-input w-full"
                  aria-describedby="sales-total-goal-help"
                />
              </label>
              <p
                id="sales-total-goal-help"
                className="text-[11px] leading-5 text-slate-500"
              >
                Inteiro de 0 a {MAX_SALES_TOTAL_GOAL.toLocaleString("pt-BR")}.
                Zero é válido; vendas reais e metas por loja não são alteradas.
              </p>
              {goal.isFetching ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-xs text-slate-500"
                >
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />{" "}
                  Carregando o override do mês…
                </p>
              ) : null}
              {goal.error ? (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
                >
                  Não foi possível ler o override deste mês.
                  <button
                    type="button"
                    onClick={() => void goal.refetch()}
                    className="ml-2 inline-flex items-center gap-1 font-bold underline"
                  >
                    <RefreshCw className="h-3 w-3" /> Tentar novamente
                  </button>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-xs text-red-700">
                  {error}
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpened(false)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    goal.isFetching ||
                    !validMonth ||
                    Boolean(goal.error)
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#e2212d] px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {saving ? "Salvando…" : "Salvar meta total"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="max-w-[360px] text-right text-[11px] leading-4 text-emerald-700"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
