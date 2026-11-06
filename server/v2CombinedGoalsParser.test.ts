import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseCombinedGoalsUpload } from "./v2CommercialParser";

const MODEL_PATH =
  "/home/ubuntu/upload/pasted_file_sfMdrj_Planilhasemtítulo.xlsx";

async function workbookBase64(
  build: (workbook: ExcelJS.Workbook) => void
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes as unknown as Uint8Array).toString("base64");
}

describe("combined goals workbook parser", () => {
  it("parses the real model with only TOTAL DEALER and SALES", async () => {
    const base64 = (await readFile(MODEL_PATH)).toString("base64");
    const parsed = await parseCombinedGoalsUpload({
      competence: "2026-11",
      fileName: "Planilhasemtítulo.xlsx",
      base64,
    });

    expect(parsed.fileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.rows).toHaveLength(31);
    expect(parsed.leadTotal).toBe(10579);
    expect(parsed.salesTotal).toBe(591);
    expect(parsed.rows[0]).toMatchObject({
      key: "Página1:2",
      sourceLabel: "SAVOL/SP",
      state: "SP",
      leadGoal: 394,
      salesGoal: 22,
    });
    expect(parsed.rows.at(-1)).toMatchObject({
      key: "Página1:32",
      sourceLabel: "TECAR/GO",
      state: "GO",
      leadGoal: 161,
      salesGoal: 9,
    });
  });

  it("does not read channel, weight, or investment columns and keeps null distinct from zero", async () => {
    const base64 = await workbookBase64(workbook => {
      const sheet = workbook.addWorksheet("Página1");
      sheet.addRow([
        "DEALER",
        "GOOGLE",
        "META",
        "WEBMOTORS",
        "MERCADO LIVRE",
        "TOTAL DEALER",
        "SALES",
        "WEIGHT",
        "CONVERSION INVESTMENT",
      ]);
      sheet.addRow(["SAVOL/SP", 999, 999, 999, 999, 0, null, "99%", "R$ 99"]);
      sheet.addRow(["BALTIC/SP", 1, 2, 3, 4, null, 0, "0%", "R$ 0"]);
    });

    const parsed = await parseCombinedGoalsUpload({
      competence: "2026-11",
      fileName: "combined.xlsx",
      base64,
    });

    expect(parsed.rows.map(row => [row.leadGoal, row.salesGoal])).toEqual([
      [0, null],
      [null, 0],
    ]);
    expect(parsed.leadTotal).toBe(0);
    expect(parsed.salesTotal).toBe(0);
  });

  it("requires the three headers in the same table and does not use a generic sales-goal alias", async () => {
    const base64 = await workbookBase64(workbook => {
      const sheet = workbook.addWorksheet("Página1");
      sheet.addRow(["DEALER", "TOTAL DEALER", "TARGET"]);
      sheet.addRow(["SAVOL/SP", 10, 2]);
    });

    await expect(
      parseCombinedGoalsUpload({
        competence: "2026-11",
        fileName: "wrong.xlsx",
        base64,
      })
    ).rejects.toThrow("DEALER, TOTAL DEALER e SALES");
  });
});
