import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => vi.restoreAllMocks());
describe("formatadores ICU reutilizados na importação", () => {
  it("usa dois formatadores, não dois por registro, mantendo calendário e hora de São Paulo", async () => {
    vi.resetModules();
    const original = Intl.DateTimeFormat;
    const constructor = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation((locales, options) => new original(locales, options));
    const { parseSourceDate } = await import("./v2Mapper");
    const { getDashboardCutoffDate } = await import("../shared/dashboardDates");
    for (let i = 0; i < 3000; i++)
      expect(parseSourceDate("2026-11-09T02:30:00Z")).toEqual({
        date: "2026-11-08",
        hour: 23,
      });
    expect(parseSourceDate("2026-11-09T03:30:00Z")).toEqual({
      date: "2026-11-09",
      hour: 0,
    });
    expect(getDashboardCutoffDate(new Date("2026-11-09T02:30:00Z"))).toBe(
      "2026-11-07"
    );
    expect(getDashboardCutoffDate(new Date("2026-11-09T03:30:00Z"))).toBe(
      "2026-11-08"
    );
    expect(constructor).toHaveBeenCalledTimes(2);
  });
  it("preserva formatos de calendário, offsets e datas inválidas", async () => {
    const { parseSourceDate } = await import("./v2Mapper");
    expect(parseSourceDate("2026-11-09T00:30:00-03:00")).toEqual({
      date: "2026-11-09",
      hour: 0,
    });
    expect(parseSourceDate("09/11/2026")).toEqual({
      date: "2026-11-09",
      hour: null,
    });
    expect(parseSourceDate("11/09/26", true)).toEqual({
      date: "2026-11-09",
      hour: null,
    });
    expect(parseSourceDate("31/02/2026")).toBeNull();
    const { formatIsoDateInTimeZone } = await import(
      "../shared/dashboardDates"
    );
    expect(
      formatIsoDateInTimeZone(new Date("2026-11-09T02:30:00Z"), "UTC")
    ).toBe("2026-11-09");
    expect(() => formatIsoDateInTimeZone(new Date("invalid"))).toThrow(
      "Data inválida"
    );
  });
});
