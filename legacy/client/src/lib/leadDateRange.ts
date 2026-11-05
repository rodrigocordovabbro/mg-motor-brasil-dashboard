import { getDashboardCutoffDate } from "@shared/dashboardDates";

export type LeadDateRange = {
  dateFrom: string;
  dateTo: string;
};

export const LEAD_MONTH_DEFAULT_START = `${getDashboardCutoffDate().slice(0, 7)}-01`;

export function resolveLeadMonthRange(dataFrom: string, dataTo: string): LeadDateRange {
  const monthStart = `${dataTo.slice(0, 7)}-01`;
  return {
    dateFrom: monthStart < dataFrom ? dataFrom : monthStart,
    dateTo: dataTo,
  };
}

export function isValidLeadDateRange(
  dateFrom: string,
  dateTo: string,
  dataFrom?: string,
  dataTo?: string,
): boolean {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return false;
  if (dataFrom && dateFrom < dataFrom) return false;
  if (dataTo && dateTo > dataTo) return false;
  return true;
}
