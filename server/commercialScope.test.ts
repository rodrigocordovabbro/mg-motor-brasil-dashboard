import { describe, expect, it } from "vitest";
import {
  getDealerSalesKind,
  isMonthToDateCommercialPeriod,
} from "../shared/commercialScope";
import type { V2Dashboard } from "../shared/v2Types";

const performance = (
  source?: "WEEKLY_REG" | "WEEKLY_RET",
  declared?: "registration" | "retail"
) =>
  ({
    available: true,
    sourceName: null,
    updatedAt: null,
    dealerSalesKind: declared,
    rows: source
      ? [
          {
            dealer: "fixture",
            state: "SP",
            leads: 1,
            leadGoal: null,
            sales: 1,
            salesGoal: null,
            conversionRate: 1,
            weeklySales: [
              {
                sourceSheet: source,
                sourceLabel: "fixture",
                values: [1, null, null, null, null, null],
              },
            ],
          },
        ]
      : [],
    totals: {
      leads: 1,
      leadGoal: null,
      sales: null,
      salesGoal: null,
      conversionRate: null,
    },
  }) satisfies V2Dashboard["dealerPerformance"];

describe("shared commercial scope and dealer metric", () => {
  it("compares month-to-date only from day one, not same-month partial or multi-month leads", () => {
    expect(
      isMonthToDateCommercialPeriod({
        dateFrom: "2026-11-01",
        dateTo: "2026-11-10",
      })
    ).toBe(true);
    expect(
      isMonthToDateCommercialPeriod({
        dateFrom: "2026-11-02",
        dateTo: "2026-11-10",
      })
    ).toBe(false);
    expect(
      isMonthToDateCommercialPeriod({
        dateFrom: "2026-10-01",
        dateTo: "2026-11-10",
      })
    ).toBe(false);
  });
  it("uses the server metric and infers preserved legacy source without inventing a metric", () => {
    expect(getDealerSalesKind(performance("WEEKLY_REG"))).toBe("registration");
    expect(getDealerSalesKind(performance("WEEKLY_RET"))).toBe("retail");
    expect(getDealerSalesKind(performance(undefined, "registration"))).toBe(
      "registration"
    );
    expect(getDealerSalesKind(performance())).toBeNull();
  });
  it("can identify collective Registration without assigning it to a unit", () => {
    const p: V2Dashboard["dealerPerformance"] = performance();
    p.groupedGoals = [
      {
        kind: "sales",
        key: "g",
        sourceLabel: "Group",
        dealers: ["A", "B"],
        value: 5,
        leads: 10,
        weeklySales: {
          sourceSheet: "WEEKLY_REG",
          sourceLabel: "Group",
          values: [1, 5, null, null, null, null],
        },
      },
    ];
    expect(getDealerSalesKind(p)).toBe("registration");
    expect(p.rows).toEqual([]);
  });
});
