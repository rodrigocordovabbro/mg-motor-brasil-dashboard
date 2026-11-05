import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { loginV2, logoutV2, readV2Session } from "./v2Auth";
import { getV2Dashboard } from "./v2Leads";
import { saveV2Goal } from "./v2Db";
import { MEDIA_PLANS } from "./mediaPlans";
import {
  getDashboardCutoffDate,
  isIsoCalendarDate,
} from "../shared/dashboardDates";

const date = z.string().refine(isIsoCalendarDate, "Data inválida");
const filters = z
  .object({
    dateFrom: date,
    dateTo: date,
    model: z.string().max(250).optional(),
    channel: z.string().max(100).optional(),
    campaign: z.string().max(500).optional(),
    dealer: z.string().max(250).optional(),
    search: z.string().max(200).optional(),
    page: z.number().int().min(1).max(10000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom > value.dateTo)
      ctx.addIssue({
        code: "custom",
        message: "Data inicial deve anteceder a final",
        path: ["dateFrom"],
      });
    if (value.dateTo > getDashboardCutoffDate())
      ctx.addIssue({
        code: "custom",
        message: "A data final não pode ultrapassar ontem (D-1)",
        path: ["dateTo"],
      });
    const length =
      (Date.parse(value.dateTo) - Date.parse(value.dateFrom)) /
      (24 * 60 * 60 * 1000);
    if (length > 1095)
      ctx.addIssue({
        code: "custom",
        message: "Selecione um período de até três anos",
        path: ["dateFrom"],
      });
  });
const v2Procedure = publicProcedure.use(async ({ ctx, next }) => {
  const identity = await readV2Session(ctx.req);
  if (!identity)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Faça login para acessar a V2",
    });
  ctx.res.setHeader("Cache-Control", "private, no-store");
  return next({ ctx: { ...ctx, v2User: identity } });
});
export const appRouter = router({
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      ctx.res.setHeader("Cache-Control", "private, no-store");
      const identity = await readV2Session(ctx.req);
      return identity
        ? { ...identity, name: identity.username, email: null }
        : null;
    }),
    login: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1).max(64),
          password: z.string().min(1).max(200),
        })
      )
      .mutation(({ ctx, input }) =>
        loginV2(ctx.req, ctx.res, input.username, input.password)
      ),
    logout: publicProcedure.mutation(({ ctx }) => logoutV2(ctx.req, ctx.res)),
  }),
  mediaPlan: router({ plans: v2Procedure.query(() => MEDIA_PLANS) }),
  leads: router({
    dashboard: v2Procedure
      .input(filters)
      .query(({ input }) => getV2Dashboard(input)),
    updateGoal: v2Procedure
      .input(
        z.object({
          competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          goal: z.number().int().min(1).max(10000000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await saveV2Goal(input.competence, input.goal, ctx.v2User.id);
        return { success: true as const };
      }),
  }),
});
export type AppRouter = typeof appRouter;
