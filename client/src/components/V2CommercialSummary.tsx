import type { ReactNode } from "react";
import V2SalesGoalEditor from "./V2SalesGoalEditor";
import type { V2Dashboard } from "@shared/v2Types";

export type V2CommercialSummaryProps = {
  performance: V2Dashboard["dealerPerformance"];
  competence: string;
  canManage: boolean;
  onUpdated: () => void;
  locale?: "pt-BR" | "en";
  /** False when the parent applied a dimension or multi-competence filter. */
  generalComparable?: boolean;
};

type SummaryLocale = "pt-BR" | "en";

type SummaryLabels = {
  leads: string;
  sales: string;
  leadGoal: string;
  leadsDelivered: string;
  salesGoal: string;
  registration: string;
  retail: string;
  conversion: string;
  notAvailable: string;
  sourceUnavailable: string;
  notComparable: string;
  leadsPeriod: string;
  registrationSource: (asOf: string) => string;
  retailSource: (asOf: string) => string;
  retailDefinition: string;
  manualGoal: string;
  importedGoal: string;
  unavailableGoal: string;
  conversionDetail: string;
};

const LABELS: Record<SummaryLocale, SummaryLabels> = {
  "pt-BR": {
    leads: "Leads",
    sales: "Vendas",
    leadGoal: "Meta de Leads",
    leadsDelivered: "Leads entregues",
    salesGoal: "Meta de vendas",
    registration: "Vendas totais (MTD Registration)",
    retail: "Retail",
    conversion: "Conversão",
    notAvailable: "N/D",
    sourceUnavailable: "Fonte comercial indisponível",
    notComparable: "Total global não comparável a este filtro",
    leadsPeriod: "Leads entregues no período selecionado",
    registrationSource: asOf => `MTD Registration · ${asOf}`,
    retailSource: asOf => `Retail · ${asOf}`,
    retailDefinition: "Sem Test Drive e Direct Sales",
    manualGoal: "Meta total manual",
    importedGoal: "Importada de MetaVendas",
    unavailableGoal: "Meta não disponível na fonte",
    conversionDetail:
      "Retail ÷ leads entregues · comparação executiva, não coorte matched",
  },
  en: {
    leads: "Leads",
    sales: "Sales",
    leadGoal: "Lead goal",
    leadsDelivered: "Leads delivered",
    salesGoal: "Sales goal",
    registration: "Total sales (MTD Registration)",
    retail: "Retail",
    conversion: "Conversion",
    notAvailable: "N/A",
    sourceUnavailable: "Commercial source unavailable",
    notComparable: "Global total is not comparable to this filter",
    leadsPeriod: "Leads delivered in the selected period",
    registrationSource: asOf => `MTD Registration · ${asOf}`,
    retailSource: asOf => `Retail · ${asOf}`,
    retailDefinition: "Excluding Test Drive and Direct Sales",
    manualGoal: "Manual total goal",
    importedGoal: "Imported from MetaVendas",
    unavailableGoal: "Goal unavailable in the source",
    conversionDetail:
      "Retail ÷ delivered leads · executive comparison, not a matched cohort",
  },
};

function localeTag(locale: SummaryLocale): "pt-BR" | "en-US" {
  return locale === "en" ? "en-US" : "pt-BR";
}

function numberFormat(value: number, locale: SummaryLocale): string {
  return new Intl.NumberFormat(localeTag(locale), {
    maximumFractionDigits: 0,
  }).format(value);
}

function percentFormat(value: number, locale: SummaryLocale): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function asOfFormat(value: string | null | undefined, locale: SummaryLocale) {
  if (!value)
    return locale === "en"
      ? "source date unavailable"
      : "data da fonte indisponível";

  // Date-only API values are rendered at UTC noon so the displayed day cannot shift.
  const dateOnly = value.slice(0, 10);
  const parsed = new Date(`${dateOnly}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateOnly;

  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function Metric({
  testId,
  label,
  value,
  detail,
  action,
}: {
  testId: string;
  label: string;
  value: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-white/80 bg-white/75 p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="flex min-h-6 items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
          {label}
        </p>
        {action}
      </div>
      <p
        className="mt-2 truncate text-xl font-bold tracking-[-0.02em] text-slate-950"
        data-testid={`${testId}-value`}
        title={value}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
      ) : null}
    </div>
  );
}

function unavailableDetail(
  available: boolean,
  globallyComparable: boolean,
  labels: SummaryLabels
): string | undefined {
  if (!available) return labels.sourceUnavailable;
  if (!globallyComparable) return labels.notComparable;
  return undefined;
}

export function V2CommercialSummary({
  performance,
  competence,
  canManage,
  onUpdated,
  locale = "pt-BR",
  generalComparable = true,
}: V2CommercialSummaryProps) {
  const labels = LABELS[locale];
  const available = performance.available;
  const totals = performance.totals;
  const globalValuesAvailable = available && generalComparable;
  const sourceUnavailableOrFiltered = unavailableDetail(
    available,
    generalComparable,
    labels
  );

  const displayNumber = (
    value: number | null | undefined,
    allowed: boolean
  ): string =>
    !allowed || value == null
      ? labels.notAvailable
      : numberFormat(value, locale);

  const registration = performance.generalRegistrationMTD;
  const retail = performance.generalRetailMTD;
  const registrationDetail = globalValuesAvailable
    ? labels.registrationSource(asOfFormat(registration?.asOf, locale))
    : sourceUnavailableOrFiltered;
  const retailDetail = globalValuesAvailable
    ? `${labels.retailSource(asOfFormat(retail?.asOf, locale))} · ${labels.retailDefinition}`
    : sourceUnavailableOrFiltered;
  const conversionDetail =
    globalValuesAvailable && retail
      ? labels.conversionDetail
      : (sourceUnavailableOrFiltered ?? labels.notComparable);
  const salesGoalDetail =
    performance.salesGoalOrigin === "manual"
      ? labels.manualGoal
      : performance.salesGoalOrigin === "imported"
        ? labels.importedGoal
        : performance.salesGoalOrigin === "unavailable"
          ? labels.unavailableGoal
          : undefined;
  const conversionValue = displayNumber(
    totals.conversionRate,
    globalValuesAvailable && Boolean(retail)
  );

  return (
    <section
      aria-label={locale === "en" ? "Commercial summary" : "Resumo comercial"}
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5"
      data-testid="v2-commercial-summary"
    >
      <div
        className="rounded-2xl border border-blue-100 bg-blue-50/55 p-3 sm:p-4"
        data-testid="v2-commercial-summary-leads"
      >
        <h2 className="text-sm font-bold text-blue-950">{labels.leads}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Metric
            testId="v2-commercial-summary-lead-goal"
            label={labels.leadGoal}
            value={displayNumber(totals.leadGoal, globalValuesAvailable)}
          />
          <Metric
            testId="v2-commercial-summary-leads-delivered"
            label={labels.leadsDelivered}
            value={displayNumber(totals.leads, available)}
            detail={available ? labels.leadsPeriod : labels.sourceUnavailable}
          />
        </div>
      </div>

      <div
        className="mt-3 rounded-2xl border border-teal-100 bg-teal-50/55 p-3 sm:p-4"
        data-testid="v2-commercial-summary-sales"
      >
        <h2 className="text-sm font-bold text-teal-950">{labels.sales}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            testId="v2-commercial-summary-sales-goal"
            label={labels.salesGoal}
            value={displayNumber(totals.salesGoal, globalValuesAvailable)}
            detail={
              globalValuesAvailable
                ? salesGoalDetail
                : sourceUnavailableOrFiltered
            }
            action={
              <V2SalesGoalEditor
                competence={competence}
                currentGoal={totals.salesGoal}
                canManage={canManage}
                onSaved={onUpdated}
              />
            }
          />
          <Metric
            testId="v2-commercial-summary-registration"
            label={labels.registration}
            value={displayNumber(registration?.value, globalValuesAvailable)}
            detail={registrationDetail}
          />
          <Metric
            testId="v2-commercial-summary-retail"
            label={labels.retail}
            value={displayNumber(retail?.value, globalValuesAvailable)}
            detail={retailDetail}
          />
          <Metric
            testId="v2-commercial-summary-conversion"
            label={labels.conversion}
            value={
              conversionValue === labels.notAvailable
                ? labels.notAvailable
                : percentFormat(totals.conversionRate!, locale)
            }
            detail={conversionDetail}
          />
        </div>
      </div>
    </section>
  );
}

export default V2CommercialSummary;
