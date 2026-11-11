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
  it("prioritizes WEEKLY_REG over WEEKLY_RET and keeps cumulative snapshots and original names", async () => {
    const base64 = await file(book => {
      const reg = book.addWorksheet("WEEKLY_REG");
      reg.addRow([
        "CUSTOMER_NAME",
        "W1_Reg",
        "W2_Reg",
        "W3_Reg",
        "W4_Reg",
        "W5_Reg",
        "W6_Reg",
      ]);
      reg.addRow(["Wrong registration dealer", null, 999]);
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
    expect(parsed.total).toBe(999);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows.map(row => row.value)).toEqual([999]);
    expect(parsed.rows[0].sourceLabel).toBe("Wrong registration dealer");
    expect(parsed.rows[0].weeklySales?.values).toEqual([
      null,
      999,
      null,
      null,
      null,
      null,
    ]);
    expect(parsed.rows[0].weeklySales?.sourceSheet).toBe("WEEKLY_REG");
    expect(parsed.rows[0].key).toContain("WEEKLY_REG:W2_Reg");
    expect(parsed.warnings[0]).toContain("WEEKLY_REG");
  });
  it("preserves REG W1-W6, including zero, without summing snapshots", async () => {
    const base64 = await file(book => {
      const sheet = book.addWorksheet("WEEKLY_REG");
      sheet.addRow([
        "CUSTOMER_NAME",
        "W1_Reg",
        "W2_Reg",
        "W3_Reg",
        "W4_Reg",
        "W5_Reg",
        "W6_Reg",
      ]);
      sheet.addRow(["Dealer zero", 0, 2, 3, 4, 5, 6]);
      sheet.addRow(["Dealer stored", 1, 2, 3, 4, 5, 6]);
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-28",
      "registration.xlsx",
      base64,
      1
    );
    expect(parsed.total).toBe(1);
    expect(parsed.rows.map(row => row.value)).toEqual([0, 1]);
    expect(parsed.rows[0].weeklySales?.values).toEqual([0, 2, 3, 4, 5, 6]);
    expect(parsed.rows[0].weeklySales?.sourceSheet).toBe("WEEKLY_REG");

    const explicitSix = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-28",
      "registration.xlsx",
      base64,
      6
    );
    expect(explicitSix.sourceWeek).toBe(6);
    expect(explicitSix.rows.map(row => row.value)).toEqual([6, 6]);
  });
  it("does not turn a blank REG W4 into zero or an earlier snapshot", async () => {
    const base64 = await file(book => {
      const sheet = book.addWorksheet("WEEKLY_REG");
      sheet.addRow([
        "CUSTOMER_NAME",
        "W1_Reg",
        "W2_Reg",
        "W3_Reg",
        "W4_Reg",
        "W5_Reg",
        "W6_Reg",
      ]);
      sheet.addRow(["Dealer blank month", 4, 5, 6, null, 8, 9]);
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-28",
      "registration.xlsx",
      base64,
      4
    );
    expect(parsed.total).toBeNull();
    expect(parsed.rows[0].value).toBeNull();
    expect(parsed.rows[0].weeklySales?.values).toEqual([4, 5, 6, null, 8, 9]);
    expect(parsed.warnings.join(" ")).toContain("W4_Reg");
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
  it("does not silently fall back to Retail when an existing Registration sheet is malformed", async () => {
    const base64 = await file(book => {
      const reg = book.addWorksheet("WEEKLY_REG");
      reg.addRow(["CUSTOMER_NAME", "TARGET"]);
      reg.addRow(["Malformed registration", 8]);
      const retailSheet = book.addWorksheet("WEEKLY_RET");
      retailSheet.addRow(["CUSTOMER_NAME", "W2_Retail"]);
      retailSheet.addRow(["Legacy retail", 8]);
    });
    await expect(
      parseCommercialWorkbook(
        "sales",
        "2026-11",
        "2026-11-09",
        "retail.xlsx",
        base64
      )
    ).rejects.toThrow("WEEKLY_REG");
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
    expect(parsed.warnings.join(" ")).toContain(
      "WEEKLY_RET foi usada como fallback de compatibilidade histórica"
    );
  });
});
