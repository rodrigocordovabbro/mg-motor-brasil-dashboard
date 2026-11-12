import type { V2Lead } from "@shared/v2Types";

type Locale = "pt-BR" | "en";

const UNAVAILABLE = new Set([
  "",
  "não informado",
  "nao informado",
  "indisponível",
  "indisponivel",
  "n/a",
  "n/d",
  "null",
  "undefined",
]);

function provided(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return UNAVAILABLE.has(text.toLocaleLowerCase("pt-BR")) ? null : text;
}

function dateLabel(value: string, locale: Locale): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(parsed);
}

/** Only the authorized current page. No raw payload, contact links or hidden PII attributes. */
export function V2OpportunityTable({
  rows,
  clientMode,
  locale = "pt-BR",
}: {
  rows: readonly V2Lead[];
  clientMode: boolean;
  locale?: Locale;
}) {
  const tr = (pt: string, en: string) => (locale === "en" ? en : pt);
  const missing = tr("Não informado", "Not provided");
  const hiddenContact = tr(
    "Oculto no modo apresentação",
    "Hidden in presentation mode"
  );
  const labels = [
    tr("Data", "Date"),
    tr("Nome completo", "Full name"),
    tr("E-mail", "Email"),
    tr("Telefone", "Phone"),
    tr("Carro de interesse", "Vehicle of interest"),
    tr("Canal", "Channel"),
    tr("Campanha", "Campaign"),
    tr("Concessionária", "Dealer"),
    tr("Cidade/UF", "City/State"),
    "CRM",
  ];
  return (
    <div className="overflow-x-auto" data-testid="opportunities-table">
      <table
        className="w-full min-w-[1580px] text-left"
        aria-label={tr("Oportunidades de Leads", "Lead opportunities")}
      >
        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
          <tr>
            {labels.map(label => (
              <th key={label} scope="col" className="px-4 py-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {rows.length ? (
            rows.map(row => {
              const fallbackVehicle = [
                provided(row.model),
                provided(row.version),
              ]
                .filter(Boolean)
                .join(" · ");
              const vehicle =
                provided(row.interestVehicle) ?? (fallbackVehicle || missing);
              return (
                <tr key={row.id} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {dateLabel(row.date, locale)}
                    </span>
                    {row.hour == null ? null : (
                      <span className="ml-2 text-slate-400">
                        {String(row.hour).padStart(2, "0")}
                        {locale === "en" ? ":00" : "h"}
                      </span>
                    )}
                  </td>
                  <td className="min-w-[210px] max-w-[300px] whitespace-normal break-words px-4 py-3 font-semibold text-slate-800">
                    {clientMode
                      ? tr(
                          "Nome oculto no modo cliente",
                          "Hidden name in client mode"
                        )
                      : (provided(row.name) ?? missing)}
                  </td>
                  <td className="min-w-[230px] max-w-[320px] whitespace-normal break-all px-4 py-3 text-slate-600">
                    {clientMode
                      ? hiddenContact
                      : (provided(row.email) ?? missing)}
                  </td>
                  <td className="min-w-[160px] whitespace-nowrap px-4 py-3 text-slate-600">
                    {clientMode
                      ? hiddenContact
                      : (provided(row.phone) ?? missing)}
                  </td>
                  <td className="min-w-[185px] max-w-[260px] whitespace-normal break-words px-4 py-3 text-slate-700">
                    {vehicle}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {provided(row.channel) ?? missing}
                  </td>
                  <td className="max-w-[220px] whitespace-normal break-words px-4 py-3 text-slate-600">
                    {provided(row.campaign) ?? missing}
                  </td>
                  <td className="min-w-[190px] max-w-[260px] whitespace-normal break-words px-4 py-3 text-slate-600">
                    {provided(row.dealer) ?? missing}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[provided(row.city), provided(row.state)]
                      .filter(Boolean)
                      .join(" / ") || missing}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {provided(row.crm) ?? missing}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={labels.length}
                className="px-5 py-12 text-center text-sm text-slate-400"
              >
                {tr(
                  "Nenhuma oportunidade encontrada com os filtros atuais.",
                  "No opportunity found with the current filters."
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
