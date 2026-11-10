import { showDealerInCommercialTable } from "@shared/dealerPresentation";
import type { V2Dashboard, V2WeeklySales } from "@shared/v2Types";

export default function V2DealerWeeklySales({
  performance,
  locale = "pt-BR",
}: {
  performance: V2Dashboard["dealerPerformance"];
  locale?: "pt-BR" | "en";
}) {
  const en = locale === "en";
  const number = (value: number | null | undefined, digits = 0) =>
    value == null
      ? en
        ? "N/A"
        : "N/D"
      : new Intl.NumberFormat(en ? "en-US" : "pt-BR", {
          maximumFractionDigits: digits,
        }).format(value);
  const percent = (value: number | null) =>
    value == null
      ? en
        ? "N/A"
        : "N/D"
      : new Intl.NumberFormat(en ? "en-US" : "pt-BR", {
          style: "percent",
          maximumFractionDigits: 2,
        }).format(value);
  const rows: {
    key: string;
    dealer: string;
    weekly: V2WeeklySales;
    sales: number | null;
    leads: number;
    conversion: number | null;
    leadsPerSale: number | null;
    group: boolean;
  }[] = performance.rows
    .filter(row => showDealerInCommercialTable(row.dealer))
    .flatMap(row =>
      (row.weeklySales ?? []).map((weekly, index) => ({
        key: `${row.dealer}:${weekly.sourceLabel}:${index}`,
        dealer: row.dealer,
        weekly,
        sales: row.sales,
        leads: row.leads,
        conversion: row.conversionRate,
        leadsPerSale: row.leadsPerSale ?? null,
        group: false,
      }))
    );
  for (const source of performance.groupedGoals ?? []) {
    if (
      source.kind !== "sales" ||
      !source.weeklySales ||
      !source.dealers.some(showDealerInCommercialTable)
    )
      continue;
    rows.push({
      key: source.key,
      dealer: source.dealers.filter(showDealerInCommercialTable).join(" / "),
      weekly: source.weeklySales,
      sales: source.value,
      leads: source.leads,
      conversion:
        source.value != null && source.leads > 0
          ? source.value / source.leads
          : null,
      leadsPerSale:
        source.value != null && source.value > 0 && source.leads > 0
          ? source.leads / source.value
          : null,
      group: true,
    });
  }
  if (!rows.length) return null;
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-900">
        {en
          ? "Weekly Retail by dealer — monthly reference: W4"
          : "Retail por dealer e semana — referência do mês: W4"}
      </summary>
      <p className="px-4 pb-3 text-xs leading-5 text-slate-500">
        {en
          ? "W1–W6 are cumulative source snapshots, not weekly additions. W4 is the monthly reference when filled; missing weeks stay N/A. Group sales are not split among stores. Conversion and leads per sale use only a comparable lead period."
          : "W1–W6 são snapshots acumulados da fonte, não parcelas para somar. W4 é a referência mensal quando preenchida; semana vazia permanece N/D. Vendas de grupo não são rateadas entre lojas. Conversão e Leads por venda usam somente o período de Leads comparável."}
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[1100px] text-left text-xs"
          aria-label={
            en ? "Weekly Retail by dealer" : "Retail semanal por concessionária"
          }
        >
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">
                {en
                  ? "Dealer / original source"
                  : "Concessionária / fonte original"}
              </th>
              {[1, 2, 3, 4, 5, 6].map(week => (
                <th
                  key={week}
                  className={`px-3 py-3 text-right ${week === 4 ? "bg-teal-50 text-teal-800" : ""}`}
                >
                  W{week}
                  {week === 4 ? (en ? " — Month" : " — Mês") : ""}
                </th>
              ))}
              <th className="px-3 py-3 text-right">
                {en ? "Current snapshot" : "Snapshot ativo"}
              </th>
              <th className="px-3 py-3 text-right">Leads</th>
              <th className="px-3 py-3 text-right">
                {en ? "Conversion" : "Conversão"}
              </th>
              <th className="px-3 py-3 text-right">
                {en ? "Leads per sale" : "Leads por venda"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => (
              <tr key={row.key}>
                <td className="min-w-64 px-3 py-3">
                  <p className="font-semibold text-slate-800">{row.dealer}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {row.weekly.sourceLabel}
                    {row.group
                      ? en
                        ? " · collective, no allocation"
                        : " · coletivo, sem rateio"
                      : ""}
                  </p>
                </td>
                {row.weekly.values.map((value, index) => (
                  <td
                    key={index}
                    className={`px-3 py-3 text-right tabular-nums ${index === 3 ? "bg-teal-50/50 font-bold text-teal-900" : "text-slate-700"}`}
                  >
                    {number(value)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-bold tabular-nums">
                  {number(row.sales)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {number(row.leads)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {percent(row.conversion)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {number(row.leadsPerSale, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
