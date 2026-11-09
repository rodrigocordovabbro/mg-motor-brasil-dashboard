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

const RED = "#e2212d";
const BLUE = "#2563eb";
const GREEN = "#16a34a";
const MUTED = "#94a3b8";
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type ScenarioKey = "lastMonth" | "last3Months";
type Props = { data: HistoricalLeadPace; actions?: ReactNode };
type ChartRow = {
  day: number;
  date: string;
  [key: string]: string | number | null;
};

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

const unit = (v: number | null | undefined) =>
  v == null ? "N/D" : nf.format(v);
const tableUnit = (v: number | null | undefined) =>
  v == null ? "—" : nf.format(v);
const pct = (v: number | null | undefined) =>
  v == null ? "N/D" : `${pf.format(v)}%`;
const signed = (v: number | null | undefined) =>
  v == null ? "N/D" : `${v < 0 ? "−" : "+"}${nf.format(Math.abs(v))}`;
const signedPct = (v: number | null | undefined) =>
  v == null ? "N/D" : `${v < 0 ? "−" : "+"}${pf.format(Math.abs(v))}%`;
const dayOf = (v: string | null | undefined) => {
  const m = v?.match(/^\d{4}-\d{2}-(\d{2})/);
  return m ? Number(m[1]) : null;
};
const month = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})/);
  return m
    ? new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)))
    : v;
};
const date = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
};
const statusText: Record<HistoricalLeadPaceScenario["status"], string> = {
  READY: "Histórico pronto",
  NO_HISTORY: "Sem histórico comparável",
  SOURCE_LAG: "Fonte atrasada",
  NO_SOURCE: "Fonte indisponível",
};
const paceText: Record<HistoricalLeadPaceScenario["paceStatus"], string> = {
  AHEAD: "À frente",
  BEHIND: "Abaixo do ritmo",
  ON_TRACK: "No ritmo",
  NO_GOAL: "Sem meta",
  UNAVAILABLE: "Indisponível",
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
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: unknown;
    color?: string;
    payload?: ChartRow;
  }>;
  label?: unknown;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-700">Dia {String(label)}</p>
      {payload.map(item => (
        <p
          key={String(item.name)}
          className="mt-1"
          style={{ color: item.color }}
        >
          {item.name}:{" "}
          <strong>
            {unit(typeof item.value === "number" ? item.value : null)} Leads
          </strong>
        </p>
      ))}
      {row && typeof row.real === "number" ? (
        <div className="mt-2 border-t border-slate-100 pt-2 text-slate-600">
          <p>
            Leads do dia:{" "}
            <strong>
              {unit(typeof row.dailyReal === "number" ? row.dailyReal : null)}
            </strong>
          </p>
          <p>
            Diferença acumulada vs. plano:{" "}
            <strong>
              {signed(typeof row.gapToPlan === "number" ? row.gapToPlan : null)}
            </strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}
function refStatus(ref: HistoricalLeadPaceReference) {
  const reasons: Record<string, string> = {
    NO_SOURCE: "Fonte indisponível",
    SOURCE_LAG: "Cobertura incompleta",
    EMPTY_MONTH: "Mês coberto sem Leads",
  };
  return ref.available
    ? "Disponível"
    : reasons[ref.reason ?? ""] || ref.reason || "Indisponível";
}
function metricGrid(items: Array<[string, string, string?]>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(item => (
        <Metric key={item[0]} item={item} />
      ))}
    </div>
  );
}

export function V2HistoricalLeadPaceCard({ data, actions }: Props) {
  const [windowKey, setWindowKey] = useState<ScenarioKey>("last3Months");
  const [showHistorical, setShowHistorical] = useState(false);
  const scenario = data[windowKey];
  const goal = data.goal;
  const asOf = dayOf(data.asOfDate);
  const cutoff = dayOf(data.lastAvailableDate);
  const comparable = data.scope === "GLOBAL" && goal != null;
  const hasCurrent = data.lastAvailableDate !== null;
  const coversAsOf =
    data.lastAvailableDate !== null && data.lastAvailableDate >= data.asOfDate;
  const leftDays = asOf == null ? null : Math.max(data.daysInMonth - asOf, 0);
  const required =
    comparable && coversAsOf && leftDays != null && leftDays > 0
      ? Math.max(0, (goal - data.current) / leftDays)
      : null;
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
        ? "Últimos 3 meses"
        : count
          ? `Últimos 3 meses (${count} disponíveis)`
          : "Últimos 3 meses (indisponíveis)"
      : "Último mês";
  const warnings = [...new Set(scenario.warnings.filter(Boolean))];
  if (scenario.status !== "READY" && !warnings.length)
    warnings.push(
      scenario.status === "NO_HISTORY"
        ? "Não há meses históricos suficientes para uma curva comparável."
        : scenario.status === "SOURCE_LAG"
          ? "A fonte histórica está atrasada; não trate a projeção como confirmação de resultado."
          : "A fonte histórica não está disponível para este cálculo."
    );
  const scopeMessage =
    data.scope === "FILTERED"
      ? "Recorte filtrado: a meta global não é comparada a este subconjunto. O forecast continua visível quando a curva histórica é válida."
      : goal == null
        ? "Sem meta global cadastrada: o realizado e o forecast podem ser lidos, mas não há comparação de atingimento."
        : null;
  const primary = [
    [
      "Leads realizados no mês",
      hasCurrent ? unit(data.current) : "N/D",
      data.lastAvailableDate
        ? `Até ${date(data.lastAvailableDate)}`
        : "Fonte indisponível",
    ],
    [
      "Meta mensal",
      unit(goal),
      data.scope === "FILTERED"
        ? "Meta global; não aplicável ao recorte"
        : undefined,
    ],
    [
      "Projeção de fechamento",
      unit(scenario.projection),
      "Estimativa histórica",
    ],
    [
      "Projeção vs. meta",
      comparable ? signed(scenario.projectedDifference) : "N/D",
      comparable
        ? signedPct(
            scenario.projectedDifference == null || goal === 0
              ? null
              : (scenario.projectedDifference / goal) * 100
          )
        : "Sem comparação global",
    ],
  ] as Array<[string, string, string?]>;
  const secondary = [
    [
      "Esperado até o corte",
      comparable ? unit(scenario.expectedToDate) : "N/D",
      comparable ? "Plano acumulado" : "Meta não comparável",
    ],
    [
      "Diferença acumulada",
      comparable ? signed(scenario.gapToDate) : "N/D",
      comparable
        ? signedPct(
            scenario.gapPercent == null ? null : scenario.gapPercent * 100
          )
        : "Sem comparação global",
    ],
    [
      "Necessário por dia",
      unit(required),
      leftDays == null ? undefined : `${leftDays} dia(s) restantes`,
    ],
    [
      "Ritmo",
      paceText[comparable ? scenario.paceStatus : "NO_GOAL"],
      `${count} mês(es) de referência`,
    ],
  ] as Array<[string, string, string?]>;

  return (
    <section
      data-testid="historical-lead-pace-card"
      className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
            Leads Plan
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
            Leads Plan — ritmo e projeção
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">
            Barras do realizado acumulado desde o dia 1, comparadas ao plano
            histórico e à estimativa de fechamento da competência.
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              Competência {month(data.competence)}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              MTD desde 01/{data.competence.slice(5)} até {date(data.asOfDate)}{" "}
              (corte selecionado, limitado a D-1)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Último dia disponível na fonte:{" "}
              {data.lastAvailableDate ? date(data.lastAvailableDate) : "N/D"}
            </p>
          </div>
          <label className="flex min-w-[220px] flex-col gap-1 text-xs font-semibold text-slate-600">
            Janela de referência
            <select
              aria-label="Janela de referência"
              value={windowKey}
              onChange={event =>
                setWindowKey(event.target.value as ScenarioKey)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-[#e2212d] focus:ring-2 focus:ring-red-100"
            >
              <option value="last3Months">Últimos 3 meses</option>
              <option value="lastMonth">Último mês</option>
            </select>
          </label>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${scenario.status !== "READY" ? "border-amber-200 bg-amber-50 text-amber-800" : comparable && scenario.paceStatus === "BEHIND" ? "border-red-200 bg-red-50 text-red-700" : comparable && scenario.paceStatus === "AHEAD" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">
              {scenario.status === "READY" && comparable
                ? paceText[scenario.paceStatus]
                : statusText[scenario.status]}
            </span>
            <span className="rounded-full border border-current px-2 py-1 text-[11px] font-bold">
              {count} mês(es) na janela selecionada
            </span>
          </div>
          {warnings.map(warning => (
            <p key={warning} className="mt-1 text-xs leading-5">
              {warning}
            </p>
          ))}
        </div>
        {metricGrid(primary)}
        {metricGrid(secondary)}
        {scopeMessage ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            {scopeMessage}
          </p>
        ) : null}
        {comparable ? (
          <div className="space-y-2">
            <div className="flex justify-between gap-3 text-xs text-slate-500">
              <span>{pct(progress)} da meta</span>
              <span>
                {unit(data.current)} de {unit(goal)} Leads
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Atingimento da meta de Leads"
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
                Realizado em barras × plano histórico
              </h3>
              <p className="text-xs text-slate-500">
                Plano: {scenario.label || windowLabel}. Cada barra é o total
                acumulado até aquele dia; compare sua altura à linha azul. A
                projeção tracejada começa no último realizado.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Corte da fonte:{" "}
                {data.lastAvailableDate ? date(data.lastAvailableDate) : "N/D"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={showHistorical}
                onChange={event => setShowHistorical(event.target.checked)}
              />
              Traçar meses históricos
            </label>
          </div>
          <div
            className="h-[420px] w-full min-w-0 overflow-x-auto p-2 focus-visible:ring-2 focus-visible:ring-red-200 sm:p-4"
            role="img"
            tabIndex={0}
            aria-label="Barras de Leads realizados acumulados comparadas ao plano histórico e à projeção de fechamento"
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
                      value: "Dia do mês",
                      position: "insideBottom",
                      offset: -2,
                    }}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={value => nf.format(Number(value))}
                    width={58}
                    label={{
                      value: "Leads acumulados",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip content={<TooltipContent />} />
                  {cutoff != null ? (
                    <ReferenceLine
                      x={cutoff}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      label={{ value: "Corte da fonte", position: "insideTop" }}
                    />
                  ) : null}
                  {comparable ? (
                    <ReferenceLine
                      y={goal}
                      stroke="#0f172a"
                      strokeDasharray="6 4"
                      label={{
                        value: `Meta ${unit(goal)}`,
                        position: "insideTopRight",
                      }}
                    />
                  ) : null}
                  <Bar
                    dataKey="real"
                    name="Realizado acumulado"
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
                        typeof value === "number" ? unit(value) : ""
                      }
                    />
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="plan"
                    name="Plano histórico"
                    stroke={BLUE}
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projection"
                    name="Projeção de fechamento"
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
                            name={month(ref.competence)}
                            stroke={MUTED}
                            strokeWidth={1.5}
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
          <p className="px-4 pb-2 text-[11px] text-slate-500 xl:hidden">
            Deslize o gráfico na horizontal para ver todo o mês sem sobrepor os
            valores.
          </p>
          <div
            className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600"
            aria-label="Legenda do gráfico"
          >
            <span>
              <i className="mr-1 inline-block h-2 w-5 rounded bg-[#2563eb]" />
              Plano histórico
            </span>
            <span>
              <i className="mr-1 inline-block h-3 w-2 rounded-t bg-[#e2212d]" />
              Realizado acumulado (barras)
            </span>
            <span>
              <i className="mr-1 inline-block h-0.5 w-5 border-t-2 border-dashed border-[#16a34a] align-middle" />
              Projeção de fechamento (estimativa)
            </span>
            {showHistorical
              ? data.reference
                  .filter(ref => ref.available && ref.cumulative.length)
                  .map(ref => (
                    <span key={ref.competence}>
                      <i className="mr-1 inline-block h-0.5 w-5 border-t border-[#94a3b8] align-middle" />
                      {month(ref.competence)} (histórico)
                    </span>
                  ))
              : null}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <h3 className="mb-2 font-bold text-slate-900">
              Meses de referência
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Competência</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {references.map(ref => (
                    <tr
                      key={ref.competence}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {month(ref.competence)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {tableUnit(ref.total)}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {refStatus(ref)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <details className="rounded-xl border border-slate-100" open>
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-900">
              Tabela diária para auditoria
            </summary>
            <div className="max-h-64 overflow-auto">
              <table
                aria-label="Tabela diária da curva de Leads"
                className="w-full min-w-[520px] text-left text-xs"
              >
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Real</th>
                    <th className="px-3 py-2">Plano</th>
                    <th className="px-3 py-2">Projeção</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.points.map(point => (
                    <tr
                      key={`${point.date}-${point.day}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2">{date(point.date)}</td>
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
        <footer className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
          <p>
            <strong className="text-slate-700">Método:</strong> média simples
            dos meses históricos, com peso igual por mês; interpolação para
            calendários de 28, 29, 30 ou 31 dias; plano acumulado = meta ×
            participação histórica acumulada.
          </p>
          <p>
            O estimado atual usa realizado ÷ participação esperada no corte. É
            uma estimativa, não garantia nem realizado futuro, e não altera
            mídia futura. Nulos permanecem N/D/—; zero é um volume real quando
            informado.
          </p>
        </footer>
      </div>
    </section>
  );
}

export default V2HistoricalLeadPaceCard;
