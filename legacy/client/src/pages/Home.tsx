import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CampaignIdentity } from "@/components/CampaignIdentity";
import { OptimizationHistoryTab } from "@/components/OptimizationHistoryTab";
import { AccessHistoryTab } from "@/components/AccessHistoryTab";
import { LeadsTab } from "@/components/LeadsTab";
import { MetaAdsDashboard } from "@/components/MetaAdsDashboard";
import { TikTokAdsDashboard } from "@/components/TikTokAdsDashboard";
import { SocialOrganicDashboard } from "@/components/SocialOrganicDashboard";
import { MediaPlanDashboard } from "@/components/MediaPlanDashboard";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { openNativeDatePicker } from "@/lib/nativeDatePicker";
import {
  isValidLeadDateRange,
  LEAD_MONTH_DEFAULT_START,
  resolveLeadMonthRange,
} from "@/lib/leadDateRange";
import {
  DASHBOARD_UPDATE_COPY,
  formatDashboardUpdatedAt,
  preserveLastSuccessfulUpdate,
} from "@/lib/dashboardUpdate";
import {
  buildDashboardSearch,
  resolveDashboardRoute,
  type DashboardModuleId,
  type GoogleAdsTabId,
} from "@/lib/dashboardNavigation";
import { getDashboardCutoffDate } from "@shared/dashboardDates";
import { parseNegativeKeywordList } from "@shared/negativeKeywords";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Gauge,
  History,
  Info,
  Loader2,
  LogOut,
  Megaphone,
  MousePointerClick,
  MonitorSmartphone,
  PencilLine,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  Video,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DashboardData = RouterOutputs["dashboard"]["getData"];
type DashboardSession = NonNullable<RouterOutputs["dashboardAuth"]["session"]>;
type DailyPoint = DashboardData["daily"][number];
type GoogleDeviceMix = RouterOutputs["dashboard"]["deviceMix"];
type Campaign = DashboardData["campaigns"][number];
type OptimizationTask = RouterOutputs["dashboard"]["optimizationWorkspace"]["tasks"][number];
type TaskStatusFilter = "ALL" | OptimizationTask["status"];

const DATA_END = getDashboardCutoffDate();
const TAG_CORRECTION_DATE = "2026-07-15";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

type OptimizationEvidenceValue = number | string | boolean | null | undefined;

function formatOptimizationValue(value: OptimizationEvidenceValue, format: OptimizationEvidenceValue) {
  if (value == null || value === "") return "Não se aplica";
  if (typeof value !== "number") return String(value);
  if (format === "currency") return BRL.format(value);
  if (format === "percent") return `${NUMBER.format(value)}%`;
  return NUMBER.format(value);
}

type DashboardLocale = DashboardSession["locale"];

function ui(locale: DashboardLocale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

function formatCurrency(value: number, locale: DashboardLocale = "pt-BR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function formatNumber(value: number, locale: DashboardLocale = "pt-BR") {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function localizeStatus(locale: DashboardLocale, status: string) {
  if (locale !== "en-US") return status;
  return ({ "Saudável": "Healthy", "Atenção": "Attention", "Crítico": "Critical", "Favorável": "Favorable", "Neutro": "Neutral", "Desfavorável": "Unfavorable" } as Record<string, string>)[status] ?? status;
}

function localizeGoogleStatus(locale: DashboardLocale, status: string) {
  if (locale !== "en-US") return status === "ENABLED" ? "Ativada" : status === "PAUSED" ? "Pausada" : status;
  return status === "ENABLED" ? "Enabled" : status === "PAUSED" ? "Paused" : status;
}

function localizeUnavailable(locale: DashboardLocale) {
  return ui(locale, "Indisponível", "Unavailable");
}

function localizeMetricLabel(locale: DashboardLocale, key: string, fallback: string) {
  if (locale !== "en-US") return fallback;
  return ({
    investment: "Investment",
    conversions: "Conversions",
    cpa: "CPA",
    ctr: "CTR",
    conversionRate: "Conversion Rate",
    cpc: "CPC",
    clicks: "Clicks",
    impressions: "Impressions",
  } as Record<string, string>)[key] ?? fallback;
}

export function isMgSalesReadOnlyUsername(username: string) {
  return username.trim().toLowerCase() === "mgsales";
}

const dashboardModules: Array<{
  id: DashboardModuleId;
  labels: Record<"pt-BR" | "en-US", string>;
  permission: keyof DashboardSession["permissions"];
  icon: typeof BarChart3;
}> = [
  { id: "google-ads", labels: { "pt-BR": "Google Ads", "en-US": "Google Ads" }, permission: "canAccessGoogleAds", icon: BarChart3 },
  { id: "meta-ads", labels: { "pt-BR": "Meta Ads", "en-US": "Meta Ads" }, permission: "canAccessMetaAds", icon: Megaphone },
  { id: "tiktok-ads", labels: { "pt-BR": "TikTok Ads", "en-US": "TikTok Ads" }, permission: "canAccessMetaAds", icon: Video },
  { id: "social-organic", labels: { "pt-BR": "Social Orgânico", "en-US": "Organic Social" }, permission: "canAccessMetaAds", icon: Share2 },
  { id: "leads", labels: { "pt-BR": "Leads", "en-US": "Leads" }, permission: "canAccessLeads", icon: UsersRound },
  { id: "media-plan", labels: { "pt-BR": "Plano de Mídia", "en-US": "Media Plan" }, permission: "canAccessMediaPlan", icon: FileSpreadsheet },
  { id: "access-history", labels: { "pt-BR": "Histórico de acessos", "en-US": "Access History" }, permission: "canAccessAccessHistory", icon: ShieldCheck },
];

const googleAdsTabs: Array<{
  id: GoogleAdsTabId;
  labels: Record<"pt-BR" | "en-US", string>;
  permission?: "canAccessOptimizations" | "canAccessHistory";
  icon: typeof BarChart3;
}> = [
  { id: "overview", labels: { "pt-BR": "Visão Geral", "en-US": "Overview" }, icon: BarChart3 },
  { id: "daily", labels: { "pt-BR": "Acompanhamento Diário", "en-US": "Daily Tracking" }, icon: Clock3 },
  { id: "investment", labels: { "pt-BR": "Investimento", "en-US": "Investment" }, icon: CircleDollarSign },
  { id: "optimizations", labels: { "pt-BR": "Otimizações", "en-US": "Optimizations" }, permission: "canAccessOptimizations", icon: Sparkles },
  { id: "history", labels: { "pt-BR": "Histórico", "en-US": "History" }, permission: "canAccessHistory", icon: History },
];

function getRouteFromUrl() {
  return resolveDashboardRoute(typeof window === "undefined" ? "" : window.location.search);
}

function isoDateFromDateEnd(dateEnd: string, days: number) {
  const date = new Date(`${dateEnd}T12:00:00`);
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function isoDateFromEnd(days: number) {
  return isoDateFromDateEnd(DATA_END, days);
}

function formatDate(value: string, locale: DashboardLocale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatLongDate(value: string, locale: DashboardLocale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatCompactCurrency(value: number, locale: DashboardLocale = "pt-BR") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 2,
  }).format(value);
}

function formatMetric(value: number, type: "currency" | "number" | "percent", locale: DashboardLocale = "pt-BR") {
  if (type === "currency") return formatCurrency(value, locale);
  if (type === "percent") return `${formatNumber(value, locale)}%`;
  return formatNumber(value, locale);
}

const MG_LOGO_URL = "/manus-storage/mg-logo-transparent-exact_cdfbeb6c.png";

function MgLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-16 w-auto max-w-[230px] sm:h-[72px]" : size === "sm" ? "h-8 w-auto max-w-[145px]" : "h-11 w-auto max-w-[180px]";
  return (
    <img
      src={MG_LOGO_URL}
      alt="MG Motors"
      className={`${sizeClass} shrink-0 object-contain drop-shadow-[0_0_22px_rgba(226,33,45,0.16)]`}
      draggable={false}
    />
  );
}

function LoginScreen() {
  const sessionUtils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.dashboardAuth.login.useMutation({
    onSuccess: async () => {
      await sessionUtils.dashboardAuth.session.invalidate();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ username, password });
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#070b14] px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_50%_-20%,rgba(226,33,45,0.18),transparent_40%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:auto,42px_42px,42px_42px]" />
      <section className="relative w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <MgLogo size="lg" />
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Dashboard Operacional de Mídia</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#202a3c] bg-[#0d1320]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur md:p-8"
        >
          <div className="mb-7">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck className="h-4 w-4 text-[#e2212d]" />
              Acesso protegido
            </div>
            <p className="text-xs leading-5 text-slate-500">Entre com suas credenciais para acessar os dados de mídia da MG Motors.</p>
          </div>

          <label className="mb-5 block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Usuário</span>
            <Input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Digite seu usuário"
              className="h-11 border-[#283349] bg-[#111a2a] text-sm text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20"
            />
          </label>

          <label className="mb-2 block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Senha</span>
            <span className="relative block">
              <Input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                className="h-11 border-[#283349] bg-[#111a2a] pr-11 text-sm text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-slate-500 transition-colors hover:text-white"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <div className="min-h-8 py-2 text-xs text-red-400" role="alert">
            {login.error ? "Usuário ou senha inválidos. Verifique os dados e tente novamente." : null}
          </div>

          <Button
            type="submit"
            disabled={login.isPending || !username || !password}
            className="h-11 w-full bg-[#e2212d] font-semibold text-white shadow-[0_10px_30px_rgba(226,33,45,0.2)] hover:bg-[#c91622] active:scale-[0.98]"
          >
            {login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
            Entrar no dashboard
          </Button>
        </form>
        <p className="mt-5 text-center text-[11px] text-slate-700">Acesso restrito • Dados conectados ao Windsor.ai</p>
      </section>
    </main>
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
    <article className="group relative overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-transform duration-200 hover:-translate-y-0.5">
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
          <p className="mt-2 text-[22px] font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-[11px] text-slate-600">{subtitle}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/5" style={{ color: accent, backgroundColor: `${accent}12` }}>
          {icon}
        </span>
      </div>
    </article>
  );
}

function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 max-w-full overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] shadow-[0_8px_24px_rgba(0,0,0,0.14)] ${className}`}>
      <header className="flex min-h-16 flex-col items-start justify-between gap-4 border-b border-[#1b2535] px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-[11px] text-slate-600">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ChartTooltip({ active, payload, label, type, locale }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string; type: "currency" | "number" | "percent"; locale: DashboardLocale }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#2a364b] bg-[#0a101b]/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1.5 font-medium text-slate-300">{label ? formatLongDate(label, locale) : ""}</p>
      {payload.map((item, index) => (
        <p key={`${item.name}-${index}`} style={{ color: item.color ?? "#f8fafc" }}>
          {item.name}: <strong>{formatMetric(Number(item.value ?? 0), type, locale)}</strong>
        </p>
      ))}
    </div>
  );
}

function TimeSeriesChart({
  data,
  title,
  subtitle,
  dataKey,
  type,
  color,
  correctionVisible,
  locale,
}: {
  data: DailyPoint[];
  title: string;
  subtitle: string;
  dataKey: "spend" | "conversions" | "cpa";
  type: "currency" | "number";
  color: string;
  correctionVisible: boolean;
  locale: DashboardLocale;
}) {
  const gradientId = `gradient-${dataKey}`;
  return (
    <Panel title={title} subtitle={subtitle} action={correctionVisible ? <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-300">15/07 • {ui(locale, "Correção de Tag", "Tag Fix")}</span> : null}>
      <div className="h-[270px] px-2 pb-3 pt-5">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={value => formatDate(String(value), locale)} stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={48} tickFormatter={value => (type === "currency" ? formatCompactCurrency(Number(value), locale) : formatNumber(Number(value), locale))} />
            <Tooltip content={<ChartTooltip type={type} locale={locale} />} cursor={{ stroke: "#475569", strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey={dataKey} name={title.replace(" Diário", "")} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} activeDot={{ r: 4, fill: color, stroke: "#0d1421", strokeWidth: 2 }} />
            {correctionVisible ? <ReferenceLine x={TAG_CORRECTION_DATE} stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={2.5} label={{ value: ui(locale, "Correção de Tag", "Tag Fix"), position: "insideTopLeft", fill: "#fde68a", fontSize: 10, fontWeight: 700 }} /> : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function GoogleDeviceMixChart({ data, locale }: { data: GoogleDeviceMix; locale: DashboardLocale }) {
  const colors = ["#38bdf8", "#e2212d", "#a78bfa", "#f59e0b", "#10b981"];
  const dominant = data.devices[0];
  const sourceLabel = data.source === "windsor-live"
    ? ui(locale, "Windsor.ai ao vivo", "Windsor.ai live")
    : ui(locale, "Windsor.ai em cache", "Windsor.ai cached");

  return (
    <Panel
      title={ui(locale, "Impressões por Dispositivo", "Impressions by Device")}
      subtitle={ui(locale, "Distribuição real por dispositivo registrada no Google Ads", "Actual device distribution recorded in Google Ads")}
      action={<span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[9px] font-semibold text-sky-300">{sourceLabel}</span>}
    >
      <div className="grid min-h-[310px] xl:grid-cols-[0.75fr_1.25fr]">
        <div className="relative min-h-[270px] border-b border-[#1b2535] p-3 xl:border-b-0 xl:border-r">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.devices} dataKey="impressions" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={3} stroke="none">
                {data.devices.map((item, index) => <Cell key={item.device} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(value, _name, item) => [formatNumber(Number(value), locale), String(item.payload?.label ?? "")] } contentStyle={{ background: "#0a101b", border: "1px solid #2a364b", borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">Impressões</p><p className="mt-1 text-xl font-semibold text-white">{formatNumber(data.totals.impressions, locale)}</p></div>
          </div>
        </div>
        <div className="divide-y divide-[#182231]">
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">{ui(locale, "Dispositivo líder", "Leading device")}</p><p className="mt-1 text-sm font-semibold text-white">{dominant?.label ?? "—"}</p></div>
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">{ui(locale, "Participação", "Share")}</p><p className="mt-1 text-sm font-semibold text-sky-300">{dominant ? `${formatNumber(dominant.impressionShare, locale)}%` : "—"}</p></div>
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">{ui(locale, "Cliques", "Clicks")}</p><p className="mt-1 text-sm font-semibold text-white">{formatNumber(data.totals.clicks, locale)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
            {data.devices.map((item, index) => (
              <div key={item.device} className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-[10px] font-medium text-slate-400"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatNumber(item.impressions, locale)}</p>
                <p className="mt-0.5 text-[10px] text-slate-600">{formatNumber(item.impressionShare, locale)}% {ui(locale, "das impressões", "of impressions")}</p>
              </div>
            ))}
          </div>
          <p className="flex items-start gap-2 border-t border-[#182231] px-4 py-3 text-[10px] leading-5 text-slate-600"><MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />{ui(locale, "Dispositivos observados no período selecionado; sem projeções ou percentuais estimados.", "Devices observed in the selected period; no projections or estimated shares.")}</p>
        </div>
      </div>
    </Panel>
  );
}

function StatusBadge({ status, locale = "pt-BR" }: { status: Campaign["status"]; locale?: DashboardLocale }) {
  const styles = {
    Saudável: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    Atenção: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    Crítico: "border-red-500/20 bg-red-500/10 text-red-400",
  }[status];
  const dot = { Saudável: "bg-emerald-400", Atenção: "bg-amber-300", Crítico: "bg-red-400" }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {localizeStatus(locale, status)}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-52 place-items-center px-6 py-12 text-center">
      <div>
        <Info className="mx-auto h-7 w-7 text-slate-700" />
        <p className="mt-3 text-sm font-medium text-slate-300">{title}</p>
        <p className="mt-1 text-xs text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function OverviewTab({
  data,
  deviceMix,
  correctionVisible,
  locale,
}: {
  data: DashboardData;
  deviceMix?: GoogleDeviceMix;
  correctionVisible: boolean;
  locale: DashboardLocale;
}) {
  const rankingPanels = [
    { title: ui(locale, "Top 10 — Melhor CPA", "Top 10 — Best CPA"), subtitle: ui(locale, "Menor custo por aquisição entre campanhas elegíveis", "Lowest cost per acquisition among eligible campaigns"), rows: data.rankings.best, tone: "emerald" as const },
    { title: ui(locale, "Top 10 — Pior CPA", "Top 10 — Worst CPA"), subtitle: ui(locale, "Maior custo por aquisição entre campanhas elegíveis", "Highest cost per acquisition among eligible campaigns"), rows: data.rankings.worst, tone: "red" as const },
  ];
  const regionStyles: Record<string, string> = {
    Favorável: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    Neutro: "border-slate-500/20 bg-slate-500/10 text-slate-300",
    Desfavorável: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <TimeSeriesChart data={data.daily} title={ui(locale, "Investimento Diário", "Daily Investment")} subtitle={ui(locale, "Distribuição do investimento no período", "Investment distribution over the period")} dataKey="spend" type="currency" color="#e2212d" correctionVisible={correctionVisible} locale={locale} />
        <TimeSeriesChart data={data.daily} title={ui(locale, "Conversões Diárias", "Daily Conversions")} subtitle={ui(locale, "Conversões registradas pelo Google Ads", "Conversions recorded by Google Ads")} dataKey="conversions" type="number" color="#38bdf8" correctionVisible={correctionVisible} locale={locale} />
        <TimeSeriesChart data={data.daily} title={ui(locale, "CPA Diário", "Daily CPA")} subtitle={ui(locale, "Custo por aquisição ao longo do tempo", "Cost per acquisition over time")} dataKey="cpa" type="currency" color="#a78bfa" correctionVisible={correctionVisible} locale={locale} />
      </div>

      {deviceMix?.devices.length ? <GoogleDeviceMixChart data={deviceMix} locale={locale} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {rankingPanels.map(panel => (
          <Panel
            key={panel.title}
            title={panel.title}
            subtitle={panel.subtitle}
            action={<span className="rounded-full border border-[#2b364a] bg-[#111a29] px-2.5 py-1 text-[9px] text-slate-500">{ui(locale, "mín.", "min.")} {formatNumber(data.rankings.criteria.minimumConversions, locale)} {ui(locale, "conversões", "conversions")}</span>}
          >
            {panel.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[690px] text-left text-xs">
                  <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.1em] text-slate-600">
                    <tr><th className="px-4 py-3">#</th><th className="px-3 py-3">{ui(locale, "Campanha", "Campaign")}</th><th className="px-3 py-3">{ui(locale, "Produto", "Product")}</th><th className="px-3 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-3 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-4 py-3 text-right">CPA</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#182231]">
                    {panel.rows.map((campaign, index) => (
                      <tr key={campaign.campaignId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3"><span className={`inline-grid h-6 w-6 place-items-center rounded-md border text-[9px] font-bold ${panel.tone === "emerald" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>{index + 1}</span></td>
                        <td className="max-w-[260px] px-3 py-3" title={`${campaign.campaignId} • ${campaign.campaign}`}><CampaignIdentity name={campaign.campaign} campaignId={campaign.campaignId} /></td>
                        <td className="px-3 py-3 text-slate-500">{campaign.product}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(campaign.conversions, locale)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatCurrency(campaign.spend, locale)}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${panel.tone === "emerald" ? "text-emerald-300" : "text-red-300"}`}>{formatCurrency(campaign.cpa, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title={ui(locale, "Ranking indisponível", "Ranking unavailable")} description={locale === "en-US" ? "The minimum sample was not reached for this period." : data.rankings.criteria.message} />}
          </Panel>
        ))}
      </div>

      {data.rankings.excludedCount > 0 ? (
        <details className="group rounded-xl border border-amber-500/15 bg-amber-500/[0.04]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-xs font-medium text-amber-200 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50">
            <span>{data.rankings.excludedCount} {ui(locale, "campanha(s) excluída(s) dos rankings por amostra insuficiente", "campaign(s) excluded from rankings due to insufficient sample size")}</span>
            <span className="text-[10px] text-amber-400/70 transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="overflow-x-auto border-t border-amber-500/10">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-[#0a101b] text-[9px] uppercase tracking-[0.1em] text-slate-600"><tr><th className="px-5 py-3">{ui(locale, "Campanha", "Campaign")}</th><th className="px-3 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-3 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-5 py-3">{ui(locale, "Motivo", "Reason")}</th></tr></thead>
              <tbody className="divide-y divide-[#182231]">
                {data.rankings.excluded.map(campaign => (
                  <tr key={campaign.campaignId}>
                    <td className="px-5 py-3"><p className="font-medium text-slate-300">{campaign.campaign}</p><p className="mt-0.5 font-mono text-[9px] text-slate-700">ID {campaign.campaignId}</p></td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatCurrency(campaign.spend, locale)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(campaign.conversions, locale)}</td>
                    <td className="px-5 py-3 text-amber-200/80">{locale === "en-US" ? "Insufficient conversions for a reliable comparison." : campaign.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <Panel
        title={ui(locale, "Performance por Produto", "Performance by Product")}
        subtitle={ui(locale, "Investimento, participação, conversões, CTR e CPA por classificação determinística", "Investment, share, conversions, CTR and CPA by deterministic classification")}
        action={data.rankings.excludedCount ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[9px] text-amber-300">{data.rankings.excludedCount} {ui(locale, "fora do ranking por amostra", "excluded due to sample size")}</span> : null}
      >
        <div className="grid xl:grid-cols-[0.9fr_1.1fr]">
          <div className="h-[360px] border-b border-[#1b2535] p-4 xl:border-b-0 xl:border-r">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data.productPerformance} margin={{ top: 4, right: 24, left: 12, bottom: 4 }}>
                <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={value => formatCompactCurrency(Number(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="product" width={104} tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={value => formatCurrency(Number(value), locale)} contentStyle={{ background: "#0a101b", border: "1px solid #2a364b", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="spend" name={ui(locale, "Investimento", "Investment")} fill="#e2212d" radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.1em] text-slate-600">
                <tr><th className="px-5 py-3">{ui(locale, "Produto", "Product")}</th><th className="px-3 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-3 py-3 text-right">{ui(locale, "Participação", "Share")}</th><th className="px-3 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-3 py-3 text-right">CTR</th><th className="px-5 py-3 text-right">CPA</th></tr>
              </thead>
              <tbody className="divide-y divide-[#182231]">
                {data.productPerformance.map(product => (
                  <tr key={product.product} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium text-slate-300">{product.product}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatCurrency(product.spend, locale)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">{formatNumber(product.participation, locale)}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(product.conversions, locale)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(product.ctr, locale)}%</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-300">{formatCurrency(product.cpa, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <Panel title={ui(locale, "Performance por Região", "Performance by Region")} subtitle={`${ui(locale, "Comparação segura com o CPA médio geral de", "Reliable comparison with the overall average CPA of")} ${formatCurrency(data.summary.cpa, locale)} • ${ui(locale, "metas mensais somente quando a região foi identificada", "monthly targets only when the region was identified")}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.1em] text-slate-600">
              <tr><th className="px-5 py-3">{ui(locale, "Região", "Region")}</th><th className="px-3 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-3 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-3 py-3 text-right">CPA</th><th className="px-3 py-3 text-right">{ui(locale, "Desvio vs média", "Variance vs average")}</th><th className="px-3 py-3 text-center">{ui(locale, "Estado", "Status")}</th><th className="px-5 py-3 text-right">{ui(locale, "Meta mensal leads", "Monthly lead target")}</th></tr>
            </thead>
            <tbody className="divide-y divide-[#182231]">
              {data.regionPerformance.map(region => (
                <tr key={region.regionKey} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3"><p className="font-medium text-slate-300">{region.region}</p><p className="mt-0.5 font-mono text-[9px] text-slate-700">{region.regionKey}</p></td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatCurrency(region.spend, locale)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(region.conversions, locale)}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-300">{formatCurrency(region.cpa, locale)}</td>
                  <td className={`px-3 py-3 text-right font-medium tabular-nums ${region.deviation > 0 ? "text-red-300" : region.deviation < 0 ? "text-emerald-300" : "text-slate-400"}`}>{region.deviation >= 0 ? "+" : ""}{formatNumber(region.deviation, locale)}%</td>
                  <td className="px-3 py-3 text-center"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${regionStyles[region.classification]}`}>{localizeStatus(locale, region.classification)}</span></td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-400">{region.monthlyLeadGoal == null ? <span className="italic text-slate-700">{ui(locale, "Não mapeada", "Not mapped")}</span> : formatNumber(region.monthlyLeadGoal, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={ui(locale, "Insights Automáticos", "Automated Insights")}
        subtitle={`${ui(locale, "Classificação dinâmica: atenção a partir de 1,35x e crítico a partir de 2x o CPA médio de", "Dynamic classification: attention from 1.35x and critical from 2x the average CPA of")} ${formatCurrency(data.summary.cpa, locale)}`}
        action={<span className="rounded-full border border-[#2b364a] bg-[#111a29] px-2.5 py-1 text-[10px] text-slate-400">{data.insights.length} {ui(locale, "alertas", "alerts")}</span>}
      >
        {data.insights.length ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {data.insights.map(insight => (
              <article key={`${insight.campaignId}-${insight.severity}`} className={`rounded-lg border p-4 ${insight.severity === "Crítico" ? "border-red-500/20 bg-red-500/[0.06]" : "border-amber-500/20 bg-amber-500/[0.06]"}`}>
                <div className="flex items-center justify-between gap-3"><StatusBadge status={insight.severity} locale={locale} /><span className="text-[10px] text-slate-600">{insight.ratio}x {ui(locale, "média", "average")}</span></div>
                <CampaignIdentity name={insight.campaign} campaignId={insight.campaignId} nameClassName="mt-3 text-xs font-semibold text-slate-200" />
                <p className="mt-2 text-lg font-semibold text-white">{BRL.format(insight.cpa)}</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{locale === "en-US" ? "CPA above the expected range for the selected period." : insight.message}</p>
              </article>
            ))}
          </div>
        ) : <EmptyState title={ui(locale, "Nenhum alerta no período", "No alerts in this period")} description={ui(locale, "As campanhas estão dentro da faixa de CPA esperada.", "Campaigns are within the expected CPA range.")} />}
      </Panel>

      <Panel
        title={ui(locale, "Performance por Campanha Ativa", "Active Campaign Performance")}
        subtitle={ui(
          locale,
          `Somente campanhas ENABLED no Google Ads, ordenadas pelo investimento do período • ${data.metadata.activeCampaignCount} ativas`,
          `Only ENABLED Google Ads campaigns, ordered by investment in the period • ${data.metadata.activeCampaignCount} active`,
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left text-xs">
            <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.1em] text-slate-600">
              <tr><th className="px-5 py-3">{ui(locale, "Saúde", "Health")}</th><th className="px-3 py-3">Google Ads</th><th className="px-3 py-3">{ui(locale, "Campanha", "Campaign")}</th><th className="px-3 py-3">{ui(locale, "Produto", "Product")}</th><th className="px-3 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-3 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-3 py-3 text-right">CPA</th><th className="px-5 py-3 text-right">CTR</th></tr>
            </thead>
            <tbody className="divide-y divide-[#182231]">
              {data.activeCampaigns.slice(0, 15).map(campaign => (
                <tr key={campaign.campaignId} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-5 py-3"><StatusBadge status={campaign.status} locale={locale} /></td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${campaign.googleStatus === "ENABLED" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-slate-500/20 bg-slate-500/10 text-slate-400"}`}>{localizeGoogleStatus(locale, campaign.googleStatus)}</span></td>
                  <td className="max-w-[300px] px-3 py-3" title={`${campaign.campaignId} • ${campaign.campaign}`}><CampaignIdentity name={campaign.campaign} campaignId={campaign.campaignId} /></td>
                  <td className="px-3 py-3 text-slate-500">{campaign.product}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatCurrency(campaign.spend, locale)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(campaign.conversions, locale)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatCurrency(campaign.cpa, locale)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-400">{formatNumber(campaign.ctr, locale)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function NullableMetric({ value, format, locale }: { value: number | null; format: "currency" | "number" | "percent"; locale: DashboardLocale }) {
  if (value == null) return <span className="text-[10px] italic text-slate-700">{localizeUnavailable(locale)}</span>;
  return <>{formatMetric(value, format, locale)}</>;
}

function ComparisonDelta({ value, preference, suffix = "", locale }: { value: number | null; preference: "higher" | "lower" | "contextual"; suffix?: string; locale: DashboardLocale }) {
  if (value == null) return <span className="text-[10px] italic text-slate-700">{localizeUnavailable(locale)}</span>;
  const favorable = preference === "contextual" ? null : preference === "lower" ? value <= 0 : value >= 0;
  const tone = favorable == null ? "border-sky-500/20 bg-sky-500/10 text-sky-300" : favorable ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-red-500/20 bg-red-500/10 text-red-300";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold ${tone}`}>{value >= 0 ? "+" : ""}{formatNumber(value, locale)}%{suffix ? ` ${suffix}` : ""}</span>;
}

function DailyTab({ data, correctionVisible, locale }: { data: DashboardData; correctionVisible: boolean; locale: DashboardLocale }) {
  const [campaignSearch, setCampaignSearch] = useState("");
  const comparison = data.dailyComparison;
  const normalizedSearch = campaignSearch.trim().toLowerCase();
  const filteredCampaigns = comparison.campaigns.filter(item =>
    !normalizedSearch || item.campaign.toLowerCase().includes(normalizedSearch) || item.campaignId.includes(normalizedSearch),
  );
  if (!comparison.referenceDate) return <Panel title={ui(locale, "Acompanhamento Diário", "Daily Tracking")}><EmptyState title={ui(locale, "Dados insuficientes", "Insufficient data")} description={ui(locale, "Não há um dia fechado disponível no período.", "There is no closed day available in this period.")} /></Panel>;

  const cardIcons: Record<string, ReactNode> = {
    investment: <Coins className="h-4 w-4" />,
    conversions: <Target className="h-4 w-4" />,
    cpa: <Gauge className="h-4 w-4" />,
    ctr: <MousePointerClick className="h-4 w-4" />,
    conversionRate: <TrendingUp className="h-4 w-4" />,
    cpc: <CircleDollarSign className="h-4 w-4" />,
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {comparison.cards.map(card => (
          <article key={card.key} className="rounded-xl border border-[#1e293b] bg-[#0d1421] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between text-slate-600"><p className="text-[9px] font-semibold uppercase tracking-[0.12em]">{localizeMetricLabel(locale, card.key, card.label)} D-1</p>{cardIcons[card.key]}</div>
            <p className="mt-2 text-lg font-semibold text-white"><NullableMetric locale={locale} value={card.d1} format={card.format} /></p>
            <div className="mt-2 flex items-center justify-between gap-2"><ComparisonDelta locale={locale} value={card.deltaVsD2} preference={card.preference} suffix="vs D-2" /><span className="text-[9px] text-slate-700">{formatDate(comparison.referenceDate, locale)}</span></div>
          </article>
        ))}
      </div>

      <Panel title={ui(locale, "Acompanhamento Diário — Comparativo", "Daily Tracking — Comparison")} subtitle={`D-1 ${ui(locale, "fechado em", "closed on")} ${formatLongDate(comparison.referenceDate, locale)} • ${ui(locale, "referências e médias independentes", "independent references and averages")}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1140px] text-left text-xs">
            <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.11em] text-slate-600">
              <tr><th className="px-5 py-3">{ui(locale, "Métrica", "Metric")}</th><th className="px-4 py-3 text-right">D-1</th><th className="px-4 py-3 text-right">D-2</th><th className="px-4 py-3 text-center">{ui(locale, "Variação", "Change")}</th><th className="px-4 py-3 text-right">{ui(locale, "7 dias atrás", "7 days ago")}</th><th className="px-4 py-3 text-center">{ui(locale, "Variação 7d", "7d change")}</th><th className="px-4 py-3 text-right">{ui(locale, "Média 7d", "7d average")}</th><th className="px-5 py-3 text-right">{ui(locale, "Média 30d", "30d average")}</th></tr>
            </thead>
            <tbody className="divide-y divide-[#182231]">
              {comparison.table.map(metric => (
                <tr key={metric.key} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3"><p className="font-medium text-slate-300">{localizeMetricLabel(locale, metric.key, metric.label)}</p><p className="mt-0.5 text-[9px] text-slate-700">{formatDate(comparison.referenceDate, locale)}</p></td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-white"><NullableMetric locale={locale} value={metric.d1} format={metric.format} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400"><NullableMetric locale={locale} value={metric.d2} format={metric.format} /></td>
                  <td className="px-4 py-3 text-center"><ComparisonDelta locale={locale} value={metric.deltaVsD2} preference={metric.preference} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400"><NullableMetric locale={locale} value={metric.weekAgo} format={metric.format} /></td>
                  <td className="px-4 py-3 text-center"><ComparisonDelta locale={locale} value={metric.deltaVsWeekAgo} preference={metric.preference} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400"><NullableMetric locale={locale} value={metric.average7d} format={metric.format} /></td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-400"><NullableMetric locale={locale} value={metric.average30d} format={metric.format} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={ui(locale, "Campanhas — Ontem vs Anteontem", "Campaigns — Yesterday vs Previous Day")}
        subtitle={`${ui(locale, "ID e nome exatos", "Exact ID and name")} • ${formatLongDate(comparison.referenceDate, locale)} ${ui(locale, "contra", "vs")} ${comparison.previousDate ? formatLongDate(comparison.previousDate, locale) : localizeUnavailable(locale).toLowerCase()}`}
        action={<span className="hidden rounded-full border border-[#2b364a] bg-[#111a29] px-2.5 py-1 text-[10px] text-slate-400 sm:inline-flex">{filteredCampaigns.length} {ui(locale, "campanhas", "campaigns")}</span>}
      >
        <div className="border-b border-[#1b2535] p-4">
          <label className="relative block w-full max-w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <Input value={campaignSearch} onChange={event => setCampaignSearch(event.target.value)} placeholder={ui(locale, "Buscar por ID ou nome da campanha...", "Search by campaign ID or name...")} className="h-9 border-[#273247] bg-[#101827] pl-9 text-xs text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20" />
          </label>
        </div>
        {filteredCampaigns.length ? (
          <div className="max-h-[720px] overflow-auto">
            <table className="w-full min-w-[1420px] text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.1em] text-slate-600">
                <tr><th className="px-5 py-3">{ui(locale, "Campanha", "Campaign")}</th><th className="px-4 py-3 text-right">{ui(locale, "Orçamento/dia", "Daily budget")}</th><th className="px-4 py-3 text-right">{ui(locale, "Inv. D-1", "Spend D-1")}</th><th className="px-4 py-3 text-right">{ui(locale, "Inv. D-2", "Spend D-2")}</th><th className="px-4 py-3 text-center">{ui(locale, "Var. Inv.", "Spend Chg.")}</th><th className="px-4 py-3 text-right">{ui(locale, "Conv. D-1", "Conv. D-1")}</th><th className="px-4 py-3 text-right">{ui(locale, "Conv. D-2", "Conv. D-2")}</th><th className="px-4 py-3 text-center">{ui(locale, "Var. Conv.", "Conv. Chg.")}</th><th className="px-4 py-3 text-right">CPA D-1</th><th className="px-4 py-3 text-right">CPA D-2</th><th className="px-5 py-3 text-center">{ui(locale, "Var. CPA", "CPA Chg.")}</th></tr>
              </thead>
              <tbody className="divide-y divide-[#182231]">
                {filteredCampaigns.map(campaign => (
                  <tr key={campaign.campaignId} className="hover:bg-white/[0.02]">
                    <td className="max-w-[320px] px-5 py-3" title={`${campaign.campaignId} • ${campaign.campaign}`}><CampaignIdentity name={campaign.campaign} campaignId={campaign.campaignId} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500"><NullableMetric locale={locale} value={campaign.budget} format="currency" /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300"><NullableMetric locale={locale} value={campaign.d1?.investment ?? null} format="currency" /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500"><NullableMetric locale={locale} value={campaign.d2?.investment ?? null} format="currency" /></td>
                    <td className="px-4 py-3 text-center"><ComparisonDelta locale={locale} value={campaign.deltas.investment} preference="contextual" /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300"><NullableMetric locale={locale} value={campaign.d1?.conversions ?? null} format="number" /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500"><NullableMetric locale={locale} value={campaign.d2?.conversions ?? null} format="number" /></td>
                    <td className="px-4 py-3 text-center"><ComparisonDelta locale={locale} value={campaign.deltas.conversions} preference="higher" /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300"><NullableMetric locale={locale} value={campaign.d1?.cpa ?? null} format="currency" /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500"><NullableMetric locale={locale} value={campaign.d2?.cpa ?? null} format="currency" /></td>
                    <td className="px-5 py-3 text-center"><ComparisonDelta locale={locale} value={campaign.deltas.cpa} preference="lower" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={ui(locale, "Nenhuma campanha encontrada", "No campaign found")} description={ui(locale, "Ajuste a busca por ID ou nome da campanha.", "Adjust the search by campaign ID or name.")} />}
      </Panel>

      <Panel title={ui(locale, "Evolução Diária — Investimento e Conversões", "Daily Trend — Investment and Conversions")} subtitle={ui(locale, "Série completa do período selecionado", "Complete series for the selected period")} action={correctionVisible ? <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-300">15/07 • {ui(locale, "Correção de Tag", "Tag Fix")}</span> : null}>
        <div className="h-[340px] px-3 pb-4 pt-5">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.daily} margin={{ top: 15, right: 16, left: 2, bottom: 0 }}>
              <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={value => formatDate(String(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="money" tickFormatter={value => formatCompactCurrency(Number(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={56} />
              <YAxis yAxisId="volume" orientation="right" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<ChartTooltip type="currency" locale={locale} />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar yAxisId="money" dataKey="spend" name={ui(locale, "Investimento", "Investment")} fill="#e2212d" radius={[3, 3, 0, 0]} maxBarSize={26} opacity={0.75} />
              <Line yAxisId="volume" type="monotone" dataKey="conversions" name={ui(locale, "Conversões", "Conversions")} stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              {correctionVisible ? <ReferenceLine yAxisId="money" x={TAG_CORRECTION_DATE} stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={2.5} label={{ value: ui(locale, "Correção de Tag", "Tag Fix"), position: "insideTopLeft", fill: "#fde68a", fontSize: 10, fontWeight: 700 }} /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={ui(locale, "Histórico Diário", "Daily History")} subtitle={ui(locale, "Spend, conversões, CPA, CTR, CPC e cliques por data", "Spend, conversions, CPA, CTR, CPC and clicks by date")}>
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.12em] text-slate-600">
              <tr><th className="px-5 py-3">{ui(locale, "Data", "Date")}</th><th className="px-4 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-4 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-4 py-3 text-right">CPA</th><th className="px-4 py-3 text-right">CTR</th><th className="px-4 py-3 text-right">CPC</th><th className="px-5 py-3 text-right">{ui(locale, "Cliques", "Clicks")}</th></tr>
            </thead>
            <tbody className="divide-y divide-[#182231]">
              {[...data.daily].reverse().map(day => (
                <tr key={day.date} className={day.date === TAG_CORRECTION_DATE ? "bg-amber-500/[0.06]" : "hover:bg-white/[0.02]"}>
                  <td className="px-5 py-3 font-medium text-slate-300">{formatLongDate(day.date, locale)} {day.date === TAG_CORRECTION_DATE ? <span className="ml-2 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">{ui(locale, "Correção de Tag", "Tag Fix")}</span> : null}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{formatCurrency(day.spend, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{formatNumber(day.conversions, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{formatCurrency(day.cpa, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{formatNumber(day.ctr, locale)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{formatCurrency(day.cpc, locale)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">{formatNumber(day.clicks, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function InvestmentTab({ data, correctionVisible, locale }: { data: DashboardData; correctionVisible: boolean; locale: DashboardLocale }) {
  const utils = trpc.useUtils();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const topCampaigns = data.campaigns.slice(0, 15).map(campaign => ({ ...campaign, shortName: campaign.campaign.length > 27 ? `${campaign.campaign.slice(0, 27)}…` : campaign.campaign }));
  const pacing = data.pacing;
  const updateGoal = trpc.dashboard.updateMonthlyBudgetGoal.useMutation({
    onSuccess: async () => {
      setEditingGoal(false);
      await utils.dashboard.getData.invalidate();
    },
  });

  function openGoalEditor() {
    if (!pacing) return;
    setGoalInput(pacing.monthlyGoal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditingGoal(true);
  }

  function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pacing) return;
    const amount = locale === "en-US"
      ? Number(goalInput.replace(/,/g, ""))
      : Number(goalInput.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    updateGoal.mutate({ competencia: pacing.competencia, amount });
  }

  const paceState = !pacing
    ? null
    : pacing.pacePercent > 105
      ? { label: ui(locale, "Acima do ritmo ideal", "Above ideal pace"), className: "border-red-500/20 bg-red-500/10 text-red-300", bar: "bg-red-500" }
      : pacing.pacePercent < 95
        ? { label: ui(locale, "Abaixo do ritmo ideal", "Below ideal pace"), className: "border-amber-500/20 bg-amber-500/10 text-amber-300", bar: "bg-amber-400" }
        : { label: ui(locale, "Dentro do ritmo ideal", "Within ideal pace"), className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300", bar: "bg-emerald-400" };

  return (
    <div className="space-y-4">
      {pacing && paceState ? (
        <>
          <Panel
            title={`${ui(locale, "Pacing Mensal", "Monthly Pacing")} • ${pacing.competencia.split("-").reverse().join("/")}`}
            subtitle={`${ui(locale, "Último dia fechado", "Last closed day")}: ${formatLongDate(pacing.lastClosedDate, locale)} • ${pacing.closedDays} ${ui(locale, "de", "of")} ${pacing.totalDays} ${ui(locale, "dias", "days")}`}
            action={
              <button type="button" onClick={openGoalEditor} className="inline-flex items-center gap-1.5 rounded-md border border-[#344158] bg-[#111a29] px-2.5 py-2 text-[10px] font-semibold text-slate-300 transition-colors hover:border-[#e2212d]/60 hover:text-white active:scale-[0.97]">
                <PencilLine className="h-3.5 w-3.5 text-[#e2212d]" /> {ui(locale, "Editar meta", "Edit target")}
              </button>
            }
          >
            {editingGoal ? (
              <form onSubmit={saveGoal} className="flex flex-col gap-3 border-b border-[#1b2535] bg-[#0a101b]/70 px-5 py-4 sm:flex-row sm:items-end">
                <label className="block flex-1">
                  <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-600">{ui(locale, "Meta mensal de mídia", "Monthly media target")}</span>
                  <Input value={goalInput} onChange={event => setGoalInput(event.target.value)} inputMode="decimal" aria-label={ui(locale, "Meta mensal de mídia", "Monthly media target")} className="h-10 border-[#344158] bg-[#101827] text-sm text-white focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20" autoFocus />
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditingGoal(false)} className="h-10 border-[#344158] bg-transparent text-xs text-slate-400 hover:bg-white/5 hover:text-white">{ui(locale, "Cancelar", "Cancel")}</Button>
                  <Button type="submit" disabled={updateGoal.isPending} className="h-10 bg-[#e2212d] text-xs text-white hover:bg-[#c91622]">{updateGoal.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}{ui(locale, "Salvar meta", "Save target")}</Button>
                </div>
                {updateGoal.error ? <p className="text-[10px] text-red-400">{ui(locale, "Não foi possível atualizar a meta. Tente novamente.", "The target could not be updated. Please try again.")}</p> : null}
              </form>
            ) : null}

            <div className="grid gap-px bg-[#1b2535] sm:grid-cols-2 xl:grid-cols-6">
              {[
                { label: ui(locale, "Meta mensal", "Monthly target"), value: formatCurrency(pacing.monthlyGoal, locale), detail: ui(locale, "configuração persistente", "persistent setting") },
                { label: ui(locale, "Investido", "Invested"), value: formatCurrency(pacing.invested, locale), detail: `${formatNumber(pacing.achievedPercent, locale)}% ${ui(locale, "da meta", "of target")}` },
                { label: ui(locale, "Restante", "Remaining"), value: formatCurrency(pacing.remaining, locale), detail: `${pacing.remainingDays} ${ui(locale, "dias restantes", "days remaining")}` },
                { label: ui(locale, "Projeção", "Projection"), value: formatCurrency(pacing.projected, locale), detail: `${pacing.projectedDifference >= 0 ? "+" : ""}${formatCurrency(pacing.projectedDifference, locale)} ${ui(locale, "vs meta", "vs target")}` },
                { label: ui(locale, "Média real/dia", "Actual average/day"), value: formatCurrency(pacing.averageDaily, locale), detail: `${ui(locale, "ideal", "ideal")} ${formatCurrency(pacing.idealDaily, locale)}` },
                { label: ui(locale, "Ideal restante/dia", "Required remaining/day"), value: formatCurrency(pacing.idealDailyRemaining, locale), detail: `${formatNumber(pacing.pacePercent, locale)}% ${ui(locale, "do ritmo", "of pace")}` },
              ].map(item => (
                <article key={item.label} className="bg-[#0d1421] px-5 py-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-600">{item.label}</p>
                  <p className="mt-2 text-base font-semibold tracking-tight text-white">{item.value}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{item.detail}</p>
                </article>
              ))}
            </div>

            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium text-slate-400">{ui(locale, "Ritmo acumulado contra o ideal até D-1", "Cumulative pace versus ideal through D-1")}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{ui(locale, "100% representa aderência exata ao plano mensal.", "100% represents exact alignment with the monthly plan.")}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paceState.className}`}>{paceState.label} • {formatNumber(pacing.pacePercent, locale)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#172132]">
                <div className={`h-full rounded-full ${paceState.bar}`} style={{ width: `${Math.min(pacing.pacePercent, 100)}%` }} />
              </div>
            </div>
          </Panel>

          <Panel title={ui(locale, "Pacing Mensal Acumulado", "Cumulative Monthly Pacing")} subtitle={ui(locale, "Real, ideal, projeção pelo ritmo observado e meta mensal", "Actual, ideal, observed-pace projection and monthly target")}>
            <div className="h-[360px] px-3 pb-4 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pacing.series} margin={{ top: 15, right: 16, left: 2, bottom: 0 }}>
                  <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={value => formatDate(String(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={22} />
                  <YAxis tickFormatter={value => formatCompactCurrency(Number(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={62} />
                  <Tooltip content={<ChartTooltip type="currency" locale={locale} />} cursor={{ stroke: "#475569", strokeDasharray: "3 3" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="real" name="Real" stroke="#e2212d" strokeWidth={2.5} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="projection" name={ui(locale, "Projeção", "Projection")} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line type="linear" dataKey="monthlyGoal" name={ui(locale, "Meta mensal", "Monthly target")} stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="2 4" dot={false} />
                  {correctionVisible ? <ReferenceLine x={TAG_CORRECTION_DATE} stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={2} label={{ value: ui(locale, "Correção de Tag", "Tag Fix"), position: "insideTopLeft", fill: "#fde68a", fontSize: 10, fontWeight: 700 }} /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title={ui(locale, "Pacing Mensal", "Monthly Pacing")}><EmptyState title={ui(locale, "Meta mensal não configurada", "Monthly target not configured")} description={ui(locale, "Cadastre uma meta de mídia para calcular ritmo, projeção e necessidade diária.", "Set a media target to calculate pace, projection and daily requirement.")} /></Panel>
      )}

      <Panel title={ui(locale, "Investimento por Período", "Investment by Period")} subtitle={ui(locale, "Série diária com referência da correção de tag", "Daily series with tag-fix reference")} action={correctionVisible ? <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-300">15/07 • {ui(locale, "Correção de Tag", "Tag Fix")}</span> : null}>
        <div className="h-[320px] px-3 pb-4 pt-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daily} margin={{ top: 15, right: 16, left: 2, bottom: 0 }}>
              <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={value => formatDate(String(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickFormatter={value => formatCompactCurrency(Number(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
              <Tooltip content={<ChartTooltip type="currency" locale={locale} />} />
              <Bar dataKey="spend" name={ui(locale, "Investimento", "Investment")} fill="#e2212d" radius={[4, 4, 0, 0]} maxBarSize={30} />
              {correctionVisible ? <ReferenceLine x={TAG_CORRECTION_DATE} stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={2.5} label={{ value: ui(locale, "Correção de Tag", "Tag Fix"), position: "insideTopLeft", fill: "#fde68a", fontSize: 10, fontWeight: 700 }} /> : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={ui(locale, "Distribuição de Orçamento — Top 15 Campanhas", "Budget Distribution — Top 15 Campaigns")} subtitle={ui(locale, "Campanhas ordenadas pelo investimento acumulado no período", "Campaigns ordered by cumulative investment in the period")}>
        <div className="h-[520px] px-2 py-5 md:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCampaigns} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={value => formatCompactCurrency(Number(value), locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="shortName" width={188} tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => formatCurrency(value, locale)} contentStyle={{ background: "#0a101b", border: "1px solid #2a364b", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
              <Bar dataKey="spend" name={ui(locale, "Investimento", "Investment")} radius={[0, 4, 4, 0]} maxBarSize={22}>
                {topCampaigns.map(campaign => <Cell key={campaign.campaign} fill={campaign.status === "Crítico" ? "#ef4444" : campaign.status === "Atenção" ? "#f59e0b" : "#10b981"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title={ui(locale, "Detalhamento de Orçamento por Campanha", "Budget Details by Campaign")} subtitle={ui(locale, "Participação, conversões, CPA e eficiência no período", "Share, conversions, CPA and efficiency in the period")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="border-b border-[#1b2535] bg-[#0a101b] text-[9px] uppercase tracking-[0.12em] text-slate-600">
              <tr><th className="px-5 py-3">{ui(locale, "Campanha", "Campaign")}</th><th className="px-4 py-3 text-right">{ui(locale, "Orçamento Diário", "Daily Budget")}</th><th className="px-4 py-3 text-right">{ui(locale, "Investimento", "Investment")}</th><th className="px-4 py-3 text-right">{ui(locale, "% do Total", "% of Total")}</th><th className="px-4 py-3 text-right">{ui(locale, "Conversões", "Conversions")}</th><th className="px-4 py-3 text-right">CPA</th><th className="px-5 py-3">{ui(locale, "Eficiência", "Efficiency")}</th></tr>
            </thead>
            <tbody className="divide-y divide-[#182231]">
              {data.campaigns.map(campaign => (
                <tr key={campaign.campaignId} className="hover:bg-white/[0.02]">
                  <td className="max-w-[320px] px-5 py-3" title={`${campaign.campaignId} • ${campaign.campaign}`}><CampaignIdentity name={campaign.campaign} campaignId={campaign.campaignId} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatCurrency(campaign.budget, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{formatCurrency(campaign.spend, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{data.summary.investment ? formatNumber((campaign.spend / data.summary.investment) * 100, locale) : 0}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{formatNumber(campaign.conversions, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{formatCurrency(campaign.cpa, locale)}</td>
                  <td className="px-5 py-3"><StatusBadge status={campaign.status} locale={locale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function OptimizationsTab({ data, dateFrom, dateTo }: { data: DashboardData; dateFrom: string; dateTo: string }) {
  const utils = trpc.useUtils();
  const workspace = trpc.dashboard.optimizationWorkspace.useQuery(undefined, { refetchOnWindowFocus: false });
  const [taskStatus, setTaskStatus] = useState<TaskStatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [completionNotes, setCompletionNotes] = useState<Record<number, string>>({});
  const [negativeKeywordDrafts, setNegativeKeywordDrafts] = useState<Record<number, string>>({});
  const [completionInputErrors, setCompletionInputErrors] = useState<Record<number, string>>({});

  const invalidateWorkspace = () => utils.dashboard.optimizationWorkspace.invalidate();
  const createAll = trpc.dashboard.createAllOptimizationTasks.useMutation({ onSuccess: invalidateWorkspace });
  const completeTask = trpc.dashboard.completeOptimizationTask.useMutation({
    onSuccess: async () => {
      setCompletionNotes({});
      setNegativeKeywordDrafts({});
      setCompletionInputErrors({});
      await Promise.all([
        invalidateWorkspace(),
        utils.dashboard.negativeKeywordHistory.invalidate(),
      ]);
    },
  });
  const rolloverCycle = trpc.dashboard.rolloverOptimizationCycle.useMutation({
    onSuccess: async () => {
      setTaskStatus("ALL");
      setSearch("");
      await invalidateWorkspace();
    },
  });
  const reopenTask = trpc.dashboard.reopenOptimizationTask.useMutation({
    onSuccess: invalidateWorkspace,
  });

  const actionLabels: Record<string, string> = {
    INCREASE_BUDGET: "Aumentar orçamento",
    SET_TARGET_CPA: "Definir CPA-alvo",
    SWITCH_BIDDING_STRATEGY: "Trocar estratégia de lance",
    REDUCE_WASTE: "Reduzir desperdício",
    IMPROVE_CVR: "Melhorar taxa de conversão",
    REFRESH_CREATIVE: "Renovar criativos",
    IMPROVE_AD_RANK: "Melhorar ranking e relevância",
    AUDIT_MEASUREMENT: "Auditar mensuração",
    VALIDATE_VALUE_STRATEGY: "Validar estratégia por valor",
    REVIEW_BIDDING: "Revisar lances",
  };
  const priorityLabels: Record<OptimizationTask["priority"], string> = {
    CRITICAL: "Crítica",
    HIGH: "Alta",
    MEDIUM: "Média",
    LOW: "Baixa",
  };
  const statusLabels: Record<OptimizationTask["status"], string> = {
    PENDING: "Pendente",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluída",
    REOPENED: "Reaberta",
  };
  const tasks = workspace.data?.tasks ?? [];
  const activeCycle = workspace.data?.activeCycle ?? null;
  const activeTasks = activeCycle ? tasks.filter(task => task.cycleId === activeCycle.id) : [];
  const taskExecutionById = new Map(
    (workspace.data?.taskExecutionEligibility ?? []).map(item => [item.taskId, item] as const),
  );
  const legacyDuplicateTasks = activeTasks.filter(
    task => task.status !== "COMPLETED" && taskExecutionById.get(task.id)?.status === "LEGACY_DUPLICATE",
  );
  const operationalActiveTasks = activeTasks.filter(
    task => task.status === "COMPLETED" || taskExecutionById.get(task.id)?.status !== "LEGACY_DUPLICATE",
  );
  const cooldownTasks = operationalActiveTasks.flatMap(task => {
    const eligibility = taskExecutionById.get(task.id);
    return eligibility?.status === "COOLDOWN" ? [{ task, eligibility }] : [];
  });
  const executableTaskCount = operationalActiveTasks.filter(
    task => task.status !== "COMPLETED" && taskExecutionById.get(task.id)?.eligible !== false,
  ).length;
  const eligibilityBySignature = new Map(
    data.recommendationEligibility.map(item => [item.sourceSignature, item] as const),
  );
  const eligibleRecommendationCount = data.recommendations.filter(
    recommendation => eligibilityBySignature.get(recommendation.sourceSignature)?.eligible !== false,
  ).length;
  const cooldownRecommendations = data.recommendations.flatMap(recommendation => {
    const eligibility = eligibilityBySignature.get(recommendation.sourceSignature);
    return eligibility?.status === "COOLDOWN" ? [{ recommendation, eligibility }] : [];
  });
  const normalized = search.trim().toLowerCase();
  const filteredTasks = operationalActiveTasks.filter(task => {
    const matchesStatus =
      taskStatus === "ALL" ||
      (taskStatus === "PENDING"
        ? task.status === "PENDING" || task.status === "REOPENED"
        : task.status === taskStatus);
    return matchesStatus &&
      (!normalized || task.campaignName.toLowerCase().includes(normalized) || task.campaignId.toLowerCase().includes(normalized));
  });
  const taskCounts = {
    ALL: operationalActiveTasks.length,
    PENDING: operationalActiveTasks.filter(task => task.status === "PENDING" || task.status === "REOPENED").length,
    IN_PROGRESS: operationalActiveTasks.filter(task => task.status === "IN_PROGRESS").length,
    COMPLETED: operationalActiveTasks.filter(task => task.status === "COMPLETED").length,
    REOPENED: operationalActiveTasks.filter(task => task.status === "REOPENED").length,
  };
  const openTaskCount = operationalActiveTasks.filter(task => task.status !== "COMPLETED").length;
  const mutationError =
    createAll.error ??
    completeTask.error ??
    rolloverCycle.error ??
    reopenTask.error;

  function handleCompleteTask(task: OptimizationTask) {
    try {
      const negativeKeywords = parseNegativeKeywordList(negativeKeywordDrafts[task.id] ?? "").map(item => ({
        term: item.term,
        matchType: item.matchType,
      }));
      setCompletionInputErrors(current => ({ ...current, [task.id]: "" }));
      completeTask.mutate({
        taskId: task.id,
        notes: completionNotes[task.id] ?? "",
        negativeKeywords,
        dateFrom,
        dateTo,
      });
    } catch (error) {
      setCompletionInputErrors(current => ({
        ...current,
        [task.id]: error instanceof Error ? error.message : "Revise as palavras-chave negativas informadas.",
      }));
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title={activeCycle ? `${activeCycle.name} — tarefas executáveis` : "Ciclo de otimização — tarefas executáveis"}
        subtitle={activeCycle ? `Iniciado em ${formatLongDate(activeCycle.startDate)} • ciclo ativo` : "Crie uma tarefa recomendada para iniciar automaticamente o primeiro ciclo."}
        action={
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => createAll.mutate({ dateFrom, dateTo })}
              disabled={!eligibleRecommendationCount || createAll.isPending}
              className="h-8 bg-[#e2212d] px-3 text-[10px] hover:bg-[#c91622]"
            >
              {createAll.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              Sincronizar tarefas sugeridas
            </Button>
            <span className="rounded-full border border-[#2b364a] bg-[#111a29] px-2.5 py-1 text-[10px] text-slate-400">{operationalActiveTasks.length} tarefa(s) operacional(is)</span>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300">{eligibleRecommendationCount} recomendação(ões) elegível(is)</span>
            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] text-sky-300">{executableTaskCount} tarefa(s) executável(is)</span>
            {cooldownTasks.length || cooldownRecommendations.length ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-300">{cooldownTasks.length || cooldownRecommendations.length} em observação</span> : null}
            {legacyDuplicateTasks.length ? <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[10px] text-violet-300">{legacyDuplicateTasks.length} duplicata(s) legada(s) consolidada(s)</span> : null}
            {activeCycle ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" size="sm" variant="outline" disabled={rolloverCycle.isPending} className="h-8 max-w-full border-[#e2212d]/30 bg-[#e2212d]/10 px-3 text-[10px] text-[#ff8087] hover:bg-[#e2212d]/15">
                    {rolloverCycle.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />}
                    Gerar novo ciclo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-[#263247] bg-[#0d1522] text-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Gerar o próximo ciclo de otimização?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3 text-slate-400">
                      <span className="block">Esta ação encerrará <strong className="text-white">{activeCycle.name}</strong> e criará o próximo ciclo com rastreabilidade completa.</span>
                      <span className="block rounded-lg border border-[#273247] bg-[#0a111d] p-3 text-[11px] leading-5">
                        <strong className="text-white">{openTaskCount} pendência(s)</strong> serão transferidas com a data de origem preservada. Das <strong className="text-white">{data.recommendations.length} recomendações atuais</strong>, somente as <strong className="text-white">{eligibleRecommendationCount} elegíveis</strong> poderão gerar tarefa; CPA em observação continuará bloqueado até completar sete dias.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-[#2b374b] bg-[#111a29] text-slate-300 hover:bg-[#182338] hover:text-white">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => rolloverCycle.mutate({ dateFrom, dateTo })} className="bg-[#e2212d] text-white hover:bg-[#c91622]">Confirmar novo ciclo</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
      >
        {rolloverCycle.data ? (
          <div className="border-b border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-[10px] text-emerald-300">
            {rolloverCycle.data.newCycle.name} criado: {rolloverCycle.data.transferredCount} pendência(s) transferida(s) e {rolloverCycle.data.recommendationCreatedCount} nova(s) tarefa(s) sugerida(s).
          </div>
        ) : null}
        {cooldownTasks.length || cooldownRecommendations.length ? (
          <div className="border-b border-amber-500/15 bg-amber-500/[0.04] p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
              <Clock3 className="h-3.5 w-3.5" /> CPA em observação — janela mínima de 7 dias
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {cooldownTasks.map(({ task, eligibility }) => (
                <div key={`task-cooldown-${task.id}`} className="rounded-lg border border-amber-500/15 bg-[#0b121e] px-3 py-2.5">
                  <CampaignIdentity name={task.campaignName} campaignId={task.campaignId} nameClassName="text-[10px] font-semibold text-slate-200" idClassName="mt-0.5" />
                  <p className="mt-2 text-[9px] leading-4 text-amber-200/75">
                    Tarefa canônica <strong className="text-amber-300">#{task.id}</strong>: faltam <strong className="text-amber-300">{eligibility.daysRemaining} dia(s)</strong>. Execução liberada em <strong className="text-amber-300">{eligibility.nextEligibleAt ? formatLongDate(new Date(eligibility.nextEligibleAt).toISOString().slice(0, 10)) : "data indisponível"}</strong>.
                  </p>
                  {eligibility.duplicateCount ? <p className="mt-1 text-[9px] leading-4 text-violet-300/75">{eligibility.duplicateCount} variação(ões) legada(s) preservada(s) no Histórico e consolidada(s) neste card.</p> : null}
                  <p className="mt-1 text-[9px] leading-4 text-slate-600">{eligibility.reason}</p>
                </div>
              ))}
              {cooldownRecommendations.map(({ recommendation, eligibility }) => (
                <div key={recommendation.sourceSignature} className="rounded-lg border border-amber-500/15 bg-[#0b121e] px-3 py-2.5">
                  <CampaignIdentity name={recommendation.campaign} campaignId={recommendation.campaignId} nameClassName="text-[10px] font-semibold text-slate-200" idClassName="mt-0.5" />
                  <p className="mt-2 text-[9px] leading-4 text-amber-200/75">
                    Faltam <strong className="text-amber-300">{eligibility.daysRemaining} dia(s)</strong>. Nova análise elegível em <strong className="text-amber-300">{eligibility.nextEligibleAt ? formatLongDate(new Date(eligibility.nextEligibleAt).toISOString().slice(0, 10)) : "data indisponível"}</strong>.
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-slate-600">{eligibility.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="border-b border-[#1b2535] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as TaskStatusFilter[]).map(item => (
                <button key={item} type="button" onClick={() => setTaskStatus(item)} className={`rounded-md border px-3 py-2 text-[10px] font-medium transition-all active:scale-[0.97] ${taskStatus === item ? "border-[#e2212d] bg-[#e2212d] text-white" : "border-[#273247] bg-[#111927] text-slate-400 hover:border-[#3a465c] hover:text-white"}`}>
                  {item === "ALL" ? "Todas" : statusLabels[item]} <span className="ml-1 opacity-60">{taskCounts[item]}</span>
                </button>
              ))}
            </div>
            <label className="relative block w-full xl:w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por ID ou campanha..." className="h-9 border-[#273247] bg-[#101827] pl-9 text-xs text-white placeholder:text-slate-600 focus-visible:border-[#e2212d] focus-visible:ring-[#e2212d]/20" />
            </label>
          </div>
        </div>

        {workspace.isLoading ? (
          <div className="grid min-h-[220px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#e2212d]" /></div>
        ) : workspace.error ? (
          <EmptyState title="Não foi possível carregar as tarefas" description={workspace.error.message} />
        ) : filteredTasks.length ? (
          <div className="grid gap-3 p-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredTasks.map(task => {
              const notes = completionNotes[task.id] ?? "";
              const negativeKeywordDraft = negativeKeywordDrafts[task.id] ?? "";
              const completionInputError = completionInputErrors[task.id] ?? "";
              const canRecordNegativeKeywords = task.actionType === "REDUCE_WASTE" || task.steps.some(step => /negativ/i.test(step));
              const evidence = task.evidence as Record<string, number | string | boolean | null>;
              const hasDecisionModel = Boolean(
                evidence.parameterLabel || evidence.currentStrategy || evidence.recommendedTargetCpa || evidence.recommendedDailyBudget,
              );
              const currentStrategy = String(evidence.currentStrategyLabel ?? evidence.currentStrategy ?? "Indisponível");
              const recommendedStrategy = String(evidence.recommendedStrategyLabel ?? evidence.recommendedStrategy ?? currentStrategy);
              const currentCpa = typeof evidence.currentCpa === "number" ? evidence.currentCpa : Number(evidence.cpa ?? 0);
              const targetCpa = typeof evidence.recommendedTargetCpa === "number" ? evidence.recommendedTargetCpa : null;
              const currentBudget = typeof evidence.currentDailyBudget === "number" ? evidence.currentDailyBudget : Number(evidence.dailyBudget ?? 0);
              const targetBudget = typeof evidence.recommendedDailyBudget === "number" ? evidence.recommendedDailyBudget : null;
              const executionEligibility = taskExecutionById.get(task.id);
              const isTaskQuarantined = executionEligibility?.eligible === false;
              const sourceTask = task.sourceTaskId ? tasks.find(item => item.id === task.sourceTaskId) : null;
              const sourceCycle = sourceTask
                ? workspace.data?.cycles.find(cycle => cycle.id === sourceTask.cycleId)
                : null;
              return (
                <article key={task.id} className={`min-w-0 max-w-full overflow-hidden rounded-xl border bg-[#0b121e] p-4 ${isTaskQuarantined ? "border-amber-500/30" : "border-[#202b3d]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#2b374b] bg-[#111a29] px-2 py-1 text-[9px] text-slate-400">#{task.id}</span>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${task.status === "COMPLETED" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : task.status === "IN_PROGRESS" ? "border-sky-500/25 bg-sky-500/10 text-sky-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>{statusLabels[task.status]}</span>
                        {executionEligibility?.status === "COOLDOWN" ? (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-300">Em observação</span>
                        ) : null}
                        {task.sourceTaskId ? (
                          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[9px] font-medium text-violet-300">
                            {task.status === "REOPENED" ? "Reaberta" : "Transferida"} • origem #{task.sourceTaskId}{sourceCycle ? ` (${sourceCycle.name})` : ""}
                          </span>
                        ) : null}
                        <span className="text-[9px] font-semibold text-slate-500">Prioridade {priorityLabels[task.priority]}</span>
                      </div>
                      <p className="mt-3 break-words text-xs font-semibold text-white [overflow-wrap:anywhere]" title={task.campaignName}>{task.campaignName}</p>
                      <p className="mt-1 font-mono text-[9px] text-slate-700">ID {task.campaignId}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-[#f45b65]">{actionLabels[task.actionType] ?? task.actionType}</span>
                  </div>
                  {executionEligibility?.status === "COOLDOWN" ? (
                    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
                      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-300"><Clock3 className="h-3.5 w-3.5" /> Quarentena de CPA</div>
                      <p className="mt-2 text-[10px] leading-5 text-amber-100/80">Faltam <strong className="text-amber-300">{executionEligibility.daysRemaining} dia(s)</strong>. Esta tarefa só poderá ser executada em <strong className="text-amber-300">{executionEligibility.nextEligibleAt ? formatLongDate(new Date(executionEligibility.nextEligibleAt).toISOString().slice(0, 10)) : "data indisponível"}</strong>.</p>
                      {executionEligibility.duplicateCount ? <p className="mt-1 text-[9px] leading-4 text-violet-300/75">{executionEligibility.duplicateCount} variação(ões) legada(s) foram consolidadas neste card sem apagar o histórico.</p> : null}
                    </div>
                  ) : null}
                  <p className="mt-3 text-[11px] leading-5 text-slate-400">{task.description}</p>
                  <p className="mt-2 text-[10px] leading-5 text-slate-600"><strong className="text-slate-400">Motivo da otimização:</strong> {task.rationale}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#080e18] p-3 text-center">
                    <div><p className="text-[8px] uppercase text-slate-700">Investimento</p><p className="mt-1 text-[10px] text-slate-300">{BRL.format(Number(evidence.spend ?? 0))}</p></div>
                    <div><p className="text-[8px] uppercase text-slate-700">Conversões</p><p className="mt-1 text-[10px] text-slate-300">{NUMBER.format(Number(evidence.conversions ?? 0))}</p></div>
                    <div><p className="text-[8px] uppercase text-slate-700">CPA atual</p><p className="mt-1 text-[10px] text-slate-300">{BRL.format(currentCpa)}</p></div>
                  </div>
                  {hasDecisionModel ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-sky-500/15 bg-sky-500/[0.05] p-3">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-sky-300">Alteração recomendada</p>
                      <p className="break-words text-[10px] font-semibold text-white [overflow-wrap:anywhere]">{String(evidence.parameterLabel ?? actionLabels[task.actionType] ?? task.actionType)}</p>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-[#080e18] p-2">
                        <div className="min-w-0"><p className="text-[8px] uppercase text-slate-700">Atual</p><p className="mt-1 break-words text-[10px] text-slate-300 [overflow-wrap:anywhere]">{formatOptimizationValue(evidence.currentValue, evidence.parameterFormat)}</p></div>
                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                        <div className="min-w-0 text-right"><p className="text-[8px] uppercase text-slate-700">Recomendado</p><p className="mt-1 break-words text-[10px] font-semibold text-sky-200 [overflow-wrap:anywhere]">{formatOptimizationValue(evidence.recommendedValue, evidence.parameterFormat)}</p></div>
                      </div>
                      <div className="space-y-2 text-[9px] leading-4 text-slate-500">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md bg-[#080e18] p-2"><p className="text-[8px] uppercase text-slate-700">Estratégia atual</p><p className="mt-1 break-words font-semibold text-slate-300 [overflow-wrap:anywhere]">{currentStrategy}</p></div>
                          <div className="rounded-md bg-[#080e18] p-2"><p className="text-[8px] uppercase text-slate-700">Estratégia recomendada</p><p className="mt-1 break-words font-semibold text-sky-200 [overflow-wrap:anywhere]">{recommendedStrategy}</p></div>
                          <div className="rounded-md bg-[#080e18] p-2"><p className="text-[8px] uppercase text-slate-700">CPA atual</p><p className="mt-1 font-semibold text-slate-300">{BRL.format(currentCpa)}</p></div>
                          <div className="rounded-md bg-[#080e18] p-2"><p className="text-[8px] uppercase text-slate-700">CPA-alvo sugerido</p><p className="mt-1 font-semibold text-sky-200">{targetCpa == null ? "Não alterar nesta etapa" : BRL.format(targetCpa)}</p></div>
                        </div>
                        <p><strong className="text-slate-300">Orçamento diário:</strong> {BRL.format(currentBudget)} <span className="text-sky-400">→</span> {targetBudget == null ? "sem alteração" : BRL.format(targetBudget)}</p>
                      </div>
                    </div>
                  ) : null}
                  <details className="mt-3 rounded-lg border border-[#1b2637] bg-[#0a111d]"><summary className="cursor-pointer px-3 py-2 text-[10px] text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-[#e2212d]/40">Ver evidências, impacto, risco e passo a passo</summary><div className="space-y-3 border-t border-[#1b2637] p-3 text-[10px] leading-5 text-slate-500"><p><strong className="text-emerald-300">Impacto esperado:</strong> {task.expectedImpact}</p><p><strong className="text-amber-300">Risco e critério de parada:</strong> {task.risk}</p><ol className="list-decimal space-y-1 pl-4">{task.steps.map(step => <li key={step}>{step}</li>)}</ol></div></details>

                  {task.status !== "COMPLETED" ? isTaskQuarantined ? (
                    <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3 text-[10px] leading-5 text-amber-100/75">
                      <div className="flex items-center gap-2 font-semibold text-amber-300"><Clock3 className="h-4 w-4" /> Execução temporariamente bloqueada</div>
                      <p className="mt-1">O dashboard preserva a tarefa para auditoria, mas não permite uma nova alteração de CPA antes de completar sete dias da última otimização concluída.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3 border-t border-[#1b2637] pt-4">
                      <textarea value={notes} onChange={event => setCompletionNotes(current => ({ ...current, [task.id]: event.target.value }))} placeholder="Comentário opcional: registre uma observação somente se houver contexto adicional..." rows={2} className="w-full resize-y rounded-md border border-[#273247] bg-[#101827] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-[#e2212d] focus:ring-2 focus:ring-[#e2212d]/20" />
                      <p className="text-[10px] leading-4 text-slate-600">Você pode concluir sem preencher este campo.</p>
                      {canRecordNegativeKeywords ? (
                        <div className="rounded-lg border border-violet-500/15 bg-violet-500/[0.04] p-3">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-300" htmlFor={`negative-keywords-${task.id}`}>Negativas aplicadas</label>
                          <textarea id={`negative-keywords-${task.id}`} value={negativeKeywordDraft} onChange={event => {
                            setNegativeKeywordDrafts(current => ({ ...current, [task.id]: event.target.value }));
                            setCompletionInputErrors(current => ({ ...current, [task.id]: "" }));
                          }} placeholder={'Uma por linha. Ex.:\ntermo amplo\n"correspondência de frase"\n[correspondência exata]'} rows={4} className="mt-2 w-full resize-y rounded-md border border-[#273247] bg-[#101827] px-3 py-2 font-mono text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" />
                          <p className="mt-2 text-[9px] leading-4 text-slate-600">Informe somente os termos que você realmente adicionou no Google Ads. O dashboard guarda campanha, data, tipo de correspondência e responsável; não é necessário gerar outro relatório.</p>
                          {completionInputError ? <p className="mt-2 text-[9px] text-red-300">{completionInputError}</p> : null}
                        </div>
                      ) : null}
                      <Button type="button" size="sm" onClick={() => handleCompleteTask(task)} disabled={completeTask.isPending} className="h-9 w-full bg-emerald-600 text-[10px] hover:bg-emerald-500"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Concluir e registrar snapshot</Button>
                      <p className="text-[9px] leading-4 text-slate-600">Comentário e negativas são opcionais; usuário, horário e snapshot serão registrados automaticamente.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2 text-[10px] text-emerald-300"><CheckCircle2 className="h-4 w-4" />Concluída por {workspace.data?.completions.find(item => item.taskId === task.id)?.completedBy ?? "usuário autenticado"}</div>
                      <Button type="button" size="sm" variant="outline" onClick={() => reopenTask.mutate({ taskId: task.id, dateFrom, dateTo })} disabled={reopenTask.isPending} className="h-9 w-full border-violet-500/20 bg-violet-500/10 text-[10px] text-violet-300 hover:bg-violet-500/15">
                        {reopenTask.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}Reabrir no ciclo ativo
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title={activeCycle ? "Nenhuma tarefa neste filtro" : "Nenhum ciclo ativo"} description={activeCycle ? "Ajuste o status ou a busca." : "Crie uma tarefa a partir de uma recomendação para iniciar o ciclo."} />
        )}
      </Panel>

      {completeTask.data?.negativeKeywordsRecorded ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">{completeTask.data.negativeKeywordsRecorded} palavra(s)-chave negativa(s) registrada(s) no histórico operacional.</div> : null}
      {mutationError ? <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-300">{mutationError.message}</div> : null}
    </div>
  );
}

function DashboardScreen({ session }: { session: DashboardSession }) {
  const utils = trpc.useUtils();
  const { locale, permissions } = session;
  const leadsReadOnly = isMgSalesReadOnlyUsername(session.username);
  const initialRoute = useMemo(getRouteFromUrl, []);
  const accessibleModules = useMemo(
    () => dashboardModules.filter(module => permissions[module.permission]),
    [permissions],
  );
  const accessibleGoogleTabs = useMemo(
    () => googleAdsTabs.filter(tab => !tab.permission || permissions[tab.permission]),
    [permissions],
  );
  const initialModule = accessibleModules.some(module => module.id === initialRoute.module)
    ? initialRoute.module
    : (accessibleModules[0]?.id ?? "google-ads");
  const initialGoogleTab = accessibleGoogleTabs.some(tab => tab.id === initialRoute.googleTab)
    ? initialRoute.googleTab
    : (accessibleGoogleTabs[0]?.id ?? "overview");
  const [activeModule, setActiveModule] = useState<DashboardModuleId>(initialModule);
  const [activeGoogleTab, setActiveGoogleTab] = useState<GoogleAdsTabId>(initialGoogleTab);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const handleUpdatedAt = useCallback((candidate: string) => {
    setLastUpdatedAt(current => preserveLastSuccessfulUpdate(current, candidate));
  }, []);
  const [googlePreset, setGooglePreset] = useState("30d");
  const [googleDateFrom, setGoogleDateFrom] = useState(isoDateFromEnd(30));
  const [googleDateTo, setGoogleDateTo] = useState(DATA_END);
  const [leadsPreset, setLeadsPreset] = useState("month");
  const [leadsDateFrom, setLeadsDateFrom] = useState(LEAD_MONTH_DEFAULT_START);
  const [leadsDateTo, setLeadsDateTo] = useState(DATA_END);
  const [leadsRangeInitialized, setLeadsRangeInitialized] = useState(false);
  const dateFromInputRef = useRef<HTMLInputElement>(null);
  const dateToInputRef = useRef<HTMLInputElement>(null);
  const logout = trpc.dashboardAuth.logout.useMutation({
    onSuccess: async () => {
      await utils.dashboardAuth.session.invalidate();
      utils.dashboard.getData.reset();
      utils.dashboard.deviceMix.reset();
      utils.metaAds.data.reset();
      utils.metaAds.bounds.reset();
      utils.tiktokAds.data.reset();
      utils.tiktokAds.bounds.reset();
      utils.socialOrganic.data.reset();
      utils.socialOrganic.bounds.reset();
      utils.leads.analytics.reset();
      utils.leads.bounds.reset();
      utils.leads.importHistory.reset();
      utils.accessHistory.list.reset();
    },
  });
  const googleQueryInput = useMemo(
    () => ({ dateFrom: googleDateFrom, dateTo: googleDateTo }),
    [googleDateFrom, googleDateTo],
  );
  const dashboard = trpc.dashboard.getData.useQuery(googleQueryInput, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: activeModule === "google-ads" && permissions.canAccessGoogleAds,
  });
  const googleDeviceMix = trpc.dashboard.deviceMix.useQuery(googleQueryInput, {
    retry: 1,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: activeModule === "google-ads" && activeGoogleTab === "overview" && permissions.canAccessGoogleAds,
  });
  const leadsBounds = trpc.leads.bounds.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: activeModule === "leads" && permissions.canAccessLeads,
  });

  useEffect(() => {
    if (dashboard.data?.metadata.updatedAt) handleUpdatedAt(dashboard.data.metadata.updatedAt);
  }, [dashboard.data?.metadata.updatedAt, handleUpdatedAt]);

  useEffect(() => {
    if (leadsRangeInitialized || !leadsBounds.data?.dateFrom || !leadsBounds.data.dateTo) return;
    const range = resolveLeadMonthRange(leadsBounds.data.dateFrom, leadsBounds.data.dateTo);
    setLeadsDateFrom(range.dateFrom);
    setLeadsDateTo(range.dateTo);
    setLeadsPreset("month");
    setLeadsRangeInitialized(true);
  }, [leadsBounds.data, leadsRangeInitialized]);

  function replaceDashboardUrl(module: DashboardModuleId, googleTab: GoogleAdsTabId) {
    if (typeof window === "undefined") return;
    const search = buildDashboardSearch(window.location.search, module, googleTab);
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }

  function selectModule(module: DashboardModuleId) {
    if (!accessibleModules.some(item => item.id === module)) return;
    setActiveModule(module);
    replaceDashboardUrl(module, activeGoogleTab);
  }

  function selectGoogleTab(tab: GoogleAdsTabId) {
    if (!accessibleGoogleTabs.some(item => item.id === tab)) return;
    setActiveGoogleTab(tab);
    setActiveModule("google-ads");
    replaceDashboardUrl("google-ads", tab);
  }

  function applyGooglePreset(preset: string) {
    setGooglePreset(preset);
    setGoogleDateTo(DATA_END);
    if (preset === "month") setGoogleDateFrom(`${DATA_END.slice(0, 7)}-01`);
    else setGoogleDateFrom(isoDateFromEnd(Number.parseInt(preset, 10)));
  }

  function applyLeadsPreset(preset: string) {
    const dataEnd = leadsBounds.data?.dateTo ?? DATA_END;
    const dataStart = leadsBounds.data?.dateFrom ?? `${dataEnd.slice(0, 7)}-01`;
    setLeadsPreset(preset);
    setLeadsDateTo(dataEnd);
    if (preset === "month") {
      const range = resolveLeadMonthRange(dataStart, dataEnd);
      setLeadsDateFrom(range.dateFrom);
      setLeadsDateTo(range.dateTo);
      return;
    }
    const from = isoDateFromDateEnd(dataEnd, Number.parseInt(preset, 10));
    setLeadsDateFrom(from < dataStart ? dataStart : from);
  }

  function updateGoogleDateFrom(value: string) {
    if (!value || value > googleDateTo) return;
    setGooglePreset("custom");
    setGoogleDateFrom(value);
  }

  function updateGoogleDateTo(value: string) {
    if (!value || value < googleDateFrom || value > DATA_END) return;
    setGooglePreset("custom");
    setGoogleDateTo(value);
  }

  function updateLeadsDateFrom(value: string) {
    if (!isValidLeadDateRange(value, leadsDateTo, leadsBounds.data?.dateFrom ?? undefined, leadsBounds.data?.dateTo ?? DATA_END)) return;
    setLeadsPreset("custom");
    setLeadsDateFrom(value);
  }

  function updateLeadsDateTo(value: string) {
    if (!isValidLeadDateRange(leadsDateFrom, value, leadsBounds.data?.dateFrom ?? undefined, leadsBounds.data?.dateTo ?? DATA_END)) return;
    setLeadsPreset("custom");
    setLeadsDateTo(value);
  }

  const data = dashboard.data;
  const isGoogleAds = activeModule === "google-ads";
  const isLeads = activeModule === "leads";
  const correctionVisible = googleDateFrom <= TAG_CORRECTION_DATE && googleDateTo >= TAG_CORRECTION_DATE;
  const activeDateFrom = isLeads ? leadsDateFrom : googleDateFrom;
  const activeDateTo = isLeads ? leadsDateTo : googleDateTo;
  const activePreset = isLeads ? leadsPreset : googlePreset;
  const leadMaxDate = leadsBounds.data?.dateTo ?? DATA_END;
  const leadMinDate = leadsBounds.data?.dateFrom ?? undefined;
  const copy = locale === "en-US"
    ? {
        dashboard: "Operations Dashboard",
        activeAccess: "Active access",
        signOut: "Sign out",
        lastUpdated: DASHBOARD_UPDATE_COPY["en-US"].label,
        waitingUpdate: DASHBOARD_UPDATE_COPY["en-US"].waiting,
      }
    : {
        dashboard: "Dashboard Operacional",
        activeAccess: "Acesso ativo",
        signOut: "Sair",
        lastUpdated: DASHBOARD_UPDATE_COPY["pt-BR"].label,
        waitingUpdate: DASHBOARD_UPDATE_COPY["pt-BR"].waiting,
      };
  const formattedLastUpdated = formatDashboardUpdatedAt(lastUpdatedAt, locale);
  const metricCards = data
    ? [
        { title: ui(locale, "Investimento Total", "Total Investment"), value: formatCurrency(data.summary.investment, locale), subtitle: `Google Ads • ${ui(locale, "período", "period")}`, icon: <Coins className="h-4 w-4" />, accent: "#e2212d" },
        { title: ui(locale, "Conversões", "Conversions"), value: formatNumber(data.summary.conversions, locale), subtitle: ui(locale, "Ações registradas", "Recorded actions"), icon: <Target className="h-4 w-4" />, accent: "#38bdf8" },
        { title: ui(locale, "CPA Médio", "Average CPA"), value: formatCurrency(data.summary.cpa, locale), subtitle: ui(locale, "Investimento ÷ conversões", "Investment ÷ conversions"), icon: <Gauge className="h-4 w-4" />, accent: "#a78bfa" },
        { title: "CTR", value: `${formatNumber(data.summary.ctr, locale)}%`, subtitle: `${formatNumber(data.summary.clicks, locale)} ${ui(locale, "cliques", "clicks")}`, icon: <MousePointerClick className="h-4 w-4" />, accent: "#f59e0b" },
        { title: ui(locale, "Taxa de Conversão", "Conversion Rate"), value: `${formatNumber(data.summary.conversionRate, locale)}%`, subtitle: ui(locale, "Conversões ÷ cliques", "Conversions ÷ clicks"), icon: <TrendingUp className="h-4 w-4" />, accent: "#10b981" },
        { title: ui(locale, "CPC Médio", "Average CPC"), value: formatCurrency(data.summary.cpc, locale), subtitle: `${formatNumber(data.summary.impressions, locale)} ${ui(locale, "impressões", "impressions")}`, icon: <CircleDollarSign className="h-4 w-4" />, accent: "#60a5fa" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#080c15] text-slate-100">
      <div className="sticky top-0 z-40 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
        <header className="border-b border-[#1d2737] bg-[#0a0f1a]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <MgLogo size="sm" />
                  <span className="hidden h-5 w-px bg-[#263044] sm:block" />
                  <p className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 sm:block">{copy.dashboard}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending} className="border-[#283349] bg-[#111827] text-slate-400 hover:bg-[#182236] hover:text-white lg:hidden">
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>

              <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[#242f42] bg-[#0d1421] p-1" aria-label={ui(locale, "Módulos do dashboard", "Dashboard modules")}>
                {accessibleModules.map(module => {
                  const Icon = module.icon;
                  const isActive = activeModule === module.id;
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => selectModule(module.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold transition-all active:scale-[0.97] ${isActive ? "bg-[#e2212d] text-white shadow-[0_8px_20px_rgba(226,33,45,0.18)]" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {module.labels[locale]}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="hidden items-center gap-3 border-l border-[#263146] pl-4 lg:flex">
              <div className="text-right">
                <p className="text-[11px] font-medium text-slate-300">{session.displayName}</p>
                <p className="text-[9px] text-emerald-500">{copy.activeAccess}</p>
                <p className="mt-0.5 text-[9px] text-slate-600">{copy.lastUpdated}: {formattedLastUpdated}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending} className="h-8 border-[#283349] bg-[#111827] px-3 text-[10px] text-slate-400 hover:bg-[#182236] hover:text-white"><LogOut className="mr-1.5 h-3.5 w-3.5" />{copy.signOut}</Button>
            </div>
          </div>
        </header>

        {isGoogleAds ? (
          <div className="border-b border-amber-500/20 bg-[#20170a]/95 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1680px] items-start gap-3 px-4 py-2.5 lg:px-6">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-5 text-amber-100/75"><strong className="font-semibold text-amber-300">{ui(locale, "Correção de Tag Google — 15/07/2026:", "Google Tag Fix — 07/15/2026:")}</strong> {ui(locale, "os dados de conversão anteriores a esta data podem estar subestimados. A marcação aparece em todas as séries temporais para orientar a leitura do histórico.", "conversion data before this date may be understated. The marker appears in every time series to guide historical analysis.")}</p>
            </div>
          </div>
        ) : null}
      </div>

      {activeModule === "access-history" ? <AccessHistoryTab locale={locale} /> : activeModule === "meta-ads" ? <MetaAdsDashboard locale={locale} onUpdatedAt={handleUpdatedAt} /> : activeModule === "tiktok-ads" ? <TikTokAdsDashboard locale={locale} onUpdatedAt={handleUpdatedAt} /> : activeModule === "social-organic" ? <SocialOrganicDashboard locale={locale} onUpdatedAt={handleUpdatedAt} /> : activeModule === "media-plan" ? <MediaPlanDashboard locale={locale} onUpdatedAt={handleUpdatedAt} /> : (
        <main className="mx-auto max-w-[1680px] px-4 pb-12 pt-5 lg:px-6">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e2212d]">{isLeads ? <UsersRound className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}{isLeads ? ui(locale, "Base Comercial", "Sales Database") : "Google Ads"}</div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">{isLeads ? ui(locale, "Gestão e Auditoria de Leads", "Lead Management and Audit") : ui(locale, "Performance de Mídia", "Media Performance")}</h1>
              <p className="mt-1 text-[11px] text-slate-600">MG Motors • {formatLongDate(activeDateFrom, locale)} {ui(locale, "a", "to")} {formatLongDate(activeDateTo, locale)} • {ui(locale, "Corte D-1", "D-1 cutoff")}: {formatLongDate(DATA_END, locale)}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[#242f42] bg-[#0d1421] p-1" aria-label={`${ui(locale, "Atalhos de período de", "Period shortcuts for")} ${isLeads ? "Leads" : "Google Ads"}`}>
                {["7d", "14d", "30d", "60d"].map(preset => (
                  <button key={preset} type="button" onClick={() => isLeads ? applyLeadsPreset(preset) : applyGooglePreset(preset)} className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${activePreset === preset ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}>{preset}</button>
                ))}
                <button type="button" onClick={() => isLeads ? applyLeadsPreset("month") : applyGooglePreset("month")} className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${activePreset === "month" ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}>{ui(locale, "Mês", "Month")}</button>
              </div>

              <div className="flex items-stretch rounded-lg border border-[#242f42] bg-[#0d1421]">
                <div
                  className="flex cursor-pointer items-center gap-2 rounded-l-lg px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
                  onClick={() => openNativeDatePicker(dateFromInputRef.current)}
                >
                  <CalendarDays className="pointer-events-none h-3.5 w-3.5 shrink-0 text-slate-600" />
                  <input
                    ref={dateFromInputRef}
                    aria-label={isLeads ? ui(locale, "Data inicial de Leads", "Leads start date") : ui(locale, "Data inicial de Google Ads", "Google Ads start date")}
                    type="date"
                    min={isLeads ? leadMinDate : undefined}
                    max={activeDateTo}
                    value={activeDateFrom}
                    onChange={event => isLeads ? updateLeadsDateFrom(event.target.value) : updateGoogleDateFrom(event.target.value)}
                    className="min-w-0 w-[116px] cursor-pointer bg-transparent text-[10px] text-slate-300 outline-none [color-scheme:dark]"
                  />
                </div>
                <span className="flex items-center text-slate-700">—</span>
                <div
                  className="flex cursor-pointer items-center rounded-r-lg px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
                  onClick={() => openNativeDatePicker(dateToInputRef.current)}
                >
                  <input
                    ref={dateToInputRef}
                    aria-label={isLeads ? ui(locale, "Data final de Leads", "Leads end date") : ui(locale, "Data final de Google Ads", "Google Ads end date")}
                    type="date"
                    min={activeDateFrom}
                    max={isLeads ? leadMaxDate : DATA_END}
                    value={activeDateTo}
                    onChange={event => isLeads ? updateLeadsDateTo(event.target.value) : updateGoogleDateTo(event.target.value)}
                    className="min-w-0 w-[116px] cursor-pointer bg-transparent text-[10px] text-slate-300 outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              {isGoogleAds && data ? (
                <div className="hidden text-right 2xl:block">
                  <div className="flex items-center justify-end gap-1.5 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{data.metadata.source === "windsor-live" ? ui(locale, "Windsor.ai atualizado", "Windsor.ai updated") : ui(locale, "Windsor.ai • snapshot validado", "Windsor.ai • validated snapshot")} • D-1 {formatLongDate(data.metadata.lastClosedDate ?? DATA_END, locale)}</div>
                  <p className="mt-1 text-[9px] text-slate-700">{formatNumber(data.metadata.campaignCount, locale)} {ui(locale, "campanhas", "campaigns")} • {formatNumber(data.metadata.rowCount, locale)} {ui(locale, "registros", "records")} {data.metadata.cacheHit ? "• cache" : ""}</p>
                </div>
              ) : null}
            </div>
          </div>

          {isGoogleAds ? (
            <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-[#1d2737]" aria-label={ui(locale, "Áreas de Google Ads", "Google Ads areas")}>
              {accessibleGoogleTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} type="button" onClick={() => selectGoogleTab(tab.id)} aria-current={activeGoogleTab === tab.id ? "page" : undefined} className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-[11px] font-medium transition-colors ${activeGoogleTab === tab.id ? "text-white" : "text-slate-600 hover:text-slate-300"}`}>
                    <Icon className={`h-3.5 w-3.5 ${activeGoogleTab === tab.id ? "text-[#e2212d]" : ""}`} />{tab.labels[locale]}
                    {activeGoogleTab === tab.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#e2212d]" /> : null}
                  </button>
                );
              })}
            </nav>
          ) : null}

          {isLeads ? (
            <LeadsTab dateFrom={leadsDateFrom} dateTo={leadsDateTo} locale={locale} canImportLeads={permissions.canImportLeads && !leadsReadOnly} readOnly={leadsReadOnly} onUpdatedAt={handleUpdatedAt} />
          ) : dashboard.isLoading ? (
            <div className="grid min-h-[520px] place-items-center rounded-xl border border-[#1e293b] bg-[#0d1421]">
              <div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" /><p className="mt-3 text-xs text-slate-500">{ui(locale, "Atualizando dados do Google Ads...", "Updating Google Ads data...")}</p></div>
            </div>
          ) : dashboard.error ? (
            <div className="grid min-h-[420px] place-items-center rounded-xl border border-red-500/20 bg-red-500/[0.04] px-6 text-center">
              <div><AlertTriangle className="mx-auto h-8 w-8 text-red-400" /><h2 className="mt-3 text-sm font-semibold text-white">{ui(locale, "Não foi possível carregar os dados", "Data could not be loaded")}</h2><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{ui(locale, "A conexão pode estar temporariamente indisponível. Tente novamente.", "The connection may be temporarily unavailable. Please try again.")}</p><Button onClick={() => dashboard.refetch()} className="mt-5 bg-[#e2212d] hover:bg-[#c91622]"><RefreshCcw className="mr-2 h-4 w-4" />{ui(locale, "Tentar novamente", "Try again")}</Button></div>
            </div>
          ) : data && data.daily.length ? (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {metricCards.map(card => <MetricCard key={card.title} {...card} />)}
              </div>
              {activeGoogleTab === "overview" ? <OverviewTab data={data} deviceMix={googleDeviceMix.data} correctionVisible={correctionVisible} locale={locale} /> : null}
              {activeGoogleTab === "daily" ? <DailyTab data={data} correctionVisible={correctionVisible} locale={locale} /> : null}
              {activeGoogleTab === "investment" ? <InvestmentTab data={data} correctionVisible={correctionVisible} locale={locale} /> : null}
              {activeGoogleTab === "optimizations" ? <OptimizationsTab data={data} dateFrom={googleDateFrom} dateTo={googleDateTo} /> : null}
              {activeGoogleTab === "history" ? <OptimizationHistoryTab dateFrom={googleDateFrom} dateTo={googleDateTo} /> : null}
            </>
          ) : (
            <Panel title="Google Ads"><EmptyState title={ui(locale, "Nenhum dado no período", "No data in this period")} description={ui(locale, "Selecione outro intervalo de datas para continuar.", "Select another date range to continue.")} /></Panel>
          )}
        </main>
      )}
    </div>
  );
}

export default function Home() {
  const session = trpc.dashboardAuth.session.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (session.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070b14]">
        <div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" /><p className="mt-3 text-xs text-slate-600">Validando acesso...</p></div>
      </div>
    );
  }

  return session.data ? <DashboardScreen session={session.data} /> : <LoginScreen />;
}
