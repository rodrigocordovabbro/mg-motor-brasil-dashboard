import { afterEach, describe, expect, it, vi } from "vitest";
import type { V2Dashboard } from "../shared/v2Types";
import {
  getOverviewPdfSnapshotVersion,
  waitForOverviewPdfSnapshot,
} from "../client/src/lib/overviewPdfSnapshot";

const fixture = () =>
  ({
    status: "READY",
    checkedAt: "2026-10-20T10:00:00Z",
    source: { latestLeadDate: "2026-10-19" },
    period: {
      dateFrom: "2026-10-01",
      dateTo: "2026-10-19",
      cutoffDate: "2026-10-19",
    },
    summary: { total: 123 },
    pacing: { current: 123, goal: 900 },
    daily: [
      {
        date: "2026-10-19",
        total: 123,
        cumulative: 123,
        channels: { Meta: 123 },
      },
    ],
    channels: [{ label: "Meta", count: 123 }],
    dealerPerformance: {
      totals: { sales: 9, salesGoal: 40, conversionRate: 0.07 },
      rows: [
        {
          dealer: "Synthetic Unit",
          sales: 9,
          leads: 123,
          conversionRate: 0.07,
        },
      ],
      generalRegistrationMTD: { value: 12, asOf: "2026-10-19" },
      generalRetailMTD: { value: 9, asOf: "2026-10-19" },
    },
    recent: { rows: [{ name: "PRIVATE PERSON" }] },
    notes: ["PRIVATE FILE"],
  }) as unknown as V2Dashboard;

function root(version: string, connected = true) {
  return {
    dataset: { overviewPdfVersion: version },
    isConnected: connected,
    ownerDocument: { defaultView: { setTimeout } },
  } as unknown as HTMLElement;
}

afterEach(() => vi.useRealTimers());

describe("Overview PDF snapshot coherence", () => {
  it("does not reveal contacts or depend on private rows and source diagnostics", () => {
    const data = fixture();
    const key = getOverviewPdfSnapshotVersion(data);
    data.recent = { ...data.recent, rows: [] };
    data.notes = ["another private file"];
    expect(getOverviewPdfSnapshotVersion(data)).toBe(key);
    expect(key).toMatch(/^overview-[0-9a-f]+$/);
    expect(key).not.toContain("PRIVATE");
  });
  it("changes with actual Leads, goals, channels, sales and ranking values", () => {
    const data = fixture();
    const key = getOverviewPdfSnapshotVersion(data);
    const variants = [fixture(), fixture(), fixture(), fixture(), fixture()];
    variants[0].summary.total = 124;
    variants[1].pacing.goal = 950;
    variants[2].daily[0].channels.Meta = 124;
    variants[3].dealerPerformance.generalRetailMTD!.value = 10;
    variants[4].dealerPerformance.rows[0].leads = 125;
    for (const value of variants)
      expect(getOverviewPdfSnapshotVersion(value)).not.toBe(key);
  });
  it("does not trigger chart animation delay for a fresh read with identical aggregates", () => {
    const data = fixture();
    const key = getOverviewPdfSnapshotVersion(data);
    data.checkedAt = "2026-10-20T10:02:00Z";
    expect(getOverviewPdfSnapshotVersion(data)).toBe(key);
  });
  it("distinguishes an unavailable value from a real zero", () => {
    const data = fixture();
    data.dealerPerformance.rows[0].sales = null;
    const key = getOverviewPdfSnapshotVersion(data);
    data.dealerPerformance.rows[0].sales = 0;
    expect(getOverviewPdfSnapshotVersion(data)).not.toBe(key);
  });
  it("invalidates the ranking snapshot when availability or the authorized dealer registry changes", () => {
    const data = fixture();
    data.dealerPerformance.available = false;
    data.dealerRegistry = [{ name: "Synthetic Unit", state: "SP" }];
    const unavailable = getOverviewPdfSnapshotVersion(data);
    data.dealerPerformance.available = true;
    const available = getOverviewPdfSnapshotVersion(data);
    expect(available).not.toBe(unavailable);
    data.dealerRegistry = [];
    expect(getOverviewPdfSnapshotVersion(data)).not.toBe(available);
  });
  it("waits for the React version then succeeds without re-reading or changing data", async () => {
    vi.useFakeTimers();
    const node = root("old");
    const wait = waitForOverviewPdfSnapshot(node, "fresh", false);
    setTimeout(() => {
      node.dataset.overviewPdfVersion = "fresh";
    }, 75);
    await vi.advanceTimersByTimeAsync(200);
    await expect(wait).resolves.toBeUndefined();
  });
  it("blocks the stale snapshot after its bounded render timeout", async () => {
    vi.useFakeTimers();
    const result = expect(
      waitForOverviewPdfSnapshot(root("old"), "fresh", false)
    ).rejects.toThrow(/finished rendering/);
    await vi.advanceTimersByTimeAsync(3_100);
    await result;
  });
  it("blocks a filter/render change while existing chart animations finish", async () => {
    vi.useFakeTimers();
    const node = root("fresh");
    const result = expect(
      waitForOverviewPdfSnapshot(node, "fresh", true)
    ).rejects.toThrow(/changed/);
    node.dataset.overviewPdfVersion = "different";
    await vi.advanceTimersByTimeAsync(1_700);
    await result;
  });
  it("blocks a root removed after the fresh snapshot was committed", async () => {
    vi.useFakeTimers();
    const node = root("fresh", false);
    const result = expect(
      waitForOverviewPdfSnapshot(node, "fresh", false)
    ).rejects.toThrow(/changed/);
    await vi.advanceTimersByTimeAsync(100);
    await result;
  });
});
