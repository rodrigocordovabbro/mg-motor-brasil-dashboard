import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Check,
  CircleDollarSign,
  Edit3,
  FileSpreadsheet,
  Layers3,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  Target,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import type { MediaPlanStatus } from "@shared/v2MediaPlan";
import {
  applyMediaPlanProjectionOverrides,
  type MediaPlanProjectionPatch,
  type MediaPlanProjectionValues,
  type MediaPlanWithProjectionOverrides,
} from "@shared/v2MediaPlanProjections";

type ProjectionEditorTarget =
  | { scope: "global" }
  | { scope: "product"; key: string; label: string }
  | { scope: "row"; key: string; label: string; product: string };

function formatCurrency(
  value: number,
  locale: "pt-BR" | "en-US",
  fractionDigits = 0
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatNumber(value: number, locale: "pt-BR" | "en-US") {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatPercent(value: number, locale: "pt-BR" | "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}

function targetValue(
  target: ProjectionEditorTarget,
  plan: MediaPlanWithProjectionOverrides
): number | null {
  if (target.scope === "global") return plan.total.leads ?? null;
  if (target.scope === "product")
    return (
      plan.totals.find(total => total.product === target.key)?.leads ?? null
    );
  return plan.rows.find(row => row.id === target.key)?.leads ?? null;
}

function targetLabel(
  target: ProjectionEditorTarget,
  isEnglish: boolean
): string {
  if (target.scope === "global")
    return isEnglish ? "Monthly total" : "Total mensal";
  if (target.scope === "product")
    return `${isEnglish ? "Product" : "Produto"}: ${target.label}`;
  return `${isEnglish ? "Channel row" : "Linha do canal"}: ${target.label}`;
}

function statusLabel(
  status: MediaPlanStatus | undefined,
  locale: "pt-BR" | "en-US"
) {
  const labels = {
    pt: { PAID: "Pago", PAYABLES: "A pagar", NOT_INFORMED: "Não informado" },
    en: { PAID: "Paid", PAYABLES: "Payables", NOT_INFORMED: "Not informed" },
  };
  const key = status ?? "NOT_INFORMED";
  return locale === "en-US" ? labels.en[key] : labels.pt[key];
}

export function MediaChannelTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const label = String(payload?.value ?? "");
  const lines = label.split(/\s+/).reduce<string[]>((result, word) => {
    const last = result[result.length - 1];
    if (last && `${last} ${word}`.length <= 18)
      result[result.length - 1] = `${last} ${word}`;
    else result.push(word);
    return result;
  }, []);
  return (
    <text x={x - 10} y={y} textAnchor="end" fill="#475569" fontSize={12}>
      <title>{label}</title>
      {lines.map((line, index) => (
        <tspan
          key={index}
          x={x - 10}
          dy={index === 0 ? 4 - ((lines.length - 1) * 14) / 2 : 14}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function MediaPlanEmptyState({
  locale = "pt-BR",
}: {
  locale?: "pt-BR" | "en-US";
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <CalendarRange className="mx-auto mb-4 h-8 w-8 text-[#e2212d]" />
      <h2 className="text-lg font-semibold text-slate-900">
        {locale === "en-US"
          ? "No media plan for this month"
          : "Nenhum plano disponível para este mês"}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        {locale === "en-US"
          ? "Select another month to view the approved plan."
          : "Selecione outra competência para consultar o planejamento aprovado."}
      </p>
    </div>
  );
}

export function MediaPlanDashboard({
  locale = "pt-BR",
  onUpdatedAt,
  initialMonth,
}: {
  locale?: "pt-BR" | "en-US";
  onUpdatedAt?: (updatedAt: string) => void;
  initialMonth?: string;
}) {
  const plansQuery = trpc.mediaPlan.plans.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const MEDIA_PLANS = (plansQuery.data ??
    []) as MediaPlanWithProjectionOverrides[];
  const authQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const owner =
    authQuery.data?.role === "admin" &&
    authQuery.data.username.trim().toLowerCase() === "rodrigo";
  const [selectedMonth, setSelectedMonth] = useState(initialMonth ?? "");
  const sourcePlan = MEDIA_PLANS.find(item => item.month === selectedMonth);
  const projectionsQuery = trpc.mediaPlan.projections.useQuery(
    { monthId: selectedMonth },
    {
      enabled: owner && Boolean(selectedMonth),
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
    }
  );
  const updateProjections = trpc.mediaPlan.updateProjections.useMutation();
  const utils = trpc.useUtils();
  const projectionRead =
    projectionsQuery.data?.monthId === selectedMonth
      ? projectionsQuery.data
      : sourcePlan?.projectionOverrides;
  const plan = useMemo(() => {
    if (!sourcePlan) return undefined;
    return applyMediaPlanProjectionOverrides(
      sourcePlan,
      projectionRead ?? { version: 0, values: { products: {}, rows: {} } }
    );
  }, [projectionRead, sourcePlan]);
  const [editorTarget, setEditorTarget] =
    useState<ProjectionEditorTarget | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!selectedMonth && MEDIA_PLANS[0])
      setSelectedMonth(MEDIA_PLANS[0].month);
  }, [selectedMonth, MEDIA_PLANS]);
  const isEnglish = locale === "en-US";

  useEffect(() => {
    setEditorTarget(null);
    setEditorDraft("");
    setEditorError(null);
  }, [selectedMonth]);

  useEffect(() => {
    if (plan?.updatedAt) onUpdatedAt?.(plan.updatedAt);
  }, [onUpdatedAt, plan?.updatedAt]);

  const openProjectionEditor = (target: ProjectionEditorTarget) => {
    if (!owner || !plan) return;
    setEditorTarget(target);
    const current = targetValue(target, plan);
    setEditorDraft(current == null ? "" : String(current));
    setEditorError(null);
    setSavedNotice(null);
  };

  const saveProjection = async (value: number | null) => {
    if (!owner || !plan || !editorTarget || saving) return;
    const savedMonth = selectedMonth;
    const expectedVersion = projectionRead?.version ?? 0;
    const values: MediaPlanProjectionPatch = {};
    if (editorTarget.scope === "global") values.globalLeads = value;
    else if (editorTarget.scope === "product")
      values.products = { [editorTarget.key]: value };
    else values.rows = { [editorTarget.key]: value };
    setSaving(true);
    setEditorError(null);
    try {
      await updateProjections.mutateAsync({
        monthId: savedMonth,
        expectedVersion,
        values,
      });
      await Promise.all([
        utils.mediaPlan.plans.invalidate(),
        utils.mediaPlan.projections.invalidate({ monthId: savedMonth }),
      ]);
      setEditorTarget(null);
      setEditorDraft("");
      setSavedNotice(
        isEnglish
          ? `Projection saved for ${savedMonth}.`
          : `Projeção salva para ${savedMonth.split("-").reverse().join("/")}.`
      );
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : isEnglish
            ? "Could not save the projection. Refresh and try again."
            : "Não foi possível salvar a projeção. Atualize e tente novamente.";
      setEditorError(message);
    } finally {
      setSaving(false);
    }
  };

  const submitProjection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editorTarget) return;
    if (!/^\d+$/.test(editorDraft.trim())) {
      setEditorError(
        isEnglish
          ? "Enter an integer from 0 to 10,000,000."
          : "Informe um número inteiro entre 0 e 10.000.000."
      );
      return;
    }
    const value = Number(editorDraft.trim());
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) {
      setEditorError(
        isEnglish
          ? "Enter an integer from 0 to 10,000,000."
          : "Informe um número inteiro entre 0 e 10.000.000."
      );
      return;
    }
    await saveProjection(value);
  };

  const channelData = useMemo(() => {
    if (!plan) return [];
    const grouped = new Map<string, { channel: string; investment: number }>();
    plan.rows.forEach(row => {
      const current = grouped.get(row.channel) ?? {
        channel: row.channel,
        investment: 0,
      };
      current.investment += row.investment;
      grouped.set(row.channel, current);
    });
    return Array.from(grouped.values()).sort(
      (a, b) => b.investment - a.investment
    );
  }, [plan]);

  if (plansQuery.isLoading)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Carregando plano aprovado…
      </div>
    );
  if (plansQuery.error)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-white p-8 text-sm text-red-700"
      >
        Plano indisponível. Confira sua sessão e tente novamente.
      </div>
    );
  if (!plan) {
    return (
      <div className="w-full min-w-0">
        <MediaPlanEmptyState locale={locale} />
      </div>
    );
  }

  const copy = isEnglish
    ? {
        eyebrow: "Official monthly planning",
        financialDescription:
          "Official gross and net allocation by channel, with projected Leads and CPL calculated from each month's approved sources.",
        month: "Plan month",
        totalInvestment: "Planned media investment",
        leads: "Projected leads",
        cpl: "Projected CPL",
        impressions: "Projected impressions",
        gross: "Plan gross",
        commission: "4% commission",
        net: "Net media plan",
        actual: "Actual investment",
        allocation: "Investment allocation by channel",
        grossAllocation: "Gross allocation by channel",
        allocationDesc: "Planned investment consolidated across products.",
        product: "Plan by product",
        funnel: "Allocation by funnel stage",
        reconciliation: "Financial reconciliation",
        details: "Detailed media plan",
        channel: "Channel",
        publisher: "Publisher",
        productColumn: "Product",
        objective: "Objective",
        investment: "Investment",
        visits: "Visits",
        status: "Status",
        unavailable: "Not reported in the source",
      }
    : {
        eyebrow: "Planejamento mensal oficial",
        financialDescription:
          "Alocação oficial bruta e líquida por canal, com Leads e CPL projetados calculados conforme as fontes aprovadas de cada mês.",
        month: "Competência do plano",
        totalInvestment: "Investimento planejado de mídia",
        leads: "Leads projetados",
        cpl: "CPL projetado",
        impressions: "Impressões projetadas",
        gross: "Plano bruto",
        commission: "Comissão de 4%",
        net: "Plano líquido de mídia",
        actual: "Investimento realizado",
        allocation: "Alocação de investimento por canal",
        grossAllocation: "Alocação bruta por canal",
        allocationDesc: "Investimento planejado consolidado entre os produtos.",
        product: "Plano por produto",
        funnel: "Alocação por etapa do funil",
        reconciliation: "Conciliação financeira",
        details: "Plano de mídia detalhado",
        channel: "Canal",
        publisher: "Publisher",
        productColumn: "Produto",
        objective: "Objetivo",
        investment: "Investimento",
        visits: "Visitas",
        status: "Status",
        unavailable: "Não informado na fonte",
      };

  const unavailableValue = isEnglish ? "N/A" : "N/D";
  const projectedCpl =
    plan.total.netInvestment != null &&
    plan.total.leads != null &&
    plan.total.leads > 0
      ? plan.total.netInvestment / plan.total.leads
      : plan.total.cpl;
  const kpis = [
    {
      id: "gross",
      label: copy.gross,
      value: formatCurrency(plan.total.investment, locale),
      icon: WalletCards,
    },
    {
      id: "net",
      label: copy.net,
      value:
        plan.total.netInvestment == null
          ? unavailableValue
          : formatCurrency(plan.total.netInvestment, locale),
      icon: CircleDollarSign,
    },
    {
      id: "leads",
      label: copy.leads,
      value:
        plan.total.leads == null
          ? unavailableValue
          : formatNumber(plan.total.leads, locale),
      icon: Target,
    },
    {
      id: "cpl",
      label: copy.cpl,
      value:
        projectedCpl == null
          ? unavailableValue
          : formatCurrency(projectedCpl, locale, 2),
      icon: MousePointerClick,
    },
  ];

  const financialReconciliation = [
    { label: copy.gross, value: plan.total.investment },
    { label: copy.commission, value: plan.total.commission },
    { label: copy.net, value: plan.total.netInvestment },
    { label: copy.actual, value: plan.total.actualInvestment },
  ];
  const editorValues: MediaPlanProjectionValues = projectionRead?.values ?? {
    products: {},
    rows: {},
  };
  const editorHasOverride = editorTarget
    ? editorTarget.scope === "global"
      ? editorValues.globalLeads !== undefined
      : editorTarget.scope === "product"
        ? Object.prototype.hasOwnProperty.call(
            editorValues.products,
            editorTarget.key
          )
        : Object.prototype.hasOwnProperty.call(
            editorValues.rows,
            editorTarget.key
          )
    : false;

  return (
    <div
      data-testid="media-plan-dashboard"
      className="w-full min-w-0 space-y-5 pb-6 text-sm"
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#b41b26]">
              <FileSpreadsheet className="h-4 w-4" />
              {copy.eyebrow}
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-[28px]">
              {isEnglish ? plan.titleEn : plan.titlePt}
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              {copy.financialDescription}
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-[280px]">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
              {copy.month}
              <select
                value={selectedMonth}
                onChange={event => setSelectedMonth(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-[#e2212d]/60 focus:ring-2 focus:ring-red-100"
              >
                {MEDIA_PLANS.map(item => (
                  <option key={item.month} value={item.month}>
                    {new Intl.DateTimeFormat(locale, {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${item.month}-01T12:00:00Z`))}
                  </option>
                ))}
              </select>
            </label>
            {owner ? (
              <button
                type="button"
                onClick={() => openProjectionEditor({ scope: "global" })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#e2212d] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#c91c28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                {isEnglish ? "Edit projections" : "Editar projeções"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ id, label, value, icon: Icon }) => (
            <div
              key={id}
              data-testid={`media-plan-kpi-${id}`}
              className="min-w-0 rounded-xl border border-slate-200/70 bg-slate-50 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold leading-5 text-slate-600">
                  {label}
                </span>
                <Icon className="h-5 w-5 shrink-0 text-[#e2212d]" />
              </div>
              <div className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-slate-900 tabular-nums 2xl:text-[32px]">
                {value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] leading-5 text-slate-600">
          {plan.total.impressions != null && (
            <span>
              {copy.impressions}:{" "}
              <strong className="text-slate-800">
                {formatNumber(plan.total.impressions, locale)}
              </strong>
            </span>
          )}
          {plan.contextItems?.length ? (
            plan.contextItems.map(item => (
              <span key={item.id}>
                {isEnglish ? item.labelEn : item.labelPt}:{" "}
                <strong className="text-slate-800">
                  {formatCurrency(item.value, locale)}
                </strong>
                {item.notePt ? (
                  <em className="ml-1 not-italic text-slate-600">
                    · {isEnglish ? item.noteEn : item.notePt}
                  </em>
                ) : null}
              </span>
            ))
          ) : (
            <>
              <span>
                {isEnglish ? "Line-up gross budget" : "Verba bruta Line-up"}:{" "}
                <strong className="text-slate-800">
                  {formatCurrency(plan.totals[0]?.investment ?? 0, locale)}
                </strong>
              </span>
              <span>
                {isEnglish
                  ? "Dedicated MG4 Urban gross budget"
                  : "Verba bruta dedicada MG4 Urban"}
                :{" "}
                <strong className="text-slate-800">
                  {formatCurrency(plan.totals[1]?.investment ?? 0, locale)}
                </strong>
              </span>
            </>
          )}
        </div>
        {plan.projectionOverrides?.globalManual ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] leading-5 text-amber-800">
            {isEnglish
              ? "Total manual; detailed projections remain unchanged."
              : "Total manual; projeções detalhadas mantidas."}
          </p>
        ) : null}
        {savedNotice ? (
          <p
            role="status"
            className="mt-3 text-sm font-semibold text-emerald-700"
          >
            {savedNotice}
          </p>
        ) : null}
      </section>

      <section
        data-testid="media-plan-allocation"
        className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      >
        <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {copy.grossAllocation}
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {copy.allocationDesc}
              </p>
            </div>
            <BarChart3 className="h-5 w-5 text-[#e2212d]" />
          </div>
          <div
            className="mt-5 w-full flex-1"
            style={{
              minHeight: Math.max(300, channelData.length * 40 + 32),
              height: Math.max(300, channelData.length * 40 + 32),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={channelData}
                layout="vertical"
                accessibilityLayer
                margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
              >
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={value =>
                    `${Math.round(Number(value) / 1000)}k`
                  }
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  minTickGap={30}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="channel"
                  width={144}
                  tick={<MediaChannelTick />}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.05)" }}
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid rgba(148,163,184,.16)",
                    borderRadius: 12,
                    color: "#0f172a",
                    fontSize: 14,
                  }}
                  formatter={(value: number) =>
                    formatCurrency(Number(value), locale)
                  }
                />
                <Bar
                  dataKey="investment"
                  fill="#e2212d"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {copy.product}
            </h2>
            <Layers3 className="h-5 w-5 text-[#e2212d]" />
          </div>
          <div className="mt-5 space-y-4">
            {plan.totals.map(total => (
              <article
                key={total.label}
                className="rounded-xl border border-slate-200/70 bg-slate-50 p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="min-w-0 text-sm leading-5 text-slate-900">
                    {total.label}
                  </strong>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold text-[#b41b26] tabular-nums">
                      {formatPercent(
                        total.investment / plan.total.investment,
                        locale
                      )}
                    </span>
                    {owner && total.product ? (
                      <button
                        type="button"
                        onClick={() =>
                          openProjectionEditor({
                            scope: "product",
                            key: total.product as string,
                            label: total.label,
                          })
                        }
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-100 bg-white px-2 py-1 text-xs font-bold text-[#e2212d] hover:bg-red-50"
                      >
                        <Edit3 className="h-3 w-3" />
                        {isEnglish ? "Edit" : "Editar"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm tabular-nums">
                  <div>
                    <span className="block text-xs leading-5 text-slate-600">
                      {copy.gross}
                    </span>
                    <strong className="mt-1 block text-slate-800">
                      {formatCurrency(total.investment, locale)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-xs leading-5 text-slate-600">
                      {copy.commission}
                    </span>
                    <strong className="mt-1 block text-slate-800">
                      {total.commission == null
                        ? unavailableValue
                        : formatCurrency(total.commission, locale)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-xs leading-5 text-slate-600">
                      {copy.net}
                    </span>
                    <strong className="mt-1 block text-slate-800">
                      {total.netInvestment == null
                        ? unavailableValue
                        : formatCurrency(total.netInvestment, locale)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-xs leading-5 text-slate-600">
                      {copy.actual}
                    </span>
                    <strong className="mt-1 block text-slate-800">
                      {total.actualInvestment == null
                        ? unavailableValue
                        : formatCurrency(total.actualInvestment, locale)}
                    </strong>
                  </div>
                </div>
                {(total.leads != null ||
                  total.cpl != null ||
                  (owner && total.product)) && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-3 text-[13px] leading-5 text-slate-600 tabular-nums">
                    {(total.leads != null || (owner && total.product)) && (
                      <span>
                        {copy.leads}:{" "}
                        {owner && total.product ? (
                          <button
                            type="button"
                            onClick={() =>
                              openProjectionEditor({
                                scope: "product",
                                key: total.product as string,
                                label: total.label,
                              })
                            }
                            className="font-bold text-slate-800 underline decoration-red-200 underline-offset-2"
                          >
                            {total.leads == null
                              ? unavailableValue
                              : formatNumber(total.leads, locale)}
                          </button>
                        ) : (
                          <strong className="text-slate-800">
                            {formatNumber(total.leads as number, locale)}
                          </strong>
                        )}
                      </span>
                    )}
                    {total.cpl != null && (
                      <span>
                        CPL:{" "}
                        <strong className="text-slate-800">
                          {formatCurrency(total.cpl, locale, 2)}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        data-testid="media-plan-reconciliation"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {copy.reconciliation}
        </h2>
        <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          {financialReconciliation.map(item => (
            <div key={item.label} className="min-w-0">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-slate-600">
                  {item.label}
                </span>
                <span className="text-lg font-semibold text-slate-900 tabular-nums">
                  {item.value == null
                    ? unavailableValue
                    : formatCurrency(item.value, locale)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#9f1520] to-[#ef3340]"
                  style={{
                    width: `${item.value == null || item.value === 0 ? 0 : Math.max(3, (item.value / plan.total.investment) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {copy.details}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {plan.rows.length}{" "}
              {isEnglish ? "planned placements" : "inserções planejadas"}
            </p>
          </div>
          <CircleDollarSign className="h-5 w-5 text-[#e2212d]" />
        </div>
        <div
          className="mg-media-table-scroll"
          role="region"
          aria-label={copy.details}
          tabIndex={0}
        >
          <table className="min-w-[1380px] w-full text-left tabular-nums">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">{copy.channel}</th>
                <th className="px-4 py-3">{copy.publisher}</th>
                <th className="px-4 py-3">{copy.productColumn}</th>
                <th className="px-4 py-3">{copy.objective}</th>
                <th className="px-4 py-3 text-right">{copy.gross}</th>
                <th className="px-4 py-3 text-right">{copy.commission}</th>
                <th className="px-4 py-3 text-right">{copy.net}</th>
                <th className="px-4 py-3 text-right">{copy.actual}</th>
                <th className="px-4 py-3">{copy.status}</th>
                <th className="px-4 py-3 text-right">{copy.leads}</th>
                <th className="px-4 py-3 text-right">CPL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px] leading-5">
              {plan.rows.map(row => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {row.channel}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.publisher ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.product}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {(isEnglish ? row.objectiveEn : row.objectivePt) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatCurrency(row.investment, locale, 2)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.commission == null
                      ? unavailableValue
                      : formatCurrency(row.commission, locale, 2)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.netInvestment == null
                      ? unavailableValue
                      : formatCurrency(row.netInvestment, locale, 2)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.actualInvestment == null
                      ? unavailableValue
                      : formatCurrency(row.actualInvestment, locale, 2)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {statusLabel(row.status, locale)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {row.leads == null ? (
                      "—"
                    ) : owner ? (
                      <button
                        type="button"
                        onClick={() =>
                          openProjectionEditor({
                            scope: "row",
                            key: row.id,
                            label: `${row.channel} · ${row.product}`,
                            product: row.product,
                          })
                        }
                        className="font-bold underline decoration-red-200 underline-offset-2 hover:text-[#e2212d]"
                      >
                        {formatNumber(row.leads, locale)}
                      </button>
                    ) : (
                      formatNumber(row.leads, locale)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {row.cpl == null ? "—" : formatCurrency(row.cpl, locale, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-[13px] leading-5 text-slate-600">
          {copy.unavailable}: os campos permanecem como N/D ou —, sem
          preenchimento artificial.
        </div>
        <div className="flex items-start gap-2 border-t border-slate-100 px-5 py-4 text-[13px] leading-5 text-slate-600">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{isEnglish ? plan.sourceNoteEn : plan.sourceNotePt}</span>
        </div>
      </section>
      {editorTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !saving)
              setEditorTarget(null);
          }}
        >
          <div
            className="w-[min(460px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-projection-editor-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="media-projection-editor-title"
                  className="text-sm font-bold text-slate-900"
                >
                  {isEnglish
                    ? "Edit media projections"
                    : "Editar projeções de mídia"}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {targetLabel(editorTarget, isEnglish)} · {selectedMonth}
                </p>
              </div>
              <button
                type="button"
                aria-label={isEnglish ? "Close editor" : "Fechar editor"}
                onClick={() => setEditorTarget(null)}
                disabled={saving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={submitProjection}>
              <label className="block">
                <span className="v2-label">
                  {isEnglish ? "Projected Leads" : "Leads projetados"}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10_000_000}
                  step={1}
                  value={editorDraft}
                  disabled={
                    saving ||
                    projectionsQuery.isFetching ||
                    Boolean(projectionsQuery.error)
                  }
                  onChange={event => {
                    setEditorDraft(event.target.value);
                    setEditorError(null);
                  }}
                  className="v2-input w-full"
                  aria-describedby="media-projection-editor-help"
                  autoFocus
                />
              </label>
              <p
                id="media-projection-editor-help"
                className="text-[11px] leading-5 text-slate-500"
              >
                {editorTarget.scope === "global"
                  ? isEnglish
                    ? "Changes only the monthly headline and CPL. Detailed product and row projections stay intact."
                    : "Altera somente o total mensal e o CPL. As projeções detalhadas de produto e linha permanecem intactas."
                  : editorTarget.scope === "product"
                    ? isEnglish
                      ? "Product CPL uses net media budget ÷ Leads. The global total sums product totals unless a manual global total is active."
                      : "O CPL do produto usa verba líquida ÷ Leads. O total global soma os produtos, salvo quando houver total global manual."
                    : isEnglish
                      ? "The product total is recalculated from its projected rows; no budget or actual investment is changed."
                      : "O total do produto é recalculado a partir das linhas projetadas; nenhuma verba ou realização é alterada."}
              </p>
              {projectionsQuery.isFetching ? (
                <p
                  className="flex items-center gap-2 text-xs text-slate-500"
                  role="status"
                >
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  {isEnglish
                    ? "Loading saved override…"
                    : "Carregando override salvo…"}
                </p>
              ) : null}
              {projectionsQuery.error ? (
                <div
                  className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
                  role="alert"
                >
                  {isEnglish
                    ? "Could not read this month's saved projection."
                    : "Não foi possível ler a projeção salva deste mês."}
                  <button
                    type="button"
                    onClick={() => void projectionsQuery.refetch()}
                    className="ml-2 inline-flex items-center gap-1 font-bold underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {isEnglish ? "Retry" : "Tentar novamente"}
                  </button>
                </div>
              ) : null}
              {editorError ? (
                <p role="alert" className="text-xs text-red-700">
                  {editorError}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {editorHasOverride ? (
                  <button
                    type="button"
                    disabled={saving || projectionsQuery.isFetching}
                    onClick={() => void saveProjection(null)}
                    className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-200 px-3 text-xs font-semibold text-amber-700 disabled:opacity-50"
                  >
                    {isEnglish ? "Restore source" : "Restaurar fonte"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditorTarget(null)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  {isEnglish ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    projectionsQuery.isFetching ||
                    Boolean(projectionsQuery.error)
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#e2212d] px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {saving
                    ? isEnglish
                      ? "Saving…"
                      : "Salvando…"
                    : isEnglish
                      ? "Save projection"
                      : "Salvar projeção"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
