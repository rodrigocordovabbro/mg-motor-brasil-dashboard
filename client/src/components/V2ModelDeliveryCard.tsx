import { BarChart3 } from "lucide-react";
import {
  resolveOfficialModel,
  UNIDENTIFIED_MODEL,
} from "@shared/modelRegistry";
import type { V2Count } from "@shared/v2Types";

const COLORS: Record<string, string> = {
  "MG 4": "#2563eb",
  "MG Urban": "#7c3aed",
  "MG S5": "#0f766e",
  "MG Cyberster": "#b45309",
  "IM 6": "#be185d",
  [UNIDENTIFIED_MODEL]: "#64748b",
};

export function V2ModelDeliveryCard({
  items,
  total,
  locale = "pt-BR",
}: {
  items: readonly V2Count[];
  total: number;
  locale?: "pt-BR" | "en";
}) {
  const english = locale === "en";
  const number = new Intl.NumberFormat(english ? "en-US" : "pt-BR", {
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat(english ? "en-US" : "pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = resolveOfficialModel(item.label) ?? UNIDENTIFIED_MODEL;
    counts.set(label, (counts.get(label) ?? 0) + item.count);
  }
  const rows = [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
    );
  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white"
      aria-label={english ? "Leads by model" : "Leads por modelo"}
      data-testid="admin-model-delivery"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#e2212d]">
            {english ? "Administrator overview" : "Visão do Administrador"}
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-950">
            {english ? "Leads by model" : "Leads por modelo"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {english
              ? "Actual Lead volumes in the applied filter. Unknown models remain separate."
              : "Volumes reais de Leads do filtro aplicado. Modelos não identificados ficam separados."}
          </p>
        </div>
        <BarChart3
          className="h-5 w-5 shrink-0 text-[#e2212d]"
          aria-hidden="true"
        />
      </header>
      {!rows.length ? (
        <p className="p-5 text-sm text-slate-500" role="status">
          {english ? "No Leads in this filter." : "Nenhum Lead neste filtro."}
        </p>
      ) : (
        <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => {
            const share = total > 0 ? row.count / total : null;
            const color = COLORS[row.label];
            return (
              <li
                key={row.label}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    {english && row.label === UNIDENTIFIED_MODEL
                      ? "Unknown model"
                      : row.label}
                  </span>
                  <strong className="text-xl tabular-nums text-slate-950">
                    {number.format(row.count)}
                  </strong>
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${share == null ? 0 : Math.min(100, Math.max(0, share * 100))}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {share == null
                    ? english
                      ? "Share unavailable"
                      : "Participação indisponível"
                    : `${percent.format(share)} ${english ? "of the selected Leads" : "dos Leads selecionados"}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
