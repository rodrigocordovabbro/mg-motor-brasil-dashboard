export type DashboardUpdateLocale = "pt-BR" | "en-US";

export const DASHBOARD_UPDATE_COPY = {
  "pt-BR": {
    label: "Última atualização",
    waiting: "Aguardando dados",
  },
  "en-US": {
    label: "Last updated",
    waiting: "Waiting for data",
  },
} as const;

export function isValidDashboardUpdatedAt(value: string | null | undefined): value is string {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

export function preserveLastSuccessfulUpdate(
  current: string | null,
  candidate: string | null | undefined,
): string | null {
  return isValidDashboardUpdatedAt(candidate) ? candidate : current;
}

export function formatDashboardUpdatedAt(
  updatedAt: string | null,
  locale: DashboardUpdateLocale,
): string {
  if (!isValidDashboardUpdatedAt(updatedAt)) return DASHBOARD_UPDATE_COPY[locale].waiting;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(updatedAt));
}
