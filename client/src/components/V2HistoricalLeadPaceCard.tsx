import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  HistoricalLeadPace,
  HistoricalLeadPaceReference,
  HistoricalLeadPaceScenario,
} from "@shared/historicalLeadPace";
import { getHistoricalMonthStyle } from "./historicalLeadPaceColors";

const RED = "#e2212d";
const BLUE = "#2563eb";
const GREEN = "#16a34a";

type ScenarioKey = "lastMonth" | "last3Months";
type Locale = "pt-BR" | "en";
type Props = {
  data: HistoricalLeadPace;
  actions?: ReactNode;
  clientView?: boolean;
  locale?: Locale;
};
type ChartRow = {
  day: number;
  date: string;
  [key: string]: string | number | null;
};

const messages: Record<Locale, Record<string, string>> = {
  "pt-BR": {
    nullValue: "N/D",
    title: "Leads Plan — ritmo e projeção",
    description:
      "Barras do realizado acumulado desde o dia 1, comparadas ao Planejado do mês e à estimativa de fechamento da competência.",
    competence: "Competência",
    mtdPrefix: "MTD desde",
    mtdUntil: "até",
    mtdSelectedCutoff: "(corte selecionado, limitado a D-1)",
    through: "Até",
    availableSuffix: "disponíveis",
    unavailableSuffix: "indisponíveis",
    of: "de",
    progressSuffix: "da meta",
    lastAvailable: "Último dia disponível na fonte:",
    referenceWindow: "Janela de referência",
    last3Months: "Últimos 3 meses",
    lastMonth: "Último mês",
    historicalReady: "Histórico pronto",
    noComparableHistory: "Sem histórico comparável",
    sourceDelayed: "Fonte atrasada",
    sourceUnavailable: "Fonte indisponível",
    ahead: "À frente",
    behindPace: "Abaixo do ritmo",
    onTrack: "No ritmo",
    noTarget: "Sem meta",
    unavailable: "Indisponível",
    available: "Disponível",
    incompleteCoverage: "Cobertura incompleta",
    monthWithoutLeads: "Mês coberto sem Leads",
    leadsRealized: "Leads realizados no mês",
    monthlyTarget: "Meta mensal",
    closingProjection: "Projeção de fechamento",
    projectionVsTarget: "Projeção vs. meta",
    cumulativeDifference: "Diferença acumulada",
    sourceUnavailableShort: "Fonte indisponível",
    globalTargetNotApplicable: "Meta global; não aplicável ao recorte",
    basedOnLast3: "Base últimos 3 meses",
    basedOnLast: "Base último mês",
    noGlobalComparison: "Sem comparação global",
    filteredScope:
      "Recorte filtrado: a meta global não é comparada a este subconjunto. O forecast continua visível quando a curva histórica é válida.",
    noGlobalTarget:
      "Sem meta global cadastrada: o realizado e o forecast podem ser lidos, mas não há comparação de atingimento.",
    noHistoryWarning:
      "Não há meses históricos suficientes para uma curva comparável.",
    sourceLagWarning:
      "A fonte histórica está atrasada; não trate a projeção como confirmação de resultado.",
    noSourceWarning: "A fonte histórica não está disponível para este cálculo.",
    genericSourceWarning: "Aviso da fonte histórica.",
    chartHeading: "Realizado em barras × Planejado do mês",
    plannedPrefix: "Planejado do mês:",
    chartComparison:
      "Cada barra é o total acumulado até aquele dia; compare sua altura à linha azul. A projeção tracejada começa no último realizado.",
    sourceCutoff: "Corte da fonte:",
    traceHistorical: "Traçar meses históricos",
    chartAria:
      "Barras de Leads realizados acumulados comparadas ao Planejado do mês e à projeção de fechamento",
    scrollHint:
      "Deslize o gráfico na horizontal para ver todo o mês sem sobrepor os valores.",
    plannedName: "Planejado do mês",
    actualName: "Realizado acumulado",
    actualBars: "Realizado acumulado (barras)",
    projectionName: "Projeção de fechamento",
    projectionEstimate: "Projeção de fechamento (estimativa)",
    historicalSuffix: " (histórico)",
    day: "Dia",
    leads: "Leads",
    leadsOfDay: "Leads do dia:",
    differenceVsPlanned: "Diferença acumulada vs. Planejado do mês:",
    dayOfMonth: "Dia do mês",
    accumulatedLeads: "Leads acumulados",
    target: "Meta",
    attainment: "Atingimento da meta de Leads",
    monthsInWindow: "mês(es) na janela selecionada",
    referenceMonths: "Meses de referência",
    competenceColumn: "Competência",
    total: "Total",
    status: "Status",
    dailyAudit: "Tabela diária para auditoria",
    dailyCurve: "Tabela diária da curva de Leads",
    dateColumn: "Data",
    actualColumn: "Real",
    projectionColumn: "Projeção",
    method: "Método:",
    methodText:
      "média simples dos meses históricos, com peso igual por mês; interpolação para calendários de 28, 29, 30 ou 31 dias; plano acumulado = meta × participação histórica acumulada.",
    estimateText:
      "O estimado atual usa realizado ÷ participação esperada no corte. É uma estimativa, não garantia nem realizado futuro, e não altera mídia futura. Nulos permanecem N/D/—; zero é um volume real quando informado.",
    primaryMetrics: "Indicadores principais do Leads Plan",
    legend: "Legenda do gráfico",
  },
  en: {
    nullValue: "N/A",
    title: "Leads Plan — pace and projection",
    description:
      "Cumulative actuals from day 1 compared with Planned this month and the projected month close for the current period.",
    competence: "Period",
    mtdPrefix: "MTD from",
    mtdUntil: "through",
    mtdSelectedCutoff: "(selected cutoff, limited to D-1)",
    through: "Through",
    availableSuffix: "available",
    unavailableSuffix: "unavailable",
    of: "of",
    progressSuffix: "of target",
    lastAvailable: "Last available source date:",
    referenceWindow: "Reference window",
    last3Months: "Last 3 months",
    lastMonth: "Last month",
    historicalReady: "Historical data ready",
    noComparableHistory: "No comparable history",
    sourceDelayed: "Source delayed",
    sourceUnavailable: "Source unavailable",
    ahead: "Ahead",
    behindPace: "Behind pace",
    onTrack: "On track",
    noTarget: "No target",
    unavailable: "Unavailable",
    available: "Available",
    incompleteCoverage: "Incomplete coverage",
    monthWithoutLeads: "Month covered with no Leads",
    leadsRealized: "Leads realized this month",
    monthlyTarget: "Monthly target",
    closingProjection: "Projected month close",
    projectionVsTarget: "Projection vs. target",
    cumulativeDifference: "Cumulative difference",
    sourceUnavailableShort: "Source unavailable",
    globalTargetNotApplicable: "Global target; not applicable to filtered view",
    basedOnLast3: "Based on the last 3 months",
    basedOnLast: "Based on the last month",
    noGlobalComparison: "No global comparison",
    filteredScope:
      "Filtered view: the global target is not compared with this subset. The forecast remains visible when the historical curve is valid.",
    noGlobalTarget:
      "No global target configured: actuals and forecast can be read, but attainment cannot be compared.",
    noHistoryWarning:
      "There is not enough historical data for a comparable curve.",
    sourceLagWarning:
      "The historical source is delayed; do not treat the projection as confirmed results.",
    noSourceWarning:
      "The historical source is unavailable for this calculation.",
    genericSourceWarning: "Historical source warning.",
    chartHeading: "Cumulative actuals × Planned this month",
    plannedPrefix: "Planned this month:",
    chartComparison:
      "Each bar is the cumulative total through that day; compare its height with the blue line. The dashed projection starts at the last actual.",
    sourceCutoff: "Source cutoff:",
    traceHistorical: "Trace historical months",
    chartAria:
      "Cumulative actual Leads bars compared with Planned this month and projected month close",
    scrollHint:
      "Scroll horizontally to see the full month without overlapping values.",
    plannedName: "Planned this month",
    actualName: "Cumulative actuals",
    actualBars: "Cumulative actuals (bars)",
    projectionName: "Projected month close",
    projectionEstimate: "Projected month close (estimated)",
    historicalSuffix: " (historical)",
    day: "Day",
    leads: "Leads",
    leadsOfDay: "Leads for the day:",
    differenceVsPlanned: "Cumulative difference vs. Planned this month:",
    dayOfMonth: "Day of month",
    accumulatedLeads: "Accumulated Leads",
    target: "Target",
    attainment: "Leads target attainment",
    monthsInWindow: "month(s) in selected window",
    referenceMonths: "Reference months",
    competenceColumn: "Period",
    total: "Total",
    status: "Status",
    dailyAudit: "Daily audit table",
    dailyCurve: "Daily Leads curve table",
    dateColumn: "Date",
    actualColumn: "Actual",
    projectionColumn: "Projection",
    method: "Method:",
    methodText:
      "simple average of historical months, equally weighted by month; interpolation for 28-, 29-, 30-, or 31-day calendars; cumulative plan = target × historical cumulative share.",
    estimateText:
      "The current estimate uses actuals ÷ expected share at the cutoff. It is an estimate, not a guarantee or future actuals, and does not change future media. Nulls remain N/A/—; zero is a real volume when provided.",
    primaryMetrics: "Key Leads Plan metrics",
    legend: "Chart legend",
  },
};

const t = (locale: Locale, key: string) => messages[locale][key];
const localeCode = (locale: Locale) => (locale === "en" ? "en-US" : "pt-BR");

/** Display-only transformation: keep accumulated bars and curves comparable. */
export function buildHistoricalPaceChartRows(
  data: HistoricalLeadPace,
  scenario: HistoricalLeadPaceScenario,
  showHistorical = false
): ChartRow[] {
  return scenario.points.map((point, index) => {
    const available =
      data.lastAvailableDate !== null &&
      point.date <= data.lastAvailableDate &&
      point.date <= data.asOfDate;
    const real = available ? point.real : null;
    const previous =
      point.day === 1
        ? 0
        : index > 0 && scenario.points[index - 1].day === point.day - 1
          ? scenario.points[index - 1].real
          : null;
    const row: ChartRow = {
      day: point.day,
      date: point.date,
      real,
      plan: point.plan,
      projection: point.date >= data.asOfDate ? point.projection : null,
      dailyReal: real !== null && previous !== null ? real - previous : null,
      gapToPlan:
        real !== null && point.plan !== null ? real - point.plan : null,
    };
    if (showHistorical)
      data.reference.forEach((ref, i) => {
        row[`historical_${i}`] = ref.available
          ? (ref.cumulative[point.day - 1] ?? null)
          : null;
      });
    return row;
  });
}

const unit = (v: number | null | undefined, locale: Locale = "pt-BR") =>
  v == null
    ? t(locale, "nullValue")
    : new Intl.NumberFormat(localeCode(locale), {
        maximumFractionDigits: 0,
      }).format(v);
const tableUnit = (v: number | null | undefined, locale: Locale = "pt-BR") =>
  v == null
    ? "—"
    : new Intl.NumberFormat(localeCode(locale), {
        maximumFractionDigits: 0,
      }).format(v);
const pct = (v: number | null | undefined, locale: Locale = "pt-BR") =>
  v == null
    ? t(locale, "nullValue")
    : `${new Intl.NumberFormat(localeCode(locale), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(v)}%`;
const signed = (v: number | null | undefined, locale: Locale = "pt-BR") =>
  v == null
    ? t(locale, "nullValue")
    : `${v < 0 ? "−" : "+"}${new Intl.NumberFormat(localeCode(locale), {
        maximumFractionDigits: 0,
      }).format(Math.abs(v))}`;
const signedPct = (v: number | null | undefined, locale: Locale = "pt-BR") =>
  v == null
    ? t(locale, "nullValue")
    : `${v < 0 ? "−" : "+"}${new Intl.NumberFormat(localeCode(locale), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(Math.abs(v))}%`;
const dayOf = (v: string | null | undefined) => {
  const m = v?.match(/^\d{4}-\d{2}-(\d{2})/);
  return m ? Number(m[1]) : null;
};
const month = (v: string, locale: Locale = "pt-BR") => {
  const m = v.match(/^(\d{4})-(\d{2})/);
  return m
    ? new Intl.DateTimeFormat(localeCode(locale), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)))
    : v;
};
const date = (v: string, locale: Locale = "pt-BR") => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m
    ? new Intl.DateTimeFormat(localeCode(locale), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
    : v;
};
const statusText: Record<
  Locale,
  Record<HistoricalLeadPaceScenario["status"], string>
> = {
  "pt-BR": {
    READY: "Histórico pronto",
    NO_HISTORY: "Sem histórico comparável",
    SOURCE_LAG: "Fonte atrasada",
    NO_SOURCE: "Fonte indisponível",
  },
  en: {
    READY: "Historical data ready",
    NO_HISTORY: "No comparable history",
    SOURCE_LAG: "Source delayed",
    NO_SOURCE: "Source unavailable",
  },
};
const paceText: Record<
  Locale,
  Record<HistoricalLeadPaceScenario["paceStatus"], string>
> = {
  "pt-BR": {
    AHEAD: "À frente",
    BEHIND: "Abaixo do ritmo",
    ON_TRACK: "No ritmo",
    NO_GOAL: "Sem meta",
    UNAVAILABLE: "Indisponível",
  },
  en: {
    AHEAD: "Ahead",
    BEHIND: "Behind pace",
    ON_TRACK: "On track",
    NO_GOAL: "No target",
    UNAVAILABLE: "Unavailable",
  },
};

function Metric({ item }: { item: [string, string, string?] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {item[0]}
      </p>
      <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
        {item[1]}
      </p>
      {item[2] ? (
        <p className="mt-1 text-[11px] text-slate-500">{item[2]}</p>
      ) : null}
    </div>
  );
}
function TooltipContent({
  active,
  payload,
  label,
  locale,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: unknown;
    color?: string;
    payload?: ChartRow;
  }>;
  label?: unknown;
  locale: Locale;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-700">
        {t(locale, "day")} {String(label)}
      </p>
      {payload.map(item => (
        <p
          key={String(item.name)}
          className="mt-1"
          style={{ color: item.color }}
        >
          {item.name}:{" "}
          <strong>
            {unit(typeof item.value === "number" ? item.value : null, locale)}{" "}
            {t(locale, "leads")}
          </strong>
        </p>
      ))}
      {row && typeof row.real === "number" ? (
        <div className="mt-2 border-t border-slate-100 pt-2 text-slate-600">
          <p>
            {t(locale, "leadsOfDay")}{" "}
            <strong>
              {unit(
                typeof row.dailyReal === "number" ? row.dailyReal : null,
                locale
              )}
            </strong>
          </p>
          <p>
            {t(locale, "differenceVsPlanned")}{" "}
            <strong>
              {signed(
                typeof row.gapToPlan === "number" ? row.gapToPlan : null,
                locale
              )}
            </strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}
function refStatus(ref: HistoricalLeadPaceReference, locale: Locale) {
  const reasons: Record<Locale, Record<string, string>> = {
    "pt-BR": {
      NO_SOURCE: "Fonte indisponível",
      SOURCE_LAG: "Cobertura incompleta",
      EMPTY_MONTH: "Mês coberto sem Leads",
    },
    en: {
      NO_SOURCE: "Source unavailable",
      SOURCE_LAG: "Incomplete coverage",
      EMPTY_MONTH: "Month covered with no Leads",
    },
  };
  if (ref.available) return t(locale, "available");
  return (
    reasons[locale][ref.reason ?? ""] ||
    (locale === "pt-BR" ? ref.reason : null) ||
    t(locale, "unavailable")
  );
}
function warningText(warning: string, locale: Locale) {
  if (locale === "pt-BR") return warning;
  const normalized = warning.toLocaleLowerCase("pt-BR");
  if (normalized.includes("atras")) return t(locale, "sourceLagWarning");
  if (normalized.includes("insuficiente")) return t(locale, "noHistoryWarning");
  if (normalized.includes("indispon") || normalized.includes("disponível"))
    return t(locale, "noSourceWarning");
  return t(locale, "genericSourceWarning");
}
function defaultWarning(
  status: HistoricalLeadPaceScenario["status"],
  locale: Locale
) {
  if (status === "NO_HISTORY") return t(locale, "noHistoryWarning");
  if (status === "SOURCE_LAG") return t(locale, "sourceLagWarning");
  return t(locale, "noSourceWarning");
}
function metricGrid(items: Array<[string, string, string?]>, locale: Locale) {
  return (
    <div
      className="w-full min-w-0 max-w-full overflow-x-auto"
      role="region"
      aria-label={t(locale, "primaryMetrics")}
      tabIndex={0}
    >
      <div className="grid min-w-[900px] grid-cols-5 gap-3">
        {items.map(item => (
          <Metric key={item[0]} item={item} />
        ))}
      </div>
    </div>
  );
}

export function V2HistoricalLeadPaceCard({
  data,
  actions,
  clientView = false,
  locale = "pt-BR",
}: Props) {
  const [windowKey, setWindowKey] = useState<ScenarioKey>("last3Months");
  const [showHistorical, setShowHistorical] = useState(false);
  const scenario = data[windowKey];
  const goal = data.goal;
  const cutoff = dayOf(data.lastAvailableDate);
  const comparable = data.scope === "GLOBAL" && goal != null;
  const hasCurrent = data.lastAvailableDate !== null;
  const progress =
    comparable && hasCurrent && goal > 0 ? (data.current / goal) * 100 : null;
  const references = data.reference.length
    ? data.reference
    : scenario.referenceMonths.map(competence => ({
        competence,
        total: null,
        available: false,
        reason: "Indisponível",
        cumulative: [],
      }));
  const rows = useMemo<ChartRow[]>(
    () => buildHistoricalPaceChartRows(data, scenario, showHistorical),
    [data, scenario, showHistorical]
  );
  const values = rows.flatMap(row =>
    Object.entries(row)
      .filter(
        ([key, value]) =>
          (key === "real" ||
            key === "plan" ||
            key === "projection" ||
            key.startsWith("historical_")) &&
          typeof value === "number"
      )
      .map(([, value]) => value as number)
  );
  if (comparable) values.push(goal);
  const yMax = Math.max(1, ...values, 0) * 1.08;
  const count = scenario.referenceMonths.length;
  const windowLabel =
    windowKey === "last3Months"
      ? count === 3
        ? t(locale, "last3Months")
        : count
          ? `${t(locale, "last3Months")} (${count} ${t(locale, "availableSuffix")})`
          : `${t(locale, "last3Months")} (${t(locale, "unavailableSuffix")})`
      : t(locale, "lastMonth");
  const projectionBasis =
    windowKey === "last3Months"
      ? t(locale, "basedOnLast3")
      : t(locale, "basedOnLast");
  const warnings = [...new Set(scenario.warnings.filter(Boolean))].map(
    warning => warningText(warning, locale)
  );
  if (scenario.status !== "READY" && !warnings.length)
    warnings.push(defaultWarning(scenario.status, locale));
  const scopeMessage =
    data.scope === "FILTERED"
      ? t(locale, "filteredScope")
      : goal == null
        ? t(locale, "noGlobalTarget")
        : null;
  const primary = [
    [
      t(locale, "leadsRealized"),
      hasCurrent ? unit(data.current, locale) : t(locale, "nullValue"),
      data.lastAvailableDate
        ? `${t(locale, "through")} ${date(data.lastAvailableDate, locale)}`
        : t(locale, "sourceUnavailableShort"),
    ],
    [
      t(locale, "monthlyTarget"),
      unit(goal, locale),
      data.scope === "FILTERED"
        ? t(locale, "globalTargetNotApplicable")
        : undefined,
    ],
    [
      t(locale, "closingProjection"),
      unit(scenario.projection, locale),
      projectionBasis,
    ],
    [
      t(locale, "projectionVsTarget"),
      comparable
        ? signed(scenario.projectedDifference, locale)
        : t(locale, "nullValue"),
      comparable
        ? signedPct(
            scenario.projectedDifference == null || goal === 0
              ? null
              : (scenario.projectedDifference / goal) * 100,
            locale
          )
        : t(locale, "noGlobalComparison"),
    ],
    [
      t(locale, "cumulativeDifference"),
      comparable ? signed(scenario.gapToDate, locale) : t(locale, "nullValue"),
      comparable
        ? signedPct(
            scenario.gapPercent == null ? null : scenario.gapPercent * 100,
            locale
          )
        : t(locale, "noGlobalComparison"),
    ],
  ] as Array<[string, string, string?]>;

  return (
    <section
      data-testid="historical-lead-pace-card"
      data-overview-pdf-scenario={scenario.key}
      className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
            Leads Plan
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
            {t(locale, "title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">
            {t(locale, "description")}
          </p>
        </div>
        {actions ? (
          <div
            data-overview-pdf-exclude
            className="flex shrink-0 flex-wrap items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t(locale, "competence")} {month(data.competence, locale)}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {t(locale, "mtdPrefix")} {date(`${data.competence}-01`, locale)}{" "}
              {t(locale, "mtdUntil")} {date(data.asOfDate, locale)}{" "}
              {t(locale, "mtdSelectedCutoff")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t(locale, "lastAvailable")}{" "}
              {data.lastAvailableDate
                ? date(data.lastAvailableDate, locale)
                : t(locale, "nullValue")}
            </p>
          </div>
          <label className="flex min-w-[220px] flex-col gap-1 text-xs font-semibold text-slate-600">
            {t(locale, "referenceWindow")}
            <select
              aria-label={t(locale, "referenceWindow")}
              value={windowKey}
              onChange={event =>
                setWindowKey(event.target.value as ScenarioKey)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-[#e2212d] focus:ring-2 focus:ring-red-100"
            >
              <option value="last3Months">{t(locale, "last3Months")}</option>
              <option value="lastMonth">{t(locale, "lastMonth")}</option>
            </select>
          </label>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${scenario.status !== "READY" ? "border-amber-200 bg-amber-50 text-amber-800" : comparable && scenario.paceStatus === "BEHIND" ? "border-red-200 bg-red-50 text-red-700" : comparable && scenario.paceStatus === "AHEAD" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">
              {scenario.status === "READY" && comparable
                ? paceText[locale][scenario.paceStatus]
                : statusText[locale][scenario.status]}
            </span>
            <span className="rounded-full border border-current px-2 py-1 text-[11px] font-bold">
              {count} {t(locale, "monthsInWindow")}
            </span>
          </div>
          {warnings.map(warning => (
            <p key={warning} className="mt-1 text-xs leading-5">
              {warning}
            </p>
          ))}
        </div>
        {metricGrid(primary, locale)}
        {scopeMessage ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            {scopeMessage}
          </p>
        ) : null}
        {comparable ? (
          <div className="space-y-2">
            <div className="flex justify-between gap-3 text-xs text-slate-500">
              <span>
                {pct(progress, locale)} {t(locale, "progressSuffix")}
              </span>
              <span>
                {unit(data.current, locale)} {t(locale, "of")}{" "}
                {unit(goal, locale)} {t(locale, "leads")}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label={t(locale, "attainment")}
              aria-valuenow={
                progress == null
                  ? undefined
                  : Math.min(100, Math.max(0, progress))
              }
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[#e2212d]"
                style={{
                  width: `${Math.min(100, Math.max(0, progress ?? 0))}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-100 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">
                {t(locale, "chartHeading")}
              </h3>
              <p className="text-xs text-slate-500">
                {t(locale, "plannedPrefix")}{" "}
                {locale === "pt-BR"
                  ? scenario.label || windowLabel
                  : windowLabel}
                . {t(locale, "chartComparison")}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {t(locale, "sourceCutoff")}{" "}
                {data.lastAvailableDate
                  ? date(data.lastAvailableDate, locale)
                  : t(locale, "nullValue")}
              </p>
            </div>
            <label
              data-overview-pdf-exclude
              className="flex items-center gap-2 text-xs font-medium text-slate-600"
            >
              <input
                type="checkbox"
                checked={showHistorical}
                onChange={event => setShowHistorical(event.target.checked)}
              />
              {t(locale, "traceHistorical")}
            </label>
          </div>
          <div
            className="h-[420px] w-full min-w-0 overflow-x-auto p-2 focus-visible:ring-2 focus-visible:ring-red-200 sm:p-4"
            role="img"
            tabIndex={0}
            aria-label={t(locale, "chartAria")}
          >
            <div
              className="h-full w-full"
              style={{ minWidth: data.daysInMonth * 36 }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={rows}
                  margin={{ top: 28, right: 18, bottom: 8, left: 4 }}
                  barCategoryGap="32%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="day"
                    type="category"
                    interval="preserveStartEnd"
                    minTickGap={12}
                    tick={{ fontSize: 11 }}
                    label={{
                      value: t(locale, "dayOfMonth"),
                      position: "insideBottom",
                      offset: -2,
                    }}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={value => unit(Number(value), locale)}
                    width={58}
                    label={{
                      value: t(locale, "accumulatedLeads"),
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip content={<TooltipContent locale={locale} />} />
                  {cutoff != null ? (
                    <ReferenceLine
                      x={cutoff}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      label={{
                        value: t(locale, "sourceCutoff").replace(/:$/, ""),
                        position: "insideTop",
                      }}
                    />
                  ) : null}
                  {comparable ? (
                    <ReferenceLine
                      y={goal}
                      stroke="#0f172a"
                      strokeDasharray="6 4"
                      label={{
                        value: `${t(locale, "target")} ${unit(goal, locale)}`,
                        position: "insideTopRight",
                      }}
                    />
                  ) : null}
                  <Bar
                    dataKey="real"
                    name={t(locale, "actualName")}
                    fill={RED}
                    fillOpacity={0.82}
                    maxBarSize={28}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="real"
                      position="top"
                      offset={8}
                      fill="#334155"
                      fontSize={11}
                      fontWeight={700}
                      stroke="#ffffff"
                      strokeWidth={3}
                      paintOrder="stroke"
                      formatter={(value: unknown) =>
                        typeof value === "number" ? unit(value, locale) : ""
                      }
                    />
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="plan"
                    name={t(locale, "plannedName")}
                    stroke={BLUE}
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projection"
                    name={t(locale, "projectionName")}
                    stroke={GREEN}
                    strokeWidth={3}
                    strokeDasharray="7 5"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {showHistorical
                    ? data.reference.map((ref, i) =>
                        ref.available && ref.cumulative.length ? (
                          <Line
                            key={ref.competence}
                            type="monotone"
                            dataKey={`historical_${i}`}
                            name={month(ref.competence, locale)}
                            stroke={
                              getHistoricalMonthStyle(ref.competence).color
                            }
                            strokeDasharray={
                              getHistoricalMonthStyle(ref.competence).dasharray
                            }
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ) : null
                      )
                    : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p
            data-overview-pdf-exclude
            className="px-4 pb-2 text-[11px] text-slate-500 xl:hidden"
          >
            {t(locale, "scrollHint")}
          </p>
          <div
            data-overview-pdf-legend
            className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600"
            aria-label={t(locale, "legend")}
          >
            <span>
              <i className="mr-1 inline-block h-2 w-5 rounded bg-[#2563eb]" />
              {t(locale, "plannedName")}
            </span>
            <span>
              <i className="mr-1 inline-block h-3 w-2 rounded-t bg-[#e2212d]" />
              {t(locale, "actualBars")}
            </span>
            <span>
              <i className="mr-1 inline-block h-0.5 w-5 border-t-2 border-dashed border-[#16a34a] align-middle" />
              {t(locale, "projectionEstimate")}
            </span>
            {showHistorical
              ? data.reference
                  .filter(ref => ref.available && ref.cumulative.length)
                  .map(ref => (
                    <span key={ref.competence}>
                      <i
                        aria-hidden="true"
                        className="mr-1 inline-block h-0.5 w-5 border-t-2 border-dashed align-middle"
                        style={{
                          borderColor: getHistoricalMonthStyle(ref.competence)
                            .color,
                        }}
                      />
                      {month(ref.competence, locale)}
                      {t(locale, "historicalSuffix")}
                    </span>
                  ))
              : null}
          </div>
        </div>
        {!clientView ? (
          <div
            data-overview-pdf-exclude
            className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
          >
            <div>
              <h3 className="mb-2 font-bold text-slate-900">
                {t(locale, "referenceMonths")}
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">
                        {t(locale, "competenceColumn")}
                      </th>
                      <th className="px-3 py-2">{t(locale, "total")}</th>
                      <th className="px-3 py-2">{t(locale, "status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {references.map(ref => (
                      <tr
                        key={ref.competence}
                        className="border-t border-slate-100"
                        style={{
                          backgroundColor: `${getHistoricalMonthStyle(ref.competence).color}0a`,
                        }}
                      >
                        <td
                          className="border-l-[3px] px-3 py-2 font-semibold"
                          style={{
                            color: getHistoricalMonthStyle(ref.competence)
                              .color,
                            borderLeftColor: getHistoricalMonthStyle(
                              ref.competence
                            ).color,
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <i
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: getHistoricalMonthStyle(
                                  ref.competence
                                ).color,
                              }}
                            />
                            {month(ref.competence, locale)}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {tableUnit(ref.total)}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {refStatus(ref, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <details className="rounded-xl border border-slate-100" open>
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-900">
                {t(locale, "dailyAudit")}
              </summary>
              <div className="max-h-64 overflow-auto">
                <table
                  aria-label={t(locale, "dailyCurve")}
                  className="w-full min-w-[520px] text-left text-xs"
                >
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t(locale, "dateColumn")}</th>
                      <th className="px-3 py-2">{t(locale, "actualColumn")}</th>
                      <th className="px-3 py-2">{t(locale, "plannedName")}</th>
                      <th className="px-3 py-2">
                        {t(locale, "projectionColumn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.points.map(point => (
                      <tr
                        key={`${point.date}-${point.day}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-3 py-2">
                          {date(point.date, locale)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {tableUnit(point.real)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {tableUnit(point.plan)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {tableUnit(point.projection)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : null}
        <footer className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
          <p>
            <strong className="text-slate-700">{t(locale, "method")}</strong>{" "}
            {t(locale, "methodText")}
          </p>
          <p>{t(locale, "estimateText")}</p>
        </footer>
      </div>
    </section>
  );
}

export default V2HistoricalLeadPaceCard;
