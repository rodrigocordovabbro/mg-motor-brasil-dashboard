import { useEffect } from "react";
import V2DispatchControl from "./V2DispatchControl";
import { trpc } from "@/lib/trpc";
import {
  addIsoDays,
  capDateAtDashboardCutoff,
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "@shared/dashboardDates";
import type { V2Count, V2Dashboard, V2Filters, V2Lead } from "@shared/v2Types";
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Edit3,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useRef, useState, type ReactNode } from "react";

export type V2AuthUser = { id: number; username: string };
export type V2DashboardFilters = V2Filters;
export type V2DistributionItem = V2Count;
export type V2DailyPoint = V2Dashboard["daily"][number];
export type V2RecentRow = V2Lead;
export type V2LeadsResponse = V2Dashboard;

// Directly inferred from the actual protected V2 AppRouter.
export const v2Trpc = trpc;

const RED = "#e2212d";
const CHANNEL_COLORS = [
  "#e2212d",
  "#1d4ed8",
  "#0f766e",
  "#d97706",
  "#7c3aed",
  "#475569",
];
const CHANNEL_COLOR_MAP: Record<string, string> = {
  Meta: "#e2212d",
  Site: "#38bdf8",
  Webmotors: "#a78bfa",
  "Mercado Livre": "#f59e0b",
  TikTok: "#10b981",
  "TikTok Live": "#ec4899",
  UOL: "#64748b",
  Interlagos: "#0f766e",
};
const SOFT_COLORS = [
  "#e2212d",
  "#f97316",
  "#2563eb",
  "#0f766e",
  "#7c3aed",
  "#64748b",
];

function numberFormat(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    value
  );
}

function percentFormat(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function compactDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(parsed)
    .replace(" de ", " ");
}

function fullDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function leadNameForMode(name: string, clientMode: boolean) {
  return clientMode ? "Nome oculto no modo cliente" : name || "Não informado";
}

function formatHour(value: string | number) {
  if (String(value) === "Não informado") return "Não informado";
  const raw = String(value).replace("h", "");
  return `${raw.padStart(2, "0")}h`;
}

function formatImportedAt(value: string | null) {
  if (!value) return "Importação não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `Importado em ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(parsed)}`;
}

function statusText(status: V2LeadsResponse["pacing"]["status"]) {
  return {
    AHEAD: "À frente",
    BEHIND: "Abaixo do ritmo",
    ON_TRACK: "No ritmo",
    NO_GOAL: "Sem meta",
  }[status];
}

function statusTone(status: V2LeadsResponse["pacing"]["status"]) {
  return {
    AHEAD: "border-emerald-200 bg-emerald-50 text-emerald-700",
    BEHIND: "border-amber-200 bg-amber-50 text-amber-700",
    ON_TRACK: "border-blue-200 bg-blue-50 text-blue-700",
    NO_GOAL: "border-slate-200 bg-slate-50 text-slate-600",
  }[status];
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

function CardHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: typeof BarChart3;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-0.5 text-[15px] font-bold tracking-[-0.01em] text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {Icon ? (
          <Icon
            className="mt-0.5 h-4 w-4 shrink-0 text-[#e2212d]"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}

function EmptyDistribution({
  label = "Sem dados disponíveis no período.",
}: {
  label?: string;
}) {
  return (
    <div className="px-5 py-8 text-center text-xs text-slate-400">{label}</div>
  );
}

function DistributionList({
  items,
  formatter,
  limit = 7,
}: {
  items: V2DistributionItem[];
  formatter?: (label: string) => string;
  limit?: number;
}) {
  const visible = items.slice(0, limit);
  const max = Math.max(...visible.map(item => item.count), 0);
  if (!visible.length) return <EmptyDistribution />;
  return (
    <div className="space-y-3 px-5 py-4">
      {visible.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span
              className="min-w-0 truncate font-medium text-slate-700"
              title={item.label}
            >
              {formatter ? formatter(item.label) : item.label}
            </span>
            <strong className="shrink-0 text-slate-900">
              {numberFormat(item.count)}
            </strong>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${max ? Math.max(4, (item.count / max) * 100) : 0}%`,
                backgroundColor: SOFT_COLORS[index % SOFT_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  accent?: boolean;
}) {
  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span
          className={`rounded-lg p-2 ${accent ? "bg-red-50 text-[#e2212d]" : "bg-slate-100 text-slate-500"}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div
        className="mt-4 truncate text-2xl font-bold tracking-tight text-slate-950"
        title={value}
      >
        {value}
      </div>
      {hint ? (
        <p className="mt-1 truncate text-xs text-slate-500" title={hint}>
          {hint}
        </p>
      ) : null}
    </Card>
  );
}

function LoadingPanel() {
  return (
    <div className="grid gap-4">
      <div className="h-24 animate-pulse rounded-2xl bg-white/70" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
      </div>
      <div className="h-[380px] animate-pulse rounded-2xl bg-white/70" />
    </div>
  );
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-red-200 p-8 text-center">
      <AlertCircle
        className="mx-auto h-7 w-7 text-[#e2212d]"
        aria-hidden="true"
      />
      <h2 className="mt-3 text-base font-bold text-slate-900">
        Não foi possível carregar os leads
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Verifique sua sessão ou tente novamente. Nenhum dado foi preenchido
        localmente.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#e2212d] px-4 text-sm font-semibold text-white transition hover:bg-[#c91c28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        <RefreshCw className="h-4 w-4" /> Tentar novamente
      </button>
    </Card>
  );
}

function NotConfiguredPanel({ data }: { data: V2LeadsResponse }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Dados de leads ainda não disponíveis
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Ainda não há uma importação autenticada disponível para este
              painel. Para manter a leitura confiável, não exibimos zeros,
              amostras ou números de apresentação como substitutos.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Origem
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {data.source.name || "Aguardando configuração"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Situação
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            Aguardando importação
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Período consultado
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {fullDate(data.period.dateFrom)} a {fullDate(data.period.dateTo)}
          </p>
        </div>
      </div>
      {data.notes.length ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <details>
            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
              Observações da importação
            </summary>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
              {data.notes.map(note => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </Card>
  );
}

function FilterBar({
  draft,
  setDraft,
  options,
  cutoff,
  onSearch,
  dateError,
  selectedPreset,
  onPreset,
  isFetching,
  clientMode,
}: {
  draft: V2DashboardFilters;
  setDraft: (next: V2DashboardFilters) => void;
  options: V2LeadsResponse["options"];
  cutoff: string;
  onSearch: () => void;
  dateError: string | null;
  selectedPreset: string;
  onPreset: (preset: string) => void;
  isFetching: boolean;
  clientMode: boolean;
}) {
  const update = (key: keyof V2DashboardFilters, value: string) =>
    setDraft({ ...draft, [key]: value || undefined, page: 1 });
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#e2212d]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-900">Filtros de leads</h2>
          <span className="hidden text-xs text-slate-400 sm:inline">
            Dados encerrados até D-1
          </span>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Período rápido"
        >
          {["7 dias", "14 dias", "30 dias", "60 dias", "Mês"].map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => onPreset(preset)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selectedPreset === preset ? "bg-red-50 text-[#e2212d]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <label className="xl:col-span-1">
          <span className="v2-label">Início</span>
          <input
            aria-label="Data inicial"
            type="date"
            max={cutoff}
            value={draft.dateFrom}
            onChange={event =>
              update(
                "dateFrom",
                event.target.value
                  ? capDateAtDashboardCutoff(event.target.value)
                  : ""
              )
            }
            className="v2-input"
          />
        </label>
        <label className="xl:col-span-1">
          <span className="v2-label">Fim</span>
          <input
            aria-label="Data final"
            type="date"
            max={cutoff}
            value={draft.dateTo}
            onChange={event =>
              update(
                "dateTo",
                event.target.value
                  ? capDateAtDashboardCutoff(event.target.value)
                  : ""
              )
            }
            className="v2-input"
          />
        </label>
        <SelectFilter
          label="Modelo"
          value={draft.model ?? ""}
          options={options.models}
          onChange={value => update("model", value)}
        />
        <SelectFilter
          label="Canal"
          value={draft.channel ?? ""}
          options={options.channels}
          onChange={value => update("channel", value)}
        />
        <SelectFilter
          label="Campanha"
          value={draft.campaign ?? ""}
          options={options.campaigns}
          onChange={value => update("campaign", value)}
        />
        <SelectFilter
          label="Concessionária"
          value={draft.dealer ?? ""}
          options={options.dealers}
          onChange={value => update("dealer", value)}
        />
        <label className="sm:col-span-2 xl:col-span-2">
          <span className="v2-label">
            {clientMode ? "Cidade/UF/concessionária" : "Busca"}
          </span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              aria-label={
                clientMode ? "Cidade/UF/concessionária" : "Buscar lead"
              }
              value={draft.search ?? ""}
              onChange={event => update("search", event.target.value)}
              placeholder={
                clientMode
                  ? "Cidade, UF ou concessionária"
                  : "Nome, cidade ou estado"
              }
              className="v2-input pl-9"
            />
          </div>
        </label>
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-5 text-xs text-[#b41b26]">
          {dateError ??
            `Limite operacional: ${fullDate(cutoff)} (America/Sao_Paulo)`}
        </p>
        <button
          type="button"
          onClick={onSearch}
          disabled={isFetching}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#e2212d] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#c91c28] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          <Search className="h-4 w-4" />
          {isFetching ? "Buscando…" : "Buscar"}
        </button>
      </div>
    </Card>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="v2-label">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="v2-input"
      >
        <option value="">Todos</option>
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function PacingCard({
  data,
  onUpdated,
  clientMode,
}: {
  data: V2LeadsResponse;
  onUpdated: () => void;
  clientMode: boolean;
}) {
  const pacing = data.pacing;
  const [editing, setEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState(
    pacing.goal == null ? "" : String(pacing.goal)
  );
  const [goalError, setGoalError] = useState<string | null>(null);
  const updateGoal = v2Trpc.leads.updateGoal.useMutation();

  const saveGoal = async () => {
    const goal = Number(goalDraft);
    if (!Number.isFinite(goal) || goal <= 0) {
      setGoalError("Informe uma meta mensal maior que zero.");
      return;
    }
    setGoalError(null);
    try {
      await updateGoal.mutateAsync({
        competence: pacing.competence,
        goal: Math.round(goal),
      });
      setEditing(false);
      onUpdated();
    } catch {
      setGoalError("Não foi possível salvar a meta. Tente novamente.");
    }
  };

  const progressRatio =
    pacing.progressPercent == null ? null : pacing.progressPercent / 100;
  const progressWidth =
    progressRatio == null ? 0 : Math.min(100, Math.max(0, progressRatio * 100));
  return (
    <Card className="overflow-hidden">
      <CardHeading
        eyebrow="Ritmo mensal"
        title="Pacing de leads"
        description="Pacing MTD da competência até D-1; as demais métricas respeitam o período filtrado."
        icon={Target}
        action={
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(pacing.status)}`}
          >
            {statusText(pacing.status)}
          </span>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Competência {pacing.competence}
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                {numberFormat(pacing.current)}
              </p>
              <p className="text-xs text-slate-500">leads MTD da competência</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">Meta</p>
              {pacing.goal == null ? (
                <p className="mt-1 text-sm font-bold text-slate-400">
                  Indisponível
                </p>
              ) : (
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {numberFormat(pacing.goal)}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#e2212d] transition-all"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-[11px] text-slate-500">
            <span>
              {pacing.progressPercent == null
                ? "Percentual indisponível sem meta"
                : `${percentFormat(progressRatio ?? 0)} da meta`}
            </span>
            <span>
              {pacing.closedDays}/{pacing.daysInMonth} dias fechados
            </span>
          </div>
          {pacing.goal == null ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
              {clientMode
                ? "Meta mensal indisponível na fonte para esta apresentação."
                : "Defina uma meta para habilitar projeção comparável, diferença projetada e restante para a meta."}
            </p>
          ) : null}
          {clientMode ? (
            <p className="mt-4 text-[11px] leading-5 text-slate-400">
              Meta e acompanhamento são ajustados no modo operação.
            </p>
          ) : editing ? (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1">
                  <span className="v2-label">Nova meta mensal</span>
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    step="1"
                    value={goalDraft}
                    onChange={event => setGoalDraft(event.target.value)}
                    className="v2-input bg-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={saveGoal}
                  disabled={updateGoal.isPending}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#e2212d] px-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" /> Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </div>
              {goalError ? (
                <p className="mt-2 text-xs text-[#b41b26]">{goalError}</p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-500">
                  A alteração será registrada pela mutation de meta da
                  competência.
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setGoalDraft(pacing.goal == null ? "" : String(pacing.goal));
                setEditing(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#e2212d] hover:underline"
            >
              <Edit3 className="h-3.5 w-3.5" />{" "}
              {pacing.goal == null ? "Definir meta" : "Editar meta"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          <PacingMetric
            label="Média/dia"
            value={numberFormat(Math.round(pacing.averagePerDay))}
          />
          <PacingMetric
            label="Necessário/dia"
            value={
              pacing.requiredPerDay == null
                ? "N/D"
                : numberFormat(Math.ceil(pacing.requiredPerDay))
            }
          />
          <PacingMetric
            label="Projeção"
            value={numberFormat(pacing.projection)}
          />
          <PacingMetric
            label="Restante"
            value={
              pacing.remainingToGoal == null
                ? "N/D"
                : numberFormat(Math.max(0, pacing.remainingToGoal))
            }
          />
        </div>
      </div>
    </Card>
  );
}

function PacingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function unavailablePerformanceValue() {
  return <span className="text-slate-400">Indisponível</span>;
}

function performanceNumber(value: number | null, available: boolean) {
  if (!available || value == null) return unavailablePerformanceValue();
  return numberFormat(value);
}

function performancePercent(value: number | null, available: boolean) {
  if (!available || value == null) return unavailablePerformanceValue();
  return percentFormat(value);
}

function DealerPerformanceCard({ data }: { data: V2LeadsResponse }) {
  const performance = data.dealerPerformance;
  const available = performance.available;
  const totals = performance.totals;
  const [dealerSearch, setDealerSearch] = useState("");
  const [dealerSort, setDealerSort] = useState("leads");
  const [page, setPage] = useState(1);
  const filteredRows = useMemo(
    () =>
      performance.rows
        .filter(
          row =>
            !dealerSearch.trim() ||
            [row.dealer, row.state].some(value =>
              value
                .toLocaleLowerCase("pt-BR")
                .includes(dealerSearch.trim().toLocaleLowerCase("pt-BR"))
            )
        )
        .sort((a, b) =>
          dealerSort === "name"
            ? a.dealer.localeCompare(b.dealer, "pt-BR")
            : b.leads - a.leads
        ),
    [performance.rows, dealerSearch, dealerSort]
  );
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  return (
    <Card className="overflow-hidden">
      <CardHeading
        eyebrow="Acompanhamento comercial"
        title="Vendas e metas por concessionária"
        description="Leads reais por dealer; vendas, conversão e metas somente quando a base correspondente está disponível."
        icon={TrendingUp}
        action={
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${available ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
          >
            {available ? "Fonte disponível" : "Fonte não configurada"}
          </span>
        }
      />
      <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryFact label="Leads reais" value={numberFormat(totals.leads)} />
        <SummaryFact
          label="Meta de leads"
          value={
            available && totals.leadGoal != null
              ? numberFormat(totals.leadGoal)
              : "Indisponível"
          }
        />
        <SummaryFact
          label="Vendas"
          value={
            available && totals.sales != null
              ? numberFormat(totals.sales)
              : "Indisponível"
          }
        />
        <SummaryFact
          label="Meta de vendas"
          value={
            available && totals.salesGoal != null
              ? numberFormat(totals.salesGoal)
              : "Indisponível"
          }
        />
        <SummaryFact
          label="Conversão"
          value={
            available && totals.conversionRate != null
              ? percentFormat(totals.conversionRate)
              : "Indisponível"
          }
        />
      </div>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="v2-label">Consultar concessionária ou UF</span>
          <input
            className="v2-input"
            value={dealerSearch}
            onChange={event => {
              setDealerSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar na tabela"
          />
        </label>
        <label className="sm:w-48">
          <span className="v2-label">Ordenação</span>
          <select
            className="v2-input"
            value={dealerSort}
            onChange={event => {
              setDealerSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="leads">Mais Leads primeiro</option>
            <option value="name">Nome da concessionária</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            <tr>
              <th className="px-5 py-3">Concessionária</th>
              <th className="px-4 py-3">UF</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Meta leads</th>
              <th className="px-4 py-3 text-right">Vendas</th>
              <th className="px-4 py-3 text-right">Meta vendas</th>
              <th className="px-5 py-3 text-right">Conversão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {pageRows.length ? (
              pageRows.map(row => (
                <tr
                  key={`${row.dealer}-${row.state}`}
                  className="transition hover:bg-slate-50"
                >
                  <td
                    className="max-w-[240px] truncate px-5 py-3 font-semibold text-slate-800"
                    title={row.dealer}
                  >
                    {row.dealer || "Não informado"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.state || "N/D"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {numberFormat(row.leads)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {performanceNumber(row.leadGoal, available)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {performanceNumber(row.sales, available)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {performanceNumber(row.salesGoal, available)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {performancePercent(row.conversionRate, available)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <EmptyDistribution label="Nenhuma concessionária corresponde à consulta." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <span>
          {filteredRows.length} linhas · página {currentPage} de {totalPages}.
          Os totais acima permanecem os do período.
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Página anterior de concessionárias"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-lg border border-slate-200 p-2 disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próxima página de concessionárias"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-lg border border-slate-200 p-2 disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">
        {available ? (
          <span>
            {performance.sourceName ? `Fonte: ${performance.sourceName}. ` : ""}
            {performance.updatedAt
              ? formatImportedAt(performance.updatedAt)
              : "Atualização da fonte não informada."}
          </span>
        ) : (
          <span>
            Fonte de vendas e metas por concessionária ainda não configurada.
          </span>
        )}
      </div>
    </Card>
  );
}

function DailyChart({ daily }: { daily: V2DailyPoint[] }) {
  const channelKeys = useMemo(
    () =>
      Array.from(new Set(daily.flatMap(item => Object.keys(item.channels)))),
    [daily]
  );
  const chartData = useMemo(
    () =>
      daily.map(item => ({
        ...item,
        ...Object.fromEntries(
          channelKeys.map(key => [`channel:${key}`, item.channels[key] ?? 0])
        ),
      })),
    [channelKeys, daily]
  );
  if (!daily.length)
    return <EmptyDistribution label="Sem dados diários para este período." />;
  return (
    <div className="px-3 pb-5 pt-3 sm:px-5">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500">
        {channelKeys.map((key, index) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <i
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  CHANNEL_COLOR_MAP[key] ??
                  CHANNEL_COLORS[index % CHANNEL_COLORS.length],
              }}
            />
            {key}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-slate-800" /> Real acumulado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full border border-dashed border-blue-600" />{" "}
          Pace acumulado
        </span>
      </div>
      <div className="h-[330px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
          >
            <CartesianGrid stroke="#eef1f4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={compactDate}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="bars"
              allowDecimals={false}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="lines"
              orientation="right"
              allowDecimals={false}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={label => fullDate(String(label))}
              formatter={(value: number, name: string) => [
                numberFormat(Number(value)),
                name,
              ]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
            {channelKeys.map((key, index) => (
              <Bar
                key={key}
                yAxisId="bars"
                dataKey={`channel:${key}`}
                stackId="leads"
                name={key}
                fill={
                  CHANNEL_COLOR_MAP[key] ??
                  CHANNEL_COLORS[index % CHANNEL_COLORS.length]
                }
              />
            ))}
            <Line
              yAxisId="lines"
              type="monotone"
              dataKey="cumulative"
              name="Real acumulado"
              stroke="#1e293b"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              yAxisId="lines"
              type="monotone"
              dataKey="pace"
              name="Pace acumulado"
              stroke="#2563eb"
              strokeWidth={1.8}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OverviewTab({
  data,
  onGoalUpdated,
  clientMode,
}: {
  data: V2LeadsResponse;
  onGoalUpdated: () => void;
  clientMode: boolean;
}) {
  const { summary } = data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Leads"
          value={numberFormat(summary.total)}
          hint="Total no período selecionado"
          icon={Users}
          accent
        />
        <KpiCard
          label="Modelos"
          value={numberFormat(summary.models)}
          hint={
            summary.topModel
              ? `Líder: ${summary.topModel.label}`
              : "Sem liderança disponível"
          }
          icon={BarChart3}
        />
        <KpiCard
          label="Lojas"
          value={numberFormat(summary.dealers)}
          hint={
            summary.topState
              ? `Estado líder: ${summary.topState.label}`
              : "Sem liderança disponível"
          }
          icon={MapPin}
        />
        <KpiCard
          label="CRM"
          value={
            summary.crmRate == null
              ? "Indisponível"
              : percentFormat(summary.crmRate)
          }
          hint={
            summary.crmDelivered == null
              ? "Metadados insuficientes"
              : `${numberFormat(summary.crmDelivered)} entregues`
          }
          icon={Check}
        />
      </div>
      <PacingCard
        data={data}
        onUpdated={onGoalUpdated}
        clientMode={clientMode}
      />
      <Card className="overflow-hidden">
        <CardHeading
          eyebrow="Evolução diária"
          title="Leads por dia e canal"
          description="Barras empilhadas com o real acumulado e o pace retornado pela API."
          icon={TrendingUp}
        />
        <DailyChart daily={data.daily} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeading title="Distribuição por canal" icon={BarChart3} />
          <DistributionList
            items={data.channels}
            limit={data.channels.length}
          />
        </Card>
        <Card className="overflow-hidden">
          <CardHeading title="Distribuição por modelo" icon={BarChart3} />
          <DistributionList items={data.models} />
        </Card>
        <Card className="overflow-hidden">
          <CardHeading title="Distribuição por estado" icon={MapPin} />
          <DistributionList items={data.states} />
        </Card>
        <Card className="overflow-hidden">
          <CardHeading title="Distribuição por concessionária" icon={Users} />
          <DistributionList items={data.dealers} />
        </Card>
      </div>
      <DealerPerformanceCard data={data} />
      {data.notes.length ? <Notes notes={data.notes} /> : null}
    </div>
  );
}

function Notes({ notes }: { notes: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <CircleHelp className="h-4 w-4 text-slate-400" /> Notas da fonte
      </div>
      <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-500 md:grid-cols-2">
        {notes.map(note => (
          <li key={note}>• {note}</li>
        ))}
      </ul>
    </div>
  );
}

function RegionsTab({ data }: { data: V2LeadsResponse }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeading
          eyebrow="Geografia"
          title="Leads por estado"
          description="Distribuição conforme o campo de estado recebido."
          icon={MapPin}
        />
        <DistributionList items={data.states} limit={12} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeading
          eyebrow="Geografia"
          title="Leads por cidade"
          description="Cidades com maior volume no período."
          icon={MapPin}
        />
        <DistributionList items={data.cities} limit={12} />
      </Card>
      <Card className="overflow-hidden lg:col-span-2">
        <CardHeading title="Leitura regional" icon={TrendingUp} />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <SummaryFact
            label="Estados identificados"
            value={numberFormat(data.summary.states)}
          />
          <SummaryFact
            label="Cidades identificadas"
            value={numberFormat(data.summary.cities)}
          />
          <SummaryFact
            label="Estado líder"
            value={data.summary.topState?.label ?? "Indisponível"}
          />
        </div>
      </Card>
    </div>
  );
}

function HoursTab({ data }: { data: V2LeadsResponse }) {
  const peak = data.summary.peakHour;
  const chartData = data.hours.map(item => ({
    ...item,
    label: formatHour(item.label),
  }));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
      <Card className="overflow-hidden">
        <CardHeading
          eyebrow="Distribuição intradiária"
          title="Leads por horário"
          description="Horário conforme o dado recebido; sem estimativa para registros sem hora."
          icon={Clock3}
        />
        <div className="h-[360px] px-3 py-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 12, left: -18, bottom: 4 }}
            >
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [
                  numberFormat(Number(value)),
                  "Leads",
                ]}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="count"
                name="Leads"
                fill={RED}
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeading title="Pico identificado" icon={Clock3} />
        <div className="p-5">
          {peak ? (
            <>
              <p className="text-4xl font-bold tracking-tight text-slate-950">
                {formatHour(peak.label)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {numberFormat(peak.count)} leads atribuídos a este horário.
              </p>
            </>
          ) : (
            <EmptyDistribution label="Pico indisponível para a fonte atual." />
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">
          O horário não é inferido quando o registro não possui metadado
          confiável.
        </div>
      </Card>
    </div>
  );
}

function ModelsTab({ data }: { data: V2LeadsResponse }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeading
          title="Modelos"
          description="Volume por modelo recebido na fonte."
          icon={BarChart3}
        />
        <DistributionList items={data.models} limit={15} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeading
          title="Versões"
          description="Detalhamento de versão quando disponível."
          icon={BarChart3}
        />
        <DistributionList items={data.versions} limit={15} />
      </Card>
      <Card className="overflow-hidden lg:col-span-2">
        <CardHeading
          title="Campanhas associadas"
          description="Campanhas presentes nos registros selecionados."
          icon={Target}
        />
        <DistributionList items={data.campaigns} limit={15} />
      </Card>
    </div>
  );
}

function CrmDonut({ items }: { items: V2DistributionItem[] }) {
  if (!items.length)
    return (
      <EmptyDistribution label="CRM indisponível para os metadados atuais." />
    );
  return (
    <div className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-center">
      <div className="h-[180px] w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="count"
              nameKey="label"
              innerRadius={54}
              outerRadius={78}
              paddingAngle={3}
            >
              {items.map((item, index) => (
                <Cell
                  key={item.label}
                  fill={SOFT_COLORS[index % SOFT_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => numberFormat(Number(value))}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.label}
            className="flex items-center gap-2 text-xs text-slate-600"
          >
            <i
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: SOFT_COLORS[index % SOFT_COLORS.length],
              }}
            />
            {item.label}
            <strong className="ml-2 text-slate-900">
              {numberFormat(item.count)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoresCrmTab() {
  return <V2DispatchControl authenticated clientMode={false} embedded />;
}

function LeadsTableTab({
  data,
  onPage,
  clientMode,
}: {
  data: V2LeadsResponse;
  onPage: (page: number) => void;
  clientMode: boolean;
}) {
  const totalPages = Math.max(
    1,
    Math.ceil(data.recent.total / data.recent.pageSize)
  );
  const currentPage = data.recent.page;
  return (
    <Card className="overflow-hidden">
      <CardHeading
        eyebrow="Registros"
        title="Leads recentes"
        description={`${numberFormat(data.recent.total)} registros encontrados com os filtros aplicados.`}
        icon={Users}
      />
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            <tr>
              {[
                "Data",
                "Lead",
                "Modelo",
                "Canal",
                "Campanha",
                "Concessionária",
                "Cidade/UF",
                "CRM",
              ].map(label => (
                <th key={label} className="px-4 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {data.recent.rows.length ? (
              data.recent.rows.map(row => (
                <tr key={row.id} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {fullDate(row.date)}
                    </span>
                    {row.hour == null ? null : (
                      <span className="ml-2 text-slate-400">
                        {formatHour(row.hour)}
                      </span>
                    )}
                  </td>
                  <td
                    className="max-w-[190px] truncate px-4 py-3 font-semibold text-slate-800"
                    title={clientMode ? undefined : row.name}
                  >
                    {leadNameForMode(row.name, clientMode)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.model || "N/D"}
                    <span className="block text-[11px] text-slate-400">
                      {row.version || ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.channel || "N/D"}
                  </td>
                  <td
                    className="max-w-[180px] truncate px-4 py-3 text-slate-600"
                    title={row.campaign}
                  >
                    {row.campaign || "N/D"}
                  </td>
                  <td
                    className="max-w-[180px] truncate px-4 py-3 text-slate-600"
                    title={row.dealer}
                  >
                    {row.dealer || "N/D"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[row.city, row.state].filter(Boolean).join(" / ") || "N/D"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {row.crm || "N/D"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <EmptyDistribution label="Nenhum lead encontrado com os filtros atuais." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Página {currentPage} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Página anterior"
            title="Página anterior"
            disabled={currentPage <= 1}
            onClick={() => onPage(currentPage - 1)}
            className="rounded-lg border border-slate-200 p-2 disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próxima página"
            title="Próxima página"
            disabled={currentPage >= totalPages}
            onClick={() => onPage(currentPage + 1)}
            className="rounded-lg border border-slate-200 p-2 disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
        {label}
      </p>
      <p
        className="mt-2 truncate text-lg font-bold text-slate-900"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

const TABS = [
  "Visão Geral",
  "Regiões",
  "Horários",
  "Modelos",
  "Lojas & CRM",
  "Leads",
] as const;
type V2Tab = (typeof TABS)[number];

export default function V2LeadsDashboard({
  authenticated,
  clientMode = true,
}: {
  authenticated: boolean;
  clientMode?: boolean;
}) {
  const [cutoff, setCutoff] = useState(() => getDashboardCutoffDate());
  useEffect(() => {
    const id = window.setInterval(
      () => setCutoff(getDashboardCutoffDate()),
      60000
    );
    return () => window.clearInterval(id);
  }, []);
  const firstMonthDay = `${cutoff.slice(0, 7)}-01`;
  const initialFilters = useMemo<V2DashboardFilters>(
    () => ({ dateFrom: `${cutoff.slice(0, 7)}-01`, dateTo: cutoff, page: 1 }),
    [cutoff]
  );
  const [draft, setDraft] = useState<V2DashboardFilters>(initialFilters);
  const [applied, setApplied] = useState<V2DashboardFilters>(initialFilters);
  const [selectedPreset, setSelectedPreset] = useState("Mês");
  const priorCutoff = useRef(cutoff);
  useEffect(() => {
    const previous = priorCutoff.current;
    if (previous === cutoff) return;
    priorCutoff.current = cutoff;
    const advance = (current: V2DashboardFilters) =>
      current.dateTo !== previous
        ? current
        : {
            ...current,
            dateTo: cutoff,
            dateFrom:
              current.dateFrom === `${previous.slice(0, 7)}-01`
                ? `${cutoff.slice(0, 7)}-01`
                : current.dateFrom,
            page: 1,
          };
    setDraft(advance);
    setApplied(advance);
  }, [cutoff]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<V2Tab>(() =>
    new URLSearchParams(window.location.search).get("tab") === "stores"
      ? "Lojas & CRM"
      : "Visão Geral"
  );
  const selectTab = (tab: V2Tab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "Lojas & CRM") url.searchParams.set("tab", "stores");
    else url.searchParams.delete("tab");
    window.history.replaceState({}, "", url);
  };
  const dashboardQuery = v2Trpc.leads.dashboard.useQuery(applied, {
    enabled: authenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = dashboardQuery.data;

  const choosePreset = (preset: string) => {
    const from =
      preset === "Mês"
        ? firstMonthDay
        : addIsoDays(cutoff, -(Number.parseInt(preset, 10) - 1));
    setDraft({ ...draft, dateFrom: from, dateTo: cutoff, page: 1 });
    setSelectedPreset(preset);
    setDateError(null);
  };

  const applyFilters = () => {
    try {
      const period = resolveDashboardPeriod(draft.dateFrom, draft.dateTo);
      setDateError(null);
      setApplied({ ...draft, ...period, page: 1 });
    } catch (error) {
      setDateError(
        error instanceof Error ? error.message : "Confira o intervalo de datas."
      );
    }
  };

  const changePage = (page: number) =>
    setApplied(current => ({ ...current, page }));
  const refresh = () => void dashboardQuery.refetch();

  if (!authenticated) return null;
  if (activeTab === "Lojas & CRM")
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <div
            className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1"
            role="tablist"
            aria-label="Módulos de leads"
          >
            {TABS.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => selectTab(tab)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === tab ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <StoresCrmTab />
      </div>
    );
  if (dashboardQuery.isLoading && !data) return <LoadingPanel />;
  if (dashboardQuery.error && !data) return <QueryError onRetry={refresh} />;
  if (!data) return <QueryError onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <FilterBar
        draft={draft}
        setDraft={setDraft}
        options={data.options}
        cutoff={data.period.cutoffDate || cutoff}
        onSearch={applyFilters}
        dateError={dateError}
        selectedPreset={selectedPreset}
        onPreset={choosePreset}
        isFetching={dashboardQuery.isLoading}
        clientMode={clientMode}
      />
      {data.status === "NOT_CONFIGURED" ? (
        <NotConfiguredPanel data={data} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Período: {fullDate(data.period.dateFrom)} a{" "}
                {fullDate(data.period.dateTo)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {data.source.name || "Importação autenticada"} ·{" "}
                {formatImportedAt(data.source.importedAt)} · importação inicial,
                sem sincronização automática
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Fonte
              importada {dashboardQuery.isLoading ? "· atualizando" : ""}
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div
              className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1"
              role="tablist"
              aria-label="Módulos de leads"
            >
              {TABS.map(tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => selectTab(tab)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 ${activeTab === tab ? "bg-[#e2212d] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          {activeTab === "Visão Geral" ? (
            <OverviewTab
              data={data}
              onGoalUpdated={refresh}
              clientMode={clientMode}
            />
          ) : null}
          {activeTab === "Regiões" ? <RegionsTab data={data} /> : null}
          {activeTab === "Horários" ? <HoursTab data={data} /> : null}
          {activeTab === "Modelos" ? <ModelsTab data={data} /> : null}
          {activeTab === "Leads" ? (
            <LeadsTableTab
              data={data}
              onPage={changePage}
              clientMode={clientMode}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
