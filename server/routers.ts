import {
  readPlansWithProjections,
  readMediaPlanProjections,
  updateMediaPlanProjections,
} from "./v2MediaPlanProjections";
import { getV2SalesTotalGoal, saveV2SalesTotalGoal } from "./v2SalesGoal";
import {
  previewCommercialUpload,
  previewCombinedGoalsUpload,
  commitCombinedGoalsUpload,
  commitCommercialUpload,
  readCommercialStatus,
  removeCommercialSource,
} from "./v2Commercial";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { loginV2, logoutV2, readV2Session } from "./v2Auth";
import { getV2Dashboard } from "./v2Leads";
import { exportV2LeadsCSV } from "./v2LeadsExport";
import {
  syncLeadsFromGoogle,
  getLeadsSyncConnectionStatus,
  LeadsSyncError,
} from "./v2LeadsSync";
import { getV2Goal, saveV2Goal } from "./v2Db";
import {
  requireAdministrator,
  requireManualValidator,
  dashboardForClient,
  dispatchForClient,
  controlForCRM,
  genericClientDataError,
} from "./v2Permissions";
import {
  listV2Accounts,
  createV2Account,
  updateV2Account,
  resetV2AccountPassword,
} from "./v2Accounts";
import { MAX_GOAL } from "../shared/v2Goals";
import {
  listDispatchReports,
  getDispatchReport,
  setDispatchManual,
  getDispatchHistory,
} from "./v2Dispatch";
import { getLeadControl, prepareLeadControl } from "./v2DispatchLeads";
import { prepareDispatchDay } from "./v2DispatchDaily";
import { importDispatchWorkbook } from "./v2DispatchXlsx";
import {
  getDashboardCutoffDate,
  isIsoCalendarDate,
} from "../shared/dashboardDates";

const date = z.string().refine(isIsoCalendarDate, "Data inválida");
const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
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
const commercialUpload = z.object({
  kind: z.enum(["lead-goals", "sales-goals", "sales"]),
  competence,
  asOf: date.optional(),
  sourceWeek: z.number().int().min(1).max(6).optional(),
  fileName: z.string().min(1).max(255),
  base64: z.string().min(1).max(1400000),
});
const combinedGoalsUpload = z.object({
  competence,
  fileName: z.string().min(1).max(255),
  base64: z.string().min(1).max(1400000),
});
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,64}$/,
    "Use 3 a 64 letras, números, pontos, traços ou sublinhados."
  );
const password = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres.")
  .max(200);
const role = z.enum(["admin", "client", "bbro"]);
const v2Procedure = publicProcedure.use(async ({ ctx, next }) => {
  const identity = await readV2Session(ctx.req);
  if (!identity)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Faça login para acessar o MG Motor Brasil",
    });
  ctx.res.setHeader("Cache-Control", "private, no-store");
  return next({ ctx: { ...ctx, v2User: identity } });
});
const adminProcedure = v2Procedure.use(({ ctx, next }) => {
  requireAdministrator(ctx.v2User);
  return next({ ctx });
});
const manualProcedure = v2Procedure.use(({ ctx, next }) => {
  requireManualValidator(ctx.v2User);
  return next({ ctx });
});
const ownerProcedure = adminProcedure.use(({ ctx, next }) => {
  if (ctx.v2User.username !== "rodrigo")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Controle exclusivo da conta Rodrigo.",
    });
  return next({ ctx });
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
  accounts: router({
    list: adminProcedure.query(({ ctx }) => listV2Accounts(ctx.v2User)),
    create: adminProcedure
      .input(z.object({ username, password, role }))
      .mutation(({ ctx, input }) => createV2Account(input, ctx.v2User)),
    update: adminProcedure
      .input(
        z
          .object({
            id: z.number().int().positive(),
            role: role.optional(),
            isActive: z.boolean().optional(),
          })
          .refine(
            value => value.role !== undefined || value.isActive !== undefined,
            "Informe uma alteração."
          )
      )
      .mutation(({ ctx, input }) => updateV2Account(input, ctx.v2User)),
    resetPassword: adminProcedure
      .input(z.object({ id: z.number().int().positive(), password }))
      .mutation(({ ctx, input }) => resetV2AccountPassword(input, ctx.v2User)),
  }),
  mediaPlan: router({
    plans: v2Procedure.query(async ({ ctx }) => {
      try {
        return await readPlansWithProjections();
      } catch (error) {
        if (ctx.v2User.role !== "admin") genericClientDataError();
        throw error;
      }
    }),
    projections: ownerProcedure
      .input(z.object({ monthId: competence }))
      .query(({ input }) => readMediaPlanProjections(input.monthId)),
    updateProjections: ownerProcedure
      .input(
        z.object({
          monthId: competence,
          expectedVersion: z.number().int().nonnegative(),
          values: z
            .object({
              globalLeads: z
                .number()
                .int()
                .min(0)
                .max(10_000_000)
                .nullable()
                .optional(),
              products: z
                .record(
                  z.string().max(191),
                  z.number().int().min(0).max(10_000_000).nullable()
                )
                .optional(),
              rows: z
                .record(
                  z.string().max(191),
                  z.number().int().min(0).max(10_000_000).nullable()
                )
                .optional(),
            })
            .refine(
              values =>
                values.globalLeads !== undefined ||
                Object.keys(values.products ?? {}).length > 0 ||
                Object.keys(values.rows ?? {}).length > 0,
              "Informe uma projeção."
            ),
        })
      )
      .mutation(({ ctx, input }) =>
        updateMediaPlanProjections(input, ctx.v2User)
      ),
  }),
  dispatch: router({
    reports: v2Procedure.query(async ({ ctx }) => {
      const data = await listDispatchReports();
      return ctx.v2User.role === "admin"
        ? data
        : data.map(row => ({
            ...row,
            fileName: "Controle por dealer",
            title: "Lojas & CRM",
          }));
    }),
    report: adminProcedure
      .input(z.object({ reportId: z.number().int().positive() }))
      .query(({ input }) => getDispatchReport(input.reportId)),
    leadControl: v2Procedure
      .input(z.object({ reportId: z.number().int().positive(), filters }))
      .query(async ({ ctx, input }) => {
        try {
          const data = controlForCRM(
            await getLeadControl(input.reportId, input.filters)
          );
          return ctx.v2User.role === "admin" ? data : dispatchForClient(data);
        } catch (error) {
          if (ctx.v2User.role !== "admin") genericClientDataError();
          throw error;
        }
      }),
    setManual: manualProcedure
      .input(
        z.object({
          cellId: z.number().int().positive(),
          isOk: z.boolean(),
          expectedVersion: z.number().int().min(0),
        })
      )
      .mutation(({ ctx, input }) =>
        setDispatchManual(
          input.cellId,
          input.isOk,
          input.expectedVersion,
          ctx.v2User
        )
      ),
    history: manualProcedure
      .input(z.object({ cellId: z.number().int().positive() }))
      .query(({ ctx, input }) => getDispatchHistory(input.cellId, ctx.v2User)),
    prepareDay: adminProcedure
      .input(z.object({ reportId: z.number().int().positive() }))
      .mutation(({ input }) => prepareDispatchDay(input.reportId)),
    prepareLeadControl: manualProcedure
      .input(z.object({ reportId: z.number().int().positive(), filters }))
      .mutation(({ ctx, input }) =>
        ctx.v2User.role === "bbro"
          ? prepareLeadControl(input.reportId, input.filters, undefined, true)
          : prepareLeadControl(input.reportId, input.filters)
      ),
    importWorkbook: adminProcedure
      .input(
        z.object({
          reportId: z.number().int().positive(),
          fileName: z.string().min(1).max(255),
          base64: z.string().min(1).max(1400000),
        })
      )
      .mutation(({ ctx, input }) =>
        importDispatchWorkbook(
          input.reportId,
          input.fileName,
          input.base64,
          ctx.v2User
        )
      ),
  }),
  commercial: router({
    status: adminProcedure
      .input(z.object({ competence }))
      .query(({ input }) => readCommercialStatus(input.competence)),
    previewGoals: adminProcedure
      .input(combinedGoalsUpload)
      .mutation(({ input }) => previewCombinedGoalsUpload(input)),
    commitGoals: adminProcedure
      .input(
        combinedGoalsUpload.extend({
          mappings: z
            .record(z.string(), z.array(z.string().max(250)).max(500))
            .optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        commitCombinedGoalsUpload(input, ctx.v2User)
      ),
    preview: adminProcedure
      .input(commercialUpload)
      .mutation(({ input }) => previewCommercialUpload(input)),
    commit: adminProcedure
      .input(
        commercialUpload.extend({
          mappings: z
            .record(z.string(), z.array(z.string().max(250)).max(500))
            .optional(),
        })
      )
      .mutation(({ ctx, input }) => commitCommercialUpload(input, ctx.v2User)),
    remove: adminProcedure
      .input(
        z.object({
          kind: z.enum(["lead-goals", "sales-goals", "sales"]),
          competence,
          expectedImportId: z.number().int().positive(),
        })
      )
      .mutation(({ ctx, input }) => removeCommercialSource(input, ctx.v2User)),
  }),
  leads: router({
    syncConnection: adminProcedure.query(() => getLeadsSyncConnectionStatus()),
    syncBase: adminProcedure.mutation(async ({ ctx }) => {
      try {
        return await syncLeadsFromGoogle(ctx.v2User);
      } catch (error) {
        if (error instanceof LeadsSyncError)
          throw new TRPCError({
            code:
              error.code === "PRECONDITION_FAILED"
                ? "PRECONDITION_FAILED"
                : error.code === "INVALID_SOURCE"
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",
            message:
              error.code === "PRECONDITION_FAILED"
                ? "Configure GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON e o acesso de Leitor à planilha-base."
                : "A sincronização não foi concluída. A base anterior foi preservada; confira a fonte e tente novamente.",
          });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Não foi possível atualizar a fonte. A base anterior foi preservada.",
        });
      }
    }),
    salesGoal: ownerProcedure
      .input(z.object({ competence }))
      .query(async ({ input }) => ({
        competence: input.competence,
        goal: await getV2SalesTotalGoal(input.competence),
      })),
    updateSalesGoal: ownerProcedure
      .input(
        z.object({ competence, goal: z.number().int().min(0).max(10_000_000) })
      )
      .mutation(({ input, ctx }) => saveV2SalesTotalGoal(input, ctx.v2User)),
    dashboard: v2Procedure.input(filters).query(async ({ ctx, input }) => {
      try {
        const data = await getV2Dashboard(input);
        return ctx.v2User.role === "admin" ? data : dashboardForClient(data);
      } catch (error) {
        if (ctx.v2User.role !== "admin") genericClientDataError();
        throw error;
      }
    }),
    exportCSV: v2Procedure
      .input(filters.and(z.object({ clientMode: z.boolean().optional() })))
      .mutation(async ({ ctx, input }) => {
        try {
          return await exportV2LeadsCSV(input, {
            groupStates: ctx.v2User.role !== "admin",
          });
        } catch (error) {
          if (ctx.v2User.role !== "admin") genericClientDataError();
          throw error;
        }
      }),
    goal: adminProcedure
      .input(z.object({ competence }))
      .query(async ({ input }) => ({
        competence: input.competence,
        goal: await getV2Goal(input.competence),
      })),
    updateGoal: adminProcedure
      .input(
        z.object({ competence, goal: z.number().int().min(1).max(MAX_GOAL) })
      )
      .mutation(async ({ ctx, input }) => {
        await saveV2Goal(input.competence, input.goal, ctx.v2User.id);
        return { success: true as const };
      }),
  }),
});
export type AppRouter = typeof appRouter;
