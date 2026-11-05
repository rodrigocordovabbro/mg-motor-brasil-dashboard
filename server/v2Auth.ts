import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { getV2Account } from "./v2Db";
import { getSessionCookieOptions } from "./_core/cookies";

export const V2_COOKIE = "mg_v2_session";
export const V2_SESSION_SCOPE = "mg-dashboard-v2";
const SESSION_SECONDS = 60 * 60 * 8;
const attempts = new Map<string, { count: number; until: number }>();
export type V2Identity = { id: number; username: string };

function secret() {
  if (!process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID)
    throw new Error("Sessão do MG Sales não configurada");
  return new TextEncoder().encode(process.env.MANUS_JWT_SECRET);
}
export function hashV2Password(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}
export function verifyV2Password(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  try {
    const actual = scryptSync(password, salt, 64);
    const target = Buffer.from(expected, "base64url");
    return actual.length === target.length && timingSafeEqual(actual, target);
  } catch {
    return false;
  }
}

export async function createV2Token(identity: V2Identity) {
  return new SignJWT({
    scope: V2_SESSION_SCOPE,
    appId: process.env.MANUS_PROJECT_ID,
    username: identity.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(identity.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secret());
}
export async function verifyV2Token(token: string): Promise<V2Identity | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    if (
      payload.scope !== V2_SESSION_SCOPE ||
      payload.appId !== process.env.MANUS_PROJECT_ID ||
      typeof payload.username !== "string"
    )
      return null;
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    return { id, username: payload.username };
  } catch {
    return null;
  }
}
export async function readV2Session(req: Request): Promise<V2Identity | null> {
  const token = parse(req.headers.cookie ?? "")[V2_COOKIE];
  if (!token) return null;
  const identity = await verifyV2Token(token);
  if (!identity) return null;
  const account = await getV2Account(identity.username);
  return account?.isActive && account.id === identity.id ? identity : null;
}
export async function loginV2(
  req: Request,
  res: Response,
  username: string,
  password: string
) {
  const key = req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  if (attempts.size > 10000)
    for (const [entry, value] of attempts)
      if (value.until <= now) attempts.delete(entry);
  let attempt = attempts.get(key);
  if (!attempt || attempt.until <= now) {
    attempt = { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(key, attempt);
  }
  if (attempt.count >= 10)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Muitas tentativas. Aguarde 15 minutos.",
    });
  attempt.count++;
  const account = await getV2Account(username.trim().toLowerCase());
  const stored =
    account?.passwordHash ??
    `scrypt$invalid-account$${Buffer.alloc(64).toString("base64url")}`;
  const valid = verifyV2Password(password, stored);
  if (!account?.isActive || !valid)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Usuário ou senha inválidos",
    });
  attempts.delete(key);
  const identity = { id: account.id, username: account.username };
  res.cookie(V2_COOKIE, await createV2Token(identity), {
    ...getSessionCookieOptions(req),
    maxAge: SESSION_SECONDS * 1000,
  });
  return identity;
}
export function logoutV2(req: Request, res: Response) {
  res.clearCookie(V2_COOKIE, getSessionCookieOptions(req));
  return { success: true as const };
}
