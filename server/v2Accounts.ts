import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import type { PublicAccount, UserRole } from "../shared/accountRoles";
import { hashV2Password, type V2Identity } from "./v2Auth";
import { getV2Pool } from "./v2Db";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

type AccountRow = RowDataPacket & {
  id: number;
  username: string;
  role?: string | null;
  isActive: number | boolean;
  createdAt?: Date | string | null;
};

type LockedAccountRow = AccountRow & {
  passwordHash?: string;
  sessionVersion?: number | null;
};

export type CreateV2AccountInput = {
  username: string;
  password: string;
  role?: UserRole;
};

export type UpdateV2AccountInput = {
  id: number;
  role?: UserRole;
  isActive?: boolean;
};

export type ResetV2AccountPasswordInput = {
  id: number;
  password: string;
};

type V2AdminIdentity = V2Identity & { role: "admin" };

type SqlExecutor = {
  execute: (...args: any[]) => Promise<[any, any]>;
};

function forbidden(): never {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Somente administradores podem gerenciar usuários.",
  });
}

function assertAdmin(
  actor: V2Identity | undefined
): asserts actor is V2AdminIdentity {
  if (!actor || actor.role !== "admin") forbidden();
}

function invalidInput(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function notFound(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Conta não encontrada.",
  });
}

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== "string")
    invalidInput("Informe um nome de usuário válido.");
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username))
    invalidInput(
      "O usuário deve ter de 3 a 64 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado."
    );
  return username;
}

function validatePassword(value: unknown): string {
  if (typeof value !== "string") invalidInput("Informe uma senha válida.");
  if (value.length < MIN_PASSWORD_LENGTH)
    invalidInput(
      `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
    );
  if (value.length > MAX_PASSWORD_LENGTH)
    invalidInput(
      `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`
    );
  return value;
}

function normalizeRole(
  value: unknown,
  fallback: UserRole = "client"
): UserRole {
  if (value === undefined) return fallback;
  if (value !== "admin" && value !== "client")
    invalidInput("Perfil de usuário inválido.");
  return value;
}

function normalizeId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    invalidInput("Conta inválida.");
  return value;
}

function isActive(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function isoCreatedAt(value: unknown): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function publicAccount(
  row: Partial<AccountRow> & { id: number; username: string }
): PublicAccount {
  return {
    id: Number(row.id),
    username: String(row.username),
    // Unknown/missing roles fail closed to the read-only client profile.
    role: row.role === "admin" ? "admin" : "client",
    isActive: isActive(row.isActive),
    createdAt: isoCreatedAt(row.createdAt),
  };
}

function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

async function writeAudit(
  executor: SqlExecutor,
  accountId: number,
  actorId: number,
  action: "create" | "update" | "reset_password"
) {
  // Deliberately store no password, password hash, token, or request payload.
  await executor.execute(
    "INSERT INTO v2_account_audit (accountId,actorId,action) VALUES (?,?,?)",
    [accountId, actorId, action]
  );
}

async function readPublicAccount(
  executor: SqlExecutor,
  accountId: number
): Promise<PublicAccount> {
  const [rawRows] = await executor.execute(
    "SELECT id,username,role,isActive,createdAt FROM v2_accounts WHERE id=? LIMIT 1",
    [accountId]
  );
  const rows = rawRows as AccountRow[];
  if (!rows.length) notFound();
  return publicAccount(rows[0]);
}

export async function listV2Accounts(
  actor?: V2Identity
): Promise<PublicAccount[]> {
  assertAdmin(actor);
  const [rows] = await getV2Pool().execute<AccountRow[]>(
    "SELECT id,username,role,isActive,createdAt FROM v2_accounts ORDER BY username ASC"
  );
  return rows.map(publicAccount);
}

export async function createV2Account(
  input: CreateV2AccountInput,
  actor: V2Identity
): Promise<PublicAccount> {
  assertAdmin(actor);
  const username = normalizeUsername(input?.username);
  const password = validatePassword(input?.password);
  const role = normalizeRole(input?.role);
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO v2_accounts (username,passwordHash,role,isActive) VALUES (?,?,?,TRUE)",
      [username, hashV2Password(password), role]
    );
    const accountId = Number(result.insertId);
    await writeAudit(connection, accountId, actor.id, "create");
    const account = await readPublicAccount(connection, accountId);
    await connection.commit();
    return account;
  } catch (error) {
    await connection.rollback();
    if (isDuplicateEntry(error))
      conflict("Este nome de usuário já está em uso.");
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateV2Account(
  input: UpdateV2AccountInput,
  actor: V2Identity
): Promise<PublicAccount> {
  assertAdmin(actor);
  const id = normalizeId(input?.id);
  if (input?.role === undefined && input?.isActive === undefined)
    invalidInput("Informe o perfil ou o status da conta.");
  const role =
    input?.role === undefined ? undefined : normalizeRole(input.role);
  const nextActive =
    input?.isActive === undefined ? undefined : Boolean(input.isActive);

  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    // Every account mutation takes this lock in the same order. It serializes
    // administrator-count decisions and prevents two last-admin removals.
    const [activeAdminRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM v2_accounts WHERE role='admin' AND isActive=TRUE FOR UPDATE"
    );
    const [rows] = await connection.execute<LockedAccountRow[]>(
      "SELECT id,username,role,isActive,createdAt,sessionVersion FROM v2_accounts WHERE id=? FOR UPDATE",
      [id]
    );
    if (!rows.length) notFound();
    const current = rows[0];
    const currentRole: UserRole = current.role === "admin" ? "admin" : "client";
    const currentActive = isActive(current.isActive);
    const finalRole = role ?? currentRole;
    const finalActive = nextActive ?? currentActive;
    const leavingActiveAdmin =
      currentRole === "admin" &&
      currentActive &&
      (finalRole !== "admin" || !finalActive);
    if (leavingActiveAdmin && activeAdminRows.length <= 1)
      conflict("Não é possível remover o último administrador ativo.");

    const changed = finalRole !== currentRole || finalActive !== currentActive;
    if (changed) {
      await connection.execute(
        "UPDATE v2_accounts SET role=?,isActive=?,sessionVersion=sessionVersion+1 WHERE id=?",
        [finalRole, finalActive, id]
      );
      await writeAudit(connection, id, actor.id, "update");
    }
    const account = await readPublicAccount(connection, id);
    await connection.commit();
    return account;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resetV2AccountPassword(
  input: ResetV2AccountPasswordInput,
  actor: V2Identity
): Promise<{ success: true }> {
  assertAdmin(actor);
  const id = normalizeId(input?.id);
  const password = validatePassword(input?.password);
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<LockedAccountRow[]>(
      "SELECT id FROM v2_accounts WHERE id=? FOR UPDATE",
      [id]
    );
    if (!rows.length) notFound();
    await connection.execute(
      "UPDATE v2_accounts SET passwordHash=?,sessionVersion=sessionVersion+1 WHERE id=?",
      [hashV2Password(password), id]
    );
    await writeAudit(connection, id, actor.id, "reset_password");
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const v2AccountValidation = {
  username: USERNAME_PATTERN,
  minPasswordLength: MIN_PASSWORD_LENGTH,
  maxPasswordLength: MAX_PASSWORD_LENGTH,
} as const;
