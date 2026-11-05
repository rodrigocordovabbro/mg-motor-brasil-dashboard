import { COOKIE_NAME } from "@shared/const";
import {
  getDashboardCutoffDate,
  isIsoCalendarDate,
} from "@shared/dashboardDates";
import { MTD_RETAIL_ORDER_LABEL } from "@shared/dashboardLabels";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  authenticateDashboardCredentials,
  clearDashboardSession,
  type DashboardPermissions,
  isMgSalesReadOnlyUsername,
  readDashboardSession,
  setDashboardSession,
} from "./dashboardAuth";
import { recordDashboardAccessSafely } from "./dashboardAccessAudit";
import { loadDashboardData, MG_MOTORS_ACCOUNT_ID } from "./dashboardService";
import { loadGoogleAdsDeviceMix } from "./googleAdsDeviceService";
import {
  completeOptimizationTask,
  getOptimizationWorkspace,
  listDashboardAccessEvents,
  listOptimizationNegativeKeywords,
  OptimizationRecommendationInput,
  reopenOptimizationTask,
  rolloverOptimizationCycle,
  syncOptimizationFollowUps,
  syncRecommendationsToActiveCycle,
  upsertMonthlyBudgetGoal,
} from "./db";
import { buildOptimizationHistory } from "./optimizationHistory";
import { evaluateRecommendationCadence } from "./optimizationPolicy";
import { LeadCsvValidationError } from "./leadsCsv";
import {
  decodeDealerTargetsBase64,
  getDealerTargetsForCompetence,
  importDealerTargets,
  previewDealerTargets,
} from "./dealerTargetsService";
import {
  decodeLeadCsvBase64,
  getLeadImportHistory,
  importLeadCsv,
  previewLeadCsv,
} from "./leadsImportService";
import {
  getLeadAnalytics,
  getLeadDataBounds,
  getLeadMonthlyGoal,
  upsertLeadMonthlyGoal,
} from "./leadsService";
import { buildDailyWithMetaBase } from "./leadsAnalytics";
import { getMetaBaseLeadMetrics } from "./metaBaseLeadMetricsService";
import { exportLeadsBase } from "./leadsExportService";
import {
  applyAugustMetaBudget,
  buildLeadMediaInvestmentReference,
  getAugustMetaBudgetPlan,
  getAugustNetMediaPlan,
  loadPaidMediaInvestmentMeasurements,
} from "./leadMediaInvestmentService";
import { buildLeadGeographicCplReference } from "./leadGeographicCplService";
import { loadMetaCreativeInventory } from "./metaCreativeInventory";
import { getMetaAdsBounds, loadMetaAdsData } from "./metaAdsService";
import { getTikTokAdsBounds, loadTikTokAdsData } from "./tiktokAdsService";
import { getSocialOrganicBounds,
  loadSocialOrganicData,
} from "./socialOrganicService";
import {
  getFinanceiroAvailableMonths,
  getFinanceiroDashboard,
} from "./financeiroService";
import {
  getWeeklySalesImportHistory,
  getWeeklySalesMetrics,
  importWeeklySalesCsv,
  previewWeeklySalesCsv,
} from "./weeklySalesService";
import { decodeWeeklySalesBase64 } from "./weeklySalesUpload";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const dashboardProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await readDashboardSession(ctx.req);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida ou expirada" });
  }
  return next({ ctx: { ...ctx, dashboardSession: session } });
});

function createPermissionProcedure(permission: keyof DashboardPermissions) {
  return dashboardProcedure.use(({ ctx, next }) => {
    if (!ctx.dashboardSession.permissions[permission]) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não permitido para este usuário" });
    }
    return next({ ctx });
  });
}

const googleAdsProcedure = createPermissionProcedure("canAccessGoogleAds");
const metaAdsProcedure = createPermissionProcedure("canAccessMetaAds");
const tiktokAdsProcedure = createPermissionProcedure("canAccessMetaAds");
const socialOrganicProcedure = createPermissionProcedure("canAccessMetaAds");
const leadsProcedure = createPermissionProcedure("canAccessLeads");
const optimizationsProcedure = createPermissionProcedure("canAccessOptimizations");
const historyProcedure = createPermissionProcedure("canAccessHistory");
const importLeadsProcedure = createPermissionProcedure("canImportLeads");
const financeiroProcedure = createPermissionProcedure("canAccessFinanceiro");
const mutableLeadsProcedure = leadsProcedure.use(({ ctx, next }) => {
  if (isMgSalesReadOnlyUsername(ctx.dashboardSession.username)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este usuário possui acesso somente para visualização de Leads" });
  }
  return next({ ctx });
});
const accessHistoryProcedure = createPermissionProcedure("canAccessAccessHistory");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine(isIsoCalendarDate, "Data inválida");
const dashboardPeriodSchema = z
  .object({ dateFrom: dateSchema, dateTo: dateSchema })
  .superRefine((input, context) => {
    if (input.dateFrom > input.dateTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data inicial deve anteceder a data final",
        path: ["dateTo"],
      });
    }
    const cutoffDate = getDashboardCutoffDate();
    if (input.dateTo > cutoffDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A data final não pode ultrapassar D-1 (${cutoffDate})`,
        path: ["dateTo"],
      });
    }
  });
const socialOrganicPeriodSchema = dashboardPeriodSchema.and(
  z.object({ platform: z.enum(["instagram", "tiktok"]) }),
);
const leadsExportSchema = dashboardPeriodSchema.and(
  z.object({ locale: z.enum(["pt-BR", "en-US"]).default("pt-BR") }),
);

const leadCsvUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  base64: z.string().min(4).max(14_100_000, "O arquivo CSV excede o limite de 10 MB"),
  fallbackDate: dateSchema.optional(),
});

const competenceSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida");
const weeklySalesMetricsSchema = z
  .object({
    competence: competenceSchema,
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .superRefine((input, context) => {
    if (Boolean(input.dateFrom) !== Boolean(input.dateTo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe data inicial e final do período de Leads",
        path: input.dateFrom ? ["dateTo"] : ["dateFrom"],
      });
      return;
    }
    if (!input.dateFrom || !input.dateTo) return;
    if (input.dateFrom > input.dateTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data inicial deve anteceder a data final",
        path: ["dateTo"],
      });
    }
    if (
      !input.dateFrom.startsWith(`${input.competence}-`) ||
      !input.dateTo.startsWith(`${input.competence}-`)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `O período de Leads deve pertencer à competência de ${MTD_RETAIL_ORDER_LABEL}`,
        path: ["dateFrom"],
      });
    }
  });
const weeklySalesUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  base64: z.string().min(4).max(7_100_000, `O arquivo de ${MTD_RETAIL_ORDER_LABEL} excede o limite de 5 MB`),
  competence: competenceSchema,
  expectedFileHash: z.string().length(64).optional(),
});
const dealerTargetsUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  base64: z.string().min(4).max(7_100_000, "A planilha de metas excede o limite de 5 MB"),
  competence: competenceSchema,
  expectedFileHash: z.string().length(64).optional(),
});

async function mapWeeklySalesError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

async function mapLeadCsvError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LeadCsvValidationError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

function buildTaskSnapshot(
  data: Awaited<ReturnType<typeof loadDashboardData>>,
  campaignId: string,
): OptimizationRecommendationInput["snapshot"] | null {
  const campaign = data.campaigns.find(item => item.campaignId === campaignId);
  if (!campaign) return null;
  return {
    snapshotDate: data.daily.at(-1)?.date ?? data.period.dateTo,
    windowDateFrom: data.period.dateFrom,
    windowDateTo: data.period.dateTo,
    spend: campaign.spend,
    conversions: campaign.conversions,
    cpa: campaign.cpa,
    ctr: campaign.ctr,
    cpc: campaign.cpc,
    clicks: campaign.clicks,
    impressions: campaign.impressions,
    dailyBudget: campaign.budget || null,
    optimizationScore: campaign.optimizationScore,
    searchImpressionShare: campaign.searchImpressionShare,
  };
}

async function loadDashboardDataWithOptimizationPolicy(dateFrom: string, dateTo: string) {
  const [data, workspace] = await Promise.all([
    loadDashboardData(dateFrom, dateTo),
    getOptimizationWorkspace(),
  ]);
  const recommendationEligibility = evaluateRecommendationCadence({
    recommendations: data.recommendations.map(recommendation => ({
      ...recommendation,
      campaignName: recommendation.campaign,
    })),
    tasks: workspace.tasks,
  });
  return { ...data, recommendationEligibility };
}

function mapRecommendationToTask(
  data: Awaited<ReturnType<typeof loadDashboardData>>,
  sourceSignature: string,
): OptimizationRecommendationInput {
  const recommendation = data.recommendations.find(item => item.sourceSignature === sourceSignature);
  if (!recommendation) throw new TRPCError({ code: "NOT_FOUND", message: "Recomendação não encontrada no período" });
  const snapshot = buildTaskSnapshot(data, recommendation.campaignId);
  if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada no período" });
  return {
    sourceSignature: recommendation.sourceSignature,
    campaignId: recommendation.campaignId,
    campaignName: recommendation.campaign,
    region: recommendation.region,
    monthlyLeadGoal: recommendation.monthlyLeadGoal,
    actionType: recommendation.actionType,
    description: recommendation.description,
    rationale: recommendation.rationale,
    evidence: recommendation.evidence,
    steps: recommendation.steps,
    expectedImpact: recommendation.expectedImpact,
    risk: recommendation.risk,
    priority: recommendation.priority as OptimizationRecommendationInput["priority"],
    snapshot,
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboardAuth: router({
    session: publicProcedure.query(async ({ ctx }) => readDashboardSession(ctx.req)),
    login: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1).max(64),
          password: z.string().min(1).max(200),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const username = input.username.trim().toLocaleLowerCase("en-US");
        const identity = await authenticateDashboardCredentials(username, input.password);
        if (!identity) {
          await recordDashboardAccessSafely({
            req: ctx.req,
            username,
            eventType: "LOGIN_FAILURE",
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }
        await setDashboardSession(ctx.res, ctx.req, identity);
        await recordDashboardAccessSafely({
          req: ctx.req,
          username: identity.username,
          accountId: identity.accountId,
          eventType: "LOGIN_SUCCESS",
        });
        return { success: true as const, ...identity };
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const session = await readDashboardSession(ctx.req);
      clearDashboardSession(ctx.res, ctx.req);
      if (session) {
        await recordDashboardAccessSafely({
          req: ctx.req,
          username: session.username,
          accountId: session.accountId,
          eventType: "LOGOUT",
        });
      }
      return { success: true } as const;
    }),
  }),
  financeiro: router({
    months: financeiroProcedure.query(() => getFinanceiroAvailableMonths()),
    dashboard: financeiroProcedure
      .input(z.object({ competence: competenceSchema }))
      .query(({ input }) => getFinanceiroDashboard(input.competence)),
  }),
  accessHistory: router({
    list: accessHistoryProcedure
      .input(
        z.object({
          page: z.number().int().min(1).max(100_000).default(1),
          pageSize: z.number().int().min(10).max(100).default(50),
          username: z.string().trim().max(64).optional(),
          eventType: z.enum(["LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT"]).optional(),
          occurredFrom: z.number().int().nonnegative().optional(),
          occurredTo: z.number().int().nonnegative().optional(),
        }),
      )
      .query(({ input }) => listDashboardAccessEvents(input)),
  }),
  leads: router({
    bounds: leadsProcedure.query(() => getLeadDataBounds()),
    analytics: leadsProcedure
      .input(dashboardPeriodSchema)
      .query(async ({ ctx, input }) => {
        const canAccessPaidMedia =
          ctx.dashboardSession.permissions.canAccessGoogleAds &&
          ctx.dashboardSession.permissions.canAccessMetaAds;
        const [analytics, metaBaseLeads, measurements, dealerTargets] = await Promise.all([
          getLeadAnalytics(input),
          getMetaBaseLeadMetrics(input.dateFrom, input.dateTo),
          canAccessPaidMedia
            ? loadPaidMediaInvestmentMeasurements(input.dateFrom, input.dateTo)
            : Promise.resolve(null),
          canAccessPaidMedia
            ? getDealerTargetsForCompetence(input.dateTo.slice(0, 7))
            : Promise.resolve(null),
        ]);
        const metaBudgetPlan = getAugustMetaBudgetPlan(analytics.dateFrom, analytics.dateTo);
        const netMediaPlan = getAugustNetMediaPlan(analytics.dateFrom, analytics.dateTo);
        const effectiveMeasurements = measurements
          ? applyAugustMetaBudget(measurements, metaBudgetPlan)
          : null;
        const mediaInvestment = effectiveMeasurements
          ? buildLeadMediaInvestmentReference({
              dateFrom: analytics.dateFrom,
              dateTo: analytics.dateTo,
              channelLeads: analytics.channels,
              measurements: effectiveMeasurements,
              metaBudgetPlan,
              netMediaPlan,
            })
          : null;
        const geographicCpl = effectiveMeasurements && dealerTargets?.length
          ? buildLeadGeographicCplReference({
              dateFrom: analytics.dateFrom,
              dateTo: analytics.dateTo,
              competence: input.dateTo.slice(0, 7),
              dealerAudit: analytics.dealerAudit,
              dealerTargets,
              measurements: effectiveMeasurements,
              metaBudgetPlan,
            })
          : null;
        return {
          ...analytics,
          dailyMetaBase: {
            ...buildDailyWithMetaBase(analytics.daily, metaBaseLeads.daily),
            source: metaBaseLeads.source,
            sourceLabel: metaBaseLeads.sourceLabel,
            dateField: metaBaseLeads.dateField,
            timeZone: metaBaseLeads.timeZone,
            dataThroughDate: metaBaseLeads.dataThroughDate,
            refreshedAt: metaBaseLeads.refreshedAt,
          },
          mediaInvestment,
          geographicCpl,
        };
      }),
    exportBase: mutableLeadsProcedure
      .input(leadsExportSchema)
      .mutation(({ input }) => exportLeadsBase(input)),
    monthlyGoal: leadsProcedure
      .input(z.object({ competence: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida") }))
      .query(({ input }) => getLeadMonthlyGoal(input.competence)),
    updateMonthlyGoal: mutableLeadsProcedure
      .input(
        z.object({
          competence: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
          goalCount: z.number().int().positive().max(100_000_000),
        }),
      )
      .mutation(({ ctx, input }) =>
        upsertLeadMonthlyGoal({ ...input, actor: ctx.dashboardSession.username }),
      ),
    importHistory: leadsProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
      .query(({ input }) => getLeadImportHistory(input?.limit ?? 20)),
    previewCsv: importLeadsProcedure.input(leadCsvUploadSchema).mutation(({ input }) =>
      mapLeadCsvError(() =>
        previewLeadCsv({
          fileName: input.fileName,
          bytes: decodeLeadCsvBase64(input.base64),
          fallbackDate: input.fallbackDate,
        }),
      ),
    ),
    importCsv: importLeadsProcedure.input(leadCsvUploadSchema).mutation(({ ctx, input }) =>
      mapLeadCsvError(() =>
        importLeadCsv({
          fileName: input.fileName,
          bytes: decodeLeadCsvBase64(input.base64),
          actor: ctx.dashboardSession.username,
          fallbackDate: input.fallbackDate,
        }),
      ),
    ),
    weeklySalesMetrics: leadsProcedure
      .input(weeklySalesMetricsSchema)
      .query(({ input }) =>
        getWeeklySalesMetrics(input.competence, {
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        }),
      ),
    weeklySalesImportHistory: importLeadsProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
      .query(({ input }) => getWeeklySalesImportHistory(input?.limit ?? 20)),
    previewWeeklySalesCsv: importLeadsProcedure
      .input(weeklySalesUploadSchema.omit({ expectedFileHash: true }))
      .mutation(({ input }) =>
        mapWeeklySalesError(() => {
          const upload = decodeWeeklySalesBase64(input.base64);
          return previewWeeklySalesCsv({
            fileName: input.fileName,
            bytes: upload.bytes,
            declaredMimeType: upload.declaredMimeType,
            competence: input.competence,
          });
        }),
      ),
    importWeeklySalesCsv: importLeadsProcedure
      .input(weeklySalesUploadSchema)
      .mutation(({ ctx, input }) =>
        mapWeeklySalesError(() => {
          const upload = decodeWeeklySalesBase64(input.base64);
          return importWeeklySalesCsv({
            fileName: input.fileName,
            bytes: upload.bytes,
            declaredMimeType: upload.declaredMimeType,
            competence: input.competence,
            expectedFileHash: input.expectedFileHash,
            actor: ctx.dashboardSession.username,
          });
        }),
      ),
    previewDealerTargets: importLeadsProcedure
      .input(dealerTargetsUploadSchema.omit({ expectedFileHash: true }))
      .mutation(({ input }) =>
        mapWeeklySalesError(() =>
          previewDealerTargets({
            fileName: input.fileName,
            bytes: decodeDealerTargetsBase64(input.base64),
            competence: input.competence,
          }),
        ),
      ),
    importDealerTargets: importLeadsProcedure
      .input(dealerTargetsUploadSchema)
      .mutation(({ ctx, input }) =>
        mapWeeklySalesError(() =>
          importDealerTargets({
            fileName: input.fileName,
            bytes: decodeDealerTargetsBase64(input.base64),
            competence: input.competence,
            expectedFileHash: input.expectedFileHash,
            actor: ctx.dashboardSession.username,
          }),
        ),
      ),
  }),
  metaAds: router({
    bounds: metaAdsProcedure.query(() => getMetaAdsBounds()),
    data: metaAdsProcedure
      .input(dashboardPeriodSchema)
      .query(async ({ input }) => {
        const [media, baseLeads] = await Promise.all([
          loadMetaAdsData(input.dateFrom, input.dateTo),
          getMetaBaseLeadMetrics(input.dateFrom, input.dateTo),
        ]);
        return { ...media, baseLeads };
      }),
    creativeInventory: metaAdsProcedure.query(() => loadMetaCreativeInventory()),
  }),
  tiktokAds: router({
    bounds: tiktokAdsProcedure.query(() => getTikTokAdsBounds()),
    data: tiktokAdsProcedure
      .input(dashboardPeriodSchema)
      .query(({ input }) => loadTikTokAdsData(input.dateFrom, input.dateTo)),
    refresh: tiktokAdsProcedure
      .input(dashboardPeriodSchema)
      .mutation(({ input }) =>
        loadTikTokAdsData(input.dateFrom, input.dateTo, { forceRefresh: true }),
      ),
  }),
  socialOrganic: router({
    bounds: socialOrganicProcedure.query(() => getSocialOrganicBounds()),
    data: socialOrganicProcedure
      .input(socialOrganicPeriodSchema)
      .query(({ input }) =>
        loadSocialOrganicData(input.platform, input.dateFrom, input.dateTo),
      ),
    refresh: socialOrganicProcedure
      .input(socialOrganicPeriodSchema)
      .mutation(({ input }) =>
        loadSocialOrganicData(input.platform, input.dateFrom, input.dateTo, {
          forceRefresh: true,
        }),
      ),
  }),
  dashboard: router({
    getData: googleAdsProcedure
      .input(dashboardPeriodSchema)
      .query(({ input }) => loadDashboardDataWithOptimizationPolicy(input.dateFrom, input.dateTo)),
    deviceMix: googleAdsProcedure
      .input(dashboardPeriodSchema)
      .query(({ input }) => loadGoogleAdsDeviceMix(input.dateFrom, input.dateTo)),
    updateMonthlyBudgetGoal: googleAdsProcedure
      .input(
        z.object({
          competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
          amount: z.number().finite().positive().max(100_000_000),
        }),
      )
      .mutation(({ ctx, input }) =>
        upsertMonthlyBudgetGoal({
          accountId: MG_MOTORS_ACCOUNT_ID,
          competencia: input.competencia,
          amount: input.amount,
          actor: ctx.dashboardSession.username,
        }),
      ),
    optimizationWorkspace: optimizationsProcedure.query(() => getOptimizationWorkspace()),
    optimizationHistory: historyProcedure.query(async () =>
      buildOptimizationHistory(await getOptimizationWorkspace()),
    ),
    negativeKeywordHistory: historyProcedure
      .input(
        z
          .object({
            campaignId: z.string().trim().max(64).optional(),
            search: z.string().trim().max(120).optional(),
            dateFrom: dateSchema.optional(),
            dateTo: dateSchema.optional(),
            limit: z.number().int().min(1).max(1_000).default(250),
          })
          .optional(),
      )
      .query(({ input }) => listOptimizationNegativeKeywords(input)),
    captureOptimizationFollowUps: historyProcedure
      .input(dashboardPeriodSchema)
      .mutation(async ({ input }) => {
        const workspace = await getOptimizationWorkspace();
        const data = await loadDashboardData(input.dateFrom, input.dateTo);
        const eligibleTasks = workspace.tasks.filter(task => {
          if (task.status !== "COMPLETED" || !task.completedAt) return false;
          const completedDate = new Date(task.completedAt).toISOString().slice(0, 10);
          return input.dateFrom > completedDate;
        });
        const snapshots = eligibleTasks.flatMap(task => {
          const snapshot = buildTaskSnapshot(data, task.campaignId);
          return snapshot
            ? [{ ...snapshot, taskId: task.id, campaignId: task.campaignId, campaignName: task.campaignName }]
            : [];
        });
        const result = await syncOptimizationFollowUps({ snapshots });
        return {
          ...result,
          eligibleTaskCount: eligibleTasks.length,
          unavailableCampaignCount: eligibleTasks.length - snapshots.length,
        } as const;
      }),
    createOptimizationTask: optimizationsProcedure
      .input(dashboardPeriodSchema.and(z.object({ sourceSignature: z.string().min(3).max(255) })))
      .mutation(async ({ ctx, input }) => {
        const data = await loadDashboardData(input.dateFrom, input.dateTo);
        const recommendation = mapRecommendationToTask(data, input.sourceSignature);
        return syncRecommendationsToActiveCycle({
          recommendations: [recommendation],
          actor: ctx.dashboardSession.username,
        });
      }),
    createAllOptimizationTasks: optimizationsProcedure
      .input(dashboardPeriodSchema)
      .mutation(async ({ ctx, input }) => {
        const data = await loadDashboardData(input.dateFrom, input.dateTo);
        return syncRecommendationsToActiveCycle({
          recommendations: data.recommendations.map(recommendation =>
            mapRecommendationToTask(data, recommendation.sourceSignature),
          ),
          actor: ctx.dashboardSession.username,
        });
      }),
    completeOptimizationTask: optimizationsProcedure
      .input(
        dashboardPeriodSchema.and(
          z.object({
            taskId: z.number().int().positive(),
            notes: z.string().trim().max(4_000).optional().default(""),
            negativeKeywords: z
              .array(
                z.object({
                  term: z.string().trim().min(1).max(500),
                  matchType: z.enum(["BROAD", "PHRASE", "EXACT"]),
                }),
              )
              .max(200)
              .optional()
              .default([]),
          }),
        ),
      )
      .mutation(async ({ ctx, input }) => {
        const workspace = await getOptimizationWorkspace();
        const task = workspace.tasks.find(item => item.id === input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada" });
        const data = await loadDashboardData(input.dateFrom, input.dateTo);
        const snapshot = buildTaskSnapshot(data, task.campaignId);
        return completeOptimizationTask({
          taskId: task.id,
          notes: input.notes,
          actor: ctx.dashboardSession.username,
          accountId: MG_MOTORS_ACCOUNT_ID,
          negativeKeywords: input.negativeKeywords,
          snapshot: snapshot ? { ...snapshot, campaignId: task.campaignId, campaignName: task.campaignName } : null,
        });
      }),
    rolloverOptimizationCycle: optimizationsProcedure
      .input(dashboardPeriodSchema)
      .mutation(async ({ ctx, input }) => {
        const data = await loadDashboardData(input.dateFrom, input.dateTo);
        const campaignSnapshots = data.campaigns.flatMap(campaign => {
          const snapshot = buildTaskSnapshot(data, campaign.campaignId);
          return snapshot
            ? [{ ...snapshot, campaignId: campaign.campaignId, campaignName: campaign.campaign }]
            : [];
        });
        return rolloverOptimizationCycle({
          actor: ctx.dashboardSession.username,
          recommendations: data.recommendations.map(recommendation =>
            mapRecommendationToTask(data, recommendation.sourceSignature),
          ),
          campaignSnapshots,
        });
      }),
    reopenOptimizationTask: optimizationsProcedure
      .input(dashboardPeriodSchema.and(z.object({ taskId: z.number().int().positive() })))
      .mutation(async ({ ctx, input }) => {
        const workspace = await getOptimizationWorkspace();
        const task = workspace.tasks.find(item => item.id === input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada" });
        const data = await loadDashboardData(input.dateFrom, input.dateTo);
        const snapshot = buildTaskSnapshot(data, task.campaignId);
        return reopenOptimizationTask({
          taskId: task.id,
          actor: ctx.dashboardSession.username,
          snapshot: snapshot ? { ...snapshot, campaignId: task.campaignId, campaignName: task.campaignName } : null,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
