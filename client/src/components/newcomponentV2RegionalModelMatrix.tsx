import type { RegionalModelDistribution, RegionalModelRow } from "@shared/regionalTypes";
import { OFFICIAL_MODELS } from "@shared/modelRegistry";
import { useMemo, useState } from "react";
import { BarChart3, MapPin } from "lucide-react";

type MatrixMode = "regions" | "states";

const UNKNOWN_MODEL_LABEL = "Não identificado";

function numberFormat(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    value
  );
}

function percentFormat(value: number) {
  return new Intl.NumberFormat("pt-BR", {
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
    .filter(([model]) => !OFFICIAL_MODELS.includes(model as (typeof OFFICIAL_MODELS)[number]))
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
}: {
  data?: RegionalModelDistribution | null;
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
        model => !OFFICIAL_MODELS.includes(model as (typeof OFFICIAL_MODELS)[number])
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
            Leitura Regional
          </p>
          <h3
            id="regional-model-matrix-title"
            className="mt-0.5 text-[15px] font-bold tracking-[-0.01em] text-slate-900"
          >
            Leads por modelo e região
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Contagem retornada pela fonte de Leads; região conforme estado; não
            comprova entrega CRM.
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="group"
          aria-label="Dimensão da matriz regional"
        >
          {([
            ["regions", "Por região"],
            ["states", "Por estado"],
          ] as const).map(([value, label]) => (
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
        <EmptyMatrix label="Distribuição regional indisponível na resposta atual." />
      ) : !rows.length || !modelColumns.length ? (
        <EmptyMatrix label="Não há dados regionais identificados para este período." />
      ) : (
        <>
          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-[760px] w-full border-separate border-spacing-1 text-left text-xs">
              <caption className="sr-only">
                Contagem e percentual por {mode === "regions" ? "região" : "estado"} e modelo
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-[180px] bg-white px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500"
                  >
                    {mode === "regions" ? "Região" : "Estado"}
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
                      title={`${row.label}: ${numberFormat(row.total)} leads`}
                    >
                      <span className="flex items-center gap-2">
                        {mode === "regions" ? (
                          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[#e2212d]" aria-hidden="true" />
                        ) : (
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#e2212d]" aria-hidden="true" />
                        )}
                        <span className="truncate">{row.label}</span>
                      </span>
                    </th>
                    {modelColumns.map(model => {
                      const count = rowCount(row, model);
                      const ratio = row.total > 0 ? count / row.total : 0;
                      const tone = cellTone(count, row.total);
                      const label = `${row.label}, ${model}: ${numberFormat(count)} leads, ${percentFormat(ratio)} da linha`;
                      return (
                        <td
                          key={`${row.label}:${model}`}
                          className="rounded-lg px-2 py-2 text-center align-middle"
                          style={tone}
                          aria-label={label}
                          title={label}
                        >
                          <span className="block font-bold">{numberFormat(count)}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold opacity-95">
                            {percentFormat(ratio)}
                          </span>
                        </td>
                      );
                    })}
                    <td
                      className="px-2 py-2 text-right font-bold text-slate-900"
                      title={`${row.label}: ${numberFormat(row.total)} leads`}
                    >
                      {numberFormat(row.total)}
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
                    Total retornado
                  </th>
                  {modelColumns.map(model => {
                    const count = rows.reduce((sum, row) => sum + rowCount(row, model), 0);
                    return (
                      <td
                        key={`total:${model}`}
                        className="bg-slate-50 px-2 py-2 text-center font-bold text-slate-800"
                        title={`${model}: ${numberFormat(count)} leads no recorte exibido`}
                      >
                        {numberFormat(count)}
                      </td>
                    );
                  })}
                  <td className="bg-slate-50 px-2 py-2 text-right font-bold text-slate-900">
                    {numberFormat(rows.reduce((sum, row) => sum + row.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">Legenda:</span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-slate-50 ring-1 ring-slate-200" aria-hidden="true" />
              0 leads
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-red-200" aria-hidden="true" />
              menor participação
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-red-500" aria-hidden="true" />
              participação intermediária
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-red-800" aria-hidden="true" />
              maior participação
            </span>
            <span className="ml-auto">Total da fonte: {numberFormat(data.total)}</span>
          </div>
        </>
      )}
    </section>
  );
}
