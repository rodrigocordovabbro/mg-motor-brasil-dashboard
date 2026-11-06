import type { RowDataPacket } from "mysql2/promise";
import type { UserRole } from "../shared/accountRoles";
import { getV2Pool } from "./v2Db";

export const MAX_V2_SALES_TOTAL_GOAL = 10_000_000;
const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type V2SalesGoalActor = {
  id: number;
  username: string;
  role?: UserRole;
};

export type V2SalesGoalInput = {
  competence: string;
  goal: number;
};

function normalizeCompetence(value: string): string {
  const competence = value.trim();
  if (!COMPETENCE_PATTERN.test(competence))
    throw new Error("A competência deve estar no formato AAAA-MM.");
  return competence;
}

function validateGoal(goal: number): number {
  if (!Number.isSafeInteger(goal) || goal < 0 || goal > MAX_V2_SALES_TOTAL_GOAL)
    throw new Error(
      `Informe uma meta total inteira entre 0 e ${MAX_V2_SALES_TOTAL_GOAL.toLocaleString("pt-BR")}.`
    );
  return goal;
}

/** The sales-total override belongs only to the named owner account. */
export function assertV2SalesGoalOwner(actor: V2SalesGoalActor): void {
  if (actor.role !== "admin" || actor.username !== "rodrigo")
    throw new Error(
      "Apenas o administrador Rodrigo pode editar a meta total de vendas."
    );
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0)
    throw new Error("Conta administradora inválida.");
}

/**
 * Reads only the persisted manual override. A missing row is deliberately null:
 * the imported MetaVendas total remains the effective fallback in the commercial
 * builder and is never copied into this table automatically.
 */
export async function getV2SalesTotalGoal(
  competence: string
): Promise<number | null> {
  const key = normalizeCompetence(competence);
  const [rows] = await getV2Pool().execute<RowDataPacket[]>(
    "SELECT goal FROM v2_sales_total_goals WHERE competence=? LIMIT 1",
    [key]
  );
  return rows.length && rows[0].goal != null ? Number(rows[0].goal) : null;
}

export async function saveV2SalesTotalGoal(
  input: V2SalesGoalInput,
  actor: V2SalesGoalActor
): Promise<{ success: true }> {
  assertV2SalesGoalOwner(actor);
  const competence = normalizeCompetence(input.competence);
  const goal = validateGoal(input.goal);
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    // The mutex exists even when no goal row exists; the no-op upsert takes
    // an exclusive key lock before reading the previously committed value.
    await connection.execute(
      "INSERT INTO v2_sales_total_goal_locks (competence) VALUES (?) ON DUPLICATE KEY UPDATE competence=VALUES(competence)",
      [competence]
    );
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT goal FROM v2_sales_total_goals WHERE competence=? FOR UPDATE",
      [competence]
    );
    const oldGoal = rows[0]?.goal == null ? null : Number(rows[0].goal);
    await connection.execute(
      "INSERT INTO v2_sales_total_goals (competence,goal,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE goal=VALUES(goal),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
      [competence, goal, actor.id]
    );
    await connection.execute(
      "INSERT INTO v2_sales_total_goal_audit (competence,oldGoal,newGoal,accountId) VALUES (?,?,?,?)",
      [competence, oldGoal, goal, actor.id]
    );
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
