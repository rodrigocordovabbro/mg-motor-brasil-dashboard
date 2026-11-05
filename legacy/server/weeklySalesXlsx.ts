import { createHash } from "node:crypto";

import ExcelJS from "exceljs";

import { MTD_RETAIL_ORDER_LABEL } from "@shared/dashboardLabels";
import {
  buildWeeklySalesPreview,
  createWeeklySalesRow,
  type WeeklySalesCsvPreview,
  type WeeklySalesRow,
  type WeeklySalesWeekMetrics,
} from "./weeklySalesCsv";

const SOURCE_SHEET = "WEEKLY_RET";
const DAILY_SUMMARY_SHEET = "DAILY_FUP";
const SUPPORTED_WEEKS = [1, 2, 3, 4, 5] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, "");
}

function unwrapCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return value.result;
  if ("text" in value) return value.text;
  if ("richText" in value) return value.richText.map(part => part.text).join("");
  if ("hyperlink" in value && "text" in value) return value.text;
  return value;
}

function rowValues(row: ExcelJS.Row): ExcelJS.CellValue[] {
  return Array.isArray(row.values) ? row.values : Object.values(row.values ?? {});
}

function cellText(cell: ExcelJS.Cell): string {
  const value = unwrapCellValue(cell.value);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cellNumber(cell: ExcelJS.Cell): number | null | undefined {
  const raw = unwrapCellValue(cell.value);
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const normalized = String(raw)
    .trim()
    .replace(/%$/, "")
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerCell(cell: ExcelJS.Cell): number | null | undefined {
  const parsed = cellNumber(cell);
  if (parsed === null || parsed === undefined) return parsed;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function percentageCell(cell: ExcelJS.Cell): number | null | undefined {
  const parsed = cellNumber(cell);
  if (parsed === null || parsed === undefined) return parsed;
  const text = cellText(cell);
  if (typeof unwrapCellValue(cell.value) === "number" && !text.includes("%") && Math.abs(parsed) <= 2) {
    return Math.round(parsed * 10_000) / 100;
  }
  return Math.round(parsed * 100) / 100;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): {
  rowNumber: number;
  columns: Map<string, number>;
} | null {
  const limit = Math.min(sheet.rowCount, 20);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const columns = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = normalizeHeader(cellText(cell));
      if (header) columns.set(header, columnNumber);
    });
    if (
      columns.has("REGION") &&
      columns.has("CUSTOMER") &&
      columns.has("CUSTOMERNAME") &&
      columns.has("W1TGT") &&
      columns.has("W1RETAIL")
    ) {
      return { rowNumber, columns };
    }
  }
  return null;
}

function resolveDailyFupMtdRetail(workbook: ExcelJS.Workbook): number | null {
  const sheet = workbook.getWorksheet(DAILY_SUMMARY_SHEET);
  if (!sheet) return null;
  const limit = Math.min(sheet.rowCount, 10);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const header = sheet.getRow(rowNumber);
    let retailColumn: number | null = null;
    header.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (normalizeHeader(cellText(cell)) === "MTDRETAIL") retailColumn = columnNumber;
    });
    if (!retailColumn) continue;
    for (let valueRow = rowNumber + 1; valueRow <= Math.min(rowNumber + 3, sheet.rowCount); valueRow += 1) {
      const row = sheet.getRow(valueRow);
      const hasVolume = rowValues(row).some(value => normalizeHeader(value) === "VOLUME");
      if (!hasVolume) continue;
      const value = integerCell(row.getCell(retailColumn));
      return value === undefined ? null : value;
    }
  }
  return null;
}

export async function parseWeeklySalesXlsx(bytes: Buffer): Promise<WeeklySalesCsvPreview> {
  if (bytes.length === 0) throw new Error(`A planilha de ${MTD_RETAIL_ORDER_LABEL} está vazia.`);

  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("Não foi possível ler a planilha XLSX de Retail. Envie o arquivo original sem conversão.");
  }

  const sheet = workbook.getWorksheet(SOURCE_SHEET);
  if (!sheet) {
    throw new Error(`A planilha precisa conter a aba ${SOURCE_SHEET}.`);
  }

  const header = findHeaderRow(sheet);
  if (!header) {
    throw new Error(`A aba ${SOURCE_SHEET} não possui o cabeçalho esperado de Retail semanal.`);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: WeeklySalesRow[] = [];
  const dealerRowsByRegion = new Map<string, WeeklySalesRow[]>();
  const regionColumn = header.columns.get("REGION")!;
  const customerColumn = header.columns.get("CUSTOMERNAME")!;
  const monthlyTargetColumn = header.columns.get("TARGET") ?? null;

  const weekColumns = new Map<number, { target: number; retail: number; achievement: number }>();
  for (const week of SUPPORTED_WEEKS) {
    const target = header.columns.get(`W${week}TGT`);
    const retail = header.columns.get(`W${week}RETAIL`);
    const achievement = header.columns.get(`W${week}RET`);
    if (!target || !retail || !achievement) {
      errors.push(`Cabeçalho incompleto para a Semana ${week} na aba ${SOURCE_SHEET}.`);
      continue;
    }
    weekColumns.set(week, { target, retail, achievement });
  }

  const week6RetailColumn = header.columns.get("W6RETAIL") ?? null;
  const week6TargetColumn = header.columns.get("W6TGT") ?? null;
  const week6AchievementColumn = header.columns.get("W6RET") ?? null;
  const dailyMtdRetail = resolveDailyFupMtdRetail(workbook);
  let week6RowsWithData = 0;
  let week6ReportedRetail: number | null = null;
  const week6MetricsBySourceRow = new Map<number, WeeklySalesWeekMetrics>();

  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const region = cellText(row.getCell(regionColumn));
    const dealer = cellText(row.getCell(customerColumn));
    const monthlyTarget = monthlyTargetColumn ? cellNumber(row.getCell(monthlyTargetColumn)) : null;
    const weeks: Record<string, WeeklySalesWeekMetrics> = {};
    let hasWeeklyValue = false;

    for (const week of SUPPORTED_WEEKS) {
      const columns = weekColumns.get(week);
      if (!columns) continue;
      const target = cellNumber(row.getCell(columns.target));
      const retail = integerCell(row.getCell(columns.retail));
      const achievementPercent = percentageCell(row.getCell(columns.achievement));
      if (target !== null || retail !== null || achievementPercent !== null) hasWeeklyValue = true;
      if (target === undefined || retail === undefined || achievementPercent === undefined) {
        errors.push(`Linha ${rowNumber}: valor semanal inválido na Semana ${week}.`);
      }
      weeks[String(week)] = {
        target: target === undefined ? null : target,
        retail: retail === undefined ? null : retail,
        achievementPercent: achievementPercent === undefined ? null : achievementPercent,
      };
    }

    if (!region && !dealer && monthlyTarget === null && !hasWeeklyValue) continue;

    let sourceName = dealer;
    if (!sourceName && region) sourceName = region;
    if (!sourceName && monthlyTarget !== null) sourceName = "TOTAL";
    if (!sourceName) {
      errors.push(`Linha ${rowNumber}: não foi possível identificar dealer, região ou TOTAL.`);
      continue;
    }

    const parsedRow = createWeeklySalesRow({
      sourceRowNumber: rowNumber,
      sourceName,
      weeks,
      tokens: rowValues(row).slice(1).map(value => String(unwrapCellValue(value) ?? "")),
    });
    rows.push(parsedRow);
    if (dealer && region) {
      const regionRows = dealerRowsByRegion.get(region) ?? [];
      regionRows.push(parsedRow);
      dealerRowsByRegion.set(region, regionRows);
    }

    if (week6RetailColumn || week6TargetColumn || week6AchievementColumn) {
      const week6Retail = week6RetailColumn ? integerCell(row.getCell(week6RetailColumn)) : null;
      const week6Target = week6TargetColumn ? cellNumber(row.getCell(week6TargetColumn)) : null;
      const week6Achievement = week6AchievementColumn
        ? percentageCell(row.getCell(week6AchievementColumn))
        : null;
      if (week6Retail === undefined || week6Target === undefined || week6Achievement === undefined) {
        errors.push(`Linha ${rowNumber}: valor inválido na Semana 6.`);
      }
      if (week6Retail !== null || week6Target !== null || week6Achievement !== null) {
        week6RowsWithData += 1;
        week6MetricsBySourceRow.set(rowNumber, {
          target: week6Target === undefined ? null : week6Target,
          retail: week6Retail === undefined ? null : week6Retail,
          achievementPercent: week6Achievement === undefined ? null : week6Achievement,
        });
        if (!dealer && !region && monthlyTarget !== null && typeof week6Retail === "number") {
          week6ReportedRetail = week6Retail;
        }
      }
    }
  }

  const sourceTotalRow = rows.find(row => row.rowType === "TOTAL");
  const hasSupportedWeekMatchingDailyMtd =
    sourceTotalRow !== undefined && dailyMtdRetail !== null
      ? SUPPORTED_WEEKS.some(week => sourceTotalRow.weeks[String(week)]?.retail === dailyMtdRetail)
      : false;
  const hasReportedRetailInSupportedWeeks =
    sourceTotalRow !== undefined
      ? SUPPORTED_WEEKS.some(week => (sourceTotalRow.weeks[String(week)]?.retail ?? 0) > 0)
      : false;
  const useWeek6AsFirstWeek =
    dailyMtdRetail !== null &&
    week6ReportedRetail !== null &&
    dailyMtdRetail === week6ReportedRetail &&
    !hasSupportedWeekMatchingDailyMtd &&
    !hasReportedRetailInSupportedWeeks;

  if (useWeek6AsFirstWeek) {
    for (const parsedRow of rows) {
      const week6 = week6MetricsBySourceRow.get(parsedRow.sourceRowNumber);
      if (!week6) continue;
      parsedRow.weeks["1"] = week6;
      for (const week of [2, 3, 4, 5]) {
        parsedRow.weeks[String(week)] = {
          target: null,
          retail: null,
          achievementPercent: null,
        };
      }
    }
    warnings.push(
      `A Semana 6 reconcilia com o MTD Retail de ${DAILY_SUMMARY_SHEET} (${dailyMtdRetail}) e foi mapeada como Semana 1 da competência inicial.`,
    );
  }

  for (const [region, dealerRows] of Array.from(dealerRowsByRegion.entries())) {
    const weeks: Record<string, WeeklySalesWeekMetrics> = {};
    for (const week of SUPPORTED_WEEKS) {
      const weekValues: Array<WeeklySalesWeekMetrics | undefined> = dealerRows.map(
        row => row.weeks[String(week)],
      );
      const targets: number[] = weekValues.flatMap(value =>
        typeof value?.target === "number" ? [value.target] : [],
      );
      const retails: number[] = weekValues.flatMap(value =>
        typeof value?.retail === "number" ? [value.retail] : [],
      );
      const target = targets.length
        ? targets.reduce((total: number, value: number) => total + value, 0)
        : null;
      const retail = retails.length
        ? retails.reduce((total: number, value: number) => total + value, 0)
        : null;
      weeks[String(week)] = {
        target,
        retail,
        achievementPercent:
          target === null || retail === null || target <= 0
            ? target === 0 && retail === 0 ? 0 : null
            : Math.round((retail / target) * 10_000) / 100,
      };
    }
    rows.push(createWeeklySalesRow({
      sourceRowNumber: sheet.rowCount + rows.length + 1,
      sourceName: region,
      weeks,
      tokens: ["SYNTHESIZED_FROM_REGION_COLUMN"],
    }));
  }
  if (dealerRowsByRegion.size > 0) {
    warnings.push(
      `${dealerRowsByRegion.size} linha(s) regional(is) foram reconciliadas a partir da coluna REGION de ${SOURCE_SHEET}.`,
    );
  }

  if (week6RowsWithData > 0) {
    const reconciliationNote =
      dailyMtdRetail !== null && week6ReportedRetail !== null && dailyMtdRetail !== week6ReportedRetail
        ? ` O TOTAL da Semana 6 (${week6ReportedRetail}) diverge do MTD Retail de ${DAILY_SUMMARY_SHEET} (${dailyMtdRetail}).`
        : "";
    if (!useWeek6AsFirstWeek) {
      warnings.push(
        `${week6RowsWithData} linha(s) possuem dados na Semana 6. Os valores foram preservados no payload de auditoria; a referência do dashboard continua sendo a última semana que reconcilia com ${DAILY_SUMMARY_SHEET}.${reconciliationNote}`,
      );
    }
  }
  const totalRow = rows.find(row => row.rowType === "TOTAL");
  const matchingReferenceWeek = totalRow && dailyMtdRetail !== null
    ? [...SUPPORTED_WEEKS]
        .reverse()
        .find(week => totalRow.weeks[String(week)]?.retail === dailyMtdRetail) ?? null
    : null;
  const positiveReferenceWeek = totalRow
    ? [...SUPPORTED_WEEKS]
        .reverse()
        .find(week => (totalRow.weeks[String(week)]?.retail ?? 0) > 0) ?? null
    : null;
  const referenceWeek = matchingReferenceWeek ?? positiveReferenceWeek;

  if (referenceWeek !== null) {
    for (const parsedRow of rows) {
      for (const week of SUPPORTED_WEEKS) {
        if (week > referenceWeek) {
          parsedRow.weeks[String(week)] = {
            target: null,
            retail: null,
            achievementPercent: null,
          };
        }
      }
    }
  }

  if (dailyMtdRetail !== null && matchingReferenceWeek === null) {
    errors.push(
      `Nenhuma semana de ${SOURCE_SHEET} reconcilia com o MTD Retail de ${DAILY_SUMMARY_SHEET} (${dailyMtdRetail}).`,
    );
  }

  const initialPreview = buildWeeklySalesPreview({
    fileHash,
    rows,
    errors,
    warnings,
    rowsTotal: rows.length,
  });

  if (
    dailyMtdRetail !== null &&
    initialPreview.summary.referenceReportedSalesTotal !== null &&
    dailyMtdRetail !== initialPreview.summary.referenceReportedSalesTotal
  ) {
    return buildWeeklySalesPreview({
      fileHash,
      rows,
      rowsTotal: rows.length,
      warnings,
      errors: [
        ...errors,
        `O MTD Retail de ${DAILY_SUMMARY_SHEET} (${dailyMtdRetail}) diverge do TOTAL de ${SOURCE_SHEET} (${initialPreview.summary.referenceReportedSalesTotal}).`,
      ],
    });
  }

  if (dailyMtdRetail === null) {
    warnings.push(`A validação cruzada com ${DAILY_SUMMARY_SHEET} não estava disponível.`);
  }

  return buildWeeklySalesPreview({
    fileHash,
    rows,
    rowsTotal: rows.length,
    errors,
    warnings,
  });
}
