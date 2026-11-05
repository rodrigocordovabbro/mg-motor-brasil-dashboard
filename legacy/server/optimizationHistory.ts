import type {
  OptimizationCycle,
  OptimizationTask,
  PerformanceSnapshot,
  TaskCompletion,
  TaskEvent,
} from "../drizzle/schema";

export type OptimizationWorkspaceData = {
  cycles: OptimizationCycle[];
  tasks: OptimizationTask[];
  events: TaskEvent[];
  completions: TaskCompletion[];
  snapshots: PerformanceSnapshot[];
};

export type ImpactResult = "IMPROVED" | "STABLE" | "WORSENED" | "AWAITING_DATA";

export type NumericSnapshot = {
  id: number;
  type: PerformanceSnapshot["snapshotType"];
  snapshotDate: string;
  windowDateFrom: string;
  windowDateTo: string;
  windowDays: number;
  spend: number;
  spendPerDay: number;
  conversions: number;
  conversionsPerDay: number;
  cpa: number;
  ctr: number;
  cpc: number;
  clicks: number;
  impressions: number;
  createdAt: number;
};

export type MetricDelta = {
  before: number;
  after: number;
  absolute: number;
  percent: number | null;
};

export type OptimizationHistoryRow = {
  taskId: number;
  sourceTaskId: number | null;
  cycleId: number;
  cycleNumber: number;
  cycleName: string;
  campaignId: string;
  campaignName: string;
  region: string | null;
  actionType: OptimizationTask["actionType"];
  taskStatus: OptimizationTask["status"];
  result: ImpactResult;
  resultReason: string;
  createdBy: string;
  assignee: string | null;
  completedBy: string | null;
  completionNotes: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  baseline: NumericSnapshot | null;
  completionSnapshot: NumericSnapshot | null;
  followUp: NumericSnapshot | null;
  comparison: {
    cpa: MetricDelta | null;
    conversionsPerDay: MetricDelta | null;
    spendPerDay: MetricDelta | null;
    ctr: MetricDelta | null;
    cpc: MetricDelta | null;
  };
  events: TaskEvent[];
};

function toNumber(value: string | number | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countDays(dateFrom: string, dateTo: string) {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

function normalizeSnapshot(snapshot: PerformanceSnapshot | undefined): NumericSnapshot | null {
  if (!snapshot) return null;
  const windowDays = countDays(snapshot.windowDateFrom, snapshot.windowDateTo);
  const spend = toNumber(snapshot.spend);
  const conversions = toNumber(snapshot.conversions);
  return {
    id: snapshot.id,
    type: snapshot.snapshotType,
    snapshotDate: snapshot.snapshotDate,
    windowDateFrom: snapshot.windowDateFrom,
    windowDateTo: snapshot.windowDateTo,
    windowDays,
    spend,
    spendPerDay: windowDays > 0 ? spend / windowDays : 0,
    conversions,
    conversionsPerDay: windowDays > 0 ? conversions / windowDays : 0,
    cpa: toNumber(snapshot.cpa),
    ctr: toNumber(snapshot.ctr),
    cpc: toNumber(snapshot.cpc),
    clicks: toNumber(snapshot.clicks),
    impressions: toNumber(snapshot.impressions),
    createdAt: snapshot.createdAt,
  };
}

function buildDelta(before: number, after: number): MetricDelta {
  return {
    before,
    after,
    absolute: after - before,
    percent: before === 0 ? null : ((after - before) / Math.abs(before)) * 100,
  };
}

function classifyImpact(input: {
  task: OptimizationTask;
  baseline: NumericSnapshot | null;
  followUp: NumericSnapshot | null;
}) {
  const { task, baseline, followUp } = input;
  if (task.status !== "COMPLETED" || !task.completedAt) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "A tarefa ainda não foi concluída; nenhum efeito posterior é classificado.",
    };
  }
  if (!baseline) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "Não há snapshot de referência no momento da criação da tarefa.",
    };
  }
  if (!followUp) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "Aguardando captura de um período posterior à conclusão.",
    };
  }
  const completedDate = new Date(task.completedAt).toISOString().slice(0, 10);
  if (followUp.windowDateFrom <= completedDate) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "A janela de acompanhamento ainda inclui dias anteriores ou iguais à conclusão.",
    };
  }
  if (followUp.windowDays < 3) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "São necessários ao menos 3 dias fechados posteriores à conclusão.",
    };
  }
  if (baseline.cpa <= 0 || baseline.conversionsPerDay <= 0) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "A referência não possui CPA e conversões suficientes para comparação segura.",
    };
  }

  const cpaDelta = buildDelta(baseline.cpa, followUp.cpa).percent;
  const conversionsDelta = buildDelta(
    baseline.conversionsPerDay,
    followUp.conversionsPerDay,
  ).percent;
  const spendDelta = buildDelta(baseline.spendPerDay, followUp.spendPerDay).percent;
  if (cpaDelta == null || conversionsDelta == null) {
    return {
      result: "AWAITING_DATA" as const,
      reason: "Não foi possível calcular variações percentuais comparáveis.",
    };
  }

  if (cpaDelta <= -10 && conversionsDelta >= -15) {
    return {
      result: "IMPROVED" as const,
      reason: `CPA caiu ${Math.abs(cpaDelta).toFixed(1)}% e as conversões/dia variaram ${conversionsDelta.toFixed(1)}%.`,
    };
  }
  if (cpaDelta >= 10 || (conversionsDelta <= -20 && (spendDelta ?? 0) >= -10)) {
    return {
      result: "WORSENED" as const,
      reason:
        cpaDelta >= 10
          ? `CPA subiu ${cpaDelta.toFixed(1)}% no período posterior.`
          : `Conversões/dia caíram ${Math.abs(conversionsDelta).toFixed(1)}% sem redução proporcional de investimento/dia.`,
    };
  }
  return {
    result: "STABLE" as const,
    reason: `As variações permaneceram na faixa neutra: CPA ${cpaDelta.toFixed(1)}% e conversões/dia ${conversionsDelta.toFixed(1)}%.`,
  };
}

function pickSnapshot(
  snapshots: PerformanceSnapshot[],
  types: PerformanceSnapshot["snapshotType"][],
  direction: "first" | "last",
) {
  const candidates = snapshots
    .filter(snapshot => types.includes(snapshot.snapshotType))
    .sort((a, b) => a.createdAt - b.createdAt);
  return direction === "first" ? candidates[0] : candidates.at(-1);
}

export function buildOptimizationHistory(workspace: OptimizationWorkspaceData) {
  const cyclesById = new Map(workspace.cycles.map(cycle => [cycle.id, cycle]));
  const completionsByTask = new Map(
    workspace.completions.map(completion => [completion.taskId, completion]),
  );
  const snapshotsByTask = new Map<number, PerformanceSnapshot[]>();
  for (const snapshot of workspace.snapshots) {
    if (snapshot.taskId == null) continue;
    const current = snapshotsByTask.get(snapshot.taskId) ?? [];
    current.push(snapshot);
    snapshotsByTask.set(snapshot.taskId, current);
  }
  const eventsByTask = new Map<number, TaskEvent[]>();
  for (const event of workspace.events) {
    const current = eventsByTask.get(event.taskId) ?? [];
    current.push(event);
    eventsByTask.set(event.taskId, current);
  }

  const rows: OptimizationHistoryRow[] = workspace.tasks.map(task => {
    const cycle = cyclesById.get(task.cycleId);
    const taskSnapshots = snapshotsByTask.get(task.id) ?? [];
    const baseline = normalizeSnapshot(
      pickSnapshot(taskSnapshots, ["TASK_CREATED"], "first") ??
        pickSnapshot(taskSnapshots, ["CYCLE_START"], "first"),
    );
    const completionSnapshot = normalizeSnapshot(
      pickSnapshot(taskSnapshots, ["TASK_COMPLETED"], "last"),
    );
    const followUp = normalizeSnapshot(pickSnapshot(taskSnapshots, ["FOLLOW_UP"], "last"));
    const impact = classifyImpact({ task, baseline, followUp });
    const completion = completionsByTask.get(task.id) ?? null;

    return {
      taskId: task.id,
      sourceTaskId: task.sourceTaskId,
      cycleId: task.cycleId,
      cycleNumber: cycle?.cycleNumber ?? 0,
      cycleName: cycle?.name ?? `Ciclo ${task.cycleId}`,
      campaignId: task.campaignId,
      campaignName: task.campaignName,
      region: task.region,
      actionType: task.actionType,
      taskStatus: task.status,
      result: impact.result,
      resultReason: impact.reason,
      createdBy: task.createdBy,
      assignee: task.assignee,
      completedBy: completion?.completedBy ?? null,
      completionNotes: completion?.notes ?? null,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      baseline,
      completionSnapshot,
      followUp,
      comparison: {
        cpa: baseline && followUp ? buildDelta(baseline.cpa, followUp.cpa) : null,
        conversionsPerDay:
          baseline && followUp
            ? buildDelta(baseline.conversionsPerDay, followUp.conversionsPerDay)
            : null,
        spendPerDay:
          baseline && followUp
            ? buildDelta(baseline.spendPerDay, followUp.spendPerDay)
            : null,
        ctr: baseline && followUp ? buildDelta(baseline.ctr, followUp.ctr) : null,
        cpc: baseline && followUp ? buildDelta(baseline.cpc, followUp.cpc) : null,
      },
      events: (eventsByTask.get(task.id) ?? []).sort((a, b) => b.createdAt - a.createdAt),
    };
  });

  const summary = {
    total: rows.length,
    completed: rows.filter(row => row.taskStatus === "COMPLETED").length,
    improved: rows.filter(row => row.result === "IMPROVED").length,
    stable: rows.filter(row => row.result === "STABLE").length,
    worsened: rows.filter(row => row.result === "WORSENED").length,
    awaitingData: rows.filter(row => row.result === "AWAITING_DATA").length,
  };

  const cycleSummaries = workspace.cycles.map(cycle => {
    const cycleRows = rows.filter(row => row.cycleId === cycle.id);
    const measuredRows = cycleRows.filter(row => row.comparison.cpa?.percent != null);
    return {
      cycleId: cycle.id,
      cycleNumber: cycle.cycleNumber,
      cycleName: cycle.name,
      status: cycle.status,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      totalTasks: cycleRows.length,
      completed: cycleRows.filter(row => row.taskStatus === "COMPLETED").length,
      improved: cycleRows.filter(row => row.result === "IMPROVED").length,
      stable: cycleRows.filter(row => row.result === "STABLE").length,
      worsened: cycleRows.filter(row => row.result === "WORSENED").length,
      awaitingData: cycleRows.filter(row => row.result === "AWAITING_DATA").length,
      averageCpaChangePercent: measuredRows.length
        ? measuredRows.reduce((sum, row) => sum + (row.comparison.cpa?.percent ?? 0), 0) /
          measuredRows.length
        : null,
      averageConversionsPerDayChangePercent: measuredRows.length
        ? measuredRows.reduce(
            (sum, row) => sum + (row.comparison.conversionsPerDay?.percent ?? 0),
            0,
          ) / measuredRows.length
        : null,
    };
  });

  return {
    generatedAt: Date.now(),
    methodology: {
      minimumClosedDays: 3,
      improved: "CPA cai pelo menos 10% e conversões/dia não caem mais de 15%.",
      worsened:
        "CPA sobe pelo menos 10%, ou conversões/dia caem 20% sem redução semelhante de investimento/dia.",
      stable: "Demais variações com amostra posterior válida.",
      awaitingData:
        "Tarefa não concluída, ausência de referência/acompanhamento, janela sobreposta à conclusão ou menos de 3 dias fechados.",
      disclaimer:
        "A comparação é observacional e não atribui causalidade; mudanças de verba, demanda, sazonalidade, leilão e outras alterações podem influenciar o resultado.",
    },
    summary,
    cycles: workspace.cycles,
    cycleSummaries,
    rows: rows.sort((a, b) => b.createdAt - a.createdAt),
  };
}
