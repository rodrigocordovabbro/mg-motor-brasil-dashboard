import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSourceDate, mapSheet } from "./v2Mapper";
import { aggregateV2Leads, makePacing } from "./v2Leads";
import {
  createV2Token,
  verifyV2Token,
  hashV2Password,
  verifyV2Password,
} from "./v2Auth";
import type { V2Lead, V2Dashboard } from "../shared/v2Types";
const source: V2Dashboard["source"] = {
  name: "Teste unitário",
  importedAt: "2026-11-05T12:00:00Z",
  mode: "authenticated-import",
  totalRows: 2,
  invalidDateRows: 0,
};
const lead = (id: number, date: string, channel: string): V2Lead => ({
  id,
  date,
  channel,
  hour: null,
  name: "Exemplo de teste",
  model: "MG 4",
  version: "Não informado",
  campaign: "Não informado",
  dealer: "Dealer teste",
  city: "Cidade teste",
  state: "SP",
  crm: "Não informado",
});
afterEach(() => vi.unstubAllEnvs());
describe("V2 mapping", () => {
  it("preserves Brazilian dates and rejects impossible dates", () => {
    expect(parseSourceDate("04/11/2026")?.date).toBe("2026-11-04");
    expect(parseSourceDate("31/02/2026")).toBeNull();
  });
  it("uses explicit US date format only for Meta source", () => {
    expect(parseSourceDate("7/19/26", true)?.date).toBe("2026-07-19");
    expect(parseSourceDate("7/19/26", false)).toBeNull();
  });
  it("applies Sao Paulo timezone to timestamps", () => {
    expect(parseSourceDate("2026-11-05T01:30:00Z")).toEqual({
      date: "2026-11-04",
      hour: 22,
    });
  });
  it("does not manufacture hours from date-only rows", () => {
    expect(parseSourceDate("04/11/2026")?.hour).toBeNull();
  });
  it("maps aliases and does not retain contact identifiers", () => {
    const { leads } = mapSheet("Meta", [
      [
        "created_time",
        "em_qual_concessionária_gostaria_de_ser_atendido?_",
        "full_name",
        "phone_number",
        "email",
        "Modelo",
      ],
      [
        "2026-11-04T10:00:00-03:00",
        "dealer_teste",
        "Exemplo",
        "NOT_RETAINED_PHONE",
        "NOT_RETAINED_EMAIL",
        "MG4",
      ],
    ]);
    expect(leads[0].dealer).toBe("dealer teste");
    expect(leads[0].model).toBe("MG 4");
    expect(JSON.stringify(leads)).not.toContain("NOT_RETAINED");
  });
});
describe("V2 aggregation", () => {
  const now = new Date("2026-11-05T15:00:00Z");
  it("returns real channel totals and daily cumulative", () => {
    const r = aggregateV2Leads(
      [lead(1, "2026-11-01", "Meta"), lead(2, "2026-11-04", "Site")],
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      null,
      source,
      now
    );
    expect(r.summary.total).toBe(2);
    expect(r.daily.map(x => x.cumulative)).toEqual([1, 1, 1, 2]);
    expect(r.pacing.goal).toBeNull();
    expect(r.dealerPerformance.available).toBe(false);
    expect(r.dealerPerformance.totals.sales).toBeNull();
    expect(r.summary.crmRate).toBeNull();
  });
  it("preserves percentage unit even below one percent", () => {
    expect(makePacing(1, 1000, "2026-11-04").progressPercent).toBe(0.1);
  });
  it("does not apply monthly goal to a channel subset", () => {
    const r = aggregateV2Leads(
      [lead(1, "2026-11-01", "Meta"), lead(2, "2026-11-04", "Site")],
      { dateFrom: "2026-11-01", dateTo: "2026-11-04", channel: "Meta" },
      300,
      source,
      now
    );
    expect(r.summary.total).toBe(1);
    expect(r.pacing.goal).toBeNull();
  });
  it("does not spread one monthly goal over multiple months", () => {
    const r = aggregateV2Leads(
      [lead(1, "2026-10-31", "Meta"), lead(2, "2026-11-04", "Site")],
      { dateFrom: "2026-10-31", dateTo: "2026-11-04" },
      300,
      source,
      now
    );
    expect(r.daily.every(x => x.pace === null)).toBe(true);
  });
  it("anchors daily goal to the calendar day without one-day offset", () => {
    const r = aggregateV2Leads(
      [lead(1, "2026-11-01", "Site")],
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      300,
      source,
      now
    );
    expect(r.daily.map(day => day.pace)).toEqual([10, 20, 30, 40]);
    const subset = aggregateV2Leads(
      [],
      { dateFrom: "2026-11-02", dateTo: "2026-11-04" },
      300,
      source,
      now
    );
    expect(subset.daily.every(day => day.pace === null)).toBe(true);
  });
  it("distinguishes an absent source from a valid zero result", () => {
    expect(
      aggregateV2Leads(
        [],
        { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
        null,
        { ...source, importedAt: null },
        now
      ).status
    ).toBe("NOT_CONFIGURED");
    expect(
      aggregateV2Leads(
        [],
        { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
        null,
        source,
        now
      ).status
    ).toBe("READY");
  });
});
describe("V2 authentication", () => {
  it("hashes salted passwords and fails closed on mismatch", () => {
    const hash = hashV2Password("test-only-password");
    expect(verifyV2Password("test-only-password", hash)).toBe(true);
    expect(verifyV2Password("wrong", hash)).toBe(false);
    expect(hash).not.toContain("test-only-password");
    expect(hashV2Password("test-only-password")).not.toBe(hash);
  });
  it("rejects forged tokens and tokens from another project", async () => {
    vi.stubEnv("MANUS_JWT_SECRET", "unit-test-secret-only");
    vi.stubEnv("MANUS_PROJECT_ID", "project-v2-unit-test");
    const token = await createV2Token({
      id: 1,
      username: "test-only-user",
      sessionVersion: 0,
    });
    expect(await verifyV2Token(token)).toEqual({
      id: 1,
      username: "test-only-user",
      sessionVersion: 0,
    });
    expect(await verifyV2Token(token + "bad")).toBeNull();
    vi.stubEnv("MANUS_PROJECT_ID", "different-project");
    expect(await verifyV2Token(token)).toBeNull();
  });
});
