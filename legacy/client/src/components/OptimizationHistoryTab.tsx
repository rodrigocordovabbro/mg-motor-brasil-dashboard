import React from "react";
import { Button } from "@/components/ui/button";
import { CampaignIdentity } from "@/components/CampaignIdentity";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleMinus,
  History,
  Loader2,
  RefreshCcw,
  Search,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type HistoryData = RouterOutputs["dashboard"]["optimizationHistory"];
type HistoryRow = HistoryData["rows"][number];
type ResultFilter = "ALL" | HistoryRow["result"];
type StatusFilter = "ALL" | HistoryRow["taskStatus"];
type NegativeKeywordRow = RouterOutputs["dashboard"]["negativeKeywordHistory"][number];

const MATCH_TYPE_LABELS: Record<NegativeKeywordRow["matchType"], string> = {
  BROAD: "Ampla",
  PHRASE: "Frase",
  EXACT: "Exata",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const ACTION_LABELS: Record<HistoryRow["actionType"], string> = {
  INCREASE_BUDGET: "Aumentar orçamento",
  REDUCE_WASTE: "Reduzir desperdício",
  REVIEW_BIDDING: "Revisar lances",
};

const STATUS_LABELS: Record<HistoryRow["taskStatus"], string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  REOPENED: "Reaberta",
};

const RESULT_LABELS: Record<HistoryRow["result"], string> = {
  IMPROVED: "Melhorou",
  STABLE: "Estável",
  WORSENED: "Piorou",
  AWAITING_DATA: "Aguardando dados",
};

function formatDateTime(value: number | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function resultClass(result: HistoryRow["result"]) {
  if (result === "IMPROVED") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (result === "WORSENED") return "border-red-500/25 bg-red-500/10 text-red-300";
  if (result === "STABLE") return "border-sky-500/25 bg-sky-500/10 text-sky-300";
  return "border-amber-500/25 bg-amber-500/10 text-amber-300";
}

function ResultIcon({ result }: { result: HistoryRow["result"] }) {
  if (result === "IMPROVED") return <TrendingDown className="h-3.5 w-3.5" />;
  if (result === "WORSENED") return <TrendingUp className="h-3.5 w-3.5" />;
  if (result === "STABLE") return <CircleMinus className="h-3.5 w-3.5" />;
  return <CalendarClock className="h-3.5 w-3.5" />;
}

function formatDelta(percent: number | null | undefined, favorableWhenLower = false) {
  if (percent == null) return { label: "Indisponível", className: "text-slate-600" };
  const favorable = favorableWhenLower ? percent < 0 : percent > 0;
  const unfavorable = favorableWhenLower ? percent > 0 : percent < 0;
  return {
    label: `${percent > 0 ? "+" : ""}${NUMBER.format(percent)}%`,
    className: favorable ? "text-emerald-400" : unfavorable ? "text-red-400" : "text-slate-400",
  };
}

export function ComparisonMetric({
  label,
  before,
  after,
  absolute,
  percent,
  format,
  absoluteFormat = format,
  favorableWhenLower = false,
}: {
  label: string;
  before: number | null;
  after: number | null;
  absolute: number | null;
  percent: number | null;
  format: (value: number) => string;
  absoluteFormat?: (value: number) => string;
  favorableWhenLower?: boolean;
}) {
  const delta = formatDelta(percent, favorableWhenLower);
  const absoluteLabel =
    absolute == null ? "Indisponível" : `${absolute > 0 ? "+" : ""}${absoluteFormat(absolute)}`;
  return (
    <div className="rounded-lg border border-[#1c2738] bg-[#080e18] p-3">
      <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-700">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-[8px] uppercase text-slate-700">Antes</p>
          <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{before == null ? "—" : format(before)}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] uppercase text-slate-700">Depois</p>
          <p className="mt-0.5 text-[10px] tabular-nums text-slate-200">{after == null ? "—" : format(after)}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#172131] pt-2 text-[9px] tabular-nums">
        <span className="text-slate-600">Δ abs. <strong className="font-semibold text-slate-400">{absoluteLabel}</strong></span>
        <span className={delta.className}>Δ % <strong className="font-semibold">{delta.label}</strong></span>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "stable" | "bad" | "waiting";
}) {
  const tones = {
    neutral: "border-slate-500/15 text-slate-200",
    good: "border-emerald-500/20 text-emerald-300",
    stable: "border-sky-500/20 text-sky-300",
    bad: "border-red-500/20 text-red-300",
    waiting: "border-amber-500/20 text-amber-300",
  };
  return (
    <div className={`rounded-xl border bg-[#0d1522] px-4 py-3 ${tones[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function OptimizationHistoryTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const utils = trpc.useUtils();
  const history = trpc.dashboard.optimizationHistory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [negativeSearch, setNegativeSearch] = useState("");
  const [negativeDateFrom, setNegativeDateFrom] = useState(dateFrom);
  const [negativeDateTo, setNegativeDateTo] = useState(dateTo);
  const negativeHistoryInput = useMemo(() => ({
    search: negativeSearch.trim() || undefined,
    dateFrom: negativeDateFrom || undefined,
    dateTo: negativeDateTo || undefined,
    limit: 500,
  }), [negativeDateFrom, negativeDateTo, negativeSearch]);
  const negativeHistory = trpc.dashboard.negativeKeywordHistory.useQuery(negativeHistoryInput, {
    refetchOnWindowFocus: false,
  });
  const captureFollowUps = trpc.dashboard.captureOptimizationFollowUps.useMutation({
    onSuccess: () => utils.dashboard.optimizationHistory.invalidate(),
  });
  const [cycleId, setCycleId] = useState("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [result, setResult] = useState<ResultFilter>("ALL");
  const [actionType, setActionType] = useState("ALL");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const rows = history.data?.rows ?? [];
  const eligibleFollowUps = rows.filter(row => {
    if (row.taskStatus !== "COMPLETED" || !row.completedAt) return false;
    return dateFrom > new Date(row.completedAt).toISOString().slice(0, 10);
  }).length;

  const filteredRows = useMemo(() => {
    const campaignNeedle = campaignSearch.trim().toLowerCase();
    const userNeedle = userSearch.trim().toLowerCase();
    return rows.filter(row => {
      const matchesCycle = cycleId === "ALL" || row.cycleId === Number(cycleId);
      const matchesStatus = status === "ALL" || row.taskStatus === status;
      const matchesResult = result === "ALL" || row.result === result;
      const matchesAction = actionType === "ALL" || row.actionType === actionType;
      const matchesCampaign =
        !campaignNeedle ||
        row.campaignName.toLowerCase().includes(campaignNeedle) ||
        row.campaignId.toLowerCase().includes(campaignNeedle);
      const users = [row.createdBy, row.assignee, row.completedBy]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesUser = !userNeedle || users.includes(userNeedle);
      return matchesCycle && matchesStatus && matchesResult && matchesAction && matchesCampaign && matchesUser;
    });
  }, [actionType, campaignSearch, cycleId, result, rows, status, userSearch]);

  function clearFilters() {
    setCycleId("ALL");
    setStatus("ALL");
    setResult("ALL");
    setActionType("ALL");
    setCampaignSearch("");
    setUserSearch("");
  }

  function clearNegativeFilters() {
    setNegativeSearch("");
    setNegativeDateFrom(dateFrom);
    setNegativeDateTo(dateTo);
  }

  if (history.isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-xl border border-[#1e293b] bg-[#0d1421]">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" />
          <p className="mt-3 text-xs text-slate-500">Consolidando histórico de otimizações...</p>
        </div>
      </div>
    );
  }

  if (history.error || !history.data) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-xl border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <h2 className="mt-3 text-sm font-semibold text-white">Não foi possível carregar o histórico</h2>
          <p className="mt-1 text-xs text-slate-500">{history.error?.message ?? "Tente novamente."}</p>
          <Button onClick={() => history.refetch()} className="mt-5 bg-[#e2212d] hover:bg-[#c91622]">
            <RefreshCcw className="mr-2 h-4 w-4" />Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const { summary, methodology, cycleSummaries } = history.data;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] shadow-[0_14px_38px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-4 border-b border-[#1b2535] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e2212d]">
              <History className="h-3.5 w-3.5" />Histórico e efeito observado
            </div>
            <h2 className="mt-1 text-sm font-semibold text-white">Antes e depois das otimizações</h2>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-500">
              Compara janelas persistidas por tarefa. O período posterior só é elegível quando começa depois da conclusão.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => captureFollowUps.mutate({ dateFrom, dateTo })}
            disabled={!eligibleFollowUps || captureFollowUps.isPending}
            className="h-9 bg-[#e2212d] px-4 text-[10px] hover:bg-[#c91622]"
            title={eligibleFollowUps ? "Capturar métricas reais do período selecionado" : "Não há tarefa concluída antes da data inicial selecionada"}
          >
            {captureFollowUps.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            )}
            Capturar período posterior ({eligibleFollowUps})
          </Button>
        </div>
        <div className="border-b border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 text-[10px] leading-5 text-amber-100/65">
          <strong className="text-amber-300">Leitura observacional:</strong> {methodology.disclaimer}
          <span className="ml-1 text-slate-600">Amostra mínima: {methodology.minimumClosedDays} dias fechados.</span>
        </div>
        {captureFollowUps.data ? (
          <div className="border-b border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3 text-[10px] text-emerald-300">
            {captureFollowUps.data.createdCount} acompanhamento(s) criado(s), {captureFollowUps.data.skippedCount} ignorado(s) por duplicidade ou inelegibilidade e {captureFollowUps.data.unavailableCampaignCount} campanha(s) sem dados no período.
          </div>
        ) : null}
        {captureFollowUps.error ? (
          <div className="border-b border-red-500/15 bg-red-500/[0.04] px-4 py-3 text-[10px] text-red-300">
            {captureFollowUps.error.message}
          </div>
        ) : null}
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Tarefas concluídas" value={summary.completed} tone="neutral" />
          <SummaryCard label="Melhorou" value={summary.improved} tone="good" />
          <SummaryCard label="Estável" value={summary.stable} tone="stable" />
          <SummaryCard label="Piorou" value={summary.worsened} tone="bad" />
          <SummaryCard label="Aguardando dados" value={summary.awaitingData} tone="waiting" />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421]">
        <div className="border-b border-[#1b2535] px-4 py-3">
          <h2 className="text-xs font-semibold text-white">Comparativo por ciclo</h2>
          <p className="mt-1 text-[10px] text-slate-600">Resultados observados e variações médias das tarefas com acompanhamento válido.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[10px]">
            <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[8px] uppercase tracking-[0.12em] text-slate-600">
              <tr>
                <th className="px-4 py-3">Ciclo</th>
                <th className="px-3 py-3 text-right">Tarefas</th>
                <th className="px-3 py-3 text-right">Concluídas</th>
                <th className="px-3 py-3 text-right">Melhorou</th>
                <th className="px-3 py-3 text-right">Estável</th>
                <th className="px-3 py-3 text-right">Piorou</th>
                <th className="px-3 py-3 text-right">Aguardando</th>
                <th className="px-3 py-3 text-right">Δ CPA médio</th>
                <th className="px-4 py-3 text-right">Δ conv./dia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182231]">
              {cycleSummaries.map(cycle => {
                const cpaDelta = formatDelta(cycle.averageCpaChangePercent, true);
                const conversionDelta = formatDelta(cycle.averageConversionsPerDayChangePercent);
                return (
                  <tr key={cycle.cycleId} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-300">{cycle.cycleName}</p>
                      <p className="mt-0.5 text-[8px] text-slate-700">{cycle.startDate} — {cycle.endDate ?? "ativo"}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{cycle.totalTasks}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{cycle.completed}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-400">{cycle.improved}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-400">{cycle.stable}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-400">{cycle.worsened}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-400">{cycle.awaitingData}</td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${cpaDelta.className}`}>{cpaDelta.label}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${conversionDelta.className}`}>{conversionDelta.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-violet-500/15 bg-[#0d1421]">
        <div className="flex flex-col gap-3 border-b border-[#1b2535] p-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
              <History className="h-3.5 w-3.5" /> Histórico de palavras-chave negativas
            </div>
            <h2 className="mt-1 text-sm font-semibold text-white">Negativas efetivamente aplicadas</h2>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-500">O registro é criado na conclusão da tarefa. Não é necessário gerar um relatório manual separado.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(240px,1fr)_145px_145px_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute bottom-2.5 left-3 h-3.5 w-3.5 text-slate-600" />
              <span className="text-[9px] font-medium text-slate-600">Termo, campanha ou responsável</span>
              <Input value={negativeSearch} onChange={event => setNegativeSearch(event.target.value)} placeholder="Buscar no histórico..." className="mt-1 h-9 border-[#273247] bg-[#101827] pl-9 text-[10px] text-white placeholder:text-slate-700" />
            </label>
            <label className="text-[9px] font-medium text-slate-600">De
              <Input type="date" value={negativeDateFrom} onChange={event => setNegativeDateFrom(event.target.value)} className="mt-1 h-9 border-[#273247] bg-[#101827] text-[10px] text-slate-300" />
            </label>
            <label className="text-[9px] font-medium text-slate-600">Até
              <Input type="date" value={negativeDateTo} onChange={event => setNegativeDateTo(event.target.value)} className="mt-1 h-9 border-[#273247] bg-[#101827] text-[10px] text-slate-300" />
            </label>
            <Button type="button" size="sm" variant="outline" onClick={clearNegativeFilters} className="h-9 self-end border-[#2b374b] bg-[#111a29] text-[10px] text-slate-400 hover:bg-[#182338] hover:text-white">Limpar</Button>
          </div>
        </div>
        {negativeHistory.isLoading ? (
          <div className="grid min-h-[160px] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-violet-300" /></div>
        ) : negativeHistory.error ? (
          <div className="border-b border-red-500/15 bg-red-500/[0.04] px-4 py-3 text-[10px] text-red-300">{negativeHistory.error.message}</div>
        ) : negativeHistory.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[10px]">
              <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[8px] uppercase tracking-[0.12em] text-slate-600">
                <tr><th className="px-4 py-3">Termo</th><th className="px-3 py-3">Campanha</th><th className="px-3 py-3">Conta</th><th className="px-3 py-3">Data</th><th className="px-3 py-3">Origem</th><th className="px-4 py-3">Responsável</th></tr>
              </thead>
              <tbody className="divide-y divide-[#182231]">
                {negativeHistory.data.map(item => {
                  const formattedTerm = item.matchType === "EXACT" ? `[${item.term}]` : item.matchType === "PHRASE" ? `“${item.term}”` : item.term;
                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><p className="max-w-[280px] break-words font-mono text-[10px] font-semibold text-violet-200">{formattedTerm}</p><span className="mt-1 inline-block rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[8px] text-violet-300">{MATCH_TYPE_LABELS[item.matchType]}</span></td>
                      <td className="px-3 py-3"><CampaignIdentity name={item.campaignName} campaignId={item.campaignId} nameClassName="max-w-[260px] text-[10px] font-medium text-slate-300" idClassName="mt-0.5" /></td>
                      <td className="px-3 py-3 font-mono text-[9px] text-slate-600">{item.accountId}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-400">{formatDateTime(item.appliedAt)}</td>
                      <td className="px-3 py-3 text-slate-400">{item.origin === "TASK_COMPLETION" ? `Conclusão da tarefa #${item.taskId}` : "Registro manual"}</td>
                      <td className="px-4 py-3 text-slate-300">{item.appliedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-[160px] place-items-center p-6 text-center"><div><Search className="mx-auto h-6 w-6 text-slate-700" /><h3 className="mt-3 text-xs font-semibold text-white">Nenhuma negativa neste filtro</h3><p className="mt-1 text-[10px] text-slate-600">Conclua uma tarefa registrando os termos aplicados ou ajuste o período e a busca.</p></div></div>
        )}
        <div className="border-t border-[#1b2535] px-4 py-2 text-[9px] text-slate-700">{negativeHistory.data?.length ?? 0} registro(s) encontrado(s), limitados aos 500 mais recentes.</div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421]">
        <div className="border-b border-[#1b2535] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <label className="text-[9px] font-medium text-slate-600">
                Ciclo
                <select value={cycleId} onChange={event => setCycleId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[#273247] bg-[#101827] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]">
                  <option value="ALL">Todos os ciclos</option>
                  {history.data.cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
                </select>
              </label>
              <label className="text-[9px] font-medium text-slate-600">
                Status da tarefa
                <select value={status} onChange={event => setStatus(event.target.value as StatusFilter)} className="mt-1 h-9 w-full rounded-md border border-[#273247] bg-[#101827] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]">
                  <option value="ALL">Todos</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-[9px] font-medium text-slate-600">
                Resultado observado
                <select value={result} onChange={event => setResult(event.target.value as ResultFilter)} className="mt-1 h-9 w-full rounded-md border border-[#273247] bg-[#101827] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]">
                  <option value="ALL">Todos</option>
                  {Object.entries(RESULT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-[9px] font-medium text-slate-600">
                Tipo de ação
                <select value={actionType} onChange={event => setActionType(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[#273247] bg-[#101827] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]">
                  <option value="ALL">Todas as ações</option>
                  {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="relative text-[9px] font-medium text-slate-600">
                Usuário
                <UserRound className="pointer-events-none absolute bottom-2.5 left-3 h-3.5 w-3.5 text-slate-600" />
                <Input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Criador, responsável..." className="mt-1 h-9 border-[#273247] bg-[#101827] pl-9 text-[10px] text-white placeholder:text-slate-700" />
              </label>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={clearFilters} className="h-9 border-[#2b374b] bg-[#111a29] text-[10px] text-slate-400 hover:bg-[#182338] hover:text-white">
              Limpar filtros
            </Button>
          </div>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <Input value={campaignSearch} onChange={event => setCampaignSearch(event.target.value)} placeholder="Buscar por ID exato ou nome da campanha..." className="h-9 border-[#273247] bg-[#101827] pl-9 text-xs text-white placeholder:text-slate-700" />
          </label>
          <p className="mt-2 text-[9px] text-slate-700">{filteredRows.length} de {rows.length} tarefa(s) no histórico.</p>
        </div>

        {filteredRows.length ? (
          <div className="grid gap-3 p-4 xl:grid-cols-2">
            {filteredRows.map(row => {
              const cpa = row.comparison.cpa;
              const conversions = row.comparison.conversionsPerDay;
              const spend = row.comparison.spendPerDay;
              const ctr = row.comparison.ctr;
              const cpc = row.comparison.cpc;
              return (
                <article key={row.taskId} className="rounded-xl border border-[#202b3d] bg-[#0b121e] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold ${resultClass(row.result)}`}>
                          <ResultIcon result={row.result} />{RESULT_LABELS[row.result]}
                        </span>
                        <span className="rounded-full border border-[#2b374b] bg-[#111a29] px-2 py-1 text-[9px] text-slate-400">{row.cycleName}</span>
                        <span className="text-[9px] text-slate-600">#{row.taskId} • {STATUS_LABELS[row.taskStatus]}</span>
                      </div>
                      <CampaignIdentity name={row.campaignName} campaignId={row.campaignId} nameClassName="mt-3 text-xs font-semibold text-white" idClassName="mt-1" />
                    </div>
                    <span className="text-[10px] font-medium text-[#f45b65]">{ACTION_LABELS[row.actionType]}</span>
                  </div>

                  <div className={`mt-3 rounded-lg border px-3 py-2 text-[10px] leading-5 ${resultClass(row.result)}`}>
                    {row.resultReason}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <ComparisonMetric label="CPA" before={cpa?.before ?? null} after={cpa?.after ?? null} absolute={cpa?.absolute ?? null} percent={cpa?.percent ?? null} format={BRL.format} favorableWhenLower />
                    <ComparisonMetric label="Conv./dia" before={conversions?.before ?? null} after={conversions?.after ?? null} absolute={conversions?.absolute ?? null} percent={conversions?.percent ?? null} format={NUMBER.format} />
                    <ComparisonMetric label="Inv./dia" before={spend?.before ?? null} after={spend?.after ?? null} absolute={spend?.absolute ?? null} percent={spend?.percent ?? null} format={BRL.format} />
                    <ComparisonMetric label="CTR" before={ctr?.before ?? null} after={ctr?.after ?? null} absolute={ctr?.absolute ?? null} percent={ctr?.percent ?? null} format={value => `${NUMBER.format(value)}%`} absoluteFormat={value => `${NUMBER.format(value)} p.p.`} />
                    <ComparisonMetric label="CPC" before={cpc?.before ?? null} after={cpc?.after ?? null} absolute={cpc?.absolute ?? null} percent={cpc?.percent ?? null} format={BRL.format} favorableWhenLower />
                  </div>

                  <div className="mt-3 grid gap-2 rounded-lg bg-[#080e18] p-3 text-[9px] text-slate-600 sm:grid-cols-3">
                    <p><strong className="text-slate-400">Criada:</strong> {formatDateTime(row.createdAt)}</p>
                    <p><strong className="text-slate-400">Responsável:</strong> {row.assignee ?? "Não definido"}</p>
                    <p><strong className="text-slate-400">Concluída:</strong> {formatDateTime(row.completedAt)}</p>
                  </div>

                  <details className="mt-3 rounded-lg border border-[#1b2637] bg-[#0a111d]">
                    <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-[#e2212d]/40">
                      Notas, janelas e eventos auditáveis
                    </summary>
                    <div className="space-y-3 border-t border-[#1b2637] p-3 text-[10px] leading-5 text-slate-500">
                      <p><strong className="text-slate-300">Concluída por:</strong> {row.completedBy ?? "—"}</p>
                      <p><strong className="text-slate-300">Notas:</strong> {row.completionNotes ?? "Nenhuma conclusão registrada."}</p>
                      <p><strong className="text-slate-300">Referência:</strong> {row.baseline ? `${row.baseline.windowDateFrom} a ${row.baseline.windowDateTo} (${row.baseline.windowDays} dias)` : "Indisponível"}</p>
                      <p><strong className="text-slate-300">Acompanhamento:</strong> {row.followUp ? `${row.followUp.windowDateFrom} a ${row.followUp.windowDateTo} (${row.followUp.windowDays} dias)` : "Ainda não capturado"}</p>
                      <div>
                        <strong className="text-slate-300">Eventos:</strong>
                        {row.events.length ? (
                          <ol className="mt-2 space-y-2 border-l border-[#263247] pl-3">
                            {row.events.map(event => (
                              <li key={event.id}>
                                <p className="text-slate-400">{event.eventType} • {event.actor}</p>
                                <p className="text-[9px] text-slate-700">{formatDateTime(event.createdAt)}{event.notes ? ` • ${event.notes}` : ""}</p>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="mt-1 text-slate-700">Nenhum evento registrado.</p>}
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-[220px] place-items-center p-6 text-center">
            <div>
              <CheckCircle2 className="mx-auto h-7 w-7 text-slate-700" />
              <h3 className="mt-3 text-sm font-semibold text-white">Nenhum registro neste filtro</h3>
              <p className="mt-1 text-xs text-slate-600">Ajuste os filtros de ciclo, campanha, usuário, status, ação ou resultado.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
