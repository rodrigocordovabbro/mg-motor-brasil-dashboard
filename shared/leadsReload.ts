export const LEADS_RELOAD_VERSION_NOT_CONFIRMED =
  "LEADS_RELOAD_VERSION_NOT_CONFIRMED";
export const LEADS_RELOAD_VERSION_NOT_CONFIRMED_MESSAGE =
  "A planilha foi importada, mas o painel ainda não confirmou a nova versão. Atualize os indicadores.";

export class LeadsReloadVersionNotConfirmedError extends Error {
  readonly code = LEADS_RELOAD_VERSION_NOT_CONFIRMED;

  constructor() {
    super(LEADS_RELOAD_VERSION_NOT_CONFIRMED_MESSAGE);
    this.name = "LeadsReloadVersionNotConfirmedError";
  }
}

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

const date = (iso: string) => iso.split("-").reverse().join("/");
export function describeLeadsReload(result: LeadsReloadResult): string {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(result.checkedAt));
  const count = new Intl.NumberFormat("pt-BR").format(result.monthlyTotal);
  const coverage = result.latestLeadDate
    ? `Último dia disponível: ${date(result.latestLeadDate)}.`
    : "Nenhuma data de Lead disponível na base.";
  const importStatus = result.newImport
    ? "Nova importação encontrada no banco."
    : result.sync
      ? ""
      : "Nenhuma nova importação registrada; a fonte externa não foi sincronizada por este botão.";
  const lastImport = result.importedAt
    ? `Última importação: ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(result.importedAt))}.`
    : "Sem importação registrada.";
  const gap =
    result.latestLeadDate && result.latestLeadDate < result.requestedDateTo
      ? ` O período vai até ${date(result.requestedDateTo)}; a base ainda não cobre esse dia.`
      : "";
  const syncStatus = result.sync
    ? result.sync.changed
      ? `Planilha-base importada: ${result.sync.inserted} novos registros e ${result.sync.updated} atualizações; ${result.sync.totalRows} registros na base completa. `
      : "Planilha conferida não houve mudanças. "
    : "";
  return `${syncStatus}Consulta concluída às ${time}. ${count} Leads no acumulado de ${result.competence.split("-").reverse().join("/")}. ${coverage} ${lastImport} ${importStatus}${gap}`;
}
