import type { Request } from "express";
import {
  recordDashboardAccessEvent,
  type DashboardAccessEventType,
} from "./db";

export type DashboardAccessMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

function firstHeaderValue(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || null;
}

export function getDashboardAccessMetadata(req: Request): DashboardAccessMetadata {
  const forwardedIp = firstHeaderValue(req.headers["x-forwarded-for"]);
  const realIp = firstHeaderValue(req.headers["x-real-ip"]);
  const socketIp = req.ip || req.socket.remoteAddress || null;
  const ipAddress = (forwardedIp || realIp || socketIp)?.replace(/^::ffff:/, "").slice(0, 64) ?? null;
  const userAgent = firstHeaderValue(req.headers["user-agent"])?.slice(0, 512) ?? null;

  return { ipAddress, userAgent };
}

export async function recordDashboardAccessSafely(input: {
  req: Request;
  username: string;
  eventType: DashboardAccessEventType;
  accountId?: number | null;
}) {
  const metadata = getDashboardAccessMetadata(input.req);

  try {
    await recordDashboardAccessEvent({
      accountId: input.accountId ?? null,
      username: input.username,
      eventType: input.eventType,
      ...metadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.warn(`[Dashboard access audit] Não foi possível registrar ${input.eventType}: ${message}`);
  }
}
