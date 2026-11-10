import type { V2Dashboard } from "@shared/v2Types";
import { buildOverviewDealerRankings } from "@shared/overviewDealerRankings";
import type { OverviewPdfLocale, OverviewPdfMetadata } from "./overviewPdf";

export type OverviewPdfReportInput = {
  document: Document;
  clone: HTMLElement;
  data: V2Dashboard;
  metadata: OverviewPdfMetadata;
  locale: OverviewPdfLocale;
};

type ReportLocale = OverviewPdfLocale;
type NullableNumber = number | null;
export type OverviewPdfHistoricalScenarioKey = "lastMonth" | "last3Months";

type ReportChannel = {
  key: string;
  count: number;
  color: string;
};

export type OverviewPdfReportModel = {
  locale: ReportLocale;
  selectedPeriod: {
    dateFrom: string;
    dateTo: string;
    multiMonth: boolean;
  };
  source: {
    latestLeadDate: string | null;
    checkedAt: string | null;
    lagging: boolean;
  };
  leads: {
    realized: NullableNumber;
    realizedScope: "month" | "selected-period";
    competence: string;
    asOfDate: string;
    goal: NullableNumber;
    projection: NullableNumber;
    projectedDifference: NullableNumber;
    projectedDifferenceRatio: NullableNumber;
    cumulativeDifference: NullableNumber;
    cumulativeDifferenceRatio: NullableNumber;
    targetAttainmentPercent: NullableNumber;
    historicalAvailable: boolean;
    historicalScope: "GLOBAL" | "FILTERED" | null;
    scenarioStatus:
      | "READY"
      | "NO_HISTORY"
      | "SOURCE_LAG"
      | "NO_SOURCE"
      | "UNAVAILABLE";
    scenarioWindow: OverviewPdfHistoricalScenarioKey | "fallback";
    scenarioKey: OverviewPdfHistoricalScenarioKey;
  };
  daily: {
    periodTotal: NullableNumber;
    activeChannelCount: NullableNumber;
    availableDayCount: number;
    channels: ReportChannel[];
  };
  sales: {
    goal: NullableNumber;
    registration: NullableNumber;
    retail: NullableNumber;
    conversionRate: NullableNumber;
    registrationAsOf: string | null;
    retailAsOf: string | null;
    comparable: boolean;
  };
  rankings: ReturnType<typeof buildOverviewDealerRankings>;
};

const RED = "#e2212d";
const BLUE = "#2563eb";
const GREEN = "#16a34a";
const INK = "#0f172a";
const MUTED = "#64748b";
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

const COPY = {
  "pt-BR": {
    report: "Visão Geral",
    cover: "Relatório executivo",
    prepared: "Dados autorizados",
    period: "Período selecionado",
    latestLead: "Último Lead",
    checkedAt: "Verificado em",
    filters: "Filtros",
    none: "Nenhum filtro aplicado",
    sourceLag:
      "A fonte de Leads está atrasada em relação ao fim do período selecionado.",
    sourceMissing:
      "A data do último Lead não está disponível; a projeção fica indisponível.",
    leads: "Leads",
    leadsSubtitle: "KPIs e curva acumulada",
    realizedMonth: "Leads realizados no mês",
    realizedPeriod: "Leads realizados no período",
    monthlyTarget: "Meta mensal",
    projectedClose: "Fechamento projetado",
    projectedVsGoal: "Projeção vs. meta",
    cumulativeDifference: "Diferença acumulada",
    attainment: "Atingimento da meta",
    historicalCurve: "Curva acumulada",
    historicalUnavailable: "Curva histórica indisponível",
    actual: "Realizado",
    planned: "Planejado",
    projection: "Projeção",
    target: "Meta",
    daily: "Leads diários",
    dailySubtitle: "Distribuição por canal",
    periodTotal: "Total do período",
    activeChannels: "Canais ativos",
    availableDays: "Dias disponíveis",
    dailyCurve: "Curva diária por canal",
    dailyUnavailable: "Gráfico diário indisponível",
    sales: "Vendas",
    salesSubtitle: "Meta, realizado e conversão",
    salesGoal: "Meta de vendas",
    registration: "Vendas totais (MTD Registration)",
    retail: "Retail",
    conversion: "Conversão",
    top: "Top 10 — Conversão",
    bottom: "Bottom 10 — Conversão",
    eligible: "unidades elegíveis",
    dealer: "Concessionária",
    leadsShort: "Leads",
    salesShort: "Vendas",
    noRanking: "N/A — ranking indisponível",
    noData: "N/A",
    sourceDate: "Fonte",
    page: "Página",
    of: "de",
    monthlyScope: "competência mensal",
    selectedScope: "escopo selecionado",
    unavailable: "indisponível",
    basedOnLastMonth: "Baseado no último mês",
    basedOnThreeMonths: "Baseado na média de 3 meses",
  },
  en: {
    report: "Overview",
    cover: "Executive report",
    prepared: "Authorized data",
    period: "Selected period",
    latestLead: "Latest Lead",
    checkedAt: "Checked at",
    filters: "Filters",
    none: "No filters applied",
    sourceLag: "The Lead source is behind the end of the selected period.",
    sourceMissing:
      "The latest Lead date is unavailable; the projection is not available.",
    leads: "Leads",
    leadsSubtitle: "KPIs and cumulative curve",
    realizedMonth: "Leads realized in month",
    realizedPeriod: "Leads realized in period",
    monthlyTarget: "Monthly target",
    projectedClose: "Projected close",
    projectedVsGoal: "Projection vs. target",
    cumulativeDifference: "Cumulative difference",
    attainment: "Target attainment",
    historicalCurve: "Cumulative curve",
    historicalUnavailable: "Historical curve unavailable",
    actual: "Actual",
    planned: "Planned",
    projection: "Projection",
    target: "Target",
    daily: "Daily Leads",
    dailySubtitle: "Distribution by channel",
    periodTotal: "Period total",
    activeChannels: "Active channels",
    availableDays: "Available days",
    dailyCurve: "Daily channel curve",
    dailyUnavailable: "Daily chart unavailable",
    sales: "Sales",
    salesSubtitle: "Target, actuals and conversion",
    salesGoal: "Sales target",
    registration: "Total sales (MTD Registration)",
    retail: "Retail",
    conversion: "Conversion",
    top: "Top 10 — Conversion",
    bottom: "Bottom 10 — Conversion",
    eligible: "eligible units",
    dealer: "Dealer",
    leadsShort: "Leads",
    salesShort: "Sales",
    noRanking: "N/A — ranking unavailable",
    noData: "N/A",
    sourceDate: "Source",
    page: "Page",
    of: "of",
    monthlyScope: "monthly competence",
    selectedScope: "selected scope",
    unavailable: "unavailable",
    basedOnLastMonth: "Based on last month",
    basedOnThreeMonths: "Based on 3-month average",
  },
} as const;

type Copy = (typeof COPY)[ReportLocale];

function copy(locale: ReportLocale): Copy {
  return COPY[locale];
}

function localeCode(locale: ReportLocale): "pt-BR" | "en-US" {
  return locale === "en" ? "en-US" : "pt-BR";
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : value;
}

function displayDate(
  value: string | null | undefined,
  locale: ReportLocale
): string {
  const candidate = dateOnly(value);
  if (!candidate) return copy(locale).noData;
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return candidate;
  return new Intl.DateTimeFormat(localeCode(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function displayTimestamp(
  value: string | null | undefined,
  locale: ReportLocale
): string {
  if (!value) return copy(locale).noData;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode(locale), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function numberText(
  value: number | null | undefined,
  locale: ReportLocale
): string {
  const safe = finite(value);
  return safe == null
    ? copy(locale).noData
    : new Intl.NumberFormat(localeCode(locale), {
        maximumFractionDigits: 0,
      }).format(safe);
}

function percentText(
  value: number | null | undefined,
  locale: ReportLocale,
  signed = false,
  digits = 1
): string {
  const safe = finite(value);
  if (safe == null) return copy(locale).noData;
  const absolute = Math.abs(safe);
  const rendered = new Intl.NumberFormat(localeCode(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(absolute * 100);
  if (!signed) return `${safe < 0 ? "−" : ""}${rendered}%`;
  return `${safe < 0 ? "−" : "+"}${rendered}%`;
}

function signedNumberText(
  value: number | null | undefined,
  locale: ReportLocale
): string {
  const safe = finite(value);
  if (safe == null) return copy(locale).noData;
  const rendered = new Intl.NumberFormat(localeCode(locale), {
    maximumFractionDigits: 0,
  }).format(Math.abs(safe));
  return `${safe < 0 ? "−" : "+"}${rendered}`;
}

function isFiltered(
  data: V2Dashboard,
  metadata?: Pick<OverviewPdfMetadata, "filterLabels">
): boolean {
  return (
    data.historicalPace?.scope === "FILTERED" ||
    Boolean(metadata?.filterLabels?.length)
  );
}

function channelColor(key: string, index: number): string {
  return (
    CHANNEL_COLOR_MAP[key] ?? CHANNEL_COLORS[index % CHANNEL_COLORS.length]
  );
}

/**
 * Builds the report view-model strictly from the authorized V2 snapshot. It does not inspect DOM
 * text and does not infer totals from chart pixels or from the legacy Overview tables.
 */
export function buildOverviewPdfReportModel(
  data: V2Dashboard,
  locale: ReportLocale,
  scenarioKey: OverviewPdfHistoricalScenarioKey = "last3Months",
  metadata?: Pick<OverviewPdfMetadata, "filterLabels">
): OverviewPdfReportModel {
  const historical = data.historicalPace;
  const scenario = historical?.[scenarioKey];
  const filtered = isFiltered(data, metadata);
  const sameMonth =
    data.period.dateFrom.slice(0, 7) === data.period.dateTo.slice(0, 7);
  const sourceLatest = dateOnly(data.source.latestLeadDate);
  const sourceLagging =
    sourceLatest == null || sourceLatest < data.period.dateTo.slice(0, 10);
  const validFallbackSource = sourceLatest != null && data.status === "READY";
  const comparable = !filtered && historical?.scope !== "FILTERED";

  // The captured curve is always the historical competence, even for a multi-month request.
  // The daily page separately presents the full selected-period total.
  const realized = historical
    ? historical.lastAvailableDate != null
      ? finite(historical.current)
      : null
    : sameMonth
      ? finite(data.pacing.current)
      : finite(data.summary.total);
  const goal = filtered
    ? null
    : historical
      ? finite(historical.goal)
      : finite(data.pacing.goal);
  const historicalReady = Boolean(
    historical &&
      (scenario?.status === "READY" || scenario?.status === "SOURCE_LAG")
  );
  const comparisonReady = historicalReady && comparable && goal != null;
  const projection = historical
    ? historicalReady
      ? finite(scenario?.projection)
      : null
    : comparable && validFallbackSource
      ? finite(data.pacing.projection)
      : null;
  const projectedDifference = historical
    ? comparisonReady
      ? finite(scenario?.projectedDifference)
      : null
    : comparable && validFallbackSource
      ? finite(data.pacing.projectedDifference)
      : null;
  const cumulativeDifference = comparisonReady
    ? finite(scenario?.gapToDate)
    : null;
  const cumulativeDifferenceRatio = comparisonReady
    ? finite(scenario?.gapPercent)
    : null;
  const projectedDifferenceRatio =
    projectedDifference != null && goal != null && goal > 0
      ? projectedDifference / goal
      : null;
  const targetAttainmentPercent =
    goal != null && goal > 0 && realized != null
      ? (realized / goal) * 100
      : null;

  const availableDays = data.daily.filter(
    item => item.sourceAvailable !== false && finite(item.total) != null
  );
  const dailyChannels = new Map<string, number>();
  for (const point of availableDays) {
    for (const [key, value] of Object.entries(point.channels)) {
      const count = finite(value);
      if (count != null)
        dailyChannels.set(key, (dailyChannels.get(key) ?? 0) + count);
    }
  }
  const authorizedChannels = data.channels.length
    ? data.channels
    : Array.from(dailyChannels, ([label, count]) => ({ label, count }));
  const channels = authorizedChannels
    .filter(item => finite(item.count) != null)
    .map((item, index) => ({
      key: item.label,
      count: item.count,
      color: channelColor(item.label, index),
    }));
  const availableDayCount = availableDays.length;

  return {
    locale,
    selectedPeriod: {
      dateFrom: data.period.dateFrom,
      dateTo: data.period.dateTo,
      multiMonth: !sameMonth,
    },
    source: {
      latestLeadDate: sourceLatest,
      checkedAt: data.checkedAt ?? null,
      lagging: sourceLagging,
    },
    leads: {
      realized,
      realizedScope: historical || sameMonth ? "month" : "selected-period",
      competence: historical?.competence ?? data.pacing.competence,
      asOfDate:
        historical?.lastAvailableDate ??
        historical?.asOfDate ??
        data.period.dateTo,
      goal,
      projection,
      projectedDifference,
      projectedDifferenceRatio,
      cumulativeDifference,
      cumulativeDifferenceRatio,
      targetAttainmentPercent,
      historicalAvailable: Boolean(historical),
      historicalScope: historical?.scope ?? null,
      scenarioStatus: scenario?.status ?? "UNAVAILABLE",
      scenarioWindow: historical ? scenarioKey : "fallback",
      scenarioKey,
    },
    daily: {
      periodTotal: availableDayCount ? finite(data.summary.total) : null,
      activeChannelCount: availableDayCount
        ? channels.filter(channel => channel.count > 0).length
        : null,
      availableDayCount,
      channels,
    },
    sales: {
      goal: finite(data.dealerPerformance.totals.salesGoal),
      registration: finite(
        data.dealerPerformance.generalRegistrationMTD?.value
      ),
      retail: finite(data.dealerPerformance.generalRetailMTD?.value),
      conversionRate: finite(data.dealerPerformance.totals.conversionRate),
      registrationAsOf:
        data.dealerPerformance.generalRegistrationMTD?.asOf ?? null,
      retailAsOf: data.dealerPerformance.generalRetailMTD?.asOf ?? null,
      comparable,
    },
    rankings: buildOverviewDealerRankings(data),
  };
}

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tagName: K,
  className?: string,
  value?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

function addText<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  parent: Element,
  tagName: K,
  value: string,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = element(document, tagName, className, value);
  parent.appendChild(node);
  return node;
}

function appendClass(node: Element, className: string): void {
  node.classList.add(className);
}

function buildBrandHeader(
  document: Document,
  metadata: OverviewPdfMetadata,
  title: string,
  page: number,
  model: OverviewPdfReportModel
): HTMLElement {
  const header = element(document, "header", "overview-pdf-report-header");
  const brand = element(document, "div", "overview-pdf-report-brand");
  const logo = element(
    document,
    "img",
    "overview-pdf-report-logo"
  ) as HTMLImageElement;
  logo.src = "/logo-mg-red.svg";
  logo.alt = "MG Motors";
  brand.appendChild(logo);
  addText(
    document,
    brand,
    "span",
    metadata.overviewLabel,
    "overview-pdf-report-eyebrow"
  );
  header.appendChild(brand);

  const copyNode = element(document, "div", "overview-pdf-report-header-copy");
  addText(document, copyNode, "h2", title, "overview-pdf-report-page-title");
  addText(
    document,
    copyNode,
    "p",
    `${metadata.periodLabel} · ${metadata.cutoffLabel}`,
    "overview-pdf-report-period"
  );
  const sourceLine = `${model.source.latestLeadDate ? `${copy(model.locale).latestLead}: ${displayDate(model.source.latestLeadDate, model.locale)}` : `${copy(model.locale).latestLead}: ${copy(model.locale).noData}`} · ${copy(model.locale).checkedAt}: ${displayTimestamp(model.source.checkedAt, model.locale)}`;
  addText(document, copyNode, "p", sourceLine, "overview-pdf-report-period");
  header.appendChild(copyNode);
  return header;
}

function buildFooter(
  document: Document,
  metadata: OverviewPdfMetadata,
  model: OverviewPdfReportModel,
  page: number
): HTMLElement {
  const footer = element(document, "footer", "overview-pdf-report-footer");
  addText(document, footer, "span", metadata.generatedLabel);
  addText(
    document,
    footer,
    "span",
    `${copy(model.locale).page} ${page} ${copy(model.locale).of} 4`
  );
  return footer;
}

function buildPage(
  document: Document,
  metadata: OverviewPdfMetadata,
  model: OverviewPdfReportModel,
  page: number,
  title: string,
  content: HTMLElement,
  includeHeader = true
): HTMLElement {
  const pageNode = element(document, "section", "overview-pdf-page");
  pageNode.setAttribute("data-overview-pdf-page", String(page));
  if (includeHeader)
    pageNode.appendChild(
      buildBrandHeader(document, metadata, title, page, model)
    );
  const body = element(document, "div", "overview-pdf-report-page-body");
  body.appendChild(content);
  pageNode.appendChild(body);
  pageNode.appendChild(buildFooter(document, metadata, model, page));
  return pageNode;
}

function buildMetric(
  document: Document,
  label: string,
  value: string,
  detail?: string,
  modifier?: string
): HTMLElement {
  const card = element(
    document,
    "article",
    `overview-pdf-metric${modifier ? ` ${modifier}` : ""}`
  );
  addText(document, card, "p", label, "overview-pdf-metric-label");
  addText(document, card, "p", value, "overview-pdf-metric-value");
  if (detail)
    addText(document, card, "p", detail, "overview-pdf-metric-detail");
  return card;
}

function buildSourceWarning(
  document: Document,
  model: OverviewPdfReportModel
): HTMLElement | null {
  if (!model.source.lagging) return null;
  const message = model.source.latestLeadDate
    ? `${copy(model.locale).sourceLag} ${copy(model.locale).latestLead}: ${displayDate(model.source.latestLeadDate, model.locale)}.`
    : copy(model.locale).sourceMissing;
  const warning = element(
    document,
    "p",
    "overview-pdf-report-warning",
    message
  );
  return warning;
}

function buildHistoricalLegend(
  document: Document,
  locale: ReportLocale
): HTMLElement {
  const legend = element(document, "div", "overview-pdf-chart-legend");
  const items: Array<[string, string, string]> = [
    [COPY[locale].actual, RED, "solid"],
    [COPY[locale].planned, BLUE, "solid"],
    [COPY[locale].projection, GREEN, "solid"],
    [COPY[locale].target, INK, "dashed"],
  ];
  for (const [label, color, style] of items) {
    const item = element(document, "span", "overview-pdf-chart-legend-item");
    const swatch = element(document, "i", "overview-pdf-chart-swatch");
    swatch.style.backgroundColor = color;
    if (style === "dashed") {
      swatch.style.backgroundColor = "transparent";
      swatch.style.borderTop = `2px dashed ${color}`;
    }
    item.appendChild(swatch);
    addText(document, item, "span", label);
    legend.appendChild(item);
  }
  return legend;
}

function copyAuthorizedLegend(
  document: Document,
  clone: HTMLElement,
  selector: string
): HTMLElement | null {
  const source = clone.querySelector(selector);
  if (!source) return null;
  const copied = document.importNode(source, true) as HTMLElement;
  copied.classList.add("overview-pdf-report-captured-legend");
  return copied;
}

function findChartSvg(
  root: HTMLElement,
  selector: string,
  fallbackToFirstSvg = false
): SVGSVGElement | null {
  const selected = root.matches(selector) ? root : root.querySelector(selector);
  if (selected?.tagName.toLowerCase() === "svg")
    return selected as SVGSVGElement;
  const nested = selected?.querySelector("svg");
  if (nested) return nested as SVGSVGElement;
  return fallbackToFirstSvg ? root.querySelector("svg") : null;
}

function scenarioFromClone(
  clone: HTMLElement
): OverviewPdfHistoricalScenarioKey {
  const card = clone.querySelector('[data-testid="historical-lead-pace-card"]');
  return card?.getAttribute("data-overview-pdf-scenario") === "lastMonth"
    ? "lastMonth"
    : "last3Months";
}

function cloneChartSvg(
  document: Document,
  source: SVGSVGElement,
  kind: "historical" | "daily"
): SVGSVGElement {
  const cloned = document.importNode(source, true) as SVGSVGElement;
  const prefix = `overview-pdf-${kind}-`;
  const ids = new Map<string, string>();
  const idNodes = [cloned, ...Array.from(cloned.querySelectorAll("[id]"))];
  for (const node of idNodes) {
    const oldId = node.getAttribute("id");
    if (!oldId) continue;
    const nextId = `${prefix}${ids.size}-${oldId}`;
    ids.set(oldId, nextId);
    node.setAttribute("id", nextId);
  }
  if (ids.size) {
    const allNodes = [cloned, ...Array.from(cloned.querySelectorAll("*"))];
    for (const node of allNodes) {
      for (const attribute of Array.from(node.attributes)) {
        let value = attribute.value;
        for (const [oldId, nextId] of ids) {
          value = value
            .replaceAll(`url(#${oldId})`, `url(#${nextId})`)
            .replaceAll(`href="#${oldId}"`, `href="#${nextId}"`)
            .replaceAll(`#${oldId}`, `#${nextId}`);
        }
        if (value !== attribute.value) node.setAttribute(attribute.name, value);
      }
    }
  }
  cloned.removeAttribute("width");
  cloned.removeAttribute("height");
  cloned.setAttribute("preserveAspectRatio", "xMidYMid meet");
  cloned.classList.add("overview-pdf-report-chart-svg");
  return cloned;
}

function buildChartFrame(
  document: Document,
  source: SVGSVGElement | null,
  kind: "historical" | "daily",
  emptyLabel: string
): HTMLElement {
  const frame = element(
    document,
    "div",
    `overview-pdf-chart-frame overview-pdf-chart-${kind}`
  );
  if (!source) {
    addText(document, frame, "p", emptyLabel, "overview-pdf-chart-empty");
    return frame;
  }
  frame.appendChild(cloneChartSvg(document, source, kind));
  return frame;
}

function buildCover(
  document: Document,
  metadata: OverviewPdfMetadata,
  model: OverviewPdfReportModel
): HTMLElement {
  const content = element(document, "div", "overview-pdf-cover-content");
  const logo = element(
    document,
    "img",
    "overview-pdf-cover-logo"
  ) as HTMLImageElement;
  logo.src = "/logo-mg-red.svg";
  logo.alt = "MG Motors";
  content.appendChild(logo);
  addText(
    document,
    content,
    "p",
    copy(model.locale).cover,
    "overview-pdf-cover-eyebrow"
  );
  addText(
    document,
    content,
    "h1",
    `${metadata.overviewLabel} — MG Motors`,
    "overview-pdf-cover-title"
  );
  addText(
    document,
    content,
    "p",
    metadata.periodLabel,
    "overview-pdf-cover-period"
  );
  addText(
    document,
    content,
    metadata.cutoffLabel ? "p" : "p",
    metadata.cutoffLabel,
    "overview-pdf-cover-cutoff"
  );

  const facts = element(document, "div", "overview-pdf-cover-facts");
  const source = element(document, "div", "overview-pdf-cover-fact");
  addText(
    document,
    source,
    "span",
    copy(model.locale).latestLead,
    "overview-pdf-cover-fact-label"
  );
  addText(
    document,
    source,
    "strong",
    model.source.latestLeadDate
      ? displayDate(model.source.latestLeadDate, model.locale)
      : copy(model.locale).noData
  );
  facts.appendChild(source);
  const checked = element(document, "div", "overview-pdf-cover-fact");
  addText(
    document,
    checked,
    "span",
    copy(model.locale).checkedAt,
    "overview-pdf-cover-fact-label"
  );
  addText(
    document,
    checked,
    "strong",
    displayTimestamp(model.source.checkedAt, model.locale)
  );
  facts.appendChild(checked);
  content.appendChild(facts);

  const filterBlock = element(document, "div", "overview-pdf-cover-filters");
  addText(
    document,
    filterBlock,
    "span",
    copy(model.locale).filters,
    "overview-pdf-cover-fact-label"
  );
  addText(
    document,
    filterBlock,
    "p",
    metadata.filtersLabel || copy(model.locale).none
  );
  content.appendChild(filterBlock);
  const warning = buildSourceWarning(document, model);
  if (warning) content.appendChild(warning);
  return content;
}

function buildLeadsPageContent(
  document: Document,
  clone: HTMLElement,
  model: OverviewPdfReportModel
): HTMLElement {
  const content = element(
    document,
    "div",
    "overview-pdf-report-content overview-pdf-leads-content"
  );
  const c = copy(model.locale);
  const metricGrid = element(
    document,
    "div",
    "overview-pdf-metric-grid overview-pdf-leads-metrics"
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      model.leads.realizedScope === "month"
        ? c.realizedMonth
        : c.realizedPeriod,
      numberText(model.leads.realized, model.locale),
      model.leads.realizedScope === "month"
        ? `${model.leads.competence} · ${displayDate(model.leads.asOfDate, model.locale)}`
        : c.selectedScope
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.monthlyTarget,
      numberText(model.leads.goal, model.locale)
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.projectedClose,
      numberText(model.leads.projection, model.locale),
      model.leads.scenarioWindow !== "fallback"
        ? model.leads.projection != null
          ? model.leads.scenarioKey === "lastMonth"
            ? c.basedOnLastMonth
            : c.basedOnThreeMonths
          : c.unavailable
        : c.projection
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.projectedVsGoal,
      signedNumberText(model.leads.projectedDifference, model.locale),
      percentText(model.leads.projectedDifferenceRatio, model.locale, true)
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.cumulativeDifference,
      signedNumberText(model.leads.cumulativeDifference, model.locale),
      percentText(model.leads.cumulativeDifferenceRatio, model.locale, true)
    )
  );
  content.appendChild(metricGrid);

  const attainment = element(document, "p", "overview-pdf-report-attainment");
  attainment.textContent = `${c.attainment}: ${model.leads.targetAttainmentPercent == null ? c.noData : `${new Intl.NumberFormat(localeCode(model.locale), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(model.leads.targetAttainmentPercent)}%`}`;
  content.appendChild(attainment);

  const warning = buildSourceWarning(document, model);
  if (warning) content.appendChild(warning);

  const chartBlock = element(
    document,
    "section",
    "overview-pdf-report-chart-block"
  );
  const chartHeading = element(
    document,
    "div",
    "overview-pdf-report-chart-heading"
  );
  addText(document, chartHeading, "h3", c.historicalCurve);
  addText(
    document,
    chartHeading,
    "p",
    model.leads.historicalAvailable
      ? model.leads.historicalScope === "FILTERED"
        ? `${c.selectedScope} · ${model.leads.competence}`
        : `${c.monthlyScope} · ${model.leads.competence}`
      : c.historicalUnavailable
  );
  chartBlock.appendChild(chartHeading);
  const historicalSource =
    findChartSvg(
      clone,
      '[data-testid="historical-lead-pace-card"] .recharts-surface',
      false
    ) ??
    findChartSvg(clone, '[data-testid="historical-lead-pace-card"] svg', false);
  chartBlock.appendChild(
    buildChartFrame(
      document,
      historicalSource,
      "historical",
      c.historicalUnavailable
    )
  );
  chartBlock.appendChild(
    copyAuthorizedLegend(
      document,
      clone,
      '[data-testid="historical-lead-pace-card"] [data-overview-pdf-legend="true"]'
    ) ?? buildHistoricalLegend(document, model.locale)
  );
  content.appendChild(chartBlock);
  return content;
}

function buildDailyLegend(
  document: Document,
  channels: ReportChannel[],
  locale: ReportLocale
): HTMLElement {
  const legend = element(
    document,
    "div",
    "overview-pdf-chart-legend overview-pdf-daily-legend"
  );
  for (const channel of channels) {
    const item = element(document, "span", "overview-pdf-chart-legend-item");
    const swatch = element(document, "i", "overview-pdf-chart-swatch");
    swatch.style.backgroundColor = channel.color;
    item.appendChild(swatch);
    addText(document, item, "span", channel.key);
    legend.appendChild(item);
  }
  if (!channels.length) addText(document, legend, "span", copy(locale).noData);
  return legend;
}

function buildDailyPageContent(
  document: Document,
  clone: HTMLElement,
  model: OverviewPdfReportModel
): HTMLElement {
  const content = element(
    document,
    "div",
    "overview-pdf-report-content overview-pdf-daily-content"
  );
  const c = copy(model.locale);
  const metricGrid = element(
    document,
    "div",
    "overview-pdf-metric-grid overview-pdf-daily-metrics"
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.periodTotal,
      numberText(model.daily.periodTotal, model.locale)
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.activeChannels,
      numberText(model.daily.activeChannelCount, model.locale)
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.availableDays,
      numberText(model.daily.availableDayCount, model.locale)
    )
  );
  content.appendChild(metricGrid);

  const chartBlock = element(
    document,
    "section",
    "overview-pdf-report-chart-block overview-pdf-daily-chart-block"
  );
  const chartHeading = element(
    document,
    "div",
    "overview-pdf-report-chart-heading"
  );
  addText(document, chartHeading, "h3", c.dailyCurve);
  addText(document, chartHeading, "p", c.dailySubtitle);
  chartBlock.appendChild(chartHeading);
  const dailySource =
    findChartSvg(
      clone,
      '[data-overview-pdf-chart="daily"] .recharts-surface',
      false
    ) ?? findChartSvg(clone, '[data-overview-pdf-chart="daily"] svg', false);
  chartBlock.appendChild(
    buildChartFrame(document, dailySource, "daily", c.dailyUnavailable)
  );
  chartBlock.appendChild(
    copyAuthorizedLegend(
      document,
      clone,
      '[data-overview-pdf-chart="daily"] [data-overview-pdf-legend="true"]'
    ) ?? buildDailyLegend(document, model.daily.channels, model.locale)
  );
  content.appendChild(chartBlock);
  return content;
}

function buildRankingTable(
  document: Document,
  rows: OverviewPdfReportModel["rankings"]["top"],
  model: OverviewPdfReportModel,
  title: string
): HTMLElement {
  const block = element(document, "section", "overview-pdf-ranking-block");
  addText(document, block, "h3", title, "overview-pdf-ranking-title");
  if (!rows.length) {
    addText(
      document,
      block,
      "p",
      copy(model.locale).noRanking,
      "overview-pdf-ranking-empty"
    );
    return block;
  }
  const table = element(document, "table", "overview-pdf-ranking-table");
  const head = element(document, "thead");
  const headerRow = element(document, "tr");
  for (const label of [
    copy(model.locale).dealer,
    copy(model.locale).leadsShort,
    copy(model.locale).salesShort,
    copy(model.locale).conversion,
  ]) {
    addText(document, headerRow, "th", label);
  }
  head.appendChild(headerRow);
  table.appendChild(head);
  const body = element(document, "tbody");
  rows.slice(0, 10).forEach((row, index) => {
    const tableRow = element(document, "tr");
    addText(document, tableRow, "td", `${index + 1}. ${row.dealer}`);
    addText(document, tableRow, "td", numberText(row.leads, model.locale));
    addText(document, tableRow, "td", numberText(row.sales, model.locale));
    addText(
      document,
      tableRow,
      "td",
      percentText(row.conversionRate, model.locale, false, 2)
    );
    body.appendChild(tableRow);
  });
  table.appendChild(body);
  block.appendChild(table);
  return block;
}

function buildSalesPageContent(
  document: Document,
  model: OverviewPdfReportModel
): HTMLElement {
  const content = element(
    document,
    "div",
    "overview-pdf-report-content overview-pdf-sales-content"
  );
  const c = copy(model.locale);
  const metricGrid = element(
    document,
    "div",
    "overview-pdf-metric-grid overview-pdf-sales-metrics"
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.salesGoal,
      numberText(model.sales.goal, model.locale)
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.registration,
      numberText(model.sales.registration, model.locale),
      `${c.sourceDate}: ${displayDate(model.sales.registrationAsOf, model.locale)}`
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.retail,
      numberText(model.sales.retail, model.locale),
      `${c.sourceDate}: ${displayDate(model.sales.retailAsOf, model.locale)}`
    )
  );
  metricGrid.appendChild(
    buildMetric(
      document,
      c.conversion,
      percentText(model.sales.conversionRate, model.locale, false, 2)
    )
  );
  content.appendChild(metricGrid);

  const rankingSummary = element(document, "p", "overview-pdf-ranking-summary");
  rankingSummary.textContent = `${model.rankings.eligibleCount} ${c.eligible}`;
  content.appendChild(rankingSummary);
  const rankingGrid = element(document, "div", "overview-pdf-ranking-grid");
  rankingGrid.appendChild(
    buildRankingTable(document, model.rankings.top, model, c.top)
  );
  rankingGrid.appendChild(
    buildRankingTable(document, model.rankings.bottom, model, c.bottom)
  );
  content.appendChild(rankingGrid);
  addText(
    document,
    content,
    "p",
    model.locale === "en"
      ? "Retail excludes Test Drive and Direct Sales. Rates are executive comparisons, not matched cohorts. Known zero sales remain eligible; unavailable values, upcoming units and unallocated collective sales are excluded. Lists may overlap when fewer than 20 units are eligible."
      : "Retail exclui Test Drive e Direct Sales. Taxas são comparações executivas, não coortes matched. Venda zero real é elegível; ausências, unidades EM BREVE e coletivos sem rateio são excluídos. Listas podem se repetir quando há menos de 20 unidades elegíveis.",
    "overview-pdf-ranking-summary"
  );
  return content;
}

/**
 * Builds a standalone, exactly-four-page report. Only the authorized chart SVGs are imported from
 * the sanitized clone; no legacy Overview markup, tables, recent rows, notes, or option lists are
 * copied into the printable document.
 */
export function buildOverviewPdfReport(
  input: OverviewPdfReportInput
): HTMLElement {
  const { document, clone, data, metadata, locale } = input;
  const model = buildOverviewPdfReportModel(
    data,
    locale,
    scenarioFromClone(clone),
    metadata
  );
  const report = element(document, "main", "overview-pdf-document");
  report.setAttribute("data-overview-pdf-report", "true");
  report.appendChild(
    buildPage(
      document,
      metadata,
      model,
      1,
      copy(locale).report,
      buildCover(document, metadata, model),
      false
    )
  );
  report.appendChild(
    buildPage(
      document,
      metadata,
      model,
      2,
      `${copy(locale).leads} — ${copy(locale).leadsSubtitle}`,
      buildLeadsPageContent(document, clone, model)
    )
  );
  report.appendChild(
    buildPage(
      document,
      metadata,
      model,
      3,
      `${copy(locale).daily} — ${copy(locale).dailySubtitle}`,
      buildDailyPageContent(document, clone, model)
    )
  );
  report.appendChild(
    buildPage(
      document,
      metadata,
      model,
      4,
      `${copy(locale).sales} — ${copy(locale).salesSubtitle}`,
      buildSalesPageContent(document, model)
    )
  );
  return report;
}

export function buildOverviewPdfReportCss(): string {
  return `
@page {
  size: A4 landscape;
  margin: 8mm;
}

:root {
  color-scheme: light;
}

.overview-pdf-document,
.overview-pdf-document * {
  box-sizing: border-box;
}

.overview-pdf-document {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: ${INK};
  font-family: Arial, Inter, Helvetica, sans-serif;
  font-size: 11px;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.overview-pdf-page {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 190mm;
  min-height: 190mm;
  margin: 0;
  padding: 0;
  overflow: visible;
  break-inside: avoid;
  page-break-inside: avoid;
}

.overview-pdf-page + .overview-pdf-page {
  break-before: page;
  page-break-before: always;
}

.overview-pdf-report-header {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  flex: 0 0 auto;
  min-height: 26mm;
  padding: 0 0 5px;
  border-bottom: 2px solid ${RED};
}

.overview-pdf-report-brand {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.overview-pdf-report-logo {
  display: block;
  width: 92px;
  height: 28px;
  object-fit: contain;
  object-position: left center;
}

.overview-pdf-report-eyebrow,
.overview-pdf-cover-eyebrow,
.overview-pdf-metric-label,
.overview-pdf-cover-fact-label {
  color: ${RED};
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.overview-pdf-report-header-copy h2,
.overview-pdf-report-header-copy p,
.overview-pdf-report-content h3,
.overview-pdf-report-content p,
.overview-pdf-cover-content h1,
.overview-pdf-cover-content p {
  margin: 0;
}

.overview-pdf-report-page-title {
  color: ${INK};
  font-size: 20px;
  font-weight: 500;
  line-height: 1.1;
}

.overview-pdf-report-period {
  margin-top: 4px !important;
  color: ${MUTED};
  font-size: 10px;
  line-height: 1.3;
}

.overview-pdf-report-page-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  padding: 7px 0 5px;
}

.overview-pdf-report-content {
  display: flex;
  min-height: 0;
  width: 100%;
  flex-direction: column;
  gap: 7px;
}

.overview-pdf-report-footer {
  display: flex;
  justify-content: space-between;
  flex: 0 0 auto;
  min-height: 7mm;
  padding-top: 4px;
  border-top: 1px solid #e2e8f0;
  color: #94a3b8;
  font-size: 8.5px;
}

.overview-pdf-cover-content {
  display: flex;
  width: 100%;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  padding: 15mm 24mm 13mm;
  border-left: 5px solid ${RED};
}

.overview-pdf-cover-logo {
  display: block;
  width: 160px;
  height: auto;
  max-height: 55px;
  object-fit: contain;
  object-position: left center;
  margin-bottom: 19px;
}

.overview-pdf-cover-title {
  max-width: 190mm;
  color: ${INK};
  font-size: 34px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.overview-pdf-cover-period {
  margin-top: 12px !important;
  color: ${INK};
  font-size: 18px;
  font-weight: 400;
}

.overview-pdf-cover-cutoff {
  margin-top: 5px !important;
  color: ${MUTED};
  font-size: 11px;
}

.overview-pdf-cover-facts {
  display: flex;
  gap: 42px;
  margin-top: 28px;
}

.overview-pdf-cover-fact {
  display: flex;
  min-width: 135px;
  flex-direction: column;
  gap: 4px;
}

.overview-pdf-cover-fact strong {
  color: ${INK};
  font-size: 14px;
  font-weight: 400;
}

.overview-pdf-cover-filters {
  max-width: 225mm;
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  color: ${MUTED};
  font-size: 10px;
}

.overview-pdf-cover-filters p {
  margin-top: 4px !important;
  overflow-wrap: anywhere;
}

.overview-pdf-report-warning {
  flex: 0 0 auto;
  padding: 5px 8px;
  border-left: 3px solid #d97706;
  background: #fff7ed;
  color: #9a3412;
  font-size: 9px;
  line-height: 1.3;
}

.overview-pdf-metric-grid {
  display: grid;
  gap: 6px;
  width: 100%;
}

.overview-pdf-leads-metrics {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.overview-pdf-daily-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.overview-pdf-sales-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.overview-pdf-metric {
  min-width: 0;
  min-height: 26mm;
  padding: 9px 10px 8px;
  border: 1px solid #e2e8f0;
  border-top: 3px solid ${RED};
  background: #ffffff;
}

.overview-pdf-metric-label {
  color: ${MUTED};
  font-size: 8.5px;
  letter-spacing: 0.08em;
  line-height: 1.25;
}

.overview-pdf-metric-value {
  margin-top: 4px !important;
  color: ${INK};
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1;
  white-space: nowrap;
}

.overview-pdf-metric-detail {
  min-height: 14px;
  margin-top: 5px !important;
  color: ${MUTED};
  font-size: 9px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.overview-pdf-report-attainment,
.overview-pdf-ranking-summary {
  color: ${MUTED};
  font-size: 10px;
}

.overview-pdf-report-chart-block {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 7px 9px 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  break-inside: avoid;
  page-break-inside: avoid;
}

.overview-pdf-report-chart-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  flex: 0 0 auto;
}

.overview-pdf-report-chart-heading h3 {
  color: ${INK};
  font-size: 13px;
  font-weight: 600;
}

.overview-pdf-report-chart-heading p {
  color: ${MUTED};
  font-size: 9px;
  text-align: right;
}

.overview-pdf-chart-frame {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  width: 100%;
  align-items: center;
  justify-content: center;
  overflow: visible;
  padding: 2px 0;
}

.overview-pdf-report-chart-svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-width: 100%;
  overflow: visible;
}

.overview-pdf-chart-empty {
  color: ${MUTED};
  font-size: 11px;
}

.overview-pdf-chart-legend {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 5px 15px;
  min-height: 15px;
  color: ${MUTED};
  font-size: 9px;
}

.overview-pdf-report-captured-legend {
  display: flex !important;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 5px 15px;
  min-height: 15px;
  align-items: center;
  color: ${MUTED};
  font-size: 9px !important;
  line-height: 1.25;
}

.overview-pdf-report-captured-legend > * {
  max-width: 100%;
  font-size: 9px !important;
  line-height: 1.25;
}

.overview-pdf-chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.overview-pdf-chart-swatch {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

.overview-pdf-daily-chart-block {
  min-height: 0;
}

.overview-pdf-ranking-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
}

.overview-pdf-ranking-block {
  min-width: 0;
  padding: 7px 8px 5px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  break-inside: avoid;
  page-break-inside: avoid;
}

.overview-pdf-ranking-title {
  margin-bottom: 5px !important;
  color: ${INK};
  font-size: 13px;
  font-weight: 600;
}

.overview-pdf-ranking-empty {
  padding: 12px 4px;
  color: ${MUTED};
  font-size: 11px;
}

.overview-pdf-ranking-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 11.5px;
}

.overview-pdf-ranking-table th,
.overview-pdf-ranking-table td {
  padding: 4px 4px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: top;
}

.overview-pdf-ranking-table th {
  color: ${MUTED};
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
}

.overview-pdf-ranking-table th:first-child,
.overview-pdf-ranking-table td:first-child {
  width: 57%;
  overflow-wrap: anywhere;
}

.overview-pdf-ranking-table th:not(:first-child),
.overview-pdf-ranking-table td:not(:first-child) {
  width: 14.33%;
  white-space: nowrap;
}

.overview-pdf-ranking-table td {
  color: ${INK};
  font-size: 11.5px;
  line-height: 1.18;
}

@media print {
  .overview-pdf-document {
    width: 100%;
  }
  .overview-pdf-page {
    overflow: visible;
  }
}
`;
}
