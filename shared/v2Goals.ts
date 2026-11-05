export const MAX_GOAL = 10_000_000;

const INVALID_GOAL_MESSAGE =
  "Informe uma meta mensal inteira entre 1 e 10.000.000.";

export class GoalInputError extends Error {
  readonly code = "INVALID_GOAL" as const;

  constructor(message = INVALID_GOAL_MESSAGE) {
    super(message);
    this.name = "GoalInputError";
  }
}

/**
 * Parses the exact string format accepted by the monthly goal editor.
 * Whitespace around an integer is allowed; separators, signs, decimals,
 * exponents, empty values, and non-finite values are intentionally rejected.
 */
export function validateGoalInput(raw: string): number {
  if (typeof raw !== "string") throw new GoalInputError();
  const value = raw.trim();
  if (!/^\d+$/.test(value)) throw new GoalInputError();

  const goal = Number(value);
  if (!Number.isFinite(goal) || !Number.isSafeInteger(goal) || goal < 1 || goal > MAX_GOAL) {
    throw new GoalInputError();
  }
  return goal;
}

/** Client-facing name for the same pure, shared parser. */
export function parseLeadGoal(raw: string): number {
  return validateGoalInput(raw);
}
