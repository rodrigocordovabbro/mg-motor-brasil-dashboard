import type { V2Filters } from "./v2Types";

export type LeadsExportLocale = "pt-BR" | "en";
export type LeadsExportInput = V2Filters & {
  clientMode?: boolean;
  locale?: LeadsExportLocale;
};
export type LeadsExportResult = {
  fileName: string;
  mimeType: "text/csv;charset=utf-8";
  csv: string;
  count: number;
  nameMasked: boolean;
  period: { dateFrom: string; dateTo: string; cutoffDate: string };
};

export type LeadsExcelExportResult = {
  fileName: string;
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  xlsxBase64: string;
  count: number;
  nameMasked: boolean;
  period: { dateFrom: string; dateTo: string; cutoffDate: string };
};

/** Ignore pagination while keeping all applied dimension/search filters. */
export function leadsExportFilterKey(input: LeadsExportInput) {
  return JSON.stringify({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    model: input.model || "",
    channel: input.channel || "",
    campaign: input.campaign || "",
    dealer: input.dealer || "",
    search: input.search || "",
    clientMode: Boolean(input.clientMode),
    locale: input.locale || "pt-BR",
  });
}
