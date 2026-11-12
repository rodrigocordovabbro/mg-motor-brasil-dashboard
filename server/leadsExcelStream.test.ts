import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { Writable } from "node:stream";
import type { V2Lead } from "../shared/v2Types";
import {
  buildLeadsExportCsv,
  buildLeadsExportXlsx,
  LeadsExportLimitError,
} from "./v2LeadsExport";

const input = { dateFrom: "2026-11-01", dateTo: "2026-11-09" };
const opportunity: V2Lead = {
  id: 1,
  date: "2026-11-03",
  hour: null,
  name: "Pessoa fixture",
  email: "fixture@example.invalid",
  phone: "0012345",
  interestVehicle: "MG S5",
  model: "MG S5",
  version: "Deluxe",
  channel: "Site",
  campaign: "Fixture",
  dealer: "Dealer fixture",
  city: "Cidade",
  state: "SP",
  crm: "Pendente",
};

afterEach(() => vi.restoreAllMocks());

describe("Excel writer failure boundaries", () => {
  it("rejects an oversized cell before allocating any ZIP writer", async () => {
    const writer = vi.spyOn(ExcelJS.stream.xlsx, "WorkbookWriter");
    await expect(
      buildLeadsExportXlsx(
        [{ ...opportunity, campaign: "x".repeat(32_768) }],
        input
      )
    ).rejects.toThrow("32.767");
    expect(writer).not.toHaveBeenCalled();
  });

  it("handles output overflow and aborts the producer without an unhandled stream error", async () => {
    let output: Writable | undefined;
    const abort = vi.fn();
    const worksheet = {
      addRow: () => ({ eachCell: vi.fn(), commit: vi.fn() }),
      getColumn: () => ({}),
      commit: vi.fn(),
    };
    vi.spyOn(ExcelJS.stream.xlsx, "WorkbookWriter").mockImplementation(
      function (options: { stream: Writable }) {
        output = options.stream;
        return {
          zip: { on: vi.fn(), abort },
          addWorksheet: () => worksheet,
          commit: () => {
            output!.write(Buffer.alloc(12 * 1024 * 1024 + 1));
            return new Promise(() => {});
          },
        };
      } as any
    );
    await expect(
      buildLeadsExportXlsx([opportunity], input)
    ).rejects.toBeInstanceOf(LeadsExportLimitError);
    expect(abort).toHaveBeenCalledOnce();
    expect(output?.destroyed).toBe(true);
  });

  it("aborts and destroys output when workbook finalization rejects", async () => {
    let output: Writable | undefined;
    const abort = vi.fn();
    const worksheet = {
      addRow: () => ({ eachCell: vi.fn(), commit: vi.fn() }),
      getColumn: () => ({}),
      commit: vi.fn(),
    };
    vi.spyOn(ExcelJS.stream.xlsx, "WorkbookWriter").mockImplementation(
      function (options: { stream: Writable }) {
        output = options.stream;
        return {
          zip: { on: vi.fn(), abort },
          addWorksheet: () => worksheet,
          commit: () => Promise.reject(new Error("XLSX_FINALIZE_FAILED")),
        };
      } as any
    );
    await expect(buildLeadsExportXlsx([opportunity], input)).rejects.toThrow(
      "XLSX_FINALIZE_FAILED"
    );
    expect(abort).toHaveBeenCalledOnce();
    expect(output?.destroyed).toBe(true);
  });
});

describe("explicit missing values in CSV", () => {
  it("keeps a missing hour explicit and does not replace a real midnight hour", () => {
    const pt = buildLeadsExportCsv([opportunity], input);
    expect(pt.split("\r\n")[1].split(";")[1]).toBe("Não informado");
    const en = buildLeadsExportCsv([opportunity], { ...input, locale: "en" });
    expect(en.split("\r\n")[1].split(";")[1]).toBe("N/A");
    const midnight = buildLeadsExportCsv([{ ...opportunity, hour: 0 }], input);
    expect(midnight.split("\r\n")[1].split(";")[1]).toBe("0");
  });
});
