import { addIsoDays, isIsoCalendarDate } from "./dashboardDates";

export const LEAD_PERIOD_PRESETS = [
  "7 dias",
  "14 dias",
  "30 dias",
  "60 dias",
  "Mês",
  "Mês passado",
] as const;

export function resolveLeadPeriodPreset(
  preset: string,
  cutoff: string
): { dateFrom: string; dateTo: string } {
  if (!isIsoCalendarDate(cutoff)) throw new Error("Data de corte inválida.");
  if (preset === "Mês passado") {
    // O mês anterior é relativo a hoje em São Paulo, não ao mês de D-1.
    const today = addIsoDays(cutoff, 1);
    const [year, month] = today.split("-").map(Number);
    const dateTo = new Date(Date.UTC(year, month - 1, 0))
      .toISOString()
      .slice(0, 10);
    return { dateFrom: `${dateTo.slice(0, 7)}-01`, dateTo };
  }
  if (preset === "Mês")
    return { dateFrom: `${cutoff.slice(0, 7)}-01`, dateTo: cutoff };
  if (!(LEAD_PERIOD_PRESETS as readonly string[]).includes(preset))
    throw new Error("Período rápido inválido.");
  return {
    dateFrom: addIsoDays(cutoff, -(Number.parseInt(preset, 10) - 1)),
    dateTo: cutoff,
  };
}

export function omitLeadCampaign<T extends { campaign?: unknown }>(
  filters: T
): Omit<T, "campaign"> {
  const { campaign: _campaign, ...remaining } = filters;
  return remaining;
}
