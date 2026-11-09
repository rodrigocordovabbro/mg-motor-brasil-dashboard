import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AdminModelComparisonRow,
  AdminModelInsight,
  AdminModelInsights,
  AdminModelInsightsDimension,
  AdminModelMatrix,
  AdminModelMatrixCell,
  AdminModelMixOpportunity,
  AdminModelQualityGap,
} from "@shared/adminModelInsights";
import { OFFICIAL_MODELS, UNIDENTIFIED_MODEL } from "@shared/modelRegistry";
import V2ModelsDashboard from "./V2ModelsDashboard";

const ALL_MODELS = "Todos";
const MODEL_COLORS: Record<string, string> = {
  "MG 4": "#2563eb",
  "MG Urban": "#7c3aed",
  "MG S5": "#0f766e",
  "MG Cyberster": "#b45309",
  "IM 6": "#be185d",
  [UNIDENTIFIED_MODEL]: "#64748b",
};
const FALLBACK_MODEL_COLORS = ["#e2212d", "#d97706", "#0891b2", "#4338ca"];

const DIMENSION_LABELS: Record<AdminModelInsightsDimension, string> = {
  state: "Estado",
  channel: "Canal",
  dealer: "Dealer",
  campaign: "Campanha",
};

const DIMENSION_HELP: Record<AdminModelInsightsDimension, string> = {
  state: "UF conciliada por nome; ausências ficam separadas.",
  channel: "Canal recebido na fonte, sem inferência de modelo.",
  dealer: "Dealer conciliado por de-para explícito.",
  campaign: "Campanha recebida; não usada para identificar modelo.",
};

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function numberFormat(value: number | null | undefined): string {
  return finite(value)
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value)
    : "N/D";
}

function decimalFormat(value: number | null | undefined): string {
  return finite(value)
    ? new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)
    : "N/D";
}

function percentFormat(value: number | null | undefined): string {
  return finite(value) ? `${decimalFormat(value)}%` : "N/D";
}

function signedNumber(value: number | null | undefined): string {
  if (!finite(value)) return "N/D";
  return `${value > 0 ? "+" : ""}${numberFormat(value)}`;
}

function signedPP(value: number | null | undefined): string {
  if (!finite(value)) return "N/D";
  return `${value > 0 ? "+" : ""}${decimalFormat(value)} p.p.`;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "N/D";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return "N/D";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/D";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function selectedModelLabel(model: string): string {
  return model === ALL_MODELS ? "todos os modelos" : model;
}

function coverageLabel(
  value: AdminModelInsights["source"]["currentCoverage"]
): string {
  return {
    COVERED: "Coberta",
    PARTIAL: "Parcial",
    NOT_COVERED: "Não coberta",
    NOT_CONFIGURED: "Não configurada",
  }[value];
}

export function modelColor(model: string): string {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model];
  const hash = [...model].reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  return FALLBACK_MODEL_COLORS[hash % FALLBACK_MODEL_COLORS.length];
}

function Card({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${className}`}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

function CardHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="grid min-w-0 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-0.5 text-[15px] font-bold tracking-[-0.01em] text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="min-w-0 sm:justify-self-end">{action}</div>
      ) : null}
    </header>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warning" | "muted";
  testId: string;
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50/40"
      : tone === "muted"
        ? "border-slate-200 bg-slate-50"
        : "border-slate-200/80 bg-white";
  const valueClass = tone === "warning" ? "text-amber-700" : "text-slate-950";
  return (
    <article
      className={`min-w-0 rounded-2xl border px-4 py-4 ${toneClass}`}
      data-testid={testId}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold tracking-[-0.04em] ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>
    </article>
  );
}

function StatusPanel({
  title,
  message,
  action,
  testId,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  testId: string;
}) {
  return (
    <section
      className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
      data-testid={testId}
      role="status"
    >
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-slate-500">
        {message}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

function RetryButton({ onRetry }: { onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e2212d]/30"
      onClick={onRetry}
    >
      Tentar novamente
    </button>
  );
}

function AppliedFilters({ data }: { data: AdminModelInsights }) {
  const filters = data.period.filters;
  const visible = [
    [
      "Período",
      `${dateLabel(filters.dateFrom)} a ${dateLabel(filters.dateTo)}`,
    ],
    ["Modelo do filtro global", filters.model || "Todos"],
    ["Canal", filters.channel || "Todos"],
    ["Dealer", filters.dealer || "Todos"],
    ["Campanha", filters.campaign || "Todas"],
    ["Busca", filters.search ? "[busca aplicada]" : "Não aplicada"],
  ];
  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="admin-model-insights-applied-filters"
    >
      {visible.map(([label, value]) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600"
        >
          <strong className="font-semibold text-slate-700">{label}:</strong>
          <span className="truncate" title={value}>
            {value}
          </span>
        </span>
      ))}
    </div>
  );
}

function SourceMethodology({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const { source, period } = data;
  return (
    <Card testId="admin-model-insights-source">
      <CardHeading
        eyebrow="Rastreabilidade"
        title="Fonte, corte e metodologia"
        description="A tela exibe somente agregados sanitizados do endpoint administrativo. Nenhuma linha individual, contato ou credencial é carregada aqui."
      />
      <div className="grid min-w-0 gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-2">
          <InfoItem
            label="Fonte"
            value={source.name || "Fonte não identificada"}
          />
          <InfoItem
            label="Modo de leitura"
            value={
              source.mode === "authenticated-import"
                ? "Importação autenticada"
                : source.mode
            }
          />
          <InfoItem
            label="Importado em"
            value={dateTimeLabel(source.importedAt)}
          />
          <InfoItem
            label="Corte D-1"
            value={`${dateLabel(period.cutoffDate)} · America/Sao_Paulo`}
          />
          <InfoItem
            label="Cobertura atual"
            value={coverageLabel(source.currentCoverage)}
          />
          <InfoItem
            label="Cobertura anterior"
            value={coverageLabel(source.previousCoverage)}
          />
          <InfoItem
            label="Linhas na fonte"
            value={numberFormat(source.totalRows)}
          />
          <InfoItem
            label="Datas inválidas na fonte"
            value={numberFormat(source.invalidDateRows)}
          />
          <InfoItem
            label="Primeiro dia disponível"
            value={dateLabel(source.earliestLeadDate)}
          />
          <InfoItem
            label="Último dia disponível"
            value={dateLabel(source.latestLeadDate)}
          />
          <InfoItem
            label="Filtro local"
            value={selectedModelLabel(selectedModel)}
          />
          <InfoItem
            label="Período aplicado"
            value={`${dateLabel(period.dateFrom)} a ${dateLabel(period.dateTo)} (${numberFormat(period.days)} dias)`}
          />
        </dl>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Filtros canônicos aplicados
          </p>
          <div className="mt-3">
            <AppliedFilters data={data} />
          </div>
          <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-600">
            {data.notes.map((note, index) => (
              <li key={`${note}-${index}`} className="flex gap-2">
                <span className="mt-0.5 text-[#e2212d]" aria-hidden="true">
                  •
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

function MixSummary({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const selected = data.mix.models.find(item => item.model === selectedModel);
  const rows =
    selectedModel === ALL_MODELS ? data.mix.models : selected ? [selected] : [];
  return (
    <Card testId="admin-model-insights-mix">
      <CardHeading
        eyebrow="Mix da população integral"
        title="Participação por modelo"
        description="O total global permanece identificado mesmo quando o filtro local limita as leituras abaixo. Participação é volume observado no recorte, não meta."
      />
      <div className="grid min-w-0 gap-3 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.length ? (
          rows.map(row => (
            <article
              key={row.model}
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: modelColor(row.model) }}
                    aria-hidden="true"
                  />
                  <h3
                    className="truncate text-sm font-semibold text-slate-800"
                    title={row.model}
                  >
                    {row.model}
                  </h3>
                </div>
                <strong className="shrink-0 text-xl tabular-nums text-slate-950">
                  {numberFormat(row.count)}
                </strong>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${finite(row.sharePercent) ? Math.min(100, Math.max(0, row.sharePercent)) : 0}%`,
                    backgroundColor: modelColor(row.model),
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {percentFormat(row.sharePercent)} do total de{" "}
                {numberFormat(row.denominator)} Leads
              </p>
              {!row.identified ? (
                <p className="mt-1 text-[11px] font-semibold text-amber-700">
                  Não identificado; contabilizado, sem oportunidade comercial.
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            Nenhum modelo disponível neste recorte.
          </p>
        )}
      </div>
    </Card>
  );
}

function MatrixCell({ cell }: { cell: AdminModelMatrixCell }) {
  return (
    <td
      className="min-w-[132px] border-l border-slate-100 px-3 py-3 align-top"
      title={`Denominador do grupo: ${numberFormat(cell.categoryDenominator)}; denominador do modelo: ${numberFormat(cell.modelDenominator)}`}
    >
      <span className="block text-sm font-bold tabular-nums text-slate-800">
        {numberFormat(cell.count)}
      </span>
      <span className="mt-1 block text-[10px] font-semibold text-[#0f766e]">
        {percentFormat(cell.shareOfCategoryPercent)} do grupo
      </span>
      <span className="mt-0.5 block text-[10px] text-slate-500">
        {percentFormat(cell.shareOfModelPercent)} do modelo
      </span>
    </td>
  );
}

function MatrixTable({
  matrix,
  selectedModel,
}: {
  matrix: AdminModelMatrix;
  selectedModel: string;
}) {
  const rows =
    selectedModel === ALL_MODELS
      ? matrix.rows
      : matrix.rows.filter(row => row.model === selectedModel);
  const visibleTotal = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card testId={`admin-model-insights-matrix-${matrix.dimension}`}>
      <CardHeading
        eyebrow="Cruzamento"
        title={`Modelo × ${DIMENSION_LABELS[matrix.dimension]}`}
        description={DIMENSION_HELP[matrix.dimension]}
      />
      <div
        className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] leading-5 text-slate-600"
        data-testid="admin-model-insights-matrix-legend"
      >
        <strong className="text-slate-700">Legenda dos denominadores:</strong> o
        número grande é a célula; “do grupo” = célula ÷ total da categoria; “do
        modelo” = célula ÷ total do modelo. O filtro local mostra apenas a linha
        escolhida, sem substituir os denominadores globais do servidor.
      </div>
      <div className="max-w-full overflow-auto" tabIndex={0}>
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-[2] min-w-[165px] bg-slate-50 px-5 py-3 font-bold">
                Modelo
              </th>
              {matrix.categories.map(category => (
                <th
                  key={category.label}
                  className="min-w-[132px] px-3 py-3 font-bold"
                >
                  <span className="block normal-case tracking-normal text-slate-700">
                    {category.label}
                  </span>
                  <span className="mt-1 block normal-case tracking-normal font-medium text-slate-400">
                    {numberFormat(category.count)} no grupo ·{" "}
                    {percentFormat(category.sharePercent)} do recorte
                  </span>
                </th>
              ))}
              <th className="min-w-[90px] px-5 py-3 text-right font-bold">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.map(row => (
                <tr key={row.model}>
                  <th className="sticky left-0 z-[1] bg-white px-5 py-3 text-left font-semibold text-slate-700">
                    {row.model}
                  </th>
                  {matrix.categories.map(category => {
                    const cell = row.cells.find(
                      item => item.category === category.label
                    );
                    return cell ? (
                      <MatrixCell
                        key={`${row.model}-${category.label}`}
                        cell={cell}
                      />
                    ) : (
                      <td
                        key={`${row.model}-${category.label}`}
                        className="border-l border-slate-100 px-3 py-3 text-slate-400"
                      >
                        N/D
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">
                    {numberFormat(row.count)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={matrix.categories.length + 2}
                  className="px-5 py-8 text-center text-slate-400"
                >
                  Nenhuma linha de modelo para este filtro local.
                </td>
              </tr>
            )}
            <tr
              className="bg-slate-50 font-bold"
              data-testid="admin-model-insights-matrix-total"
            >
              <th className="sticky left-0 z-[1] bg-slate-50 px-5 py-3 text-left text-slate-700">
                Total visível
              </th>
              {matrix.categories.map(category => {
                const groupTotal = rows.reduce(
                  (sum, row) =>
                    sum +
                    (row.cells.find(cell => cell.category === category.label)
                      ?.count ?? 0),
                  0
                );
                return (
                  <td
                    key={`total-${category.label}`}
                    className="border-l border-slate-100 px-3 py-3 align-top text-slate-700"
                  >
                    <span className="block tabular-nums">
                      {numberFormat(groupTotal)}
                    </span>
                    <span className="text-[10px] font-normal text-slate-500">
                      de {numberFormat(category.count)} no recorte global
                    </span>
                  </td>
                );
              })}
              <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                {numberFormat(visibleTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">
        A soma das células de cada linha reconcilia com o total da linha. Com
        “Todos”, a soma por categoria reconcilia com o total do grupo; com
        filtro local, o rodapé mostra o subconjunto e conserva o denominador
        global para leitura auditável.
      </p>
    </Card>
  );
}

function dailyModelNames(
  data: Pick<AdminModelInsights, "daily" | "mix">,
  selectedModel: string
): string[] {
  if (selectedModel !== ALL_MODELS) return [selectedModel];

  const available = new Set<string>([
    ...data.mix.models.map(item => item.model),
    ...data.daily.flatMap(day => Object.keys(day.models ?? {})),
  ]);
  if (data.mix.unidentifiedTotal > 0) available.add(UNIDENTIFIED_MODEL);

  const official = new Set<string>(OFFICIAL_MODELS);
  const canonical: string[] = OFFICIAL_MODELS.filter(model =>
    available.has(model)
  );
  if (available.has(UNIDENTIFIED_MODEL)) canonical.push(UNIDENTIFIED_MODEL);
  const extra = [...available]
    .filter(model => !official.has(model) && model !== UNIDENTIFIED_MODEL)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...canonical, ...extra];
}

export type AdminModelDailySeriesPoint = {
  date: string;
  total: number | null;
  sourceAvailable: boolean;
  models: Array<{ model: string; value: number | null }>;
};

export function buildAdminModelDailySeries(
  data: Pick<AdminModelInsights, "daily" | "mix">,
  selectedModel: string
): AdminModelDailySeriesPoint[] {
  const models = dailyModelNames(data, selectedModel);
  return data.daily.map(day => ({
    date: day.date,
    total: day.sourceAvailable && finite(day.total) ? day.total : null,
    sourceAvailable: day.sourceAvailable,
    models: models.map(model => {
      const rawValue = day.models?.[model];
      return {
        model,
        value:
          day.sourceAvailable && finite(day.total)
            ? finite(rawValue)
              ? rawValue
              : 0
            : null,
      };
    }),
  }));
}

export function DailySeries({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const models = useMemo(
    () => dailyModelNames(data, selectedModel),
    [data, selectedModel]
  );
  const series = useMemo(
    () => buildAdminModelDailySeries(data, selectedModel),
    [data, selectedModel]
  );
  const max = Math.max(
    1,
    ...series.flatMap(day =>
      day.models.flatMap(point => (finite(point.value) ? [point.value] : []))
    )
  );
  const dayWidth = Math.max(88, models.length * 32 + 20);
  const columnCount = Math.max(series.length, 1);
  const chartMinWidth = Math.max(720, series.length * dayWidth);

  return (
    <Card testId="admin-model-insights-daily">
      <CardHeading
        eyebrow="Evolução diária"
        title={`Leads por dia · ${selectedModelLabel(selectedModel)}`}
        description="Cada dia mostra uma barra por modelo, lado a lado. Zero coberto é zero real; fora da cobertura ou futuro permanece N/D."
      />
      <div
        className="max-w-full overflow-x-auto px-5 py-5"
        tabIndex={0}
        aria-label="Rolagem horizontal da série diária"
      >
        <div
          className="grid items-end gap-2 border-b border-slate-200 pb-2"
          style={{
            minHeight: 270,
            minWidth: chartMinWidth,
            gridTemplateColumns: `repeat(${columnCount}, minmax(${dayWidth}px, 1fr))`,
          }}
          role="group"
          aria-label="Série diária de Leads agrupada por modelo"
        >
          {series.map(day => {
            const details = day.models
              .map(
                point =>
                  `${point.model}: ${finite(point.value) ? numberFormat(point.value) : "N/D"}`
              )
              .join("; ");
            return (
              <div
                key={day.date}
                className="flex h-[250px] min-w-0 flex-col items-center justify-end gap-1"
                data-testid={`admin-model-insights-day-${day.date}`}
                aria-label={`${dateLabel(day.date)} — ${details}`}
              >
                <div className="flex h-[216px] w-full min-w-0 items-end justify-center gap-0.5">
                  {day.models.map(point => {
                    const value = point.value;
                    const height =
                      finite(value) && value > 0
                        ? Math.max(7, (value / max) * 178)
                        : 0;
                    const valueLabel = finite(value)
                      ? numberFormat(value)
                      : "N/D";
                    const barTestId = `admin-model-insights-bar-${day.date}-${point.model}`;
                    return (
                      <div
                        key={point.model}
                        className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                        data-model={point.model}
                      >
                        <span className="max-w-full truncate text-[9px] font-bold tabular-nums text-slate-700">
                          {valueLabel}
                        </span>
                        <div
                          className="flex h-[178px] w-full items-end justify-center"
                          title={`${dateLabel(day.date)} · ${point.model}: ${valueLabel}${finite(day.total) ? ` · Total do dia: ${numberFormat(day.total)}` : ""}`}
                        >
                          {finite(value) ? (
                            <div
                              className="w-full max-w-5 rounded-t-md transition-[height]"
                              style={{
                                height,
                                backgroundColor: modelColor(point.model),
                              }}
                              data-testid={barTestId}
                              data-value={value}
                              aria-label={`${dateLabel(day.date)} — ${point.model}: ${valueLabel} Leads`}
                              role="img"
                            />
                          ) : (
                            <div
                              className="w-full max-w-5 border-t-2 border-dashed border-slate-300"
                              data-testid={barTestId}
                              data-value="N/D"
                              aria-label={`${dateLabel(day.date)} — ${point.model}: N/D, fonte não disponível`}
                              role="img"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <span className="max-w-full truncate text-[10px] text-slate-500">
                  {dateLabel(day.date)}
                </span>
                <span
                  className="max-w-full truncate text-[9px] tabular-nums text-slate-400"
                  title={
                    finite(day.total)
                      ? `Total do dia: ${numberFormat(day.total)} Leads`
                      : "Total do dia: N/D"
                  }
                >
                  Total: {finite(day.total) ? numberFormat(day.total) : "N/D"}
                </span>
                <span className="sr-only">
                  {day.sourceAvailable
                    ? "Fonte disponível"
                    : "Fonte não disponível"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
        <div
          className="flex flex-wrap gap-x-5 gap-y-2"
          role="list"
          aria-label="Legenda de cores por modelo"
        >
          {models.map(model => (
            <span
              key={model}
              className="inline-flex items-center gap-2"
              data-testid={`admin-model-insights-legend-${model}`}
              role="listitem"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: modelColor(model) }}
                aria-hidden="true"
              />
              <span>{model}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <span
              className="w-3 border-t-2 border-dashed border-slate-400"
              aria-hidden="true"
            />
            N/D: cobertura não confirmada
          </span>
        </div>
        <p className="mt-2">
          Valores acima de cada barra são contagens do modelo. O total do dia é
          apenas contextual; a seleção local exibe somente o modelo escolhido,
          sem preencher dias ausentes.
        </p>
      </div>
    </Card>
  );
}

function Comparison({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const rows = data.comparison.rows.filter(
    row => selectedModel === ALL_MODELS || row.model === selectedModel
  );
  return (
    <Card testId="admin-model-insights-comparison">
      <CardHeading
        eyebrow="Janela anterior"
        title="Evolução comparativa por modelo"
        description={`${dateLabel(data.comparison.currentPeriod.dateFrom)}–${dateLabel(data.comparison.currentPeriod.dateTo)} versus ${dateLabel(data.comparison.previousPeriod.dateFrom)}–${dateLabel(data.comparison.previousPeriod.dateTo)} · mesma duração e filtros dimensionais.`}
      />
      <div
        className={`border-b px-5 py-3 text-xs leading-5 ${data.comparison.status === "AVAILABLE" ? "border-emerald-100 bg-emerald-50/50 text-emerald-800" : "border-amber-100 bg-amber-50/50 text-amber-800"}`}
      >
        <strong>
          {data.comparison.status === "AVAILABLE"
            ? "Comparação disponível."
            : "Comparação N/D."}
        </strong>{" "}
        {data.comparison.note}
      </div>
      <div className="max-w-full overflow-auto" tabIndex={0}>
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-3 font-bold">Modelo</th>
              <th className="px-3 py-3 text-right font-bold">Atual</th>
              <th className="px-3 py-3 text-right font-bold">Share atual</th>
              <th className="px-3 py-3 text-right font-bold">Anterior</th>
              <th className="px-3 py-3 text-right font-bold">Share anterior</th>
              <th className="px-5 py-3 text-right font-bold">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.map(row => (
                <ComparisonRow
                  key={row.model}
                  row={row}
                  available={data.comparison.status === "AVAILABLE"}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-slate-400"
                >
                  Nenhum modelo para este filtro local.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ComparisonRow({
  row,
  available,
}: {
  row: AdminModelComparisonRow;
  available: boolean;
}) {
  return (
    <tr>
      <th className="px-5 py-3 text-left font-semibold text-slate-700">
        {row.model}
      </th>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800">
        {numberFormat(row.currentCount)}{" "}
        <span className="font-normal text-slate-400">
          / {numberFormat(row.currentDenominator)}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
        {percentFormat(row.currentSharePercent)}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800">
        {available ? numberFormat(row.previousCount) : "N/D"}{" "}
        {available ? (
          <span className="font-normal text-slate-400">
            / {numberFormat(row.previousDenominator)}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
        {available ? percentFormat(row.previousSharePercent) : "N/D"}
      </td>
      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-700">
        <span className="block">
          {available ? signedNumber(row.deltaCount) : "N/D"}
        </span>
        <span className="text-[10px] font-normal text-slate-500">
          {available ? signedPP(row.deltaSharePP) : "janela não coberta"}
        </span>
      </td>
    </tr>
  );
}

function InsightCard({
  title,
  detail,
  sample,
  suggestion,
  tone = "default",
}: {
  title: string;
  detail: string;
  sample: string;
  suggestion: string;
  tone?: "default" | "warning" | "quality";
}) {
  const border =
    tone === "warning"
      ? "border-amber-200"
      : tone === "quality"
        ? "border-slate-300"
        : "border-slate-200";
  return (
    <article className={`min-w-0 rounded-xl border ${border} bg-white p-4`}>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
      <p className="mt-3 text-[11px] leading-4 text-slate-500">
        <strong className="text-slate-700">Amostra:</strong> {sample}
      </p>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        <strong className="text-slate-700">Sugestão verificável:</strong>{" "}
        {suggestion}
      </p>
    </article>
  );
}

function QualityGaps({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const gaps = data.quality.gaps
    .filter(
      gap =>
        selectedModel === ALL_MODELS ||
        !gap.model ||
        gap.model === selectedModel
    )
    .slice(0, 12);
  const versionGaps = data.quality.versionByModel
    .filter(row => selectedModel === ALL_MODELS || row.model === selectedModel)
    .filter(row => row.missing + row.invalid > 0)
    .slice(0, 12);
  const totalCards = gaps.length + versionGaps.length;
  return (
    <Card testId="admin-model-insights-quality">
      <CardHeading
        eyebrow="Qualidade"
        title="Gaps de qualidade"
        description="Campos ausentes, inválidos, desconhecidos ou não conciliados permanecem na base, mas não são oportunidades comerciais."
      />
      <div className="grid min-w-0 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {gaps.map((gap, index) => (
          <QualityGapCard
            key={`${gap.dimension}-${gap.code}-${gap.label}-${gap.model ?? index}`}
            gap={gap}
            threshold={data.quality.lowSampleThreshold}
          />
        ))}
        {versionGaps.map(row => (
          <InsightCard
            key={`version-${row.model}`}
            title={`Versão faltante ou inválida · ${row.model}`}
            detail="O campo de versão não foi identificado de forma válida para este modelo."
            sample={`${numberFormat(row.missing + row.invalid)} de ${numberFormat(row.denominator)} Leads (${percentFormat(row.missingOrInvalidSharePercent)}).`}
            suggestion="Revisar o preenchimento da origem e acompanhar a próxima carga; não atribuir uma versão ausente no cliente."
            tone="quality"
          />
        ))}
        {!totalCards ? (
          <p className="text-sm text-slate-500">
            Nenhum gap de qualidade foi retornado para este filtro. Isso não
            cria uma garantia comercial.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function qualityGapDimensionLabel(
  dimension: AdminModelQualityGap["dimension"]
): string {
  if (dimension === "model") return "Modelo";
  if (dimension === "version") return "Versão";
  return DIMENSION_LABELS[dimension];
}

function QualityGapCard({
  gap,
  threshold,
}: {
  gap: AdminModelQualityGap;
  threshold: number;
}) {
  const reason =
    gap.code === "MISSING"
      ? "Campo ausente"
      : gap.code === "INVALID"
        ? "Valor inválido"
        : gap.code === "UNRECONCILED"
          ? "Não conciliado"
          : "Valor desconhecido";
  return (
    <InsightCard
      title={`${qualityGapDimensionLabel(gap.dimension)} · ${gap.label}`}
      detail={`${reason}. Este gap é diagnóstico de qualidade e não é elegível para oportunidade comercial.`}
      sample={`${numberFormat(gap.count)} de ${numberFormat(gap.denominator)} Leads (${percentFormat(gap.sharePercent)}). Limite de baixa amostra: ${numberFormat(threshold)}.`}
      suggestion="Validar o campo na origem e no de-para autorizado, sem excluir ou redistribuir registros."
      tone="quality"
    />
  );
}

function OpportunityGaps({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const rows = data.opportunities
    .filter(
      item => selectedModel === ALL_MODELS || item.model === selectedModel
    )
    .slice(0, 12);
  return (
    <Card testId="admin-model-insights-opportunities">
      <CardHeading
        eyebrow="Benchmark descritivo"
        title="Oportunidades de mix"
        description="O gap compara a participação observada do modelo com o mix global no mesmo recorte. Não representa meta, déficit de vendas, conversão, CPL ou entrega CRM."
      />
      <div className="grid min-w-0 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(item => (
          <InsightCard
            key={`${item.dimension}-${item.group}-${item.model}`}
            title={`${item.model} · ${item.group}`}
            detail={`${DIMENSION_LABELS[item.dimension]}: participação observada ${percentFormat(item.actualSharePercent)} versus benchmark ${percentFormat(item.expectedSharePercent)}; diferença ${signedPP(item.gapPP)}. Volume esperado pelo benchmark: ${decimalFormat(item.expectedCount)}.`}
            sample={`${numberFormat(item.groupCount)} Leads no grupo; mínimo para benchmark: ${numberFormat(item.sampleThreshold)}. Célula observada: ${numberFormat(item.modelCount)}.`}
            suggestion="Validar este cruzamento com a origem e o contexto de cobertura antes de qualquer decisão; o benchmark não é uma meta."
            tone="warning"
          />
        ))}
        {!rows.length ? (
          <p className="text-sm text-slate-500">
            Nenhum benchmark de mix elegível para este filtro. Grupos abaixo da
            amostra mínima ficam fora da lista.
          </p>
        ) : null}
      </div>
      {data.limits.opportunitiesTruncated ? (
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
          A lista de oportunidades foi limitada pelo servidor; as matrizes
          permanecem completas.
        </p>
      ) : null}
    </Card>
  );
}

function Concentrations({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const rows = data.insights
    .filter(
      item =>
        item.kind === "CONCENTRATION" &&
        (selectedModel === ALL_MODELS || item.model === selectedModel)
    )
    .slice(0, 12);
  return (
    <Card testId="admin-model-insights-concentration">
      <CardHeading
        eyebrow="Distribuição"
        title="Concentrações para investigação"
        description="Sinais de concentração são alertas de distribuição agregada; não provam causalidade, qualidade de mídia ou resultado comercial."
      />
      <div className="grid min-w-0 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((item, index) => (
          <ConcentrationCard
            key={`${item.title}-${item.group ?? index}`}
            item={item}
            data={data}
          />
        ))}
        {!rows.length ? (
          <p className="text-sm text-slate-500">
            Nenhuma concentração priorizada para este filtro.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function ConcentrationCard({
  item,
  data,
}: {
  item: AdminModelInsight;
  data: AdminModelInsights;
}) {
  const matrix =
    item.dimension && item.dimension !== "model" && item.dimension !== "version"
      ? data.matrices[item.dimension]
      : undefined;
  const row = matrix?.rows.find(candidate => candidate.model === item.model);
  const denominator = row?.denominator ?? null;
  return (
    <InsightCard
      title={item.title}
      detail={item.detail}
      sample={`${numberFormat(item.count)} Leads no agrupamento concentrado de ${numberFormat(denominator)} do modelo; participação: ${percentFormat(item.sharePercent)}.`}
      suggestion="Conferir se a concentração se mantém em outra janela e validar a cobertura do grupo antes de agir."
    />
  );
}

function OtherInsights({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const rows = data.insights
    .filter(
      item =>
        !["CONCENTRATION", "MIX_GAP", "QUALITY_GAP"].includes(item.kind) &&
        (selectedModel === ALL_MODELS ||
          !item.model ||
          item.model === selectedModel)
    )
    .slice(0, 12);
  if (!rows.length) return null;
  return (
    <Card testId="admin-model-insights-other">
      <CardHeading
        eyebrow="Leitura complementar"
        title="Outros alertas priorizados"
        description="Alertas calculados pelo servidor com a mesma amostra do recorte; o filtro local não altera o total global."
      />
      <div className="grid min-w-0 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((item, index) => (
          <InsightCard
            key={`${item.kind}-${item.title}-${index}`}
            title={item.title}
            detail={item.detail}
            sample={`${numberFormat(item.count)} Leads${finite(item.sharePercent) ? ` · ${percentFormat(item.sharePercent)} do denominador informado` : " · percentual N/D"}.`}
            suggestion="Revisar a origem agregada e confirmar a leitura com uma janela comparável; não tratar como meta ou conversão."
          />
        ))}
      </div>
    </Card>
  );
}

function InsightsSection({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  return (
    <section className="space-y-5" data-testid="admin-model-insights-gaps">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
          Gaps e sinais
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-slate-950">
          Onde investigar a qualidade e o mix
        </h2>
        <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-500">
          Cada cartão traz motivo, amostra e uma verificação possível. Nenhum
          cartão cria meta, déficit de vendas, conversão, CPL ou prova de envio.
        </p>
      </div>
      <QualityGaps data={data} selectedModel={selectedModel} />
      <OpportunityGaps data={data} selectedModel={selectedModel} />
      <Concentrations data={data} selectedModel={selectedModel} />
      <OtherInsights data={data} selectedModel={selectedModel} />
    </section>
  );
}

function AdminHeader({
  data,
  selectedModel,
  onModelChange,
}: {
  data: AdminModelInsights;
  selectedModel: string;
  onModelChange: (model: string) => void;
}) {
  return (
    <header className="min-w-0" data-testid="admin-model-insights-header">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e2212d]">
            Administrador operacional · Leads
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">
            Análise por modelo
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            Cruzamentos, qualidade e evolução da população integral filtrada,
            antes da paginação. Esta aba é exclusiva do Administrador e usa o
            mesmo corte D-1 do painel.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          Acesso restrito ·{" "}
          {data.audience === "admin" ? "Administrador" : "não identificado"}
        </div>
      </div>
      <div className="mt-5 grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] lg:items-end">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Filtros globais recebidos
          </p>
          <div className="mt-2">
            <AppliedFilters data={data} />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            O seletor ao lado é local desta aba: afeta matrizes, curva e gaps,
            mas mantém o total global identificado visível.
          </p>
        </div>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Modelo para detalhar localmente
          </span>
          <select
            className="v2-input min-h-11 w-full"
            value={selectedModel}
            onChange={event => onModelChange(event.target.value)}
            data-testid="admin-model-insights-local-filter"
          >
            <option value={ALL_MODELS}>{ALL_MODELS}</option>
            {data.mix.models.map(model => (
              <option key={model.model} value={model.model}>
                {model.model}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

function MainContent({
  data,
  selectedModel,
}: {
  data: AdminModelInsights;
  selectedModel: string;
}) {
  const selectedModelRow = data.mix.models.find(
    item => item.model === selectedModel
  );
  const selectedCount =
    selectedModel === ALL_MODELS ? data.mix.total : selectedModelRow?.count;
  const selectedShare =
    selectedModel === ALL_MODELS ? 100 : selectedModelRow?.sharePercent;
  const qualityIssueCount =
    data.quality.unknownModelCount +
    data.quality.missingStateCount +
    data.quality.missingDealerCount +
    data.quality.missingCampaignCount +
    data.quality.versionsMissing +
    data.quality.versionsInvalid;
  return (
    <div className="space-y-5">
      <section
        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="KPIs da análise por modelo"
      >
        <KpiCard
          label="Total global"
          value={numberFormat(data.total)}
          hint="Leads no recorte canônico integral"
          testId="admin-model-insights-kpi-total"
        />
        <KpiCard
          label="Modelos identificados"
          value={numberFormat(data.mix.identifiedTotal)}
          hint={`${percentFormat(data.total ? (data.mix.identifiedTotal / data.total) * 100 : null)} do total global`}
          testId="admin-model-insights-kpi-identified"
        />
        <KpiCard
          label="Não identificados"
          value={numberFormat(data.mix.unidentifiedTotal)}
          hint="Contabilizados, sem inferência comercial"
          tone={data.mix.unidentifiedTotal ? "warning" : "muted"}
          testId="admin-model-insights-kpi-unidentified"
        />
        <KpiCard
          label="Qualidade pendente"
          value={numberFormat(qualityIssueCount)}
          hint="Modelo, campos dimensionais ou versão"
          tone={qualityIssueCount ? "warning" : "muted"}
          testId="admin-model-insights-kpi-quality"
        />
        <KpiCard
          label={`Filtro local · ${selectedModelLabel(selectedModel)}`}
          value={numberFormat(selectedCount)}
          hint={`${percentFormat(selectedShare)} do total global; sem alterar a população`}
          testId="admin-model-insights-kpi-local"
        />
      </section>
      <MixSummary data={data} selectedModel={selectedModel} />
      <DailySeries data={data} selectedModel={selectedModel} />
      <Comparison data={data} selectedModel={selectedModel} />
      <section
        className="space-y-5"
        data-testid="admin-model-insights-matrices"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
            Cruzamentos dimensionais
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-slate-950">
            Onde cada modelo aparece
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-500">
            As matrizes são completas e roláveis. Cada célula mostra contagem,
            share do grupo e share do modelo, com totais que permitem
            reconciliar o recorte.
          </p>
        </div>
        {(["state", "channel", "dealer", "campaign"] as const).map(
          dimension => (
            <MatrixTable
              key={dimension}
              matrix={data.matrices[dimension]}
              selectedModel={selectedModel}
            />
          )
        )}
      </section>
      <InsightsSection data={data} selectedModel={selectedModel} />
      <Card testId="admin-model-insights-detail">
        <CardHeading
          eyebrow="Detalhamento legado"
          title="Modelos, versões e diagnóstico sanitizado"
          description="Reutiliza a análise existente, baseada na mesma população filtrada. Versões não informadas ou inválidas continuam explícitas; nenhum contato é exibido."
        />
        <div className="p-3 sm:p-5">
          <V2ModelsDashboard analysis={data.modelAnalysis} canManage />
        </div>
      </Card>
      <SourceMethodology data={data} selectedModel={selectedModel} />
    </div>
  );
}

export type V2AdminModelInsightsProps = {
  data?: AdminModelInsights;
  sourceStatus?: "READY" | "NOT_CONFIGURED";
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

export default function V2AdminModelInsights({
  data,
  sourceStatus,
  loading = false,
  error,
  onRetry,
}: V2AdminModelInsightsProps) {
  const [selectedModel, setSelectedModel] = useState(ALL_MODELS);
  const availableModels = useMemo(
    () =>
      new Set([
        ALL_MODELS,
        ...(data?.mix.models.map(item => item.model) ?? []),
      ]),
    [data]
  );

  useEffect(() => {
    setSelectedModel(current =>
      availableModels.has(current) ? current : ALL_MODELS
    );
  }, [availableModels]);

  if (!data && sourceStatus === "NOT_CONFIGURED") {
    return (
      <div className="min-w-0 space-y-3">
        <StatusPanel
          title="Fonte não configurada"
          message="A fonte autenticada de Leads não está configurada. Ausência de fonte não é tratada como zero; mix, matrizes, curva e comparação permanecem N/D."
          action={<RetryButton onRetry={onRetry} />}
          testId="admin-model-insights-source-unknown"
        />
        <p className="text-xs leading-5 text-slate-500">
          A análise utiliza os filtros aplicados e a população canônica até D-1.
          Gaps de mix são referências do recorte, não metas ou vendas.
        </p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <StatusPanel
        title="Carregando análise por modelo"
        message="Consultando a população integral filtrada. Nenhum número é criado enquanto a fonte não responde."
        testId="admin-model-insights-loading"
      />
    );
  }

  if (error && !data) {
    return (
      <StatusPanel
        title="Não foi possível carregar a análise"
        message={error}
        action={<RetryButton onRetry={onRetry} />}
        testId="admin-model-insights-error"
      />
    );
  }

  if (!data) {
    return (
      <StatusPanel
        title="Fonte da análise aguardando configuração"
        message="A análise administrativa ainda não recebeu uma resposta da fonte autenticada. A tela não inventa zeros, metas ou registros."
        action={<RetryButton onRetry={onRetry} />}
        testId="admin-model-insights-no-data"
      />
    );
  }

  if (data.status === "NOT_CONFIGURED") {
    return (
      <div className="min-w-0 space-y-5">
        <AdminHeader
          data={data}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
        <StatusPanel
          title="Fonte não configurada"
          message="A fonte autenticada de Leads não está configurada. Ausência de fonte não é tratada como zero; mix, matrizes, curva e comparação permanecem N/D."
          action={<RetryButton onRetry={onRetry} />}
          testId="admin-model-insights-source-unknown"
        />
        <SourceMethodology data={data} selectedModel={selectedModel} />
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="min-w-0 space-y-5">
        <AdminHeader
          data={data}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
        <StatusPanel
          title="Nenhum Lead no recorte"
          message="O recorte está pronto e retornou zero Leads reais. Isso é diferente de fonte ausente; não há benchmark de mix nem curva a preencher."
          testId="admin-model-insights-empty"
        />
        <SourceMethodology data={data} selectedModel={selectedModel} />
      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-5" data-testid="admin-model-insights">
      <AdminHeader
        data={data}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />
      {loading ? (
        <p
          className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800"
          role="status"
        >
          Atualizando a análise com os filtros aplicados…
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800"
          role="status"
        >
          A análise anterior permanece visível. Nova consulta: {error}
        </p>
      ) : null}
      <MainContent data={data} selectedModel={selectedModel} />
    </section>
  );
}
