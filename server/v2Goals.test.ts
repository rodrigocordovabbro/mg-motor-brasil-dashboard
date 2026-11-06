import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePacing } from "./v2Leads";
import { getV2Goal, saveV2Goal } from "./v2Db";
import {
  GoalInputError,
  MAX_GOAL,
  parseLeadGoal,
  validateGoalInput,
} from "../shared/v2Goals";

const mock = vi.hoisted(() => {
  const execute = vi.fn();
  const beginTransaction = vi.fn();
  const commit = vi.fn();
  const rollback = vi.fn();
  const release = vi.fn();
  const getConnection = vi.fn(() => ({
    execute,
    beginTransaction,
    commit,
    rollback,
    release,
  }));
  const createPool = vi.fn(() => ({ execute, query: vi.fn(), getConnection }));
  return {
    execute,
    beginTransaction,
    commit,
    rollback,
    release,
    getConnection,
    createPool,
  };
});

vi.mock("mysql2/promise", () => ({ default: { createPool: mock.createPool } }));

describe("monthly lead goals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.execute.mockResolvedValue([[], []]);
    mock.beginTransaction.mockResolvedValue(undefined);
    mock.commit.mockResolvedValue(undefined);
    mock.rollback.mockResolvedValue(undefined);
    mock.release.mockReturnValue(undefined);
  });

  it("accepts only trimmed positive decimal integers up to the shared maximum", () => {
    expect(validateGoalInput(" 10000 ")).toBe(10000);
    expect(parseLeadGoal("10")).toBe(10);
    expect(validateGoalInput(String(MAX_GOAL))).toBe(MAX_GOAL);
  });

  it.each(["", "   ", "1,000", "1.5", "-1", "+1", "1e3", "Infinity", "NaN", "10000001"]) (
    "rejects non-integer goal input %j with a Portuguese error",
    raw => {
      expect(() => parseLeadGoal(raw)).toThrow(GoalInputError);
      expect(() => parseLeadGoal(raw)).toThrow(
        "Informe uma meta mensal inteira entre 1 e 10.000.000."
      );
    }
  );

  it("reads a goal using the exact bound competence and does not fall back", async () => {
    mock.execute.mockResolvedValueOnce([[{ goal: 1353 }], []]);

    await expect(getV2Goal("2026-11")).resolves.toBe(1353);
    expect(mock.execute).toHaveBeenCalledTimes(1);
    expect(mock.execute).toHaveBeenCalledWith(
      "SELECT g.goal FROM v2_lead_goals g LEFT JOIN v2_commercial_import_state s ON s.importId=g.sourceImportId WHERE g.competence = ? AND (g.sourceKind='manual' OR g.sourceKind IS NULL OR (g.sourceKind='import' AND g.sourceImportId IS NOT NULL AND (s.importId IS NULL OR s.removedAt IS NULL))) LIMIT 1",
      ["2026-11"]
    );
  });

  it("saves the monthly key and audits the previous and new values", async () => {
    mock.execute
      .mockResolvedValueOnce([[{ goal: 10000 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await saveV2Goal("2026-11", 12000, 7);

    expect(mock.beginTransaction).toHaveBeenCalledOnce();
    expect(mock.execute).toHaveBeenNthCalledWith(
      1,
      "SELECT goal FROM v2_lead_goals WHERE competence=? FOR UPDATE",
      ["2026-11"]
    );
    expect(mock.execute).toHaveBeenNthCalledWith(
      2,
      "INSERT INTO v2_lead_goals (competence,goal,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE goal=VALUES(goal),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
      ["2026-11", 12000, 7]
    );
    expect(mock.execute).toHaveBeenNthCalledWith(
      3,
      "INSERT INTO v2_goal_audit (competence,oldGoal,newGoal,accountId) VALUES (?,?,?,?)",
      ["2026-11", 10000, 12000, 7]
    );
    expect(mock.commit).toHaveBeenCalledOnce();
    expect(mock.rollback).not.toHaveBeenCalled();
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when saving fails", async () => {
    const failure = new Error("test-only database failure");
    mock.execute.mockRejectedValueOnce(failure);

    await expect(saveV2Goal("2026-11", 12000, 7)).rejects.toBe(failure);
    expect(mock.rollback).toHaveBeenCalledOnce();
    expect(mock.commit).not.toHaveBeenCalled();
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it("keeps pacing math honest for ahead and behind fixtures", () => {
    const ahead = makePacing(1353, 10000, "2026-11-04");
    expect(ahead.progressPercent).toBeCloseTo(13.53, 10);
    expect(ahead.remainingToGoal).toBe(8647);
    expect(ahead.requiredPerDay).toBe(8647 / 26);
    expect(ahead.status).toBe("AHEAD");
    expect(ahead.projection).toBe(10148);
    expect(ahead.projectedDifference).toBe(148);

    const behind = makePacing(1353, 12000, "2026-11-04");
    expect(behind.progressPercent).toBeCloseTo(11.275, 10);
    expect(behind.remainingToGoal).toBe(10647);
    expect(behind.requiredPerDay).toBe(10647 / 26);
    expect(behind.status).toBe("BEHIND");
    expect(behind.projectedDifference).toBe(-1852);
  });

  it("does not invent a zero required pace at month end", () => {
    const pacing = makePacing(1353, 2000, "2026-11-30");
    expect(pacing.daysRemaining).toBe(0);
    expect(pacing.requiredPerDay).toBeNull();
    expect(pacing.remainingToGoal).toBe(647);
  });
});
