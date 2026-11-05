import { Button } from "@/components/ui/button";
import type { inferRouterOutputs } from "@trpc/server";
import { Printer } from "lucide-react";
import React from "react";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LeadAnalytics = RouterOutputs["leads"]["analytics"];
type WeeklySalesMetrics = RouterOutputs["leads"]["weeklySalesMetrics"];
type Locale = "pt-BR" | "en-US";
type Week = 1 | 2 | 3 | 4 | 5;

const MG_LOGO_URL = "/manus-storage/mg-logo-transparent-exact_cdfbeb6c.png";
const CHANNEL_COLORS = ["#e2212d", "#38bdf8", "#a78bfa", "#f59e0b", "#10b981", "#f472b6"];
const PDF_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function ui(locale: Locale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

function formatInteger(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return ui(locale, "Indisponível", "Unavailable");
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatShortDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatCategory(value: string | null | undefined, locale: Locale) {
  const normalized = value?.trim() ?? "";
  return normalized || ui(locale, "Indisponível", "Unavailable");
}

function monthCode(value: string, locale: Locale) {
  const date = new Date(`${value}T12:00:00`);
  const month = new Intl.DateTimeFormat(locale, { month: "short" })
    .format(date)
    .replace(".", "")
    .toLocaleUpperCase(locale);
  return `${month}/${String(date.getFullYear()).slice(-2)}`;
}

function periodLabel(dateFrom: string, dateTo: string, locale: Locale) {
  const from = new Date(`${dateFrom}T12:00:00`);
  const to = new Date(`${dateTo}T12:00:00`);
  const fromLabel = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long" }).format(from);
  const toLabel = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long" }).format(to);
  return `${fromLabel}  ~  ${toLabel}`;
}

function percent(value: number | null, locale: Locale) {
  return value == null ? "—" : `${formatNumber(value, locale)}%`;
}

export function LeadsDailyReportButton({
  locale = "pt-BR",
  onPrint,
}: {
  locale?: Locale;
  onPrint: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onPrint}
      className="w-full bg-[#e2212d] text-white hover:bg-[#c91622] sm:w-auto"
      data-testid="leads-daily-report-button"
    >
      <Printer className="mr-2 h-4 w-4" />
      {ui(locale, "Gerar PDF diário", "Generate daily PDF")}
    </Button>
  );
}

export function buildLeadsDailyPdfTitle(generatedAt: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(generatedAt);
  const day = parts.find(part => part.type === "day")?.value ?? "00";
  const monthIndex = Number.parseInt(parts.find(part => part.type === "month")?.value ?? "0", 10) - 1;
  const month = PDF_MONTH_LABELS[monthIndex] ?? "Mon";
  return `MG Motors _ LEADS dashboard_${day} ${month}`;
}

export function activateLeadsDailyPrintMode(input: {
  body: { dataset: DOMStringMap };
  page?: { title: string };
  pdfTitle?: string;
  print: () => void;
  addAfterPrintListener?: (listener: () => void) => void;
}) {
  const originalTitle = input.page?.title;
  input.body.dataset.printMode = "leads-daily";
  if (input.page && input.pdfTitle) input.page.title = input.pdfTitle;
  const cleanup = () => {
    if (input.body.dataset.printMode === "leads-daily") delete input.body.dataset.printMode;
    if (input.page && originalTitle !== undefined) input.page.title = originalTitle;
  };
  input.addAfterPrintListener?.(cleanup);
  input.print();
  return cleanup;
}

function ReportLogo() {
  return (
    <img
      src={MG_LOGO_URL}
      alt="MG Motor"
      className="h-[66px] w-[68px] object-contain"
    />
  );
}

function ReportHeader({ dateFrom, dateTo, locale }: { dateFrom: string; dateTo: string; locale: Locale }) {
  return (
    <header className="relative z-10 grid shrink-0 grid-cols-[1fr_auto] items-start">
      <div className="pb-1">
        <h1 className="text-[29px] font-medium uppercase leading-none tracking-[0.02em] text-white">
          {ui(locale, "Gestão de Leads", "Leads Management")} — {monthCode(dateTo, locale)}
        </h1>
        <div className="mt-4 inline-flex min-w-[355px] items-center bg-[#d80b21] px-5 py-2 text-[15px] font-bold text-white">
          <span className="mr-8 uppercase">{ui(locale, "Período:", "Data from:")}</span>
          <span>{periodLabel(dateFrom, dateTo, locale)}</span>
        </div>
      </div>
      <ReportLogo />
    </header>
  );
}

function ReportFooter({ page, locale }: { page: number; locale: Locale }) {
  return (
    <footer className="relative z-10 mt-auto flex shrink-0 items-end justify-between pt-2 text-[10px] text-slate-400">
      <span>{ui(locale, "Fonte: Dashboard BBRO & Co", "Source: BBRO & Co dashboard")}</span>
      <span>{ui(locale, `Página ${page} de 4`, `Page ${page} of 4`)}</span>
    </footer>
  );
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return (
    <div className="relative border border-[#1d2a3d] bg-[#0b1423] px-4 py-3">
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: accent }} />
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none text-white">{value}</p>
      <p className="mt-1.5 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function StackedDailyChart({ analytics, locale }: { analytics: LeadAnalytics; locale: Locale }) {
  const daily = analytics.daily;
  const channels = analytics.channels.filter(channel => channel.leads > 0).slice(0, 6);
  const width = 1380;
  const height = 355;
  const padding = { top: 30, right: 60, bottom: 58, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxDaily = Math.max(...daily.map(point => point.total), 1);
  let cumulative = 0;
  const cumulativePoints = daily.map(point => {
    cumulative += point.total;
    return cumulative;
  });
  const goal = analytics.pacing.goal;
  const pacePoints = daily.map(point => {
    if (goal == null) return null;
    const day = Number(point.date.slice(-2));
    return (goal / analytics.pacing.daysInMonth) * day;
  });
  const maxCumulative = Math.max(
    cumulativePoints.at(-1) ?? 1,
    ...pacePoints.map(value => value ?? 0),
    1,
  );
  const slot = plotWidth / Math.max(daily.length, 1);
  const barWidth = Math.max(13, Math.min(38, slot * 0.63));
  const x = (index: number) => padding.left + slot * index + slot / 2;
  const yDaily = (value: number) => padding.top + plotHeight - (value / maxDaily) * plotHeight;
  const yCumulative = (value: number) => padding.top + plotHeight - (value / maxCumulative) * plotHeight;
  const actualPath = cumulativePoints.map((value, index) => `${x(index)},${yCumulative(value)}`).join(" ");
  const pacePath = pacePoints
    .map((value, index) => value == null ? null : `${x(index)},${yCumulative(value)}`)
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ui(locale, "Gráfico diário de Leads por canal", "Daily Leads chart by channel")}
      className="h-[330px] w-full"
      data-testid="leads-daily-print-chart"
    >
      <title>{ui(locale, "Volume diário por canal com acumulado real e pace", "Daily channel volume with cumulative actual and pace")}</title>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
        const gridY = yDaily(maxDaily * fraction);
        return (
          <g key={fraction}>
            <line x1={padding.left} x2={width - padding.right} y1={gridY} y2={gridY} stroke="#1b2a3d" strokeDasharray="4 5" />
            <text x={padding.left - 10} y={gridY + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {formatInteger(maxDaily * fraction, locale)}
            </text>
            <text x={width - padding.right + 10} y={gridY + 4} fontSize="11" fill="#64748b">
              {formatInteger(maxCumulative * fraction, locale)}
            </text>
          </g>
        );
      })}
      {daily.map((point, index) => {
        let stacked = 0;
        return (
          <g key={point.date}>
            {channels.map((channel, channelIndex) => {
              const value = point.values[channel.value] ?? 0;
              const segmentHeight = (value / maxDaily) * plotHeight;
              const segmentY = padding.top + plotHeight - stacked - segmentHeight;
              stacked += segmentHeight;
              return (
                <rect
                  key={channel.value}
                  x={x(index) - barWidth / 2}
                  y={segmentY}
                  width={barWidth}
                  height={Math.max(segmentHeight, 0)}
                  fill={CHANNEL_COLORS[channelIndex % CHANNEL_COLORS.length]}
                />
              );
            })}
            <text x={x(index)} y={yDaily(point.total) - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill="#f8fafc">
              {formatInteger(point.total, locale)}
            </text>
            <text x={x(index)} y={height - 30} textAnchor="middle" fontSize="10" fill="#64748b">
              {formatShortDate(point.date, locale)}
            </text>
          </g>
        );
      })}
      {daily.length > 1 ? (
        <>
          <polyline points={actualPath} fill="none" stroke="#f8fafc" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {pacePath ? <polyline points={pacePath} fill="none" stroke="#fb7185" strokeWidth="2.5" strokeDasharray="7 6" /> : null}
        </>
      ) : null}
      <g transform={`translate(${padding.left} ${height - 6})`}>
        {channels.map((channel, index) => (
          <g key={channel.value} transform={`translate(${index * 150} 0)`}>
            <rect width="12" height="9" y="-8" fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />
            <text x="18" y="0" fontSize="10" fill="#cbd5e1">{channel.value}</text>
          </g>
        ))}
        <g transform={`translate(${channels.length * 150} 0)`}>
          <line x1="0" x2="22" y1="-4" y2="-4" stroke="#f8fafc" strokeWidth="3" />
          <text x="28" y="0" fontSize="10" fill="#cbd5e1">{ui(locale, "Acumulado real", "Cumulative actual")}</text>
        </g>
        {pacePath ? (
          <g transform={`translate(${channels.length * 150 + 155} 0)`}>
            <line x1="0" x2="22" y1="-4" y2="-4" stroke="#fb7185" strokeWidth="2.5" strokeDasharray="6 4" />
            <text x="28" y="0" fontSize="10" fill="#cbd5e1">{ui(locale, "Pace acumulado", "Cumulative pace")}</text>
          </g>
        ) : null}
      </g>
    </svg>
  );
}

function ChannelCard({ channel, locale }: { channel: LeadAnalytics["channels"][number]; locale: Locale }) {
  const aboveTarget = channel.remainingToTarget != null && channel.remainingToTarget < 0;
  return (
    <article className="border border-[#1d2a3d] bg-[#0b1423] p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-white">{formatCategory(channel.value, locale)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{formatNumber(channel.dailyAverage, locale)} {ui(locale, "por dia", "per day")} · {formatNumber(channel.sharePercent, locale)}% {ui(locale, "do período", "of period")}</p>
        </div>
        <div className="text-right"><p className="text-[20px] font-semibold text-white">{formatInteger(channel.leads, locale)}</p><p className="text-[9px] uppercase tracking-[0.1em] text-slate-500">Leads</p></div>
      </div>
      <div className="mt-2 border-t border-[#1d2a3d] pt-2">
        <p className="text-[9px] uppercase tracking-[0.11em] text-slate-500">{ui(locale, "Meta do canal", "Channel target")}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-[13px] text-slate-300">{formatInteger(channel.leads, locale)} / {channel.target == null ? "—" : formatInteger(channel.target, locale)}</p>
          <p className="text-[13px] font-semibold text-[#ff8c93]">{percent(channel.achievementPercent, locale)}</p>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden bg-[#182438]"><span className="block h-full bg-[#e2212d]" style={{ width: `${Math.min(channel.achievementPercent ?? 0, 100)}%` }} /></div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          {channel.remainingToTarget == null
            ? ui(locale, "Sem meta cadastrada", "No target available")
            : aboveTarget
              ? `${formatInteger(Math.abs(channel.remainingToTarget), locale)} ${ui(locale, "acima da meta", "above target")}`
              : `${formatInteger(channel.remainingToTarget, locale)} ${ui(locale, "restantes", "remaining")}`}
        </p>
      </div>
    </article>
  );
}

function HorizontalBreakdown({ title, subtitle, items, accent, locale }: { title: string; subtitle: string; items: LeadAnalytics["models"]; accent: string; locale: Locale }) {
  const max = Math.max(...items.map(item => item.leads), 1);
  return (
    <section className="border border-[#1d2a3d] bg-[#0b1423]">
      <div className="border-b border-[#1d2a3d] px-3 py-2.5"><h2 className="text-[14px] font-semibold text-white">{title}</h2><p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p></div>
      <div className="space-y-2 px-3 py-2.5">
        {items.slice(0, 7).map(item => (
          <div key={item.value}>
            <div className="flex items-center justify-between gap-4 text-[11px]"><span className="font-semibold text-slate-200">{formatCategory(item.value, locale)}</span><span className="text-slate-500">{formatInteger(item.leads, locale)} · {formatNumber(item.sharePercent, locale)}%</span></div>
            <div className="mt-1 h-1 overflow-hidden bg-[#182438]"><span className="block h-full" style={{ width: `${(item.leads / max) * 100}%`, backgroundColor: accent }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

type RankingRow = { dealerName: string; sales: number; leads: number; conversionRatePercent: number };

export function buildDailyReportConversionRankings(metrics: WeeklySalesMetrics | null | undefined) {
  const week = (metrics?.referenceWeek ?? 5) as Week;
  const excluded = new Set(["leads em qualificação", "indisponível", "unavailable", "outro", "outros"]);
  const rows: RankingRow[] = metrics?.dealers.flatMap(dealer => {
    const values = dealer.weeks[week];
    const leads = values?.leads ?? 0;
    const sales = values?.retail ?? null;
    const normalized = dealer.dealerName.trim().toLocaleLowerCase("pt-BR");
    if (dealer.matchStatus !== "MATCHED" || excluded.has(normalized) || sales == null || leads <= 0) return [];
    return [{ dealerName: dealer.dealerName, sales, leads, conversionRatePercent: Math.round((sales / leads) * 10_000) / 100 }];
  }) ?? [];
  return {
    week,
    top: [...rows].sort((a, b) => b.conversionRatePercent - a.conversionRatePercent || b.sales - a.sales).slice(0, 10),
    bottom: [...rows].sort((a, b) => a.conversionRatePercent - b.conversionRatePercent || b.sales - a.sales).slice(0, 10),
  };
}

function RankingList({ title, subtitle, rows, tone, locale }: { title: string; subtitle: string; rows: RankingRow[]; tone: "top" | "bottom"; locale: Locale }) {
  const max = Math.max(...rows.map(row => row.conversionRatePercent), 1);
  const accent = tone === "top" ? "#21d4b4" : "#f59e0b";
  const numberColor = tone === "top" ? "#34d399" : "#fb7185";
  return (
    <section className="border border-[#1d2a3d] bg-[#0b1423]">
      <div className="border-b border-[#1d2a3d] px-4 py-2.5"><h2 className="text-[14px] font-semibold text-white">{title}</h2><p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p></div>
      <div className="divide-y divide-[#182438] px-4">
        {rows.map((row, index) => (
          <div key={`${row.dealerName}-${index}`} className="py-2">
            <div className="flex items-center justify-between gap-4 text-[10px]">
              <p className="min-w-0 truncate font-semibold text-slate-100"><span className="mr-2 tabular-nums" style={{ color: numberColor }}>{String(index + 1).padStart(2, "0")}</span>{row.dealerName}</p>
              <p className="shrink-0 text-slate-500">{formatInteger(row.sales, locale)} MTD Retail Order · {formatInteger(row.leads, locale)} Leads · <strong style={{ color: numberColor }}>{formatNumber(row.conversionRatePercent, locale)}%</strong></p>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden bg-[#182438]"><span className="block h-full" style={{ width: `${(row.conversionRatePercent / max) * 100}%`, backgroundColor: accent }} /></div>
          </div>
        ))}
        {!rows.length ? <p className="py-12 text-center text-[12px] text-slate-500">{ui(locale, "Ranking indisponível para o período", "Ranking unavailable for the period")}</p> : null}
      </div>
    </section>
  );
}

export function LeadsDailyPrintReport({
  analytics,
  weeklySales = null,
  dateFrom,
  dateTo,
  locale = "pt-BR",
}: {
  analytics: LeadAnalytics;
  weeklySales?: WeeklySalesMetrics | null;
  dateFrom: string;
  dateTo: string;
  locale?: Locale;
}) {
  const peak = analytics.daily.reduce((value, point) => Math.max(value, point.total), 0);
  const dealerShare = analytics.summary.totalLeads
    ? (analytics.dealerAudit.summary.assignedLeads / analytics.summary.totalLeads) * 100
    : 0;
  const qualificationShare = analytics.summary.totalLeads
    ? (analytics.dealerAudit.summary.unavailableLeads / analytics.summary.totalLeads) * 100
    : 0;
  const paceDifference = analytics.pacing.goal == null
    ? null
    : analytics.pacing.current - (analytics.pacing.goal / analytics.pacing.daysInMonth) * analytics.pacing.closedDays;
  const rankings = buildDailyReportConversionRankings(weeklySales);

  return (
    <section data-leads-print-root data-testid="leads-daily-print-report" className="bg-black text-white">
      <article className="leads-print-page flex flex-col bg-black">
        <div className="h-[5px] w-[125px] bg-white" />
        <div className="mt-12 flex items-start justify-between">
          <div>
            <h1 className="text-[35px] font-semibold uppercase tracking-[0.025em] text-white">
              {ui(locale, "Leads — Relatório Diário", "Leads — Daily Report")} — {monthCode(dateTo, locale)}
            </h1>
            <div className="mt-5 inline-flex min-w-[355px] items-center bg-[#d80b21] px-5 py-2 text-[16px] font-bold text-white">
              <span className="mr-8 uppercase">{ui(locale, "Período:", "Data from:")}</span>
              <span>{periodLabel(dateFrom, dateTo, locale)}</span>
            </div>
          </div>
          <ReportLogo />
        </div>
        <div className="mt-auto flex items-end pb-1">
          <span className="text-[9px] uppercase tracking-[0.18em] text-slate-400">MG MOTOR | SÃO PAULO</span>
        </div>
      </article>

      <article className="leads-print-page flex flex-col bg-black">
        <ReportHeader dateFrom={dateFrom} dateTo={dateTo} locale={locale} />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MetricCard label={ui(locale, "Total de Leads", "Total Leads")} value={formatInteger(analytics.summary.totalLeads, locale)} detail={`${analytics.summary.calendarDays} ${ui(locale, "dia(s) no período", "day(s) in period")}`} accent="#e2212d" />
          <MetricCard label={ui(locale, "Leads nas concessionárias", "Leads in dealerships")} value={formatInteger(analytics.dealerAudit.summary.assignedLeads, locale)} detail={`${formatNumber(dealerShare, locale)}% ${ui(locale, "do total", "of total")}`} accent="#21d4b4" />
          <MetricCard label={ui(locale, "Em qualificação / sem cobertura", "In qualification / no coverage")} value={formatInteger(analytics.dealerAudit.summary.unavailableLeads, locale)} detail={`${formatNumber(qualificationShare, locale)}% ${ui(locale, "do total", "of total")}`} accent="#38bdf8" />
        </div>
        <section className="mt-3 border border-[#1d2a3d] bg-[#0b1423]">
          <div className="flex items-start justify-between px-4 pt-4"><div><h2 className="text-[15px] font-semibold text-white">{ui(locale, "Leads por dia e canal", "Leads by day and channel")}</h2><p className="mt-1 text-[11px] text-slate-500">{ui(locale, "Volume diário por canal com acumulado real versus pace planejado.", "Daily channel volume with cumulative actual versus planned pace.")}</p></div><div className="flex gap-2 text-[11px]"><span className="border border-[#263247] px-3 py-1 text-slate-300">{analytics.summary.calendarDays} {ui(locale, "dias", "days")}</span>{paceDifference == null ? null : <span className={`border px-3 py-1 ${paceDifference >= 0 ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}`}>{paceDifference >= 0 ? "+" : ""}{formatInteger(paceDifference, locale)} vs pace</span>}</div></div>
          <StackedDailyChart analytics={analytics} locale={locale} />
          <div className="grid grid-cols-4 border-t border-[#1d2a3d]">
            {[
              [ui(locale, "Total do período", "Period total"), formatInteger(analytics.summary.totalLeads, locale)],
              [ui(locale, "Média diária", "Daily average"), formatNumber(analytics.summary.dailyAverage, locale)],
              [ui(locale, "Pico diário", "Daily peak"), formatInteger(peak, locale)],
              [ui(locale, "Canais ativos", "Active channels"), formatInteger(analytics.summary.activeChannels, locale)],
            ].map(([label, value]) => <div key={label} className="border-r border-[#1d2a3d] px-4 py-3 last:border-r-0"><p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-1 text-[14px] font-semibold text-white">{value}</p></div>)}
          </div>
        </section>
        <ReportFooter page={2} locale={locale} />
      </article>

      <article className="leads-print-page flex flex-col bg-black">
        <ReportHeader dateFrom={dateFrom} dateTo={dateTo} locale={locale} />
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1.03fr_0.97fr] gap-3">
          <section className="grid content-start grid-cols-2 gap-2.5">
            {analytics.channels.slice(0, 6).map(channel => <ChannelCard key={channel.value} channel={channel} locale={locale} />)}
          </section>
          <div className="grid content-start gap-3">
            <HorizontalBreakdown title={ui(locale, "Leads por modelo", "Leads by model")} subtitle={ui(locale, "Classificação preservada da base de Leads.", "Classification preserved from the Leads database.")} items={analytics.models} accent="#e2212d" locale={locale} />
            <HorizontalBreakdown title={ui(locale, "MG4 Urban por canal de origem", "MG4 Urban by source channel")} subtitle={ui(locale, "Origem preservada antes da classificação como Campanha Urban.", "Source preserved before classification as Urban Campaign.")} items={analytics.mg4UrbanSourceChannels} accent="#38bdf8" locale={locale} />
          </div>
        </div>
        <ReportFooter page={3} locale={locale} />
      </article>

      <article className="leads-print-page flex flex-col bg-black">
        <ReportHeader dateFrom={dateFrom} dateTo={dateTo} locale={locale} />
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3 pb-2">
          <RankingList title={ui(locale, "Top 10 — Conversão", "Top 10 — Conversion")} subtitle={ui(locale, `Maiores taxas entre concessionárias elegíveis na Semana ${rankings.week}.`, `Highest rates among eligible dealers in Week ${rankings.week}.`)} rows={rankings.top} tone="top" locale={locale} />
          <RankingList title={ui(locale, "Bottom 10 — Conversão", "Bottom 10 — Conversion")} subtitle={ui(locale, `Menores taxas entre concessionárias elegíveis na Semana ${rankings.week}.`, `Lowest rates among eligible dealers in Week ${rankings.week}.`)} rows={rankings.bottom} tone="bottom" locale={locale} />
        </div>
        <ReportFooter page={4} locale={locale} />
      </article>
    </section>
  );
}
