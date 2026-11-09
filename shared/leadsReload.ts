export const LEADS_RELOAD_VERSION_NOT_CONFIRMED =
  "LEADS_RELOAD_VERSION_NOT_CONFIRMED";
export const LEADS_RELOAD_VERSION_NOT_CONFIRMED_MESSAGE =
  "A planilha foi importada, mas o painel ainda não confirmou a nova versão. Atualize os indicadores.";

export class LeadsReloadVersionNotConfirmedError extends Error {
  readonly code = LEADS_RELOAD_VERSION_NOT_CONFIRMED;

  constructor(locale: "pt-BR" | "en" = "pt-BR") {
    super(
      locale === "en"
        ? "The spreadsheet was imported, but the dashboard has not confirmed the new version yet. Refresh the indicators."
        : LEADS_RELOAD_VERSION_NOT_CONFIRMED_MESSAGE
    );
    this.name = "LeadsReloadVersionNotConfirmedError";
  }
}

export type LeadsReloadStage = "syncing" | "refreshing";
export type LeadsLocale = "pt-BR" | "en";
export type LeadsReloadHandler = (
  onStage?: (stage: LeadsReloadStage) => void
) => Promise<LeadsReloadResult>;

export type LeadsReloadResult = {
  competence: string;
  total: number;
  monthlyTotal: number;
  checkedAt: string;
  importedAt: string | null;
  latestLeadDate: string | null;
  requestedDateTo: string;
  newImport: boolean;
  sync?: {
    changed: boolean;
    inserted: number;
    updated: number;
    totalRows: number;
  };
};

const translate = (locale: LeadsLocale, pt: string, en: string) =>
  locale === "en" ? en : pt;

const date = (iso: string, locale: LeadsLocale) => {
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  if (locale === "pt-BR")
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
};

export function describeLeadsReload(
  result: LeadsReloadResult,
  locale: LeadsLocale = "pt-BR"
): string {
  const localizedTime = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "pt-BR",
    {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  ).format(new Date(result.checkedAt));
  const count = new Intl.NumberFormat(
    locale === "en" ? "en-US" : "pt-BR"
  ).format(result.monthlyTotal);
  const coverage = result.latestLeadDate
    ? `${translate(locale, "Último dia disponível", "Last available day")}: ${date(result.latestLeadDate, locale)}.`
    : translate(
        locale,
        "Nenhuma data de Lead disponível na base.",
        "No Lead date is available in the source."
      );
  const importStatus = result.newImport
    ? translate(
        locale,
        "Nova importação encontrada no banco.",
        "New import found in the database."
      )
    : result.sync
      ? ""
      : translate(
          locale,
          "Nenhuma nova importação registrada; a fonte externa não foi sincronizada por este botão.",
          "No new import was recorded; the external source was not synchronized by this button."
        );
  const lastImport = result.importedAt
    ? `${translate(locale, "Última importação", "Last import")}: ${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(result.importedAt))}.`
    : translate(locale, "Sem importação registrada.", "No import recorded.");
  const gap =
    result.latestLeadDate && result.latestLeadDate < result.requestedDateTo
      ? ` ${translate(locale, "O período vai até", "The period ends on")} ${date(result.requestedDateTo, locale)}; ${translate(locale, "a base ainda não cobre esse dia.", "the source does not cover that day yet.")}`
      : "";
  const syncStatus = result.sync
    ? result.sync.changed
      ? `${translate(locale, "Planilha-base importada", "Base spreadsheet imported")}: ${result.sync.inserted} ${translate(locale, "novos registros", "new records")} ${translate(locale, "e", "and")} ${result.sync.updated} ${translate(locale, "atualizações", "updates")}; ${result.sync.totalRows} ${translate(locale, "registros na base completa", "records in the full source")}. `
      : translate(
          locale,
          "Planilha conferida não houve mudanças. ",
          "Spreadsheet checked; no changes were found. "
        )
    : "";
  const competenceLabel =
    locale === "pt-BR"
      ? `${result.competence.slice(5, 7)}/${result.competence.slice(0, 4)}`
      : new Intl.DateTimeFormat("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${result.competence}-01T12:00:00Z`));
  return `${syncStatus}${translate(locale, "Consulta concluída às", "Query completed at")} ${localizedTime}. ${count} Leads ${translate(locale, "no acumulado de", "accumulated for")} ${competenceLabel}. ${coverage} ${lastImport} ${importStatus}${gap}`;
}
