import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MTD_RETAIL_ORDER_LABEL } from "@/lib/dashboardLabels";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowUpDown, Search, Target } from "lucide-react";
import React, { useMemo, useState } from "react";

import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LeadAnalytics = RouterOutputs["leads"]["analytics"];
type LeadGeographicCpl = NonNullable<LeadAnalytics["geographicCpl"]>;
type MetaBudgetPlan = NonNullable<NonNullable<LeadAnalytics["mediaInvestment"]>["metaBudgetPlan"]>;
type WeeklySalesMetrics = RouterOutputs["leads"]["weeklySalesMetrics"];
type DealerTargetTracking = NonNullable<WeeklySalesMetrics["targets"]>;
export type DealerTargetProgress = DealerTargetTracking["dealers"][number];
export type DealerTargetSortKey = "conversion" | "leadAchievement" | "salesAchievement" | "leadGap" | "salesGap";
type SortDirection = "asc" | "desc";
type Locale = "pt-BR" | "en-US";

function ui(locale: Locale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

function formatInteger(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number, locale: Locale, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fold(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sortDealerTargetProgress(
  rows: readonly DealerTargetProgress[],
  sortKey: DealerTargetSortKey,
  direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  if (sortKey === "conversion") {
    return [...rows].sort((left, right) => {
      const leftValue = left.actualConversionRatePercent;
      const rightValue = right.actualConversionRatePercent;
      if (leftValue === null) return rightValue === null ? left.dealerName.localeCompare(right.dealerName, "pt-BR") : 1;
      if (rightValue === null) return -1;
      return (leftValue - rightValue) * multiplier ||
        right.leadsActual - left.leadsActual ||
        left.dealerName.localeCompare(right.dealerName, "pt-BR");
    });
  }
  const valueFor = (row: DealerTargetProgress) => {
    if (sortKey === "leadAchievement") return row.leadAchievementPercent;
    if (sortKey === "salesAchievement") return row.salesAchievementPercent ?? -1;
    if (sortKey === "leadGap") return row.leadGap;
    return row.salesGap ?? Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort(
    (left, right) =>
      (valueFor(left) - valueFor(right)) * multiplier ||
      right.leadsActual - left.leadsActual ||
      left.dealerName.localeCompare(right.dealerName, "pt-BR"),
  );
}

function achievementTone(value: number | null) {
  if (value === null) return "text-slate-500";
  if (value >= 100) return "text-emerald-300";
  if (value >= 75) return "text-amber-300";
  return "text-red-300";
}

function gapLabel(value: number | null, locale: Locale) {
  if (value === null) return "—";
  if (value === 0) return ui(locale, "Meta atingida", "Target achieved");
  if (value > 0) return `${formatInteger(value, locale)} ${ui(locale, "faltam", "remaining")}`;
  return `${formatInteger(Math.abs(value), locale)} ${ui(locale, "acima", "above")}`;
}

function SummaryCard({
  eyebrow,
  value,
  subtitle,
  achievement,
  accent,
  locale,
}: {
  eyebrow: string;
  value: string;
  subtitle: string;
  achievement: number | null;
  accent: string;
  locale: Locale;
}) {
  const progress = Math.max(0, Math.min(100, achievement ?? 0));
  return (
    <article className="min-w-0 border-t border-[#273247] bg-[#0d1421] px-4 py-4 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{eyebrow}</p>
      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <p className="text-lg font-semibold tracking-tight text-white sm:truncate sm:text-xl" title={value}>{value}</p>
        <p className={`shrink-0 text-xs font-semibold sm:text-right ${achievementTone(achievement)}`}>
          {achievement === null ? "—" : `${formatNumber(achievement, locale)}%`}
        </p>
      </div>
      <p className="mt-1 min-h-8 text-[9px] leading-4 text-slate-600">{subtitle}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#151f2e]">
        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: accent }} />
      </div>
    </article>
  );
}

export function DealerTargetTrackingPanel({
  tracking,
  geographicCpl,
  metaBudgetPlan,
  locale = "pt-BR",
}: {
  tracking: DealerTargetTracking;
  geographicCpl?: LeadGeographicCpl | null;
  metaBudgetPlan?: MetaBudgetPlan | null;
  locale?: Locale;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<DealerTargetSortKey>("conversion");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const rows = useMemo(() => {
    const query = fold(search);
    return sortDealerTargetProgress(tracking.dealers, sortKey, sortDirection).filter(row =>
      !query ? true : fold(`${row.dealerName} ${row.stateCode}`).includes(query),
    );
  }, [search, sortDirection, sortKey, tracking.dealers]);
  const cplByDealer = useMemo(
    () => new Map((geographicCpl?.dealers ?? []).map(dealer => [fold(dealer.dealerName), dealer])),
    [geographicCpl],
  );
  const summary = tracking.summary;
  const conversionAchievement = summary.actualConversionRatePercent === null || summary.targetConversionRatePercent <= 0
    ? null
    : Math.round((summary.actualConversionRatePercent / summary.targetConversionRatePercent) * 10_000) / 100;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] shadow-[0_8px_24px_rgba(0,0,0,0.14)]" data-testid="dealer-target-tracking">
      <header className="flex min-h-16 flex-col items-start justify-between gap-4 border-b border-[#1b2535] px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#ff8088]" />
            <h2 className="text-sm font-semibold text-slate-100">{ui(locale, "Acompanhamento das metas por concessionária", "Dealer target tracking")}</h2>
          </div>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-600">
            {ui(
              locale,
              metaBudgetPlan
                ? `TOTAL DEALER e ${MTD_RETAIL_ORDER_LABEL} do plano mensal versus Leads atribuídos às ${formatInteger(summary.dealers, locale)} concessionárias no período D-1. CPL estimado pela participação das metas; Meta usa orçamento de agosto rateado em ${metaBudgetPlan.calendarDays} dias.`
                : `TOTAL DEALER e ${MTD_RETAIL_ORDER_LABEL} do plano mensal versus Leads atribuídos às ${formatInteger(summary.dealers, locale)} concessionárias no período D-1. Investimento e CPL são estimados pela participação das metas de cada canal.`,
              metaBudgetPlan
                ? `Monthly TOTAL DEALER and ${MTD_RETAIL_ORDER_LABEL} targets versus D-1 Leads assigned to the ${formatInteger(summary.dealers, locale)} dealers. Estimated CPL uses target shares; Meta uses the August budget allocated across ${metaBudgetPlan.calendarDays} days.`
                : `Monthly TOTAL DEALER and ${MTD_RETAIL_ORDER_LABEL} targets versus D-1 Leads assigned to the ${formatInteger(summary.dealers, locale)} dealers. Investment and CPL are estimated from each channel target share.`,
            )}
          </p>
        </div>
        <div className="shrink-0 text-left text-[9px] leading-4 text-slate-600 sm:text-right">
          <p className="font-medium text-slate-400">{tracking.source.fileName}</p>
          <p>{formatDateTime(tracking.source.importedAt, locale)}</p>
        </div>
      </header>

      <div data-testid="dealer-target-summary" className="grid sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard locale={locale} eyebrow={ui(locale, "Leads atribuídos / meta", "Assigned Leads / target")} value={`${formatInteger(summary.leadsActual, locale)} / ${formatInteger(summary.leadTarget, locale)}`} subtitle={gapLabel(summary.leadGap, locale)} achievement={summary.leadAchievementPercent} accent="#38bdf8" />
        <SummaryCard locale={locale} eyebrow={ui(locale, `Meta de ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} target`)} value={`${formatInteger(summary.salesActual, locale)} / ${formatInteger(summary.salesTarget, locale)}`} subtitle={`${gapLabel(summary.salesGap, locale)} • ${formatInteger(summary.salesReportedDealers, locale)}/${formatInteger(summary.dealers, locale)} ${ui(locale, "dealers reportados", "dealers reported")}`} achievement={summary.salesAchievementPercent} accent="#e2212d" />
        <SummaryCard locale={locale} eyebrow={ui(locale, "Conversão real", "Actual conversion")} value={summary.actualConversionRatePercent === null ? "—" : `${formatNumber(summary.actualConversionRatePercent, locale)}%`} subtitle={`${ui(locale, "Meta", "Target")}: ${formatNumber(summary.targetConversionRatePercent, locale)}%`} achievement={conversionAchievement} accent="#10b981" />
        <SummaryCard locale={locale} eyebrow={ui(locale, "Cobertura da meta", "Target coverage")} value={`${formatInteger(summary.dealers, locale)} dealers`} subtitle={ui(locale, `${formatInteger(summary.dealers, locale)}/${formatInteger(summary.dealers, locale)} concessionárias conciliadas`, `${formatInteger(summary.dealers, locale)}/${formatInteger(summary.dealers, locale)} dealers matched`)} achievement={100} accent="#a78bfa" />
      </div>

      <div className="flex flex-col gap-3 border-t border-[#1b2535] p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={ui(locale, "Buscar concessionária ou UF...", "Search dealer or state...")} className="h-9 border-[#273247] bg-[#101827] pl-9 text-xs text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20" />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={sortKey} onChange={event => setSortKey(event.target.value as DealerTargetSortKey)} aria-label={ui(locale, "Ordenar metas por", "Sort targets by")} className="h-9 rounded-md border border-[#273247] bg-[#101827] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]">
            <option value="conversion">{ui(locale, "Melhor conversão", "Best conversion")}</option>
            <option value="leadAchievement">{ui(locale, "Atingimento de Leads", "Lead achievement")}</option>
            <option value="salesAchievement">{ui(locale, `Atingimento de ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} achievement`)}</option>
            <option value="leadGap">{ui(locale, "Gap de Leads", "Lead gap")}</option>
            <option value="salesGap">{ui(locale, `Gap de ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} gap`)}</option>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => setSortDirection(current => current === "asc" ? "desc" : "asc")} className="h-9 border-[#273247] bg-[#101827] text-[10px] text-slate-300 hover:bg-[#182338] hover:text-white">
            <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
            {sortDirection === "asc" ? ui(locale, "Menor primeiro", "Lowest first") : ui(locale, "Maior primeiro", "Highest first")}
          </Button>
        </div>
      </div>

      <div className="space-y-2 p-3 md:hidden" data-testid="dealer-target-mobile-list">
        {rows.map(row => {
          const cpl = cplByDealer.get(fold(row.dealerName));
          return (
            <article key={row.dealerKey} className="rounded-lg border border-[#1c2738] bg-[#0a111d] p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-[10px] font-semibold text-slate-200">{row.dealerName}</p><p className="mt-0.5 text-[9px] text-slate-600">{row.stateCode}</p></div><div className="shrink-0 text-right" data-testid={`dealer-mobile-conversion-${row.dealerKey}`}><p className="text-[8px] uppercase tracking-[0.08em] text-slate-600">{ui(locale, "Conversão", "Conversion")}</p><p className="mt-0.5 text-xs font-semibold text-emerald-300">{row.actualConversionRatePercent === null ? "—" : `${formatNumber(row.actualConversionRatePercent, locale)}%`}</p></div></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]"><div><p className="text-slate-600">Leads</p><p className="mt-1 font-medium text-sky-300">{formatInteger(row.leadsActual, locale)} / {formatInteger(row.leadTarget, locale)}</p><p className="mt-0.5 text-slate-600">{gapLabel(row.leadGap, locale)} • {ui(locale, "Ating.", "Achiev.")} {formatNumber(row.leadAchievementPercent, locale)}%</p></div><div><p className="text-slate-600">{MTD_RETAIL_ORDER_LABEL}</p><p className="mt-1 font-medium text-white">{row.salesActual === null ? "—" : formatInteger(row.salesActual, locale)} / {formatInteger(row.salesTarget, locale)}</p><p className="mt-0.5 text-slate-600">{gapLabel(row.salesGap, locale)}</p></div><div><p className="text-slate-600">{ui(locale, "Investimento alocado", "Allocated investment")}</p><p className="mt-1 font-medium text-slate-200">{cpl?.investment == null ? "—" : formatCurrency(cpl.investment, locale)}</p></div><div><p className="text-slate-600">{ui(locale, "CPL estimado", "Estimated CPL")}</p><p className="mt-1 font-medium text-emerald-300">{cpl?.estimatedCpl == null ? "—" : formatCurrency(cpl.estimatedCpl, locale)}</p></div></div>
            </article>
          );
        })}
      </div>

      <div className="hidden max-w-full overflow-x-auto md:block">
        <table className="w-full min-w-[1280px] text-left" data-testid="dealer-target-table">
          <thead className="border-y border-[#1d2737] bg-[#0a111d] text-[9px] uppercase tracking-[0.1em] text-slate-600"><tr><th className="px-4 py-3 font-semibold">Dealer</th><th className="px-3 py-3 text-center font-semibold">UF</th><th className="px-3 py-3 text-right font-semibold">Leads</th><th className="px-3 py-3 text-right font-semibold">{ui(locale, "Ating. Leads", "Lead achiev.")}</th><th className="px-3 py-3 text-right font-semibold">{ui(locale, "Gap Leads", "Lead gap")}</th><th className="px-3 py-3 text-right font-semibold">{MTD_RETAIL_ORDER_LABEL}</th><th className="px-3 py-3 text-right font-semibold">{ui(locale, `Ating. ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} achiev.`)}</th><th className="px-3 py-3 text-right font-semibold">{ui(locale, `Gap ${MTD_RETAIL_ORDER_LABEL}`, `${MTD_RETAIL_ORDER_LABEL} gap`)}</th><th className="px-3 py-3 text-right font-semibold">{ui(locale, "Investimento alocado", "Allocated investment")}</th><th className="px-3 py-3 text-right font-semibold">{ui(locale, "CPL estimado", "Estimated CPL")}</th><th className="px-4 py-3 text-right font-semibold">{ui(locale, "Conversão", "Conversion")}</th></tr></thead>
          <tbody className="divide-y divide-[#172131]">
            {rows.map(row => {
              const cpl = cplByDealer.get(fold(row.dealerName));
              return (
                <tr key={row.dealerKey} className="text-[10px] transition-colors hover:bg-white/[0.025]">
                  <td className="px-4 py-3 font-medium text-slate-200">{row.dealerName}</td><td className="px-3 py-3 text-center text-slate-500">{row.stateCode}</td><td className="px-3 py-3 text-right"><span className="font-semibold text-sky-300">{formatInteger(row.leadsActual, locale)}</span><span className="text-slate-600"> / {formatInteger(row.leadTarget, locale)}</span></td><td className={`px-3 py-3 text-right font-semibold ${achievementTone(row.leadAchievementPercent)}`}>{formatNumber(row.leadAchievementPercent, locale)}%</td><td className="px-3 py-3 text-right text-slate-400">{gapLabel(row.leadGap, locale)}</td><td className="px-3 py-3 text-right"><span className="font-semibold text-white">{row.salesActual === null ? "—" : formatInteger(row.salesActual, locale)}</span><span className="text-slate-600"> / {formatInteger(row.salesTarget, locale)}</span></td><td className={`px-3 py-3 text-right font-semibold ${achievementTone(row.salesAchievementPercent)}`}>{row.salesAchievementPercent === null ? "—" : `${formatNumber(row.salesAchievementPercent, locale)}%`}</td><td className="px-3 py-3 text-right text-slate-400">{gapLabel(row.salesGap, locale)}</td><td className="px-3 py-3 text-right text-slate-300">{cpl?.investment == null ? "—" : formatCurrency(cpl.investment, locale)}</td><td className="px-3 py-3 text-right font-semibold text-emerald-300">{cpl?.estimatedCpl == null ? "—" : formatCurrency(cpl.estimatedCpl, locale)}</td><td className="px-4 py-3 text-right text-emerald-300">{row.actualConversionRatePercent === null ? "—" : `${formatNumber(row.actualConversionRatePercent, locale)}%`}<span className="block text-[8px] text-slate-600">{ui(locale, "Meta", "Target")} {formatNumber(row.targetConversionRatePercent, locale)}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length ? <div className="grid min-h-32 place-items-center px-5 text-center text-xs text-slate-500">{ui(locale, "Nenhuma concessionária encontrada.", "No dealer found.")}</div> : null}
    </section>
  );
}
