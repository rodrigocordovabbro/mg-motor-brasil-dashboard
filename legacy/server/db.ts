import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  campaignGoals,
  dashboardAccessEvents,
  dashboardAccounts,
  dashboardDataSnapshots,
  dashboardSourceRefreshes,
  InsertDashboardAccessEvent,
  InsertDashboardAccount,
  InsertUser,
  optimizationCycles,
  optimizationNegativeKeywords,
  optimizationTasks,
  performanceSnapshots,
  taskCompletions,
  taskEvents,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  normalizeNegativeKeywordTerm,
  type NegativeKeywordMatchType,
} from "../shared/negativeKeywords";
import {
  eligibleRecommendations,
  evaluateTaskExecutionCadence,
  normalizeNegativeKeywordTaskSteps,
  optimizationDedupKey,
  uniqueOptimizationItems,
} from "./optimizationPolicy";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getDashboardAccountByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const normalizedUsername = username.trim().toLocaleLowerCase("en-US");
  const result = await db
    .select()
    .from(dashboardAccounts)
    .where(eq(dashboardAccounts.username, normalizedUsername))
    .limit(1);

  return result[0];
}

export async function createDashboardAccount(input: InsertDashboardAccount) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const now = Date.now();
  await db.insert(dashboardAccounts).values({
    ...input,
    username: input.username.trim().toLocaleLowerCase("en-US"),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  return getDashboardAccountByUsername(input.username);
}

export async function updateDashboardAccountLastSignIn(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const now = Date.now();
  await db
    .update(dashboardAccounts)
    .set({ lastSignedInAt: now, updatedAt: now })
    .where(eq(dashboardAccounts.id, id));
}

export type DashboardAccessEventType = "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT";

export async function recordDashboardAccessEvent(
  input: Omit<InsertDashboardAccessEvent, "id" | "occurredAt"> & { occurredAt?: number },
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.insert(dashboardAccessEvents).values({
    ...input,
    username: input.username.trim().toLocaleLowerCase("en-US").slice(0, 64) || "unknown",
    ipAddress: input.ipAddress?.slice(0, 64) ?? null,
    userAgent: input.userAgent?.slice(0, 512) ?? null,
    occurredAt: input.occurredAt ?? Date.now(),
  });
}

export async function listDashboardAccessEvents(input: {
  page: number;
  pageSize: number;
  username?: string;
  eventType?: DashboardAccessEventType;
  occurredFrom?: number;
  occurredTo?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const conditions = [];
  const normalizedUsername = input.username?.trim().toLocaleLowerCase("en-US");
  if (normalizedUsername) conditions.push(like(dashboardAccessEvents.username, `%${normalizedUsername}%`));
  if (input.eventType) conditions.push(eq(dashboardAccessEvents.eventType, input.eventType));
  if (input.occurredFrom != null) conditions.push(gte(dashboardAccessEvents.occurredAt, input.occurredFrom));
  if (input.occurredTo != null) conditions.push(lte(dashboardAccessEvents.occurredAt, input.occurredTo));
  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (input.page - 1) * input.pageSize;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: dashboardAccessEvents.id,
        accountId: dashboardAccessEvents.accountId,
        username: dashboardAccessEvents.username,
        eventType: dashboardAccessEvents.eventType,
        ipAddress: dashboardAccessEvents.ipAddress,
        userAgent: dashboardAccessEvents.userAgent,
        occurredAt: dashboardAccessEvents.occurredAt,
      })
      .from(dashboardAccessEvents)
      .where(where)
      .orderBy(desc(dashboardAccessEvents.occurredAt), desc(dashboardAccessEvents.id))
      .limit(input.pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)` })
      .from(dashboardAccessEvents)
      .where(where),
  ]);

  const total = Number(totalRows[0]?.total ?? 0);
  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export type DashboardRefreshSource = "GOOGLE_ADS" | "META_ADS" | "TIKTOK_ADS";

type DashboardRefreshMetadata = Record<string, number | string | boolean | null>;

export async function recordDashboardSourceRefresh(input: {
  source: DashboardRefreshSource;
  refreshDate: string;
  periodFrom: string;
  periodTo: string;
  status: "SUCCESS" | "FAILED";
  attemptedAt: number;
  taskUid?: string | null;
  liveSource?: string | null;
  metadata?: DashboardRefreshMetadata;
  error?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const succeeded = input.status === "SUCCESS";
  const successMetadata = succeeded ? (input.metadata ?? {}) : {};
  const values = {
    source: input.source,
    refreshDate: input.refreshDate,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    lastAttemptStatus: input.status,
    attemptCount: 1,
    lastAttemptAt: input.attemptedAt,
    lastSuccessAt: succeeded ? input.attemptedAt : null,
    lastSuccessSource: succeeded ? (input.liveSource ?? null) : null,
    lastSuccessMetadata: successMetadata,
    lastError: input.error ?? null,
    taskUid: input.taskUid ?? null,
    createdAt: input.attemptedAt,
    updatedAt: input.attemptedAt,
  } as const;

  const updateSet: Record<string, unknown> = {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    lastAttemptStatus: input.status,
    attemptCount: sql`${dashboardSourceRefreshes.attemptCount} + 1`,
    lastAttemptAt: input.attemptedAt,
    lastError: input.error ?? null,
    taskUid: input.taskUid ?? null,
    updatedAt: input.attemptedAt,
  };

  if (succeeded) {
    updateSet.lastSuccessAt = input.attemptedAt;
    updateSet.lastSuccessSource = input.liveSource ?? null;
    updateSet.lastSuccessMetadata = successMetadata;
  }

  await db.insert(dashboardSourceRefreshes).values(values).onDuplicateKeyUpdate({
    set: updateSet,
  });

  const [record] = await db
    .select()
    .from(dashboardSourceRefreshes)
    .where(
      and(
        eq(dashboardSourceRefreshes.source, input.source),
        eq(dashboardSourceRefreshes.refreshDate, input.refreshDate),
      ),
    )
    .limit(1);

  return record;
}

export async function getDashboardSourceRefresh(
  source: DashboardRefreshSource,
  refreshDate: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [record] = await db
    .select()
    .from(dashboardSourceRefreshes)
    .where(
      and(
        eq(dashboardSourceRefreshes.source, source),
        eq(dashboardSourceRefreshes.refreshDate, refreshDate),
      ),
    )
    .limit(1);
  return record;
}

function parseDashboardSnapshotPayload<T>(payload: unknown): T | null {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  }
  if (payload && typeof payload === "object") return payload as T;
  return null;
}

export async function getDashboardDataSnapshot<T>(input: {
  source: DashboardRefreshSource;
  periodFrom: string;
  periodTo: string;
}) {
  const db = await getDb();
  if (!db) return undefined;

  const [record] = await db
    .select()
    .from(dashboardDataSnapshots)
    .where(
      and(
        eq(dashboardDataSnapshots.source, input.source),
        eq(dashboardDataSnapshots.periodFrom, input.periodFrom),
        eq(dashboardDataSnapshots.periodTo, input.periodTo),
      ),
    )
    .limit(1);
  if (!record) return undefined;

  const payload = parseDashboardSnapshotPayload<T>(record.payload);
  return payload == null ? undefined : { ...record, payload };
}

export async function getLatestDashboardDataSnapshot<T>(input: {
  source: DashboardRefreshSource;
  periodFrom: string;
  periodTo: string;
}) {
  const db = await getDb();
  if (!db) return undefined;

  const records = await db
    .select()
    .from(dashboardDataSnapshots)
    .where(
      and(
        eq(dashboardDataSnapshots.source, input.source),
        lte(dashboardDataSnapshots.periodFrom, input.periodFrom),
        gte(dashboardDataSnapshots.dataThroughDate, input.periodFrom),
        lte(dashboardDataSnapshots.dataThroughDate, input.periodTo),
      ),
    )
    .orderBy(
      desc(dashboardDataSnapshots.dataThroughDate),
      desc(dashboardDataSnapshots.refreshedAt),
      desc(dashboardDataSnapshots.id),
    )
    .limit(1);
  const record = records[0];
  if (!record) return undefined;

  const payload = parseDashboardSnapshotPayload<T>(record.payload);
  return payload == null ? undefined : { ...record, payload };
}

export async function upsertDashboardDataSnapshot(input: {
  source: DashboardRefreshSource;
  periodFrom: string;
  periodTo: string;
  dataThroughDate: string;
  sourceName: string;
  payload: unknown;
  refreshedAt?: number;
}) {
  const db = await getDb();
  if (!db) return undefined;

  const now = input.refreshedAt ?? Date.now();
  const payload = input.payload as Record<string, unknown>;
  await db
    .insert(dashboardDataSnapshots)
    .values({
      source: input.source,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      dataThroughDate: input.dataThroughDate,
      sourceName: input.sourceName,
      payload,
      refreshedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        dataThroughDate: input.dataThroughDate,
        sourceName: input.sourceName,
        payload,
        refreshedAt: now,
        updatedAt: now,
      },
    });

  return getDashboardDataSnapshot({
    source: input.source,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
  });
}

export async function getCampaignGoals(accountId: string, competencia: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db
    .select()
    .from(campaignGoals)
    .where(
      and(
        eq(campaignGoals.accountId, accountId),
        eq(campaignGoals.competencia, competencia),
        eq(campaignGoals.isActive, true),
      ),
    )
    .orderBy(asc(campaignGoals.goalType), asc(campaignGoals.scopeKey));
}

export async function upsertMonthlyBudgetGoal(input: {
  accountId: string;
  competencia: string;
  amount: number;
  actor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();
  const amount = input.amount.toFixed(2);

  await db
    .insert(campaignGoals)
    .values({
      accountId: input.accountId,
      competencia: input.competencia,
      goalType: "MEDIA_BUDGET",
      scopeKey: "ACCOUNT",
      monthlyBudgetGoal: amount,
      isActive: true,
      createdBy: input.actor,
      updatedBy: input.actor,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        monthlyBudgetGoal: amount,
        isActive: true,
        updatedBy: input.actor,
        updatedAt: now,
      },
    });

  const rows = await getCampaignGoals(input.accountId, input.competencia);
  return rows.find(goal => goal.goalType === "MEDIA_BUDGET" && goal.scopeKey === "ACCOUNT");
}

export type OptimizationRecommendationInput = {
  sourceSignature: string;
  campaignId: string;
  campaignName: string;
  region: string | null;
  monthlyLeadGoal: number | null;
  actionType: string;
  description: string;
  rationale: string;
  evidence: Record<string, number | string | boolean | null>;
  steps: string[];
  expectedImpact: string;
  risk: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  snapshot: {
    snapshotDate: string;
    windowDateFrom: string;
    windowDateTo: string;
    spend: number;
    conversions: number;
    cpa: number;
    ctr: number;
    cpc: number;
    clicks: number;
    impressions: number;
    dailyBudget: number | null;
    optimizationScore: number | null;
    searchImpressionShare: number | null;
  };
};

export type TaskPerformanceSnapshotInput = OptimizationRecommendationInput["snapshot"] & {
  campaignId: string;
  campaignName: string;
};

export async function getOptimizationWorkspace() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const cycles = await db.select().from(optimizationCycles).orderBy(desc(optimizationCycles.cycleNumber));
  const tasks = await db
    .select()
    .from(optimizationTasks)
    .orderBy(desc(optimizationTasks.createdAt), asc(optimizationTasks.priority));
  const taskIds = tasks.map(task => task.id);
  const events = taskIds.length
    ? await db.select().from(taskEvents).where(inArray(taskEvents.taskId, taskIds)).orderBy(desc(taskEvents.createdAt))
    : [];
  const completions = taskIds.length
    ? await db
        .select()
        .from(taskCompletions)
        .where(inArray(taskCompletions.taskId, taskIds))
        .orderBy(desc(taskCompletions.completedAt))
    : [];
  const snapshots = taskIds.length
    ? await db
        .select()
        .from(performanceSnapshots)
        .where(inArray(performanceSnapshots.taskId, taskIds))
        .orderBy(desc(performanceSnapshots.createdAt))
    : [];

  const activeCycle = cycles.find(cycle => cycle.status === "ACTIVE") ?? null;
  const taskExecutionEligibility = activeCycle
    ? evaluateTaskExecutionCadence({ tasks, activeCycleId: activeCycle.id })
    : [];

  return {
    activeCycle,
    cycles,
    tasks: tasks.map(task =>
      task.status === "COMPLETED"
        ? task
        : { ...task, steps: normalizeNegativeKeywordTaskSteps(task.steps) },
    ),
    events,
    completions,
    snapshots,
    taskExecutionEligibility,
  };
}

export async function syncRecommendationsToActiveCycle(input: {
  recommendations: OptimizationRecommendationInput[];
  actor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  return db.transaction(async tx => {
    let [activeCycle] = await tx
      .select()
      .from(optimizationCycles)
      .where(eq(optimizationCycles.status, "ACTIVE"))
      .orderBy(desc(optimizationCycles.cycleNumber))
      .limit(1);

    if (!activeCycle) {
      const [latestCycle] = await tx
        .select({ cycleNumber: optimizationCycles.cycleNumber })
        .from(optimizationCycles)
        .orderBy(desc(optimizationCycles.cycleNumber))
        .limit(1);
      const cycleNumber = (latestCycle?.cycleNumber ?? 0) + 1;
      await tx.insert(optimizationCycles).values({
        cycleNumber,
        name: `Ciclo ${cycleNumber}`,
        startDate: today,
        status: "ACTIVE",
        createdBy: input.actor,
        createdAt: now,
        updatedAt: now,
      });
      [activeCycle] = await tx
        .select()
        .from(optimizationCycles)
        .where(eq(optimizationCycles.cycleNumber, cycleNumber))
        .limit(1);
    }

    if (!activeCycle) throw new Error("Não foi possível criar o ciclo ativo");

    const existing = await tx
      .select()
      .from(optimizationTasks)
      .where(eq(optimizationTasks.cycleId, activeCycle.id));
    const uniqueIncoming = uniqueOptimizationItems(input.recommendations);
    const campaignIds = Array.from(new Set(uniqueIncoming.map(item => item.campaignId)));
    const historicalTasks = campaignIds.length
      ? await tx
          .select()
          .from(optimizationTasks)
          .where(inArray(optimizationTasks.campaignId, campaignIds))
      : [];
    const eligibleIncoming = eligibleRecommendations({
      recommendations: uniqueIncoming,
      tasks: historicalTasks,
      now,
    });
    const existingKeys = new Set(existing.map(item => optimizationDedupKey(item)));
    const missing = eligibleIncoming.filter(item => !existingKeys.has(optimizationDedupKey(item)));

    if (missing.length) {
      await tx.insert(optimizationTasks).values(
        missing.map(item => ({
          cycleId: activeCycle.id,
          campaignId: item.campaignId,
          campaignName: item.campaignName,
          region: item.region,
          monthlyLeadGoal: item.monthlyLeadGoal,
          actionType: item.actionType,
          description: item.description,
          rationale: item.rationale,
          evidence: item.evidence,
          steps: item.steps,
          expectedImpact: item.expectedImpact,
          risk: item.risk,
          priority: item.priority,
          status: "PENDING" as const,
          sourceSignature: item.sourceSignature,
          createdBy: input.actor,
          createdAt: now,
          updatedAt: now,
        })),
      );

      const createdTasks = await tx
        .select()
        .from(optimizationTasks)
        .where(
          and(
            eq(optimizationTasks.cycleId, activeCycle.id),
            inArray(
              optimizationTasks.sourceSignature,
              missing.map(item => item.sourceSignature),
            ),
          ),
        );
      const recommendationBySignature = new Map(missing.map(item => [item.sourceSignature, item]));

      await tx.insert(taskEvents).values(
        createdTasks.map(task => ({
          taskId: task.id,
          cycleId: activeCycle.id,
          eventType: "CREATED" as const,
          actor: input.actor,
          notes: "Tarefa criada a partir de recomendação baseada nos dados reais do período selecionado.",
          metadata: { sourceSignature: task.sourceSignature },
          createdAt: now,
        })),
      );

      await tx.insert(performanceSnapshots).values(
        createdTasks.map(task => {
          const recommendation = recommendationBySignature.get(task.sourceSignature)!;
          const snapshot = recommendation.snapshot;
          return {
            cycleId: activeCycle.id,
            taskId: task.id,
            campaignId: task.campaignId,
            campaignName: task.campaignName,
            snapshotType: "TASK_CREATED" as const,
            snapshotDate: snapshot.snapshotDate,
            windowDateFrom: snapshot.windowDateFrom,
            windowDateTo: snapshot.windowDateTo,
            spend: snapshot.spend.toFixed(4),
            conversions: snapshot.conversions.toFixed(4),
            cpa: snapshot.cpa.toFixed(4),
            ctr: snapshot.ctr.toFixed(6),
            cpc: snapshot.cpc.toFixed(4),
            clicks: snapshot.clicks.toFixed(2),
            impressions: snapshot.impressions.toFixed(2),
            dailyBudget: snapshot.dailyBudget == null ? null : snapshot.dailyBudget.toFixed(4),
            optimizationScore:
              snapshot.optimizationScore == null ? null : snapshot.optimizationScore.toFixed(6),
            searchImpressionShare:
              snapshot.searchImpressionShare == null ? null : snapshot.searchImpressionShare.toFixed(6),
            createdAt: now,
          };
        }),
      );
    }

    return { activeCycle, createdCount: missing.length, skippedCount: input.recommendations.length - missing.length };
  });
}

async function getTaskForUpdate(
  tx: Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0],
  taskId: number,
) {
  const [task] = await tx.select().from(optimizationTasks).where(eq(optimizationTasks.id, taskId)).limit(1);
  if (!task) throw new Error("Tarefa não encontrada");
  return task;
}

function formatCooldownDate(timestamp: number) {
  const [year, month, day] = new Date(timestamp).toISOString().slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

async function assertOptimizationTaskExecutable(
  tx: Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0],
  task: typeof optimizationTasks.$inferSelect,
  now: number,
) {
  const [cycle] = await tx
    .select({ status: optimizationCycles.status })
    .from(optimizationCycles)
    .where(eq(optimizationCycles.id, task.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "ACTIVE") {
    throw new Error("Somente tarefas do ciclo ativo podem ser executadas");
  }

  const campaignTasks = await tx
    .select()
    .from(optimizationTasks)
    .where(eq(optimizationTasks.campaignId, task.campaignId));
  const eligibility = evaluateTaskExecutionCadence({
    tasks: campaignTasks,
    activeCycleId: task.cycleId,
    now,
  }).find(item => item.taskId === task.id);
  if (!eligibility || eligibility.eligible) return;

  if (eligibility.status === "COOLDOWN" && eligibility.nextEligibleAt) {
    throw new Error(
      `Esta otimização de CPA está em observação. Aguarde até ${formatCooldownDate(eligibility.nextEligibleAt)} para executar uma nova alteração.`,
    );
  }
  throw new Error(eligibility.reason ?? "Esta tarefa foi consolidada e não pode ser executada separadamente");
}

export async function assignOptimizationTask(input: { taskId: number; assignee: string; actor: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();
  return db.transaction(async tx => {
    const task = await getTaskForUpdate(tx, input.taskId);
    if (task.status === "COMPLETED") throw new Error("Tarefa concluída não pode ser reatribuída");
    await tx
      .update(optimizationTasks)
      .set({ assignee: input.assignee, updatedAt: now })
      .where(eq(optimizationTasks.id, task.id));
    await tx.insert(taskEvents).values({
      taskId: task.id,
      cycleId: task.cycleId,
      eventType: "ASSIGNED",
      actor: input.actor,
      notes: `Responsável definido como ${input.assignee}.`,
      metadata: { assignee: input.assignee },
      createdAt: now,
    });
    return { success: true } as const;
  });
}

export async function startOptimizationTask(input: { taskId: number; actor: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();
  return db.transaction(async tx => {
    const task = await getTaskForUpdate(tx, input.taskId);
    if (task.status === "COMPLETED") throw new Error("Tarefa concluída não pode ser iniciada");
    await assertOptimizationTaskExecutable(tx, task, now);
    if (!task.assignee?.trim()) throw new Error("Defina um responsável antes de iniciar a tarefa");
    if (task.status === "IN_PROGRESS") return { success: true } as const;
    await tx
      .update(optimizationTasks)
      .set({ status: "IN_PROGRESS", startedAt: task.startedAt ?? now, updatedAt: now })
      .where(eq(optimizationTasks.id, task.id));
    await tx.insert(taskEvents).values({
      taskId: task.id,
      cycleId: task.cycleId,
      eventType: "STARTED",
      actor: input.actor,
      notes: "Execução iniciada.",
      createdAt: now,
    });
    return { success: true } as const;
  });
}

export async function completeOptimizationTask(input: {
  taskId: number;
  notes?: string;
  actor: string;
  snapshot: TaskPerformanceSnapshotInput | null;
  accountId?: string;
  negativeKeywords?: Array<{ term: string; matchType: NegativeKeywordMatchType }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const notes = input.notes?.trim() ?? "";
  const now = Date.now();
  return db.transaction(async tx => {
    const task = await getTaskForUpdate(tx, input.taskId);
    if (task.status === "COMPLETED") throw new Error("Tarefa já concluída");
    await assertOptimizationTaskExecutable(tx, task, now);
    await tx
      .update(optimizationTasks)
      .set({
        status: "COMPLETED",
        assignee: input.actor,
        startedAt: task.startedAt ?? now,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(optimizationTasks.id, task.id));
    await tx.insert(taskCompletions).values({
      taskId: task.id,
      completedBy: input.actor,
      completedAt: now,
      notes,
    });
    await tx.insert(taskEvents).values({
      taskId: task.id,
      cycleId: task.cycleId,
      eventType: "COMPLETED",
      actor: input.actor,
      notes: notes || null,
      createdAt: now,
    });
    const uniqueNegatives = new Map<string, { term: string; normalizedTerm: string; matchType: NegativeKeywordMatchType }>();
    for (const negative of input.negativeKeywords ?? []) {
      const term = negative.term.trim().replace(/\s+/g, " ");
      const normalizedTerm = normalizeNegativeKeywordTerm(term);
      if (!normalizedTerm) continue;
      const key = `${normalizedTerm}::${negative.matchType}`;
      if (!uniqueNegatives.has(key)) uniqueNegatives.set(key, { term, normalizedTerm, matchType: negative.matchType });
    }
    if (uniqueNegatives.size) {
      await tx.insert(optimizationNegativeKeywords).values(
        Array.from(uniqueNegatives.values()).map(negative => ({
          taskId: task.id,
          cycleId: task.cycleId,
          accountId: input.accountId ?? "unknown",
          campaignId: task.campaignId,
          campaignName: task.campaignName,
          term: negative.term,
          normalizedTerm: negative.normalizedTerm,
          matchType: negative.matchType,
          origin: "TASK_COMPLETION" as const,
          appliedBy: input.actor,
          appliedAt: now,
          createdAt: now,
        })),
      );
    }
    if (input.snapshot) {
      const snapshot = input.snapshot;
      await tx.insert(performanceSnapshots).values({
        cycleId: task.cycleId,
        taskId: task.id,
        campaignId: task.campaignId,
        campaignName: task.campaignName,
        snapshotType: "TASK_COMPLETED",
        snapshotDate: snapshot.snapshotDate,
        windowDateFrom: snapshot.windowDateFrom,
        windowDateTo: snapshot.windowDateTo,
        spend: snapshot.spend.toFixed(4),
        conversions: snapshot.conversions.toFixed(4),
        cpa: snapshot.cpa.toFixed(4),
        ctr: snapshot.ctr.toFixed(6),
        cpc: snapshot.cpc.toFixed(4),
        clicks: snapshot.clicks.toFixed(2),
        impressions: snapshot.impressions.toFixed(2),
        dailyBudget: snapshot.dailyBudget == null ? null : snapshot.dailyBudget.toFixed(4),
        optimizationScore: snapshot.optimizationScore == null ? null : snapshot.optimizationScore.toFixed(6),
        searchImpressionShare:
          snapshot.searchImpressionShare == null ? null : snapshot.searchImpressionShare.toFixed(6),
        createdAt: now,
      });
    }
    return { success: true, negativeKeywordsRecorded: uniqueNegatives.size } as const;
  });
}

export async function listOptimizationNegativeKeywords(input?: {
  campaignId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const conditions = [];
  if (input?.campaignId?.trim()) conditions.push(eq(optimizationNegativeKeywords.campaignId, input.campaignId.trim()));
  if (input?.search?.trim()) {
    const search = `%${input.search.trim()}%`;
    conditions.push(
      or(
        like(optimizationNegativeKeywords.term, search),
        like(optimizationNegativeKeywords.campaignName, search),
        like(optimizationNegativeKeywords.appliedBy, search),
      )!,
    );
  }
  if (input?.dateFrom) {
    conditions.push(gte(optimizationNegativeKeywords.appliedAt, Date.parse(`${input.dateFrom}T00:00:00.000Z`)));
  }
  if (input?.dateTo) {
    conditions.push(lte(optimizationNegativeKeywords.appliedAt, Date.parse(`${input.dateTo}T23:59:59.999Z`)));
  }

  return db
    .select()
    .from(optimizationNegativeKeywords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(optimizationNegativeKeywords.appliedAt), desc(optimizationNegativeKeywords.id))
    .limit(Math.min(Math.max(input?.limit ?? 250, 1), 1_000));
}


type OptimizationTransaction = Parameters<
  Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]
>[0];

function snapshotInsertValues(input: {
  cycleId: number;
  taskId: number;
  snapshotType: "CYCLE_START" | "TASK_CREATED" | "TASK_COMPLETED" | "FOLLOW_UP";
  snapshot: TaskPerformanceSnapshotInput;
  createdAt: number;
}) {
  return {
    cycleId: input.cycleId,
    taskId: input.taskId,
    campaignId: input.snapshot.campaignId,
    campaignName: input.snapshot.campaignName,
    snapshotType: input.snapshotType,
    snapshotDate: input.snapshot.snapshotDate,
    windowDateFrom: input.snapshot.windowDateFrom,
    windowDateTo: input.snapshot.windowDateTo,
    spend: input.snapshot.spend.toFixed(4),
    conversions: input.snapshot.conversions.toFixed(4),
    cpa: input.snapshot.cpa.toFixed(4),
    ctr: input.snapshot.ctr.toFixed(6),
    cpc: input.snapshot.cpc.toFixed(4),
    clicks: input.snapshot.clicks.toFixed(2),
    impressions: input.snapshot.impressions.toFixed(2),
    dailyBudget: input.snapshot.dailyBudget == null ? null : input.snapshot.dailyBudget.toFixed(4),
    optimizationScore:
      input.snapshot.optimizationScore == null ? null : input.snapshot.optimizationScore.toFixed(6),
    searchImpressionShare:
      input.snapshot.searchImpressionShare == null
        ? null
        : input.snapshot.searchImpressionShare.toFixed(6),
    createdAt: input.createdAt,
  };
}

export type RolloverOptimizationCycleInput = {
  actor: string;
  recommendations: OptimizationRecommendationInput[];
  campaignSnapshots: TaskPerformanceSnapshotInput[];
  now?: number;
};

export async function rolloverOptimizationCycleInTransaction(
  tx: OptimizationTransaction,
  input: RolloverOptimizationCycleInput,
) {
  const now = input.now ?? Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const [activeCycle] = await tx
    .select()
    .from(optimizationCycles)
    .where(eq(optimizationCycles.status, "ACTIVE"))
    .orderBy(desc(optimizationCycles.cycleNumber))
    .limit(1);
  if (!activeCycle) throw new Error("Não há ciclo ativo para encerrar");

  const [latestCycle] = await tx
    .select({ cycleNumber: optimizationCycles.cycleNumber })
    .from(optimizationCycles)
    .orderBy(desc(optimizationCycles.cycleNumber))
    .limit(1);
  const nextCycleNumber = (latestCycle?.cycleNumber ?? activeCycle.cycleNumber) + 1;

  await tx
    .update(optimizationCycles)
    .set({ status: "CLOSED", endDate: today, closedBy: input.actor, closedAt: now, updatedAt: now })
    .where(eq(optimizationCycles.id, activeCycle.id));
  await tx.insert(optimizationCycles).values({
    cycleNumber: nextCycleNumber,
    name: `Ciclo ${nextCycleNumber}`,
    startDate: today,
    status: "ACTIVE",
    carriedFromCycleId: activeCycle.id,
    createdBy: input.actor,
    createdAt: now,
    updatedAt: now,
  });

  const [newCycle] = await tx
    .select()
    .from(optimizationCycles)
    .where(eq(optimizationCycles.cycleNumber, nextCycleNumber))
    .limit(1);
  if (!newCycle) throw new Error("Não foi possível criar o novo ciclo");

  const pendingTasks = await tx
    .select()
    .from(optimizationTasks)
    .where(
      and(
        eq(optimizationTasks.cycleId, activeCycle.id),
        inArray(optimizationTasks.status, ["PENDING", "IN_PROGRESS", "REOPENED"]),
      ),
    );
  const uniquePendingByKey = new Map<string, (typeof pendingTasks)[number]>();
  for (const task of [...pendingTasks].sort((left, right) => left.createdAt - right.createdAt)) {
    const key = optimizationDedupKey(task);
    if (!uniquePendingByKey.has(key)) uniquePendingByKey.set(key, task);
  }
  const pendingToTransfer = Array.from(uniquePendingByKey.values());

  if (pendingToTransfer.length) {
    await tx.insert(optimizationTasks).values(
      pendingToTransfer.map(task => ({
        cycleId: newCycle.id,
        campaignId: task.campaignId,
        campaignName: task.campaignName,
        region: task.region,
        monthlyLeadGoal: task.monthlyLeadGoal,
        actionType: task.actionType,
        description: task.description,
        rationale: task.rationale,
        evidence: task.evidence,
        steps: task.steps,
        expectedImpact: task.expectedImpact,
        risk: task.risk,
        priority: task.priority,
        status: "PENDING" as const,
        sourceSignature: task.sourceSignature,
        sourceTaskId: task.id,
        createdBy: task.createdBy,
        assignee: task.assignee,
        createdAt: task.createdAt,
        updatedAt: now,
      })),
    );
  }

  const transferredTasks = pendingToTransfer.length
    ? await tx
        .select()
        .from(optimizationTasks)
        .where(
          and(
            eq(optimizationTasks.cycleId, newCycle.id),
            inArray(
              optimizationTasks.sourceSignature,
              pendingToTransfer.map(task => task.sourceSignature),
            ),
          ),
        )
    : [];
  const transferredBySignature = new Map(transferredTasks.map(task => [task.sourceSignature, task]));

  if (pendingToTransfer.length) {
    await tx.insert(taskEvents).values(
      pendingToTransfer.flatMap(sourceTask => {
        const targetTask = transferredBySignature.get(sourceTask.sourceSignature);
        if (!targetTask) return [];
        return [
          {
            taskId: sourceTask.id,
            cycleId: activeCycle.id,
            eventType: "TRANSFERRED_OUT" as const,
            actor: input.actor,
            notes: `Pendência transferida para ${newCycle.name}.`,
            metadata: {
              fromCycleId: activeCycle.id,
              toCycleId: newCycle.id,
              targetTaskId: targetTask.id,
            } as Record<string, number | string | boolean | null>,
            createdAt: now,
          },
          {
            taskId: targetTask.id,
            cycleId: newCycle.id,
            eventType: "TRANSFERRED_IN" as const,
            actor: input.actor,
            notes: `Pendência herdada de ${activeCycle.name}.`,
            metadata: {
              fromCycleId: activeCycle.id,
              toCycleId: newCycle.id,
              sourceTaskId: sourceTask.id,
            } as Record<string, number | string | boolean | null>,
            createdAt: now,
          },
        ];
      }),
    );
  }

  const snapshotByCampaign = new Map(input.campaignSnapshots.map(snapshot => [snapshot.campaignId, snapshot]));
  const transferredSnapshotValues = transferredTasks.flatMap(task => {
    const snapshot = snapshotByCampaign.get(task.campaignId);
    return snapshot
      ? [snapshotInsertValues({ cycleId: newCycle.id, taskId: task.id, snapshotType: "CYCLE_START", snapshot, createdAt: now })]
      : [];
  });
  if (transferredSnapshotValues.length) await tx.insert(performanceSnapshots).values(transferredSnapshotValues);

  const uniqueRecommendations = uniqueOptimizationItems(input.recommendations);
  const recommendationCampaignIds = Array.from(new Set(uniqueRecommendations.map(item => item.campaignId)));
  const historicalTasks = recommendationCampaignIds.length
    ? await tx
        .select()
        .from(optimizationTasks)
        .where(inArray(optimizationTasks.campaignId, recommendationCampaignIds))
    : [];
  const eligibleIncoming = eligibleRecommendations({
    recommendations: uniqueRecommendations,
    tasks: historicalTasks,
    now,
  });
  const keysInNewCycle = new Set(transferredTasks.map(task => optimizationDedupKey(task)));
  const recommendationsToCreate = eligibleIncoming.filter(
    item => !keysInNewCycle.has(optimizationDedupKey(item)),
  );

  if (recommendationsToCreate.length) {
    await tx.insert(optimizationTasks).values(
      recommendationsToCreate.map(item => ({
        cycleId: newCycle.id,
        campaignId: item.campaignId,
        campaignName: item.campaignName,
        region: item.region,
        monthlyLeadGoal: item.monthlyLeadGoal,
        actionType: item.actionType,
        description: item.description,
        rationale: item.rationale,
        evidence: item.evidence,
        steps: item.steps,
        expectedImpact: item.expectedImpact,
        risk: item.risk,
        priority: item.priority,
        status: "PENDING" as const,
        sourceSignature: item.sourceSignature,
        createdBy: input.actor,
        createdAt: now,
        updatedAt: now,
      })),
    );

    const createdRecommendationTasks = await tx
      .select()
      .from(optimizationTasks)
      .where(
        and(
          eq(optimizationTasks.cycleId, newCycle.id),
          inArray(
            optimizationTasks.sourceSignature,
            recommendationsToCreate.map(item => item.sourceSignature),
          ),
        ),
      );
    const recommendationBySignature = new Map(
      recommendationsToCreate.map(item => [item.sourceSignature, item]),
    );
    await tx.insert(taskEvents).values(
      createdRecommendationTasks.map(task => ({
        taskId: task.id,
        cycleId: newCycle.id,
        eventType: "CREATED" as const,
        actor: input.actor,
        notes: "Nova tarefa sugerida pelos dados reais no início do ciclo.",
        metadata: { sourceSignature: task.sourceSignature },
        createdAt: now,
      })),
    );
    await tx.insert(performanceSnapshots).values(
      createdRecommendationTasks.map(task => {
        const recommendation = recommendationBySignature.get(task.sourceSignature)!;
        return snapshotInsertValues({
          cycleId: newCycle.id,
          taskId: task.id,
          snapshotType: "TASK_CREATED",
          snapshot: { ...recommendation.snapshot, campaignId: task.campaignId, campaignName: task.campaignName },
          createdAt: now,
        });
      }),
    );
  }

  return {
    previousCycle: activeCycle,
    newCycle,
    transferredCount: transferredTasks.length,
    recommendationCreatedCount: recommendationsToCreate.length,
    recommendationSkippedCount: input.recommendations.length - recommendationsToCreate.length,
  };
}

export async function rolloverOptimizationCycle(input: RolloverOptimizationCycleInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(tx => rolloverOptimizationCycleInTransaction(tx, input));
}

export type ReopenOptimizationTaskInput = {
  taskId: number;
  actor: string;
  snapshot: TaskPerformanceSnapshotInput | null;
  now?: number;
};

export async function reopenOptimizationTaskInTransaction(
  tx: OptimizationTransaction,
  input: ReopenOptimizationTaskInput,
) {
  const now = input.now ?? Date.now();
  const sourceTask = await getTaskForUpdate(tx, input.taskId);
  if (sourceTask.status !== "COMPLETED") throw new Error("Somente tarefas concluídas podem ser reabertas");

  const [activeCycle] = await tx
    .select()
    .from(optimizationCycles)
    .where(eq(optimizationCycles.status, "ACTIVE"))
    .orderBy(desc(optimizationCycles.cycleNumber))
    .limit(1);
  if (!activeCycle) throw new Error("Não há ciclo ativo para receber a tarefa reaberta");

  const activeTasks = await tx
    .select()
    .from(optimizationTasks)
    .where(eq(optimizationTasks.cycleId, activeCycle.id));
  const equivalentOpenTask = activeTasks.find(
    task =>
      task.campaignId === sourceTask.campaignId &&
      task.actionType === sourceTask.actionType &&
      task.status !== "COMPLETED",
  );
  if (equivalentOpenTask) return { created: false, task: equivalentOpenTask, activeCycle };

  const sourceSignature = `${sourceTask.sourceSignature}:reopen:${sourceTask.id}`;
  await tx.insert(optimizationTasks).values({
    cycleId: activeCycle.id,
    campaignId: sourceTask.campaignId,
    campaignName: sourceTask.campaignName,
    region: sourceTask.region,
    monthlyLeadGoal: sourceTask.monthlyLeadGoal,
    actionType: sourceTask.actionType,
    description: sourceTask.description,
    rationale: sourceTask.rationale,
    evidence: sourceTask.evidence,
    steps: sourceTask.steps,
    expectedImpact: sourceTask.expectedImpact,
    risk: sourceTask.risk,
    priority: sourceTask.priority,
    status: "REOPENED",
    sourceSignature,
    sourceTaskId: sourceTask.id,
    createdBy: input.actor,
    assignee: sourceTask.assignee,
    createdAt: now,
    updatedAt: now,
  });
  const [reopenedTask] = await tx
    .select()
    .from(optimizationTasks)
    .where(and(eq(optimizationTasks.cycleId, activeCycle.id), eq(optimizationTasks.sourceSignature, sourceSignature)))
    .limit(1);
  if (!reopenedTask) throw new Error("Não foi possível reabrir a tarefa");

  await tx.insert(taskEvents).values([
    {
      taskId: sourceTask.id,
      cycleId: sourceTask.cycleId,
      eventType: "REOPENED",
      actor: input.actor,
      notes: `Tarefa reaberta como #${reopenedTask.id} em ${activeCycle.name}.`,
      metadata: { sourceTaskId: sourceTask.id, reopenedTaskId: reopenedTask.id, toCycleId: activeCycle.id },
      createdAt: now,
    },
    {
      taskId: reopenedTask.id,
      cycleId: activeCycle.id,
      eventType: "REOPENED",
      actor: input.actor,
      notes: `Reaberta a partir da tarefa #${sourceTask.id}.`,
      metadata: { sourceTaskId: sourceTask.id, fromCycleId: sourceTask.cycleId },
      createdAt: now,
    },
  ]);
  if (input.snapshot) {
    await tx.insert(performanceSnapshots).values(
      snapshotInsertValues({
        cycleId: activeCycle.id,
        taskId: reopenedTask.id,
        snapshotType: "CYCLE_START",
        snapshot: input.snapshot,
        createdAt: now,
      }),
    );
  }

  return { created: true, task: reopenedTask, activeCycle };
}

export async function reopenOptimizationTask(input: ReopenOptimizationTaskInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(tx => reopenOptimizationTaskInTransaction(tx, input));
}

export type OptimizationFollowUpInput = TaskPerformanceSnapshotInput & {
  taskId: number;
};

export async function syncOptimizationFollowUpsInTransaction(
  tx: OptimizationTransaction,
  input: { snapshots: OptimizationFollowUpInput[]; now?: number },
) {
  const uniqueByIdentity = new Map(
    input.snapshots.map(snapshot => [
      `${snapshot.taskId}:${snapshot.windowDateFrom}:${snapshot.windowDateTo}`,
      snapshot,
    ]),
  );
  const uniqueSnapshots = Array.from(uniqueByIdentity.values());
  if (!uniqueSnapshots.length) return { createdCount: 0, skippedCount: 0 } as const;

  const taskIds = uniqueSnapshots.map(snapshot => snapshot.taskId);
  const completedTasks = await tx
    .select()
    .from(optimizationTasks)
    .where(
      and(
        inArray(optimizationTasks.id, taskIds),
        eq(optimizationTasks.status, "COMPLETED"),
      ),
    );
  const completedById = new Map(completedTasks.map(task => [task.id, task]));
  const existingFollowUps = await tx
    .select()
    .from(performanceSnapshots)
    .where(
      and(
        inArray(performanceSnapshots.taskId, taskIds),
        eq(performanceSnapshots.snapshotType, "FOLLOW_UP"),
      ),
    );
  const existingIdentities = new Set(
    existingFollowUps.map(snapshot =>
      `${snapshot.taskId}:${snapshot.windowDateFrom}:${snapshot.windowDateTo}`,
    ),
  );

  const snapshotsToCreate = uniqueSnapshots.filter(snapshot => {
    const identity = `${snapshot.taskId}:${snapshot.windowDateFrom}:${snapshot.windowDateTo}`;
    return completedById.has(snapshot.taskId) && !existingIdentities.has(identity);
  });

  if (snapshotsToCreate.length) {
    await tx.insert(performanceSnapshots).values(
      snapshotsToCreate.map(snapshot => {
        const task = completedById.get(snapshot.taskId)!;
        return snapshotInsertValues({
          cycleId: task.cycleId,
          taskId: task.id,
          snapshotType: "FOLLOW_UP",
          snapshot: {
            ...snapshot,
            campaignId: task.campaignId,
            campaignName: task.campaignName,
          },
          createdAt: input.now ?? Date.now(),
        });
      }),
    );
  }

  return {
    createdCount: snapshotsToCreate.length,
    skippedCount: uniqueSnapshots.length - snapshotsToCreate.length,
  } as const;
}

export async function syncOptimizationFollowUps(input: { snapshots: OptimizationFollowUpInput[] }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(tx => syncOptimizationFollowUpsInTransaction(tx, input));
}
