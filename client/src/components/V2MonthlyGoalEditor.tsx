import { useEffect, useRef, useState } from "react";
import { Check, Edit3, LoaderCircle, RefreshCw, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MAX_GOAL, parseLeadGoal } from "@shared/v2Goals";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function V2MonthlyGoalEditor({
  competence,
  onUpdated,
}: {
  competence: string;
  onUpdated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(competence);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const goal = trpc.leads.goal.useQuery(
    { competence: month },
    { enabled: open && validMonth, retry: false, refetchOnWindowFocus: false }
  );
  const update = trpc.leads.updateGoal.useMutation();
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!open) setMonth(competence);
  }, [competence, open]);
  useEffect(() => {
    if (open && !dirty && goal.data?.competence === month)
      setDraft(goal.data.goal == null ? "" : String(goal.data.goal));
  }, [open, dirty, goal.data, month]);
  const setOpened = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    setError(null);
    if (next) {
      setMonth(competence);
      setDirty(false);
      setDraft("");
      saved.current = false;
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !validMonth || goal.isFetching || goal.error) return;
    setError(null);
    setNotice(null);
    saved.current = false;
    let target: number;
    try {
      target = parseLeadGoal(draft);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Informe uma meta inteira válida."
      );
      return;
    }
    const savedMonth = month;
    setSaving(true);
    try {
      await update.mutateAsync({ competence: savedMonth, goal: target });
      saved.current = true;
      setNotice(
        `Meta de ${savedMonth.split("-").reverse().join("/")} salva: ${target.toLocaleString("pt-BR")} Leads.`
      );
      await Promise.all([
        utils.leads.goal.invalidate({ competence: savedMonth }),
        utils.leads.dashboard.invalidate(),
      ]);
      await onUpdated();
      setOpen(false);
    } catch (cause) {
      if (saved.current) {
        setNotice(
          "Meta salva. Não foi possível recarregar os KPIs; use Atualizar no dashboard."
        );
        setOpen(false);
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível salvar a meta. Tente novamente."
        );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Popover open={open} onOpenChange={setOpened}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#e2212d] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#c91c28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" /> Atualizar metas
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(400px,calc(100vw-24px))] p-4"
          role="dialog"
          aria-labelledby="monthly-lead-goal-title"
        >
          <h3
            id="monthly-lead-goal-title"
            className="text-sm font-bold text-slate-900"
          >
            Meta mensal de Leads
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Escolha o mês e salve a quantidade. Cada competência mantém sua
            própria meta.
          </p>
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <label className="block">
              <span className="v2-label">Competência da meta</span>
              <input
                type="month"
                required
                value={month}
                disabled={saving}
                onChange={event => {
                  setMonth(event.target.value);
                  setDirty(false);
                  setDraft("");
                  setError(null);
                }}
                className="v2-input w-full"
              />
            </label>
            <label className="block">
              <span className="v2-label">Quantidade de Leads no mês</span>
              <input
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={MAX_GOAL}
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
                aria-describedby="goal-number-help"
              />
            </label>
            <p
              id="goal-number-help"
              className="text-[11px] leading-5 text-slate-500"
            >
              Número inteiro de 1 a {MAX_GOAL.toLocaleString("pt-BR")}, sem
              separador de milhar. A meta baliza percentual, ritmo, restante e
              necessário/dia. Leads reais não são alterados.
            </p>
            {goal.isFetching ? (
              <p
                role="status"
                className="flex items-center gap-2 text-xs text-slate-500"
              >
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Carregando
                meta do mês…
              </p>
            ) : null}
            {goal.error ? (
              <div
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
              >
                Não foi possível ler a meta deste mês.
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
                {saving ? "Salvando…" : "Salvar meta"}
              </button>
            </div>
            <p className="text-[11px] leading-5 text-slate-400">
              Meta global do mês; não é aplicada automaticamente a um recorte de
              canal, modelo ou dealer. Cada alteração fica registrada.
            </p>
          </form>
        </PopoverContent>
      </Popover>
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
