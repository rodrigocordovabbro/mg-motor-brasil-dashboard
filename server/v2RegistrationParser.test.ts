import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  parseCommercialWorkbook,
  readRegistrationMtd,
} from "./v2CommercialParser";

async function workbookBase64(
  build: (workbook: ExcelJS.Workbook) => void
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes as unknown as Uint8Array).toString("base64");
}

function addWeeklyZeroSnapshot(workbook: ExcelJS.Workbook): void {
  const weekly = workbook.addWorksheet("WEEKLY_REG");
  weekly.addRow(["CUSTOMER_NAME", "W1_Reg"]);
  weekly.addRow(["Dealer A", 0]);
  weekly.addRow(["Dealer B", 0]);
}

function addDailyRegistrationBlock(
  workbook: ExcelJS.Workbook,
  value: number | { formula: string; result: number }
): void {
  const daily = workbook.addWorksheet("DAILY_FUP");
  daily.getCell("B2").value = "Current Month";
  daily.getCell("E2").value = "MTD Registration";
  daily.getCell("F2").value = "MTD Retail";
  daily.getCell("B3").value = "Volume";
  daily.getCell("E3").value = value as never;
  daily.getCell("F3").value = 21.5;
  // This is a later model table and must not be selected or summed.
  daily.getCell("B9").value = "Current Month";
  daily.getCell("E9").value = "MTD Registration";
  daily.getCell("E10").value = 999;
}

describe("general MTD Registration parser", () => {
  it("reads the top DAILY_FUP block, preserves dealer zeros, and does not allocate the general value", async () => {
    const base64 = await workbookBase64(workbook => {
      addDailyRegistrationBlock(workbook, {
        formula: "40+3",
        result: 43,
      });
      addWeeklyZeroSnapshot(workbook);
    });

    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-04",
      "pasted_file_QdNlYp_261105_Daily_Sales_FUP.xlsx",
      base64
    );

    expect(parsed.registrationMtd).toBe(43);
    expect(parsed.registrationAsOf).toBe("2026-11-05");
    expect(parsed.sourceSheet).toBe("DAILY_FUP");
    expect(parsed.asOf).toBe("2026-11-04");
    expect(parsed.sourceWeek).toBe(1);
    expect(parsed.total).toBe(0);
    expect(parsed.rows.map(row => row.value)).toEqual([0, 0]);
    expect(parsed.rows.some(row => row.value === 43)).toBe(false);
  });

  it("recognizes a real zero and future numeric values instead of using a 43 default", () => {
    const workbook = new ExcelJS.Workbook();
    addDailyRegistrationBlock(workbook, 0);
    expect(
      readRegistrationMtd(
        workbook,
        "Daily_Sales_FUP_261105.xlsx",
        "2026-11",
        "2026-11-04"
      ).registrationMtd
    ).toBe(0);

    const futureWorkbook = new ExcelJS.Workbook();
    addDailyRegistrationBlock(futureWorkbook, 17);
    expect(
      readRegistrationMtd(
        futureWorkbook,
        "Daily_Sales_FUP_261105.xlsx",
        "2026-11"
      ).registrationMtd
    ).toBe(17);
  });

  it("returns null with a warning when the top DAILY_FUP registration block is absent", async () => {
    const base64 = await workbookBase64(workbook => {
      const daily = workbook.addWorksheet("DAILY_FUP");
      daily.getCell("B9").value = "Current Month";
      daily.getCell("E9").value = "MTD Registration";
      daily.getCell("E10").value = 43;
      addWeeklyZeroSnapshot(workbook);
    });

    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-04",
      "Daily_Sales_FUP_261105.xlsx",
      base64
    );

    expect(parsed.registrationMtd).toBeNull();
    expect(parsed.registrationAsOf).toBe("2026-11-05");
    expect(parsed.warnings.join(" ")).toContain("linhas 1-8");
  });

  it("warns and keeps registrationAsOf null for an invalid or mismatched filename date", () => {
    const invalidWorkbook = new ExcelJS.Workbook();
    addDailyRegistrationBlock(invalidWorkbook, 43);
    const invalid = readRegistrationMtd(
      invalidWorkbook,
      "Daily_Sales_FUP_261131.xlsx",
      "2026-11"
    );
    expect(invalid.registrationMtd).toBe(43);
    expect(invalid.registrationAsOf).toBeNull();
    expect(invalid.warnings.join(" ")).toContain("inválida");

    const mismatched = readRegistrationMtd(
      invalidWorkbook,
      "Daily_Sales_FUP_261205.xlsx",
      "2026-11"
    );
    expect(mismatched.registrationMtd).toBe(43);
    expect(mismatched.registrationAsOf).toBeNull();
    expect(mismatched.warnings.join(" ")).toContain(
      "não pertence à competência 2026-11"
    );
  });

  it("warns and returns null when a generic sales workbook has no DAILY_FUP", async () => {
    const base64 = await workbookBase64(workbook => {
      const sales = workbook.addWorksheet("Sales");
      sales.addRow(["Dealer", "Sales"]);
      sales.addRow(["Dealer A", 0]);
    });

    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-04",
      "sales.xlsx",
      base64
    );

    expect(parsed.registrationMtd).toBeNull();
    expect(parsed.registrationAsOf).toBeNull();
    expect(parsed.total).toBe(0);
    expect(parsed.warnings.join(" ")).toContain("DAILY_FUP");
  });
});
