import { describe, expect, it } from "vitest";
import {
  capDateAtDashboardCutoff,
  formatIsoDateInTimeZone,
  getDashboardCutoffDate,
  isIsoCalendarDate,
  resolveDashboardPeriod,
} from "../shared/dashboardDates";

describe("calendário global D-1 do dashboard", () => {
  it("respeita a virada do dia em America/Sao_Paulo, não a virada UTC", () => {
    const beforeMidnightInSaoPaulo = new Date("2026-07-22T02:59:59.000Z");
    const atMidnightInSaoPaulo = new Date("2026-07-22T03:00:00.000Z");

    expect(formatIsoDateInTimeZone(beforeMidnightInSaoPaulo)).toBe("2026-07-21");
    expect(getDashboardCutoffDate(beforeMidnightInSaoPaulo)).toBe("2026-07-20");
    expect(formatIsoDateInTimeZone(atMidnightInSaoPaulo)).toBe("2026-07-22");
    expect(getDashboardCutoffDate(atMidnightInSaoPaulo)).toBe("2026-07-21");
  });

  it("atravessa corretamente as viradas de mês e ano", () => {
    expect(getDashboardCutoffDate(new Date("2026-08-01T03:00:00.000Z"))).toBe("2026-07-31");
    expect(getDashboardCutoffDate(new Date("2026-01-01T03:00:00.000Z"))).toBe("2025-12-31");
  });

  it("limita a data final em D-1 e preserva períodos históricos", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");

    expect(resolveDashboardPeriod("2026-07-01", "2026-07-22", now)).toEqual({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-21",
      cutoffDate: "2026-07-21",
    });
    expect(resolveDashboardPeriod("2026-06-01", "2026-06-30", now)).toEqual({
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      cutoffDate: "2026-07-21",
    });
    expect(capDateAtDashboardCutoff("2026-07-23", now)).toBe("2026-07-21");
  });

  it("rejeita data inicial futura e datas de calendário inválidas", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");

    expect(() => resolveDashboardPeriod("2026-07-22", "2026-07-23", now)).toThrow(
      "A data inicial não pode ultrapassar D-1 (2026-07-21).",
    );
    expect(isIsoCalendarDate("2026-02-29")).toBe(false);
    expect(isIsoCalendarDate("2026-2-9")).toBe(false);
  });
});
