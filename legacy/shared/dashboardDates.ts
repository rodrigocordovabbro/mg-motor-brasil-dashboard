export const DASHBOARD_TIME_ZONE = "America/Sao_Paulo";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatIsoDateInTimeZone(
  date: Date,
  timeZone = DASHBOARD_TIME_ZONE,
): string {
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida para cálculo do calendário.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addIsoDays(date: string, days: number): string {
  if (!isIsoCalendarDate(date) || !Number.isInteger(days)) {
    throw new Error("Informe uma data ISO válida e uma quantidade inteira de dias.");
  }
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getDashboardCutoffDate(now: Date = new Date()): string {
  return addIsoDays(formatIsoDateInTimeZone(now), -1);
}

export function capDateAtDashboardCutoff(date: string, now: Date = new Date()): string {
  if (!isIsoCalendarDate(date)) throw new Error("Informe uma data válida no formato AAAA-MM-DD.");
  const cutoffDate = getDashboardCutoffDate(now);
  return date > cutoffDate ? cutoffDate : date;
}

export function resolveDashboardPeriod(
  dateFrom: string,
  dateTo: string,
  now: Date = new Date(),
): { dateFrom: string; dateTo: string; cutoffDate: string } {
  if (!isIsoCalendarDate(dateFrom) || !isIsoCalendarDate(dateTo)) {
    throw new Error("Informe datas válidas no formato AAAA-MM-DD.");
  }
  if (dateFrom > dateTo) {
    throw new Error("A data inicial precisa ser anterior ou igual à data final.");
  }

  const cutoffDate = getDashboardCutoffDate(now);
  if (dateFrom > cutoffDate) {
    throw new Error(`A data inicial não pode ultrapassar D-1 (${cutoffDate}).`);
  }

  return {
    dateFrom,
    dateTo: dateTo > cutoffDate ? cutoffDate : dateTo,
    cutoffDate,
  };
}
