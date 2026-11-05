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
import { MTD_RETAIL_ORDER_LABEL } from "@/lib/dashboardLabels";
import { trpc } from "@/lib/trpc";
import { DealerTargetTrackingPanel } from "./DealerTargetTrackingPanel";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileUp,
  Gauge,
  History,
  Loader2,
  Search,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import React, { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LeadAnalytics = RouterOutputs["leads"]["analytics"];
type LeadGeographicCpl = NonNullable<LeadAnalytics["geographicCpl"]>;
type MetaBudgetPlan = NonNullable<NonNullable<LeadAnalytics["mediaInvestment"]>["metaBudgetPlan"]>;
type WeeklySalesMetrics = RouterOutputs["leads"]["weeklySalesMetrics"];
type WeeklySalesDealer = WeeklySalesMetrics["dealers"][number];
type WeeklySalesState = WeeklySalesMetrics["states"][number];
type WeeklySalesPreview = RouterOutputs["leads"]["previewWeeklySalesCsv"];
type WeeklySalesHistory = RouterOutputs["leads"]["weeklySalesImportHistory"];
type DealerTargetsPreview = RouterOutputs["leads"]["previewDealerTargets"];
type Locale = "pt-BR" | "en-US";
export type WeeklySalesWeek = 1 | 2 | 3 | 4 | 5;
export type DealerRankingSortKey = "conversion" | "sales" | "leads";
export type DealerRankingSortDirection = "asc" | "desc";
export type StateRankingSortKey = "conversion" | "sales" | "leads";

export type DealerConversionRankingRow = {
  dealer: WeeklySalesDealer;
  dealerName: string;
  sourceName: string;
  sales: number;
  leads: number;
  conversionRatePercent: number;
};

export type StatePerformanceRankingRow = {
  state: WeeklySalesState;
  stateCode: string;
  stateName: string;
  leads: number;
  sales: number;
  conversionRatePercent: number | null;
  salesCoverageLeads: number;
  salesCoveragePercent: number | null;
  recipientDealers: number;
  officialDealers: number;
};

type WeeklySalesPanelProps = {
  competence: string;
  dateFrom: string;
  dateTo: string;
  locale?: Locale;
  geographicCpl?: LeadGeographicCpl | null;
  metaBudgetPlan?: MetaBudgetPlan | null;
  canImportLeads?: boolean;
  channelHistoryDealerNames?: ReadonlySet<string>;
  onViewChannelHistory?: (dealerName: string) => void;
};

const MAX_WEEKLY_SALES_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const WEEKLY_SALES_FILE_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv,.pdf,application/pdf";
export const DEALER_TARGETS_FILE_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEALER_RANKING_EXCLUDED_LABELS = new Set([
  "leads em qualificacao",
  "indisponivel",
  "unavailable",
  "outro",
  "outros",
  "other",
  "others",
  "na",
  "n a",
  "nao informado",
  "sem concessionaria",
  "sem dealer",
  "nenhum",
  "none",
  "a definir",
  "a confirmar",
]);

function foldDealerName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function isDealerRankingNameEligible(value: string) {
  const normalized = foldDealerName(value);
  return Boolean(normalized) && !DEALER_RANKING_EXCLUDED_LABELS.has(normalized);
}

export function buildDealerConversionRanking(
  metrics: WeeklySalesMetrics,
  week: WeeklySalesWeek,
): DealerConversionRankingRow[] {
  return metrics.dealers.flatMap(dealer => {
    const values = dealer.weeks[week];
    const leads = values?.leads ?? 0;
    const sales = values?.retail ?? null;
    if (
      dealer.matchStatus !== "MATCHED" ||
      !isDealerRankingNameEligible(dealer.dealerName) ||
      sales === null ||
      leads <= 0
    ) {
      return [];
    }
    return [{
      dealer,
      dealerName: dealer.dealerName,
      sourceName: dealer.sourceName,
      sales,
      leads,
      conversionRatePercent: Math.round((sales / leads) * 10_000) / 100,
    }];
  });
}

export function sortDealerConversionRanking(
  rows: DealerConversionRankingRow[],
  sortKey: DealerRankingSortKey,
  direction: DealerRankingSortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  const valueFor = (row: DealerConversionRankingRow) =>
    sortKey === "conversion"
      ? row.conversionRatePercent
      : sortKey === "sales"
        ? row.sales
        : row.leads;
  return [...rows].sort((left, right) =>
    (valueFor(left) - valueFor(right)) * multiplier ||
    right.sales - left.sales ||
    right.leads - left.leads ||
    left.dealerName.localeCompare(right.dealerName, "pt-BR"),
  );
}

export function buildStatePerformanceRanking(
  metrics: WeeklySalesMetrics,
  week: WeeklySalesWeek,
): StatePerformanceRankingRow[] {
  return (metrics.states ?? []).flatMap(state => {
    const values = state.weeks[week];
    if (!values || (values.leads <= 0 && values.sales <= 0)) return [];
    return [{
      state,
      stateCode: state.stateCode,
      stateName: state.stateName,
      leads: values.leads,
      sales: values.sales,
      conversionRatePercent: values.conversionRatePercent,
      salesCoverageLeads: values.salesCoverageLeads,
      salesCoveragePercent: values.salesCoveragePercent,
      recipientDealers: values.recipientDealers,
      officialDealers: state.officialDealers,
    }];
  });
}

export function sortStatePerformanceRanking(
  rows: StatePerformanceRankingRow[],
  sortKey: StateRankingSortKey,
  direction: DealerRankingSortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  if (sortKey === "conversion") {
    return [...rows].sort((left, right) => {
      const leftValue = left.conversionRatePercent;
      const rightValue = right.conversionRatePercent;
      if (leftValue === null) return rightValue === null ? left.stateName.localeCompare(right.stateName, "pt-BR") : 1;
      if (rightValue === null) return -1;
      return (leftValue - rightValue) * multiplier ||
        right.leads - left.leads ||
        right.sales - left.sales ||
        left.stateName.localeCompare(right.stateName, "pt-BR");
    });
  }
  const valueFor = (row: StatePerformanceRankingRow) => {
    return sortKey === "sales" ? row.sales : row.leads;
  };
  return [...rows].sort((left, right) =>
    (valueFor(left) - valueFor(right)) * multiplier ||
    right.leads - left.leads ||
    right.sales - left.sales ||
      left.stateName.localeCompare(right.stateName, "pt-BR"),
  );
}

export function isSupportedWeeklySalesFileName(fileName: string): boolean {
  const lowerName = fileName.toLocaleLowerCase("pt-BR");
  return lowerName.endsWith(".xlsx") || lowerName.endsWith(".csv") || lowerName.endsWith(".pdf");
}

function ui(locale: Locale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

function formatInteger(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number, locale: Locale, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatMetric(value: number | null, locale: Locale, suffix = "") {
  return value === null ? "—" : `${formatNumber(value, locale)}${suffix}`;
}

function formatDateTime(value: number | null, locale: Locale) {
  if (!value) return ui(locale, "Em processamento", "Processing");
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompetence(value: string, locale: Locale) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function formatIsoDate(value: string, locale: Locale) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function WeeklySalesPeriodIdentity({
  competence,
  dateFrom,
  dateTo,
  referenceWeek = null,
  locale = "pt-BR",
}: {
  competence: string;
  dateFrom: string;
  dateTo: string;
  referenceWeek?: number | null;
  locale?: Locale;
}) {
  return (
    <>
      <span className="font-medium text-slate-300">
        {ui(locale, "Leads", "Leads")}: {formatIsoDate(dateFrom, locale)}–{formatIsoDate(dateTo, locale)}
      </span>
      <span aria-hidden="true"> • </span>
      {ui(locale, `${MTD_RETAIL_ORDER_LABEL}: referência acumulada`, `${MTD_RETAIL_ORDER_LABEL}: cumulative reference`)} {formatCompetence(competence, locale)}.
      <span className="block sm:inline sm:before:content-[' • ']">
        {referenceWeek
          ? ui(
              locale,
              `A Semana ${referenceWeek} é a última semana com ${MTD_RETAIL_ORDER_LABEL} preenchido e serve como base dos indicadores.`,
              `Week ${referenceWeek} is the latest week with ${MTD_RETAIL_ORDER_LABEL} filled and is used as the KPI reference.`,
            )
          : ui(
              locale,
              `A última semana com ${MTD_RETAIL_ORDER_LABEL} preenchido será usada automaticamente como base dos indicadores.`,
              `The latest week with ${MTD_RETAIL_ORDER_LABEL} filled will automatically be used as the KPI reference.`,
            )}
      </span>
    </>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Não foi possível ler o arquivo."));
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
      <header className="flex flex-col gap-3 border-b border-[#1b2535] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold text-slate-200">{title}</h3>
          <p className="mt-0.5 text-[9px] leading-4 text-slate-600">{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function MetricCard({
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
    <div className="relative overflow-hidden rounded-xl border border-[#1f2a3b] bg-[#0d1421] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">{title}</p>
          <p className="mt-2 truncate text-xl font-semibold text-white" title={value}>
            {value}
          </p>
          <p className="mt-1 text-[9px] leading-4 text-slate-600">{subtitle}</p>
        </div>
        <span className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-2" style={{ color: accent }}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export function WeeklySalesSummaryCards({
  metrics,
  locale = "pt-BR",
}: {
  metrics: WeeklySalesMetrics;
  locale?: Locale;
}) {
  const summary = metrics.summary;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title={ui(
          locale,
          `${MTD_RETAIL_ORDER_LABEL} — Semana ${metrics.referenceWeek ?? "—"}`,
          `${MTD_RETAIL_ORDER_LABEL} — Week ${metrics.referenceWeek ?? "—"}`,
        )}
        value={formatInteger(summary.totalSales, locale)}
        subtitle={ui(
          locale,
          `${formatInteger(summary.matchedSales, locale)} ${MTD_RETAIL_ORDER_LABEL} correspondentes • ${formatInteger(summary.unmatchedSales, locale)} sem correspondência`,
          `${formatInteger(summary.matchedSales, locale)} matched ${MTD_RETAIL_ORDER_LABEL} • ${formatInteger(summary.unmatchedSales, locale)} unmatched`,
        )}
        icon={<ShoppingCart className="h-4 w-4" />}
        accent="#e2212d"
      />
      <MetricCard
        title={ui(locale, "Taxa de conversão", "Conversion rate")}
        value={formatMetric(summary.conversionRatePercent, locale, "%")}
        subtitle={ui(locale, `${MTD_RETAIL_ORDER_LABEL} correspondentes ÷ Leads`, `Matched ${MTD_RETAIL_ORDER_LABEL} ÷ Leads`)}
        icon={<Gauge className="h-4 w-4" />}
        accent="#38bdf8"
      />
      <MetricCard
        title={ui(locale, `Leads por ${MTD_RETAIL_ORDER_LABEL}`, `Leads per ${MTD_RETAIL_ORDER_LABEL}`)}
        value={formatMetric(summary.leadsPerSale, locale)}
        subtitle={ui(locale, `Leads ÷ ${MTD_RETAIL_ORDER_LABEL} correspondentes`, `Leads ÷ matched ${MTD_RETAIL_ORDER_LABEL}`)}
        icon={<Building2 className="h-4 w-4" />}
        accent="#10b981"
      />
      <MetricCard
        title={ui(locale, "Leads estimados necessários", "Estimated Leads needed")}
        value={formatMetric(summary.estimatedLeadsNeeded, locale)}
        subtitle={ui(locale, `Arredondamento para gerar 1 ${MTD_RETAIL_ORDER_LABEL}`, `Rounded estimate to generate 1 ${MTD_RETAIL_ORDER_LABEL}`)}
        icon={<Target className="h-4 w-4" />}
        accent="#f59e0b"
      />
    </div>
  );
}

export function WeeklySalesWeekSelector({
  metrics,
  value,
  onChange,
  locale = "pt-BR",
}: {
  metrics: WeeklySalesMetrics;
  value: WeeklySalesWeek;
  onChange: (week: WeeklySalesWeek) => void;
  locale?: Locale;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#1e293b] bg-[#0d1421] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold text-slate-300">
          {ui(locale, "Período acumulado do ranking", "Ranking cumulative period")}
        </p>
        <p className="mt-0.5 text-[9px] text-slate-600">
          {ui(locale, `Selecione a semana para recalcular Leads, ${MTD_RETAIL_ORDER_LABEL} e conversão.`, `Select a week to recalculate Leads, ${MTD_RETAIL_ORDER_LABEL}, and conversion.`)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-[#242f42] bg-[#080e18] p-1" role="group" aria-label={ui(locale, "Semana do ranking", "Ranking week")}>
        {([1, 2, 3, 4, 5] as const).map(week => {
          const available = metrics.dealers.some(dealer => dealer.weeks[week]?.retail !== null);
          return (
            <button
              key={week}
              type="button"
              onClick={() => onChange(week)}
              disabled={!available}
              aria-pressed={value === week}
              className={`rounded-md px-3 py-1.5 text-[9px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                value === week
                  ? "bg-[#e2212d] text-white"
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {ui(locale, `Semana ${week}`, `Week ${week}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeeklySalesStateDealerTable({
  state,
  selectedWeek,
  locale = "pt-BR",
}: {
  state: WeeklySalesState;
  selectedWeek: WeeklySalesWeek;
  locale?: Locale;
}) {
  const dealers = [...state.dealers]
    .map(dealer => ({ dealer, values: dealer.weeks[selectedWeek] }))
    .filter(row => (row.values?.leads ?? 0) > 0 || (row.values?.sales ?? 0) > 0)
    .sort((left, right) => {
      const leftConversion = left.values?.conversionRatePercent;
      const rightConversion = right.values?.conversionRatePercent;
      if (leftConversion === null || leftConversion === undefined) {
        if (rightConversion !== null && rightConversion !== undefined) return 1;
      } else if (rightConversion === null || rightConversion === undefined) {
        return -1;
      } else if (rightConversion !== leftConversion) {
        return rightConversion - leftConversion;
      }
      return (right.values?.leads ?? 0) - (left.values?.leads ?? 0) ||
        left.dealer.dealerName.localeCompare(right.dealer.dealerName, "pt-BR");
    });

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-semibold text-slate-300">
          {ui(locale, `Concessionárias com Leads ou ${MTD_RETAIL_ORDER_LABEL} em ${state.stateName}`, `Dealers with Leads or ${MTD_RETAIL_ORDER_LABEL} in ${state.stateName}`)}
        </p>
        <p className="text-[9px] text-slate-600">
          {dealers.length} {ui(locale, "com movimento no período", "with activity in the period")}
        </p>
      </div>
      <div className="grid gap-2 md:hidden">
        {dealers.map(({ dealer, values }) => (
          <div key={dealer.dealerName} className="rounded-lg border border-[#1c2738] bg-[#0d1522] p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words text-[10px] font-semibold text-slate-200">{dealer.dealerName}</p>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-medium ${values.sales === null ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
                {values.sales === null ? ui(locale, `Sem ${MTD_RETAIL_ORDER_LABEL}`, `No ${MTD_RETAIL_ORDER_LABEL}`) : ui(locale, `${MTD_RETAIL_ORDER_LABEL} reportado`, `${MTD_RETAIL_ORDER_LABEL} reported`)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#1c2738] pt-3">
              <div><p className="text-[8px] uppercase tracking-[0.08em] text-slate-600">Leads</p><p className="mt-1 text-sm font-semibold text-white">{formatInteger(values.leads, locale)}</p></div>
              <div><p className="text-[8px] uppercase tracking-[0.08em] text-slate-600">{MTD_RETAIL_ORDER_LABEL}</p><p className="mt-1 text-sm font-semibold text-slate-300">{values.sales === null ? "—" : formatInteger(values.sales, locale)}</p></div>
              <div><p className="text-[8px] uppercase tracking-[0.08em] text-slate-600">{ui(locale, "Conversão", "Conversion")}</p><p className="mt-1 text-sm font-semibold text-sky-300">{formatMetric(values.conversionRatePercent, locale, "%")}</p></div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden max-w-full overflow-x-auto rounded-lg border border-[#1c2738] md:block">
        <table className="w-full min-w-[650px] text-left">
          <thead className="border-b border-[#1d2737] bg-[#080e18] text-[8px] uppercase tracking-[0.1em] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Dealer</th>
              <th className="px-3 py-2 text-right font-semibold">Leads</th>
              <th className="px-3 py-2 text-right font-semibold">{MTD_RETAIL_ORDER_LABEL}</th>
              <th className="px-3 py-2 text-right font-semibold">{ui(locale, "Conversão", "Conversion")}</th>
              <th className="px-3 py-2 text-right font-semibold">{ui(locale, `Cobertura de ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} coverage`)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#172131] bg-[#0d1522]">
            {dealers.map(({ dealer, values }) => (
              <tr key={dealer.dealerName} className="text-[10px]">
                <td className="px-3 py-2.5 font-medium text-slate-200">{dealer.dealerName}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-white">{formatInteger(values.leads, locale)}</td>
                <td className="px-3 py-2.5 text-right text-slate-300">{values.sales === null ? "—" : formatInteger(values.sales, locale)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-sky-300">{formatMetric(values.conversionRatePercent, locale, "%")}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-medium ${values.sales === null ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
                    {values.sales === null ? ui(locale, "Sem linha no arquivo", "Not in source file") : ui(locale, `${MTD_RETAIL_ORDER_LABEL} reportado`, `${MTD_RETAIL_ORDER_LABEL} reported`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WeeklySalesStateRanking({
  metrics,
  selectedWeek,
  geographicCpl,
  locale = "pt-BR",
}: {
  metrics: WeeklySalesMetrics;
  selectedWeek: WeeklySalesWeek;
  geographicCpl?: LeadGeographicCpl | null;
  locale?: Locale;
}) {
  const [expandedStateCode, setExpandedStateCode] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<StateRankingSortKey>("conversion");
  const [sortDirection, setSortDirection] = useState<DealerRankingSortDirection>("desc");
  const rows = useMemo(
    () => sortStatePerformanceRanking(buildStatePerformanceRanking(metrics, selectedWeek), sortKey, sortDirection),
    [metrics, selectedWeek, sortDirection, sortKey],
  );
  const cplByState = useMemo(
    () => new Map((geographicCpl?.states ?? []).map(state => [state.stateCode, state])),
    [geographicCpl],
  );

  function changeSort(nextKey: StateRankingSortKey) {
    if (sortKey === nextKey) {
      setSortDirection(current => current === "desc" ? "asc" : "desc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection("desc");
  }

  return (
    <Panel
      title={ui(locale, `Principais concessionárias, Leads e ${MTD_RETAIL_ORDER_LABEL} por estado`, `Top Dealers, Leads and ${MTD_RETAIL_ORDER_LABEL} by State`)}
      subtitle={ui(
        locale,
        `Semana ${selectedWeek}: uma única visão de Leads, ${MTD_RETAIL_ORDER_LABEL} e conversão. Expanda o estado para ver os dealers.`,
        `Week ${selectedWeek}: one view of Leads, ${MTD_RETAIL_ORDER_LABEL}, and conversion. Expand a state to view dealers.`,
      )}
      action={<span className="text-[9px] font-medium text-slate-600">{rows.length} {ui(locale, "estado(s)", "state(s)")}</span>}
    >
      <div className="border-b border-sky-400/10 bg-sky-400/[0.035] px-4 py-3 text-[9px] leading-4 text-slate-500">
        {ui(
          locale,
          `A conversão usa o ${MTD_RETAIL_ORDER_LABEL} do último arquivo disponível e somente os Leads dos dealers presentes nesse arquivo. Investimento e CPL são estimados pela participação das metas de cada canal.`,
          `Conversion uses the latest available ${MTD_RETAIL_ORDER_LABEL} file and only Leads from dealers present in that file. Investment and CPL are estimated from each channel target share.`,
        )}
      </div>
      {rows.length ? (
        <div className="max-w-full">
          <div className="border-b border-[#172131] p-3 md:hidden">
            <p className="mb-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">{ui(locale, "Ordenar por", "Sort by")}</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#242f42] bg-[#080e18] p-1">
              {(["leads", "sales", "conversion"] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeSort(key)}
                  className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-2 text-[9px] font-semibold ${sortKey === key ? "bg-[#e2212d] text-white" : "text-slate-500"}`}
                >
                  {key === "leads" ? "Leads" : key === "sales" ? MTD_RETAIL_ORDER_LABEL : ui(locale, "Conversão", "Conversion")}
                  <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 p-3 md:hidden">
            {rows.map((row, index) => {
              const isExpanded = expandedStateCode === row.stateCode;
              const detailId = `state-dealers-mobile-${row.stateCode.toLocaleLowerCase("pt-BR")}`;
              const cpl = cplByState.get(row.stateCode);
              return (
                <div key={row.stateCode} className="rounded-xl border border-[#1c2738] bg-[#0d1421]">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    onClick={() => setExpandedStateCode(current => current === row.stateCode ? null : row.stateCode)}
                    className="w-full p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#e2212d]/60"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#273348] bg-[#080e18] text-[9px] font-semibold text-slate-500">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-slate-100">{row.stateName} <span className="text-slate-500">({row.stateCode})</span></span>
                        <span className={`mt-0.5 block text-[8px] ${row.salesCoveragePercent !== null && row.salesCoveragePercent < 100 ? "text-amber-300/80" : "text-slate-600"}`}>
                          {ui(locale, "Cobertura", "Coverage")}: {formatInteger(row.salesCoverageLeads, locale)} {ui(locale, "de", "of")} {formatInteger(row.leads, locale)} Leads ({formatMetric(row.salesCoveragePercent, locale, "%")})
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#1c2738] pt-3 sm:grid-cols-3">
                      <div><p className="text-[7px] uppercase tracking-[0.08em] text-slate-600">Leads</p><p className="mt-1 text-sm font-semibold text-white">{formatInteger(row.leads, locale)}</p></div>
                      <div><p className="text-[7px] uppercase tracking-[0.08em] text-slate-600">{ui(locale, "Investimento alocado", "Allocated investment")}</p><p className="mt-1 text-sm font-semibold text-slate-300">{cpl?.investment == null ? "—" : formatCurrency(cpl.investment, locale)}</p></div>
                      <div><p className="text-[7px] uppercase tracking-[0.08em] text-slate-600">{ui(locale, "CPL estimado", "Estimated CPL")}</p><p className="mt-1 text-sm font-semibold text-emerald-300">{cpl?.estimatedCpl == null ? "—" : formatCurrency(cpl.estimatedCpl, locale)}</p></div>
                      <div><p className="text-[7px] uppercase tracking-[0.08em] text-slate-600">{MTD_RETAIL_ORDER_LABEL}</p><p className="mt-1 text-sm font-semibold text-slate-300">{formatInteger(row.sales, locale)}</p></div>
                      <div><p className="text-[7px] uppercase tracking-[0.08em] text-slate-600">{ui(locale, "Conversão", "Conversion")}</p><p className="mt-1 text-sm font-semibold text-sky-300">{formatMetric(row.conversionRatePercent, locale, "%")}</p></div>
                      <div><p className="text-[7px] uppercase tracking-[0.08em] text-slate-600">Dealers</p><p className="mt-1 text-sm font-semibold text-slate-300">{row.recipientDealers}/{row.officialDealers}</p></div>
                    </div>
                  </button>
                  {isExpanded ? (
                    <div id={detailId} className="border-t border-[#1c2738] p-3">
                      <WeeklySalesStateDealerTable state={row.state} selectedWeek={selectedWeek} locale={locale} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <table className="hidden w-full min-w-[1080px] text-left md:table">
            <thead className="border-b border-[#1d2737] bg-[#0a111d] text-[9px] uppercase tracking-[0.1em] text-slate-600">
              <tr>
                <th className="w-14 px-4 py-3 text-center font-semibold">#</th>
                <th className="px-3 py-3 font-semibold">{ui(locale, "Estado", "State")}</th>
                {(["leads", "sales", "conversion"] as const).map(key => (
                  <th key={key} className="px-3 py-3 text-right font-semibold" aria-sort={sortKey === key ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}>
                    <button type="button" onClick={() => changeSort(key)} className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#e2212d]/60">
                      {key === "leads" ? "Leads" : key === "sales" ? MTD_RETAIL_ORDER_LABEL : ui(locale, "Conversão", "Conversion")}
                      <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-semibold">{ui(locale, "Investimento alocado", "Allocated investment")}</th>
                <th className="px-3 py-3 text-right font-semibold">{ui(locale, "CPL estimado", "Estimated CPL")}</th>
                <th className="px-3 py-3 text-right font-semibold">Dealers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172131]">
              {rows.map((row, index) => {
                const isExpanded = expandedStateCode === row.stateCode;
                const detailId = `state-dealers-${row.stateCode.toLocaleLowerCase("pt-BR")}`;
                const cpl = cplByState.get(row.stateCode);
                return (
                  <React.Fragment key={row.stateCode}>
                    <tr className="text-[10px] transition-colors hover:bg-white/[0.025]">
                      <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-600">{index + 1}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={detailId}
                          onClick={() => setExpandedStateCode(current => current === row.stateCode ? null : row.stateCode)}
                          className="flex w-full items-center justify-between gap-3 rounded-md text-left outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#e2212d]/60"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-200">{row.stateName} <span className="text-slate-600">({row.stateCode})</span></span>
                            <span className={`mt-0.5 block text-[8px] ${row.salesCoveragePercent !== null && row.salesCoveragePercent < 100 ? "text-amber-300/80" : "text-slate-600"}`}>
                              {ui(locale, "Cobertura do arquivo", "File coverage")}: {formatInteger(row.salesCoverageLeads, locale)} {ui(locale, "de", "of")} {formatInteger(row.leads, locale)} Leads ({formatMetric(row.salesCoveragePercent, locale, "%")})
                            </span>
                          </span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-white">{formatInteger(row.leads, locale)}</td>
                      <td className="px-3 py-3 text-right text-slate-300">{formatInteger(row.sales, locale)}</td>
                      <td className="px-3 py-3 text-right font-medium text-sky-300">{formatMetric(row.conversionRatePercent, locale, "%")}</td>
                      <td className="px-3 py-3 text-right text-slate-300">{cpl?.investment == null ? "—" : formatCurrency(cpl.investment, locale)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-300">{cpl?.estimatedCpl == null ? "—" : formatCurrency(cpl.estimatedCpl, locale)}</td>
                      <td className="px-3 py-3 text-right text-slate-400">{row.recipientDealers} {ui(locale, "de", "of")} {row.officialDealers}</td>
                    </tr>
                    {isExpanded ? (
                      <tr id={detailId} className="bg-[#0a111d]">
                        <td colSpan={8} className="px-4 py-4">
                          <WeeklySalesStateDealerTable state={row.state} selectedWeek={selectedWeek} locale={locale} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center px-5 text-center">
          <div>
            <Building2 className="mx-auto h-5 w-5 text-slate-700" />
            <p className="mt-2 text-xs font-medium text-slate-300">{ui(locale, "Nenhum estado com Leads no período", "No state with Leads in this period")}</p>
            <p className="mt-1 text-[10px] text-slate-600">{ui(locale, "Ajuste o filtro de datas ou aguarde a próxima atualização.", "Adjust the date filter or wait for the next update.")}</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function WeeklySalesBottomConversion({
  metrics,
  selectedWeek,
  locale = "pt-BR",
}: {
  metrics: WeeklySalesMetrics;
  selectedWeek: WeeklySalesWeek;
  locale?: Locale;
}) {
  const rows = sortDealerConversionRanking(
    buildDealerConversionRanking(metrics, selectedWeek),
    "conversion",
    "asc",
  ).slice(0, 10);
  const maxConversion = Math.max(...rows.map(row => row.conversionRatePercent), 1);

  return (
    <Panel
      title={ui(locale, "Bottom 10 — Conversão", "Bottom 10 — Conversion")}
      subtitle={ui(
        locale,
        `Menores taxas entre dealers elegíveis na Semana ${selectedWeek}.`,
        `Lowest rates among eligible dealers in Week ${selectedWeek}.`,
      )}
      action={<TrendingDown className="h-4 w-4 text-[#ff6670]" aria-hidden="true" />}
    >
      {rows.length ? (
        <div className="divide-y divide-[#172131] px-4">
          {rows.map((row, index) => (
            <div key={`${row.sourceName}-${row.dealerName}`} className="py-3">
              <div className="flex items-center justify-between gap-4 text-[10px]">
                <p className="min-w-0 truncate font-semibold text-slate-200" title={row.dealerName}>
                  <span className="mr-2 text-[9px] tabular-nums text-red-400">{String(index + 1).padStart(2, "0")}</span>
                  {row.dealerName}
                </p>
                <p className="shrink-0 text-right tabular-nums text-slate-500">
                  {formatInteger(row.sales, locale)} {MTD_RETAIL_ORDER_LABEL} • {formatInteger(row.leads, locale)} Leads • <span className="font-semibold text-red-300">{formatNumber(row.conversionRatePercent, locale)}%</span>
                </p>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#172131]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-400"
                  style={{ width: `${Math.max(3, (row.conversionRatePercent / maxConversion) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid min-h-36 place-items-center px-5 text-center text-[10px] text-slate-600">
          {ui(locale, "Não há dealers elegíveis nesta semana.", "No eligible dealers for this week.")}
        </div>
      )}
    </Panel>
  );
}

export function WeeklySalesTopConversion({
  metrics,
  selectedWeek,
  locale = "pt-BR",
}: {
  metrics: WeeklySalesMetrics;
  selectedWeek: WeeklySalesWeek;
  locale?: Locale;
}) {
  const rows = sortDealerConversionRanking(
    buildDealerConversionRanking(metrics, selectedWeek),
    "conversion",
    "desc",
  ).slice(0, 10);
  const maxConversion = Math.max(...rows.map(row => row.conversionRatePercent), 1);

  return (
    <Panel
      title={ui(locale, "Top 10 — Conversão", "Top 10 — Conversion")}
      subtitle={ui(
        locale,
        `Maiores taxas entre dealers elegíveis na Semana ${selectedWeek}.`,
        `Highest rates among eligible dealers in Week ${selectedWeek}.`,
      )}
      action={<TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden="true" />}
    >
      {rows.length ? (
        <div className="divide-y divide-[#172131] px-4">
          {rows.map((row, index) => (
            <div key={`${row.sourceName}-${row.dealerName}`} className="py-3">
              <div className="flex items-center justify-between gap-4 text-[10px]">
                <p className="min-w-0 truncate font-semibold text-slate-200" title={row.dealerName}>
                  <span className="mr-2 text-[9px] tabular-nums text-emerald-400">{String(index + 1).padStart(2, "0")}</span>
                  {row.dealerName}
                </p>
                <p className="shrink-0 text-right tabular-nums text-slate-500">
                  {formatInteger(row.sales, locale)} {MTD_RETAIL_ORDER_LABEL} • {formatInteger(row.leads, locale)} Leads • <span className="font-semibold text-emerald-300">{formatNumber(row.conversionRatePercent, locale)}%</span>
                </p>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#172131]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                  style={{ width: `${Math.max(3, (row.conversionRatePercent / maxConversion) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid min-h-36 place-items-center px-5 text-center text-[10px] text-slate-600">
          {ui(locale, "Não há dealers elegíveis nesta semana.", "No eligible dealers for this week.")}
        </div>
      )}
    </Panel>
  );
}

export function WeeklySalesWeekHistory({
  dealer,
  referenceWeek,
  locale = "pt-BR",
}: {
  dealer: WeeklySalesDealer;
  referenceWeek: number | null;
  locale?: Locale;
}) {
  return (
    <div className="w-[calc(100vw-3rem)] min-w-0 lg:w-auto">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-semibold text-slate-300">
          {ui(locale, "Histórico acumulado por semana", "Cumulative history by week")}
        </p>
        <p className="text-[9px] text-slate-600">
          {ui(
            locale,
            referenceWeek
              ? `Meta, ${MTD_RETAIL_ORDER_LABEL} e Leads são acumulados; a Semana ${referenceWeek} é a referência atual da conversão.`
              : `Meta, ${MTD_RETAIL_ORDER_LABEL} e Leads são acumulados; a última semana preenchida será a referência da conversão.`,
            referenceWeek
              ? `Target, ${MTD_RETAIL_ORDER_LABEL}, and Leads are cumulative; Week ${referenceWeek} is the current conversion reference.`
              : `Target, ${MTD_RETAIL_ORDER_LABEL}, and Leads are cumulative; the latest filled week will be the conversion reference.`,
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {([1, 2, 3, 4, 5] as const).map(week => {
          const values = dealer.weeks[week];
          const isMonthlyReference = week === referenceWeek;
          return (
            <div
              key={week}
              className={`rounded-lg border p-3 ${
                isMonthlyReference
                  ? "border-[#e2212d]/35 bg-[#e2212d]/[0.07]"
                  : "border-[#1c2738] bg-[#0d1522]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {ui(locale, `Semana ${week}`, `Week ${week}`)}
                </p>
                {isMonthlyReference ? (
                  <span className="rounded-full border border-[#e2212d]/30 bg-[#e2212d]/10 px-2 py-0.5 text-[8px] font-medium text-[#ff8088]">
                    {ui(locale, "Referência mensal", "Monthly reference")}
                  </span>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[9px] sm:grid-cols-4">
                <div>
                  <dt className="text-slate-600">{ui(locale, "Meta", "Target")}</dt>
                  <dd className="mt-1 font-medium text-slate-300">{formatMetric(values.target, locale)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Leads</dt>
                  <dd className="mt-1 font-semibold text-emerald-300">
                    {values.leads === null ? "—" : formatInteger(values.leads, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">{MTD_RETAIL_ORDER_LABEL}</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {values.retail === null ? "—" : formatInteger(values.retail, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">{ui(locale, "Atingimento", "Achievement")}</dt>
                  <dd className="mt-1 font-medium text-sky-300">{formatMetric(values.achievementPercent, locale, "%")}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeeklySalesMetricsTable({
  metrics,
  selectedWeek = metrics.referenceWeek ?? 5,
  locale = "pt-BR",
  channelHistoryDealerNames,
  onViewChannelHistory,
}: {
  metrics: WeeklySalesMetrics;
  selectedWeek?: WeeklySalesWeek;
  locale?: Locale;
  channelHistoryDealerNames?: ReadonlySet<string>;
  onViewChannelHistory?: (dealerName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedDealerKey, setExpandedDealerKey] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<DealerRankingSortKey>("conversion");
  const [sortDirection, setSortDirection] = useState<DealerRankingSortDirection>("desc");
  const rankedDealers = useMemo(
    () => sortDealerConversionRanking(buildDealerConversionRanking(metrics, selectedWeek), sortKey, sortDirection),
    [metrics, selectedWeek, sortDirection, sortKey],
  );
  const dealers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return rankedDealers.filter(row =>
      !query
        ? true
        : `${row.dealerName} ${row.sourceName}`.toLocaleLowerCase(locale).includes(query),
    );
  }, [locale, rankedDealers, search]);
  const actualUnmatchedDealerCount = metrics.dealers.filter(
    dealer => dealer.matchStatus === "UNMATCHED",
  ).length;

  function changeSort(nextKey: DealerRankingSortKey) {
    if (sortKey === nextKey) {
      setSortDirection(current => current === "desc" ? "asc" : "desc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection("desc");
  }

  return (
    <Panel
      title={ui(locale, `Eficiência de ${MTD_RETAIL_ORDER_LABEL} por concessionária`, `${MTD_RETAIL_ORDER_LABEL} efficiency by dealer`)}
      subtitle={ui(
        locale,
        `Semana ${selectedWeek}: ranking acumulado com correspondências confirmadas. Use os cabeçalhos para reordenar.`,
        `Week ${selectedWeek}: cumulative ranking with confirmed matches. Use the headers to reorder.`,
      )}
      action={
        <span className="text-[9px] font-medium text-slate-600">
          {dealers.length} {ui(locale, "de", "of")} {rankedDealers.length} {ui(locale, "elegíveis", "eligible")}
        </span>
      }
    >
      <div className="flex flex-col gap-3 border-b border-[#1b2535] p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={ui(locale, "Buscar concessionária...", "Search dealer...")}
            className="h-9 border-[#273247] bg-[#101827] pl-9 text-xs text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20"
          />
        </label>
        {metrics.import ? (
          <div className="text-[9px] leading-4 text-slate-600 lg:text-right">
            <p className="font-medium text-slate-400">{metrics.import.fileName}</p>
            <p>
              {ui(locale, "Importado por", "Imported by")} {metrics.import.importedBy} • {formatDateTime(metrics.import.importedAt, locale)}
            </p>
          </div>
        ) : null}
      </div>

      {actualUnmatchedDealerCount > 0 ? (
        <div className="flex items-start gap-3 border-b border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 text-[10px] leading-5 text-amber-200/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            <strong className="text-amber-300">
              {formatInteger(actualUnmatchedDealerCount, locale)} {ui(locale, "concessionária(s) sem correspondência", "unmatched dealer(s)")}.
            </strong>{" "}
            {ui(
              locale,
              `Os registros de ${MTD_RETAIL_ORDER_LABEL} permanecem auditáveis, mas não entram na conversão consolidada até o de/para ser confirmado.`,
              `${MTD_RETAIL_ORDER_LABEL} records remain auditable, but are excluded from consolidated conversion until the mapping is confirmed.`,
            )}
          </p>
        </div>
      ) : null}

      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-[#1d2737] bg-[#0a111d] text-[9px] uppercase tracking-[0.1em] text-slate-600">
            <tr>
              <th className="w-14 px-4 py-3 text-center font-semibold">#</th>
              <th className="px-3 py-3 font-semibold">Dealer</th>
              {(["sales", "leads", "conversion"] as const).map(key => (
                <th key={key} className="px-3 py-3 text-right font-semibold" aria-sort={sortKey === key ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}>
                  <button type="button" onClick={() => changeSort(key)} className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#e2212d]/60">
                    {key === "sales" ? MTD_RETAIL_ORDER_LABEL : key === "leads" ? ui(locale, "Leads recebidos", "Leads received") : ui(locale, "Conversão", "Conversion")}
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">{ui(locale, "Detalhes", "Details")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#172131]">
            {dealers.map(row => {
              const dealer = row.dealer;
              const dealerKey = `${row.sourceName}-${row.dealerName}`;
              const isExpanded = expandedDealerKey === dealerKey;
              const detailId = `weekly-history-${dealerKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
              const position = rankedDealers.indexOf(row) + 1;

              return (
                <React.Fragment key={dealerKey}>
                  <tr className="text-[10px] transition-colors hover:bg-white/[0.025]">
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-600">{position}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={detailId}
                        aria-label={ui(
                          locale,
                          `Ver histórico semanal de ${row.dealerName}`,
                          `View weekly history for ${row.dealerName}`,
                        )}
                        onClick={() => setExpandedDealerKey(current => current === dealerKey ? null : dealerKey)}
                        className="flex w-full items-center justify-between gap-3 rounded-md text-left outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#e2212d]/60"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-200">{row.dealerName}</span>
                          {row.sourceName !== row.dealerName ? (
                            <span className="mt-0.5 block text-[8px] text-slate-600">{ui(locale, "Origem", "Source")}: {row.sourceName}</span>
                          ) : null}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-white">{formatInteger(row.sales, locale)}</td>
                    <td className="px-3 py-3 text-right text-slate-300">{formatInteger(row.leads, locale)}</td>
                    <td className="px-3 py-3 text-right font-medium text-sky-300">
                      {formatNumber(row.conversionRatePercent, locale)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center gap-2">
                        {channelHistoryDealerNames?.has(row.dealerName) && onViewChannelHistory ? (
                          <button
                            type="button"
                            onClick={() => onViewChannelHistory(row.dealerName)}
                            aria-label={ui(
                              locale,
                              `Abrir histórico dos canais de ${row.dealerName}`,
                              `Open channel history for ${row.dealerName}`,
                            )}
                            className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/20 bg-sky-400/[0.07] px-2 py-1 font-medium text-sky-300 outline-none transition-colors hover:border-sky-400/35 hover:bg-sky-400/[0.12] hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-400/70"
                          >
                            <BarChart3 className="h-3 w-3" aria-hidden="true" />
                            {ui(locale, "Histórico dos canais", "Channel history")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr id={detailId} className="bg-[#0a111d]">
                      <td colSpan={6} className="px-4 py-4">
                        <WeeklySalesWeekHistory
                          dealer={dealer}
                          referenceWeek={metrics.referenceWeek}
                          locale={locale}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {!dealers.length ? (
          <div className="grid min-h-40 place-items-center px-5 text-center">
            <div>
              <Search className="mx-auto h-5 w-5 text-slate-700" />
              <p className="mt-2 text-xs font-medium text-slate-300">
                {ui(locale, "Nenhuma concessionária encontrada", "No dealer found")}
              </p>
              <p className="mt-1 text-[10px] text-slate-600">
                {ui(locale, "Ajuste a busca para voltar à lista.", "Adjust the search to return to the list.")}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function WeeklySalesPreviewSummary({
  preview,
  locale = "pt-BR",
}: {
  preview: WeeklySalesPreview;
  locale?: Locale;
}) {
  const referenceWeek = preview.summary.referenceWeek;
  const summaryItems = [
    [ui(locale, "Concessionárias", "Dealers"), preview.summary.dealerRows],
    [ui(locale, "Correspondentes", "Matched"), preview.summary.matchedDealerRows],
    [ui(locale, "Sem correspondência", "Unmatched"), preview.summary.unmatchedDealerRows],
    [
      ui(locale, `${MTD_RETAIL_ORDER_LABEL} S${referenceWeek ?? "—"}`, `${MTD_RETAIL_ORDER_LABEL} W${referenceWeek ?? "—"}`),
      preview.summary.referenceDealerSalesTotal,
    ],
    [
      ui(locale, `Sem ${MTD_RETAIL_ORDER_LABEL} S${referenceWeek ?? "—"}`, `No ${MTD_RETAIL_ORDER_LABEL} W${referenceWeek ?? "—"}`),
      preview.summary.dealersWithoutReferenceSales,
    ],
    [ui(locale, "Linhas totais", "Total rows"), preview.summary.rowsTotal],
  ] as const;

  return (
    <div className="space-y-4">
      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[10px] leading-5 ${
          preview.valid
            ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200/80"
            : "border-red-500/20 bg-red-500/[0.06] text-red-200/80"
        }`}
      >
        {preview.valid ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
        )}
        <p>
          <strong className={preview.valid ? "text-emerald-300" : "text-red-300"}>
            {preview.valid
              ? ui(
                  locale,
                  `Reconciliação da Semana ${referenceWeek} aprovada.`,
                  `Week ${referenceWeek} reconciliation passed.`,
                )
              : ui(locale, "Arquivo não aprovado para importação.", "File not approved for import.")}
          </strong>{" "}
          {ui(
            locale,
            "O total das concessionárias foi comparado com regiões e TOTAL.",
            "Dealer totals were compared with regions and TOTAL.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {summaryItems.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#202b3d] bg-[#101827] p-3">
            <p className="text-[8px] uppercase tracking-[0.1em] text-slate-600">{label}</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-200">{formatInteger(value, locale)}</p>
          </div>
        ))}
      </div>

      {preview.unmatchedDealers.length ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-300">
            {ui(locale, "Sem correspondência na base de Leads", "Not found in the Leads database")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.unmatchedDealers.map(dealer => (
              <span key={dealer} className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[9px] text-amber-200">
                {dealer}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {preview.errors.length ? (
        <div className="max-h-28 overflow-y-auto rounded-lg border border-red-500/15 bg-red-500/[0.04] p-3 text-[10px] leading-5 text-red-300">
          {preview.errors.map(error => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      {preview.warnings.length ? (
        <div className="max-h-28 overflow-y-auto rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-3 text-[10px] leading-5 text-amber-200/80">
          {preview.warnings.map(warning => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div className="max-h-60 overflow-auto rounded-xl border border-[#202b3d]">
        <table className="w-full min-w-[640px] text-left">
          <thead className="sticky top-0 bg-[#0a111d] text-[8px] uppercase tracking-[0.1em] text-slate-600">
            <tr>
              <th className="px-3 py-2.5">{ui(locale, "Arquivo", "File")}</th>
              <th className="px-3 py-2.5">{ui(locale, "Concessionária final", "Resolved dealer")}</th>
              <th className="px-3 py-2.5 text-right">
                {ui(locale, `${MTD_RETAIL_ORDER_LABEL} S${referenceWeek ?? "—"}`, `${MTD_RETAIL_ORDER_LABEL} W${referenceWeek ?? "—"}`)}
              </th>
              <th className="px-3 py-2.5">{ui(locale, "Correspondência", "Match")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#172131]">
            {preview.dealers.map(dealer => (
              <tr key={`${dealer.sourceRowNumber}-${dealer.sourceName}`} className="text-[9px]">
                <td className="px-3 py-2.5 text-slate-400">{dealer.sourceName}</td>
                <td className="px-3 py-2.5 font-medium text-slate-200">{dealer.canonicalDealer}</td>
                <td className="px-3 py-2.5 text-right text-white">
                  {dealer.referenceRetail === null
                    ? "—"
                    : formatInteger(dealer.referenceRetail, locale)}
                </td>
                <td className={`px-3 py-2.5 font-medium ${dealer.matchStatus === "MATCHED" ? "text-emerald-300" : "text-amber-300"}`}>
                  {dealer.matchStatus === "MATCHED"
                    ? ui(locale, "Correspondente", "Matched")
                    : ui(locale, "Sem correspondência", "Unmatched")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WeeklySalesImportHistory({
  history,
  locale = "pt-BR",
}: {
  history: WeeklySalesHistory;
  locale?: Locale;
}) {
  return (
    <Panel
      title={ui(locale, `Histórico semanal de ${MTD_RETAIL_ORDER_LABEL}`, `Weekly ${MTD_RETAIL_ORDER_LABEL} import history`)}
      subtitle={ui(
        locale,
        "Arquivos preservados com competência, reconciliação e usuário responsável.",
        "Files preserved with competence, reconciliation, and responsible user.",
      )}
      action={<History className="h-4 w-4 text-slate-600" />}
    >
      {history.length ? (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead className="border-b border-[#1d2737] bg-[#0a111d] text-[9px] uppercase tracking-[0.1em] text-slate-600">
              <tr>
                <th className="px-4 py-3">{ui(locale, "Arquivo", "File")}</th>
                <th className="px-3 py-3">{ui(locale, "Competência", "Period")}</th>
                <th className="px-3 py-3">{ui(locale, "Importado por", "Imported by")}</th>
                <th className="px-3 py-3">{ui(locale, "Data", "Date")}</th>
                <th className="px-3 py-3 text-right">{ui(locale, `${MTD_RETAIL_ORDER_LABEL} referência`, `Reference ${MTD_RETAIL_ORDER_LABEL}`)}</th>
                <th className="px-3 py-3 text-right">{ui(locale, "Correspondentes", "Matched")}</th>
                <th className="px-3 py-3 text-right">{ui(locale, "Sem correspondência", "Unmatched")}</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172131]">
              {history.map(item => (
                <tr key={item.id} className="text-[10px] transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="max-w-[250px] truncate font-medium text-slate-300" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <p className="mt-0.5 font-mono text-[8px] text-slate-700">{item.fileHash.slice(0, 16)}…</p>
                  </td>
                  <td className="px-3 py-3 capitalize text-slate-400">{formatCompetence(item.competence, locale)}</td>
                  <td className="px-3 py-3 text-slate-400">{item.importedBy}</td>
                  <td className="px-3 py-3 text-slate-400">{formatDateTime(item.completedAt ?? item.createdAt, locale)}</td>
                  <td className="px-3 py-3 text-right font-medium text-white">
                    <span className="block">
                      {item.referenceDealerSalesTotal === null
                        ? "—"
                        : formatInteger(item.referenceDealerSalesTotal, locale)}
                    </span>
                    <span className="mt-0.5 block text-[8px] font-normal text-slate-600">
                      {ui(locale, `Semana ${item.referenceWeek}`, `Week ${item.referenceWeek}`)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-300">{formatInteger(item.matchedDealerRows, locale)}</td>
                  <td className="px-3 py-3 text-right text-amber-300">{formatInteger(item.unmatchedDealerRows, locale)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] font-medium ${
                        item.status === "COMPLETED"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : item.status === "FAILED"
                            ? "border-red-500/20 bg-red-500/10 text-red-300"
                            : "border-sky-500/20 bg-sky-500/10 text-sky-300"
                      }`}
                    >
                      {item.status === "COMPLETED"
                        ? ui(locale, "Concluído", "Completed")
                        : item.status === "FAILED"
                          ? ui(locale, "Falhou", "Failed")
                          : ui(locale, "Processando", "Processing")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-32 place-items-center px-5 text-center">
          <div>
            <FileCheck2 className="mx-auto h-5 w-5 text-slate-700" />
            <p className="mt-2 text-xs font-medium text-slate-300">
              {ui(locale, `Nenhuma importação de ${MTD_RETAIL_ORDER_LABEL} registrada`, `No weekly ${MTD_RETAIL_ORDER_LABEL} import recorded`)}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function WeeklySalesPanel({
  competence,
  dateFrom,
  dateTo,
  locale = "pt-BR",
  geographicCpl,
  metaBudgetPlan,
  canImportLeads = false,
  channelHistoryDealerNames,
  onViewChannelHistory,
}: WeeklySalesPanelProps) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetsFileInputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{
    fileName: string;
    base64: string;
    competence: string;
  } | null>(null);
  const [preview, setPreview] = useState<WeeklySalesPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [targetsUpload, setTargetsUpload] = useState<{
    fileName: string;
    base64: string;
    competence: string;
  } | null>(null);
  const [targetsPreview, setTargetsPreview] = useState<DealerTargetsPreview | null>(null);
  const [targetsPreviewOpen, setTargetsPreviewOpen] = useState(false);
  const [targetsMessage, setTargetsMessage] = useState<string | null>(null);
  const [targetsClientError, setTargetsClientError] = useState<string | null>(null);
  const [rankingWeek, setRankingWeek] = useState<WeeklySalesWeek>(5);

  const metrics = trpc.leads.weeklySalesMetrics.useQuery(
    { competence, dateFrom, dateTo },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  );
  const history = trpc.leads.weeklySalesImportHistory.useQuery(
    { limit: 8 },
    { enabled: canImportLeads, staleTime: 60 * 1000, refetchOnWindowFocus: false },
  );

  useEffect(() => {
    setUpload(null);
    setPreview(null);
    setPreviewOpen(false);
    setMessage(null);
    setClientError(null);
    setTargetsUpload(null);
    setTargetsPreview(null);
    setTargetsPreviewOpen(false);
    setTargetsMessage(null);
    setTargetsClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (targetsFileInputRef.current) targetsFileInputRef.current.value = "";
  }, [competence]);

  useEffect(() => {
    if (metrics.data?.referenceWeek) {
      setRankingWeek(metrics.data.referenceWeek as WeeklySalesWeek);
    }
  }, [metrics.data?.referenceWeek]);

  const previewMutation = trpc.leads.previewWeeklySalesCsv.useMutation({
    onSuccess: data => {
      setPreview(data);
      setPreviewOpen(true);
      setClientError(null);
    },
  });
  const importMutation = trpc.leads.importWeeklySalesCsv.useMutation({
    onSuccess: async result => {
      setPreviewOpen(false);
      setMessage(
        result.idempotent
          ? ui(locale, "Arquivo já importado para esta competência; nenhuma linha foi duplicada.", "File already imported for this period; no rows were duplicated.")
          : ui(
              locale,
              `${formatInteger(result.rowsInserted, locale)} linhas de ${MTD_RETAIL_ORDER_LABEL} importadas com sucesso.`,
              `${formatInteger(result.rowsInserted, locale)} weekly ${MTD_RETAIL_ORDER_LABEL} rows imported successfully.`,
            ),
      );
      setUpload(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Promise.all([
        utils.leads.weeklySalesMetrics.invalidate(),
        utils.leads.weeklySalesImportHistory.invalidate(),
      ]);
    },
  });
  const previewTargetsMutation = trpc.leads.previewDealerTargets.useMutation({
    onSuccess: data => {
      setTargetsPreview(data);
      setTargetsPreviewOpen(true);
      setTargetsClientError(null);
    },
  });
  const importTargetsMutation = trpc.leads.importDealerTargets.useMutation({
    onSuccess: async result => {
      setTargetsPreviewOpen(false);
      setTargetsMessage(
        result.idempotent
          ? ui(locale, "Esta planilha de metas já está ativa para a competência; nenhuma linha foi duplicada.", "This target workbook is already active for the period; no rows were duplicated.")
          : ui(locale, `${formatInteger(result.rowsInserted, locale)} metas por concessionária importadas com sucesso.`, `${formatInteger(result.rowsInserted, locale)} dealer targets imported successfully.`),
      );
      setTargetsUpload(null);
      setTargetsPreview(null);
      if (targetsFileInputRef.current) targetsFileInputRef.current.value = "";
      await utils.leads.weeklySalesMetrics.invalidate();
    },
  });

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    if (!canImportLeads) return;
    const file = event.target.files?.[0];
    setMessage(null);
    setClientError(null);
    previewMutation.reset();
    importMutation.reset();
    if (!file) return;
    if (!isSupportedWeeklySalesFileName(file.name)) {
      setClientError(
        ui(locale, "Selecione a planilha Daily Sales FUP em .xlsx. CSV e PDF legados também são aceitos.", "Select the Daily Sales FUP .xlsx workbook. Legacy CSV and PDF files are also accepted."),
      );
      event.target.value = "";
      return;
    }
    if (file.size > MAX_WEEKLY_SALES_FILE_SIZE_BYTES) {
      setClientError(ui(locale, "O arquivo excede o limite de 5 MB.", "The file exceeds the 5 MB limit."));
      event.target.value = "";
      return;
    }
    try {
      const base64 = await readFileAsDataUrl(file);
      const nextUpload = { fileName: file.name, base64, competence };
      setUpload(nextUpload);
      previewMutation.mutate(nextUpload);
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : ui(locale, "Não foi possível ler o arquivo.", "The file could not be read."),
      );
    }
  }

  function confirmImport() {
    if (!canImportLeads || !upload || !preview?.valid) return;
    importMutation.mutate({ ...upload, expectedFileHash: preview.fileHash });
  }

  async function handleTargetsFile(event: ChangeEvent<HTMLInputElement>) {
    if (!canImportLeads) return;
    const file = event.target.files?.[0];
    setTargetsMessage(null);
    setTargetsClientError(null);
    previewTargetsMutation.reset();
    importTargetsMutation.reset();
    if (!file) return;
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
      setTargetsClientError(ui(locale, "Selecione uma planilha com extensão .xlsx.", "Select an .xlsx workbook."));
      event.target.value = "";
      return;
    }
    if (file.size > MAX_WEEKLY_SALES_FILE_SIZE_BYTES) {
      setTargetsClientError(ui(locale, "A planilha excede o limite de 5 MB.", "The workbook exceeds the 5 MB limit."));
      event.target.value = "";
      return;
    }
    try {
      const base64 = await readFileAsDataUrl(file);
      const nextUpload = { fileName: file.name, base64, competence };
      setTargetsUpload(nextUpload);
      previewTargetsMutation.mutate(nextUpload);
    } catch (error) {
      setTargetsClientError(error instanceof Error ? error.message : ui(locale, "Não foi possível ler a planilha.", "The workbook could not be read."));
    }
  }

  function confirmTargetsImport() {
    if (!canImportLeads || !targetsUpload || !targetsPreview?.valid) return;
    importTargetsMutation.mutate({ ...targetsUpload, expectedFileHash: targetsPreview.fileHash });
  }

  const error = clientError ?? previewMutation.error?.message ?? importMutation.error?.message ?? null;
  const targetsError = targetsClientError ?? previewTargetsMutation.error?.message ?? importTargetsMutation.error?.message ?? null;

  return (
    <section id="weekly-sales-panel" className="space-y-4" aria-labelledby="weekly-sales-title">
      <div className="flex flex-col gap-3 rounded-xl border border-[#283449] bg-[linear-gradient(135deg,rgba(226,33,45,0.08),rgba(13,20,33,0.96)_42%)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#ff8088]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e2212d]" />
            {ui(locale, `${MTD_RETAIL_ORDER_LABEL} semanal`, `Weekly ${MTD_RETAIL_ORDER_LABEL}`)}
          </div>
          <h2 id="weekly-sales-title" className="mt-1 text-sm font-semibold text-white">
            {ui(locale, `Conversão de Leads em ${MTD_RETAIL_ORDER_LABEL}`, `Lead-to-${MTD_RETAIL_ORDER_LABEL} conversion`)} • <span className="capitalize">{formatCompetence(competence, locale)}</span>
          </h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            <WeeklySalesPeriodIdentity
              competence={competence}
              dateFrom={dateFrom}
              dateTo={dateTo}
              referenceWeek={metrics.data?.referenceWeek ?? null}
              locale={locale}
            />
          </p>
        </div>
        {canImportLeads ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={WEEKLY_SALES_FILE_ACCEPT}
              onChange={handleFile}
              className="hidden"
              aria-label={ui(
                locale,
                `Selecionar planilha XLSX de ${MTD_RETAIL_ORDER_LABEL}`,
                `Select weekly ${MTD_RETAIL_ORDER_LABEL} XLSX workbook`,
              )}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={previewMutation.isPending || importMutation.isPending}
              className="border-[#e2212d]/35 bg-[#e2212d]/10 text-[#ff969c] hover:bg-[#e2212d]/15 hover:text-white"
            >
              {previewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {previewMutation.isPending
                ? upload?.fileName.toLocaleLowerCase("pt-BR").endsWith(".pdf")
                  ? ui(locale, "Lendo PDF...", "Reading PDF...")
                  : upload?.fileName.toLocaleLowerCase("pt-BR").endsWith(".xlsx")
                    ? ui(locale, "Lendo planilha...", "Reading workbook...")
                    : ui(locale, "Validando...", "Validating...")
                : ui(locale, `Importar ${MTD_RETAIL_ORDER_LABEL}`, `Import ${MTD_RETAIL_ORDER_LABEL}`)}
            </Button>
            <input
              ref={targetsFileInputRef}
              type="file"
              accept={DEALER_TARGETS_FILE_ACCEPT}
              onChange={handleTargetsFile}
              className="hidden"
              aria-label={ui(locale, "Selecionar planilha de metas por concessionária", "Select dealer target workbook")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => targetsFileInputRef.current?.click()}
              disabled={previewTargetsMutation.isPending || importTargetsMutation.isPending}
              className="border-sky-400/30 bg-sky-400/[0.08] text-sky-300 hover:bg-sky-400/[0.13] hover:text-white"
            >
              {previewTargetsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
              {previewTargetsMutation.isPending ? ui(locale, "Validando metas...", "Validating targets...") : ui(locale, "Atualizar metas", "Update targets")}
            </Button>
          </div>
        ) : null}
      </div>

      {previewMutation.isPending || importMutation.isPending || message || error ? (
        <div
          role={error ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-xs ${
            error
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : message
                ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
                : "border-sky-500/20 bg-sky-500/[0.06] text-sky-200"
          }`}
        >
          {previewMutation.isPending ? (
            <>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {upload?.fileName.toLocaleLowerCase("pt-BR").endsWith(".pdf")
                ? ui(
                    locale,
                    "Lendo a tabela Weekly Target Achievement - Retail e validando a reconciliação...",
                    "Reading the Weekly Target Achievement - Retail table and validating reconciliation...",
                  )
                : ui(
                    locale,
                    "Validando reconciliação e correspondências...",
                    "Validating reconciliation and dealer matches...",
                  )}
            </>
          ) : importMutation.isPending ? (
            <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{ui(locale, `Arquivando e importando ${MTD_RETAIL_ORDER_LABEL}...`, `Archiving and importing weekly ${MTD_RETAIL_ORDER_LABEL}...`)}</>
          ) : error ? (
            <><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</>
          ) : (
            <><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</>
          )}
        </div>
      ) : null}

      {previewTargetsMutation.isPending || importTargetsMutation.isPending || targetsMessage || targetsError ? (
        <div
          role={targetsError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-xs ${
            targetsError
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : targetsMessage
                ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
                : "border-sky-500/20 bg-sky-500/[0.06] text-sky-200"
          }`}
        >
          {previewTargetsMutation.isPending ? (
            <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{ui(locale, "Validando metas, totais e correspondências...", "Validating targets, totals, and dealer matches...")}</>
          ) : importTargetsMutation.isPending ? (
            <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{ui(locale, "Arquivando e importando metas...", "Archiving and importing targets...")}</>
          ) : targetsError ? (
            <><AlertTriangle className="mr-2 inline h-4 w-4" />{targetsError}</>
          ) : (
            <><CheckCircle2 className="mr-2 inline h-4 w-4" />{targetsMessage}</>
          )}
        </div>
      ) : null}

      {metrics.isLoading ? (
        <div className="grid min-h-52 place-items-center rounded-xl border border-[#1e293b] bg-[#0d1421]">
          <div className="text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#e2212d]" />
            <p className="mt-2 text-xs text-slate-500">{ui(locale, `Carregando ${MTD_RETAIL_ORDER_LABEL}...`, `Loading weekly ${MTD_RETAIL_ORDER_LABEL}...`)}</p>
          </div>
        </div>
      ) : metrics.error ? (
        <div className="grid min-h-48 place-items-center rounded-xl border border-red-500/20 bg-red-500/[0.04] px-5 text-center">
          <div>
            <AlertTriangle className="mx-auto h-5 w-5 text-red-400" />
            <p className="mt-2 text-xs font-medium text-red-200">{ui(locale, `Não foi possível carregar ${MTD_RETAIL_ORDER_LABEL}`, `Weekly ${MTD_RETAIL_ORDER_LABEL} could not be loaded`)}</p>
            <p className="mt-1 text-[10px] text-red-300/70">{metrics.error.message}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => metrics.refetch()} className="mt-3 border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-white">
              {ui(locale, "Tentar novamente", "Try again")}
            </Button>
          </div>
        </div>
      ) : metrics.data?.import ? (
        <>
          <WeeklySalesSummaryCards metrics={metrics.data} locale={locale} />
          {metrics.data.targets ? (
            <DealerTargetTrackingPanel tracking={metrics.data.targets} geographicCpl={geographicCpl} metaBudgetPlan={metaBudgetPlan} locale={locale} />
          ) : (
            <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-[#263247] bg-[#0d1421] px-5 text-center">
              <div>
                <Target className="mx-auto h-5 w-5 text-slate-700" />
                <p className="mt-2 text-xs font-medium text-slate-300">{ui(locale, "Metas mensais ainda não importadas", "Monthly targets not imported yet")}</p>
                <p className="mt-1 text-[10px] text-slate-600">{ui(locale, `Use Atualizar metas para carregar TOTAL DEALER e ${MTD_RETAIL_ORDER_LABEL} por concessionária.`, `Use Update targets to load TOTAL DEALER and ${MTD_RETAIL_ORDER_LABEL} by dealer.`)}</p>
              </div>
            </div>
          )}
          <WeeklySalesWeekSelector
            metrics={metrics.data}
            value={rankingWeek}
            onChange={setRankingWeek}
            locale={locale}
          />
          <WeeklySalesStateRanking
            metrics={metrics.data}
            selectedWeek={rankingWeek}
            geographicCpl={geographicCpl}
            locale={locale}
          />
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <WeeklySalesTopConversion
                metrics={metrics.data}
                selectedWeek={rankingWeek}
                locale={locale}
              />
            </div>
            <div className="min-w-0">
              <WeeklySalesBottomConversion
                metrics={metrics.data}
                selectedWeek={rankingWeek}
                locale={locale}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="grid min-h-52 place-items-center rounded-xl border border-[#1e293b] bg-[#0d1421] px-6 text-center">
          <div className="max-w-lg">
            <FileCheck2 className="mx-auto h-6 w-6 text-slate-700" />
            <p className="mt-3 text-sm font-medium text-slate-300">
              {ui(locale, `Nenhum ${MTD_RETAIL_ORDER_LABEL} semanal importado para esta competência`, `No weekly ${MTD_RETAIL_ORDER_LABEL} imported for this period`)}
            </p>
            <p className="mt-1 text-[10px] leading-5 text-slate-600">
              {canImportLeads
                ? ui(
                    locale,
                    `Use “Importar ${MTD_RETAIL_ORDER_LABEL}” para enviar a planilha Daily Sales FUP, revisar correspondências e confirmar a carga. CSV e PDF permanecem disponíveis apenas para histórico e contingência.`,
                    `Use “Import ${MTD_RETAIL_ORDER_LABEL}” to upload the Daily Sales FUP workbook, review dealer matches, and confirm the import. CSV and PDF remain available only for history and contingency.`,
                  )
                : ui(locale, "Aguardando o upload manual pelo administrador responsável.", "Waiting for the responsible administrator to upload the file.")}
            </p>
          </div>
        </div>
      )}

      {canImportLeads ? (
        history.isLoading ? (
          <div className="grid min-h-32 place-items-center rounded-xl border border-[#1e293b] bg-[#0d1421]">
            <Loader2 className="h-5 w-5 animate-spin text-[#e2212d]" />
          </div>
        ) : history.error ? (
          <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-xs text-red-300">
            {history.error.message}
          </div>
        ) : (
          <WeeklySalesImportHistory history={history.data ?? []} locale={locale} />
        )
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden border-[#263247] bg-[#0d1522] p-0 text-white shadow-2xl">
          <DialogHeader className="border-b border-[#1b2535] px-5 pb-4 pt-5 text-left">
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-[#e2212d]/20 bg-[#e2212d]/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#ff969c]">
              <FileCheck2 className="h-3.5 w-3.5" />
              {ui(locale, "Prévia auditável", "Auditable preview")}
            </div>
            <DialogTitle className="pr-8 text-lg text-white">
              {ui(locale, `Confirmar ${MTD_RETAIL_ORDER_LABEL} semanal`, `Confirm weekly ${MTD_RETAIL_ORDER_LABEL}`)}
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-5 text-slate-500">
              {preview
                ? `${preview.fileName} • ${formatCompetence(preview.competence, locale)}`
                : ui(locale, "Revise a reconciliação antes de confirmar.", "Review reconciliation before confirming.")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[66vh] overflow-y-auto p-5">
            {preview ? <WeeklySalesPreviewSummary preview={preview} locale={locale} /> : null}
          </div>
          <DialogFooter className="border-t border-[#1b2535] bg-[#0a111d]/70 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={importMutation.isPending}
              className="border-[#2b374b] bg-[#111a29] text-slate-300 hover:bg-[#182338] hover:text-white"
            >
              {ui(locale, "Cancelar", "Cancel")}
            </Button>
            <Button
              type="button"
              onClick={confirmImport}
              disabled={!preview?.valid || importMutation.isPending}
              className="bg-[#e2212d] text-white hover:bg-[#c91622]"
            >
              {importMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {ui(locale, "Confirmar importação", "Confirm import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={targetsPreviewOpen} onOpenChange={setTargetsPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden border-[#263247] bg-[#0d1522] p-0 text-white shadow-2xl">
          <DialogHeader className="border-b border-[#1b2535] px-5 pb-4 pt-5 text-left">
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300">
              <Target className="h-3.5 w-3.5" />
              {ui(locale, "Prévia auditável", "Auditable preview")}
            </div>
            <DialogTitle className="pr-8 text-lg text-white">{ui(locale, "Confirmar metas por concessionária", "Confirm dealer targets")}</DialogTitle>
            <DialogDescription className="text-[11px] leading-5 text-slate-500">
              {targetsPreview ? `${targetsPreview.fileName} • ${formatCompetence(targetsPreview.competence, locale)}` : ui(locale, "Revise os totais e correspondências antes de confirmar.", "Review totals and matches before confirming.")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto p-5">
            {targetsPreview ? (
              <>
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[10px] leading-5 ${targetsPreview.valid ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200/80" : "border-red-500/20 bg-red-500/[0.06] text-red-200/80"}`}>
                  {targetsPreview.valid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />}
                  <p><strong className={targetsPreview.valid ? "text-emerald-300" : "text-red-300"}>{targetsPreview.valid ? ui(locale, "Planilha pronta para importação.", "Workbook ready to import.") : ui(locale, "A planilha possui bloqueios.", "The workbook has blocking issues.")}</strong> {ui(locale, `TOTAL DEALER e ${MTD_RETAIL_ORDER_LABEL} serão gravados na competência selecionada.`, `TOTAL DEALER and ${MTD_RETAIL_ORDER_LABEL} will be stored for the selected period.`)}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [ui(locale, "Concessionárias", "Dealers"), targetsPreview.summary.rows],
                    [ui(locale, "Correspondências", "Matched"), targetsPreview.summary.matchedRows],
                    [ui(locale, "Meta de Leads", "Lead target"), targetsPreview.summary.totalLeadTarget],
                    [ui(locale, `Meta de ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} target`), targetsPreview.summary.totalSalesTarget],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border border-[#1f2b3e] bg-[#0a111d] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">{label}</p><p className="mt-2 text-lg font-semibold text-white">{formatInteger(Number(value), locale)}</p></div>
                  ))}
                </div>
                {targetsPreview.warnings.length ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] leading-5 text-amber-200/80"><p className="font-semibold text-amber-300">{ui(locale, "Atenções", "Warnings")}</p><ul className="mt-1 list-disc space-y-1 pl-4">{targetsPreview.warnings.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
                {targetsPreview.errors.length ? <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-[10px] leading-5 text-red-200/80"><p className="font-semibold text-red-300">{ui(locale, "Erros", "Errors")}</p><ul className="mt-1 list-disc space-y-1 pl-4">{targetsPreview.errors.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
              </>
            ) : null}
          </div>
          <DialogFooter className="border-t border-[#1b2535] bg-[#0a111d]/70 px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setTargetsPreviewOpen(false)} disabled={importTargetsMutation.isPending} className="border-[#2b374b] bg-[#111a29] text-slate-300 hover:bg-[#182338] hover:text-white">{ui(locale, "Cancelar", "Cancel")}</Button>
            <Button type="button" onClick={confirmTargetsImport} disabled={!targetsPreview?.valid || importTargetsMutation.isPending} className="bg-sky-600 text-white hover:bg-sky-500">{importTargetsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}{ui(locale, "Confirmar metas", "Confirm targets")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
