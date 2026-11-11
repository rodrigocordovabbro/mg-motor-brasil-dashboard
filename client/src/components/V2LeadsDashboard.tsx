import {
  getDealerSalesKind,
  isMonthToDateCommercialPeriod,
} from "@shared/commercialScope";
import {
  describeLeadsReload,
  LeadsReloadVersionNotConfirmedError,
  type LeadsReloadResult,
  type LeadsReloadHandler,
  type LeadsLocale,
} from "@shared/leadsReload";
import type { LeadsSyncResult } from "@shared/leadsSync";
import { showDealerInCommercialTable } from "@shared/dealerPresentation";
import type { UserRole } from "@shared/accountRoles";
import {
  LEAD_PERIOD_PRESETS,
  omitLeadCampaign,
  resolveLeadPeriodPreset,
} from "@shared/leadPeriodPresets";
import { V2LeadsReloadButton } from "./V2LeadsReloadButton";
import { V2HistoricalLeadPaceCard } from "./V2HistoricalLeadPaceCard";
import { V2LeadsExportButton } from "./V2LeadsExportButton";
import { V2CommercialSummary } from "./V2CommercialSummary";
import { V2OverviewPdfButton } from "./V2OverviewPdfButton";
import { V2OverviewDealerRankings } from "./V2OverviewDealerRankings";
import { getOverviewPdfSnapshotVersion } from "@/lib/overviewPdfSnapshot";
import { resolveBrazilianState } from "@shared/stateRegistry";
import {
  LeadsSectionNavigation,
  LEADS_SECTION_TABS,
  MODEL_ANALYSIS_TAB,
  canAnalyzeModels,
  type LeadsSectionTab as V2Tab,
} from "./LeadsSectionNavigation";
import V2CommercialUploads from "./V2CommercialUploads";
import V2MonthlyGoalEditor from "./V2MonthlyGoalEditor";
import V2AdminModelInsights from "./V2AdminModelInsights";
import { useEffect } from "react";
import V2DispatchControl from "./V2DispatchControl";
import V2RegionalModelMatrix from "./newcomponentV2RegionalModelMatrix";
import { V2ModelDeliveryCard } from "./V2ModelDeliveryCard";
import { trpc } from "@/lib/trpc";
import {
  addIsoDays,
  capDateAtDashboardCutoff,
  getDashboardCutoffDate,
  resolveDashboardPeriod,
} from "@shared/dashboardDates";
import { normalizeDealerKey, officialDealer } from "@shared/dealerRegistry";
import type { RegionalModelDistribution } from "@shared/regionalTypes";
import type { V2Count, V2Dashboard, V2Filters, V2Lead } from "@shared/v2Types";
import {
  AlertCircle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
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
  LabelList,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useRef, useState, type ReactNode } from "react";

export type V2AuthUser = {
  id: number;
  username: string;
  role?: UserRole;
};
export type V2DashboardFilters = V2Filters;
export type V2DistributionItem = V2Count;
export type V2DailyPoint = V2Dashboard["daily"][number];
export type V2RecentRow = V2Lead;
export type V2LeadsResponse = V2Dashboard & {
  regionalModels?: RegionalModelDistribution;
};

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

function tr(locale: LeadsLocale = "pt-BR", pt: string, en: string) {
  return locale === "en" ? en : pt;
}

function numberFormat(value: number, locale: LeadsLocale = "pt-BR") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function percentFormat(value: number, locale: LeadsLocale = "pt-BR") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function compactDate(value: string, locale: LeadsLocale = "pt-BR") {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(parsed)
    .replace(" de ", " ");
}

function fullDate(value: string, locale: LeadsLocale = "pt-BR") {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function leadNameForMode(
  name: string,
  clientMode: boolean,
  locale: LeadsLocale = "pt-BR"
) {
  return clientMode
    ? tr(locale, "Nome oculto no modo cliente", "Hidden name in client mode")
    : name || tr(locale, "Não informado", "N/A");
}

function formatHour(value: string | number, locale: LeadsLocale = "pt-BR") {
  if (String(value) === "Não informado")
    return tr(locale, "Não informado", "N/A");
  const raw = String(value).replace("h", "");
  return locale === "en"
    ? `${raw.padStart(2, "0")}:00`
    : `${raw.padStart(2, "0")}h`;
}

function formatImportedAt(value: string | null, locale: LeadsLocale = "pt-BR") {
  if (!value)
    return tr(locale, "Importação não informada", "Import time unavailable");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${tr(locale, "Importado em", "Imported on")} ${new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }
  ).format(parsed)}`;
}

function reloadErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    data?: { code?: unknown };
    code?: unknown;
  };
  return typeof candidate.data?.code === "string"
    ? candidate.data.code
    : typeof candidate.code === "string"
      ? candidate.code
      : undefined;
}

function statusText(
  status: V2LeadsResponse["pacing"]["status"],
  locale: LeadsLocale = "pt-BR"
) {
  return {
    AHEAD: tr(locale, "À frente", "Ahead"),
    BEHIND: tr(locale, "Abaixo do ritmo", "Behind pace"),
    ON_TRACK: tr(locale, "No ritmo", "On track"),
    NO_GOAL: tr(locale, "Sem meta", "No target"),
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
  pdfChart,
}: {
  children: ReactNode;
  className?: string;
  pdfChart?: "daily";
}) {
  return (
    <section
      data-overview-pdf-chart={pdfChart}
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
  actionHelp,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: typeof BarChart3;
  action?: ReactNode;
  actionHelp?: ReactNode;
}) {
  return (
    <div className="v2-card-heading border-b border-slate-100 px-5 py-4">
      <div className="v2-card-heading-layout grid gap-x-4 gap-y-2">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-0.5 text-[15px] font-bold tracking-[-0.01em] text-slate-900">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        <div className="v2-card-heading-actions flex min-w-0 items-start justify-end gap-2">
          {action ? <div className="min-w-0 flex-1">{action}</div> : null}
          {Icon ? (
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0 text-[#e2212d]"
              aria-hidden="true"
            />
          ) : null}
        </div>
        {actionHelp ? (
          <div className="v2-card-heading-help min-w-0 text-[11px] leading-4 text-slate-500">
            {actionHelp}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyDistribution({
  label,
  locale = "pt-BR",
}: {
  label?: string;
  locale?: LeadsLocale;
}) {
  return (
    <div className="px-5 py-8 text-center text-xs text-slate-400">
      {label ??
        tr(
          locale,
          "Sem dados disponíveis no período.",
          "No data available for this period."
        )}
    </div>
  );
}

function DistributionList({
  items,
  formatter,
  limit = 7,
  locale = "pt-BR",
}: {
  items: V2DistributionItem[];
  formatter?: (label: string) => string;
  limit?: number;
  locale?: LeadsLocale;
}) {
  const visible = items.slice(0, limit);
  const max = Math.max(...visible.map(item => item.count), 0);
  if (!visible.length) return <EmptyDistribution locale={locale} />;
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
              {numberFormat(item.count, locale)}
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

function QueryError({
  onRetry,
  locale = "pt-BR",
}: {
  onRetry: () => void;
  locale?: LeadsLocale;
}) {
  return (
    <Card className="border-red-200 p-8 text-center">
      <AlertCircle
        className="mx-auto h-7 w-7 text-[#e2212d]"
        aria-hidden="true"
      />
      <h2 className="mt-3 text-base font-bold text-slate-900">
        {tr(
          locale,
          "Não foi possível carregar os leads",
          "Unable to load Leads"
        )}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {tr(
          locale,
          "Verifique sua sessão ou tente novamente. Nenhum dado foi preenchido localmente.",
          "Check your session or try again. No local data was filled in."
        )}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#e2212d] px-4 text-sm font-semibold text-white transition hover:bg-[#c91c28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        <RefreshCw className="h-4 w-4" />
        {tr(locale, "Tentar novamente", "Try again")}
      </button>
    </Card>
  );
}

function NotConfiguredPanel({
  data,
  locale = "pt-BR",
}: {
  data: V2LeadsResponse;
  locale?: LeadsLocale;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {tr(
                locale,
                "Dados de leads ainda não disponíveis",
                "Lead data is not available yet"
              )}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              {tr(
                locale,
                "Ainda não há uma importação autenticada disponível para este painel. Para manter a leitura confiável, não exibimos zeros, amostras ou números de apresentação como substitutos.",
                "No authenticated import is available for this panel yet. To keep the view reliable, zeros, samples, and presentation numbers are not shown as substitutes."
              )}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {tr(locale, "Origem", "Source")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {data.source.name ||
              tr(locale, "Aguardando configuração", "Awaiting configuration")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {tr(locale, "Situação", "Status")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {tr(locale, "Aguardando importação", "Awaiting import")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {tr(locale, "Período consultado", "Selected period")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {fullDate(data.period.dateFrom, locale)} {tr(locale, "a", "to")}{" "}
            {fullDate(data.period.dateTo, locale)}
          </p>
        </div>
      </div>
      {data.notes.length ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <details>
            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
              {tr(locale, "Observações da importação", "Import notes")}
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
  pendingChanges,
  locale = "pt-BR",
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
  pendingChanges: boolean;
  locale?: LeadsLocale;
}) {
  const update = (key: keyof V2DashboardFilters, value: string) =>
    setDraft({
      ...draft,
      [key]:
        key === "dateFrom" || key === "dateTo" ? value : value || undefined,
      page: 1,
    });
  return (
    <Card className="overflow-hidden">
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault();
          onSearch();
        }}
      >
        <fieldset disabled={isFetching} className="contents">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#e2212d]" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-900">
                {tr(locale, "Filtros de leads", "Lead filters")}
              </h2>
              <span className="hidden text-xs text-slate-400 sm:inline">
                {tr(
                  locale,
                  "Dados encerrados até D-1",
                  "Data closed through D-1"
                )}
              </span>
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={tr(locale, "Período rápido", "Quick period")}
            >
              {LEAD_PERIOD_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onPreset(preset)}
                  aria-pressed={selectedPreset === preset}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selectedPreset === preset ? "bg-red-50 text-[#e2212d]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
                >
                  {tr(
                    locale,
                    preset,
                    (
                      {
                        Hoje: "Today",
                        Ontem: "Yesterday",
                        "Últimos 7 dias": "Last 7 days",
                        "Últimos 30 dias": "Last 30 days",
                        "7 dias": "7 days",
                        "14 dias": "14 days",
                        "30 dias": "30 days",
                        "60 dias": "60 days",
                        "Mês passado": "Previous month",
                        Mês: "Month",
                      } as Record<string, string>
                    )[preset] ?? preset
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <label className="xl:col-span-1">
              <span className="v2-label">{tr(locale, "Início", "From")}</span>
              <input
                aria-label={tr(locale, "Data inicial", "Start date")}
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
              <span className="v2-label">{tr(locale, "Fim", "To")}</span>
              <input
                aria-label={tr(locale, "Data final", "End date")}
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
              label={tr(locale, "Modelo", "Model")}
              value={draft.model ?? ""}
              options={options.models}
              onChange={value => update("model", value)}
              locale={locale}
            />
            <SelectFilter
              label={tr(locale, "Canal", "Channel")}
              value={draft.channel ?? ""}
              options={options.channels}
              onChange={value => update("channel", value)}
              locale={locale}
            />
            <SelectFilter
              label={tr(locale, "Concessionária", "Dealer")}
              value={draft.dealer ?? ""}
              options={options.dealers}
              onChange={value => update("dealer", value)}
              locale={locale}
            />
            <label className="sm:col-span-2 xl:col-span-2">
              <span className="v2-label">
                {clientMode
                  ? tr(locale, "Cidade/UF/concessionária", "City/state/dealer")
                  : tr(locale, "Busca", "Search")}
              </span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  aria-label={
                    clientMode
                      ? tr(
                          locale,
                          "Cidade/UF/concessionária",
                          "City/state/dealer"
                        )
                      : tr(locale, "Buscar lead", "Search Leads")
                  }
                  value={draft.search ?? ""}
                  onChange={event => update("search", event.target.value)}
                  placeholder={
                    clientMode
                      ? tr(
                          locale,
                          "Cidade, UF ou concessionária",
                          "City, state, or dealer"
                        )
                      : tr(
                          locale,
                          "Nome, cidade ou estado",
                          "Name, city, or state"
                        )
                  }
                  className="v2-input pl-9"
                />
              </div>
            </label>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-h-5 text-xs text-[#b41b26]">
              {dateError ??
                (pendingChanges
                  ? tr(
                      locale,
                      "Filtros alterados. Clique em Buscar para aplicar.",
                      "Filters changed. Click Search to apply."
                    )
                  : `${tr(locale, "Limite operacional", "Operational cutoff")}: ${fullDate(cutoff, locale)} (America/Sao_Paulo)`)}
            </p>
            <button
              type="submit"
              disabled={isFetching}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#e2212d] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#c91c28] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <Search className="h-4 w-4" />
              {isFetching
                ? tr(locale, "Buscando…", "Searching…")
                : tr(locale, "Buscar", "Search")}
            </button>
          </div>
        </fieldset>
      </form>
    </Card>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
  locale = "pt-BR",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  locale?: LeadsLocale;
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
        <option value="">{tr(locale, "Todos", "All")}</option>
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
  onReloadMonth,
  canManage,
  locale = "pt-BR",
}: {
  data: V2LeadsResponse;
  onUpdated: () => void;
  onReloadMonth: () => Promise<LeadsReloadResult>;
  canManage: boolean;
  locale?: LeadsLocale;
}) {
  const pacing = data.pacing;
  const progressRatio =
    pacing.progressPercent == null ? null : pacing.progressPercent / 100;
  const progressWidth =
    progressRatio == null
      ? 0
      : Math.min(100, Math.max(0, pacing.progressPercent ?? 0));
  const narrowed = data.notes.some(note =>
    note.includes("Meta mensal global não aplicada")
  );
  return (
    <Card className="overflow-hidden">
      <CardHeading
        eyebrow={tr(locale, "Ritmo mensal", "Monthly pace")}
        title={tr(locale, "Pacing de leads", "Lead pacing")}
        description={tr(
          locale,
          "Pacing MTD da competência até D-1; as demais métricas respeitam o período filtrado.",
          "MTD pace for the period through D-1; other metrics follow the selected filters."
        )}
        icon={Target}
        action={
          <div className="pacing-card-actions">
            <span
              className={`pacing-card-status rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(pacing.status)}`}
            >
              {statusText(pacing.status, locale)}
            </span>
            <div className="pacing-card-action-control">
              <V2LeadsReloadButton
                competence={pacing.competence}
                onReload={onReloadMonth}
                syncExternal={canManage}
                showFeedback={false}
                locale={locale}
              />
            </div>
            {canManage ? (
              <div className="pacing-card-action-control">
                <V2MonthlyGoalEditor
                  competence={pacing.competence}
                  onUpdated={onUpdated}
                  canManage={canManage}
                />
              </div>
            ) : null}
          </div>
        }
        actionHelp={
          canManage
            ? tr(
                locale,
                "Atualizar base importa a planilha-base pelo servidor; requer conexão Google própria configurada. Atualizar metas altera somente a meta mensal.",
                "Update source imports the base spreadsheet through the server; it requires a configured Google connection. Update goals changes only the monthly target."
              )
            : tr(
                locale,
                "Atualizar indicadores consulta os dados armazenados. A importação externa é controlada pelo administrador.",
                "Refresh indicators reads stored data. External imports are controlled by an administrator."
              )
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                {tr(locale, "Competência", "Period")} {pacing.competence}
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                {numberFormat(pacing.current, locale)}
              </p>
              <p className="text-xs text-slate-500">
                {tr(locale, "Leads MTD da competência", "Period MTD Leads")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">
                {tr(locale, "Meta mensal", "Monthly target")}
              </p>
              <p
                className={`mt-1 text-xl font-bold ${pacing.goal == null ? "text-slate-400" : "text-slate-900"}`}
              >
                {pacing.goal == null
                  ? tr(locale, "Indisponível", "Unavailable")
                  : numberFormat(pacing.goal, locale)}
              </p>
            </div>
          </div>
          <div
            className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label={tr(
              locale,
              "Atingimento da meta de Leads",
              "Lead target attainment"
            )}
            aria-valuenow={
              pacing.progressPercent == null
                ? undefined
                : Math.min(100, pacing.progressPercent)
            }
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#e2212d] transition-all"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-[11px] text-slate-500">
            <span>
              {progressRatio == null
                ? tr(
                    locale,
                    "Percentual indisponível sem meta",
                    "Percentage unavailable without a target"
                  )
                : `${percentFormat(progressRatio, locale)} ${tr(locale, "da meta", "of target")}`}
            </span>
            <span>
              {pacing.closedDays}/{pacing.daysInMonth}{" "}
              {tr(locale, "dias fechados", "days closed")}
            </span>
          </div>
          {pacing.goal == null ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
              {narrowed
                ? tr(
                    locale,
                    "Recorte ativo: a meta global não é comparada a um subconjunto de Leads. Remova os filtros para acompanhar a meta mensal.",
                    "Filtered view: the global target is not compared with a Lead subset. Remove filters to follow the monthly target."
                  )
                : tr(
                    locale,
                    "Clique em Atualizar metas para definir o objetivo do mês e habilitar os KPIs de atingimento.",
                    "Click Update goals to set the monthly target and enable attainment KPIs."
                  )}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] leading-5 text-slate-400">
            {tr(
              locale,
              "Meta salva por competência. Alterações atualizam os KPIs e mantêm os meses anteriores.",
              "Target saved by period. Changes update KPIs while preserving previous months."
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          <PacingMetric
            label={tr(locale, "Média/dia", "Average/day")}
            value={numberFormat(Math.round(pacing.averagePerDay), locale)}
          />
          <PacingMetric
            label={tr(locale, "Necessário/dia", "Required/day")}
            value={
              pacing.requiredPerDay == null
                ? tr(locale, "N/D", "N/A")
                : numberFormat(Math.ceil(pacing.requiredPerDay), locale)
            }
          />
          <PacingMetric
            label={tr(locale, "Projeção", "Projection")}
            value={numberFormat(pacing.projection, locale)}
          />
          <PacingMetric
            label={tr(locale, "Restante", "Remaining")}
            value={
              pacing.remainingToGoal == null
                ? tr(locale, "N/D", "N/A")
                : numberFormat(Math.max(0, pacing.remainingToGoal), locale)
            }
          />
          <PacingMetric
            label={tr(locale, "Esperado até D-1", "Expected through D-1")}
            value={
              pacing.goal == null
                ? tr(locale, "N/D", "N/A")
                : numberFormat(
                    Math.round(
                      (pacing.goal * pacing.closedDays) / pacing.daysInMonth
                    ),
                    locale
                  )
            }
          />
          <PacingMetric
            label={tr(locale, "Projeção vs. meta", "Projection vs. target")}
            value={
              pacing.projectedDifference == null
                ? tr(locale, "N/D", "N/A")
                : `${pacing.projectedDifference >= 0 ? "+" : ""}${numberFormat(pacing.projectedDifference, locale)}`
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

function unavailablePerformanceValue(locale: LeadsLocale = "pt-BR") {
  return (
    <span className="text-slate-400">
      {tr(locale, "Indisponível", "Unavailable")}
    </span>
  );
}

function performanceNumber(
  value: number | null,
  available: boolean,
  locale: LeadsLocale = "pt-BR"
) {
  if (!available || value == null) return unavailablePerformanceValue(locale);
  return numberFormat(value, locale);
}

function performancePercent(
  value: number | null,
  available: boolean,
  locale: LeadsLocale = "pt-BR"
) {
  if (!available || value == null) return unavailablePerformanceValue(locale);
  return percentFormat(value, locale);
}

type DealerPerformanceRow =
  V2LeadsResponse["dealerPerformance"]["rows"][number];
type GroupedGoal = NonNullable<
  V2LeadsResponse["dealerPerformance"]["groupedGoals"]
>[number];

type DealerDisplayRow = DealerPerformanceRow & {
  official: boolean;
  sourceLabels: string[];
};

function commercialKindLabel(
  kind: GroupedGoal["kind"],
  locale: LeadsLocale = "pt-BR"
) {
  if (kind === "lead-goals") return tr(locale, "Meta de Leads", "Lead goal");
  if (kind === "sales-goals") return tr(locale, "Meta de Vendas", "Sales goal");
  return tr(locale, "Vendas", "Sales");
}

function sourcesByOfficialDealer(
  groups: GroupedGoal[],
  locale: LeadsLocale = "pt-BR"
) {
  const sources = new Map<string, string[]>();
  for (const group of groups) {
    for (const dealer of group.dealers) {
      const canonical = officialDealer(dealer)?.name ?? dealer;
      const current = sources.get(canonical) ?? [];
      const label = `${commercialKindLabel(group.kind, locale)}: ${group.sourceLabel}`;
      if (!current.includes(label)) current.push(label);
      sources.set(canonical, current);
    }
  }
  return sources;
}

function GroupGoalBadge({
  value,
  groups,
  locale = "pt-BR",
}: {
  value: number | null;
  groups: GroupedGoal[];
  locale?: LeadsLocale;
}) {
  const collectiveGroups = groups.filter(group => group.dealers.length !== 1);
  if (value != null || !collectiveGroups.length) return null;
  return (
    <div className="mt-1">
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
        {tr(locale, "Meta de grupo", "Group target")}
      </span>
      <details className="mt-1 text-[11px] font-normal text-slate-500">
        <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
          {tr(locale, "Origem do grupo", "Group source")} (
          {collectiveGroups.length})
        </summary>
        <ul className="mt-1 space-y-0.5 leading-4">
          {collectiveGroups.map(group => (
            <li key={`${group.kind}:${group.key}`}>
              {group.sourceLabel} ·{" "}
              {tr(locale, "valor do grupo", "group value")}:{" "}
              {group.value == null
                ? tr(locale, "N/D", "N/A")
                : numberFormat(group.value, locale)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function UnmatchedLeadDetails({
  rows,
  locale = "pt-BR",
}: {
  rows: DealerPerformanceRow[];
  locale?: LeadsLocale;
}) {
  if (!rows.length) return null;
  return (
    <details
      data-overview-pdf-exclude
      className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs"
    >
      <summary className="cursor-pointer font-semibold text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
        {tr(
          locale,
          "Leads sem dealer oficial conciliado",
          "Leads without a matched official dealer"
        )}{" "}
        ({rows.length} {tr(locale, "linhas", "rows")})
      </summary>
      <p className="mt-2 leading-5 text-amber-900">
        {tr(
          locale,
          "Os nomes abaixo permanecem na origem e não são transferidos para uma unidade oficial por aproximação. Os totais globais não mudam.",
          "The names below remain from the source and are not assigned to an official unit by approximation. Global totals do not change."
        )}
      </p>
      <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-left">
          <thead className="bg-amber-50 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900">
            <tr>
              <th className="px-3 py-2">
                {tr(locale, "Dealer original", "Original dealer")}
              </th>
              <th className="px-3 py-2">{tr(locale, "UF", "State")}</th>
              <th className="px-3 py-2 text-right">Leads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {rows.map((row, index) => (
              <tr key={`${row.dealer}:${row.state}:${index}`}>
                <td className="px-3 py-2 font-semibold text-slate-700">
                  {row.dealer || tr(locale, "Não informado", "N/A")}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {row.state || tr(locale, "N/D", "N/A")}
                </td>
                <td className="px-3 py-2 text-right font-bold text-slate-900">
                  {numberFormat(row.leads, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function GroupedGoalsDetails({
  groups,
  locale = "pt-BR",
}: {
  groups: GroupedGoal[];
  locale?: LeadsLocale;
}) {
  if (!groups.length) return null;
  return (
    <details className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
        {tr(locale, "Metas e vendas na origem", "Goals and sales from source")}{" "}
        ({groups.length}) —{" "}
        {tr(
          locale,
          "individuais e coletivas, sem somar grupos aos KPIs",
          "individual and collective; groups are not added to KPIs"
        )}
      </summary>
      <p className="mt-2 leading-5 text-slate-500">
        {tr(
          locale,
          "A tabela principal mostra valores individuais por unidade. Cada valor coletivo abaixo aparece uma única vez, com o nome original preservado; não há rateio por loja.",
          "The main table shows individual values by unit. Each collective value below appears once, preserving the original name; no store allocation is applied."
        )}
      </p>
      <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[760px] w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            <tr>
              <th className="px-3 py-2">
                {tr(locale, "Unidade oficial", "Official unit")}
              </th>
              <th className="px-3 py-2">
                {tr(locale, "Fonte original", "Original source")}
              </th>
              <th className="px-3 py-2">
                {tr(locale, "Classificação", "Classification")}
              </th>
              <th className="px-3 py-2 text-right">
                {tr(locale, "Valor do grupo", "Group value")}
              </th>
              <th className="px-3 py-2 text-right">
                {tr(locale, "Leads na base", "Leads in source")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group, index) => {
              const dealers = group.dealers.length
                ? group.dealers.map(
                    dealer => officialDealer(dealer)?.name ?? dealer
                  )
                : ["Fora do cadastro oficial"];
              const collective = group.dealers.length !== 1;
              return (
                <tr key={`${group.kind}:${group.key}:${index}`}>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {dealers.map(dealer => (
                      <span className="block" key={dealer}>
                        {dealer}
                      </span>
                    ))}
                  </td>
                  <td
                    className="max-w-[220px] break-words px-3 py-2 align-top font-semibold text-slate-700"
                    title={group.sourceLabel}
                  >
                    {group.sourceLabel}
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                      {commercialKindLabel(group.kind, locale)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${collective ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
                    >
                      {collective
                        ? tr(
                            locale,
                            "Coletiva — sem rateio por loja",
                            "Collective — no store allocation"
                          )
                        : tr(
                            locale,
                            "Individual — unidade oficial",
                            "Individual — official unit"
                          )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right align-top font-bold text-slate-900">
                    {group.value == null
                      ? tr(locale, "N/D", "N/A")
                      : numberFormat(group.value, locale)}
                  </td>
                  <td className="px-3 py-2 text-right align-top text-slate-600">
                    {numberFormat(group.leads, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function DealerPerformanceCard({
  data,
  onUpdated,
  canManage,
  filters,
  locale = "pt-BR",
}: {
  data: V2LeadsResponse;
  onUpdated: () => void;
  canManage: boolean;
  filters: V2DashboardFilters;
  locale?: "pt-BR" | "en";
}) {
  const performance = data.dealerPerformance;
  const lookupDealer = useMemo(
    () => (label: string) =>
      officialDealer(label) ??
      data.dealerRegistry?.find(
        dealer => normalizeDealerKey(dealer.name) === normalizeDealerKey(label)
      ),
    [data.dealerRegistry]
  );
  const available = performance.available;
  const totals = performance.totals;
  const [dealerSearch, setDealerSearch] = useState("");
  const [dealerSort, setDealerSort] = useState("leads");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const groupedGoals = performance.groupedGoals ?? [];
  const sourceLabels = useMemo(
    () => sourcesByOfficialDealer(groupedGoals, locale),
    [groupedGoals, locale]
  );
  const goalGroupsByDealer = useMemo(() => {
    const groups = new Map<string, GroupedGoal[]>();
    for (const group of groupedGoals) {
      for (const dealer of group.dealers) {
        const official = lookupDealer(dealer);
        const key = official?.name ?? dealer;
        const current = groups.get(key) ?? [];
        current.push(group);
        groups.set(key, current);
      }
    }
    return groups;
  }, [groupedGoals]);
  const unmatchedLeadRows = useMemo(
    () => performance.rows.filter(row => !lookupDealer(row.dealer)),
    [performance.rows, lookupDealer]
  );
  const displayRows = useMemo<DealerDisplayRow[]>(() => {
    return performance.rows
      .filter(row => {
        const dealer = lookupDealer(row.dealer);
        return dealer ? showDealerInCommercialTable(dealer.name) : false;
      })
      .map(row => {
        const official = lookupDealer(row.dealer);
        const labels = new Set(
          official ? (sourceLabels.get(official.name) ?? []) : []
        );
        if (official && row.dealer !== official.name)
          labels.add(`Fonte original: ${row.dealer}`);
        return {
          ...row,
          dealer: official?.name ?? row.dealer,
          state: row.state || official?.state || row.state,
          official: Boolean(officialDealer(row.dealer)),
          sourceLabels: Array.from(labels),
        };
      });
  }, [performance.rows, sourceLabels, lookupDealer]);
  const filteredRows = useMemo(
    () =>
      displayRows
        .filter(
          row =>
            !dealerSearch.trim() ||
            [row.dealer, row.state, ...row.sourceLabels].some(value =>
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
    [displayRows, dealerSearch, dealerSort]
  );
  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
  }, [dealerSearch, dealerSort, data.period.dateFrom, data.period.dateTo]);
  return (
    <Card className="overflow-hidden">
      <CardHeading
        eyebrow={tr(locale, "Acompanhamento comercial", "Commercial tracking")}
        title={tr(
          locale,
          "Vendas e metas por concessionária",
          "Sales and goals by dealer"
        )}
        description={tr(
          locale,
          "Concessionárias em acompanhamento. Unidades EM BREVE não são exibidas nesta tabela.",
          "Dealers under tracking. UPCOMING units are not shown in this table."
        )}
        icon={TrendingUp}
        action={
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${available ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
          >
            {available
              ? tr(locale, "Fonte disponível", "Source available")
              : tr(locale, "Aguardando arquivos", "Awaiting files")}
          </span>
        }
      />
      {canManage ? (
        <div data-overview-pdf-exclude>
          <V2CommercialUploads
            competence={data.pacing.competence}
            onUpdated={onUpdated}
            canManage={canManage}
          />
        </div>
      ) : null}
      {performance.warnings?.length ? (
        <div
          data-overview-pdf-exclude
          className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"
          role="status"
        >
          <p className="font-bold">
            Leitura das fontes comerciais — sem alocação por aproximação
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {performance.warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <UnmatchedLeadDetails rows={unmatchedLeadRows} locale={locale} />
      {performance.unmapped?.length ? (
        <details
          data-overview-pdf-exclude
          className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
        >
          <summary className="cursor-pointer font-semibold text-slate-700">
            {performance.unmapped.length}{" "}
            {tr(
              locale,
              "linhas comerciais sem vínculo com unidade oficial — ver origem preservada",
              "commercial rows without an official unit — view preserved source"
            )}
          </summary>
          <p className="mt-2 leading-5 text-slate-500">
            {tr(
              locale,
              "Linha fora do cadastro ou vínculo ainda não definido; metas mantidas na origem, sem alocação por aproximação.",
              "Row is outside the registry or not yet linked; goals remain in the source without approximate allocation."
            )}
          </p>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="py-2">{tr(locale, "Fonte", "Source")}</th>
                  <th>{tr(locale, "Nome original", "Original name")}</th>
                  <th className="text-right">
                    {tr(locale, "Meta/quantidade", "Goal/quantity")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {performance.unmapped.map(row => (
                  <tr
                    key={`${row.kind}:${row.key}`}
                    className="border-t border-slate-200"
                  >
                    <td className="py-2">
                      {row.kind === "lead-goals"
                        ? tr(locale, "Meta de Leads", "Lead goal")
                        : row.kind === "sales-goals"
                          ? tr(locale, "Meta de Vendas", "Sales goal")
                          : tr(locale, "Vendas", "Sales")}
                    </td>
                    <td>{row.sourceLabel}</td>
                    <td className="text-right">
                      {row.value == null
                        ? tr(locale, "N/D", "N/A")
                        : numberFormat(row.value, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      <V2CommercialSummary
        performance={performance}
        competence={data.pacing.competence}
        canManage={canManage}
        onUpdated={onUpdated}
        locale={locale}
        generalComparable={
          isMonthToDateCommercialPeriod(filters) &&
          ![
            filters.model,
            filters.channel,
            filters.campaign,
            filters.dealer,
            filters.search,
          ].some(value => Boolean(value?.trim()))
        }
      />
      <GroupedGoalsDetails groups={groupedGoals} locale={locale} />
      <div
        data-overview-pdf-exclude
        className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end"
      >
        <label className="min-w-0 flex-1">
          <span className="v2-label">
            {tr(
              locale,
              "Consultar concessionária ou UF",
              "Search dealer or state"
            )}
          </span>
          <input
            className="v2-input"
            value={dealerSearch}
            onChange={event => {
              setDealerSearch(event.target.value);
            }}
            placeholder={tr(locale, "Buscar na tabela", "Search this table")}
          />
        </label>
        <label className="sm:w-48">
          <span className="v2-label">{tr(locale, "Ordenação", "Sort")}</span>
          <select
            className="v2-input"
            value={dealerSort}
            onChange={event => {
              setDealerSort(event.target.value);
            }}
          >
            <option value="leads">
              {tr(locale, "Mais Leads primeiro", "Most Leads first")}
            </option>
            <option value="name">
              {tr(locale, "Nome da concessionária", "Dealer name")}
            </option>
          </select>
        </label>
      </div>
      <div
        ref={tableScrollRef}
        className="mg-dealer-scroll"
        tabIndex={0}
        role="region"
        aria-label={tr(
          locale,
          "Tabela de vendas e metas por concessionária — role para consultar todas as lojas",
          "Sales and goals by dealer — scroll to view all stores"
        )}
      >
        <table className="min-w-[760px] w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            <tr>
              <th className="px-5 py-3">
                {tr(locale, "Concessionária / fonte", "Dealer / source")}
              </th>
              <th className="px-4 py-3">{tr(locale, "UF", "State")}</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">
                {tr(locale, "Meta leads · unidade", "Lead goal · unit")}
              </th>
              <th className="px-4 py-3 text-right">
                {getDealerSalesKind(performance) === "registration"
                  ? tr(locale, "Vendas · Registration", "Sales · Registration")
                  : getDealerSalesKind(performance) === "retail"
                    ? tr(locale, "Vendas · Retail", "Sales · Retail")
                    : tr(locale, "Vendas", "Sales")}
              </th>
              <th className="px-4 py-3 text-right">
                {tr(locale, "Meta vendas · unidade", "Sales goal · unit")}
              </th>
              <th className="px-5 py-3 text-right">
                {tr(locale, "Conversão", "Conversion")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredRows.length ? (
              filteredRows.map(row => (
                <tr
                  key={`${row.dealer}-${row.state}`}
                  className="transition hover:bg-slate-50"
                >
                  <td
                    className="max-w-[260px] px-5 py-3 font-semibold text-slate-800"
                    title={row.dealer}
                  >
                    <span className="block truncate">
                      {row.dealer || tr(locale, "Não informado", "N/A")}
                    </span>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${row.official ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}
                    >
                      {row.official
                        ? tr(locale, "Cadastro oficial", "Official registry")
                        : tr(locale, "Cadastro por arquivo", "File registry")}
                    </span>
                    {row.sourceLabels.length ? (
                      <details className="mt-1 text-[11px] font-normal text-slate-500">
                        <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                          {tr(locale, "Fontes originais", "Original sources")} (
                          {row.sourceLabels.length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 leading-4">
                          {row.sourceLabels.map(source => (
                            <li key={source}>{source}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.state || tr(locale, "N/D", "N/A")}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {numberFormat(row.leads, locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {performanceNumber(row.leadGoal, available, locale)}
                    <GroupGoalBadge
                      value={row.leadGoal}
                      groups={
                        goalGroupsByDealer
                          .get(row.dealer)
                          ?.filter(group => group.kind === "lead-goals") ?? []
                      }
                      locale={locale}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {performanceNumber(row.sales, available, locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {performanceNumber(row.salesGoal, available, locale)}
                    <GroupGoalBadge
                      value={row.salesGoal}
                      groups={
                        goalGroupsByDealer
                          .get(row.dealer)
                          ?.filter(group => group.kind === "sales-goals") ?? []
                      }
                      locale={locale}
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {performancePercent(row.conversionRate, available, locale)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <EmptyDistribution
                    label={tr(
                      locale,
                      "Nenhuma concessionária corresponde à consulta.",
                      "No dealer matches this search."
                    )}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <span>
          {filteredRows.length}{" "}
          {tr(
            locale,
            "concessionárias · Os totais acima permanecem os do período.",
            "dealers · totals above remain for the selected period."
          )}
        </span>
        <span className="text-[11px] text-slate-400">
          {tr(
            locale,
            "Role para consultar todas as lojas",
            "Scroll to view all stores"
          )}
        </span>
      </div>
      <div
        data-overview-pdf-exclude
        className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500"
      >
        {available ? (
          <span>
            {performance.sourceName
              ? `${tr(locale, "Fonte", "Source")}: ${performance.sourceName}. `
              : ""}
            {performance.updatedAt
              ? formatImportedAt(performance.updatedAt, locale)
              : tr(
                  locale,
                  "Atualização da fonte não informada.",
                  "Source update time unavailable."
                )}
          </span>
        ) : (
          <span>
            {tr(
              locale,
              "Fonte de vendas e metas por concessionária ainda não configurada.",
              "Sales and dealer-goal source is not configured yet."
            )}
          </span>
        )}
      </div>
    </Card>
  );
}

function DailyChart({
  daily,
  showPace = true,
  locale = "pt-BR",
}: {
  daily: V2DailyPoint[];
  showPace?: boolean;
  locale?: LeadsLocale;
}) {
  const channelKeys = useMemo(
    () =>
      Array.from(new Set(daily.flatMap(item => Object.keys(item.channels)))),
    [daily]
  );
  const chartData = useMemo(
    () =>
      daily.map(item => ({
        ...item,
        cumulative: item.sourceAvailable === false ? null : item.cumulative,
        ...Object.fromEntries(
          channelKeys.map(key => [
            `channel:${key}`,
            item.sourceAvailable === false ? null : (item.channels[key] ?? 0),
          ])
        ),
      })),
    [channelKeys, daily]
  );
  if (!daily.length)
    return (
      <EmptyDistribution
        label={tr(
          locale,
          "Sem dados diários para este período.",
          "No daily data for this period."
        )}
      />
    );
  if (daily.every(item => item.sourceAvailable === false))
    return (
      <EmptyDistribution
        label={tr(
          locale,
          "Aguardando atualização da fonte para este período",
          "Awaiting source update for this period"
        )}
      />
    );
  if (!daily.some(item => item.total != null && item.total > 0))
    return (
      <EmptyDistribution
        label={tr(
          locale,
          "Nenhum Lead no período selecionado.",
          "No Leads in the selected period."
        )}
      />
    );
  return (
    <div className="px-3 pb-5 pt-3 sm:px-5">
      <div
        data-overview-pdf-legend
        className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500"
      >
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
          <i className="h-2 w-2 rounded-full bg-slate-800" />{" "}
          {tr(locale, "Real acumulado", "Cumulative actuals")}
        </span>
        {showPace ? (
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full border border-dashed border-blue-600" />{" "}
            {tr(locale, "Pace acumulado", "Cumulative pace")}
          </span>
        ) : null}
      </div>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={tr(
          locale,
          "Gráfico diário de Leads, com totais sobre as barras",
          "Daily Lead chart with totals above the bars"
        )}
        tabIndex={0}
      >
        <div
          className="h-[330px] w-full"
          style={{
            minWidth: daily.length > 14 ? daily.length * 48 : undefined,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 28, right: 8, left: -18, bottom: 4 }}
            >
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={value => compactDate(String(value), locale)}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                yAxisId="bars"
                allowDecimals={false}
                domain={[
                  0,
                  (maximum: number) => Math.max(1, Math.ceil(maximum * 1.15)),
                ]}
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
                labelFormatter={label => fullDate(String(label), locale)}
                formatter={(value: unknown, name: string) => [
                  typeof value === "number"
                    ? numberFormat(value, locale)
                    : tr(locale, "Indisponível", "Unavailable"),
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
                >
                  {index === channelKeys.length - 1 ? (
                    <LabelList
                      dataKey="total"
                      position="top"
                      offset={10}
                      fill="#334155"
                      fontSize={12}
                      fontWeight={700}
                      stroke="#ffffff"
                      strokeWidth={3}
                      paintOrder="stroke"
                      formatter={(value: unknown) =>
                        typeof value === "number" ? numberFormat(value) : ""
                      }
                    />
                  ) : null}
                </Bar>
              ))}
              <Line
                yAxisId="lines"
                type="monotone"
                dataKey="cumulative"
                name={tr(locale, "Real acumulado", "Cumulative actuals")}
                stroke="#1e293b"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              {showPace ? (
                <Line
                  yAxisId="lines"
                  type="monotone"
                  dataKey="pace"
                  name={tr(locale, "Pace acumulado", "Cumulative pace")}
                  stroke="#2563eb"
                  strokeWidth={1.8}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  data,
  onGoalUpdated,
  onReloadMonth,
  onRefreshPdf,
  canManage,
  clientView = false,
  overviewOnly = false,
  filters,
  busy = false,
  locale = "pt-BR",
}: {
  data: V2LeadsResponse;
  onGoalUpdated: () => void;
  onReloadMonth: () => Promise<LeadsReloadResult>;
  onRefreshPdf?: () => Promise<V2LeadsResponse>;
  canManage: boolean;
  clientView?: boolean;
  overviewOnly?: boolean;
  filters: V2DashboardFilters;
  busy?: boolean;
  locale?: "pt-BR" | "en";
}) {
  const overviewPdfRef = useRef<HTMLDivElement>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <V2OverviewPdfButton
          rootRef={overviewPdfRef}
          data={data}
          filters={filters}
          onRefresh={onRefreshPdf}
          busy={busy}
          locale={locale}
        />
      </div>
      <div
        ref={overviewPdfRef}
        data-overview-pdf-root
        data-overview-pdf-version={getOverviewPdfSnapshotVersion(data)}
        className="space-y-4"
      >
        {data.historicalPace ? (
          <V2HistoricalLeadPaceCard
            data={data.historicalPace}
            clientView={clientView}
            locale={locale}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <V2LeadsReloadButton
                  competence={data.pacing.competence}
                  onReload={onReloadMonth}
                  syncExternal={canManage}
                  showFeedback={false}
                  locale={locale}
                />
                {canManage ? (
                  <V2MonthlyGoalEditor
                    competence={data.pacing.competence}
                    onUpdated={onGoalUpdated}
                    canManage={canManage}
                  />
                ) : null}
              </div>
            }
          />
        ) : (
          <PacingCard
            data={data}
            onUpdated={onGoalUpdated}
            onReloadMonth={onReloadMonth}
            canManage={canManage}
            locale={locale}
          />
        )}
        <Card className="overflow-hidden" pdfChart="daily">
          <CardHeading
            eyebrow={tr(locale, "Evolução diária", "Daily evolution")}
            title={tr(
              locale,
              "Leads por dia e canal",
              "Leads by day and channel"
            )}
            description={
              data.historicalPace
                ? tr(
                    locale,
                    "Barras por canal e realizado acumulado do período. O plano e a projeção mensal estão na curva histórica acima.",
                    "Bars by channel and cumulative actuals for the period. The plan and monthly projection are in the historical curve above."
                  )
                : tr(
                    locale,
                    "Barras empilhadas com o real acumulado e o pace retornado pela API.",
                    "Stacked bars with cumulative actuals and the pace returned by the API."
                  )
            }
            icon={TrendingUp}
          />
          <DailyChart
            daily={data.daily}
            showPace={!data.historicalPace}
            locale={locale}
          />
        </Card>
        {canManage && !clientView ? (
          <V2ModelDeliveryCard
            items={data.models}
            total={data.summary.total}
            locale={locale}
          />
        ) : null}
        <div className={`grid gap-4 ${clientView ? "" : "lg:grid-cols-2"}`}>
          {!clientView ? (
            <Card className="overflow-hidden">
              <CardHeading
                title={tr(
                  locale,
                  "Distribuição por canal",
                  "Channel distribution"
                )}
                icon={BarChart3}
              />
              <DistributionList
                items={data.channels}
                limit={data.channels.length}
                locale={locale}
              />
            </Card>
          ) : null}
          <Card className="overflow-hidden">
            <CardHeading
              title={tr(locale, "Top 10 estados", "Top 10 states")}
              icon={MapPin}
            />
            <DistributionList
              items={[...data.states]
                .filter(item => resolveBrazilianState(item.label) !== null)
                .sort(
                  (a, b) =>
                    b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
                )}
              limit={10}
              locale={locale}
            />
          </Card>
        </div>
        <DealerPerformanceCard
          data={data}
          onUpdated={onGoalUpdated}
          canManage={overviewOnly ? false : canManage}
          filters={filters}
          locale={locale}
        />
        {data.notes.length ? (
          <Notes notes={data.notes} locale={locale} />
        ) : null}
        <V2OverviewDealerRankings data={data} locale={locale} />
      </div>
    </div>
  );
}

function Notes({
  notes,
  locale = "pt-BR",
}: {
  notes: string[];
  locale?: LeadsLocale;
}) {
  return (
    <div
      data-overview-pdf-exclude
      className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
    >
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <CircleHelp className="h-4 w-4 text-slate-400" />{" "}
        {tr(locale, "Notas da fonte", "Source notes")}
      </div>
      <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-500 md:grid-cols-2">
        {notes.map(note => (
          <li key={note}>• {note}</li>
        ))}
      </ul>
    </div>
  );
}

function RegionsTab({
  data,
  locale = "pt-BR",
}: {
  data: V2LeadsResponse;
  locale?: LeadsLocale;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeading
          eyebrow={tr(locale, "Geografia", "Geography")}
          title={tr(locale, "Leads por estado", "Leads by state")}
          description={tr(
            locale,
            "Distribuição conforme o campo de estado recebido.",
            "Distribution based on the received state field."
          )}
          icon={MapPin}
        />
        <div className="max-h-[520px] overflow-y-auto">
          <DistributionList items={data.states} limit={28} locale={locale} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeading
          eyebrow={tr(locale, "Geografia", "Geography")}
          title={tr(locale, "Leads por cidade", "Leads by city")}
          description={tr(
            locale,
            "Cidades com maior volume no período.",
            "Cities with the highest volume in the period."
          )}
          icon={MapPin}
        />
        <DistributionList items={data.cities} limit={12} locale={locale} />
      </Card>
      <Card className="overflow-hidden lg:col-span-2">
        <CardHeading
          title={tr(locale, "Leitura regional", "Regional view")}
          icon={TrendingUp}
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <SummaryFact
            label={tr(locale, "Estados identificados", "Identified states")}
            value={numberFormat(data.summary.states, locale)}
          />
          <SummaryFact
            label={tr(locale, "Cidades identificadas", "Identified cities")}
            value={numberFormat(data.summary.cities, locale)}
          />
          <SummaryFact
            label={tr(locale, "Estado líder", "Top state")}
            value={
              data.summary.topState?.label ??
              tr(locale, "Indisponível", "Unavailable")
            }
          />
        </div>
      </Card>
      <div className="lg:col-span-2">
        <V2RegionalModelMatrix data={data.regionalModels} locale={locale} />
      </div>
    </div>
  );
}

function CrmDonut({
  items,
  locale = "pt-BR",
}: {
  items: V2DistributionItem[];
  locale?: LeadsLocale;
}) {
  if (!items.length)
    return (
      <EmptyDistribution
        label={tr(
          locale,
          "CRM indisponível para os metadados atuais.",
          "CRM is unavailable for the current metadata."
        )}
      />
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
              {numberFormat(item.count, locale)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoresCrmTab({
  clientMode,
  canManage,
  locale = "pt-BR",
}: {
  clientMode: boolean;
  canManage: boolean;
  locale?: LeadsLocale;
}) {
  return (
    <V2DispatchControl
      authenticated
      clientMode={clientMode}
      canManage={canManage}
      locale={locale}
      embedded
    />
  );
}

function LeadsTableTab({
  data,
  filters,
  onPage,
  clientMode,
  isBusy,
  locale = "pt-BR",
}: {
  data: V2LeadsResponse;
  filters: V2Filters;
  onPage: (page: number) => void;
  clientMode: boolean;
  isBusy: boolean;
  locale?: LeadsLocale;
}) {
  const totalPages = Math.max(
    1,
    Math.ceil(data.recent.total / data.recent.pageSize)
  );
  const currentPage = data.recent.page;
  return (
    <Card className="overflow-hidden">
      <CardHeading
        eyebrow={tr(locale, "Registros", "Records")}
        title={tr(locale, "Leads recentes", "Recent Leads")}
        description={`${numberFormat(data.recent.total, locale)} ${tr(locale, "registros encontrados com os filtros aplicados.", "records found with the applied filters.")}`}
        icon={Users}
        action={
          <V2LeadsExportButton
            filters={filters}
            count={data.recent.total}
            clientMode={clientMode}
            disabled={isBusy || data.status !== "READY"}
            locale={locale}
          />
        }
      />
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            <tr>
              {[
                tr(locale, "Data", "Date"),
                "Lead",
                tr(locale, "Modelo", "Model"),
                tr(locale, "Canal", "Channel"),
                tr(locale, "Campanha", "Campaign"),
                tr(locale, "Concessionária", "Dealer"),
                tr(locale, "Cidade/UF", "City/State"),
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
                      {fullDate(row.date, locale)}
                    </span>
                    {row.hour == null ? null : (
                      <span className="ml-2 text-slate-400">
                        {formatHour(row.hour, locale)}
                      </span>
                    )}
                  </td>
                  <td
                    className="max-w-[190px] truncate px-4 py-3 font-semibold text-slate-800"
                    title={clientMode ? undefined : row.name}
                  >
                    {leadNameForMode(row.name, clientMode, locale)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.model || tr(locale, "N/D", "N/A")}
                    <span className="block text-[11px] text-slate-400">
                      {row.version || ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.channel || tr(locale, "N/D", "N/A")}
                  </td>
                  <td
                    className="max-w-[180px] truncate px-4 py-3 text-slate-600"
                    title={row.campaign}
                  >
                    {row.campaign || tr(locale, "N/D", "N/A")}
                  </td>
                  <td
                    className="max-w-[180px] truncate px-4 py-3 text-slate-600"
                    title={row.dealer}
                  >
                    {row.dealer || tr(locale, "N/D", "N/A")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[row.city, row.state].filter(Boolean).join(" / ") ||
                      tr(locale, "N/D", "N/A")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {row.crm || tr(locale, "N/D", "N/A")}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <EmptyDistribution
                    label={tr(
                      locale,
                      "Nenhum lead encontrado com os filtros atuais.",
                      "No Lead found with the current filters."
                    )}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {tr(locale, "Página", "Page")} {currentPage} {tr(locale, "de", "of")}{" "}
          {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={tr(locale, "Página anterior", "Previous page")}
            title={tr(locale, "Página anterior", "Previous page")}
            disabled={isBusy || currentPage <= 1}
            onClick={() => onPage(currentPage - 1)}
            className="rounded-lg border border-slate-200 p-2 disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={tr(locale, "Próxima página", "Next page")}
            title={tr(locale, "Próxima página", "Next page")}
            disabled={isBusy || currentPage >= totalPages}
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

function SummaryFact({
  label,
  value,
  action,
  detail,
}: {
  label: string;
  value: string;
  action?: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
          {label}
        </p>
        {action}
      </div>
      <p
        className="mt-2 truncate text-lg font-bold text-slate-900"
        title={value}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
      ) : null}
    </div>
  );
}

function resolveInitialLeadsTab(allowModelAnalysis = false): V2Tab {
  if (typeof window === "undefined") return "Visão Geral";
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "models" || (tab === "model-analysis" && !allowModelAnalysis)) {
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState({}, "", url);
  }
  if (tab === "stores") return "Lojas & CRM";
  if (tab === "model-analysis" && allowModelAnalysis) return MODEL_ANALYSIS_TAB;
  return "Visão Geral";
}

export default function V2LeadsDashboard({
  authenticated,
  clientMode = true,
  canManage = false,
  clientView = false,
  overviewOnly = false,
  locale = "pt-BR",
}: {
  authenticated: boolean;
  clientMode?: boolean;
  canManage?: boolean;
  clientView?: boolean;
  overviewOnly?: boolean;
  locale?: "pt-BR" | "en";
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
  const modelAnalysisAllowed = canAnalyzeModels({
    canManage,
    clientView,
    overviewOnly,
  });
  const [requestedTab, setActiveTab] = useState<V2Tab>(() =>
    overviewOnly ? "Visão Geral" : resolveInitialLeadsTab(modelAnalysisAllowed)
  );
  const activeTab: V2Tab = overviewOnly ? "Visão Geral" : requestedTab;
  useEffect(() => {
    // Restricted clients stay on Overview; other read-only profiles only
    // normalize the Administrator-only model tab, not their permitted tabs.
    if (
      !overviewOnly &&
      (requestedTab !== MODEL_ANALYSIS_TAB || modelAnalysisAllowed)
    )
      return;
    if (requestedTab !== "Visão Geral") setActiveTab("Visão Geral");
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === "model-analysis") {
      url.searchParams.delete("tab");
      window.history.replaceState({}, "", url);
    }
  }, [modelAnalysisAllowed, overviewOnly, requestedTab]);
  useEffect(() => {
    const onPopState = () => {
      setActiveTab(
        overviewOnly
          ? "Visão Geral"
          : resolveInitialLeadsTab(modelAnalysisAllowed)
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [modelAnalysisAllowed, overviewOnly]);
  const dashboardTopRef = useRef<HTMLDivElement>(null);
  const selectTab = (tab: V2Tab) => {
    if (
      (overviewOnly && tab !== "Visão Geral") ||
      (tab === MODEL_ANALYSIS_TAB && !modelAnalysisAllowed)
    )
      return;
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "Lojas & CRM") url.searchParams.set("tab", "stores");
    else if (tab === MODEL_ANALYSIS_TAB)
      url.searchParams.set("tab", "model-analysis");
    else url.searchParams.delete("tab");
    window.history.replaceState({}, "", url);
    window.requestAnimationFrame(() => {
      const top = dashboardTopRef.current;
      if (!top) return;
      const headerHeight =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--mg-app-header-height"
          )
        ) || 68;
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY + top.getBoundingClientRect().top - headerHeight
        ),
        behavior: "auto",
      });
    });
  };
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const activeReloadLock = useRef<Promise<LeadsReloadResult> | null>(null);
  const reloadSequence = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => setReloadNotice(null), [applied]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      reloadSequence.current += 1;
      activeReloadLock.current = null;
    };
  }, []);
  const queryUtils = v2Trpc.useUtils();
  const modelInsightsQueryUtils = (
    queryUtils.leads as typeof queryUtils.leads & {
      modelInsights?: typeof queryUtils.leads.modelInsights;
    }
  ).modelInsights;
  const syncBaseMutation = v2Trpc.leads.syncBase.useMutation();
  const dashboardQuery = v2Trpc.leads.dashboard.useQuery(
    omitLeadCampaign(applied),
    {
      enabled: authenticated && activeTab !== "Lojas & CRM",
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const data = dashboardQuery.data;
  const modelInsightsProcedure = (
    v2Trpc.leads as typeof v2Trpc.leads & {
      modelInsights?: typeof v2Trpc.leads.modelInsights;
    }
  ).modelInsights;
  const modelInsightsQuery = modelInsightsProcedure
    ? modelInsightsProcedure.useQuery(applied, {
        enabled:
          authenticated &&
          modelAnalysisAllowed &&
          activeTab === MODEL_ANALYSIS_TAB &&
          data?.status === "READY",
        retry: false,
        refetchOnWindowFocus: false,
      })
    : {
        data: undefined,
        error: null,
        isLoading: false,
        isFetching: false,
        refetch: async () => ({ data: undefined }),
      };

  const choosePreset = (preset: string) => {
    if (refreshBusy || activeReloadLock.current) return;
    const period = resolveLeadPeriodPreset(preset, cutoff);
    const next = omitLeadCampaign({ ...draft, ...period, page: 1 });
    setDraft(next);
    setApplied(next);
    setSelectedPreset(preset);
    setDateError(null);
  };

  const applyFilters = () => {
    if (refreshBusy || activeReloadLock.current) return;
    try {
      const period = resolveDashboardPeriod(draft.dateFrom, draft.dateTo);
      setDateError(null);
      const next = omitLeadCampaign({ ...draft, ...period, page: 1 });
      setDraft(next);
      setApplied(next);
    } catch (error) {
      setDateError(
        error instanceof Error ? error.message : "Confira o intervalo de datas."
      );
    }
  };

  const changePage = (page: number) => {
    if (refreshBusy || activeReloadLock.current) return;
    setApplied(current => ({ ...current, page }));
  };
  const refresh = () => void dashboardQuery.refetch();
  const refreshForPdf = async (): Promise<V2LeadsResponse> => {
    if (refreshBusy || activeReloadLock.current) {
      throw new Error("The dashboard source is still updating.");
    }
    const result = await dashboardQuery.refetch({ throwOnError: true });
    if (!result.data || result.data.status !== "READY") {
      throw new Error(
        "An authorized current dashboard snapshot is unavailable."
      );
    }
    return result.data;
  };
  const reloadMonthlyBase: LeadsReloadHandler = onStage => {
    const activeReload = activeReloadLock.current;
    if (activeReload) return activeReload;
    const request = reloadSequence.current + 1;
    reloadSequence.current = request;
    const notify = (message: string) => {
      if (mountedRef.current && request === reloadSequence.current)
        setReloadNotice(message);
    };
    setRefreshBusy(true);
    const run = async (): Promise<LeadsReloadResult> => {
      notify(
        canManage
          ? tr(
              locale,
              "Lendo planilha-base e importando. Aguarde a confirmação; a base anterior permanece disponível.",
              "Reading and importing the base spreadsheet. Please wait for confirmation; the previous source remains available."
            )
          : tr(
              locale,
              "Consultando os dados armazenados. Aguarde a confirmação dos indicadores.",
              "Reading stored data. Please wait for the indicators to be confirmed."
            )
      );
      const previousImport = data?.source.importedAt;
      let syncResult: LeadsSyncResult | undefined;
      let syncFailureNotice: string | null = null;
      try {
        if (canManage) {
          onStage?.("syncing");
          try {
            syncResult = await syncBaseMutation.mutateAsync();
          } catch (error) {
            const code = reloadErrorCode(error);
            syncFailureNotice =
              code === "FORBIDDEN"
                ? "Apenas administradores podem importar a planilha-base. Nenhuma permissão foi alterada; os dados anteriores foram preservados."
                : code === "PRECONDITION_FAILED"
                  ? "Conexão Google pendente: forneça GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON pelo cartão seguro e compartilhe a planilha-base como Leitor com o client_email dessa conta. A base armazenada foi preservada."
                  : "Não foi possível sincronizar a planilha-base. Os dados anteriores foram preservados; tente novamente.";
            notify(syncFailureNotice);
            throw error;
          }
        }
        onStage?.("refreshing");
        // Mark related views stale without immediately issuing duplicate requests.
        await Promise.all([
          queryUtils.leads.dashboard.invalidate(undefined, {
            refetchType: "none",
          }),
          modelInsightsQueryUtils
            ? modelInsightsQueryUtils.invalidate(undefined, {
                refetchType: "none",
              })
            : Promise.resolve(),
          queryUtils.dispatch.leadControl.invalidate(undefined, {
            refetchType: "none",
          }),
        ]);
        const result = await dashboardQuery.refetch({ throwOnError: true });
        if (result.error) throw result.error;
        const fresh = result.data;
        if (!fresh || fresh.status !== "READY")
          throw new Error(
            tr(
              locale,
              "Fonte de Leads não configurada.",
              "Leads source is not configured."
            )
          );
        if (
          syncResult &&
          (fresh.source.importedAt !== syncResult.importedAt ||
            fresh.source.totalRows !== syncResult.totalRows)
        )
          throw new LeadsReloadVersionNotConfirmedError(locale);
        const summary: LeadsReloadResult = {
          competence: fresh.pacing.competence,
          total: fresh.summary.total,
          monthlyTotal: fresh.pacing.current,
          checkedAt: fresh.checkedAt ?? new Date().toISOString(),
          importedAt: fresh.source.importedAt,
          latestLeadDate: fresh.source.latestLeadDate ?? null,
          requestedDateTo: fresh.period.dateTo,
          newImport: fresh.source.importedAt !== previousImport,
          ...(syncResult
            ? {
                sync: {
                  changed: syncResult.changed,
                  inserted: syncResult.inserted,
                  updated: syncResult.updated,
                  totalRows: syncResult.totalRows,
                },
              }
            : {}),
        };
        notify(describeLeadsReload(summary, locale));
        return summary;
      } catch (error) {
        if (syncResult) {
          const confirmationError = new LeadsReloadVersionNotConfirmedError(
            locale
          );
          notify(confirmationError.message);
          throw confirmationError;
        }
        const code = reloadErrorCode(error);
        notify(
          syncFailureNotice ??
            (code === "FORBIDDEN"
              ? "Apenas administradores podem importar a planilha-base. Nenhuma permissão foi alterada; os dados anteriores foram preservados."
              : code === "UNAUTHORIZED"
                ? tr(
                    locale,
                    "Sua sessão expirou. Faça login novamente para atualizar os dados.",
                    "Your session expired. Sign in again to refresh the data."
                  )
                : code === "PRECONDITION_FAILED"
                  ? "Conexão Google pendente: forneça a conta de serviço pelo cartão seguro e compartilhe a planilha-base como Leitor com seu client_email. A base armazenada foi preservada."
                  : tr(
                      locale,
                      "Não foi possível atualizar a base. Os dados anteriores foram preservados; tente novamente.",
                      "Unable to refresh the source. The previous data was preserved; please try again."
                    ))
        );
        throw error;
      }
    };
    const promise = run().finally(() => {
      if (!mountedRef.current || request !== reloadSequence.current) return;
      activeReloadLock.current = null;
      setRefreshBusy(false);
    });
    activeReloadLock.current = promise;
    return promise;
  };

  if (!authenticated) return null;
  return (
    <div
      ref={dashboardTopRef}
      className="min-h-[calc(100dvh-var(--mg-app-header-height,68px))] space-y-4"
    >
      <LeadsSectionNavigation
        activeTab={activeTab}
        onChange={selectTab}
        overviewOnly={overviewOnly}
        canManage={canManage}
        clientView={clientView}
        locale={locale}
      />
      {reloadNotice ? (
        <div
          role={
            /Não foi|pendente|sessão expirou|Apenas administradores/.test(
              reloadNotice
            )
              ? "alert"
              : "status"
          }
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600"
        >
          {reloadNotice}
        </div>
      ) : null}
      <section
        id="mg-leads-panel"
        role="tabpanel"
        aria-labelledby={`mg-leads-tab-${activeTab === MODEL_ANALYSIS_TAB ? LEADS_SECTION_TABS.length : LEADS_SECTION_TABS.indexOf(activeTab)}`}
        className="space-y-4"
      >
        {activeTab === "Lojas & CRM" ? (
          <StoresCrmTab
            clientMode={clientMode}
            canManage={canManage}
            locale={locale}
          />
        ) : dashboardQuery.isLoading && !data ? (
          <LoadingPanel />
        ) : !data ? (
          <QueryError onRetry={refresh} locale={locale} />
        ) : (
          <>
            <FilterBar
              draft={draft}
              setDraft={next => {
                if (refreshBusy || activeReloadLock.current) return;
                if (
                  next.dateFrom !== draft.dateFrom ||
                  next.dateTo !== draft.dateTo
                )
                  setSelectedPreset("");
                setDateError(null);
                setDraft(next);
              }}
              options={data.options}
              cutoff={data.period.cutoffDate || cutoff}
              onSearch={applyFilters}
              dateError={dateError}
              selectedPreset={selectedPreset}
              pendingChanges={
                JSON.stringify(omitLeadCampaign({ ...draft, page: 1 })) !==
                JSON.stringify(omitLeadCampaign({ ...applied, page: 1 }))
              }
              onPreset={choosePreset}
              isFetching={dashboardQuery.isFetching || refreshBusy}
              clientMode={clientMode}
              locale={locale}
            />
            {data.status === "NOT_CONFIGURED" ? (
              activeTab === MODEL_ANALYSIS_TAB && modelAnalysisAllowed ? (
                <V2AdminModelInsights
                  sourceStatus="NOT_CONFIGURED"
                  onRetry={() => void dashboardQuery.refetch()}
                />
              ) : (
                <NotConfiguredPanel data={data} locale={locale} />
              )
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      {tr(locale, "Período:", "Period:")}{" "}
                      {fullDate(data.period.dateFrom, locale)}{" "}
                      {tr(locale, "a", "to")}{" "}
                      {fullDate(data.period.dateTo, locale)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {canManage
                        ? `${data.source.name || tr(locale, "Importação autenticada", "Authenticated import")} · ${formatImportedAt(data.source.importedAt, locale)} · ${tr(locale, "atualização manual autenticada", "authenticated manual refresh")}`
                        : tr(
                            locale,
                            "Base autenticada · consulta dos dados já importados",
                            "Authenticated source · reading imported data"
                          )}
                    </p>
                    <p
                      className={`mt-1 text-[11px] ${data.source.latestLeadDate && data.source.latestLeadDate < data.period.dateTo ? "text-amber-700" : "text-slate-500"}`}
                    >
                      {data.source.latestLeadDate
                        ? `${tr(locale, "Último dia disponível na base:", "Latest day available in the source:")} ${fullDate(data.source.latestLeadDate, locale)}.${data.source.latestLeadDate < data.period.dateTo ? tr(locale, " A fonte ainda não cobre a data final selecionada; é necessária uma nova importação externa.", " The source does not yet cover the selected end date; a new external import is required.") : ""}`
                        : tr(
                            locale,
                            "A fonte não informa uma data de Lead disponível; o período não foi preenchido com zero.",
                            "The source does not report an available Lead date; the period was not filled with zero."
                          )}
                    </p>
                  </div>
                  <div
                    className={`flex items-center gap-2 text-xs ${data.source.latestLeadDate && data.source.latestLeadDate < data.period.dateTo ? "text-amber-700" : data.source.latestLeadDate ? "text-emerald-700" : "text-slate-500"}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${data.source.latestLeadDate && data.source.latestLeadDate < data.period.dateTo ? "bg-amber-500" : data.source.latestLeadDate ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                    {data.source.latestLeadDate &&
                    data.source.latestLeadDate < data.period.dateTo
                      ? `${tr(locale, "Fonte com dados até", "Source data through")} ${fullDate(data.source.latestLeadDate, locale)}`
                      : data.source.latestLeadDate
                        ? tr(locale, "Fonte importada", "Imported source")
                        : tr(
                            locale,
                            "Fonte sem data disponível",
                            "Source date unavailable"
                          )}{" "}
                    {dashboardQuery.isFetching || refreshBusy
                      ? tr(locale, "· atualizando", "· refreshing")
                      : ""}
                  </div>
                </div>
                {activeTab === "Visão Geral" ? (
                  <OverviewTab
                    data={data}
                    onGoalUpdated={refresh}
                    onReloadMonth={reloadMonthlyBase}
                    onRefreshPdf={refreshForPdf}
                    canManage={canManage}
                    clientView={clientView}
                    overviewOnly={overviewOnly}
                    filters={applied}
                    busy={dashboardQuery.isFetching || refreshBusy}
                    locale={locale}
                  />
                ) : null}
                {activeTab === "Regiões" ? (
                  <RegionsTab data={data} locale={locale} />
                ) : null}
                {activeTab === "Leads" ? (
                  <LeadsTableTab
                    data={data}
                    filters={applied}
                    onPage={changePage}
                    clientMode={clientMode}
                    isBusy={refreshBusy || dashboardQuery.isFetching}
                    locale={locale}
                  />
                ) : null}
                {activeTab === MODEL_ANALYSIS_TAB ? (
                  <V2AdminModelInsights
                    data={
                      modelInsightsQuery.isFetching
                        ? undefined
                        : modelInsightsQuery.data
                    }
                    loading={
                      modelInsightsQuery.isLoading ||
                      modelInsightsQuery.isFetching
                    }
                    error={
                      modelInsightsQuery.error
                        ? tr(
                            locale,
                            "Não foi possível carregar a análise por modelo.",
                            "Unable to load model analysis."
                          )
                        : undefined
                    }
                    onRetry={() => void modelInsightsQuery.refetch()}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
