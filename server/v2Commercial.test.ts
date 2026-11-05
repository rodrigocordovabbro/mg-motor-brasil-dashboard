import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  commercialXlsxLimits,
  decodeCommercialWorkbookBase64,
  normalizeCommercialText,
  parseCommercialWorkbook,
} from "./v2CommercialParser";

async function workbookBase64(
  build: (workbook: ExcelJS.Workbook) => void
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes as unknown as Uint8Array).toString("base64");
}

describe("V2 commercial workbook parser", () => {
  it("normalizes accents without changing the source label stored in a row", async () => {
    expect(normalizeCommercialText("Concessionária São José/SP")).toBe(
      "concessionaria sao jose sp"
    );
    const base64 = await workbookBase64(workbook => {
      const sheet = workbook.addWorksheet("Leads");
      sheet.addRow(["Dealer", "Total Leads", "Retail target"]);
      sheet.addRow(["São José/SP", 12, 99]);
      sheet.addRow(["TOTAL", 12, 99]);
    });
    const parsed = await parseCommercialWorkbook(
      "lead-goals",
      "2026-11",
      undefined,
      "leads.xlsx",
      base64
    );
    expect(parsed.total).toBe(12);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].sourceLabel).toBe("São José/SP");
    expect(parsed.rows[0].value).toBe(12);
  });

  it("accepts the real MetaVendas header and sums a file without a total row", async () => {
    const base64 = await workbookBase64(workbook => {
      const sheet = workbook.addWorksheet("Página1");
      sheet.addRow(["DEALER", "TARGET TO BE\nADJUSTED"]);
      sheet.addRow(["STEFANINI CAMPINAS", 17]);
      sheet.addRow(["STEFANINI PIRACICABA", 13]);
      sheet.addRow(["BARIGUI CURITIBA", 41]);
    });
    const parsed = await parseCommercialWorkbook(
      "sales-goals",
      "2026-11",
      undefined,
      "metavendas.xlsx",
      base64
    );
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.total).toBe(71);
    expect(parsed.rows.map(row => row.value)).toEqual([17, 13, 41]);
  });

  it("reads exactly the selected WEEKLY_REG snapshot and ignores TARGET and other weeks", async () => {
    const base64 = await workbookBase64(workbook => {
      const weekly = workbook.addWorksheet("WEEKLY_REG");
      weekly.addRow([
        "REGION",
        "CUSTOMER",
        "CUSTOMER_NAME",
        "TARGET",
        "W1_Reg",
        "W2_Reg",
      ]);
      weekly.addRow(["SP", "A", "Dealer A", 583, 9, 12]);
      weekly.addRow(["SP", "B", "Dealer B", 999, 8, 3]);
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-04",
      "sales.xlsx",
      base64,
      2
    );
    expect(parsed.sourceWeek).toBe(2);
    expect(parsed.total).toBe(15);
    expect(parsed.rows.map(row => row.value)).toEqual([12, 3]);
    expect(parsed.rows.map(row => row.key)).toEqual([
      "WEEKLY_REG:W2_Reg:2",
      "WEEKLY_REG:W2_Reg:3",
    ]);
    expect(parsed.rows.every(row => row.state === null)).toBe(true);
    expect(parsed.warnings[0]).toBe(
      "Fonte de vendas: WEEKLY_REG, coluna W2_Reg. Os valores são o snapshot desta coluna, não a soma das semanas nem DAILY_FUP."
    );
  });

  it("defaults Nov 04 to W1 and preserves blank selected-week values as null", async () => {
    const base64 = await workbookBase64(workbook => {
      const weekly = workbook.addWorksheet("WEEKLY_REG");
      weekly.addRow(["CUSTOMER_NAME", "W1_Reg", "W2_Reg"]);
      weekly.addRow(["Dealer A", 4, 12]);
      weekly.addRow(["Dealer B", null, 3]);
    });
    const parsed = await parseCommercialWorkbook(
      "sales",
      "2026-11",
      "2026-11-04",
      "sales.xlsx",
      base64
    );
    expect(parsed.sourceWeek).toBe(1);
    expect(parsed.total).toBe(4);
    expect(parsed.rows.map(row => row.value)).toEqual([4, null]);
    expect(parsed.warnings.join(" ")).toContain("Fonte de vendas parcial");
  });

  it("rejects negative values in a WEEKLY_REG snapshot", async () => {
    const base64 = await workbookBase64(workbook => {
      const weekly = workbook.addWorksheet("WEEKLY_REG");
      weekly.addRow(["CUSTOMER_NAME", "W1_Reg"]);
      weekly.addRow(["Dealer A", -1]);
    });
    await expect(
      parseCommercialWorkbook(
        "sales",
        "2026-11",
        "2026-11-04",
        "bad.xlsx",
        base64
      )
    ).rejects.toThrow("inteiro seguro");
  });

  it("does not silently use Daily FUP Retail or Registration as sales", async () => {
    const base64 = await workbookBase64(workbook => {
      const daily = workbook.addWorksheet("DAILY_FUP");
      daily.addRow([]);
      daily.addRow([
        "",
        "CurrentMonth",
        "",
        "RegistrationTarget",
        "MTDRegistration",
        "Retail",
        "TestDrive",
        "DirectSales",
        "RetailTarget",
        "MTDRetail",
      ]);
      daily.addRow(["", "Nov", "", 591, 43, 40, 1, 2, 591, 20]);
    });
    await expect(
      parseCommercialWorkbook(
        "sales",
        "2026-11",
        "2026-11-04",
        "sales.xlsx",
        base64
      )
    ).rejects.toThrow("WEEKLY_REG");
  });

  it("rejects non-XLSX, malformed base64 and archives above the upload limit", () => {
    expect(() => decodeCommercialWorkbookBase64("not-base64?")).toThrow(
      "base64 inválido"
    );
    expect(commercialXlsxLimits.maxArchiveBytes).toBe(1024 * 1024);
    expect(() =>
      decodeCommercialWorkbookBase64(
        Buffer.from("PK\x03\x04").toString("base64")
      )
    ).toThrow();
  });

  it("rejects negative and decimal commercial values instead of coercing them to zero", async () => {
    const decimal = await workbookBase64(workbook => {
      const sheet = workbook.addWorksheet("Leads");
      sheet.addRow(["Dealer", "Total Leads"]);
      sheet.addRow(["Dealer A", 1.5]);
      sheet.addRow(["TOTAL", 1.5]);
    });
    await expect(
      parseCommercialWorkbook(
        "lead-goals",
        "2026-11",
        undefined,
        "bad.xlsx",
        decimal
      )
    ).rejects.toThrow("inteiro seguro");
  });
  it("reads TOTAL DEALER and namespaced OOXML without altering quantities", async () => {
    const base64 = await workbookBase64(workbook => {
      const sheet = workbook.addWorksheet("Distribuicao");
      sheet.addRow([
        "DEALER",
        "GOOGLE",
        "META",
        "WEBMOTORS",
        "MERCADO LIVRE",
        "TOTAL DEALER",
        "SALES",
      ]);
      sheet.addRow(["GRUPO/SP", 2, 3, 4, 5, 14, 99]);
      sheet.addRow(["TOTAL", 2, 3, 4, 5, 14, 99]);
    });
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith("xl/") || !name.endsWith(".xml"))
        continue;
      let xml = await entry.async("string");
      if (
        !xml.includes(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        )
      )
        continue;
      xml = xml
        .replace(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        )
        .replace(/(<\/?)([A-Za-z_][\w.-]*)(?=[\s>])/g, "$1x:$2");
      zip.file(name, xml);
    }
    const modified = await zip.generateAsync({ type: "nodebuffer" });
    const parsed = await parseCommercialWorkbook(
      "lead-goals",
      "2026-11",
      undefined,
      "goals.xlsx",
      modified.toString("base64")
    );
    expect(parsed.total).toBe(14);
    expect(parsed.rows[0].value).toBe(14);
    expect(parsed.rows[0].sourceLabel).toBe("GRUPO/SP");
  });
  it("rejects DAILY_FUP as a sales target source instead of using its auxiliary Retail target", async () => {
    const base64 = await workbookBase64(workbook => {
      const daily = workbook.addWorksheet("DAILY_FUP");
      daily.addRow(["Retail Target"]);
      daily.addRow([99]);
    });
    await expect(
      parseCommercialWorkbook(
        "sales-goals",
        "2026-11",
        undefined,
        "wrong.xlsx",
        base64
      )
    ).rejects.toThrow("arquivo próprio");
  });
});
