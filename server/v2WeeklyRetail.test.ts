import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseCommercialWorkbook } from "./v2CommercialParser";

async function file(build: (workbook: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  build(book);
  return Buffer.from(
    (await book.xlsx.writeBuffer()) as unknown as Uint8Array
  ).toString("base64");
}

function retail(book: ExcelJS.Workbook) {
  const sheet = book.addWorksheet("WEEKLY_RET");
  sheet.addRow([
    "CUSTOMER_NAME",
    "TARGET",
    "W1_Retail",
    "W2_Retail",
    "W3_Retail",
    "W4_Retail",
    "W5_Retail",
    "W6_Retail",
  ]);
  sheet.addRow([
    "  Concessionária Original  ",
    900,
    3,
    5,
    null,
    null,
    null,
    null,
  ]);
  sheet.addRow(["Dealer zero", 900, 0, 0, null, null, null, null]);
  sheet.addRow(["TOTAL", 1800, 3, 5]);
  sheet.addRow([null, 1800, 300, 500]);
  return sheet;
}

describe("Weekly Retail source", () => {
  it("prioritizes WEEKLY_RET over WEEKLY_REG and keeps cumulative snapshots and original names", async () => {
    const base64 = await file(book => {
      const reg = book.addWorksheet("WEEKLY_REG");
      reg.addRow(["CUSTOMER_NAME", "W2_Reg"]);
      reg.addRow(["Wrong registration dealer", 999]);
      retail(book);
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-09",
      "retail.xlsx",
      base64
    );
    expect(parsed.sourceWeek).toBe(2);
    expect(parsed.total).toBe(5);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map(row => row.value)).toEqual([5, 0]);
    expect(parsed.rows[0].sourceLabel).toBe("  Concessionária Original  ");
    expect(parsed.rows[0].weeklySales?.values).toEqual([
      3,
      5,
      null,
      null,
      null,
      null,
    ]);
    expect(parsed.rows[0].key).toContain("WEEKLY_RET:W2_Retail");
  });
  it("uses the actual W4 monthly reference, never TARGET or a sum of weeks", async () => {
    const base64 = await file(book => {
      const sheet = retail(book);
      sheet.getCell("F2").value = 14;
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-28",
      "retail.xlsx",
      base64,
      4
    );
    expect(parsed.rows[0].value).toBe(14);
    expect(parsed.rows[0].weeklySales?.values[3]).toBe(14);
    expect(parsed.total).toBe(14);
  });
  it("defaults the monthly Retail close to W4, even when the calendar has a fifth week", async () => {
    const base64 = await file(book => {
      const sheet = retail(book);
      sheet.getCell("F2").value = 14;
      sheet.getCell("G2").value = 99;
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-30",
      "retail.xlsx",
      base64
    );
    expect(parsed.sourceWeek).toBe(4);
    expect(parsed.rows[0].value).toBe(14);
  });
  it("does not turn an empty W4 into zero or an earlier snapshot", async () => {
    const base64 = await file(retail);
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-09",
      "retail.xlsx",
      base64,
      4
    );
    expect(parsed.total).toBeNull();
    expect(parsed.rows.every(row => row.value === null)).toBe(true);
    expect(parsed.rows[0].weeklySales?.values[1]).toBe(5);
  });
  it("does not silently fall back to Registration when an existing Retail sheet is malformed", async () => {
    const base64 = await file(book => {
      book.addWorksheet("WEEKLY_RET").addRow(["CUSTOMER_NAME", "TARGET"]);
      const reg = book.addWorksheet("WEEKLY_REG");
      reg.addRow(["CUSTOMER_NAME", "W2_Reg"]);
      reg.addRow(["Dealer", 8]);
    });
    await expect(
      parseCommercialWorkbook(
        "sales",
        "2026-11",
        "2026-11-09",
        "retail.xlsx",
        base64
      )
    ).rejects.toThrow("WEEKLY_RET");
  });
  it("keeps general Retail and Registration separate from the dealer sum", async () => {
    const base64 = await file(book => {
      retail(book);
      const daily = book.addWorksheet("DAILY_FUP");
      daily.addRow([
        "Current Month",
        "MTD Registration",
        "Retail",
        "MTD Retail",
        "Test Drive",
        "Direct Sales",
      ]);
      daily.addRow(["Volume", 115, 109, 110, 2, 4]);
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-09",
      "261110_Daily_Sales_FUP.xlsx",
      base64
    );
    expect(parsed.total).toBe(109);
    expect(parsed.retailMtd).toBe(109);
    expect(parsed.registrationMtd).toBe(115);
    expect(parsed.rows[0].value).toBe(5);
    expect(parsed.warnings.join(" ")).toContain(
      "soma conhecida de WEEKLY_RET = 5"
    );
  });
});
