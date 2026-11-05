import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};
// V2 uses its explicit username/password session in the feature middleware.
// No Manus/OAuth/Bearer identity can bypass that session.
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return { req: opts.req, res: opts.res, user: null };
}
