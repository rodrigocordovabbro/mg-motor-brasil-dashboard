import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Film,
  ImageIcon,
  Images,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Inventory = RouterOutputs["metaAds"]["creativeInventory"];
type InventoryItem = Inventory["creatives"][number];
type PerformanceCreative = RouterOutputs["metaAds"]["data"]["creatives"][number];
type Locale = "pt-BR" | "en-US";
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type FormatFilter = "ALL" | InventoryItem["format"];

type MetaCreativeInventoryPanelProps = {
  locale: Locale;
  performanceCreatives: PerformanceCreative[];
};

const COPY = {
  "pt-BR": {
    title: "Inventário completo de criativos",
    subtitle:
      "Todos os anúncios acessíveis da conta, inclusive sem métricas no período selecionado.",
    loading: "Carregando o inventário completo do Meta Ads...",
    loadingDetail: "A primeira atualização pode levar até um minuto; os KPIs acima continuam disponíveis.",
    errorTitle: "Não foi possível carregar o inventário de criativos",
    errorDescription: "A conexão pode estar temporariamente indisponível. O último snapshot não foi encontrado.",
    retry: "Tentar novamente",
    allInactiveTitle: "Criativos desativados no momento",
    allInactiveDescription: (total: number) =>
      `Os ${total} anúncios acessíveis foram carregados, mas nenhum possui campanha, conjunto e anúncio simultaneamente ativos.`,
    partialInactiveDescription: (inactive: number, total: number) =>
      `${inactive} de ${total} anúncios estão desativados em algum nível da estrutura.`,
    coverage: "Cobertura",
    ads: "anúncios",
    uniqueCreatives: "criativos únicos",
    withPreview: "com prévia",
    withoutPreview: "sem prévia",
    updated: "Atualizado",
    live: "Fonte ao vivo",
    snapshot: "Snapshot persistente",
    stale: "Snapshot anterior",
    search: "Buscar campanha, conjunto, anúncio ou ID",
    allStatuses: "Todos os status",
    active: "Ativos",
    inactive: "Desativados",
    allFormats: "Todos os formatos",
    image: "Imagem",
    video: "Vídeo",
    carousel: "Carrossel",
    unknown: "Formato não informado",
    showing: "Exibindo",
    of: "de",
    noResults: "Nenhum criativo corresponde aos filtros atuais.",
    showMore: "Mostrar mais criativos",
    adId: "ID do anúncio",
    creativeId: "ID do criativo",
    campaign: "Campanha",
    adset: "Conjunto",
    previewUnavailable: "Prévia não disponível na fonte",
    cards: "cartões",
    cardDetails: "Ver cartões do carrossel",
    cardPreviewUnavailable: "URL individual não disponibilizada",
    openPost: "Abrir publicação",
    openVideoPreview: "Abrir prévia de vídeo",
    performancePeriod: "Desempenho no período selecionado",
    leads: "Leads",
    noPerformance: "Sem desempenho reportado no período selecionado",
  },
  "en-US": {
    title: "Complete creative inventory",
    subtitle:
      "All accessible ads in the account, including ads without reported metrics in the selected period.",
    loading: "Loading the complete Meta Ads inventory...",
    loadingDetail: "The first refresh can take up to one minute; the KPIs above remain available.",
    errorTitle: "Creative inventory could not be loaded",
    errorDescription: "The connection may be temporarily unavailable and no previous snapshot was found.",
    retry: "Try again",
    allInactiveTitle: "Creatives are currently disabled",
    allInactiveDescription: (total: number) =>
      `All ${total} accessible ads were loaded, but none has campaign, ad set and ad simultaneously active.`,
    partialInactiveDescription: (inactive: number, total: number) =>
      `${inactive} of ${total} ads are disabled at some level of the structure.`,
    coverage: "Coverage",
    ads: "ads",
    uniqueCreatives: "unique creatives",
    withPreview: "with preview",
    withoutPreview: "without preview",
    updated: "Updated",
    live: "Live source",
    snapshot: "Persistent snapshot",
    stale: "Previous snapshot",
    search: "Search campaign, ad set, ad or ID",
    allStatuses: "All statuses",
    active: "Active",
    inactive: "Disabled",
    allFormats: "All formats",
    image: "Image",
    video: "Video",
    carousel: "Carousel",
    unknown: "Format unavailable",
    showing: "Showing",
    of: "of",
    noResults: "No creatives match the current filters.",
    showMore: "Show more creatives",
    adId: "Ad ID",
    creativeId: "Creative ID",
    campaign: "Campaign",
    adset: "Ad set",
    previewUnavailable: "Preview unavailable from source",
    cards: "cards",
    cardDetails: "View carousel cards",
    cardPreviewUnavailable: "Individual URL unavailable",
    openPost: "Open post",
    openVideoPreview: "Open video preview",
    performancePeriod: "Performance in selected period",
    leads: "Leads",
    noPerformance: "No performance reported in the selected period",
  },
} as const;

function formatDateTime(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatLabel(format: InventoryItem["format"], locale: Locale) {
  const t = COPY[locale];
  if (format === "IMAGE") return t.image;
  if (format === "VIDEO") return t.video;
  if (format === "CAROUSEL") return t.carousel;
  return t.unknown;
}

function formatIcon(format: InventoryItem["format"]) {
  if (format === "VIDEO") return Film;
  if (format === "CAROUSEL") return Images;
  return ImageIcon;
}

function statusClasses(item: InventoryItem) {
  if (item.isActive) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (item.operationalStatus === "CAMPAIGN_PAUSED") {
    return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  }
  return "border-red-400/25 bg-red-400/10 text-red-300";
}

function CreativeMedia({ item, locale }: { item: InventoryItem; locale: Locale }) {
  const t = COPY[locale];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.previewUrl, item.mediaUrl]);

  const playableVideo = item.format === "VIDEO" && item.mediaUrl && !failed;
  const image = item.previewUrl && !failed;

  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#111a2a]">
      {playableVideo ? (
        <video
          className="h-full w-full object-cover"
          controls
          playsInline
          preload="metadata"
          poster={item.thumbnailUrl ?? undefined}
          src={item.mediaUrl ?? undefined}
          onError={() => setFailed(true)}
        />
      ) : image ? (
        <img
          className="h-full w-full object-cover"
          src={item.previewUrl ?? undefined}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <ImageIcon className="mx-auto h-8 w-8 text-slate-700" />
            <p className="mt-2 text-[10px] text-slate-600">{t.previewUnavailable}</p>
          </div>
        </div>
      )}
      {item.carouselCardCount > 0 ? (
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">
          {item.carouselCardCount} {t.cards}
        </span>
      ) : null}
    </div>
  );
}

function CoverageStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-[#1d293b] bg-[#090f1a] px-3 py-2.5">
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-600">{label}</p>
    </div>
  );
}

function CreativeCard({
  item,
  locale,
  performance,
}: {
  item: InventoryItem;
  locale: Locale;
  performance?: PerformanceCreative;
}) {
  const t = COPY[locale];
  const FormatIcon = formatIcon(item.format);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#202b3d] bg-[#0a101b] shadow-[0_14px_36px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-[#34435b]">
      <CreativeMedia item={item} locale={locale} />
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] ${statusClasses(item)}`}>
            {item.operationalLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            <FormatIcon className="h-3 w-3" />
            {formatLabel(item.format, locale)}
          </span>
        </div>

        <h3 className="mt-3 line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-white" title={item.name}>
          {item.name}
        </h3>
        <dl className="mt-3 space-y-2 text-[9px] leading-4">
          <div>
            <dt className="text-slate-700">{t.campaign}</dt>
            <dd className="truncate text-slate-400" title={item.campaignName}>{item.campaignName}</dd>
          </div>
          <div>
            <dt className="text-slate-700">{t.adset}</dt>
            <dd className="truncate text-slate-400" title={item.adsetName}>{item.adsetName}</dd>
          </div>
        </dl>

        <div className="mt-3 rounded-lg border border-[#172235] bg-[#070c14] px-3 py-2 font-mono text-[8px] leading-4 text-slate-600">
          <p className="truncate" title={item.adId}>{t.adId}: {item.adId || "—"}</p>
          <p className="truncate" title={item.creativeId}>{t.creativeId}: {item.creativeId || "—"}</p>
        </div>

        {performance ? (
          <div className="mt-4 border-t border-[#1b2535] pt-3">
            <p className="text-[8px] uppercase tracking-[0.12em] text-slate-700">{t.performancePeriod}</p>
            <div className="mt-2 text-center">
              <p className="text-[8px] text-slate-700">{t.leads}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">{formatNumber(performance.leads, locale)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 border-t border-[#1b2535] pt-3 text-[9px] text-slate-700">{t.noPerformance}</p>
        )}

        {item.cards.length > 0 ? (
          <details className="group mt-4 rounded-xl border border-[#1d293b] bg-[#080e18] p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[9px] font-semibold text-slate-400">
              {t.cardDetails}
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ol className="mt-3 space-y-2 border-t border-[#172235] pt-3">
              {item.cards.map(card => (
                <li key={`${item.id}-card-${card.position}`} className="flex items-start justify-between gap-3 text-[9px]">
                  <div className="min-w-0">
                    <p className="truncate text-slate-400">{card.position}. {card.name || `${t.carousel} ${card.position}`}</p>
                    <p className="text-[8px] text-slate-700">{card.previewUrl ? t.withPreview : t.cardPreviewUnavailable}</p>
                  </div>
                  {card.link ? <a href={card.link} target="_blank" rel="noreferrer" className="shrink-0 text-slate-500 hover:text-white"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        {item.permalinkUrl || item.videoPreviewUrl ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {item.permalinkUrl ? (
              <a href={item.permalinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#26344a] px-2.5 py-2 text-[9px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-white">
                <ExternalLink className="h-3 w-3" />{t.openPost}
              </a>
            ) : null}
            {item.videoPreviewUrl ? (
              <a href={item.videoPreviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#26344a] px-2.5 py-2 text-[9px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-white">
                <Film className="h-3 w-3" />{t.openVideoPreview}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function MetaCreativeInventoryPanel({
  locale,
  performanceCreatives,
}: MetaCreativeInventoryPanelProps) {
  const t = COPY[locale];
  const query = trpc.metaAds.creativeInventory.useQuery(undefined, {
    retry: 1,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [format, setFormat] = useState<FormatFilter>("ALL");
  const [visibleCount, setVisibleCount] = useState(12);

  const performanceByAd = useMemo(
    () => new Map(performanceCreatives.map(item => [item.adId, item])),
    [performanceCreatives],
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase(locale);
    return (query.data?.creatives ?? []).filter(item => {
      if (status === "ACTIVE" && !item.isActive) return false;
      if (status === "INACTIVE" && item.isActive) return false;
      if (format !== "ALL" && item.format !== format) return false;
      if (!normalizedSearch) return true;
      return [
        item.name,
        item.campaignName,
        item.adsetName,
        item.adId,
        item.creativeId,
      ].some(value => value.toLocaleLowerCase(locale).includes(normalizedSearch));
    });
  }, [format, locale, query.data?.creatives, search, status]);

  useEffect(() => setVisibleCount(12), [search, status, format]);

  if (query.isLoading) {
    return (
      <section className="mt-4 overflow-hidden rounded-2xl border border-[#202b3d] bg-[#0b111d]">
        <div className="grid min-h-[300px] place-items-center px-6 text-center">
          <div>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" />
            <h2 className="mt-4 text-sm font-semibold text-white">{t.loading}</h2>
            <p className="mx-auto mt-1 max-w-md text-[10px] leading-5 text-slate-600">{t.loadingDetail}</p>
          </div>
        </div>
      </section>
    );
  }

  if (query.error || !query.data) {
    return (
      <section className="mt-4 overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/[0.035]">
        <div className="grid min-h-[300px] place-items-center px-6 text-center">
          <div>
            <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
            <h2 className="mt-3 text-sm font-semibold text-white">{t.errorTitle}</h2>
            <p className="mx-auto mt-1 max-w-md text-[10px] leading-5 text-slate-600">{t.errorDescription}</p>
            <Button onClick={() => query.refetch()} className="mt-5 bg-[#e2212d] hover:bg-[#c91622]">
              <RefreshCcw className="mr-2 h-4 w-4" />{t.retry}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const data = query.data;
  const allInactive = data.coverage.totalAds > 0 && data.coverage.activeAds === 0;
  const visible = filtered.slice(0, visibleCount);
  const sourceLabel = data.metadata.stale
    ? t.stale
    : data.metadata.source === "windsor-live"
      ? t.live
      : t.snapshot;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[#202b3d] bg-[#0b111d]">
      <header className="border-b border-[#1b2535] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">{t.title}</h2>
              <span className="rounded-full border border-[#2a384f] bg-[#111a29] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                {data.coverage.totalAds} {t.ads}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-600">{t.subtitle}</p>
          </div>
          <div className="text-left text-[9px] leading-4 text-slate-600 xl:text-right">
            <p>{sourceLabel}</p>
            <p>{t.updated}: {formatDateTime(data.metadata.updatedAt, locale)}</p>
          </div>
        </div>

        {data.coverage.totalAds > 0 ? (
          <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${allInactive ? "border-amber-400/25 bg-amber-400/[0.07]" : "border-slate-500/20 bg-slate-500/[0.05]"}`}>
            {allInactive ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />}
            <div>
              <p className={`text-xs font-semibold ${allInactive ? "text-amber-200" : "text-slate-200"}`}>{allInactive ? t.allInactiveTitle : t.coverage}</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                {allInactive
                  ? t.allInactiveDescription(data.coverage.totalAds)
                  : t.partialInactiveDescription(data.coverage.inactiveAds, data.coverage.totalAds)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <CoverageStat value={data.coverage.totalAds} label={t.ads} />
          <CoverageStat value={data.coverage.uniqueCreatives} label={t.uniqueCreatives} />
          <CoverageStat value={data.coverage.activeAds} label={t.active} />
          <CoverageStat value={data.coverage.withPreview} label={t.withPreview} />
          <CoverageStat value={data.coverage.withoutPreview} label={t.withoutPreview} />
        </div>

        {data.warnings.length > 0 ? (
          <div className="mt-3 space-y-1 text-[9px] leading-4 text-slate-600">
            {data.warnings.map(warning => <p key={warning}>• {warning}</p>)}
          </div>
        ) : null}
      </header>

      <div className="border-b border-[#1b2535] p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="relative block">
            <span className="sr-only">{t.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t.search}
              className="h-10 w-full rounded-xl border border-[#26344a] bg-[#080e18] pl-9 pr-3 text-[10px] text-white outline-none transition placeholder:text-slate-700 focus:border-[#e2212d]/50 focus:ring-2 focus:ring-[#e2212d]/10"
            />
          </label>
          <select
            aria-label={t.allStatuses}
            value={status}
            onChange={event => setStatus(event.target.value as StatusFilter)}
            className="h-10 rounded-xl border border-[#26344a] bg-[#080e18] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]/50"
          >
            <option value="ALL">{t.allStatuses}</option>
            <option value="ACTIVE">{t.active}</option>
            <option value="INACTIVE">{t.inactive}</option>
          </select>
          <select
            aria-label={t.allFormats}
            value={format}
            onChange={event => setFormat(event.target.value as FormatFilter)}
            className="h-10 rounded-xl border border-[#26344a] bg-[#080e18] px-3 text-[10px] text-slate-300 outline-none focus:border-[#e2212d]/50"
          >
            <option value="ALL">{t.allFormats}</option>
            <option value="IMAGE">{t.image}</option>
            <option value="VIDEO">{t.video}</option>
            <option value="CAROUSEL">{t.carousel}</option>
            <option value="UNKNOWN">{t.unknown}</option>
          </select>
        </div>
        <p className="mt-3 text-[9px] text-slate-600">
          {t.showing} {Math.min(visible.length, filtered.length)} {t.of} {filtered.length} • {data.coverage.scope}
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(item => (
              <CreativeCard
                key={item.id}
                item={item}
                locale={locale}
                performance={performanceByAd.get(item.adId)}
              />
            ))}
          </div>
          {visibleCount < filtered.length ? (
            <div className="mt-5 text-center">
              <Button variant="outline" onClick={() => setVisibleCount(value => value + 12)} className="border-[#2a384f] bg-[#0c1421] text-slate-300 hover:bg-[#111c2d] hover:text-white">
                {t.showMore} ({filtered.length - visibleCount})
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid min-h-[220px] place-items-center px-6 text-center">
          <div><Search className="mx-auto h-7 w-7 text-slate-700" /><p className="mt-3 text-[10px] text-slate-600">{t.noResults}</p></div>
        </div>
      )}
    </section>
  );
}
