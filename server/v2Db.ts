import mysql from "mysql2/promise";
let pool: mysql.Pool | undefined;
export function getV2Pool() {
  if (!process.env.DATABASE_URL) throw new Error("Banco V2 indisponível");
  if (!pool) pool = mysql.createPool(process.env.DATABASE_URL);
  return pool;
}

export async function getV2Account(username: string) {
  const [rows] = await getV2Pool().execute<mysql.RowDataPacket[]>(
    "SELECT id, username, passwordHash, isActive FROM v2_accounts WHERE username = ? LIMIT 1",
    [username]
  );
  return rows[0] as
    | { id: number; username: string; passwordHash: string; isActive: number }
    | undefined;
}

export async function getV2Goal(competence: string) {
  const [rows] = await getV2Pool().execute<mysql.RowDataPacket[]>(
    "SELECT goal FROM v2_lead_goals WHERE competence = ? LIMIT 1",
    [competence]
  );
  return rows.length ? Number(rows[0].goal) : null;
}

export async function saveV2Goal(
  competence: string,
  goal: number,
  accountId: number
) {
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      "SELECT goal FROM v2_lead_goals WHERE competence=? FOR UPDATE",
      [competence]
    );
    await connection.execute(
      "INSERT INTO v2_lead_goals (competence,goal,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE goal=VALUES(goal),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
      [competence, goal, accountId]
    );
    await connection.execute(
      "INSERT INTO v2_goal_audit (competence,oldGoal,newGoal,accountId) VALUES (?,?,?,?)",
      [competence, rows[0]?.goal ?? null, goal, accountId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
