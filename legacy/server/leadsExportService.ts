import { resolveDashboardPeriod } from "@shared/dashboardDates";
import { and, asc, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";

import { leads } from "../drizzle/schema";
import { getDb } from "./db";

export type LeadsExportLocale = "pt-BR" | "en-US";

export type LeadExportRow = {
  id: number;
  contentHash: string;
  correctedDate: string;
  channel: string;
  model: string;
  region: string;
  city: string;
  dealerName: string;
  dealerRaw: string;
  contactName: string;
  email: string;
  phone: string;
  sourceDateRaw: string;
};

export type LeadExportSummary = {
  dateFrom: string;
  dateTo: string;
  filteredRows: number;
  exportedRows: number;
  duplicatesRemoved: number;
};

export type LeadsExportResult = LeadExportSummary & {
  fileName: string;
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  base64: string;
};

type WorkbookBuildInput = {
  rows: LeadExportRow[];
  dateFrom: string;
  dateTo: string;
  locale: LeadsExportLocale;
  generatedAt?: Date;
};

const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const HEADER_FILL = "FF0D1421";
const HEADER_ACCENT = "FFE2212D";
const LIGHT_FILL = "FFF3F4F6";
const BORDER_COLOR = "FFD1D5DB";

function ui(locale: LeadsExportLocale, pt: string, en: string): string {
  return locale === "en-US" ? en : pt;
}

function toExcelDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function safeCellText(value: string): string {
  return value.length > 32_767 ? value.slice(0, 32_767) : value;
}

function formatGeneratedAt(value: Date, locale: LeadsExportLocale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function deduplicateLeadExportRows(rows: LeadExportRow[]): LeadExportRow[] {
  const seen = new Set<string>();
  const uniqueRows: LeadExportRow[] = [];

  for (const row of rows) {
    if (seen.has(row.contentHash)) continue;
    seen.add(row.contentHash);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 28;
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "medium", color: { argb: HEADER_ACCENT } },
    };
  });
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  input: WorkbookBuildInput,
  summary: LeadExportSummary,
): void {
  const sheet = workbook.addWorksheet(ui(input.locale, "Resumo", "Summary"), {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });

  sheet.columns = [
    { key: "label", width: 33 },
    { key: "value", width: 28 },
    { key: "notes", width: 68 },
  ];

  sheet.mergeCells("A1:C1");
  const title = sheet.getCell("A1");
  title.value = ui(input.locale, "MG Motors — Exportação da Base de Leads", "MG Motors — Leads Database Export");
  title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 34;

  sheet.addRow([]);
  sheet.addRow([
    ui(input.locale, "Período inicial", "Period start"),
    toExcelDate(summary.dateFrom),
    ui(input.locale, "Campo de referência: Data Corrigida", "Reference field: Corrected Date"),
  ]);
  sheet.addRow([
    ui(input.locale, "Período final", "Period end"),
    toExcelDate(summary.dateTo),
    ui(input.locale, "Limite operacional aplicado até D-1", "Operational cutoff applied through D-1"),
  ]);
  sheet.addRow([
    ui(input.locale, "Linhas filtradas", "Filtered rows"),
    summary.filteredRows,
    ui(input.locale, "Ocorrências encontradas no período antes da deduplicação da exportação", "Occurrences found in the period before export deduplication"),
  ]);
  sheet.addRow([
    ui(input.locale, "Linhas exportadas", "Exported rows"),
    summary.exportedRows,
    ui(input.locale, "Primeira ocorrência preservada para cada conteúdo único", "First occurrence retained for each unique content"),
  ]);
  sheet.addRow([
    ui(input.locale, "Duplicatas removidas", "Duplicates removed"),
    summary.duplicatesRemoved,
    ui(input.locale, "Repetições exatas identificadas pelo hash do conteúdo", "Exact duplicates identified by content hash"),
  ]);
  sheet.addRow([
    ui(input.locale, "Exportado em", "Exported at"),
    formatGeneratedAt(input.generatedAt ?? new Date(), input.locale),
    ui(input.locale, "Fuso horário: America/Sao_Paulo", "Time zone: America/Sao_Paulo"),
  ]);
  sheet.addRow([
    ui(input.locale, "Regra de deduplicação", "Deduplication rule"),
    "contentHash",
    ui(input.locale, "Registros distintos por data, canal, modelo, região, cidade, concessionária ou contato são preservados", "Records that differ by date, channel, model, region, city, dealer, or contact are retained"),
  ]);

  for (let rowNumber = 3; rowNumber <= 9; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true, color: { argb: HEADER_FILL } };
    row.getCell(2).font = { bold: rowNumber >= 5 && rowNumber <= 7, color: { argb: "FF111827" } };
    row.getCell(3).font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };
    row.eachCell(cell => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: BORDER_COLOR } } };
    });
  }
  sheet.getCell("B3").numFmt = "dd/mm/yyyy";
  sheet.getCell("B4").numFmt = "dd/mm/yyyy";
  sheet.getRow(2).height = 8;
  sheet.autoFilter = { from: "A3", to: "C9" };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addDataSheet(
  workbook: ExcelJS.Workbook,
  rows: LeadExportRow[],
  locale: LeadsExportLocale,
): void {
  const sheet = workbook.addWorksheet(ui(locale, "Base de Leads", "Leads Database"), {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });

  sheet.columns = [
    { header: ui(locale, "Data Corrigida", "Corrected Date"), key: "correctedDate", width: 16 },
    { header: ui(locale, "Canal", "Channel"), key: "channel", width: 24 },
    { header: ui(locale, "Modelo", "Model"), key: "model", width: 22 },
    { header: ui(locale, "Região", "Region"), key: "region", width: 18 },
    { header: ui(locale, "Cidade", "City"), key: "city", width: 24 },
    { header: ui(locale, "Concessionária canônica", "Canonical Dealer"), key: "dealerName", width: 34 },
    { header: ui(locale, "Concessionária original", "Original Dealer"), key: "dealerRaw", width: 38 },
    { header: ui(locale, "Nome", "Name"), key: "contactName", width: 32 },
    { header: ui(locale, "E-mail", "Email"), key: "email", width: 36 },
    { header: ui(locale, "Telefone", "Phone"), key: "phone", width: 20 },
    { header: ui(locale, "Data original", "Original Date"), key: "sourceDateRaw", width: 24 },
  ];

  styleHeader(sheet.getRow(1));

  for (const row of rows) {
    const excelRow = sheet.addRow({
      correctedDate: toExcelDate(row.correctedDate),
      channel: safeCellText(row.channel),
      model: safeCellText(row.model),
      region: safeCellText(row.region),
      city: safeCellText(row.city),
      dealerName: safeCellText(row.dealerName),
      dealerRaw: safeCellText(row.dealerRaw),
      contactName: safeCellText(row.contactName),
      email: safeCellText(row.email),
      phone: safeCellText(row.phone),
      sourceDateRaw: safeCellText(row.sourceDateRaw),
    });
    excelRow.getCell("correctedDate").numFmt = "dd/mm/yyyy";
    excelRow.eachCell(cell => {
      cell.alignment = { vertical: "middle", wrapText: false };
      cell.border = { bottom: { style: "hair", color: { argb: BORDER_COLOR } } };
    });
    if (excelRow.number % 2 === 1) {
      excelRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_FILL } };
      });
    }
  }

  const lastRow = Math.max(1, sheet.rowCount);
  sheet.autoFilter = { from: "A1", to: `K${lastRow}` };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

export async function buildLeadsExportWorkbook(
  input: WorkbookBuildInput,
): Promise<{ buffer: Buffer; summary: LeadExportSummary }> {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, input.generatedAt);
  const uniqueRows = deduplicateLeadExportRows(input.rows);
  const summary: LeadExportSummary = {
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    filteredRows: input.rows.length,
    exportedRows: uniqueRows.length,
    duplicatesRemoved: input.rows.length - uniqueRows.length,
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MG Motors Dashboard";
  workbook.company = "MG Motors Brasil";
  workbook.subject = ui(input.locale, "Base filtrada de Leads", "Filtered Leads database");
  workbook.title = ui(input.locale, "Exportação de Leads", "Leads Export");
  workbook.created = input.generatedAt ?? new Date();
  workbook.modified = input.generatedAt ?? new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  addSummarySheet(workbook, input, summary);
  addDataSheet(workbook, uniqueRows, input.locale);

  const bytes = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(bytes), summary };
}

async function getLeadExportRows(dateFrom: string, dateTo: string): Promise<LeadExportRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db
    .select({
      id: leads.id,
      contentHash: leads.contentHash,
      correctedDate: leads.correctedDate,
      channel: leads.channel,
      model: leads.model,
      region: leads.region,
      city: leads.city,
      dealerName: leads.dealerName,
      dealerRaw: leads.dealerRaw,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      sourceDateRaw: leads.sourceDateRaw,
    })
    .from(leads)
    .where(and(gte(leads.correctedDate, dateFrom), lte(leads.correctedDate, dateTo)))
    .orderBy(asc(leads.correctedDate), asc(leads.id));
}

export async function exportLeadsBase(input: {
  dateFrom: string;
  dateTo: string;
  locale: LeadsExportLocale;
}): Promise<LeadsExportResult> {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo);
  const rows = await getLeadExportRows(period.dateFrom, period.dateTo);
  const { buffer, summary } = await buildLeadsExportWorkbook({
    rows,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    locale: input.locale,
  });
  const separator = input.locale === "en-US" ? "to" : "a";

  return {
    ...summary,
    fileName: `mg-motors-leads-${summary.dateFrom}-${separator}-${summary.dateTo}.xlsx`,
    mimeType: MIME_TYPE,
    base64: buffer.toString("base64"),
  };
}
