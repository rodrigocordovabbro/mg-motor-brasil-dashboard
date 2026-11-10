import {
  buildOverviewDealerRankings,
  type OverviewDealerRanking,
} from "@shared/overviewDealerRankings";
import type { V2Dashboard } from "@shared/v2Types";

export function V2OverviewDealerRankings({
  data,
  locale = "pt-BR",
}: {
  data: V2Dashboard;
  locale?: "pt-BR" | "en";
}) {
  const en = locale === "en";
  const rankings = buildOverviewDealerRankings(data);
  const fmt = new Intl.NumberFormat(en ? "en-US" : "pt-BR", {
    maximumFractionDigits: 0,
  });
  const pct = new Intl.NumberFormat(en ? "en-US" : "pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const card = (title: string, rows: OverviewDealerRanking[], top: boolean) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3
        className={`text-lg font-bold ${top ? "text-teal-900" : "text-amber-900"}`}
      >
        {title}
      </h3>
      <p className="mt-1 mb-3 text-xs text-slate-500">
        {top
          ? en
            ? "Highest comparable conversion rates"
            : "Maiores taxas de conversão comparáveis"
          : en
            ? "Lowest comparable conversion rates"
            : "Menores taxas de conversão comparáveis"}
      </p>
      {rows.length ? (
        <ol className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <li key={row.dealer} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold text-slate-800">
                  <span className="mr-2 text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {row.dealer}
                </span>
                <strong
                  className={`text-sm tabular-nums ${top ? "text-teal-700" : "text-amber-700"}`}
                >
                  {pct.format(row.conversionRate)}
                </strong>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {fmt.format(row.sales)} {en ? "sales" : "vendas"} ·{" "}
                {fmt.format(row.leads)} Leads
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${top ? "bg-teal-600" : "bg-amber-500"}`}
                  style={{
                    width: `${Math.min(100, row.conversionRate * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-sm text-slate-500">
          {en
            ? "N/A — no dealers with comparable sales and Leads in this view."
            : "N/D — não há dealers com vendas e Leads comparáveis neste recorte."}
        </p>
      )}
    </section>
  );
  return (
    <section
      data-overview-pdf-only
      data-testid="overview-pdf-dealer-rankings"
      style={{ display: "none", breakBefore: "page" }}
    >
      <header className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#e2212d]">
          MG Motor Brasil
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">
          {en
            ? "Dealer conversion — Top 10 & Bottom 10"
            : "Conversão por dealer — Top 10 e Bottom 10"}
        </h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {en
            ? "Sales snapshot ÷ Leads for the comparable period; executive comparison, not a matched cohort. Upcoming units, unavailable values, units without Leads and unallocated collective sales are excluded. A real zero sale remains eligible."
            : "Snapshot de vendas ÷ Leads do período comparável; comparação executiva, não coorte matched. Exclui unidades EM BREVE, valores indisponíveis, unidades sem Leads e vendas coletivas sem rateio. Venda zero real continua elegível."}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {fmt.format(rankings.eligibleCount)}{" "}
          {en
            ? "eligible dealers. Lists contain up to 10 each and may overlap when the eligible set is small."
            : "dealers elegíveis. Cada lista contém até 10 e pode se repetir entre listas quando há poucas unidades elegíveis."}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4">
        {card(
          en ? "Top 10 — Conversion" : "Top 10 — Conversão",
          rankings.top,
          true
        )}
        {card(
          en ? "Bottom 10 — Conversion" : "Bottom 10 — Conversão",
          rankings.bottom,
          false
        )}
      </div>
    </section>
  );
}
