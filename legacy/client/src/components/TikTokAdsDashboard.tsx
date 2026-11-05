import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { openNativeDatePicker } from "@/lib/nativeDatePicker";
import { getDashboardCutoffDate } from "@shared/dashboardDates";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  Megaphone,
  MousePointerClick,
  PlayCircle,
  RefreshCcw,
  Target,
  UsersRound,
  Video,
} from "lucide-react";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TikTokData = RouterOutputs["tiktokAds"]["data"];
type Locale = "pt-BR" | "en-US";

type TikTokAdsDashboardProps = {
  locale?: Locale;
  onUpdatedAt?: (value: string) => void;
};

const ACCENT = "#25f4ee";
const ACCENT_RED = "#fe2c55";
const FALLBACK_TO = getDashboardCutoffDate();
const FALLBACK_FROM = `${FALLBACK_TO.slice(0, 7)}-01`;
const MODEL_COLORS: Record<string, string> = {
  "MG4 URBAN": ACCENT_RED,
  MG4: ACCENT,
  MGS5: "#a78bfa",
  CYBERSTER: "#f59e0b",
  Outros: "#64748b",
};
const AUDIENCE_COLORS = [ACCENT, ACCENT_RED, "#a78bfa", "#f59e0b", "#64748b"];

export const TIKTOK_ADS_COPY = {
  "pt-BR": {
    eyebrow: "TikTok Ads",
    title: "Performance de TikTok Ads",
    period: "Período",
    month: "Mês",
    campaign: "Campanha",
    adGroup: "Grupo de anúncios",
    allCampaigns: "Todas as campanhas",
    allAdGroups: "Todos os grupos",
    investment: "Investimento",
    leads: "Leads TikTok",
    cpl: "CPL Médio",
    reach: "Alcance",
    ctr: "CTR",
    engagements: "Engajamentos",
    clicks: "Cliques",
    impressions: "Impressões",
    spendLeadsTitle: "Evolução diária — investimento e Leads",
    spendLeadsSubtitle: "Formulários nativos TikTok conciliados com o investimento diário",
    dailyCplTitle: "Evolução diária do CPL",
    dailyCplSubtitle: "Custo por formulário nativo no recorte selecionado",
    modelsTitle: "Performance por modelo",
    modelsSubtitle: "Modelo identificado de forma determinística no nome dos anúncios",
    model: "Modelo",
    ads: "Anúncios",
    campaignsTitle: "Campanhas",
    campaignsSubtitle: "Ranking real por volume de Leads e eficiência",
    groupsTitle: "Grupos de anúncios",
    groupsSubtitle: "Públicos, placement, estratégia e desempenho observados",
    creativesTitle: "Criativos com melhor desempenho",
    creativesSubtitle: "Anúncios reais; a miniatura aparece somente enquanto a URL assinada estiver válida",
    audienceTitle: "Público e distribuição regional",
    audienceSubtitle: "Conversões atribuídas por idade, gênero e estado reportadas pelo TikTok Ads",
    gender: "Gênero",
    age: "Faixa etária",
    region: "Estado",
    attributedConversions: "Conversões atribuídas",
    noItems: "Nenhum item disponível para o período.",
    sourceLive: "Windsor.ai atualizado",
    sourceSnapshot: "Snapshot persistente",
    through: "Dados disponíveis até",
    cutoff: "Corte D-1",
    updated: "Última atualização",
    refresh: "Atualizar",
    loading: "Carregando dados reais do TikTok Ads...",
    errorTitle: "Não foi possível carregar o TikTok Ads",
    errorDescription: "A conexão TikTok do Windsor.ai pode estar temporariamente indisponível.",
    emptyTitle: "Sem dados no período",
    emptyDescription: "Selecione outro intervalo para consultar a conta vinculada.",
    segmentedNote: "O TikTok distribui conversões atribuídas nas quebras de idade, gênero e estado, mas não disponibiliza o campo de formulário nativo nessas dimensões. Por isso, estes gráficos não são rotulados como Leads nem calculam CPL segmentado.",
    active: "Ativo",
    paused: "Pausado",
    blocked: "Bloqueado",
    unknownStatus: "Status não informado",
    topGroup: "Grupo líder",
    topCreative: "Criativo líder",
    topGender: "Gênero líder",
    topAge: "Faixa líder",
    topRegion: "Estado líder",
    thumbnailUnavailable: "Miniatura indisponível",
    selectionTotal: "Total da conta",
    selectionFiltered: "Recorte filtrado",
  },
  "en-US": {
    eyebrow: "TikTok Ads",
    title: "TikTok Ads Performance",
    period: "Period",
    month: "Month",
    campaign: "Campaign",
    adGroup: "Ad group",
    allCampaigns: "All campaigns",
    allAdGroups: "All ad groups",
    investment: "Spend",
    leads: "TikTok Leads",
    cpl: "Average CPL",
    reach: "Reach",
    ctr: "CTR",
    engagements: "Engagements",
    clicks: "Clicks",
    impressions: "Impressions",
    spendLeadsTitle: "Daily trend — spend and Leads",
    spendLeadsSubtitle: "Native TikTok forms reconciled with daily spend",
    dailyCplTitle: "Daily CPL trend",
    dailyCplSubtitle: "Cost per native form for the selected slice",
    modelsTitle: "Performance by model",
    modelsSubtitle: "Vehicle model identified deterministically from ad names",
    model: "Model",
    ads: "Ads",
    campaignsTitle: "Campaigns",
    campaignsSubtitle: "Actual ranking by Lead volume and efficiency",
    groupsTitle: "Ad groups",
    groupsSubtitle: "Audiences, placement, strategy and observed performance",
    creativesTitle: "Top-performing creatives",
    creativesSubtitle: "Actual ads; thumbnails appear only while signed URLs remain valid",
    audienceTitle: "Audience and regional distribution",
    audienceSubtitle: "Attributed conversions by age, gender and state reported by TikTok Ads",
    gender: "Gender",
    age: "Age range",
    region: "State",
    attributedConversions: "Attributed conversions",
    noItems: "No items available for this period.",
    sourceLive: "Windsor.ai updated",
    sourceSnapshot: "Persistent snapshot",
    through: "Data available through",
    cutoff: "D-1 cutoff",
    updated: "Last updated",
    refresh: "Refresh",
    loading: "Loading live TikTok Ads data...",
    errorTitle: "TikTok Ads could not be loaded",
    errorDescription: "The Windsor.ai TikTok connection may be temporarily unavailable.",
    emptyTitle: "No data for this period",
    emptyDescription: "Select another date range to query the connected account.",
    segmentedNote: "TikTok distributes attributed conversions across age, gender and state breakdowns, but does not expose its native form field in those dimensions. These charts are therefore not labelled as Leads and do not calculate segmented CPL.",
    active: "Active",
    paused: "Paused",
    blocked: "Blocked",
    unknownStatus: "Status unavailable",
    topGroup: "Leading ad group",
    topCreative: "Leading creative",
    topGender: "Leading gender",
    topAge: "Leading age range",
    topRegion: "Leading state",
    thumbnailUnavailable: "Thumbnail unavailable",
    selectionTotal: "Account total",
    selectionFiltered: "Filtered slice",
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

function formatNumber(value: number, locale: Locale, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number, locale: Locale, compact = false) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    notation: compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: compact && Math.abs(value) >= 10_000 ? 1 : 2,
  }).format(value);
}

export function formatTikTokStatus(status: string, locale: Locale) {
  const t = TIKTOK_ADS_COPY[locale];
  const normalized = status.toUpperCase();
  if (normalized.includes("FROZEN")) return t.blocked;
  if (normalized.includes("DISABLE") || normalized.includes("PAUSED")) return t.paused;
  if (normalized.includes("ENABLE") || normalized.includes("DELIVERY_OK")) return t.active;
  return t.unknownStatus;
}

export function formatTikTokGender(gender: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    MALE: ["Homens", "Men"],
    FEMALE: ["Mulheres", "Women"],
    NONE: ["Não informado", "Not reported"],
  };
  const pair = labels[gender.toUpperCase()] ?? labels.NONE;
  return locale === "pt-BR" ? pair[0] : pair[1];
}

export function formatTikTokAge(age: string) {
  const match = age.match(/(\d+)[_\-](\d+)/);
  return match ? `${match[1]}–${match[2]}` : age === "NONE" ? "—" : age;
}

export function formatTikTokRegion(region: string, locale: Locale) {
  if (locale === "en-US") return region;
  const labels: Record<string, string> = {
    "Sao Paulo": "São Paulo",
    "Federal District": "Distrito Federal",
    "Espirito Santo": "Espírito Santo",
    Ceara: "Ceará",
    Goias: "Goiás",
    Para: "Pará",
    Paraiba: "Paraíba",
    Parana: "Paraná",
  };
  return labels[region] ?? region;
}

function Panel({
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
    <section
      className={`overflow-hidden rounded-2xl border border-[#1d2737] bg-[#0d1421] shadow-[0_18px_45px_rgba(0,0,0,0.16)] ${className}`}
    >
      <header className="flex min-h-[70px] flex-col gap-3 border-b border-[#1b2535] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-[10px] leading-4 text-slate-600">{subtitle}</p> : null}
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
    <article className="relative overflow-hidden rounded-2xl border border-[#1d2737] bg-[#0d1421] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</p>
          <p className="mt-2 truncate text-[22px] font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 truncate text-[9px] text-slate-600">{subtitle}</p>
        </div>
        <span
          className="rounded-xl border p-2.5"
          style={{ borderColor: `${accent}28`, backgroundColor: `${accent}12`, color: accent }}
        >
          {icon}
        </span>
      </div>
    </article>
  );
}

function DataTable({ columns, rows, emptyLabel }: { columns: string[]; rows: ReactNode[][]; emptyLabel: string }) {
  if (!rows.length) {
    return <div className="grid min-h-[180px] place-items-center text-xs text-slate-600">{emptyLabel}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[10px]">
        <thead className="bg-[#0a101b] text-[8px] uppercase tracking-[0.12em] text-slate-600">
          <tr>{columns.map(column => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#192334]">
          {rows.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-white/[0.02]">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 text-slate-400">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TikTokTooltip({
  active,
  payload,
  label,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  locale: Locale;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#2a364b] bg-[#080d16]/95 p-3 text-[10px] shadow-2xl backdrop-blur">
      {label ? <p className="mb-2 font-semibold text-slate-300">{/^\d{4}-\d{2}-\d{2}$/.test(label) ? formatLongDate(label, locale) : label}</p> : null}
      <div className="space-y-1.5">
        {payload.map(item => {
          const currencyMetric = item.name?.toLowerCase().includes("invest") || item.name?.toLowerCase().includes("spend") || item.name?.includes("CPL");
          return (
            <div key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-5">
              <span style={{ color: item.color }}>{item.name}</span>
              <strong className="text-slate-200">
                {currencyMetric
                  ? formatCurrency(Number(item.value ?? 0), locale)
                  : formatNumber(Number(item.value ?? 0), locale)}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightCard({ label, value, metric, icon }: { label: string; value: string; metric: string; icon: ReactNode }) {
  return (
    <article className="rounded-xl border border-[#202b3d] bg-[#0a101b] p-4">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{icon}{label}</div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">{value}</p>
      <p className="mt-1 text-[10px] text-emerald-400">{metric}</p>
    </article>
  );
}

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("ENABLE") || normalized.includes("DELIVERY_OK")) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  }
  if (normalized.includes("FROZEN")) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-400";
  }
  return "border-slate-600/30 bg-slate-500/10 text-slate-500";
}

function CreativeThumbnail({ url, fallback }: { url: string | null; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="px-3 text-center">
        <Video className="mx-auto h-7 w-7 text-slate-700" />
        <p className="mt-2 text-[9px] text-slate-700">{fallback}</p>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-[190px] w-[104px] object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

type TrendRow = {
  date: string;
  spend: number;
  leads: number;
  impressions: number;
  reach: number;
  clicks: number;
  engagements: number;
};

function aggregateTrend(rows: TrendRow[]) {
  const byDate = new Map<string, TrendRow>();
  for (const row of rows) {
    const current = byDate.get(row.date) ?? {
      date: row.date,
      spend: 0,
      leads: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      engagements: 0,
    };
    current.spend += row.spend;
    current.leads += row.leads;
    current.impressions += row.impressions;
    current.reach += row.reach;
    current.clicks += row.clicks;
    current.engagements += row.engagements;
    byDate.set(row.date, current);
  }
  return Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(row => ({
      ...row,
      spend: Math.round(row.spend * 100) / 100,
      leads: Math.round(row.leads * 100) / 100,
      cpl: row.leads > 0 ? Math.round((row.spend / row.leads) * 100) / 100 : null,
      ctr: row.impressions > 0 ? Math.round((row.clicks / row.impressions) * 10_000) / 100 : 0,
    }));
}

export function TikTokAdsLoading({ locale = "pt-BR" }: { locale?: Locale }) {
  const t = TIKTOK_ADS_COPY[locale];
  return (
    <main className="mx-auto grid min-h-[620px] max-w-[1680px] place-items-center px-4">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#25f4ee]" />
        <p className="mt-3 text-xs text-slate-500">{t.loading}</p>
      </div>
    </main>
  );
}

export function TikTokAdsError({ locale = "pt-BR", onRetry }: { locale?: Locale; onRetry: () => void }) {
  const t = TIKTOK_ADS_COPY[locale];
  return (
    <main className="mx-auto max-w-[1680px] px-4 py-8">
      <div className="grid min-h-[480px] place-items-center rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-9 w-9 text-red-400" />
          <h1 className="mt-3 text-base font-semibold text-white">{t.errorTitle}</h1>
          <p className="mt-1 text-xs text-slate-500">{t.errorDescription}</p>
          <Button onClick={onRetry} className="mt-5 bg-[#fe2c55] hover:bg-[#db1f45]">
            <RefreshCcw className="mr-2 h-4 w-4" />{t.refresh}
          </Button>
        </div>
      </div>
    </main>
  );
}

export function TikTokAdsDashboard({ locale = "pt-BR", onUpdatedAt }: TikTokAdsDashboardProps) {
  const t = TIKTOK_ADS_COPY[locale];
  const utils = trpc.useUtils();
  const bounds = trpc.tiktokAds.bounds.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const [dateFrom, setDateFrom] = useState(FALLBACK_FROM);
  const [dateTo, setDateTo] = useState(FALLBACK_TO);
  const [preset, setPreset] = useState("month");
  const [initialized, setInitialized] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedAdGroup, setSelectedAdGroup] = useState("all");
  const dateFromInputRef = useRef<HTMLInputElement>(null);
  const dateToInputRef = useRef<HTMLInputElement>(null);
  const latestSelectableDate =
    bounds.data?.latestDate && bounds.data.latestDate < FALLBACK_TO
      ? bounds.data.latestDate
      : FALLBACK_TO;

  useEffect(() => {
    if (initialized || !bounds.data) return;
    const latest = latestSelectableDate;
    const monthStart = `${latest.slice(0, 7)}-01`;
    setDateFrom(monthStart < bounds.data.earliestDate ? bounds.data.earliestDate : monthStart);
    setDateTo(latest);
    setInitialized(true);
  }, [bounds.data, initialized, latestSelectableDate]);

  const queryInput = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const query = trpc.tiktokAds.data.useQuery(queryInput, {
    retry: 1,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const refresh = trpc.tiktokAds.refresh.useMutation({
    onSuccess: refreshed => {
      utils.tiktokAds.data.setData(queryInput, refreshed);
      onUpdatedAt?.(refreshed.metadata.updatedAt);
    },
  });
  const data = query.data;

  useEffect(() => {
    if (data?.metadata.updatedAt) onUpdatedAt?.(data.metadata.updatedAt);
  }, [data?.metadata.updatedAt, onUpdatedAt]);

  const availableAdGroups = useMemo(() => {
    if (!data) return [];
    return selectedCampaign === "all"
      ? data.adGroups
      : data.adGroups.filter(item => item.campaignId === selectedCampaign);
  }, [data, selectedCampaign]);

  useEffect(() => {
    if (
      selectedAdGroup !== "all" &&
      !availableAdGroups.some(item => item.id === selectedAdGroup)
    ) {
      setSelectedAdGroup("all");
    }
  }, [availableAdGroups, selectedAdGroup]);

  const trend = useMemo(() => {
    if (!data) return [];
    if (selectedAdGroup !== "all") {
      return aggregateTrend(
        data.dailyBreakdown.adGroups.filter(item => item.adGroupId === selectedAdGroup),
      );
    }
    if (selectedCampaign !== "all") {
      return aggregateTrend(
        data.dailyBreakdown.campaigns.filter(item => item.campaignId === selectedCampaign),
      );
    }
    return aggregateTrend(data.daily);
  }, [data, selectedAdGroup, selectedCampaign]);

  const selectedEntity = useMemo(() => {
    if (!data) return null;
    if (selectedAdGroup !== "all") {
      return data.adGroups.find(item => item.id === selectedAdGroup) ?? null;
    }
    if (selectedCampaign !== "all") {
      return data.campaigns.find(item => item.id === selectedCampaign) ?? null;
    }
    return null;
  }, [data, selectedAdGroup, selectedCampaign]);

  const viewSummary = data
    ? selectedEntity
      ? {
          spend: selectedEntity.spend,
          leads: selectedEntity.leads,
          cpl: selectedEntity.cpl,
          impressions: selectedEntity.impressions,
          reach: selectedEntity.reach,
          clicks: selectedEntity.clicks,
          ctr: selectedEntity.ctr,
          engagements: selectedEntity.engagements,
        }
      : data.summary
    : null;

  const filteredCampaigns = data
    ? selectedCampaign === "all"
      ? data.campaigns
      : data.campaigns.filter(item => item.id === selectedCampaign)
    : [];
  const filteredAds = data
    ? data.ads.filter(
        item =>
          (selectedCampaign === "all" || item.campaignId === selectedCampaign) &&
          (selectedAdGroup === "all" || item.adGroupId === selectedAdGroup),
      )
    : [];
  const filteredAdGroups =
    selectedAdGroup === "all"
      ? availableAdGroups
      : availableAdGroups.filter(item => item.id === selectedAdGroup);
  const viewModels = data
    ? selectedEntity
      ? Array.from(
          filteredAds.reduce(
            (models, ad) => {
              const current = models.get(ad.model) ?? {
                model: ad.model,
                ads: 0,
                spend: 0,
                leads: 0,
                cpl: null as number | null,
              };
              current.ads += 1;
              current.spend += ad.spend;
              current.leads += ad.leads;
              current.cpl = current.leads > 0 ? current.spend / current.leads : null;
              models.set(ad.model, current);
              return models;
            },
            new Map<string, { model: string; ads: number; spend: number; leads: number; cpl: number | null }>(),
          ).values(),
        ).sort((left, right) => right.leads - left.leads)
      : data.models
    : [];
  const leadingAdGroup =
    filteredAdGroups.slice().sort((left, right) => right.leads - left.leads)[0] ?? null;
  const leadingAd = filteredAds.slice().sort((left, right) => right.leads - left.leads)[0] ?? null;

  function applyPreset(value: string) {
    const latest = latestSelectableDate;
    const earliest = bounds.data?.earliestDate ?? FALLBACK_FROM;
    setPreset(value);
    setDateTo(latest);
    if (value === "month") {
      const monthStart = `${latest.slice(0, 7)}-01`;
      setDateFrom(monthStart < earliest ? earliest : monthStart);
      return;
    }
    const start = addDays(latest, -(Number.parseInt(value, 10) - 1));
    setDateFrom(start < earliest ? earliest : start);
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

  if ((bounds.isLoading && !initialized) || query.isLoading) return <TikTokAdsLoading locale={locale} />;
  if (query.error) return <TikTokAdsError locale={locale} onRetry={() => query.refetch()} />;
  if (!data?.daily.length || !viewSummary) {
    return (
      <main className="mx-auto max-w-[1680px] px-4 py-8">
        <Panel title={t.title} subtitle={`${t.period}: ${formatLongDate(dateFrom, locale)} — ${formatLongDate(dateTo, locale)}`}>
          <div className="grid min-h-[320px] place-items-center px-6 text-center">
            <div><BarChart3 className="mx-auto h-8 w-8 text-slate-700" /><h2 className="mt-3 text-sm font-semibold text-white">{t.emptyTitle}</h2><p className="mt-1 text-xs text-slate-600">{t.emptyDescription}</p></div>
          </div>
        </Panel>
      </main>
    );
  }

  const selectionLabel = selectedEntity ? t.selectionFiltered : t.selectionTotal;
  const metricCards = [
    { title: t.investment, value: formatCurrency(viewSummary.spend, locale), subtitle: `${selectionLabel} • ${data.account.currency}`, icon: <CircleDollarSign className="h-4 w-4" />, accent: ACCENT_RED },
    { title: t.leads, value: formatNumber(viewSummary.leads, locale), subtitle: "onsite_form", icon: <Target className="h-4 w-4" />, accent: ACCENT },
    { title: t.cpl, value: viewSummary.cpl == null ? "—" : formatCurrency(viewSummary.cpl, locale), subtitle: `${t.investment} ÷ ${t.leads}`, icon: <Gauge className="h-4 w-4" />, accent: "#a78bfa" },
    { title: t.reach, value: formatNumber(viewSummary.reach, locale), subtitle: `${formatNumber(viewSummary.impressions, locale)} ${t.impressions.toLowerCase()}`, icon: <Eye className="h-4 w-4" />, accent: "#10b981" },
    { title: t.ctr, value: `${formatNumber(viewSummary.ctr, locale, 2)}%`, subtitle: `${formatNumber(viewSummary.clicks, locale)} ${t.clicks.toLowerCase()}`, icon: <MousePointerClick className="h-4 w-4" />, accent: "#f59e0b" },
    { title: t.engagements, value: formatNumber(viewSummary.engagements, locale), subtitle: selectionLabel, icon: <PlayCircle className="h-4 w-4" />, accent: "#60a5fa" },
  ];

  const insightCards = [
    leadingAdGroup ? { label: t.topGroup, value: leadingAdGroup.name, metric: `${formatNumber(leadingAdGroup.leads, locale)} ${t.leads} • CPL ${leadingAdGroup.cpl == null ? "—" : formatCurrency(leadingAdGroup.cpl, locale)}`, icon: <UsersRound className="h-3.5 w-3.5 text-[#25f4ee]" /> } : null,
    leadingAd ? { label: t.topCreative, value: leadingAd.name, metric: `${formatNumber(leadingAd.leads, locale)} ${t.leads} • ${formatNumber(leadingAd.engagements, locale)} ${t.engagements.toLowerCase()}`, icon: <Video className="h-3.5 w-3.5 text-[#fe2c55]" /> } : null,
    data.highlights.topGender ? { label: t.topGender, value: formatTikTokGender(data.highlights.topGender.gender, locale), metric: `${formatNumber(data.highlights.topGender.conversions, locale)} ${t.attributedConversions.toLowerCase()}`, icon: <UsersRound className="h-3.5 w-3.5 text-[#a78bfa]" /> } : null,
    data.highlights.topAge ? { label: t.topAge, value: formatTikTokAge(data.highlights.topAge.age), metric: `${formatNumber(data.highlights.topAge.conversions, locale)} ${t.attributedConversions.toLowerCase()}`, icon: <BarChart3 className="h-3.5 w-3.5 text-[#f59e0b]" /> } : null,
    data.highlights.topRegion ? { label: t.topRegion, value: formatTikTokRegion(data.highlights.topRegion.region, locale), metric: `${formatNumber(data.highlights.topRegion.conversions, locale)} ${t.attributedConversions.toLowerCase()}`, icon: <MapPin className="h-3.5 w-3.5 text-[#10b981]" /> } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; metric: string; icon: ReactNode }>;

  return (
    <main className="mx-auto max-w-[1680px] px-4 pb-12 pt-5 lg:px-6" data-testid="tiktok-ads-dashboard">
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#25f4ee]"><Megaphone className="h-3.5 w-3.5" />{t.eyebrow}</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">{t.title}</h1>
          <p className="mt-1 text-[11px] text-slate-600">MG Motors • {formatLongDate(dateFrom, locale)} — {formatLongDate(dateTo, locale)} • {t.cutoff}: {formatLongDate(FALLBACK_TO, locale)}</p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[#242f42] bg-[#0d1421] p-1" aria-label={t.period}>
              {["7", "14", "30", "60"].map(value => <button key={value} type="button" onClick={() => applyPreset(value)} className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${preset === value ? "bg-[#fe2c55] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}>{value}d</button>)}
              <button type="button" onClick={() => applyPreset("month")} className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] font-semibold transition-colors ${preset === "month" ? "bg-[#fe2c55] text-white" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}>{t.month}</button>
            </div>
            <div className="flex items-stretch rounded-lg border border-[#242f42] bg-[#0d1421]">
              <div className="flex cursor-pointer items-center gap-2 rounded-l-lg px-3 py-1.5 hover:bg-white/[0.03]" onClick={() => openNativeDatePicker(dateFromInputRef.current)}>
                <CalendarDays className="pointer-events-none h-3.5 w-3.5 shrink-0 text-slate-600" />
                <input ref={dateFromInputRef} aria-label={`${t.period} start`} type="date" min={bounds.data?.earliestDate} max={dateTo} value={dateFrom} onChange={event => updateFrom(event.target.value)} className="w-[116px] min-w-0 cursor-pointer bg-transparent text-[10px] text-slate-300 outline-none [color-scheme:dark]" />
              </div>
              <span className="flex items-center text-slate-700">—</span>
              <div className="flex cursor-pointer items-center rounded-r-lg px-3 py-1.5 hover:bg-white/[0.03]" onClick={() => openNativeDatePicker(dateToInputRef.current)}>
                <input ref={dateToInputRef} aria-label={`${t.period} end`} type="date" min={dateFrom} max={latestSelectableDate} value={dateTo} onChange={event => updateTo(event.target.value)} className="w-[116px] min-w-0 cursor-pointer bg-transparent text-[10px] text-slate-300 outline-none [color-scheme:dark]" />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refresh.mutate(queryInput)} disabled={refresh.isPending || query.isFetching} className="h-8 border-[#283349] bg-[#111827] text-[10px] text-slate-400 hover:bg-[#182236] hover:text-white"><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending || query.isFetching ? "animate-spin" : ""}`} />{t.refresh}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-slate-600">
            <span className="flex items-center gap-1.5 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{data.metadata.source === "windsor-live" ? t.sourceLive : t.sourceSnapshot}</span>
            <span>{t.through}: {formatLongDate(data.metadata.dataThroughDate, locale)}</span>
            <span>{t.updated}: {new Date(data.metadata.updatedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</span>
            {refresh.error ? <span className="text-red-400">{refresh.error.message}</span> : null}
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metricCards.map(card => <MetricCard key={card.title} {...card} />)}</div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-[#1d2737] bg-[#0d1421] p-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {t.campaign}
          <select aria-label={t.campaign} value={selectedCampaign} onChange={event => { setSelectedCampaign(event.target.value); setSelectedAdGroup("all"); }} className="mt-1 h-9 w-full rounded-lg border border-[#283349] bg-[#0a101b] px-3 text-[10px] font-normal normal-case tracking-normal text-slate-300 outline-none focus:border-[#25f4ee]/50">
            <option value="all">{t.allCampaigns}</option>
            {data.campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {t.adGroup}
          <select aria-label={t.adGroup} value={selectedAdGroup} onChange={event => setSelectedAdGroup(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#283349] bg-[#0a101b] px-3 text-[10px] font-normal normal-case tracking-normal text-slate-300 outline-none focus:border-[#25f4ee]/50">
            <option value="all">{t.allAdGroups}</option>
            {availableAdGroups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title={t.spendLeadsTitle} subtitle={t.spendLeadsSubtitle}>
          <div className="h-[350px] px-2 pb-4 pt-5 sm:px-4"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trend} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={value => formatDate(value, locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} /><YAxis yAxisId="money" tickFormatter={value => formatCurrency(Number(value), locale, true)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={68} /><YAxis yAxisId="leads" orientation="right" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={38} /><Tooltip content={<TikTokTooltip locale={locale} />} /><Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} /><Bar yAxisId="money" dataKey="spend" name={t.investment} fill={ACCENT_RED} radius={[4, 4, 0, 0]} maxBarSize={26} /><Line yAxisId="leads" type="monotone" dataKey="leads" name={t.leads} stroke={ACCENT} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div>
        </Panel>
        <Panel title={t.dailyCplTitle} subtitle={t.dailyCplSubtitle}>
          <div className="h-[350px] px-2 pb-4 pt-5 sm:px-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="tiktok-cpl-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={value => formatDate(value, locale)} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis tickFormatter={value => formatCurrency(Number(value), locale, true)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={68} /><Tooltip content={<TikTokTooltip locale={locale} />} /><Area type="monotone" dataKey="cpl" name="CPL" stroke="#a78bfa" strokeWidth={2.5} fill="url(#tiktok-cpl-gradient)" connectNulls /></AreaChart></ResponsiveContainer></div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title={t.modelsTitle} subtitle={t.modelsSubtitle}>
          <div className="h-[330px] px-2 pb-4 pt-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={viewModels} layout="vertical" margin={{ right: 24, left: 12 }}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="model" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={82} /><Tooltip content={<TikTokTooltip locale={locale} />} /><Bar dataKey="leads" name={t.leads} radius={[0, 5, 5, 0]} maxBarSize={28}>{viewModels.map(item => <Cell key={item.model} fill={MODEL_COLORS[item.model] ?? MODEL_COLORS.Outros} />)}</Bar></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title={t.campaignsTitle} subtitle={t.campaignsSubtitle}>
          <DataTable emptyLabel={t.noItems} columns={[t.campaign, t.investment, t.leads, "CPL", t.reach, "Status"]} rows={filteredCampaigns.map(item => [<div><p className="max-w-[360px] font-medium text-slate-200">{item.name}</p><p className="mt-0.5 text-[8px] text-slate-700">{item.objective || item.id}</p></div>, formatCurrency(item.spend, locale), formatNumber(item.leads, locale), item.cpl == null ? "—" : formatCurrency(item.cpl, locale), formatNumber(item.reach, locale), <span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${statusClass(item.status)}`}>{formatTikTokStatus(item.status, locale)}</span>])} />
        </Panel>
      </div>

      <Panel title={t.groupsTitle} subtitle={t.groupsSubtitle} className="mt-4">
        <DataTable emptyLabel={t.noItems} columns={[t.adGroup, t.campaign, t.investment, t.leads, "CPL", "Placement", "Status"]} rows={filteredAdGroups.map(item => [<div className="max-w-[390px]"><p className="font-medium text-slate-200">{item.name}</p><p className="mt-0.5 text-[8px] text-slate-700">{item.bidStrategy || item.id}</p></div>, <span className="max-w-[260px] text-slate-500">{item.campaignName}</span>, formatCurrency(item.spend, locale), formatNumber(item.leads, locale), item.cpl == null ? "—" : formatCurrency(item.cpl, locale), item.placement || "—", <span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${statusClass(item.deliveryStatus)}`}>{formatTikTokStatus(item.deliveryStatus, locale)}</span>])} />
      </Panel>

      <Panel title={t.creativesTitle} subtitle={t.creativesSubtitle} className="mt-4">
        {filteredAds.length ? (
          <div className="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredAds.map(ad => (
              <article key={ad.id} className="grid min-h-[210px] grid-cols-[112px_1fr] overflow-hidden rounded-xl border border-[#202b3d] bg-[#0a101b]">
                <div className="grid min-h-[210px] place-items-center border-r border-[#202b3d] bg-black/30">
                  <CreativeThumbnail url={ad.thumbnailUrl} fallback={t.thumbnailUnavailable} />
                </div>
                <div className="min-w-0 p-4">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="line-clamp-2 text-sm font-semibold leading-5 text-white">{ad.name}</p><p className="mt-1 text-[8px] text-slate-700">{ad.model} • {ad.id}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-semibold ${statusClass(ad.deliveryStatus)}`}>{formatTikTokStatus(ad.deliveryStatus, locale)}</span></div>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[9px]"><div><p className="uppercase tracking-[0.1em] text-slate-700">{t.investment}</p><p className="mt-1 font-semibold text-slate-300">{formatCurrency(ad.spend, locale)}</p></div><div><p className="uppercase tracking-[0.1em] text-slate-700">{t.leads}</p><p className="mt-1 font-semibold text-slate-300">{formatNumber(ad.leads, locale)}</p></div><div><p className="uppercase tracking-[0.1em] text-slate-700">CPL</p><p className="mt-1 font-semibold text-slate-300">{ad.cpl == null ? "—" : formatCurrency(ad.cpl, locale)}</p></div><div><p className="uppercase tracking-[0.1em] text-slate-700">{t.engagements}</p><p className="mt-1 font-semibold text-slate-300">{formatNumber(ad.engagements, locale)}</p></div></div>
                  <p className="mt-4 line-clamp-2 text-[9px] leading-4 text-slate-600">{ad.text || ad.adGroupName || ad.campaignName}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="grid min-h-[180px] place-items-center text-xs text-slate-600">{t.noItems}</div>}
      </Panel>

      <Panel title={t.audienceTitle} subtitle={`${t.audienceSubtitle} • ${t.selectionTotal}`} className="mt-4">
        <div className="grid gap-3 border-b border-[#1b2535] p-4 sm:grid-cols-2 xl:grid-cols-5">{insightCards.map(card => <InsightCard key={card.label} {...card} />)}</div>
        <div className="grid xl:grid-cols-3">
          <div className="min-h-[340px] border-b border-[#1b2535] p-4 xl:border-b-0 xl:border-r"><h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.gender}</h3><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.demographics.genders} dataKey="conversions" nameKey="gender" innerRadius={62} outerRadius={95} paddingAngle={3}>{data.demographics.genders.map((item, index) => <Cell key={item.gender} fill={AUDIENCE_COLORS[index % AUDIENCE_COLORS.length]} />)}</Pie><Tooltip formatter={(value, _name, item) => [formatNumber(Number(value), locale), formatTikTokGender(String(item.payload.gender), locale)]} contentStyle={{ background: "#080d16", border: "1px solid #2a364b", borderRadius: 8, fontSize: 10 }} /><Legend formatter={value => formatTikTokGender(String(value), locale)} wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></div></div>
          <div className="min-h-[340px] border-b border-[#1b2535] p-4 xl:border-b-0 xl:border-r"><h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.age}</h3><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.demographics.ages}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="age" tickFormatter={formatTikTokAge} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={36} /><Tooltip content={<TikTokTooltip locale={locale} />} /><Bar dataKey="conversions" name={t.attributedConversions} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={30} /></BarChart></ResponsiveContainer></div></div>
          <div className="min-h-[340px] p-4"><h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.region}</h3><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.regions.filter(item => item.region !== "Não informado").slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid stroke="#1d2737" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="region" tickFormatter={value => formatTikTokRegion(String(value), locale)} width={92} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} /><Tooltip formatter={value => formatNumber(Number(value), locale)} labelFormatter={value => formatTikTokRegion(String(value), locale)} contentStyle={{ background: "#080d16", border: "1px solid #2a364b", borderRadius: 8, fontSize: 10 }} /><Bar dataKey="conversions" name={t.attributedConversions} fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer></div></div>
        </div>
        <div className="flex items-start gap-2 border-t border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 text-[10px] leading-5 text-amber-100/70"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />{t.segmentedNote}</div>
      </Panel>
    </main>
  );
}
