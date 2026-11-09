import type {
  RegionalModelDistribution,
  RegionalModelRow,
} from "@shared/regionalTypes";
import { OFFICIAL_MODELS } from "@shared/modelRegistry";
import { useMemo, useState } from "react";
import { BarChart3, MapPin } from "lucide-react";

type MatrixMode = "regions" | "states";
type MatrixLocale = "pt-BR" | "en";

const UNKNOWN_MODEL_LABEL = "Não identificado";

function t(locale: MatrixLocale = "pt-BR", pt: string, en: string) {
  return locale === "en" ? en : pt;
}

function numberFormat(value: number, locale: MatrixLocale = "pt-BR") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function percentFormat(value: number, locale: MatrixLocale = "pt-BR") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function cellTone(count: number, total: number) {
  if (count <= 0 || total <= 0) {
    return { backgroundColor: "#f8fafc", color: "#475569" };
  }
  const share = count / total;
  if (share < 0.25) {
    return { backgroundColor: "#fecaca", color: "#7f1d1d" };
  }
  if (share < 0.6) {
    return { backgroundColor: "#ef4444", color: "#ffffff" };
  }
  return { backgroundColor: "#991b1b", color: "#ffffff" };
}

function unknownCount(row: RegionalModelRow) {
  return Object.entries(row.counts)
    .filter(
      ([model]) =>
        !OFFICIAL_MODELS.includes(model as (typeof OFFICIAL_MODELS)[number])
    )
    .reduce((sum, [, count]) => sum + count, 0);
}

function rowCount(row: RegionalModelRow, model: string) {
  if (OFFICIAL_MODELS.includes(model as (typeof OFFICIAL_MODELS)[number])) {
    return row.counts[model] ?? 0;
  }
  return row.counts[model] ?? unknownCount(row);
}

function EmptyMatrix({ label }: { label: string }) {
  return (
    <div className="px-5 py-8 text-center text-xs leading-5 text-slate-500">
      {label}
    </div>
  );
}

export default function V2RegionalModelMatrix({
  data,
  locale = "pt-BR",
}: {
  data?: RegionalModelDistribution | null;
  locale?: MatrixLocale;
}) {
  const [mode, setMode] = useState<MatrixMode>("regions");
  const rows = useMemo(
    () => (data ? (mode === "regions" ? data.regions : data.states) : []),
    [data, mode]
  );

  const modelColumns = useMemo(() => {
    if (!data) return [];
    const columns = [...OFFICIAL_MODELS] as string[];
    if (data.unidentifiedModelCount > 0) {
      const returnedUnknown = data.models.find(
        model =>
          !OFFICIAL_MODELS.includes(model as (typeof OFFICIAL_MODELS)[number])
      );
      columns.push(returnedUnknown ?? UNKNOWN_MODEL_LABEL);
    }
    return columns;
  }, [data]);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
      aria-labelledby="regional-model-matrix-title"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
            {t(locale, "Leitura Regional", "Regional view")}
          </p>
          <h3
            id="regional-model-matrix-title"
            className="mt-0.5 text-[15px] font-bold tracking-[-0.01em] text-slate-900"
          >
            {t(
              locale,
              "Leads por modelo e região",
              "Leads by model and region"
            )}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            {t(
              locale,
              "Contagem retornada pela fonte de Leads; região conforme estado; não comprova entrega CRM.",
              "Count returned by the Leads source; region based on state; this does not prove CRM delivery."
            )}
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="group"
          aria-label={t(
            locale,
            "Dimensão da matriz regional",
            "Regional matrix dimension"
          )}
        >
          {(
            [
              ["regions", t(locale, "Por região", "By region")],
              ["states", t(locale, "Por estado", "By state")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === value ? "bg-[#e2212d] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <EmptyMatrix
          label={t(
            locale,
            "Distribuição regional indisponível na resposta atual.",
            "Regional distribution is unavailable in the current response."
          )}
        />
      ) : !rows.length || !modelColumns.length ? (
        <EmptyMatrix
          label={t(
            locale,
            "Não há dados regionais identificados para este período.",
            "No regional data was identified for this period."
          )}
        />
      ) : (
        <>
          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-[760px] w-full border-separate border-spacing-1 text-left text-xs">
              <caption className="sr-only">
                {t(
                  locale,
                  `Contagem e percentual por ${mode === "regions" ? "região" : "estado"} e modelo`,
                  `Count and percentage by ${mode === "regions" ? "region" : "state"} and model`
                )}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-[180px] bg-white px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500"
                  >
                    {mode === "regions"
                      ? t(locale, "Região", "Region")
                      : t(locale, "Estado", "State")}
                  </th>
                  {modelColumns.map(model => (
                    <th
                      key={model}
                      scope="col"
                      className="min-w-[112px] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
                    >
                      {model}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="min-w-[96px] px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-2 py-2 font-semibold text-slate-800"
                      title={`${row.label}: ${numberFormat(row.total, locale)} ${t(locale, "leads", "Leads")}`}
                    >
                      <span className="flex items-center gap-2">
                        {mode === "regions" ? (
                          <BarChart3
                            className="h-3.5 w-3.5 shrink-0 text-[#e2212d]"
                            aria-hidden="true"
                          />
                        ) : (
                          <MapPin
                            className="h-3.5 w-3.5 shrink-0 text-[#e2212d]"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{row.label}</span>
                      </span>
                    </th>
                    {modelColumns.map(model => {
                      const count = rowCount(row, model);
                      const ratio = row.total > 0 ? count / row.total : 0;
                      const tone = cellTone(count, row.total);
                      const label = `${row.label}, ${model}: ${numberFormat(count, locale)} ${t(locale, "leads", "Leads")}, ${percentFormat(ratio, locale)} ${t(locale, "da linha", "of the row")}`;
                      return (
                        <td
                          key={`${row.label}:${model}`}
                          className="rounded-lg px-2 py-2 text-center align-middle"
                          style={tone}
                          aria-label={label}
                          title={label}
                        >
                          <span className="block font-bold">
                            {numberFormat(count, locale)}
                          </span>
                          <span className="mt-0.5 block text-[10px] font-semibold opacity-95">
                            {percentFormat(ratio, locale)}
                          </span>
                        </td>
                      );
                    })}
                    <td
                      className="px-2 py-2 text-right font-bold text-slate-900"
                      title={`${row.label}: ${numberFormat(row.total, locale)} ${t(locale, "leads", "Leads")}`}
                    >
                      {numberFormat(row.total, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600"
                  >
                    {t(locale, "Total retornado", "Returned total")}
                  </th>
                  {modelColumns.map(model => {
                    const count = rows.reduce(
                      (sum, row) => sum + rowCount(row, model),
                      0
                    );
                    return (
                      <td
                        key={`total:${model}`}
                        className="bg-slate-50 px-2 py-2 text-center font-bold text-slate-800"
                        title={`${model}: ${numberFormat(count, locale)} ${t(locale, "leads no recorte exibido", "Leads in the displayed slice")}`}
                      >
                        {numberFormat(count, locale)}
                      </td>
                    );
                  })}
                  <td className="bg-slate-50 px-2 py-2 text-right font-bold text-slate-900">
                    {numberFormat(
                      rows.reduce((sum, row) => sum + row.total, 0),
                      locale
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">
              {t(locale, "Legenda:", "Legend:")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                className="h-3 w-3 rounded bg-slate-50 ring-1 ring-slate-200"
                aria-hidden="true"
              />
              {t(locale, "0 leads", "0 Leads")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-red-200" aria-hidden="true" />
              {t(locale, "menor participação", "lower share")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-red-500" aria-hidden="true" />
              {t(locale, "participação intermediária", "middle share")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-red-800" aria-hidden="true" />
              {t(locale, "maior participação", "higher share")}
            </span>
            <span className="ml-auto">
              {t(locale, "Total da fonte:", "Source total:")}{" "}
              {numberFormat(data.total, locale)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
