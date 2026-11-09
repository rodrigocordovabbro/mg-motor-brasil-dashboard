const HISTORICAL_MONTH_STYLES = [
  { color: "#0e7490", dasharray: "2 3" },
  { color: "#7c3aed", dasharray: "8 4" },
  { color: "#b45309", dasharray: "12 3 2 3" },
] as const;

/** Stable across filtering/reordering and distinct for three consecutive months. */
export function getHistoricalMonthStyle(competence: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(competence);
  const month = match ? Number(match[2]) : 0;
  if (month < 1 || month > 12) {
    return { color: "#64748b", dasharray: "4 3" };
  }
  return HISTORICAL_MONTH_STYLES[(month - 1) % 3];
}
