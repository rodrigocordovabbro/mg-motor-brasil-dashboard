import { describe, expect, it } from "vitest";
import type { V2Dashboard, V2Filters, V2Lead } from "../shared/v2Types";
import {
  buildHistoricalLeadPace,
  historicalLeadPaceWindow,
} from "./v2HistoricalLeadPace";
import { aggregateV2Leads } from "./v2Leads";

const nowNovember = new Date("2026-11-09T15:00:00.000Z");
const novemberInput: V2Filters = {
  dateFrom: "2026-11-01",
  dateTo: "2026-11-09",
};

const source = (latestLeadDate = "2026-11-08"): V2Dashboard["source"] => ({
  name: "Fixture LEADS MG",
  importedAt: "2026-11-09T12:00:00.000Z",
  mode: "authenticated-import",
  totalRows: 0,
  invalidDateRows: 0,
  earliestLeadDate: "2026-08-01",
  latestLeadDate,
});

function lead(
  id: number,
  date: string,
  channel = "Site",
  model = "MG 4"
): V2Lead {
  return {
    id,
    date,
    hour: 10,
    name: `Fixture ${id}`,
    model,
    version: "Não informado",
    channel,
    campaign: "Campanha fixture",
    dealer: "Dealer fixture",
    city: "São Paulo",
    state: "SP",
    crm: "Não informado",
  };
}

function monthRows(
  competence: string,
  days: readonly number[],
  startId: number,
  repeats = 1
): V2Lead[] {
  let id = startId;
  return days.flatMap(day =>
    Array.from({ length: repeats }, () =>
      lead(id++, `${competence}-${String(day).padStart(2, "0")}`)
    )
  );
}

function uniformNovemberFixture(latestLeadDate = "2026-11-08"): {
  rows: V2Lead[];
  source: V2Dashboard["source"];
} {
  const rows = [
    ...monthRows(
      "2026-08",
      Array.from({ length: 30 }, (_, index) => index + 1),
      1
    ),
    ...monthRows(
      "2026-09",
      Array.from({ length: 30 }, (_, index) => index + 1),
      100,
      5
    ),
    ...monthRows(
      "2026-10",
      Array.from({ length: 30 }, (_, index) => index + 1),
      300
    ),
    ...monthRows(
      "2026-11",
      Array.from({ length: 8 }, (_, index) => index + 1),
      400
    ),
  ];
  return { rows, source: source(latestLeadDate) };
}

describe("buildHistoricalLeadPace", () => {
  it("usa três meses positivos, normaliza por mês e mantém peso igual", () => {
    const fixture = uniformNovemberFixture();
    const result = buildHistoricalLeadPace(
      fixture.rows,
      novemberInput,
      60,
      fixture.source,
      nowNovember
    );

    expect(result.competence).toBe("2026-11");
    expect(result.asOfDate).toBe("2026-11-08");
    expect(result.current).toBe(8);
    expect(result.scope).toBe("GLOBAL");
    expect(result.reference.map(reference => reference.total)).toEqual([
      30, 150, 30,
    ]);
    expect(result.last3Months.status).toBe("READY");
    expect(result.lastMonth.status).toBe("READY");
    const expectedShare =
      result.reference.reduce(
        (sum, reference) =>
          sum + (reference.cumulative[7] ?? 0) / (reference.total ?? 1),
        0
      ) / result.reference.length;
    expect(result.last3Months.expectedShare).toBeCloseTo(expectedShare);
    expect(result.last3Months.points.at(-1)?.plan).toBe(60);
    expect(result.last3Months.points[7]?.plan).toBe(16);
    expect(result.last3Months.label).toContain("agosto de 2026");
    expect(result.last3Months.label).toContain("outubro de 2026");
  });

  it("faz a projeção apenas com histórico válido, ancorada no MTD real", () => {
    const fixture = uniformNovemberFixture();
    const result = buildHistoricalLeadPace(
      fixture.rows,
      novemberInput,
      60,
      fixture.source,
      nowNovember
    );
    const points = result.last3Months.points;

    expect(result.last3Months.expectedToDate).toBe(16);
    expect(result.last3Months.gapToDate).toBe(-8);
    expect(result.last3Months.gapPercent).toBe(-0.5);
    expect(result.last3Months.projection).toBe(
      Math.round(8 / (result.last3Months.expectedShare ?? 1))
    );
    expect(result.last3Months.projectedDifference).toBe(
      (result.last3Months.projection ?? 0) - 60
    );
    expect(points.slice(0, 7).every(point => point.projection === null)).toBe(
      true
    );
    expect(points[7]?.real).toBe(8);
    expect(points[7]?.projection).toBe(8);
    expect(points[8]?.real).toBeNull();
    expect(points[8]?.projection).not.toBeNull();
    expect(points.at(-1)?.real).toBeNull();
    expect(points.at(-1)?.projection).toBe(result.last3Months.projection);
  });

  it("adapta março de 31 dias para abril de 30 sem perder o total", () => {
    const rows = [
      ...monthRows(
        "2026-01",
        Array.from({ length: 31 }, (_, index) => index + 1),
        1
      ),
      ...monthRows(
        "2026-02",
        Array.from({ length: 28 }, (_, index) => index + 1),
        100
      ),
      ...monthRows(
        "2026-03",
        Array.from({ length: 31 }, (_, index) => index + 1),
        200
      ),
      ...monthRows("2026-04", [1], 300),
    ];
    const result = buildHistoricalLeadPace(
      rows,
      { dateFrom: "2026-04-01", dateTo: "2026-04-30" },
      100,
      {
        ...source("2026-04-30"),
        earliestLeadDate: "2026-01-01",
      },
      new Date("2026-05-01T15:00:00.000Z")
    );

    expect(result.daysInMonth).toBe(30);
    expect(
      result.reference.map(reference => reference.cumulative.length)
    ).toEqual([30, 30, 30]);
    expect(result.reference[0]?.total).toBe(31);
    expect(result.reference[0]?.cumulative.at(-1)).toBe(31);
    expect(result.last3Months.points).toHaveLength(30);
    expect(result.last3Months.points.at(-1)?.plan).toBe(100);
  });

  it("preserva a virada de ano e rotula as competências em pt-BR", () => {
    const rows = [
      ...monthRows("2026-10", [1, 15, 31], 1),
      ...monthRows("2026-11", [1, 15, 30], 10),
      ...monthRows("2026-12", [1, 15, 31], 20),
      ...monthRows("2027-01", [1, 2], 30),
    ];
    const result = buildHistoricalLeadPace(
      rows,
      { dateFrom: "2027-01-01", dateTo: "2027-01-09" },
      10,
      {
        ...source("2027-01-08"),
        earliestLeadDate: "2026-10-01",
      },
      new Date("2027-01-09T15:00:00.000Z")
    );

    expect(
      historicalLeadPaceWindow(
        { dateFrom: "2027-01-01", dateTo: "2027-01-09" },
        new Date("2027-01-09T15:00:00.000Z")
      ).dateFrom
    ).toBe("2026-10-01");
    expect(result.competence).toBe("2027-01");
    expect(result.lastMonth.referenceMonths).toEqual(["2026-12"]);
    expect(result.last3Months.referenceMonths).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
    expect(result.last3Months.label).toContain("outubro de 2026");
    expect(result.last3Months.label).toContain("dezembro de 2026");
  });

  it("não projeta antes do corte D-1 e integra o payload ao dashboard", () => {
    const fixture = uniformNovemberFixture();
    const rows = [...fixture.rows, lead(999, "2026-11-09")];
    const dashboard = aggregateV2Leads(
      rows,
      novemberInput,
      60,
      fixture.source,
      nowNovember
    );

    expect(dashboard.period.dateTo).toBe("2026-11-08");
    expect(dashboard.historicalPace?.asOfDate).toBe("2026-11-08");
    expect(dashboard.historicalPace?.current).toBe(8);
    expect(
      dashboard.historicalPace?.last3Months.points.at(-1)?.real
    ).toBeNull();
    expect(
      dashboard.historicalPace?.last3Months.points.at(-1)?.projection
    ).toBe(dashboard.historicalPace?.last3Months.projection);
  });

  it("marca atraso da fonte e deixa os dias não cobertos sem zero fabricado", () => {
    const fixture = uniformNovemberFixture("2026-11-07");
    const result = buildHistoricalLeadPace(
      fixture.rows,
      novemberInput,
      60,
      fixture.source,
      nowNovember
    );

    expect(result.current).toBe(7);
    expect(result.lastAvailableDate).toBe("2026-11-07");
    expect(result.last3Months.status).toBe("SOURCE_LAG");
    expect(result.last3Months.projection).toBeNull();
    expect(result.last3Months.gapToDate).toBeNull();
    expect(result.last3Months.gapPercent).toBeNull();
    expect(result.last3Months.points[7]?.real).toBeNull();
    expect(result.last3Months.points[7]?.projection).toBeNull();
    expect(result.last3Months.warnings.join(" ")).toContain("corte");
  });

  it("exige três meses válidos, distingue mês vazio e permite o último mês", () => {
    const rows = [
      ...monthRows("2026-08", [1, 2], 1),
      ...monthRows("2026-10", [1, 2], 10),
      ...monthRows("2026-11", [1], 20),
    ];
    const result = buildHistoricalLeadPace(
      rows,
      novemberInput,
      100,
      source(),
      nowNovember
    );

    expect(result.reference[1]).toMatchObject({
      total: 0,
      available: false,
      reason: "EMPTY_MONTH",
      cumulative: [],
    });
    expect(result.last3Months.status).toBe("NO_HISTORY");
    expect(result.lastMonth.status).toBe("READY");
    expect(result.last3Months.projection).toBeNull();
  });

  it("usa a população dimensional filtrada e não aplica meta global a subconjunto", () => {
    const fixture = uniformNovemberFixture();
    const rows = [
      ...fixture.rows,
      ...fixture.rows.slice(0, 3).map((row, index) => ({
        ...row,
        id: 900 + index,
        channel: "Meta",
      })),
    ];
    const result = buildHistoricalLeadPace(
      rows,
      { ...novemberInput, channel: "Meta" },
      60,
      fixture.source,
      nowNovember
    );

    expect(result.scope).toBe("FILTERED");
    expect(result.goal).toBeNull();
    expect(result.current).toBe(0);
    expect(result.last3Months.paceStatus).toBe("NO_GOAL");
    expect(result.last3Months.points.every(point => point.plan === null)).toBe(
      true
    );
  });

  it("explicita ausência de fonte e não transforma ausência em zeros disponíveis", () => {
    const fixture = uniformNovemberFixture();
    const result = buildHistoricalLeadPace(
      fixture.rows,
      novemberInput,
      60,
      { ...fixture.source, importedAt: null },
      nowNovember
    );

    expect(result.current).toBe(0);
    expect(result.lastAvailableDate).toBeNull();
    expect(result.reference.every(reference => reference.total === null)).toBe(
      true
    );
    expect(result.last3Months.status).toBe("NO_SOURCE");
    expect(result.last3Months.points.every(point => point.real === null)).toBe(
      true
    );
    expect(result.last3Months.projection).toBeNull();
  });

  it("deriva cobertura de fixtures legados que omitem os limites da fonte", () => {
    const fixture = uniformNovemberFixture();
    const legacySource = {
      ...fixture.source,
      earliestLeadDate: undefined,
      latestLeadDate: undefined,
    };
    const result = buildHistoricalLeadPace(
      fixture.rows,
      novemberInput,
      60,
      legacySource,
      nowNovember
    );

    expect(result.last3Months.status).toBe("READY");
    expect(result.current).toBe(8);
    expect(result.lastAvailableDate).toBe("2026-11-08");
  });

  it.each([null, 0])(
    "estima o fechamento com meta %s sem dividir pela meta nem fabricar um plano",
    goal => {
      const fixture = uniformNovemberFixture();
      const result = buildHistoricalLeadPace(
        fixture.rows,
        novemberInput,
        goal,
        fixture.source,
        nowNovember
      );
      expect(result.last3Months.projection).toBe(
        Math.round(result.current / result.last3Months.expectedShare!)
      );
      expect(result.last3Months.points[7].projection).toBe(result.current);
      expect(result.last3Months.points.at(-1)?.projection).toBe(
        result.last3Months.projection
      );
      if (goal === null) {
        expect(
          result.last3Months.points.every(point => point.plan === null)
        ).toBe(true);
        expect(result.last3Months.projectedDifference).toBeNull();
        expect(result.last3Months.paceStatus).toBe("NO_GOAL");
      } else {
        expect(result.last3Months.points.at(-1)?.plan).toBe(0);
        expect(result.last3Months.gapPercent).toBeNull();
      }
    }
  );

  it("preserva previsão do recorte sem comparar a meta global", () => {
    const fixture = uniformNovemberFixture();
    const result = buildHistoricalLeadPace(
      fixture.rows,
      { ...novemberInput, model: "MG 4" },
      60,
      fixture.source,
      nowNovember
    );
    expect(result.scope).toBe("FILTERED");
    expect(result.goal).toBeNull();
    expect(result.last3Months.projection).not.toBeNull();
    expect(result.last3Months.gapToDate).toBeNull();
  });
});

it("normaliza fevereiro bissexto de 29 dias em março de 31 sem perder volume", () => {
  const rows = [
    ...monthRows(
      "2027-12",
      Array.from({ length: 31 }, (_, i) => i + 1),
      1
    ),
    ...monthRows(
      "2028-01",
      Array.from({ length: 31 }, (_, i) => i + 1),
      100
    ),
    ...monthRows(
      "2028-02",
      Array.from({ length: 29 }, (_, i) => i + 1),
      200
    ),
    ...monthRows("2028-03", [1], 300),
  ];
  const result = buildHistoricalLeadPace(
    rows,
    { dateFrom: "2028-03-01", dateTo: "2028-03-01" },
    310,
    { ...source("2028-03-01"), earliestLeadDate: "2027-12-01" },
    new Date("2028-03-02T15:00:00Z")
  );
  expect(result.reference[2].total).toBe(29);
  expect(result.reference[2].cumulative).toHaveLength(31);
  expect(result.reference[2].cumulative.at(-1)).toBe(29);
  expect(result.lastMonth.points.at(-1)?.plan).toBe(310);
  expect(result.lastMonth.projection).toBe(31);
});
