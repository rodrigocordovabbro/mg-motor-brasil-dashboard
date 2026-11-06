import { useEffect, useMemo, useState, type ReactNode } from "react";
import { OFFICIAL_MODELS, UNIDENTIFIED_MODEL } from "@shared/modelRegistry";
import type {
  ModelAnalysis,
  ModelDetail,
  ModelSourceDiagnostic,
  ModelVersionCount,
  ModelVersionStatus,
} from "@shared/modelAnalysis";
import type { V2Count } from "@shared/v2Types";

type V2ModelsDashboardProps = {
  analysis?: ModelAnalysis;
  canManage?: boolean;
};

type DistributionItem = {
  label: string;
  count: number;
  percent: number | null;
  detail?: ModelDetail;
  isUnidentified?: boolean;
};

const UNIDENTIFIED_LABEL = UNIDENTIFIED_MODEL;
const ALL_MODELS_LABEL = "Todos";
const MODEL_COLORS = [
  "#e2212d",
  "#2563eb",
  "#0f766e",
  "#d97706",
  "#7c3aed",
  "#64748b",
];

function safeCount(value: number | null | undefined) {
  return Number.isFinite(value) && value != null && value > 0 ? value : 0;
}

function numberFormat(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    safeCount(value)
  );
}

function percentFormat(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.max(0, value) / 100);
}

function percentFromCount(count: number, total: number) {
  return total > 0 ? (safeCount(count) / total) * 100 : null;
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${className}`}
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
    <div className="grid min-w-0 gap-2 border-b border-slate-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="min-w-0 sm:justify-self-end">{action}</div>
      ) : null}
    </div>
  );
}

function EmptyState({
  title = "Análise de modelos indisponível",
  message = "Nenhum lead foi recebido para esta análise. A tela não cria catálogo, versões ou números por conta própria.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
      data-testid="models-dashboard-empty"
    >
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">
        {message}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: ModelVersionStatus }) {
  const copy = {
    IDENTIFIED: "Versão identificada",
    MISSING: "Versão não informada",
    INVALID: "Valor não é versão",
  }[status];
  const tone = {
    IDENTIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    MISSING: "border-amber-200 bg-amber-50 text-amber-700",
    INVALID: "border-red-200 bg-red-50 text-red-700",
  }[status];
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${tone}`}
    >
      {copy}
    </span>
  );
}

function displayVersionLabel(item: ModelVersionCount) {
  if (item.status === "MISSING") return "Não informada";
  if (item.status === "INVALID") return "Não informada";
  return item.label || "Versão identificada";
}

function sumDetails(
  details: ModelDetail[],
  model: string
): ModelDetail | undefined {
  if (details.length === 0) return undefined;
  const addCounts = (rows: V2Count[]) => {
    const byLabel = new Map<string, number>();
    for (const row of rows) {
      byLabel.set(
        row.label,
        (byLabel.get(row.label) ?? 0) + safeCount(row.count)
      );
    }
    return Array.from(byLabel, ([label, count]) => ({ label, count }));
  };
  const versions = new Map<string, ModelVersionCount>();
  for (const detail of details) {
    for (const item of detail.versions) {
      const key = `${item.status}\u0000${item.status === "MISSING" ? "Não informada" : item.label}`;
      const current = versions.get(key);
      versions.set(key, {
        label: item.label,
        count: (current?.count ?? 0) + safeCount(item.count),
        status: item.status,
      });
    }
  }
  return {
    model,
    leads: details.reduce(
      (total, detail) => total + safeCount(detail.leads),
      0
    ),
    sharePercent: null,
    versionsIdentified: details.reduce(
      (total, detail) => total + safeCount(detail.versionsIdentified),
      0
    ),
    versionsMissing: details.reduce(
      (total, detail) => total + safeCount(detail.versionsMissing),
      0
    ),
    versionsInvalid: details.reduce(
      (total, detail) => total + safeCount(detail.versionsInvalid),
      0
    ),
    versions: Array.from(versions.values()),
    channels: addCounts(details.flatMap(detail => detail.channels)),
    states: addCounts(details.flatMap(detail => detail.states)),
    dealers: addCounts(details.flatMap(detail => detail.dealers)),
  };
}

function DistributionBars({ items }: { items: DistributionItem[] }) {
  return (
    <div className="space-y-4 px-5 py-5" data-testid="models-distribution">
      {items.map((item, index) => {
        const width =
          item.percent == null ? 0 : Math.min(100, Math.max(0, item.percent));
        return (
          <div key={item.label} className="min-w-0">
            <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-semibold text-slate-700">
                {item.label}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {numberFormat(item.count)} · {percentFormat(item.percent)}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${width}%`,
                  backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DistributionTable({
  title,
  rows,
  emptyLabel = "Sem registros informados.",
}: {
  title: string;
  rows: V2Count[];
  emptyLabel?: string;
}) {
  const sortedRows = [...rows].sort(
    (a, b) => safeCount(b.count) - safeCount(a.count)
  );
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h4 className="text-xs font-bold text-slate-700">{title}</h4>
      </div>
      <div className="max-h-64 overflow-auto" tabIndex={0}>
        <table className="w-full min-w-[240px] text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">Nome</th>
              <th className="px-3 py-2 text-right font-bold">Leads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.length > 0 ? (
              sortedRows.map(row => (
                <tr key={row.label} className="bg-white">
                  <td
                    className="max-w-[220px] truncate px-3 py-2.5 text-slate-700"
                    title={row.label}
                  >
                    {row.label || "Não informado"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                    {numberFormat(row.count)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={2}
                  className="px-3 py-5 text-center text-slate-400"
                >
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VersionDistribution({ detail }: { detail?: ModelDetail }) {
  const rows = detail?.versions ?? [];
  const sortedRows = [...rows].sort(
    (a, b) => safeCount(b.count) - safeCount(a.count)
  );
  return (
    <Card>
      <CardHeading
        eyebrow="Qualidade da versão"
        title="Distribuição de versões"
        description="Somente valores marcados como IDENTIFIED são tratados como versão. Ausências e contaminações permanecem explícitas."
      />
      <div
        className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3"
        aria-label="Legenda de status da versão"
      >
        <StatusBadge status="IDENTIFIED" />
        <StatusBadge status="MISSING" />
        <StatusBadge status="INVALID" />
      </div>
      <div className="max-h-80 overflow-auto" tabIndex={0}>
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-bold">Valor recebido</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-5 py-2.5 text-right font-bold">Leads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.length > 0 ? (
              sortedRows.map((row, index) => (
                <tr key={`${row.status}-${row.label}-${index}`}>
                  <td
                    className="max-w-[280px] truncate px-5 py-3 font-medium text-slate-700"
                    title={displayVersionLabel(row)}
                  >
                    {displayVersionLabel(row)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-800">
                    {numberFormat(row.count)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-5 py-8 text-center text-slate-400"
                >
                  Nenhum registro de versão foi informado para esta seleção.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function VersionMatrix({
  details,
  total,
}: {
  details: ModelDetail[];
  total: number;
}) {
  const versionColumns = useMemo(() => {
    const columns = new Map<
      string,
      { label: string; status: ModelVersionStatus }
    >();
    for (const detail of details) {
      for (const row of detail.versions) {
        const label =
          row.status === "MISSING"
            ? "Não informada"
            : row.status === "INVALID"
              ? "Valor não é versão"
              : row.label;
        const key = `${row.status}-${label}`;
        if (!columns.has(key)) columns.set(key, { label, status: row.status });
      }
    }
    return Array.from(columns.values());
  }, [details]);

  const rows = details.map(detail => ({
    detail,
    values: versionColumns.map(column =>
      detail.versions
        .filter(row => {
          const label =
            row.status === "MISSING"
              ? "Não informada"
              : row.status === "INVALID"
                ? "Valor não é versão"
                : row.label;
          return row.status === column.status && label === column.label;
        })
        .reduce((sum, row) => sum + safeCount(row.count), 0)
    ),
  }));

  return (
    <Card>
      <CardHeading
        eyebrow="Conciliação"
        title="Matriz modelo × versão"
        description="As colunas são criadas somente a partir dos valores recebidos na análise; não há versão padrão atribuída a nenhum lead."
      />
      <div className="overflow-auto" tabIndex={0}>
        <table
          className="w-full min-w-[720px] text-left text-xs"
          data-testid="models-version-matrix"
        >
          <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="sticky left-0 z-[2] min-w-[150px] bg-slate-50 px-5 py-3 font-bold">
                Modelo
              </th>
              {versionColumns.map(column => (
                <th
                  key={`${column.status}-${column.label}`}
                  className="min-w-[122px] px-3 py-3 font-bold"
                >
                  <span className="block normal-case tracking-normal text-slate-700">
                    {column.label}
                  </span>
                  <span className="mt-1 block normal-case tracking-normal font-medium text-slate-400">
                    {column.status === "IDENTIFIED"
                      ? "identificada"
                      : column.status === "MISSING"
                        ? "não informada"
                        : "valor não é versão"}
                  </span>
                </th>
              ))}
              <th className="min-w-[90px] px-5 py-3 text-right font-bold">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ detail, values }) => (
              <tr key={detail.model}>
                <th className="sticky left-0 z-[1] bg-white px-5 py-3 text-left font-semibold text-slate-700">
                  {detail.model}
                </th>
                {values.map((value, index) => (
                  <td
                    key={`${detail.model}-${versionColumns[index].status}-${versionColumns[index].label}`}
                    className="px-3 py-3 tabular-nums text-slate-700"
                  >
                    {value ? numberFormat(value) : "—"}
                  </td>
                ))}
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-800">
                  {numberFormat(detail.leads)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <th className="sticky left-0 z-[1] bg-slate-50 px-5 py-3 text-left text-slate-700">
                Total informado
              </th>
              {versionColumns.map(column => (
                <td
                  key={`total-${column.status}-${column.label}`}
                  className="px-3 py-3 tabular-nums text-slate-700"
                >
                  {numberFormat(
                    details.reduce(
                      (sum, detail) =>
                        sum +
                        detail.versions
                          .filter(row => {
                            const label =
                              row.status === "MISSING"
                                ? "Não informada"
                                : row.status === "INVALID"
                                  ? "Valor não é versão"
                                  : row.label;
                            return (
                              row.status === column.status &&
                              label === column.label
                            );
                          })
                          .reduce(
                            (subtotal, row) => subtotal + safeCount(row.count),
                            0
                          ),
                      0
                    )
                  )}
                </td>
              ))}
              <td className="px-5 py-3 text-right tabular-nums text-slate-800">
                {numberFormat(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {versionColumns.length === 0 ? (
        <p className="px-5 py-5 text-xs text-slate-400">
          Nenhuma versão foi informada nos registros desta análise.
        </p>
      ) : null}
    </Card>
  );
}

function Diagnostics({
  diagnostics,
}: {
  diagnostics: ModelSourceDiagnostic[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const rows = diagnostics.filter(row => {
    if (!normalizedQuery) return true;
    return [
      row.originalModel,
      row.originalVersion,
      row.model,
      row.version,
      row.reason,
      row.versionStatus,
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedQuery);
  });

  return (
    <details
      className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
      data-testid="models-diagnostics"
    >
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-slate-800 marker:hidden">
        <span className="mr-2 text-[#e2212d]">+</span> Diagnósticos técnicos de
        origem
        <span className="ml-2 text-xs font-normal text-slate-500">
          ({numberFormat(diagnostics.length)} registros)
        </span>
      </summary>
      <div className="border-t border-slate-100 px-5 py-4">
        <label className="v2-label" htmlFor="models-diagnostics-search">
          Buscar diagnóstico
        </label>
        <input
          id="models-diagnostics-search"
          className="v2-input max-w-md"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Modelo, versão ou motivo"
        />
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Apenas modelo, versão, motivo e contagem são exibidos. Nenhum contato
          é incluído.
        </p>
        <div className="mt-4 max-h-80 overflow-auto" tabIndex={0}>
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">Modelo original</th>
                <th className="px-3 py-2.5 font-bold">Versão original</th>
                <th className="px-3 py-2.5 font-bold">Modelo conciliado</th>
                <th className="px-3 py-2.5 font-bold">Versão</th>
                <th className="px-3 py-2.5 font-bold">Motivo</th>
                <th className="px-3 py-2.5 text-right font-bold">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length > 0 ? (
                rows.map((row, index) => (
                  <tr
                    key={`${row.originalModel}-${row.originalVersion}-${index}`}
                  >
                    <td
                      className="max-w-[160px] truncate px-3 py-2.5 text-slate-700"
                      title={row.originalModel}
                    >
                      {row.originalModel || "Não informado"}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2.5 text-slate-700"
                      title={row.originalVersion}
                    >
                      {row.originalVersion || "Não informada"}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2.5 text-slate-700"
                      title={row.model}
                    >
                      {row.model || "Não identificado"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {row.version || "Não informada"}
                    </td>
                    <td
                      className="max-w-[260px] truncate px-3 py-2.5 text-slate-700"
                      title={row.reason}
                    >
                      {row.reason || "Não informado"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                      {numberFormat(row.count)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    Nenhum diagnóstico encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export default function V2ModelsDashboard({
  analysis,
  canManage = false,
}: V2ModelsDashboardProps) {
  const [selectedModel, setSelectedModel] = useState(ALL_MODELS_LABEL);
  const hasLeads = Boolean(analysis && safeCount(analysis.total) > 0);

  const details = useMemo(() => analysis?.models ?? [], [analysis]);
  const detailByModel = useMemo(
    () => new Map(details.map(detail => [detail.model, detail])),
    [details]
  );
  const unknownDetails = useMemo(
    () =>
      details.filter(
        detail =>
          !OFFICIAL_MODELS.includes(
            detail.model as (typeof OFFICIAL_MODELS)[number]
          )
      ),
    [details]
  );
  const allDetail = useMemo(
    () => sumDetails(details, ALL_MODELS_LABEL),
    [details]
  );
  const selectedDetail = useMemo(() => {
    if (selectedModel === ALL_MODELS_LABEL) return allDetail;
    if (selectedModel === UNIDENTIFIED_LABEL)
      return sumDetails(unknownDetails, UNIDENTIFIED_LABEL);
    return detailByModel.get(selectedModel);
  }, [allDetail, detailByModel, selectedModel, unknownDetails]);

  const distribution = useMemo<DistributionItem[]>(() => {
    const total = safeCount(analysis?.total);
    const official = OFFICIAL_MODELS.map(label => {
      const detail = detailByModel.get(label);
      const count = safeCount(detail?.leads);
      return { label, count, percent: percentFromCount(count, total), detail };
    });
    const unidentifiedCount = safeCount(analysis?.unclassified);
    return [
      ...official,
      {
        label: UNIDENTIFIED_LABEL,
        count: unidentifiedCount,
        percent: percentFromCount(unidentifiedCount, total),
        detail: sumDetails(unknownDetails, UNIDENTIFIED_LABEL),
        isUnidentified: true,
      },
    ];
  }, [analysis, detailByModel, unknownDetails]);

  useEffect(() => {
    const available = new Set([
      ALL_MODELS_LABEL,
      ...distribution.map(item => item.label),
    ]);
    setSelectedModel(current =>
      available.has(current) ? current : ALL_MODELS_LABEL
    );
  }, [distribution]);

  if (!hasLeads) return <EmptyState />;

  const total = safeCount(analysis?.total);
  const pending =
    safeCount(analysis?.unclassified) +
    safeCount(analysis?.versionsMissing) +
    safeCount(analysis?.versionsInvalid);
  const matrixDetails = distribution
    .filter(item => item.count > 0 && item.detail)
    .map(item => item.detail as ModelDetail);
  const modelCount = analysis?.classified ?? 0;
  const selectedHasDetail = Boolean(selectedDetail);

  return (
    <section
      className="min-w-0 space-y-5"
      data-testid="models-dashboard"
      aria-label="Detalhamento de modelos e versões"
    >
      <header className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e2212d]">
          Leads · Modelos
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-[-0.03em] text-slate-950 sm:text-2xl">
              Modelos e versões
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">
              Conciliação da base real recebida, sem atribuir uma versão quando
              ela não foi informada ou não é uma versão.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            {numberFormat(total)} leads analisados
          </span>
        </div>
      </header>

      <section
        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumo da análise de modelos"
      >
        <SummaryCard
          label="Total de leads"
          value={numberFormat(total)}
          hint="Base recebida para esta análise"
          testId="models-summary-total"
        />
        <SummaryCard
          label="Leads com modelo identificado"
          value={numberFormat(modelCount)}
          hint={`${percentFormat(analysis?.coveragePercent ?? null)} de cobertura; ${numberFormat(analysis?.unclassified ?? 0)} não identificado`}
          testId="models-summary-classified"
        />
        <SummaryCard
          label="Leads com versão informada"
          value={numberFormat(analysis?.versionsIdentified ?? 0)}
          hint={`${numberFormat(analysis?.versionsMissing ?? 0)} não informadas · ${numberFormat(analysis?.versionsInvalid ?? 0)} inválidas`}
          testId="models-summary-versions"
        />
        <SummaryCard
          label="Pendências de campos"
          value={numberFormat(pending)}
          hint="Modelo ou versão; um Lead pode ter pendência nos dois campos"
          testId="models-summary-pending"
          tone="warning"
        />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeading
            eyebrow="Distribuição da base"
            title="Modelos conciliados"
            description="A categoria Não identificado mantém leads que não puderam ser conciliados; nenhum registro é descartado."
          />
          <DistributionBars items={distribution} />
        </Card>
        <Card>
          <CardHeading
            eyebrow="Detalhamento local"
            title="Escolha um modelo"
            description="Este seletor afeta apenas os detalhes desta tela; não altera os filtros globais do painel."
            action={
              <label className="block min-w-0 sm:w-52">
                <span className="sr-only">Modelo para detalhar</span>
                <select
                  className="v2-input"
                  value={selectedModel}
                  onChange={event => setSelectedModel(event.target.value)}
                  data-testid="models-local-filter"
                >
                  <option value={ALL_MODELS_LABEL}>{ALL_MODELS_LABEL}</option>
                  {distribution.map(item => (
                    <option key={item.label} value={item.label}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
          <div className="grid grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-4">
            <MiniMetric
              label="Leads"
              value={numberFormat(
                selectedDetail?.leads ??
                  (selectedModel === UNIDENTIFIED_LABEL
                    ? (analysis?.unclassified ?? 0)
                    : 0)
              )}
            />
            <MiniMetric
              label="Participação"
              value={percentFormat(
                selectedDetail?.sharePercent ??
                  (selectedModel === ALL_MODELS_LABEL
                    ? 100
                    : percentFromCount(
                        distribution.find(item => item.label === selectedModel)
                          ?.count ?? 0,
                        total
                      ))
              )}
            />
            <MiniMetric
              label="Leads com versão"
              value={numberFormat(selectedDetail?.versionsIdentified ?? 0)}
            />
            <MiniMetric
              label="Pendências"
              value={numberFormat(
                (selectedDetail?.versionsMissing ?? 0) +
                  (selectedDetail?.versionsInvalid ?? 0)
              )}
            />
          </div>
          {!selectedHasDetail && selectedModel === UNIDENTIFIED_LABEL ? (
            <p className="border-t border-slate-100 px-5 py-5 text-xs leading-5 text-slate-500">
              Há leads não identificados, mas a fonte não forneceu campos
              agregados de canal, estado, dealer ou versão para este grupo.
            </p>
          ) : null}
        </Card>
      </section>

      <VersionDistribution detail={selectedDetail} />

      <section
        className="grid min-w-0 gap-5 xl:grid-cols-3"
        data-testid="models-secondary-distributions"
      >
        <DistributionTable
          title="Canais"
          rows={selectedDetail?.channels ?? []}
        />
        <DistributionTable
          title="Estados"
          rows={selectedDetail?.states ?? []}
        />
        <DistributionTable
          title="Dealers"
          rows={selectedDetail?.dealers ?? []}
        />
      </section>

      <VersionMatrix
        details={matrixDetails.length > 0 ? matrixDetails : details}
        total={total}
      />

      {canManage ? (
        <Diagnostics diagnostics={analysis?.diagnostics ?? []} />
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  testId,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  testId: string;
  tone?: "default" | "warning";
}) {
  return (
    <article
      className={`min-w-0 rounded-2xl border bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${tone === "warning" ? "border-amber-200" : "border-slate-200/80"}`}
      data-testid={testId}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold tracking-[-0.04em] ${tone === "warning" ? "text-amber-700" : "text-slate-950"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-800">
        {value}
      </p>
    </div>
  );
}

export type { V2ModelsDashboardProps };
