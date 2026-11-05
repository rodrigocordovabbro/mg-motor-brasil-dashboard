import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { openNativeDatePicker } from "@/lib/nativeDatePicker";
import {
  activateSocialOrganicPrintMode,
  buildSocialOrganicPdfTitle,
  SocialOrganicPdfButton,
} from "./SocialOrganicPrint";
import { getDashboardCutoffDate } from "@shared/dashboardDates";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ExternalLink,
  Eye,
  Heart,
  ImageIcon,
  Instagram,
  Loader2,
  MessageCircle,
  Music2,
  Radar,
  RefreshCcw,
  Share2,
  Sparkles,
  TrendingUp,
  UserPlus,
  UsersRound,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type SocialOrganicData = RouterOutputs["socialOrganic"]["data"];
type Content = SocialOrganicData["contents"][number];
type Locale = "pt-BR" | "en-US";
type ContentSort = "reach" | "engagements";
type SocialOrganicPlatform = "instagram" | "tiktok";

type Props = {
  locale?: Locale;
  onUpdatedAt?: (value: string) => void;
};

const FALLBACK_TO = getDashboardCutoffDate();
const FALLBACK_FROM = addDays(FALLBACK_TO, -29);

export const SOCIAL_ORGANIC_COPY = {
  "pt-BR": {
    eyebrow: "Social Orgânico",
    title: "Inteligência de Comunidade e Conteúdo",
    subtitle: "Crescimento, alcance, engajamento e criativos com comparação automática ao período anterior equivalente",
    instagram: "Instagram",
    tiktok: "TikTok",
    period: "Período",
    month: "Mês",
    refresh: "Atualizar",
    cutoff: "Corte D-1",
    previousPeriod: "Período anterior",
    currentFollowers: "Seguidores atuais",
    newFollowers: "Novos seguidores",
    netFollowerGrowth: "Crescimento líquido",
    dailyReach: "Alcance diário somado",
    views: "Visualizações",
    interactions: "Interações",
    engagementRate: "Taxa de engajamento",
    noHistoricalFollowers: "Total atual; a fonte não fornece série histórica",
    currentFollowersSource: "Total atual reportado pela fonte",
    comparedWith: "vs período anterior equivalente",
    unavailableComparison: "Comparação percentual indisponível",
    dailyReachNote: "Soma do alcance de cada dia; não representa alcance único deduplicado no intervalo.",
    trendTitle: "Evolução da atenção orgânica",
    trendSubtitle: "Alcance diário somado e visualizações reportados pelo Instagram",
    engagementTitle: "Engajamento e eficiência",
    engagementSubtitle: "Interações diárias e taxa calculada sobre o alcance diário",
    followersTitle: "Aquisição diária de seguidores",
    followersSubtitle: "Novos seguidores reportados por dia; não representa crescimento líquido",
    netFollowersSubtitle: "Ganhos menos perdas de seguidores reportados por dia pelo TikTok",
    followerAnalysisTitle: "Análise de crescimento de seguidores",
    followerAnalysisSubtitle: "Compara dias úteis e fins de semana, identifica picos e cruza sinais de alcance, visualizações e conteúdo sem atribuir causalidade",
    weekdayAverage: "Média por dia útil",
    weekendAverage: "Média por dia no fim de semana",
    weekdayMedian: "Mediana em dias úteis",
    weekendMedian: "Mediana no fim de semana",
    weekendDifference: "Fim de semana vs dias úteis",
    latestWeekend: "Último fim de semana",
    followersReported: "seguidores reportados",
    reportedDays: "dias fechados",
    dayOfWeekTitle: "Média por dia da semana",
    dayOfWeekSubtitle: "Média diária de novos seguidores, excluindo datas ainda em apuração",
    followerTimelineTitle: "Seguidores por dia",
    followerTimelineSubtitle: "Dias úteis em azul, fins de semana em rosa e picos em âmbar",
    weekendDiagnosis: "Diagnóstico do último fim de semana",
    weekendBenchmark: "Referência de fins de semana anteriores",
    weekendSpike: "Fora da curva",
    weekendAbove: "Acima do padrão",
    weekendTypical: "Dentro do padrão",
    weekendBelow: "Abaixo do padrão",
    weekendPending: "Em apuração",
    weekendInsufficient: "Base insuficiente",
    weekendPendingDescription: "A origem ainda não fechou todos os dias do fim de semana. O volume exibido é parcial e não deve ser classificado como alta ou queda.",
    weekendSpikeDescription: "O total de seguidores superou o limiar estatístico calculado com os fins de semana anteriores do período.",
    weekendAboveDescription: "O resultado ficou acima da mediana histórica do período, mas abaixo do limiar de pico.",
    weekendTypicalDescription: "O resultado ficou dentro da faixa observada nos fins de semana anteriores.",
    weekendBelowDescription: "O resultado ficou abaixo da faixa típica observada no período.",
    weekendInsufficientDescription: "Selecione pelo menos 14 dias para formar uma referência confiável de fins de semana.",
    evidenceSignals: "Sinais associados",
    reachChange: "Alcance vs fins de semana anteriores",
    viewsChange: "Visualizações vs fins de semana anteriores",
    interactionsChange: "Interações vs fins de semana anteriores",
    strongestAssociation: "Maior associação histórica",
    correlationReach: "alcance",
    correlationViews: "visualizações",
    correlationInteractions: "interações",
    correlationNote: "Correlação indica associação, não comprova causa.",
    relatedContent: "Conteúdos próximos ao período",
    relatedContentEmpty: "Nenhum conteúdo publicado no fim de semana ou nos dois dias anteriores foi retornado pela origem.",
    anomalyTitle: "Picos diários detectados",
    anomalySubtitle: "Dias acima do limiar robusto do período; use os sinais ao lado para investigar o contexto",
    noAnomalies: "Nenhum pico estatístico de seguidores foi detectado no intervalo selecionado.",
    dataQualityPending: "Seguidores em apuração",
    dataQualityThrough: "Série de seguidores fechada até",
    confidenceHigh: "Alta confiança",
    confidenceMedium: "Confiança moderada",
    confidenceLow: "Baixa confiança",
    useLongerPeriod: "Para uma leitura mais estável, use 30 ou 60 dias.",
    monday: "Seg",
    tuesday: "Ter",
    wednesday: "Qua",
    thursday: "Qui",
    friday: "Sex",
    saturday: "Sáb",
    sunday: "Dom",
    interactionMix: "Composição das interações",
    interactionMixSubtitle: "Ações dos conteúdos publicados no período, reportadas de forma independente pela origem",
    insights: "Leituras do período",
    insightsSubtitle: "Destaques determinísticos, sem atribuir causalidade",
    topReach: "Maior alcance",
    topEngagement: "Maior engajamento",
    topFollows: "Mais seguidores gerados",
    strongestAction: "Interação dominante",
    contentTitle: "Conteúdos em destaque",
    contentSubtitle: "Ranking real de conteúdos do período; miniatura exibida somente quando a origem fornece URL válida",
    byReach: "Por alcance",
    byEngagement: "Por engajamento",
    published: "publicados",
    reach: "Alcance",
    engagement: "Engajamento",
    likes: "Curtidas",
    comments: "Comentários",
    saves: "Salvamentos",
    shares: "Compartilhamentos",
    profileViews: "Visitas ao perfil",
    imageUnavailable: "Miniatura indisponível",
    openPost: "Abrir publicação",
    sourceLive: "Windsor.ai atualizado",
    through: "Dados até",
    updated: "Atualizado",
    loading: "Carregando dados orgânicos reais...",
    errorTitle: "Não foi possível carregar o Social Orgânico",
    errorDescription: "A conexão orgânica selecionada no Windsor.ai pode estar temporariamente indisponível.",
    emptyTitle: "Sem dados orgânicos no período",
    emptyDescription: "Selecione outro intervalo para consultar a conta conectada.",
    tiktokPending: "TikTok Orgânico ainda não está conectado",
    tiktokPendingDescription: "A conta disponível hoje é TikTok Ads. Para preservar a integridade da análise, dados pagos não são apresentados como orgânicos.",
    connectTikTok: "Conectar TikTok Orgânico",
    afterConnection: "Após a autorização, esta área poderá receber crescimento de seguidores, visualizações, engajamento e ranking de vídeos conforme os campos liberados pelo conector.",
    contentPublished: "Conteúdos publicados",
    videoTitle: "Vídeos em destaque",
    videoUnavailable: "Detalhes dos vídeos ainda não foram liberados pela fonte",
    videoUnavailableDescription: "A conexão já entrega seguidores, alcance, visualizações e engajamento da conta. O Windsor ainda não retornou linhas por vídeo nem thumbnails; o ranking será preenchido automaticamente assim que esses campos forem disponibilizados.",
    peakReachDay: "Pico de alcance",
    peakEngagementDay: "Pico de engajamento",
  },
  "en-US": {
    eyebrow: "Organic Social",
    title: "Community and Content Intelligence",
    subtitle: "Growth, reach, engagement and creatives with automatic comparison against the equivalent previous period",
    instagram: "Instagram",
    tiktok: "TikTok",
    period: "Period",
    month: "Month",
    refresh: "Refresh",
    cutoff: "D-1 cutoff",
    previousPeriod: "Previous period",
    currentFollowers: "Current followers",
    newFollowers: "New followers",
    netFollowerGrowth: "Net follower growth",
    dailyReach: "Summed daily reach",
    views: "Views",
    interactions: "Interactions",
    engagementRate: "Engagement rate",
    noHistoricalFollowers: "Current total; the source does not provide a historical series",
    currentFollowersSource: "Current total reported by the source",
    comparedWith: "vs equivalent previous period",
    unavailableComparison: "Percentage comparison unavailable",
    dailyReachNote: "Sum of each day's reach; it is not unique reach deduplicated across the interval.",
    trendTitle: "Organic attention trend",
    trendSubtitle: "Summed daily reach and views reported by Instagram",
    engagementTitle: "Engagement and efficiency",
    engagementSubtitle: "Daily interactions and rate calculated over daily reach",
    followersTitle: "Daily follower acquisition",
    followersSubtitle: "New followers reported per day; this is not net follower growth",
    netFollowersSubtitle: "Follower gains minus losses reported daily by TikTok",
    followerAnalysisTitle: "Follower growth analysis",
    followerAnalysisSubtitle: "Compares weekdays and weekends, detects spikes, and cross-checks reach, views and content signals without claiming causation",
    weekdayAverage: "Average per weekday",
    weekendAverage: "Average per weekend day",
    weekdayMedian: "Weekday median",
    weekendMedian: "Weekend median",
    weekendDifference: "Weekend vs weekdays",
    latestWeekend: "Latest weekend",
    followersReported: "followers reported",
    reportedDays: "closed days",
    dayOfWeekTitle: "Average by day of week",
    dayOfWeekSubtitle: "Daily average of new followers, excluding dates still being processed",
    followerTimelineTitle: "Followers by day",
    followerTimelineSubtitle: "Weekdays in blue, weekends in pink and spikes in amber",
    weekendDiagnosis: "Latest weekend diagnosis",
    weekendBenchmark: "Previous weekend benchmark",
    weekendSpike: "Outlier spike",
    weekendAbove: "Above pattern",
    weekendTypical: "Within pattern",
    weekendBelow: "Below pattern",
    weekendPending: "Pending data",
    weekendInsufficient: "Insufficient baseline",
    weekendPendingDescription: "The source has not closed every day of the weekend yet. The displayed follower volume is partial and should not be classified as growth or decline.",
    weekendSpikeDescription: "Follower volume exceeded the statistical threshold calculated from previous weekends in the period.",
    weekendAboveDescription: "The result was above the period's historical median but below the spike threshold.",
    weekendTypicalDescription: "The result remained within the range observed on previous weekends.",
    weekendBelowDescription: "The result was below the typical range observed in the period.",
    weekendInsufficientDescription: "Select at least 14 days to establish a reliable weekend benchmark.",
    evidenceSignals: "Associated signals",
    reachChange: "Reach vs previous weekends",
    viewsChange: "Views vs previous weekends",
    interactionsChange: "Interactions vs previous weekends",
    strongestAssociation: "Strongest historical association",
    correlationReach: "reach",
    correlationViews: "views",
    correlationInteractions: "interactions",
    correlationNote: "Correlation indicates association and does not prove causation.",
    relatedContent: "Content around the period",
    relatedContentEmpty: "The source returned no content published during the weekend or the two preceding days.",
    anomalyTitle: "Detected daily spikes",
    anomalySubtitle: "Days above the period's robust threshold; use the signals alongside them to investigate context",
    noAnomalies: "No statistical follower spikes were detected in the selected interval.",
    dataQualityPending: "Follower data pending",
    dataQualityThrough: "Follower series closed through",
    confidenceHigh: "High confidence",
    confidenceMedium: "Moderate confidence",
    confidenceLow: "Low confidence",
    useLongerPeriod: "For a more stable reading, use 30 or 60 days.",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
    interactionMix: "Interaction mix",
    interactionMixSubtitle: "Actions from content published in the period, reported independently by the source",
    insights: "Period insights",
    insightsSubtitle: "Deterministic highlights without causal attribution",
    topReach: "Highest reach",
    topEngagement: "Highest engagement",
    topFollows: "Most followers generated",
    strongestAction: "Dominant interaction",
    contentTitle: "Top content",
    contentSubtitle: "Actual ranking of content in the period; thumbnails appear only when the source provides a valid URL",
    byReach: "By reach",
    byEngagement: "By engagement",
    published: "published",
    reach: "Reach",
    engagement: "Engagement",
    likes: "Likes",
    comments: "Comments",
    saves: "Saves",
    shares: "Shares",
    profileViews: "Profile views",
    imageUnavailable: "Thumbnail unavailable",
    openPost: "Open post",
    sourceLive: "Windsor.ai updated",
    through: "Data through",
    updated: "Updated",
    loading: "Loading live organic data...",
    errorTitle: "Organic Social could not be loaded",
    errorDescription: "The selected organic connection in Windsor.ai may be temporarily unavailable.",
    emptyTitle: "No organic data for this period",
    emptyDescription: "Select another date range to query the connected account.",
    tiktokPending: "TikTok Organic is not connected yet",
    tiktokPendingDescription: "The account currently available is TikTok Ads. To preserve analytical integrity, paid data is not presented as organic data.",
    connectTikTok: "Connect TikTok Organic",
    afterConnection: "Once authorized, this area can receive follower growth, views, engagement and video rankings according to the fields made available by the connector.",
    contentPublished: "Published content",
    videoTitle: "Top videos",
    videoUnavailable: "Video-level details have not been released by the source yet",
    videoUnavailableDescription: "The connection already provides account followers, reach, views and engagement. Windsor has not returned video-level rows or thumbnails yet; the ranking will populate automatically when these fields become available.",
    peakReachDay: "Peak reach",
    peakEngagementDay: "Peak engagement",
  },
} as const;

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function formatLongDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatNumber(value: number, locale: Locale, digits = 1) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: number, locale: Locale) {
  return `${formatNumber(value, locale, 2)}%`;
}

function localizeInteraction(value: string, locale: Locale) {
  const copy = SOCIAL_ORGANIC_COPY[locale];
  return ({
    likes: copy.likes,
    shares: copy.shares,
    saves: copy.saves,
    comments: copy.comments,
  } as Record<string, string>)[value] ?? value;
}

function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#1d2737] bg-[#0d1421] shadow-[0_18px_45px_rgba(0,0,0,0.16)] ${className}`}>
      <header className="flex min-h-[70px] flex-col gap-3 border-b border-[#1b2535] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0"><h2 className="text-[13px] font-semibold text-slate-100">{title}</h2>{subtitle ? <p className="mt-1 text-[10px] leading-4 text-slate-600">{subtitle}</p> : null}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

type Comparison = SocialOrganicData["comparisons"]["interactions"];

export function formatOrganicDelta(comparison: Comparison, locale: Locale) {
  if (comparison.percentChange == null) return SOCIAL_ORGANIC_COPY[locale].unavailableComparison;
  const prefix = comparison.percentChange > 0 ? "+" : "";
  return `${prefix}${formatNumber(comparison.percentChange, locale, 1)}% ${SOCIAL_ORGANIC_COPY[locale].comparedWith}`;
}

function Delta({ comparison, locale, inverse = false }: { comparison: Comparison; locale: Locale; inverse?: boolean }) {
  const change = comparison.percentChange;
  if (change == null) return <span className="text-[9px] text-slate-600">{SOCIAL_ORGANIC_COPY[locale].unavailableComparison}</span>;
  const positive = inverse ? change < 0 : change > 0;
  const neutral = change === 0;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 text-[9px] font-medium ${neutral ? "text-slate-500" : positive ? "text-emerald-400" : "text-red-400"}`}><Icon className="h-3 w-3" />{formatOrganicDelta(comparison, locale)}</span>;
}

function MetricCard({ title, value, subtitle, comparison, locale, icon, accent }: { title: string; value: string; subtitle: string; comparison?: Comparison; locale: Locale; icon: ReactNode; accent: string }) {
  return (
    <article className="relative min-w-0 overflow-hidden rounded-2xl border border-[#1d2737] bg-[#0d1421] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</p><p className="mt-2 truncate text-[22px] font-semibold tracking-tight text-white">{value}</p><p className="mt-1 min-h-4 text-[9px] leading-4 text-slate-600">{subtitle}</p>{comparison ? <div className="mt-2"><Delta comparison={comparison} locale={locale} /></div> : null}</div>
        <span className="shrink-0 rounded-xl border p-2.5" style={{ borderColor: `${accent}28`, backgroundColor: `${accent}12`, color: accent }}>{icon}</span>
      </div>
    </article>
  );
}

function OrganicTooltip({ active, payload, label, locale }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>; label?: string; locale: Locale }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-[#2a364b] bg-[#080d16]/95 p-3 text-[10px] shadow-2xl backdrop-blur"><p className="mb-2 font-semibold text-slate-300">{label && /^\d{4}-\d{2}-\d{2}$/.test(label) ? formatLongDate(label, locale) : label}</p><div className="space-y-1.5">{payload.map(item => <div key={`${item.dataKey}-${item.name}`} className="flex items-center justify-between gap-5"><span style={{ color: item.color }}>{item.name}</span><strong className="text-slate-200">{item.dataKey === "engagementRate" ? formatPercent(Number(item.value ?? 0), locale) : formatNumber(Number(item.value ?? 0), locale)}</strong></div>)}</div></div>;
}

function ContentImage({ content, alt, unavailable }: { content: Content; alt: string; unavailable: string }) {
  const [failed, setFailed] = useState(false);
  if (!content.thumbnailUrl || failed) return <div className="grid h-[220px] place-items-center bg-[#070c14] text-center"><div><ImageIcon className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-2 text-[9px] text-slate-700">{unavailable}</p></div></div>;
  return <div className="flex h-[220px] w-full items-center justify-center bg-[#070c14] p-2"><img src={content.thumbnailUrl} alt={alt} loading="eager" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" /></div>;
}

function formatSignedPercent(value: number | null, locale: Locale) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, locale, 1)}%`;
}

function FollowerAnalysisSection({ data, locale, isTikTok }: { data: SocialOrganicData; locale: Locale; isTikTok: boolean }) {
  const t = SOCIAL_ORGANIC_COPY[locale];
  const analysis = data.followerAnalysis;
  const latestWeekend = analysis.latestWeekend;
  const dayLabels = [t.sunday, t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday];
  const orderedDays = [1, 2, 3, 4, 5, 6, 0]
    .map(day => analysis.dayOfWeek.find(item => item.day === day))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const maximumDayAverage = Math.max(...orderedDays.map(item => item.average), 1);
  const status = latestWeekend?.status ?? "insufficient";
  const statusConfig = {
    spike: { label: t.weekendSpike, description: t.weekendSpikeDescription, color: "text-amber-300", border: "border-amber-400/25", background: "bg-amber-400/[0.06]", icon: <Zap className="h-4 w-4" /> },
    above: { label: t.weekendAbove, description: t.weekendAboveDescription, color: "text-emerald-300", border: "border-emerald-400/25", background: "bg-emerald-400/[0.06]", icon: <ArrowUpRight className="h-4 w-4" /> },
    typical: { label: t.weekendTypical, description: t.weekendTypicalDescription, color: "text-sky-300", border: "border-sky-400/25", background: "bg-sky-400/[0.06]", icon: <Activity className="h-4 w-4" /> },
    below: { label: t.weekendBelow, description: t.weekendBelowDescription, color: "text-rose-300", border: "border-rose-400/25", background: "bg-rose-400/[0.06]", icon: <ArrowDownRight className="h-4 w-4" /> },
    pending: { label: t.weekendPending, description: t.weekendPendingDescription, color: "text-violet-300", border: "border-violet-400/25", background: "bg-violet-400/[0.06]", icon: <RefreshCcw className="h-4 w-4" /> },
    insufficient: { label: t.weekendInsufficient, description: t.weekendInsufficientDescription, color: "text-slate-300", border: "border-slate-400/20", background: "bg-slate-400/[0.04]", icon: <Radar className="h-4 w-4" /> },
  }[status];
  const confidenceLabel = analysis.confidence === "high" ? t.confidenceHigh : analysis.confidence === "medium" ? t.confidenceMedium : t.confidenceLow;
  const strongestMetric = analysis.strongestCorrelation?.metric === "reach" ? t.correlationReach : analysis.strongestCorrelation?.metric === "views" ? t.correlationViews : t.correlationInteractions;
  const relatedContents = latestWeekend?.relatedContents ?? [];
  const metricLabel = isTikTok ? t.netFollowerGrowth : t.newFollowers;

  const summaryCards = [
    { label: t.weekdayAverage, value: analysis.weekday.average, note: `${analysis.weekday.days} ${t.reportedDays}`, accent: "#38bdf8" },
    { label: t.weekendAverage, value: analysis.weekend.average, note: `${analysis.weekend.days} ${t.reportedDays}`, accent: "#f472b6" },
    { label: t.weekendDifference, value: analysis.weekendVsWeekdayPercent, note: `${t.weekendMedian}: ${formatNumber(analysis.weekend.median, locale)}`, accent: "#f59e0b", percent: true },
    { label: t.latestWeekend, value: latestWeekend?.followerTotal ?? 0, note: latestWeekend ? `${latestWeekend.reportedFollowerDays}/2 ${t.reportedDays}` : t.weekendInsufficient, accent: "#a78bfa" },
  ];

  return (
    <section className="mt-4 space-y-4" data-testid="follower-pattern-analysis">
      <Panel title={t.followerAnalysisTitle} subtitle={t.followerAnalysisSubtitle} action={<span className={`rounded-full border px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] ${statusConfig.border} ${statusConfig.background} ${statusConfig.color}`}>{confidenceLabel}</span>}>
        <div className="grid gap-px bg-[#1b2535] sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(card => <article key={card.label} className="bg-[#0d1421] p-4"><div className="flex items-center justify-between gap-3"><p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-600">{card.label}</p><span className="h-2 w-2 rounded-full" style={{ backgroundColor: card.accent }} /></div><p className="mt-2 text-[22px] font-semibold text-white">{card.percent ? formatSignedPercent(card.value, locale) : formatNumber(card.value ?? 0, locale)}</p><p className="mt-1 text-[9px] text-slate-600">{card.note}</p></article>)}
        </div>
        {analysis.dataQuality.pendingDates.length ? <div className="flex items-start gap-2 border-t border-violet-400/15 bg-violet-400/[0.04] px-4 py-3 text-[10px] leading-5 text-violet-100/70"><RefreshCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" /><span><strong className="font-semibold text-violet-200">{t.dataQualityPending}:</strong> {analysis.dataQuality.pendingDates.map(date => formatLongDate(date, locale)).join(", ")}. {t.dataQualityThrough}: {analysis.dataQuality.reliableThroughDate ? formatLongDate(analysis.dataQuality.reliableThroughDate, locale) : "—"}.</span></div> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel title={t.followerTimelineTitle} subtitle={t.followerTimelineSubtitle}><div className="h-[320px] px-2 pb-4 pt-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={analysis.timeline}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={value => formatDate(value, locale)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={36} /><Tooltip content={<OrganicTooltip locale={locale} />} /><Bar dataKey="newFollowers" name={metricLabel} radius={[4, 4, 0, 0]} maxBarSize={24}>{analysis.timeline.map(item => <Cell key={item.date} fill={item.pending ? "#7c3aed" : item.anomaly ? "#f59e0b" : item.dayType === "weekend" ? "#f472b6" : "#38bdf8"} fillOpacity={item.pending ? 0.45 : 0.9} />)}</Bar></BarChart></ResponsiveContainer></div></Panel>
        <Panel title={t.dayOfWeekTitle} subtitle={t.dayOfWeekSubtitle}><div className="space-y-3 p-5">{orderedDays.map(item => <div key={item.day}><div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]"><span className={item.day === 0 || item.day === 6 ? "font-semibold text-pink-300" : "text-slate-400"}>{dayLabels[item.day]}</span><span className="font-semibold text-slate-200">{formatNumber(item.average, locale)} <span className="font-normal text-slate-700">• {item.days}d</span></span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#080d16]"><div className={`h-full rounded-full ${item.day === 0 || item.day === 6 ? "bg-pink-400" : "bg-sky-400"}`} style={{ width: `${Math.max(2, (item.average / maximumDayAverage) * 100)}%` }} /></div></div>)}</div></Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title={t.weekendDiagnosis} subtitle={latestWeekend ? `${formatLongDate(latestWeekend.dateFrom, locale)} — ${formatLongDate(latestWeekend.dateTo, locale)}` : t.weekendInsufficient}>
          <div className="p-4">
            <div className={`rounded-xl border p-4 ${statusConfig.border} ${statusConfig.background}`}><div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusConfig.color}`}>{statusConfig.icon}{statusConfig.label}</div><p className="mt-2 text-[11px] leading-5 text-slate-400">{statusConfig.description}</p>{latestWeekend ? <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[9px] text-slate-600"><span><strong className="text-slate-300">{formatNumber(latestWeekend.followerTotal, locale)}</strong> {t.followersReported}</span><span>{t.weekendBenchmark}: <strong className="text-slate-300">{formatNumber(latestWeekend.benchmarkDailyAverage, locale)}/dia</strong></span><span>{formatSignedPercent(latestWeekend.followerDifferencePercent, locale)} vs benchmark diário</span></div> : null}</div>
            <div className="mt-4"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{t.evidenceSignals}</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{[
              { label: t.reachChange, value: latestWeekend?.reachDifferencePercent ?? null },
              { label: t.viewsChange, value: latestWeekend?.viewsDifferencePercent ?? null },
              { label: t.interactionsChange, value: latestWeekend?.interactionsDifferencePercent ?? null },
            ].map(signal => <div key={signal.label} className="rounded-lg border border-[#202b3d] bg-[#0a101b] p-3"><p className="text-[8px] leading-4 text-slate-600">{signal.label}</p><p className="mt-1 text-sm font-semibold text-white">{formatSignedPercent(signal.value, locale)}</p></div>)}</div></div>
            {analysis.strongestCorrelation ? <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#202b3d] bg-[#0a101b] p-3 text-[9px] leading-4 text-slate-500"><Radar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" /><span><strong className="text-slate-300">{t.strongestAssociation}:</strong> {strongestMetric} (r = {formatNumber(analysis.strongestCorrelation.coefficient ?? 0, locale, 2)}). {t.correlationNote}</span></div> : null}
          </div>
        </Panel>
        <Panel title={t.relatedContent} subtitle={t.correlationNote}><div className="space-y-2 p-4">{relatedContents.length ? relatedContents.map(content => <article key={content.id} className="rounded-xl border border-[#202b3d] bg-[#0a101b] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-[10px] leading-4 text-slate-300">{content.caption || t.contentPublished}</p><p className="mt-1 text-[8px] text-slate-700">{formatLongDate(content.timestamp.slice(0, 10), locale)}</p></div>{content.permalink ? <a href={content.permalink} target="_blank" rel="noreferrer" aria-label={t.openPost} className="shrink-0 text-sky-400"><ExternalLink className="h-3.5 w-3.5" /></a> : null}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-slate-600"><span>{t.reach}: <strong className="text-slate-300">{formatNumber(content.reach, locale)}</strong></span><span>{t.engagement}: <strong className="text-slate-300">{formatNumber(content.engagements, locale)}</strong></span><span>{t.newFollowers}: <strong className="text-slate-300">{formatNumber(content.follows, locale)}</strong></span></div></article>) : <div className="grid min-h-[180px] place-items-center px-5 text-center text-[10px] leading-5 text-slate-600">{t.relatedContentEmpty}</div>}</div></Panel>
      </div>

      <Panel title={t.anomalyTitle} subtitle={t.anomalySubtitle}>{analysis.anomalies.length ? <div className="grid gap-px bg-[#1b2535] sm:grid-cols-2 xl:grid-cols-5">{analysis.anomalies.map(item => <article key={item.date} className="bg-[#0d1421] p-4"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-semibold text-amber-300">{formatLongDate(item.date, locale)}</p><Zap className="h-3.5 w-3.5 text-amber-400" /></div><p className="mt-2 text-xl font-semibold text-white">{formatNumber(item.followers, locale)}</p><p className="mt-1 text-[8px] text-slate-600">{t.followersReported} • {formatSignedPercent(item.upliftVsTypicalPercent, locale)}</p><div className="mt-3 space-y-1 text-[8px] text-slate-700"><p>{t.reach}: {formatNumber(item.reach, locale)}</p><p>{t.views}: {formatNumber(item.views, locale)}</p><p>{t.interactions}: {formatNumber(item.interactions, locale)}</p></div></article>)}</div> : <div className="grid min-h-[120px] place-items-center px-6 text-center text-[10px] text-slate-600">{t.noAnomalies}</div>}{analysis.confidence === "low" ? <div className="border-t border-amber-400/15 bg-amber-400/[0.04] px-4 py-3 text-[9px] text-amber-100/65">{t.useLongerPeriod}</div> : null}</Panel>
    </section>
  );
}

export function SocialOrganicDashboard({ locale = "pt-BR", onUpdatedAt }: Props) {
  const t = SOCIAL_ORGANIC_COPY[locale];
  const utils = trpc.useUtils();
  const [dateFrom, setDateFrom] = useState(FALLBACK_FROM);
  const [dateTo, setDateTo] = useState(FALLBACK_TO);
  const [preset, setPreset] = useState("30");
  const [platform, setPlatform] = useState<SocialOrganicPlatform>("instagram");
  const [contentSort, setContentSort] = useState<ContentSort>("reach");
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const bounds = trpc.socialOrganic.bounds.useQuery(undefined, { retry: 1, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false });
  const queryInput = useMemo(
    () => ({ platform, dateFrom, dateTo }),
    [platform, dateFrom, dateTo],
  );
  const query = trpc.socialOrganic.data.useQuery(queryInput, { retry: 1, staleTime: 15 * 60 * 1000, refetchOnWindowFocus: false });
  const refresh = trpc.socialOrganic.refresh.useMutation({
    onSuccess: result => {
      utils.socialOrganic.data.setData(queryInput, result);
      onUpdatedAt?.(result.metadata.updatedAt);
    },
  });
  const data = query.data;
  const latestSelectableDate = bounds.data?.latestDate ?? FALLBACK_TO;

  useEffect(() => {
    if (data?.metadata.updatedAt) onUpdatedAt?.(data.metadata.updatedAt);
  }, [data?.metadata.updatedAt, onUpdatedAt]);

  const rankedContents = useMemo(() => {
    if (!data) return [];
    return [...data.contents].sort((left, right) => right[contentSort] - left[contentSort] || right.reach - left.reach).slice(0, 8);
  }, [contentSort, data]);

  function applyPreset(value: string) {
    const latest = latestSelectableDate;
    setPreset(value);
    setDateTo(latest);
    if (value === "month") {
      setDateFrom(`${latest.slice(0, 7)}-01`);
      return;
    }
    setDateFrom(addDays(latest, -(Number.parseInt(value, 10) - 1)));
  }

  function updateFrom(value: string) {
    if (!value || value > dateTo || (bounds.data && value < bounds.data.earliestDate)) return;
    setPreset("custom");
    setDateFrom(value);
  }

  function updateTo(value: string) {
    if (!value || value < dateFrom || value > latestSelectableDate) return;
    setPreset("custom");
    setDateTo(value);
  }

  function handlePdfExport() {
    activateSocialOrganicPrintMode({
      body: document.body,
      page: document,
      pdfTitle: buildSocialOrganicPdfTitle(platform),
      print: () => window.print(),
      addAfterPrintListener: listener =>
        window.addEventListener("afterprint", listener, { once: true }),
    });
  }

  if (query.isLoading || bounds.isLoading) return <main className="mx-auto grid min-h-[620px] max-w-[1680px] place-items-center px-4"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#e2212d]" /><p className="mt-3 text-xs text-slate-500">{t.loading}</p></div></main>;
  if (query.error) return <main className="mx-auto max-w-[1680px] px-4 py-8"><div className="grid min-h-[480px] place-items-center rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-6 text-center"><div><AlertTriangle className="mx-auto h-9 w-9 text-red-400" /><h1 className="mt-3 text-base font-semibold text-white">{t.errorTitle}</h1><p className="mt-1 text-xs text-slate-500">{t.errorDescription}</p><Button onClick={() => query.refetch()} className="mt-5 bg-[#e2212d] hover:bg-[#c91622]"><RefreshCcw className="mr-2 h-4 w-4" />{t.refresh}</Button></div></div></main>;
  if (!data?.daily.length) return <main className="mx-auto max-w-[1680px] px-4 py-8"><Panel title={t.title} subtitle={t.emptyDescription}><div className="grid min-h-[320px] place-items-center text-xs text-slate-600">{t.emptyTitle}</div></Panel></main>;

  const isTikTok = platform === "tiktok";
  const platformLabel = isTikTok ? t.tiktok : t.instagram;
  const metrics = [
    { title: t.currentFollowers, value: formatNumber(data.account.followersCurrent, locale), subtitle: isTikTok ? t.currentFollowersSource : t.noHistoricalFollowers, icon: <UsersRound className="h-4 w-4" />, accent: "#f472b6" },
    { title: isTikTok ? t.netFollowerGrowth : t.newFollowers, value: formatNumber(data.summary.newFollowers, locale), subtitle: `${formatNumber(data.previousSummary.newFollowers, locale)} • ${t.previousPeriod.toLowerCase()}`, comparison: data.comparisons.newFollowers, icon: <UserPlus className="h-4 w-4" />, accent: "#38bdf8" },
    { title: t.dailyReach, value: formatNumber(data.summary.dailyReach, locale), subtitle: `${formatNumber(data.previousSummary.dailyReach, locale)} • ${t.previousPeriod.toLowerCase()}`, comparison: data.comparisons.dailyReach, icon: <Eye className="h-4 w-4" />, accent: "#10b981" },
    { title: t.views, value: formatNumber(data.summary.views, locale), subtitle: `${formatNumber(data.previousSummary.views, locale)} • ${t.previousPeriod.toLowerCase()}`, comparison: data.comparisons.views, icon: <TrendingUp className="h-4 w-4" />, accent: "#a78bfa" },
    { title: t.interactions, value: formatNumber(data.summary.interactions, locale), subtitle: `${formatNumber(data.previousSummary.interactions, locale)} • ${t.previousPeriod.toLowerCase()}`, comparison: data.comparisons.interactions, icon: <Heart className="h-4 w-4" />, accent: "#fb7185" },
    { title: t.engagementRate, value: data.summary.engagementRate == null ? "—" : formatPercent(data.summary.engagementRate, locale), subtitle: `${data.previousSummary.engagementRate == null ? "—" : formatPercent(data.previousSummary.engagementRate, locale)} • ${t.previousPeriod.toLowerCase()}`, comparison: data.comparisons.engagementRate, icon: <Sparkles className="h-4 w-4" />, accent: "#f59e0b" },
  ];

  const interactionRows = [
    { key: "likes", label: t.likes, value: data.summary.likes, color: "#fb7185" },
    { key: "shares", label: t.shares, value: data.summary.shares, color: "#38bdf8" },
    { key: "comments", label: t.comments, value: data.summary.comments, color: "#f59e0b" },
    isTikTok
      ? { key: "profileViews", label: t.profileViews, value: data.summary.profileViews, color: "#a78bfa" }
      : { key: "saves", label: t.saves, value: data.summary.saves, color: "#a78bfa" },
  ];

  const peakReachDay = [...data.daily].sort(
    (left, right) => right.dailyReach - left.dailyReach,
  )[0] ?? null;
  const peakEngagementDay = [...data.daily].sort(
    (left, right) => right.interactions - left.interactions,
  )[0] ?? null;

  const insightCards = [
    data.highlights.topByReach ? { label: t.topReach, value: data.highlights.topByReach.caption || data.highlights.topByReach.type, metric: `${formatNumber(data.highlights.topByReach.reach, locale)} ${t.reach.toLowerCase()}`, icon: <Eye className="h-3.5 w-3.5 text-emerald-400" /> } : peakReachDay ? { label: t.peakReachDay, value: formatLongDate(peakReachDay.date, locale), metric: `${formatNumber(peakReachDay.dailyReach, locale)} ${t.reach.toLowerCase()}`, icon: <Eye className="h-3.5 w-3.5 text-emerald-400" /> } : null,
    data.highlights.topByEngagement ? { label: t.topEngagement, value: data.highlights.topByEngagement.caption || data.highlights.topByEngagement.type, metric: `${formatNumber(data.highlights.topByEngagement.engagements, locale)} ${t.interactions.toLowerCase()}`, icon: <Heart className="h-3.5 w-3.5 text-rose-400" /> } : peakEngagementDay ? { label: t.peakEngagementDay, value: formatLongDate(peakEngagementDay.date, locale), metric: `${formatNumber(peakEngagementDay.interactions, locale)} ${t.interactions.toLowerCase()}`, icon: <Heart className="h-3.5 w-3.5 text-rose-400" /> } : null,
    data.highlights.topByFollows ? { label: t.topFollows, value: data.highlights.topByFollows.caption || data.highlights.topByFollows.type, metric: `${formatNumber(data.highlights.topByFollows.follows, locale)} ${isTikTok ? t.netFollowerGrowth.toLowerCase() : t.newFollowers.toLowerCase()}`, icon: <UserPlus className="h-3.5 w-3.5 text-sky-400" /> } : null,
    { label: t.strongestAction, value: localizeInteraction(data.highlights.strongestInteraction[0], locale), metric: formatNumber(data.highlights.strongestInteraction[1], locale), icon: <Sparkles className="h-3.5 w-3.5 text-amber-400" /> },
  ].filter(Boolean) as Array<{ label: string; value: string; metric: string; icon: ReactNode }>;

  return (
    <main
      data-social-organic-print-root
      data-testid="social-organic-print-root"
      className="mx-auto max-w-[1680px] px-4 pb-12 pt-5 lg:px-6"
    >
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e2212d]"><Share2 className="h-3.5 w-3.5" />{t.eyebrow}</div><h1 className="mt-1 text-xl font-semibold tracking-tight text-white">{t.title}</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-600">{t.subtitle}</p></div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="flex rounded-lg border border-[#242f42] bg-[#0d1421] p-1"><button data-testid="social-organic-platform-instagram" type="button" onClick={() => setPlatform("instagram")} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-semibold ${platform === "instagram" ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}><Instagram className="h-3.5 w-3.5" />{t.instagram}</button><button data-testid="social-organic-platform-tiktok" type="button" onClick={() => setPlatform("tiktok")} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-semibold ${platform === "tiktok" ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}><Music2 className="h-3.5 w-3.5" />{t.tiktok}</button></div>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[#242f42] bg-[#0d1421] p-1">{["7", "14", "30", "60"].map(value => <button key={value} type="button" onClick={() => applyPreset(value)} className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-semibold ${preset === value ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}>{value}d</button>)}<button type="button" onClick={() => applyPreset("month")} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${preset === "month" ? "bg-[#e2212d] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}>{t.month}</button></div>
            <div className="flex items-stretch rounded-lg border border-[#242f42] bg-[#0d1421]"><div className="flex cursor-pointer items-center gap-2 rounded-l-lg px-3 py-1.5 hover:bg-white/[0.03]" onClick={() => openNativeDatePicker(dateFromRef.current)}><CalendarDays className="h-3.5 w-3.5 text-slate-600" /><input ref={dateFromRef} aria-label={`${t.period} start`} type="date" min={bounds.data?.earliestDate} max={dateTo} value={dateFrom} onChange={event => updateFrom(event.target.value)} className="w-[116px] bg-transparent text-[10px] text-slate-300 outline-none [color-scheme:dark]" /></div><span className="flex items-center text-slate-700">—</span><div className="flex cursor-pointer items-center rounded-r-lg px-3 py-1.5 hover:bg-white/[0.03]" onClick={() => openNativeDatePicker(dateToRef.current)}><input ref={dateToRef} aria-label={`${t.period} end`} type="date" min={dateFrom} max={latestSelectableDate} value={dateTo} onChange={event => updateTo(event.target.value)} className="w-[116px] bg-transparent text-[10px] text-slate-300 outline-none [color-scheme:dark]" /></div></div>
            <Button variant="outline" size="sm" onClick={() => refresh.mutate(queryInput)} disabled={refresh.isPending} className="social-organic-print-hide h-8 border-[#283349] bg-[#111827] text-[10px] text-slate-400 hover:bg-[#182236] hover:text-white"><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />{t.refresh}</Button>
            <SocialOrganicPdfButton locale={locale} onPrint={handlePdfExport} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-slate-600"><span className="flex items-center gap-1.5 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t.sourceLive}</span><span>{t.cutoff}: {formatLongDate(dateTo, locale)}</span><span>{t.previousPeriod}: {formatLongDate(data.period.previousDateFrom, locale)} — {formatLongDate(data.period.previousDateTo, locale)}</span><span>{t.through}: {formatLongDate(data.metadata.dataThroughDate, locale)}</span></div>
        </div>
      </div>

      <>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metrics.map(metric => <MetricCard key={metric.title} {...metric} locale={locale} />)}</div>
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-500/15 bg-sky-500/[0.04] px-4 py-3 text-[10px] leading-5 text-sky-100/65"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />{t.dailyReachNote}</div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={t.trendTitle} subtitle={`${t.trendSubtitle.replace("Instagram", platformLabel)}`}><div className="h-[340px] px-2 pb-4 pt-5"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.daily} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={value => formatDate(value, locale)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={22} /><YAxis tickFormatter={value => formatNumber(Number(value), locale)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={48} /><Tooltip content={<OrganicTooltip locale={locale} />} /><Area type="monotone" dataKey="views" name={t.views} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.1} strokeWidth={2} /><Area type="monotone" dataKey="dailyReach" name={t.reach} stroke="#10b981" fill="#10b981" fillOpacity={0.08} strokeWidth={2} /></AreaChart></ResponsiveContainer></div></Panel>
          <Panel title={t.engagementTitle} subtitle={t.engagementSubtitle}><div className="h-[340px] px-2 pb-4 pt-5"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.daily} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={value => formatDate(value, locale)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={22} /><YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={44} /><YAxis yAxisId="right" orientation="right" tickFormatter={value => `${formatNumber(Number(value), locale)}%`} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={42} /><Tooltip content={<OrganicTooltip locale={locale} />} /><Bar yAxisId="left" dataKey="interactions" name={t.interactions} fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={24} /><Line yAxisId="right" type="monotone" dataKey="engagementRate" name={t.engagementRate} stroke="#f59e0b" strokeWidth={2.5} dot={false} connectNulls /></ComposedChart></ResponsiveContainer></div></Panel>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title={t.followersTitle} subtitle={isTikTok ? t.netFollowersSubtitle : t.followersSubtitle}><div className="h-[310px] px-2 pb-4 pt-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.daily}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={value => formatDate(value, locale)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={36} /><Tooltip content={<OrganicTooltip locale={locale} />} /><Bar dataKey="newFollowers" name={isTikTok ? t.netFollowerGrowth : t.newFollowers} fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div></Panel>
          <Panel title={t.interactionMix} subtitle={t.interactionMixSubtitle}><div className="grid gap-3 p-4 sm:grid-cols-2">{interactionRows.map(item => <article key={item.key} className="rounded-xl border border-[#202b3d] bg-[#0a101b] p-4"><div className="flex items-center justify-between"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{item.label}</p><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} /></div><p className="mt-2 text-xl font-semibold text-white">{formatNumber(item.value, locale)}</p><div className="mt-2"><Delta comparison={data.comparisons[item.key as keyof typeof data.comparisons]} locale={locale} /></div></article>)}</div></Panel>
        </div>

        <FollowerAnalysisSection data={data} locale={locale} isTikTok={isTikTok} />

        <Panel title={t.insights} subtitle={t.insightsSubtitle} className="mt-4"><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{insightCards.map(card => <article key={card.label} className="min-w-0 rounded-xl border border-[#202b3d] bg-[#0a101b] p-4"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{card.icon}{card.label}</div><p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">{card.value}</p><p className="mt-1 text-[10px] text-emerald-400">{card.metric}</p></article>)}</div></Panel>

        <Panel title={isTikTok ? t.videoTitle : t.contentTitle} subtitle={t.contentSubtitle} className="mt-4" action={<div className="flex gap-1 rounded-lg border border-[#263146] bg-[#090f19] p-1"><button type="button" onClick={() => setContentSort("reach")} className={`rounded-md px-3 py-1.5 text-[9px] font-semibold ${contentSort === "reach" ? "bg-[#e2212d] text-white" : "text-slate-500"}`}>{t.byReach}</button><button type="button" onClick={() => setContentSort("engagements")} className={`rounded-md px-3 py-1.5 text-[9px] font-semibold ${contentSort === "engagements" ? "bg-[#e2212d] text-white" : "text-slate-500"}`}>{t.byEngagement}</button></div>}>
          <div className="flex flex-wrap items-center gap-4 border-b border-[#1b2535] bg-[#0a101b] px-4 py-3 text-[9px] text-slate-600"><span><strong className="text-slate-300">{formatNumber(data.contentComparison.published.current ?? 0, locale)}</strong> {t.published}</span><Delta comparison={data.contentComparison.published} locale={locale} /></div>
          {rankedContents.length ? <div className="grid gap-px bg-[#1b2535] sm:grid-cols-2 xl:grid-cols-4">{rankedContents.map((content, index) => <article key={content.id} className="min-w-0 bg-[#0d1421]"><div className="relative"><ContentImage content={content} alt={`${platformLabel} #${index + 1}`} unavailable={t.imageUnavailable} /><span className="absolute left-3 top-3 rounded-md border border-white/10 bg-[#080d16]/85 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">#{index + 1}</span><span className="absolute right-3 top-3 rounded-md border border-white/10 bg-[#080d16]/85 px-2 py-1 text-[8px] font-semibold text-slate-300 backdrop-blur">{content.type}</span></div><div className="p-4"><p className="line-clamp-3 min-h-[60px] text-[11px] leading-5 text-slate-300">{content.caption || `${platformLabel} • ${content.type}`}</p><div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#090f19] p-3 text-center"><div><p className="text-[8px] text-slate-700">{t.reach}</p><p className="mt-1 text-[10px] font-semibold text-emerald-300">{formatNumber(content.reach, locale)}</p></div><div><p className="text-[8px] text-slate-700">{t.engagement}</p><p className="mt-1 text-[10px] font-semibold text-rose-300">{formatNumber(content.engagements, locale)}</p></div><div><p className="text-[8px] text-slate-700">ER</p><p className="mt-1 text-[10px] font-semibold text-amber-300">{content.engagementRate == null ? "—" : formatPercent(content.engagementRate, locale)}</p></div></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[9px] text-slate-700">{content.timestamp ? new Date(content.timestamp).toLocaleDateString(locale) : "—"}</span>{content.permalink ? <a href={content.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-400 hover:text-sky-300">{t.openPost}<ExternalLink className="h-3 w-3" /></a> : null}</div></div></article>)}</div> : isTikTok ? <div className="grid min-h-[260px] place-items-center px-6 text-center"><div><Music2 className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-300">{t.videoUnavailable}</p><p className="mx-auto mt-2 max-w-2xl text-[10px] leading-5 text-slate-600">{t.videoUnavailableDescription}</p></div></div> : <div className="grid min-h-[260px] place-items-center text-xs text-slate-600">{t.emptyTitle}</div>}
        </Panel>
      </>
    </main>
  );
}
