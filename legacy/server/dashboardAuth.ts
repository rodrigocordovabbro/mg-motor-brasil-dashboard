import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { parse } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { DashboardAccount } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDashboardAccountByUsername, updateDashboardAccountLastSignIn } from "./db";

export const DASHBOARD_SESSION_COOKIE = "mg_motors_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const SESSION_SCOPE = "mg-motors-dashboard";
const SESSION_VERSION = 4;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export type DashboardLocale = "pt-BR" | "en-US";

export type DashboardPermissions = {
  canAccessGoogleAds: boolean;
  canAccessMetaAds: boolean;
  canAccessLeads: boolean;
  canAccessMediaPlan: boolean;
  canAccessOptimizations: boolean;
  canAccessHistory: boolean;
  canImportLeads: boolean;
  canAccessAccessHistory: boolean;
  canAccessFinanceiro: boolean;
};

export type DashboardIdentity = {
  accountId: number;
  username: string;
  displayName: string;
  locale: DashboardLocale;
  permissions: DashboardPermissions;
};

export type DashboardSession = DashboardIdentity & {
  expiresAt: number;
};

const MG_SALES_USERNAME = "mgsales";
const MG_SALES_READ_ONLY_PERMISSIONS: DashboardPermissions = {
  canAccessGoogleAds: false,
  canAccessMetaAds: false,
  canAccessLeads: true,
  canAccessMediaPlan: false,
  canAccessOptimizations: false,
  canAccessHistory: false,
  canImportLeads: false,
  canAccessAccessHistory: false,
  canAccessFinanceiro: false,
};

export function isMgSalesReadOnlyUsername(username: string) {
  return username.trim().toLowerCase() === MG_SALES_USERNAME;
}

export function applyDashboardAccessPolicy<T extends DashboardIdentity>(identity: T): T {
  if (!isMgSalesReadOnlyUsername(identity.username)) return identity;
  return {
    ...identity,
    permissions: { ...MG_SALES_READ_ONLY_PERMISSIONS },
  };
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não está configurado");
  return new TextEncoder().encode(secret);
}

function deriveScryptKey(
  password: string,
  salt: string,
  params: typeof SCRYPT_PARAMS = SCRYPT_PARAMS,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { ...params, maxmem: SCRYPT_MAX_MEMORY },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashDashboardPassword(password: string) {
  if (password.length < 8 || password.length > 200) {
    throw new Error("A senha deve ter entre 8 e 200 caracteres");
  }

  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await deriveScryptKey(password, salt);
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyDashboardPassword(password: string, encodedHash: string) {
  const [algorithm, rawN, rawR, rawP, salt, expectedKey] = encodedHash.split("$");
  const params = {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP),
  } as typeof SCRYPT_PARAMS;

  if (
    algorithm !== "scrypt" ||
    !salt ||
    !expectedKey ||
    params.N !== SCRYPT_PARAMS.N ||
    params.r !== SCRYPT_PARAMS.r ||
    params.p !== SCRYPT_PARAMS.p
  ) {
    return false;
  }

  try {
    const actual = await deriveScryptKey(password, salt, params);
    const expected = Buffer.from(expectedKey, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function mapDashboardIdentity(account: DashboardAccount): DashboardIdentity {
  return applyDashboardAccessPolicy({
    accountId: account.id,
    username: account.username,
    displayName: account.displayName,
    locale: account.locale,
    permissions: {
      canAccessGoogleAds: account.canAccessGoogleAds,
      canAccessMetaAds: account.canAccessMetaAds,
      canAccessLeads: account.canAccessLeads,
      canAccessMediaPlan: account.canAccessMediaPlan,
      canAccessOptimizations: account.canAccessOptimizations,
      canAccessHistory: account.canAccessHistory,
      canImportLeads: account.canImportLeads,
      canAccessAccessHistory: account.canAccessAccessHistory,
      canAccessFinanceiro: account.canAccessFinanceiro,
    },
  });
}

async function consumeInvalidCredentialWork(password: string) {
  await deriveScryptKey(password, "mg-motors-invalid-account");
}

export async function authenticateDashboardCredentials(username: string, password: string) {
  const account = await getDashboardAccountByUsername(username);
  if (!account || !account.isActive) {
    await consumeInvalidCredentialWork(password);
    return null;
  }

  const isValid = await verifyDashboardPassword(password, account.passwordHash);
  if (!isValid) return null;

  await updateDashboardAccountLastSignIn(account.id);
  return mapDashboardIdentity(account);
}

export async function createDashboardSession(identity: DashboardIdentity) {
  return new SignJWT({
    scope: SESSION_SCOPE,
    version: SESSION_VERSION,
    accountId: identity.accountId,
    username: identity.username,
    displayName: identity.displayName,
    locale: identity.locale,
    permissions: identity.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJwtSecret());
}

function parsePermissions(value: unknown): DashboardPermissions | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const keys = [
    "canAccessGoogleAds",
    "canAccessMetaAds",
    "canAccessLeads",
    "canAccessMediaPlan",
    "canAccessOptimizations",
    "canAccessHistory",
    "canImportLeads",
    "canAccessAccessHistory",
    "canAccessFinanceiro",
  ] as const;

  if (keys.some(key => typeof candidate[key] !== "boolean")) return null;
  return Object.fromEntries(keys.map(key => [key, candidate[key]])) as DashboardPermissions;
}

export async function readDashboardSession(req: Request): Promise<DashboardSession | null> {
  const cookies = parse(req.headers.cookie ?? "");
  const token = cookies[DASHBOARD_SESSION_COOKIE];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    const accountId = Number(payload.accountId);
    const username = typeof payload.username === "string" ? payload.username : "";
    const displayName = typeof payload.displayName === "string" ? payload.displayName : "";
    const locale = payload.locale === "en-US" || payload.locale === "pt-BR" ? payload.locale : null;
    const permissions = parsePermissions(payload.permissions);

    if (
      payload.scope !== SESSION_SCOPE ||
      payload.version !== SESSION_VERSION ||
      payload.sub !== username ||
      !Number.isInteger(accountId) ||
      accountId <= 0 ||
      !username ||
      !displayName ||
      !locale ||
      !permissions
    ) {
      return null;
    }

    return applyDashboardAccessPolicy({
      accountId,
      username,
      displayName,
      locale,
      permissions,
      expiresAt: (payload.exp ?? 0) * 1000,
    });
  } catch {
    return null;
  }
}

export async function setDashboardSession(
  res: Response,
  req: Request,
  identity: DashboardIdentity,
) {
  const token = await createDashboardSession(identity);
  res.cookie(DASHBOARD_SESSION_COOKIE, token, {
    ...getSessionCookieOptions(req),
    maxAge: SESSION_DURATION_SECONDS * 1000,
  });
}

export function clearDashboardSession(res: Response, req: Request) {
  res.clearCookie(DASHBOARD_SESSION_COOKIE, getSessionCookieOptions(req));
}
