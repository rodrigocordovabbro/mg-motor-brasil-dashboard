import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { WeeklySalesPanel } from "./WeeklySalesPanel";
import {
  activateLeadsDailyPrintMode,
  buildLeadsDailyPdfTitle,
  LeadsDailyPrintReport,
  LeadsDailyReportButton,
} from "./LeadsDailyPrintReport";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  FileUp,
  Loader2,
  PencilLine,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LeadAnalytics = RouterOutputs["leads"]["analytics"];
type LeadPreview = RouterOutputs["leads"]["previewCsv"];
type LeadImportResult = RouterOutputs["leads"]["importCsv"];
type DealerAuditItem = LeadAnalytics["dealerAudit"]["dealers"][number];
type LeadChannelItem = LeadAnalytics["channels"][number];
type LeadMediaInvestment = NonNullable<LeadAnalytics["mediaInvestment"]>;
type LeadMediaChannelReference = LeadMediaInvestment["channels"][number];

type Locale = "pt-BR" | "en-US";

type LeadsTabProps = {
  dateFrom: string;
  dateTo: string;
  locale?: Locale;
  canImportLeads?: boolean;
  readOnly?: boolean;
  onUpdatedAt?: (value: string) => void;
};

type DealerSort = "leads" | "inactiveDays" | "lastReceipt";

type LeadDailyPoint = {
  date: string;
  total: number;
  rollingAverage7d: number;
  values: Record<string, number>;
};

export function buildCumulativeLeadPaceSeries(
  daily: readonly LeadDailyPoint[],
  goal: number | null,
  daysInMonth: number,
) {
  const dailyPace = goal !== null && daysInMonth > 0 ? goal / daysInMonth : null;
  let accumulatedActual = 0;

  return daily.map((point, index) => {
    accumulatedActual += point.total;
    return {
      date: point.date,
      total: point.total,
      media7d: point.rollingAverage7d,
      accumulatedActual,
      accumulatedPace: dailyPace === null ? null : Math.round(dailyPace * (index + 1) * 100) / 100,
      ...point.values,
    };
  });
}

export function resolveLeadsActionVisibility({
  readOnly,
  canImportLeads,
}: {
  readOnly: boolean;
  canImportLeads: boolean;
}) {
  return {
    canExport: !readOnly,
    canImport: !readOnly && canImportLeads,
    canEditGoal: !readOnly,
  };
}

type LeadImportCacheInvalidators = {
  analytics: () => Promise<unknown>;
  bounds: () => Promise<unknown>;
  importHistory: () => Promise<unknown>;
  weeklySalesMetrics: () => Promise<unknown>;
};

export async function invalidateLeadImportCaches(invalidators: LeadImportCacheInvalidators) {
  await Promise.all([
    invalidators.analytics(),
    invalidators.bounds(),
    invalidators.importHistory(),
    invalidators.weeklySalesMetrics(),
  ]);
}

const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function ui(locale: Locale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

function formatNumber(value: number, locale: Locale, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatInteger(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDailyBarTotal(value: unknown, locale: Locale = "pt-BR") {
  const total = Number(value);
  return Number.isFinite(total) ? formatInteger(total, locale) : "";
}
const CHANNEL_COLORS = ["#e2212d", "#38bdf8", "#a78bfa", "#f59e0b", "#10b981", "#f472b6", "#94a3b8"];
const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024;

function formatCategoryLabel(value: string | null | undefined, locale: Locale) {
  const normalized = value?.trim() ?? "";
  const folded = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  if (!folded || ["indisponivel", "indefinido", "n/a", "na", "null"].includes(folded)) {
    return ui(locale, "Indisponível", "Unavailable");
  }
  return normalized;
}

export function ChannelTargetProgress({
  item,
  locale = "pt-BR",
}: {
  item: LeadChannelItem;
  locale?: Locale;
}) {
  if (
    item.target === null ||
    item.targetActual === null ||
    item.achievementPercent === null ||
    item.remainingToTarget === null ||
    !item.targetLabel
  ) {
    return (
      <p className="mt-3 border-t border-[#1b2637] pt-2 text-[9px] leading-4 text-slate-600">
        {ui(
          locale,
          "Sem meta direta na planilha para este canal de origem.",
          "No direct spreadsheet target for this source channel.",
        )}
      </p>
    );
  }

  const progress = Math.max(0, Math.min(100, item.achievementPercent));
  const gap = item.remainingToTarget;
  const gapText = gap > 0
    ? `${formatInteger(gap, locale)} ${ui(locale, "para a meta", "remaining")}`
    : gap < 0
      ? `${formatInteger(Math.abs(gap), locale)} ${ui(locale, "acima da meta", "above target")}`
      : ui(locale, "Meta atingida", "Target achieved");

  return (
    <div className="mt-3 border-t border-[#1b2637] pt-2.5" data-channel-target={item.value}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[8px] font-semibold uppercase tracking-[0.11em] text-slate-600">
            {ui(locale, "Meta", "Target")} {item.targetLabel}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
            {formatInteger(item.targetActual, locale)} / {formatInteger(item.target, locale)}
          </p>
        </div>
        <p className="shrink-0 text-xs font-semibold text-red-300">{formatNumber(item.achievementPercent, locale)}%</p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#151f2e]"
        role="progressbar"
        aria-label={`${ui(locale, "Atingimento da meta", "Target achievement")} ${item.targetLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${formatNumber(item.achievementPercent, locale)}% · ${gapText}`}
      >
        <div className="h-full rounded-full bg-[#e2212d]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1.5 text-[9px] text-slate-600">{gapText}</p>
    </div>
  );
}

export function ChannelMediaReference({
  reference,
  locale,
}: {
  reference: LeadMediaChannelReference;
  locale: Locale;
}) {
  const hasAttributedLeads = reference.leadChannel !== null;
  const isAugustNetPlan = reference.source === "august-net-media-plan";
  const coverageLabel =
    reference.status === "PARTIAL"
      ? ui(locale, "Cobertura parcial", "Partial coverage")
      : reference.status === "UNAVAILABLE"
        ? ui(locale, "Indisponível", "Unavailable")
        : null;

  return (
    <article
      data-testid="channel-media-reference"
      data-channel={reference.channel}
      className="rounded-lg border border-[#1c2738] bg-[#0a111d]/65 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-100">{formatCategoryLabel(reference.channel, locale)}</p>
          <p className="mt-1 text-[9px] text-slate-600">{isAugustNetPlan ? ui(locale, `Líquido · ${reference.platform}`, `Net · ${reference.platform}`) : reference.source === "august-meta-budget-plan" ? ui(locale, "Orçamento planejado de agosto", "August planned budget") : reference.platform}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-white">{hasAttributedLeads ? formatInteger(reference.leads, locale) : "—"}</p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">{hasAttributedLeads ? "Leads" : ui(locale, "Sem origem CRM", "No CRM source")}</p>
        </div>
      </div>
      {reference.source === "august-meta-budget-plan" || isAugustNetPlan ? <p className="mt-2 text-[8px] font-medium text-sky-300">{ui(locale, "Acumulado proporcional até D-1", "Pro-rated through D-1")} • {reference.dataThroughDate ? formatDate(reference.dataThroughDate, locale) : "—"}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-[#1b2637] bg-[#0d1624] px-3 py-2.5">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">
            {ui(locale, isAugustNetPlan ? "Investimento líquido" : "Investimento", isAugustNetPlan ? "Net investment" : "Investment")}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-slate-200">
            {reference.investment == null ? "—" : formatCurrency(reference.investment, locale)}
          </p>
        </div>
        <div className="rounded-md border border-emerald-400/10 bg-emerald-400/[0.04] px-3 py-2.5 text-right">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">
            {ui(locale, "CPL de referência", "Reference CPL")}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-emerald-300">
            {reference.referenceCpl == null ? ui(locale, "Não atribuível", "Not attributable") : formatCurrency(reference.referenceCpl, locale)}
          </p>
        </div>
      </div>
      {coverageLabel ? <p className="mt-2 text-[8px] text-amber-300/80">{coverageLabel}</p> : null}
    </article>
  );
}

const DEALER_QUALIFICATION_LABELS = new Set([
  "indisponível",
  "indisponivel",
  "unavailable",
  "outro",
  "outros",
  "other",
  "others",
  "n/a",
  "na",
  "não informado",
  "nao informado",
  "sem concessionária",
  "sem concessionaria",
  "sem dealer",
  "nenhum",
  "none",
  "a definir",
  "a confirmar",
]);

export function isQualificationDealerValue(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("pt-BR");
  return !normalized || DEALER_QUALIFICATION_LABELS.has(normalized);
}

export function formatDealerLabel(value: string | null | undefined) {
  if (isQualificationDealerValue(value)) {
    return "Leads em qualificação";
  }
  return value!.trim();
}

function formatDate(value: string | null, locale: Locale = "pt-BR") {
  if (!value) return ui(locale, "Indisponível", "Unavailable");
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatShortDate(value: string, locale: Locale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatDateTime(value: number | null, locale: Locale = "pt-BR") {
  if (!value) return ui(locale, "Em processamento", "Processing");
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${NUMBER.format(value / 1024)} KB`;
  return `${NUMBER.format(value / (1024 * 1024))} MB`;
}

function LeadPanel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] shadow-[0_8px_24px_rgba(0,0,0,0.14)] ${className}`}>
      <header className="flex min-h-16 flex-col items-start justify-between gap-4 border-b border-[#1b2535] px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-[11px] leading-5 text-slate-600">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function LeadMetricCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-transform duration-200 hover:-translate-y-0.5">
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
          <p className="mt-2 truncate text-[22px] font-semibold tracking-tight text-white" title={value}>{value}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-600">{subtitle}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/5" style={{ color: accent, backgroundColor: `${accent}12` }}>
          {icon}
        </span>
      </div>
    </article>
  );
}

export function LeadSummaryCards({
  summary,
  dealerSummary,
  locale = "pt-BR",
}: {
  summary: LeadAnalytics["summary"];
  dealerSummary: LeadAnalytics["dealerAudit"]["summary"];
  locale?: Locale;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <LeadMetricCard title={ui(locale, "Total de Leads", "Total Leads")} value={formatInteger(summary.totalLeads, locale)} subtitle={ui(locale, `${summary.calendarDays} dia(s) no período`, `${summary.calendarDays} day(s) in period`)} icon={<UsersRound className="h-4 w-4" />} accent="#e2212d" />
      <LeadMetricCard title={ui(locale, "Total de Leads nas concessionárias", "Total Leads in dealerships")} value={formatInteger(dealerSummary.assignedLeads, locale)} subtitle={ui(locale, `${formatNumber(dealerSummary.assignedSharePercent, locale)}% do total`, `${formatNumber(dealerSummary.assignedSharePercent, locale)}% of total`)} icon={<Building2 className="h-4 w-4" />} accent="#10b981" />
      <LeadMetricCard title={ui(locale, "Leads em qualificação / sem cobertura de PDV", "Leads in qualification / no POS coverage")} value={formatInteger(dealerSummary.unavailableLeads, locale)} subtitle={ui(locale, `${formatNumber(100 - dealerSummary.assignedSharePercent, locale)}% do total`, `${formatNumber(100 - dealerSummary.assignedSharePercent, locale)}% of total`)} icon={<AlertTriangle className="h-4 w-4" />} accent="#fb923c" />
    </div>
  );
}

export function LeadsLoading({ locale = "pt-BR" }: { locale?: Locale } = {}) {
  return (
    <div className="grid min-h-[520px] place-items-center rounded-xl border border-[#1e293b] bg-[#0d1421]">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" />
        <p className="mt-3 text-xs text-slate-500">{ui(locale, "Consolidando os Leads do período...", "Consolidating Leads for this period...")}</p>
      </div>
    </div>
  );
}

export function LeadsError({ message, onRetry, locale = "pt-BR" }: { message: string; onRetry: () => void; locale?: Locale }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-xl border border-red-500/20 bg-red-500/[0.04] px-6 text-center">
      <div>
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <h2 className="mt-3 text-sm font-semibold text-white">{ui(locale, "Não foi possível carregar os Leads", "Leads could not be loaded")}</h2>
        <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{message}</p>
        <Button onClick={onRetry} className="mt-5 bg-[#e2212d] hover:bg-[#c91622]">{ui(locale, "Tentar novamente", "Try again")}</Button>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler o arquivo."));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export function LeadFilterIdentity({ dateFrom, dateTo, locale = "pt-BR" }: LeadsTabProps) {
  return <span data-testid="lead-filter-identity">{ui(locale, "Data Corrigida", "Corrected Date")} • {formatDate(dateFrom, locale)} {ui(locale, "a", "to")} {formatDate(dateTo, locale)}</span>;
}

export function LeadEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-40 place-items-center px-5 text-center">
      <div><AlertTriangle className="mx-auto h-6 w-6 text-slate-700" /><p className="mt-2 text-xs font-medium text-slate-300">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">{description}</p></div>
    </div>
  );
}

export function LeadsExportButton({
  locale = "pt-BR",
  isPending,
  onExport,
}: {
  locale?: Locale;
  isPending: boolean;
  onExport: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onExport}
      disabled={isPending}
      className="w-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 hover:text-white sm:w-auto"
    >
      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      {isPending
        ? ui(locale, "Gerando Excel...", "Generating Excel...")
        : ui(locale, "Exportar base", "Export database")}
    </Button>
  );
}

export function downloadBase64File(input: {
  base64: string;
  fileName: string;
  mimeType: string;
}): void {
  const binary = globalThis.atob(input.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: input.mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = input.fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type CsvImportPhase = "IDLE" | "PREVIEWING" | "READY" | "IMPORTING" | "SUCCESS" | "ERROR";

export function resolveCsvImportPhase(input: {
  isPreviewing: boolean;
  isImporting: boolean;
  hasPreview: boolean;
  success: string | null;
  error: string | null;
}): CsvImportPhase {
  if (input.isImporting) return "IMPORTING";
  if (input.isPreviewing) return "PREVIEWING";
  if (input.error) return "ERROR";
  if (input.success) return "SUCCESS";
  if (input.hasPreview) return "READY";
  return "IDLE";
}

export function CsvDuplicateChannelBreakdown({
  items,
  locale = "pt-BR",
}: {
  items: LeadPreview["duplicateRowsByChannel"];
  locale?: Locale;
}) {
  const totals = items.reduce(
    (result, item) => ({
      withinFile: result.withinFile + item.withinFile,
      alreadyStored: result.alreadyStored + item.alreadyStored,
      total: result.total + item.total,
    }),
    { withinFile: 0, alreadyStored: 0, total: 0 },
  );

  return (
    <div data-testid="csv-duplicate-channels" className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
            {ui(locale, "Duplicações por canal", "Duplicates by channel")}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            {ui(locale, "Separação entre repetições do próprio CSV e linhas já armazenadas.", "Split between repeated CSV rows and rows already stored.")}
          </p>
        </div>
        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">
          {formatInteger(totals.total, locale)} {ui(locale, "duplicada(s)", "duplicate(s)")}
        </span>
      </div>

      {items.length ? (
        <div className="mt-3 overflow-x-auto rounded-md border border-[#273247]">
          <div role="table" aria-label={ui(locale, "Duplicações por canal", "Duplicates by channel")} className="min-w-[430px]">
            <div role="row" className="grid grid-cols-[minmax(130px,1fr)_100px_100px_70px] border-b border-[#273247] bg-[#101827] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">
              <span role="columnheader">{ui(locale, "Canal", "Channel")}</span>
              <span role="columnheader" className="text-right">{ui(locale, "No CSV", "In CSV")}</span>
              <span role="columnheader" className="text-right">{ui(locale, "Já na base", "In database")}</span>
              <span role="columnheader" className="text-right">Total</span>
            </div>
            {items.map(item => (
              <div key={item.channel} role="row" className="grid grid-cols-[minmax(130px,1fr)_100px_100px_70px] border-b border-[#202b3d] px-3 py-2 text-[11px] last:border-b-0">
                <span role="cell" className="truncate font-medium text-slate-200" title={formatCategoryLabel(item.channel, locale)}>{formatCategoryLabel(item.channel, locale)}</span>
                <span role="cell" className="text-right text-amber-200">{formatInteger(item.withinFile, locale)}</span>
                <span role="cell" className="text-right text-sky-300">{formatInteger(item.alreadyStored, locale)}</span>
                <span role="cell" className="text-right font-semibold text-white">{formatInteger(item.total, locale)}</span>
              </div>
            ))}
            <div role="row" className="grid grid-cols-[minmax(130px,1fr)_100px_100px_70px] bg-[#0a111d] px-3 py-2 text-[10px] font-semibold text-slate-400">
              <span role="cell">Total</span>
              <span role="cell" className="text-right">{formatInteger(totals.withinFile, locale)}</span>
              <span role="cell" className="text-right">{formatInteger(totals.alreadyStored, locale)}</span>
              <span role="cell" className="text-right text-amber-200">{formatInteger(totals.total, locale)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2 text-[10px] text-emerald-300">
          {ui(locale, "Nenhuma duplicação encontrada neste arquivo.", "No duplicates found in this file.")}
        </p>
      )}
    </div>
  );
}

export function CsvImportFeedback({
  isPreviewing,
  isImporting,
  hasPreview = false,
  success,
  result = null,
  error,
  locale = "pt-BR",
}: {
  isPreviewing: boolean;
  isImporting: boolean;
  hasPreview?: boolean;
  success: string | null;
  result?: LeadImportResult | null;
  error: string | null;
  locale?: Locale;
}) {
  const phase = resolveCsvImportPhase({ isPreviewing, isImporting, hasPreview, success, error });
  if (phase === "IMPORTING") {
    return <div role="status" className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-xs text-sky-200"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Importando Leads únicos e descartando duplicidades exatas...</div>;
  }
  if (phase === "PREVIEWING") {
    return <div role="status" className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-xs text-sky-200"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Pré-validando o arquivo CSV...</div>;
  }
  if (phase === "SUCCESS") {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">
        <p className="font-medium">{success}</p>
        {result ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                [ui(locale, "Inseridas", "Inserted"), result.rowsInserted, "text-emerald-200"],
                [ui(locale, "Duplicadas", "Duplicates"), result.rowsSkipped, "text-amber-200"],
                [ui(locale, "Inválidas", "Invalid"), result.invalidRows, "text-red-300"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-emerald-500/15 bg-[#0a111d]/60 px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">{label}</p>
                  <p className={`mt-1 text-base font-semibold ${tone}`}>{formatInteger(Number(value), locale)}</p>
                </div>
              ))}
            </div>
            <CsvDuplicateChannelBreakdown items={result.duplicateRowsByChannel} locale={locale} />
          </>
        ) : null}
      </div>
    );
  }
  if (phase === "ERROR") {
    return <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-300">{error}</div>;
  }
  return null;
}

export function CsvPreviewSummary({
  preview,
  locale = "pt-BR",
}: {
  preview: LeadPreview;
  locale?: Locale;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#243044] bg-[#0a111d] p-3">
        <p className="break-all text-xs font-medium text-white">{preview.fileName}</p>
        <p className="mt-1 font-mono text-[9px] text-slate-600">SHA-256 {preview.fileHash}</p>
        <p className="mt-1 text-[10px] text-slate-600">{formatBytes(preview.fileSizeBytes)} • {formatDate(preview.dateFrom)} a {formatDate(preview.dateTo)}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Linhas lidas", preview.rowsTotal, "text-white"],
          ["Linhas válidas", preview.validRows, "text-emerald-300"],
          ["Duplicadas (descartadas)", preview.duplicateRowsWithinFile, "text-amber-300"],
          ["Inválidas", preview.invalidRows, "text-red-300"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-lg border border-[#202b3d] bg-[#101827] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</p>
            <p className={`mt-1 text-lg font-semibold ${tone}`}>{INTEGER.format(Number(value))}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-5 text-amber-100">Duplicidades exatas serão descartadas automaticamente. A primeira ocorrência válida de cada Lead será preservada, e a quantidade ignorada ficará registrada no histórico da importação.</div>
      <CsvDuplicateChannelBreakdown items={preview.duplicateRowsByChannel} locale={locale} />
      {preview.fallbackDateCount > 0 ? (
        <div data-testid="lead-date-fallback-notice" className="rounded-lg border border-sky-500/20 bg-sky-500/[0.07] px-3 py-2 text-[11px] leading-5 text-sky-100">
          {ui(
            locale,
            `${formatInteger(preview.fallbackDateCount, locale)} linha(s) sem Data Corrigida receberão automaticamente ${formatDate(preview.fallbackDateUsed, locale)} (ontem em São Paulo). O valor original vazio continuará preservado para auditoria.`,
            `${formatInteger(preview.fallbackDateCount, locale)} row(s) without Corrected Date will automatically receive ${formatDate(preview.fallbackDateUsed, locale)} (yesterday in São Paulo). The original blank value will remain preserved for audit.`,
          )}
        </div>
      ) : null}
      {preview.alreadyImported ? <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.07] px-3 py-2 text-[11px] leading-5 text-sky-200">Este arquivo já foi processado. A confirmação retornará o lote existente sem inserir as linhas novamente.</div> : null}
      {preview.errors.length ? <div className="max-h-32 overflow-y-auto rounded-lg border border-red-500/15 bg-red-500/[0.04] p-3 text-[10px] leading-5 text-red-300">{preview.errors.map(error => <p key={`${error.rowNumber}-${error.message}`}>Linha {error.rowNumber}: {error.message}</p>)}</div> : null}
    </div>
  );
}

function CsvPreviewDialog({
  preview,
  open,
  isImporting,
  onOpenChange,
  onConfirm,
  locale,
}: {
  preview: LeadPreview | null;
  open: boolean;
  isImporting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  locale: Locale;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-[#263247] bg-[#0d1522] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-emerald-400" />Pré-validação do CSV</DialogTitle>
          <DialogDescription className="text-slate-500">Revise o resultado antes de confirmar. Nenhuma linha é gravada nesta etapa.</DialogDescription>
        </DialogHeader>
        {preview ? <CsvPreviewSummary preview={preview} locale={locale} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#2b374b] bg-[#111a29] text-slate-300 hover:bg-[#182338] hover:text-white">Cancelar</Button>
          <Button onClick={onConfirm} disabled={!preview || isImporting} className="bg-[#e2212d] text-white hover:bg-[#c91622]">
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            {preview?.alreadyImported ? "Confirmar arquivo existente" : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({
  analytics,
  open,
  isSaving,
  error,
  onOpenChange,
  onSave,
  locale,
}: {
  analytics: LeadAnalytics;
  open: boolean;
  isSaving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (goal: number) => void;
  locale: Locale;
}) {
  const [value, setValue] = useState(String(analytics.pacing.goal ?? ""));
  useEffect(() => setValue(String(analytics.pacing.goal ?? "")), [analytics.pacing.goal, open]);
  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-[#263247] bg-[#0d1522] text-white">
        <DialogHeader>
          <DialogTitle>{ui(locale, "Editar meta mensal de Leads", "Edit monthly Leads goal")}</DialogTitle>
          <DialogDescription className="text-slate-500">{ui(locale, `Competência ${analytics.pacing.competence}. A alteração fica registrada com o usuário autenticado.`, `Month ${analytics.pacing.competence}. The change is recorded with the authenticated user.`)}</DialogDescription>
        </DialogHeader>
        <label className="block">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{ui(locale, "Meta de Leads", "Leads goal")}</span>
          <Input value={value} onChange={event => setValue(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className="border-[#283349] bg-[#111a2a] text-white focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20" />
        </label>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#2b374b] bg-[#111a29] text-slate-300 hover:bg-[#182338] hover:text-white">{ui(locale, "Cancelar", "Cancel")}</Button>
          <Button onClick={() => onSave(parsed)} disabled={isSaving || !Number.isInteger(parsed) || parsed < 1} className="bg-[#e2212d] text-white hover:bg-[#c91622]">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{ui(locale, "Salvar meta", "Save goal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DealerAudit({ analytics, locale = "pt-BR" }: { analytics: LeadAnalytics; locale?: Locale }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DealerSort>("leads");
  const [selectedDealer, setSelectedDealer] = useState<DealerAuditItem | null>(null);
  const visibleDealers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    const rows = analytics.dealerAudit.dealers.filter(item => !query || item.dealerName.toLocaleLowerCase(locale).includes(query));
    return [...rows].sort((a, b) => {
      if (sort === "inactiveDays") return b.inactiveDays - a.inactiveDays || b.leads - a.leads;
      if (sort === "lastReceipt") return (a.lastReceiptDate ?? "").localeCompare(b.lastReceiptDate ?? "") || b.leads - a.leads;
      return b.leads - a.leads || a.dealerName.localeCompare(b.dealerName, locale);
    });
  }, [analytics.dealerAudit.dealers, locale, search, sort]);

  const summary = analytics.dealerAudit.summary;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <LeadMetricCard title={ui(locale, "Concessionárias válidas", "Valid dealers")} value={formatInteger(summary.validDealers, locale)} subtitle={ui(locale, "Nomes identificados no período", "Names identified in this period")} icon={<Building2 className="h-4 w-4" />} accent="#38bdf8" />
        <LeadMetricCard title={ui(locale, "Leads atribuídos", "Assigned Leads")} value={formatInteger(summary.assignedLeads, locale)} subtitle={`${formatNumber(summary.assignedSharePercent, locale)}% ${ui(locale, "do total filtrado", "of filtered total")}`} icon={<CheckCircle2 className="h-4 w-4" />} accent="#10b981" />
        <LeadMetricCard title="Leads em qualificação" value={formatInteger(summary.unavailableLeads, locale)} subtitle={ui(locale, "Aguardando associação a uma concessionária", "Awaiting dealer assignment")} icon={<AlertTriangle className="h-4 w-4" />} accent="#f59e0b" />
      </div>

      <LeadPanel
        title={ui(locale, "Auditoria de recebimento por concessionária", "Lead receipt audit by dealer")}
        subtitle={ui(locale, "Volume, frequência e última data recebida. “Sem lead no último dia” é um sinal operacional, não uma conclusão sobre falha de distribuição.", "Volume, frequency, and latest receipt date. ‘No Lead on the latest day’ is an operational signal, not proof of a distribution failure.")}
        action={<span className="text-[10px] text-slate-600">{visibleDealers.length} {ui(locale, "de", "of")} {summary.validDealers}</span>}
      >
        <div className="flex flex-col gap-3 border-b border-[#1b2535] p-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={ui(locale, "Buscar concessionária...", "Search dealer...")} className="h-9 border-[#273247] bg-[#101827] pl-9 text-xs text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20" />
          </label>
          <label className="flex items-center gap-2 text-[10px] text-slate-500">
            {ui(locale, "Ordenar por", "Sort by")}
            <select value={sort} onChange={event => setSort(event.target.value as DealerSort)} className="h-9 rounded-md border border-[#273247] bg-[#101827] px-3 text-xs text-slate-300 outline-none focus:border-[#e2212d]">
              <option value="leads">{ui(locale, "Maior volume", "Highest volume")}</option>
              <option value="inactiveDays">{ui(locale, "Mais dias sem lead", "Most days without Leads")}</option>
              <option value="lastReceipt">{ui(locale, "Recebimento mais antigo", "Oldest receipt")}</option>
            </select>
          </label>
        </div>

        {analytics.dealerAudit.unavailable ? (
          <button
            type="button"
            onClick={() => setSelectedDealer(analytics.dealerAudit.unavailable)}
            className="flex w-full items-center justify-between gap-4 border-b border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 text-left text-[10px] leading-5 text-amber-200/80 transition-colors hover:bg-amber-500/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/60"
            aria-label={ui(locale, "Ver Leads em qualificação por canal", "View qualifying Leads by channel")}
          >
            <span><strong className="text-amber-300">Leads em qualificação:</strong> {formatInteger(analytics.dealerAudit.unavailable.leads, locale)} Leads ({formatNumber(analytics.dealerAudit.unavailable.sharePercent, locale)}%) {ui(locale, "aguardam associação a uma concessionária.", "are awaiting dealer assignment.")}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-amber-300"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />{ui(locale, "Ver canais", "View channels")}</span>
          </button>
        ) : null}

        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left">
            <thead className="border-b border-[#1d2737] bg-[#0a111d] text-[9px] uppercase tracking-[0.1em] text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">{ui(locale, "Concessionária", "Dealer")}</th>
                <th className="px-3 py-3 text-right font-semibold">Leads</th>
                <th className="px-3 py-3 text-right font-semibold">{ui(locale, "Participação", "Share")}</th>
                <th className="px-3 py-3 text-right font-semibold">{ui(locale, "Média/dia", "Average/day")}</th>
                <th className="px-3 py-3 text-right font-semibold">{ui(locale, "Dias com lead", "Days with Leads")}</th>
                <th className="px-3 py-3 text-right font-semibold">{ui(locale, "Dias sem lead", "Days without Leads")}</th>
                <th className="px-3 py-3 font-semibold">{ui(locale, "Primeiro recebimento", "First receipt")}</th>
                <th className="px-3 py-3 font-semibold">{ui(locale, "Último recebimento", "Latest receipt")}</th>
                <th className="px-4 py-3 font-semibold">{ui(locale, "Situação no último dia", "Latest-day status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172131]">
              {visibleDealers.map(dealer => (
                <DealerRow key={dealer.dealerName} dealer={dealer} locale={locale} onSelect={setSelectedDealer} />
              ))}
            </tbody>
          </table>
          {!visibleDealers.length ? <LeadEmptyState title={ui(locale, "Nenhuma concessionária encontrada", "No dealer found")} description={ui(locale, "Ajuste a busca para voltar à lista auditável.", "Adjust the search to return to the auditable list.")} /> : null}
        </div>
      </LeadPanel>
      <DealerChannelDialog
        dealer={selectedDealer}
        open={selectedDealer !== null}
        onOpenChange={open => {
          if (!open) setSelectedDealer(null);
        }}
        locale={locale}
      />
    </div>
  );
}

function DealerRow({ dealer, locale, onSelect }: { dealer: DealerAuditItem; locale: Locale; onSelect: (dealer: DealerAuditItem) => void }) {
  const receiving = dealer.receiptStatus === "RECEIVING";
  return (
    <tr className="text-[10px] transition-colors hover:bg-white/[0.025]">
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => onSelect(dealer)}
          className="group inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium text-slate-200 transition-colors hover:bg-sky-400/10 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          aria-label={ui(locale, `Ver Leads por canal de ${dealer.dealerName}`, `View Leads by channel for ${dealer.dealerName}`)}
        >
          <span className="truncate">{dealer.dealerName}</span>
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-sky-300" aria-hidden="true" />
        </button>
      </td>
      <td className="px-3 py-3 text-right font-semibold text-white">{formatInteger(dealer.leads, locale)}</td>
      <td className="px-3 py-3 text-right text-slate-400">{formatNumber(dealer.sharePercent, locale)}%</td>
      <td className="px-3 py-3 text-right text-slate-400">{formatNumber(dealer.dailyAverage, locale)}</td>
      <td className="px-3 py-3 text-right text-emerald-300">{formatInteger(dealer.activeDays, locale)}</td>
      <td className="px-3 py-3 text-right text-amber-300">{formatInteger(dealer.inactiveDays, locale)}</td>
      <td className="px-3 py-3 text-slate-400">{formatDate(dealer.firstReceiptDate, locale)}</td>
      <td className="px-3 py-3 text-slate-300">{formatDate(dealer.lastReceiptDate, locale)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-medium ${receiving ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${receiving ? "bg-emerald-400" : "bg-amber-300"}`} />
          {receiving ? `${formatInteger(dealer.latestDayLeads, locale)} ${ui(locale, "recebido(s)", "received")}` : `${dealer.daysSinceLastReceipt ?? "—"} ${ui(locale, "dia(s) sem lead", "day(s) without Leads")}`}
        </span>
      </td>
    </tr>
  );
}

function DealerChannelDialog({
  dealer,
  open,
  onOpenChange,
  locale,
}: {
  dealer: DealerAuditItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
}) {
  const channels = dealer?.channels ?? [];
  const channelTotal = channels.reduce((sum, channel) => sum + channel.leads, 0);
  const maxChannelLeads = Math.max(...channels.map(channel => channel.leads), 1);
  const reconciled = dealer ? channelTotal === dealer.leads : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-hidden border-[#263247] bg-[#0d1522] p-0 text-white shadow-2xl">
        <DialogHeader className="border-b border-[#1b2535] px-5 pb-4 pt-5 text-left">
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-sky-400/15 bg-sky-400/[0.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {ui(locale, "Distribuição por canal", "Channel distribution")}
          </div>
          <DialogTitle className="break-words pr-8 text-lg text-white">{dealer ? formatDealerLabel(dealer.dealerName) : ui(locale, "Concessionária", "Dealer")}</DialogTitle>
          <DialogDescription className="text-[11px] leading-5 text-slate-500">
            {ui(locale, "Quantidade e participação dos Leads por canal no período filtrado.", "Lead volume and share by channel for the filtered period.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 border-b border-[#1b2535] bg-[#0a111d]/60 p-4">
          <div className="rounded-lg border border-[#202b3d] bg-[#101827] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{ui(locale, "Total da concessionária", "Dealer total")}</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatInteger(dealer?.leads ?? 0, locale)}</p>
          </div>
          <div className="rounded-lg border border-[#202b3d] bg-[#101827] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{ui(locale, "Canais com Leads", "Channels with Leads")}</p>
            <p className="mt-1 text-xl font-semibold text-sky-300">{formatInteger(channels.length, locale)}</p>
          </div>
        </div>

        <div className="max-h-[48vh] overflow-y-auto p-4">
          {channels.length ? (
            <div className="space-y-3" role="list" aria-label={ui(locale, "Leads por canal", "Leads by channel")}>
              {channels.map((channel, index) => (
                <div key={channel.value} role="listitem" className="rounded-lg border border-[#1d2839] bg-[#101827] p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-200" title={formatCategoryLabel(channel.value, locale)}>{formatCategoryLabel(channel.value, locale)}</p>
                      <p className="mt-1 text-[9px] text-slate-600">{formatNumber(channel.sharePercent, locale)}% {ui(locale, "dos Leads desta concessionária", "of this dealer's Leads")}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-white">{formatInteger(channel.leads, locale)}</p>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#172131]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(channel.leads / maxChannelLeads) * 100}%`, backgroundColor: CHANNEL_COLORS[index % CHANNEL_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <LeadEmptyState title={ui(locale, "Sem canais no período", "No channels in this period")} description={ui(locale, "Não há Leads classificados por canal para esta concessionária.", "There are no Leads classified by channel for this dealer.")} />
          )}
        </div>

        <div className={`flex items-center justify-between gap-4 border-t px-5 py-3 text-[10px] ${reconciled ? "border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-300" : "border-red-500/20 bg-red-500/[0.05] text-red-300"}`}>
          <span>{ui(locale, "Total reconciliado", "Reconciled total")}</span>
          <strong>{formatInteger(channelTotal, locale)} {ui(locale, "de", "of")} {formatInteger(dealer?.leads ?? 0, locale)} Leads</strong>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BreakdownList({ title, subtitle, items, accent, locale, formatItemLabel = formatCategoryLabel }: { title: string; subtitle: string; items: LeadAnalytics["models"]; accent: string; locale: Locale; formatItemLabel?: (value: string | null | undefined, locale: Locale) => string }) {
  const max = Math.max(...items.map(item => item.leads), 1);
  return (
    <LeadPanel title={title} subtitle={subtitle}>
      <div className="space-y-3 p-4">
        {items.slice(0, 8).map(item => (
          <div key={item.value}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]">
              <span className="min-w-0 truncate font-medium text-slate-300" title={formatItemLabel(item.value, locale)}>{formatItemLabel(item.value, locale)}</span>
              <span className="shrink-0 text-slate-500">{formatInteger(item.leads, locale)} • {formatNumber(item.sharePercent, locale)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#172131]"><span className="block h-full rounded-full" style={{ width: `${(item.leads / max) * 100}%`, backgroundColor: accent }} /></div>
          </div>
        ))}
        {!items.length ? <p className="py-10 text-center text-xs text-slate-600">{ui(locale, "Indisponível no período.", "Unavailable for this period.")}</p> : null}
      </div>
    </LeadPanel>
  );
}

export function ChannelUpdatingNotice({
  locale = "pt-BR",
  date,
  channels,
}: {
  locale?: Locale;
  date: string;
  channels: string[];
}) {
  const visibleChannels = channels.filter(
    channel => channel.trim().toLocaleLowerCase("pt-BR") !== "campanha urban",
  );
  if (!visibleChannels.length) return null;

  return (
    <div
      role="status"
      data-testid="channel-updating-notice"
      className="flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.08] px-4 py-3 text-sky-100 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{ui(locale, "Em atualização", "Updating")}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-sky-100/75">
          {ui(
            locale,
            `Os canais abaixo estão com 0 Leads em ${formatDate(date, locale)}. O aviso será removido automaticamente assim que houver pelo menos 1 Lead no dia.`,
            `The channels below have 0 Leads on ${formatDate(date, locale)}. This notice will be removed automatically as soon as at least 1 Lead is received for the day.`,
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleChannels.map(channel => (
            <span
              key={channel}
              className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-[9px] font-semibold text-sky-100"
            >
              {formatCategoryLabel(channel, locale)} · 0 Leads
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeadsTab({
  dateFrom,
  dateTo,
  locale = "pt-BR",
  canImportLeads = true,
  readOnly = false,
  onUpdatedAt,
}: LeadsTabProps) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryInput = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const actionVisibility = resolveLeadsActionVisibility({ readOnly, canImportLeads });
  const analytics = trpc.leads.analytics.useQuery(queryInput, { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 });
  const weeklySalesForPrint = trpc.leads.weeklySalesMetrics.useQuery(
    { competence: dateFrom.slice(0, 7), dateFrom, dateTo },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  );
  const bounds = trpc.leads.bounds.useQuery(undefined, { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false });
  const history = trpc.leads.importHistory.useQuery(
    { limit: 6 },
    { enabled: canImportLeads, staleTime: 60 * 1000, refetchOnWindowFocus: false },
  );
  const [upload, setUpload] = useState<{
    fileName: string;
    base64: string;
    fallbackDate?: string;
  } | null>(null);
  const [preview, setPreview] = useState<LeadPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<LeadImportResult | null>(null);
  const [clientUploadError, setClientUploadError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [selectedWeeklyChannelDealer, setSelectedWeeklyChannelDealer] = useState<DealerAuditItem | null>(null);

  useEffect(() => {
    if (analytics.data?.metadata.updatedAt) onUpdatedAt?.(analytics.data.metadata.updatedAt);
  }, [analytics.data?.metadata.updatedAt, onUpdatedAt]);

  useEffect(() => {
    setSelectedWeeklyChannelDealer(null);
  }, [dateFrom, dateTo]);

  const previewMutation = trpc.leads.previewCsv.useMutation({
    onSuccess: (data, variables) => {
      setUpload(current =>
        current?.fileName === variables.fileName && current.base64 === variables.base64
          ? { ...current, fallbackDate: data.fallbackDateUsed }
          : current,
      );
      setPreview(data);
      setPreviewOpen(true);
      setClientUploadError(null);
    },
  });
  const importMutation = trpc.leads.importCsv.useMutation({
    onSuccess: async result => {
      setPreviewOpen(false);
      setUploadResult(result);
      setUploadMessage(
        result.idempotent
          ? ui(locale, "Arquivo já processado: nenhuma linha foi inserida novamente.", "File already processed: no rows were inserted again.")
          : ui(locale, `${formatInteger(result.rowsInserted, locale)} linhas de Leads inseridas com sucesso.`, `${formatInteger(result.rowsInserted, locale)} Lead rows imported successfully.`),
      );
      setUpload(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedWeeklyChannelDealer(null);
      await invalidateLeadImportCaches({
        analytics: () => utils.leads.analytics.invalidate(),
        bounds: () => utils.leads.bounds.invalidate(),
        importHistory: () => utils.leads.importHistory.invalidate(),
        weeklySalesMetrics: () => utils.leads.weeklySalesMetrics.invalidate(),
      });
    },
  });
  const goalMutation = trpc.leads.updateMonthlyGoal.useMutation({
    onSuccess: async () => {
      setGoalOpen(false);
      await utils.leads.analytics.invalidate(queryInput);
    },
  });
  const exportMutation = trpc.leads.exportBase.useMutation({
    onSuccess: result => {
      downloadBase64File(result);
      setExportMessage(
        ui(
          locale,
          `${formatInteger(result.exportedRows, locale)} Leads exportados; ${formatInteger(result.duplicatesRemoved, locale)} duplicata(s) removida(s).`,
          `${formatInteger(result.exportedRows, locale)} Leads exported; ${formatInteger(result.duplicatesRemoved, locale)} duplicate(s) removed.`,
        ),
      );
    },
  });

  useEffect(() => {
    setExportMessage(null);
    exportMutation.reset();
  }, [dateFrom, dateTo]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    if (!canImportLeads) return;
    const file = event.target.files?.[0];
    setUploadMessage(null);
    setUploadResult(null);
    setClientUploadError(null);
    previewMutation.reset();
    importMutation.reset();
    if (!file) return;
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
      setClientUploadError("Selecione um arquivo com extensão .csv.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_CSV_SIZE_BYTES) {
      setClientUploadError("O arquivo excede o limite de 10 MB.");
      event.target.value = "";
      return;
    }
    try {
      const base64 = await readFileAsDataUrl(file);
      const nextUpload = { fileName: file.name, base64 };
      setUpload(nextUpload);
      previewMutation.mutate(nextUpload);
    } catch (error) {
      setClientUploadError(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  function confirmImport() {
    if (canImportLeads && upload) importMutation.mutate(upload);
  }

  function handleExport() {
    if (readOnly) return;
    setExportMessage(null);
    exportMutation.reset();
    exportMutation.mutate({ dateFrom, dateTo, locale });
  }

  function handleDailyReportPrint() {
    activateLeadsDailyPrintMode({
      body: document.body,
      page: document,
      pdfTitle: buildLeadsDailyPdfTitle(),
      print: () => window.print(),
      addAfterPrintListener: listener => window.addEventListener("afterprint", listener, { once: true }),
    });
  }

  if (analytics.isLoading) return <LeadsLoading locale={locale} />;
  if (analytics.error) return <LeadsError message={analytics.error.message} onRetry={() => analytics.refetch()} locale={locale} />;
  if (!analytics.data) return <LeadsError message={ui(locale, "A análise retornou sem dados.", "The analysis returned no data.")} onRetry={() => analytics.refetch()} locale={locale} />;

  const data = analytics.data;
  const channelHistoryDealerNames = new Set(data.dealerAudit.dealers.map(dealer => dealer.dealerName));
  const chartDaily = data.dailyMetaBase.appliedDays > 0 ? data.dailyMetaBase.daily : data.daily;
  const stackedDaily = buildCumulativeLeadPaceSeries(chartDaily, data.pacing.goal, data.pacing.daysInMonth);
  const finalPacePoint = stackedDaily.at(-1);
  const chartTotal = chartDaily.reduce((sum, point) => sum + point.total, 0);
  const chartDailyAverage = chartDaily.length ? chartTotal / chartDaily.length : 0;
  const paceDifference = finalPacePoint?.accumulatedPace == null
    ? null
    : Math.round((finalPacePoint.accumulatedActual - finalPacePoint.accumulatedPace) * 100) / 100;
  const peakDailyTotal = chartDaily.reduce((peak, point) => Math.max(peak, point.total), 0);
  const activeChannelCount = data.channels.filter(item => item.leads > 0).length;
  const uploadError = clientUploadError ?? previewMutation.error?.message ?? importMutation.error?.message ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-[#1e293b] bg-[#0d1421] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{ui(locale, "Base de Leads ativa", "Active Leads database")}</div>
          <p className="mt-1 text-xs text-slate-500">{ui(locale, `${formatInteger(data.summary.totalLeads, locale)} Leads no período consolidado em D-1 • ${formatDate(dateFrom, locale)} a ${formatDate(dateTo, locale)}`, `${formatInteger(data.summary.totalLeads, locale)} Leads in the D-1 consolidated period • ${formatDate(dateFrom, locale)} to ${formatDate(dateTo, locale)}`)}</p>
          <p className="mt-1 text-[10px] text-slate-700"><LeadFilterIdentity dateFrom={dateFrom} dateTo={dateTo} locale={locale} /></p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <LeadsDailyReportButton locale={locale} onPrint={handleDailyReportPrint} />
          {actionVisibility.canExport ? (
            <LeadsExportButton
              locale={locale}
              isPending={exportMutation.isPending}
              onExport={handleExport}
            />
          ) : null}
          {actionVisibility.canImport ? (
            <>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" aria-label={locale === "en-US" ? "Select Leads CSV file" : "Selecionar arquivo CSV de Leads"} />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={previewMutation.isPending || importMutation.isPending} className="w-full border-[#e2212d]/30 bg-[#e2212d]/10 text-[#ff8c93] hover:bg-[#e2212d]/15 hover:text-white sm:w-auto">
                {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}{locale === "en-US" ? "Update CSV" : "Atualizar CSV"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <LeadsDailyPrintReport analytics={data} weeklySales={weeklySalesForPrint.data ?? null} dateFrom={dateFrom} dateTo={dateTo} locale={locale} />

      {actionVisibility.canExport && exportMessage ? (
        <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">
          {exportMessage}
        </div>
      ) : actionVisibility.canExport && exportMutation.error ? (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-300">
          {exportMutation.error.message}
        </div>
      ) : null}

      {actionVisibility.canImport ? (
        <CsvImportFeedback
          isPreviewing={previewMutation.isPending}
          isImporting={importMutation.isPending}
          hasPreview={Boolean(preview)}
          success={uploadMessage}
          result={uploadResult}
          error={uploadError}
          locale={locale}
        />
      ) : null}

      <ChannelUpdatingNotice
        locale={locale}
        date={data.channelUpdate.date}
        channels={data.channelUpdate.updatingChannels}
      />

      <LeadSummaryCards summary={data.summary} dealerSummary={data.dealerAudit.summary} locale={locale} />

      <LeadPanel
        title={ui(locale, `Pacing de Leads — ${data.pacing.competence}`, `Leads pacing — ${data.pacing.competence}`)}
        subtitle={ui(locale, `Dados fechados até ${formatDate(data.pacing.asOfDate, locale)} • meta persistente e auditável`, `Closed data through ${formatDate(data.pacing.asOfDate, locale)} • persistent, auditable goal`)}
        action={actionVisibility.canEditGoal ? <Button type="button" size="sm" variant="outline" onClick={() => setGoalOpen(true)} className="h-8 border-[#2b374b] bg-[#111a29] text-[10px] text-slate-300 hover:bg-[#182338] hover:text-white"><PencilLine className="mr-1.5 h-3.5 w-3.5" />{ui(locale, "Editar meta", "Edit goal")}</Button> : undefined}
      >
        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_2fr]">
          <div className="rounded-xl border border-[#202b3d] bg-[#0a111d] p-4">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">{ui(locale, "Atual / meta", "Current / goal")}</p><p className="mt-2 text-2xl font-semibold text-white">{formatInteger(data.pacing.current, locale)} <span className="text-sm font-medium text-slate-600">/ {data.pacing.goal ? formatInteger(data.pacing.goal, locale) : ui(locale, "Indisponível", "Unavailable")}</span></p></div>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${data.pacing.status === "AHEAD" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : data.pacing.status === "BEHIND" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-slate-500/20 bg-slate-500/10 text-slate-300"}`}>{data.pacing.status === "AHEAD" ? ui(locale, "Acima do ritmo", "Ahead of pace") : data.pacing.status === "BEHIND" ? ui(locale, "Abaixo do ritmo", "Behind pace") : data.pacing.status === "ON_TRACK" ? ui(locale, "No ritmo", "On pace") : ui(locale, "Sem referência", "No benchmark")}</span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#1a2434]"><span className="block h-full rounded-full bg-gradient-to-r from-[#e2212d] to-[#ff6f76]" style={{ width: `${Math.min(100, data.pacing.progressPercent ?? 0)}%` }} /></div>
            <div className="mt-2 flex justify-between text-[9px] text-slate-600"><span>{formatNumber(data.pacing.progressPercent ?? 0, locale)}% {ui(locale, "alcançado", "achieved")}</span><span>{data.pacing.daysRemaining} {ui(locale, "dias restantes", "days remaining")}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              [ui(locale, "Média real/dia", "Actual average/day"), formatNumber(data.pacing.averagePerDay, locale)],
              [ui(locale, "Necessário/dia", "Required/day"), data.pacing.requiredPerDay == null ? ui(locale, "Indisponível", "Unavailable") : formatNumber(data.pacing.requiredPerDay, locale)],
              [ui(locale, "Projeção", "Projection"), formatInteger(data.pacing.projection, locale)],
              [ui(locale, "Diferença projetada", "Projected difference"), data.pacing.projectedDifference == null ? ui(locale, "Indisponível", "Unavailable") : `${data.pacing.projectedDifference >= 0 ? "+" : ""}${formatInteger(data.pacing.projectedDifference, locale)}`],
              [ui(locale, "Restante da meta", "Remaining to goal"), data.pacing.remainingToGoal == null ? ui(locale, "Indisponível", "Unavailable") : formatInteger(data.pacing.remainingToGoal, locale)],
              [ui(locale, "Dias fechados", "Closed days"), ui(locale, `${data.pacing.closedDays} de ${data.pacing.daysInMonth}`, `${data.pacing.closedDays} of ${data.pacing.daysInMonth}`)],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-[#202b3d] bg-[#101827] p-3"><p className="text-[8px] uppercase tracking-[0.1em] text-slate-600">{label}</p><p className="mt-1.5 text-sm font-semibold text-slate-200">{value}</p></div>)}
          </div>
        </div>
      </LeadPanel>

      <div data-testid="channel-overview-layout" className="space-y-4">
        <LeadPanel
          className="flex flex-col"
          title={ui(locale, "Leads por dia e canal", "Leads by day and channel")}
          subtitle={data.dailyMetaBase.appliedDays > 0
            ? ui(locale, `Meta usa ${data.dailyMetaBase.sourceLabel}; demais canais usam a base canônica. O acumulado do gráfico segue essa composição por origem.`, `Meta uses ${data.dailyMetaBase.sourceLabel}; other channels use the canonical database. The chart cumulative follows this source composition.`)
            : ui(locale, "Volume diário por canal com acumulado Real versus Pace planejado no período.", "Daily channel volume with cumulative Actual versus Planned pace for the period.")}
          action={(
            <div className="flex flex-wrap items-center justify-end gap-2">
              {data.dailyMetaBase.appliedDays > 0 ? <span data-testid="meta-base-daily-badge" className="rounded-full border border-[#e2212d]/30 bg-[#e2212d]/10 px-2.5 py-1 text-[9px] font-semibold text-[#ff9aa1]">Meta · {ui(locale, "fonte-base", "source base")}</span> : null}
              <span className="rounded-full border border-[#263247] bg-[#101827] px-2.5 py-1 text-[9px] font-semibold text-slate-400">{ui(locale, `${chartDaily.length} dias`, `${chartDaily.length} days`)}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${paceDifference === null ? "border-slate-500/20 bg-slate-500/10 text-slate-400" : paceDifference >= 0 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                {paceDifference === null
                  ? ui(locale, "Pace indisponível", "Pace unavailable")
                  : ui(locale, `${paceDifference >= 0 ? "+" : ""}${formatInteger(paceDifference, locale)} vs pace`, `${paceDifference >= 0 ? "+" : ""}${formatInteger(paceDifference, locale)} vs pace`)}
              </span>
            </div>
          )}
        >
          {chartDaily.length ? (
            <div className="flex flex-1 overflow-x-auto">
              <div className="h-[320px] min-w-[720px] flex-1 px-3 pb-2 pt-5 2xl:h-auto 2xl:min-h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stackedDaily} margin={{ top: 20, right: 2, left: -6, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={value => formatShortDate(String(value), locale)} stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis yAxisId="daily" allowDecimals={false} stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                    <YAxis yAxisId="cumulative" orientation="right" allowDecimals={false} stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip contentStyle={{ background: "#0a101b", border: "1px solid #2a364b", borderRadius: 8, fontSize: 11 }} labelFormatter={value => formatDate(String(value), locale)} formatter={(value, name) => [formatInteger(Number(value), locale), String(name)]} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8", paddingTop: 8 }} />
                    {data.channelOrder.map((channel, index) => (
                      <Bar key={channel} yAxisId="daily" dataKey={channel} name={channel} stackId="channels" maxBarSize={48} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} radius={index === data.channelOrder.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false}>
                        {index === data.channelOrder.length - 1 ? (
                          <LabelList
                            dataKey="total"
                            position="top"
                            offset={7}
                            fill="#cbd5e1"
                            fontSize={9}
                            fontWeight={700}
                            formatter={(value: unknown) => formatDailyBarTotal(value, locale)}
                          />
                        ) : null}
                      </Bar>
                    ))}
                    <Line yAxisId="cumulative" type="monotone" dataKey="accumulatedActual" name={ui(locale, "Real acumulado", "Cumulative actual")} stroke="#f8fafc" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#f8fafc" }} isAnimationActive={false} />
                    {data.pacing.goal !== null ? (
                      <Line yAxisId="cumulative" type="linear" dataKey="accumulatedPace" name={ui(locale, "Pace acumulado", "Cumulative pace")} stroke="#fb7185" strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={{ r: 4, fill: "#fb7185" }} isAnimationActive={false} />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : <div className="grid min-h-[320px] place-items-center text-xs text-slate-600">{ui(locale, "Nenhum Lead no período.", "No Leads in this period.")}</div>}
          <div data-testid="daily-channel-summary" className="grid grid-cols-2 border-t border-[#172131] bg-[#0a111d]/45 sm:grid-cols-4">
            {[
              [ui(locale, data.dailyMetaBase.appliedDays > 0 ? "Total exibido no gráfico" : "Total no período", data.dailyMetaBase.appliedDays > 0 ? "Chart total shown" : "Period total"), formatInteger(chartTotal, locale)],
              [ui(locale, "Média por dia", "Daily average"), formatNumber(chartDailyAverage, locale)],
              [ui(locale, "Pico diário", "Daily peak"), formatInteger(peakDailyTotal, locale)],
              [ui(locale, "Canais ativos", "Active channels"), formatInteger(activeChannelCount, locale)],
            ].map(([label, value]) => (
              <div key={label} className="border-[#172131] px-4 py-3 even:border-l sm:border-l sm:first:border-l-0">
                <p className="text-[8px] font-semibold uppercase tracking-[0.11em] text-slate-600">{label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </LeadPanel>

        <div
          data-testid="channel-lower-layout"
          className={`grid min-w-0 items-stretch gap-4 ${data.mediaInvestment ? "xl:grid-cols-2" : ""}`}
        >
          <LeadPanel
            className="flex h-full flex-col"
            title={ui(locale, "Distribuição por canal", "Distribution by channel")}
            subtitle={ui(locale, "Volume, participação e atingimento da meta mensal por veículo até D-1.", "Volume, share, and monthly vehicle target achievement through D-1.")}
            action={<span className="rounded-full border border-[#263247] bg-[#101827] px-2.5 py-1 text-[9px] font-semibold text-slate-400">{ui(locale, `${activeChannelCount} canais`, `${activeChannelCount} channels`)}</span>}
          >
            <div data-testid="channel-target-grid" className="grid flex-1 content-start gap-2 p-3 sm:grid-cols-2">
              {data.channels.map((item, index) => (
                <article key={item.value} data-testid="channel-target-card" className="rounded-lg border border-[#1c2738] bg-[#0a111d]/55 p-3 text-[10px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[index % CHANNEL_COLORS.length] }} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-200" title={formatCategoryLabel(item.value, locale)}>{formatCategoryLabel(item.value, locale)}</p>
                        <p className="mt-1 text-[9px] leading-3 text-slate-600">{formatNumber(item.dailyAverage, locale)} {ui(locale, "por dia", "per day")} · {formatNumber(item.sharePercent, locale)}% {ui(locale, "do período", "of period")}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-semibold leading-none text-white">{formatInteger(item.leads, locale)}</p>
                      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">Leads</p>
                    </div>
                  </div>
                  <ChannelTargetProgress item={item} locale={locale} />
                </article>
              ))}
              {!data.channels.length ? <div className="col-span-full grid min-h-48 place-items-center text-xs text-slate-600">{ui(locale, "Indisponível no período.", "Unavailable for this period.")}</div> : null}
            </div>
            {data.channelTargetSummary ? (
              <div className="border-t border-[#172131] bg-[#0a111d]/35 px-4 py-3 text-[9px] leading-4 text-slate-600">
                <p>{ui(locale, "A contabilização usa o veículo de origem no mês, incluindo MG4 URBAN.", "Accounting uses the monthly source vehicle, including MG4 URBAN.")}</p>
                {data.channelTargetSummary.channelDifference !== 0 ? (
                  <p className="mt-1">
                    {ui(locale, "Nota:", "Note:")} {ui(locale, "a soma das metas por canal difere da meta total em", "channel targets differ from the total target by")} {formatInteger(Math.abs(data.channelTargetSummary.channelDifference), locale)} {ui(locale, "Leads por arredondamento da planilha.", "Leads due to spreadsheet rounding.")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </LeadPanel>

          {data.mediaInvestment ? (
            <LeadPanel
              className="flex h-full flex-col"
              title={ui(locale, "Investimento líquido e CPL por canal", "Net investment and CPL by channel")}
              subtitle={data.mediaInvestment.netMediaPlan ? ui(locale, `Plano líquido de agosto: ${formatCurrency(data.mediaInvestment.netMediaPlan.monthlyNetInvestment, locale)}, proporcional ao período filtrado. O CPL aparece somente quando existe origem CRM correspondente.`, `August net plan: ${formatCurrency(data.mediaInvestment.netMediaPlan.monthlyNetInvestment, locale)}, pro-rated to the filtered period. CPL is shown only when a matching CRM source exists.`) : data.mediaInvestment.metaBudgetPlan ? ui(locale, `Google/Site e TikTok por fonte; Meta com orçamento planejado de ${formatCurrency(data.mediaInvestment.metaBudgetPlan.monthlyBudget, locale)} ÷ ${data.mediaInvestment.metaBudgetPlan.calendarDays} dias, acumulado até D-1.`, `Google/Site and TikTok from source data; Meta uses a planned ${formatCurrency(data.mediaInvestment.metaBudgetPlan.monthlyBudget, locale)} budget ÷ ${data.mediaInvestment.metaBudgetPlan.calendarDays} days, accumulated through D-1.`) : ui(locale, "Google/Site, Meta e TikTok no mesmo período D-1.", "Google/Site, Meta, and TikTok in the same D-1 period.")}
              action={<span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[9px] font-semibold text-emerald-300">{ui(locale, `${data.mediaInvestment.channels.length} canais`, `${data.mediaInvestment.channels.length} channels`)}</span>}
            >
              <div data-testid="paid-media-grid" className="grid flex-1 content-start gap-2 p-3 sm:grid-cols-2">
                {data.mediaInvestment.channels.map(reference => (
                  <ChannelMediaReference key={reference.channel} reference={reference} locale={locale} />
                ))}
              </div>

              <div data-testid="paid-media-summary" className="border-t border-[#172131] bg-[#0a111d]/45 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div data-testid="paid-media-investment-total" className="rounded-lg border border-[#1c2738] bg-[#0d1624] p-3">
                    <div className="flex items-center gap-2">
                      <CircleDollarSign className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">{ui(locale, data.mediaInvestment.netMediaPlan ? "Investimento líquido total" : "Investimento total", data.mediaInvestment.netMediaPlan ? "Total net investment" : "Total investment")}</p>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {data.mediaInvestment.totalInvestment == null ? "—" : formatCurrency(data.mediaInvestment.totalInvestment, locale)}
                    </p>
                    {data.mediaInvestment.netMediaPlan ? <p className="mt-1 text-[8px] text-slate-600">{formatCurrency(data.mediaInvestment.attributableInvestment, locale)} {ui(locale, "com origem CRM para CPL", "with a CRM source for CPL")}</p> : null}
                  </div>
                  <div className="rounded-lg border border-[#1c2738] bg-[#0d1624] p-3 text-right">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">{ui(locale, "Leads com investimento atribuível", "Leads with attributable investment")}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{formatInteger(data.mediaInvestment.paidMediaLeads, locale)}</p>
                    <p className="mt-1 text-[8px] text-slate-600">{data.mediaInvestment.netMediaPlan ? "Site + Meta + TikTok Ads + Webmotors + Mercado Livre" : "Site + Meta + TikTok"}</p>
                  </div>
                </div>

                <div data-testid="estimated-overall-cpl" className="mt-2 rounded-lg border border-[#e2212d]/25 bg-[#e2212d]/[0.07] p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#ff8c93]">{ui(locale, "CPL geral estimado", "Estimated overall CPL")}</p>
                      <p className="mt-1.5 text-[9px] leading-4 text-slate-500">
                        {data.mediaInvestment.netMediaPlan
                          ? ui(locale, "Investimento líquido atribuível ÷ Leads dos canais com origem CRM", "Attributable net investment ÷ Leads from channels with a CRM source")
                          : data.mediaInvestment.metaBudgetPlan
                          ? ui(locale, "Google/Site + Meta (orçamento planejado) + TikTok ÷ Leads de Site + Meta + TikTok", "Google/Site + Meta (planned budget) + TikTok ÷ Site + Meta + TikTok Leads")
                          : ui(locale, "Investimento total ÷ Leads de Site + Meta + TikTok", "Total investment ÷ Site + Meta + TikTok Leads")}
                      </p>
                    </div>
                    <p className="shrink-0 text-2xl font-semibold text-white">
                      {data.mediaInvestment.estimatedOverallCpl == null ? "—" : formatCurrency(data.mediaInvestment.estimatedOverallCpl, locale)}
                    </p>
                  </div>
                </div>

                <p className={`mt-2 text-[8px] leading-4 ${data.mediaInvestment.allSourcesAvailable ? "text-slate-600" : "text-amber-300/80"}`}>
                  {data.mediaInvestment.netMediaPlan
                    ? ui(locale, "Agosto usa valores líquidos aprovados por canal. Display e YouTube não têm origem CRM própria, portanto exibem investimento sem CPL atribuído.", "August uses approved net amounts by channel. Display and YouTube have no dedicated CRM source, so investment is shown without an attributed CPL.")
                    : data.mediaInvestment.metaBudgetPlan
                    ? ui(locale, `Meta usa orçamento planejado de agosto; Google/Site e TikTok usam os dados disponíveis. Webmotors e Mercado Livre não entram neste cálculo.${data.mediaInvestment.allSourcesAvailable ? "" : ` Cobertura parcial: ${formatCurrency(data.mediaInvestment.availableInvestment, locale)} disponível.`}`, `Meta uses the August planned budget; Google/Site and TikTok use available source data. Webmotors and Mercado Livre are excluded from this calculation.${data.mediaInvestment.allSourcesAvailable ? "" : ` Partial coverage: ${formatCurrency(data.mediaInvestment.availableInvestment, locale)} available.`}`)
                    : data.mediaInvestment.allSourcesAvailable
                      ? ui(locale, "Google Ads + Meta Ads + TikTok Ads reconciliados. Webmotors e Mercado Livre não entram neste cálculo.", "Google Ads + Meta Ads + TikTok Ads reconciled. Webmotors and Mercado Livre are excluded from this calculation.")
                      : ui(locale, `Cobertura parcial. Investimento disponível: ${formatCurrency(data.mediaInvestment.availableInvestment, locale)}.`, `Partial coverage. Available investment: ${formatCurrency(data.mediaInvestment.availableInvestment, locale)}.`)}
                </p>
              </div>
            </LeadPanel>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownList title={ui(locale, "Leads por modelo", "Leads by model")} subtitle={ui(locale, "Classificação preservada do CSV.", "Classification preserved from CSV.")} items={data.models} accent="#e2212d" locale={locale} />
        <BreakdownList
          title={ui(locale, "MG4 URBAN por canal de origem", "MG4 URBAN by source channel")}
          subtitle={ui(
            locale,
            "Origem preservada antes da classificação como Campanha Urban.",
            "Source preserved before classification as Urban Campaign.",
          )}
          items={data.mg4UrbanSourceChannels}
          accent="#38bdf8"
          locale={locale}
        />
      </div>

      <WeeklySalesPanel
        competence={data.pacing.competence}
        dateFrom={dateFrom}
        dateTo={dateTo}
        locale={locale}
        geographicCpl={data.geographicCpl}
        metaBudgetPlan={data.mediaInvestment?.metaBudgetPlan}
        canImportLeads={canImportLeads}
        channelHistoryDealerNames={channelHistoryDealerNames}
        onViewChannelHistory={dealerName => {
          setSelectedWeeklyChannelDealer(
            data.dealerAudit.dealers.find(dealer => dealer.dealerName === dealerName) ?? null,
          );
        }}
      />

      <DealerChannelDialog
        dealer={selectedWeeklyChannelDealer}
        open={selectedWeeklyChannelDealer !== null}
        onOpenChange={open => {
          if (!open) setSelectedWeeklyChannelDealer(null);
        }}
        locale={locale}
      />


      {canImportLeads ? (
      <LeadPanel title="Histórico de atualizações" subtitle="Arquivos processados com hash, usuário e resultado auditável.">
        {history.isLoading ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[#e2212d]" /></div> : history.data?.length ? (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-[#1d2737] bg-[#0a111d] text-[9px] uppercase tracking-[0.1em] text-slate-600"><tr><th className="px-4 py-3">Arquivo</th><th className="px-3 py-3">Processado por</th><th className="px-3 py-3">Data</th><th className="px-3 py-3 text-right">Lidas</th><th className="px-3 py-3 text-right">Inseridas</th><th className="px-3 py-3 text-right">Não inseridas</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-[#172131]">
                {history.data.map(item => <tr key={item.id} className="text-[10px] hover:bg-white/[0.02]"><td className="px-4 py-3"><p className="max-w-[260px] truncate font-medium text-slate-300" title={item.fileName}>{item.fileName}</p><p className="mt-0.5 font-mono text-[8px] text-slate-700">{item.fileHash.slice(0, 16)}…</p></td><td className="px-3 py-3 text-slate-400">{item.importedBy}</td><td className="px-3 py-3 text-slate-400">{formatDateTime(item.completedAt ?? item.createdAt)}</td><td className="px-3 py-3 text-right text-slate-400">{INTEGER.format(item.rowsTotal)}</td><td className="px-3 py-3 text-right text-emerald-300">{INTEGER.format(item.rowsInserted)}</td><td className="px-3 py-3 text-right text-amber-300">{INTEGER.format(item.rowsSkipped + item.rowsInvalid)}</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-medium ${item.status === "COMPLETED" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : item.status === "FAILED" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-sky-500/20 bg-sky-500/10 text-sky-300"}`}>{item.status === "COMPLETED" ? "Concluído" : item.status === "FAILED" ? "Falhou" : "Processando"}</span></td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <div className="grid min-h-32 place-items-center text-xs text-slate-600">Nenhuma atualização registrada.</div>}
      </LeadPanel>
      ) : null}

      {actionVisibility.canImport ? <CsvPreviewDialog preview={preview} open={previewOpen} isImporting={importMutation.isPending} onOpenChange={setPreviewOpen} onConfirm={confirmImport} locale={locale} /> : null}
      {actionVisibility.canEditGoal ? <GoalDialog analytics={data} open={goalOpen} isSaving={goalMutation.isPending} error={goalMutation.error?.message ?? null} onOpenChange={setGoalOpen} onSave={goal => goalMutation.mutate({ competence: data.pacing.competence, goalCount: goal })} locale={locale} /> : null}
    </div>
  );
}
