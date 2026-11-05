export const CPA_COOLDOWN_DAYS = 7;
export const CPA_COOLDOWN_MS = CPA_COOLDOWN_DAYS * 24 * 60 * 60 * 1_000;

export type OptimizationPolicyRecommendation = {
  campaignId: string;
  campaignName: string;
  actionType: string;
  sourceSignature: string;
  description?: string | null;
  evidence?: unknown;
};

export type OptimizationPolicyTask = {
  id: number;
  cycleId?: number;
  campaignId: string;
  campaignName: string;
  actionType: string;
  sourceSignature: string;
  status: string;
  createdAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  description?: string | null;
  evidence?: unknown;
};

export type OptimizationTaskExecutionEligibility = {
  taskId: number;
  campaignId: string;
  campaignName: string;
  actionFamily: "CPA" | string;
  status: "EXECUTABLE" | "COOLDOWN" | "LEGACY_DUPLICATE";
  eligible: boolean;
  daysRemaining: number;
  nextEligibleAt: number | null;
  blockingTaskId: number | null;
  lastCompletedAt: number | null;
  canonicalTaskId: number;
  duplicateCount: number;
  duplicateTaskIds: number[];
  reason: string | null;
};

export type OptimizationRecommendationEligibility = {
  sourceSignature: string;
  campaignId: string;
  campaignName: string;
  actionFamily: "CPA" | string;
  status: "ELIGIBLE" | "OPEN_TASK" | "COOLDOWN";
  eligible: boolean;
  daysRemaining: number;
  nextEligibleAt: number | null;
  blockingTaskId: number | null;
  blockingTaskCreatedAt: number | null;
  lastCompletedAt: number | null;
  reason: string | null;
};

function searchableEvidence(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function isCpaOptimization(item: Pick<OptimizationPolicyRecommendation, "actionType" | "description" | "evidence">) {
  if (item.actionType === "SET_TARGET_CPA" || item.actionType === "SWITCH_BIDDING_STRATEGY") return true;
  if (item.actionType !== "REVIEW_BIDDING") return false;
  return /\bCPA\b|CPA[- ]?alvo|CPA desejado/i.test(item.description ?? "")
    || /recommendedTargetCpa|targetCpa|TARGET_CPA|MAXIMIZE_CONVERSIONS/i.test(searchableEvidence(item.evidence));
}

export function optimizationActionFamily(
  item: Pick<OptimizationPolicyRecommendation, "actionType" | "description" | "evidence">,
) {
  return isCpaOptimization(item) ? "CPA" : item.actionType;
}

export function optimizationFamilyKey(
  item: Pick<OptimizationPolicyRecommendation, "campaignId" | "actionType" | "description" | "evidence">,
) {
  return `${item.campaignId}::${optimizationActionFamily(item)}`;
}

export function optimizationDedupKey(item: OptimizationPolicyRecommendation) {
  if (isCpaOptimization(item)) return optimizationFamilyKey(item);
  return `${optimizationFamilyKey(item)}::${item.sourceSignature}`;
}

export function uniqueOptimizationItems<T extends OptimizationPolicyRecommendation>(items: T[]) {
  const unique = new Map<string, T>();
  for (const item of items) {
    const key = optimizationDedupKey(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return Array.from(unique.values());
}

export function evaluateRecommendationCadence(input: {
  recommendations: OptimizationPolicyRecommendation[];
  tasks: OptimizationPolicyTask[];
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const openByFamily = new Map<string, OptimizationPolicyTask>();
  const completedByFamily = new Map<string, OptimizationPolicyTask>();

  const orderedTasks = [...input.tasks].sort((left, right) => {
    const leftDate = left.completedAt ?? left.createdAt;
    const rightDate = right.completedAt ?? right.createdAt;
    return rightDate - leftDate;
  });

  for (const task of orderedTasks) {
    if (!isCpaOptimization(task)) continue;
    const familyKey = optimizationFamilyKey(task);
    if (task.status !== "COMPLETED" && !openByFamily.has(familyKey)) openByFamily.set(familyKey, task);
    if (task.status === "COMPLETED" && task.completedAt && !completedByFamily.has(familyKey)) {
      completedByFamily.set(familyKey, task);
    }
  }

  return input.recommendations.map(recommendation => {
    const actionFamily = optimizationActionFamily(recommendation);
    if (actionFamily !== "CPA") {
      return {
        sourceSignature: recommendation.sourceSignature,
        campaignId: recommendation.campaignId,
        campaignName: recommendation.campaignName,
        actionFamily,
        status: "ELIGIBLE",
        eligible: true,
        daysRemaining: 0,
        nextEligibleAt: null,
        blockingTaskId: null,
        blockingTaskCreatedAt: null,
        lastCompletedAt: null,
        reason: null,
      } satisfies OptimizationRecommendationEligibility;
    }

    const familyKey = optimizationFamilyKey(recommendation);
    const openTask = openByFamily.get(familyKey);
    if (openTask) {
      return {
        sourceSignature: recommendation.sourceSignature,
        campaignId: recommendation.campaignId,
        campaignName: recommendation.campaignName,
        actionFamily,
        status: "OPEN_TASK",
        eligible: false,
        daysRemaining: 0,
        nextEligibleAt: null,
        blockingTaskId: openTask.id,
        blockingTaskCreatedAt: openTask.createdAt,
        lastCompletedAt: null,
        reason: "Já existe uma otimização de CPA pendente para esta campanha.",
      } satisfies OptimizationRecommendationEligibility;
    }

    const latestCompleted = completedByFamily.get(familyKey);
    if (latestCompleted?.completedAt) {
      const nextEligibleAt = latestCompleted.completedAt + CPA_COOLDOWN_MS;
      if (nextEligibleAt > now) {
        return {
          sourceSignature: recommendation.sourceSignature,
          campaignId: recommendation.campaignId,
          campaignName: recommendation.campaignName,
          actionFamily,
          status: "COOLDOWN",
          eligible: false,
          daysRemaining: Math.max(1, Math.ceil((nextEligibleAt - now) / (24 * 60 * 60 * 1_000))),
          nextEligibleAt,
          blockingTaskId: latestCompleted.id,
          blockingTaskCreatedAt: latestCompleted.createdAt,
          lastCompletedAt: latestCompleted.completedAt,
          reason: `Aguardar ${CPA_COOLDOWN_DAYS} dias corridos após a última otimização de CPA.`,
        } satisfies OptimizationRecommendationEligibility;
      }
    }

    return {
      sourceSignature: recommendation.sourceSignature,
      campaignId: recommendation.campaignId,
      campaignName: recommendation.campaignName,
      actionFamily,
      status: "ELIGIBLE",
      eligible: true,
      daysRemaining: 0,
      nextEligibleAt: null,
      blockingTaskId: null,
      blockingTaskCreatedAt: null,
      lastCompletedAt: latestCompleted?.completedAt ?? null,
      reason: null,
    } satisfies OptimizationRecommendationEligibility;
  });
}

function taskExecutionPriority(task: OptimizationPolicyTask) {
  if (task.status === "IN_PROGRESS") return 0;
  if (task.status === "REOPENED") return 1;
  return 2;
}

export function evaluateTaskExecutionCadence(input: {
  tasks: OptimizationPolicyTask[];
  activeCycleId: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const latestCompletedByFamily = new Map<string, OptimizationPolicyTask>();
  const openCpaByFamily = new Map<string, OptimizationPolicyTask[]>();

  const completedTasks = [...input.tasks]
    .filter(task => task.status === "COMPLETED" && task.completedAt && isCpaOptimization(task))
    .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0));
  for (const task of completedTasks) {
    const familyKey = optimizationFamilyKey(task);
    if (!latestCompletedByFamily.has(familyKey)) latestCompletedByFamily.set(familyKey, task);
  }

  const openTasks = input.tasks.filter(
    task => task.cycleId === input.activeCycleId && task.status !== "COMPLETED",
  );
  for (const task of openTasks) {
    if (!isCpaOptimization(task)) continue;
    const familyKey = optimizationFamilyKey(task);
    const family = openCpaByFamily.get(familyKey) ?? [];
    family.push(task);
    openCpaByFamily.set(familyKey, family);
  }
  for (const family of Array.from(openCpaByFamily.values())) {
    family.sort((left: OptimizationPolicyTask, right: OptimizationPolicyTask) => {
      const priorityDifference = taskExecutionPriority(left) - taskExecutionPriority(right);
      return priorityDifference || left.createdAt - right.createdAt || left.id - right.id;
    });
  }

  return openTasks.map(task => {
    const actionFamily = optimizationActionFamily(task);
    if (actionFamily !== "CPA") {
      return {
        taskId: task.id,
        campaignId: task.campaignId,
        campaignName: task.campaignName,
        actionFamily,
        status: "EXECUTABLE",
        eligible: true,
        daysRemaining: 0,
        nextEligibleAt: null,
        blockingTaskId: null,
        lastCompletedAt: null,
        canonicalTaskId: task.id,
        duplicateCount: 0,
        duplicateTaskIds: [],
        reason: null,
      } satisfies OptimizationTaskExecutionEligibility;
    }

    const familyKey = optimizationFamilyKey(task);
    const openFamily = openCpaByFamily.get(familyKey) ?? [task];
    const canonicalTask = openFamily[0];
    const duplicateTaskIds = openFamily.slice(1).map(item => item.id);
    const duplicateCount = duplicateTaskIds.length;
    if (task.id !== canonicalTask.id) {
      return {
        taskId: task.id,
        campaignId: task.campaignId,
        campaignName: task.campaignName,
        actionFamily,
        status: "LEGACY_DUPLICATE",
        eligible: false,
        daysRemaining: 0,
        nextEligibleAt: null,
        blockingTaskId: canonicalTask.id,
        lastCompletedAt: null,
        canonicalTaskId: canonicalTask.id,
        duplicateCount,
        duplicateTaskIds,
        reason: `Tarefa legada consolidada com a tarefa canônica #${canonicalTask.id}.`,
      } satisfies OptimizationTaskExecutionEligibility;
    }

    const latestCompleted = latestCompletedByFamily.get(familyKey);
    if (latestCompleted?.completedAt) {
      const nextEligibleAt = latestCompleted.completedAt + CPA_COOLDOWN_MS;
      if (nextEligibleAt > now) {
        return {
          taskId: task.id,
          campaignId: task.campaignId,
          campaignName: task.campaignName,
          actionFamily,
          status: "COOLDOWN",
          eligible: false,
          daysRemaining: Math.max(1, Math.ceil((nextEligibleAt - now) / (24 * 60 * 60 * 1_000))),
          nextEligibleAt,
          blockingTaskId: latestCompleted.id,
          lastCompletedAt: latestCompleted.completedAt,
          canonicalTaskId: canonicalTask.id,
          duplicateCount,
          duplicateTaskIds,
          reason: `Aguardar ${CPA_COOLDOWN_DAYS} dias corridos após a última otimização de CPA.`,
        } satisfies OptimizationTaskExecutionEligibility;
      }
    }

    return {
      taskId: task.id,
      campaignId: task.campaignId,
      campaignName: task.campaignName,
      actionFamily,
      status: "EXECUTABLE",
      eligible: true,
      daysRemaining: 0,
      nextEligibleAt: null,
      blockingTaskId: null,
      lastCompletedAt: latestCompleted?.completedAt ?? null,
      canonicalTaskId: canonicalTask.id,
      duplicateCount,
      duplicateTaskIds,
      reason: null,
    } satisfies OptimizationTaskExecutionEligibility;
  });
}

export function normalizeNegativeKeywordTaskSteps(steps: string[]) {
  const reportRequest =
    /(?:\b(?:gerar|criar|exportar|preencher)\b.*\brelat[oó]rio\b.*\b(?:palavr|termo|negativ)|\b(?:palavr|termo|negativ)\b.*\brelat[oó]rio\b)/i;
  const replacement =
    "Registrar no histórico do dashboard somente as palavras-chave negativas efetivamente aplicadas; não gerar relatório separado.";
  const normalized = steps.map(step => (reportRequest.test(step) ? replacement : step));
  return normalized.filter((step, index) => normalized.indexOf(step) === index);
}

export function eligibleRecommendations<T extends OptimizationPolicyRecommendation>(input: {
  recommendations: T[];
  tasks: OptimizationPolicyTask[];
  now?: number;
}) {
  const eligibilityBySignature = new Map(
    evaluateRecommendationCadence(input).map(item => [item.sourceSignature, item]),
  );
  return uniqueOptimizationItems(input.recommendations).filter(
    recommendation => eligibilityBySignature.get(recommendation.sourceSignature)?.eligible !== false,
  );
}
