import { canValidateCRM } from "../shared/accountRoles";
import { TRPCError } from "@trpc/server";
import type { UserRole } from "../shared/accountRoles";
import {
  OFFICIAL_MODELS,
  UNIDENTIFIED_MODEL,
  resolveOfficialModel,
} from "../shared/modelRegistry";
import { groupedStateLabel } from "../shared/stateRegistry";
import type { V2Dashboard } from "../shared/v2Types";
import {
  CRM_DEALERS,
  resolveOfficialDealer,
  isUnassignedLeadDealer,
} from "../shared/dealerRegistry";
import type { DispatchReport } from "../shared/v2Dispatch";
export function requireAdministrator(
  user: { role?: UserRole } | null | undefined
): void {
  if (user?.role !== "admin")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Permissão de administrador necessária.",
    });
}
export function requireManualValidator(
  user: { role?: UserRole } | null | undefined
): void {
  if (!canValidateCRM(user?.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Seu perfil permite somente leitura do Manual.",
    });
}
export function dashboardForClient(data: V2Dashboard): V2Dashboard {
  const models = new Map<string, number>();
  for (const row of data.models) {
    const label = resolveOfficialModel(row.label) ?? UNIDENTIFIED_MODEL;
    models.set(label, (models.get(label) ?? 0) + row.count);
  }
  const hasUnidentifiedModel =
    data.options.models.includes(UNIDENTIFIED_MODEL) ||
    (data.modelAnalysis?.unclassified != null &&
      data.modelAnalysis.unclassified > 0) ||
    models.has(UNIDENTIFIED_MODEL);
  const modelAnalysis = data.modelAnalysis
    ? { ...data.modelAnalysis, diagnostics: [] }
    : undefined;
  return {
    ...data,
    source: { ...data.source, name: "Base de Leads MG" },
    options: {
      ...data.options,
      models: [
        ...OFFICIAL_MODELS,
        ...(hasUnidentifiedModel ? [UNIDENTIFIED_MODEL] : []),
      ],
    },
    models: [...models].map(([label, count]) => ({ label, count })),
    modelAnalysis,
    notes: [],
    recent: {
      ...data.recent,
      rows: data.recent.rows.map(row => ({
        ...row,
        state: groupedStateLabel(row.state),
      })),
    },
    dealerPerformance: {
      ...data.dealerPerformance,
      warnings: [],
      unmapped: [],
      unreconciledDealers: [],
      groupedGoals: data.dealerPerformance.groupedGoals?.map(
        (group, index) => ({
          ...group,
          key: `collective-${index + 1}`,
          sourceLabel: "Meta coletiva da rede",
        })
      ),
    },
  };
}
export function dispatchForClient<T extends DispatchReport>(data: T): T {
  return {
    ...data,
    fileName: "Controle por dealer",
    title: "Lojas & CRM",
    information: [],
    notes: [],
    rows: data.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => ({
        ...cell,
        validation: cell.validation
          ? { ...cell.validation, updatedBy: "Equipe MG" }
          : null,
      })),
    })),
  };
}
export function genericClientDataError(): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Dados temporariamente indisponíveis. Tente atualizar novamente.",
  });
}

/** Escopo de apresentação. Não exclui linhas, Leads ou checks de outras unidades. */
export function controlForCRM<T extends DispatchReport>(
  data: T
): T & { dashboardTotal: number | null } {
  const sourceRows = data.sourceRows ?? [];
  const mergedLeadRows = (
    selected: (typeof data.rows)[number],
    candidates: typeof data.rows
  ) => {
    if (data.volumeMode !== "dashboard-leads" || candidates.length < 2)
      return selected;
    return {
      ...selected,
      rawDealers: [...new Set(candidates.flatMap(row => row.rawDealers ?? []))],
      cells: selected.cells.map(cell => {
        const values = candidates.flatMap(row =>
          row.cells.filter(c => c.date === cell.date).map(c => c.leadVolume)
        );
        const leadVolume = values.some(value => value != null)
          ? values.reduce<number>((n, value) => n + (value ?? 0), 0)
          : null;
        return { ...cell, leadVolume, volume: leadVolume };
      }),
    };
  };
  const rows = CRM_DEALERS.flatMap(dealer => {
    const candidates = data.rows.filter(
      row => resolveOfficialDealer(row.storeName) === dealer.name
    );
    const source = sourceRows.find(
      row => resolveOfficialDealer(row.storeName) === dealer.name
    );
    const row =
      candidates.find(row => row.id === source?.rowId) ??
      candidates.find(row => row.storeName === dealer.name) ??
      candidates.sort((a, b) => a.rowNumber - b.rowNumber)[0];
    return row
      ? [
          {
            ...mergedLeadRows(row, candidates),
            storeName: source?.storeName ?? dealer.name,
          },
        ]
      : [];
  });
  const sourceQualification = sourceRows.find(row =>
    isUnassignedLeadDealer(row.storeName)
  );
  const qualification =
    data.rows.find(row => row.id === sourceQualification?.rowId) ??
    data.rows.find(row => isUnassignedLeadDealer(row.storeName));
  if (qualification)
    rows.push({
      ...mergedLeadRows(
        qualification,
        data.rows.filter(row => isUnassignedLeadDealer(row.storeName))
      ),
      storeName: sourceQualification?.storeName ?? "Leads em qualificação",
    });
  // Não descartar novos dealers/genéricos ambíguos: manter raw sem unidade inferida.
  const importedIds = new Set(sourceRows.map(row => row.rowId));
  for (const row of data.rows) {
    if (
      resolveOfficialDealer(row.storeName) ||
      isUnassignedLeadDealer(row.storeName)
    )
      continue;
    const hasLeads = row.cells.some(cell => (cell.leadVolume ?? 0) > 0);
    if (!hasLeads && !importedIds.has(row.id)) continue;
    rows.push({ ...row });
  }
  if (sourceRows.length) {
    const sourceOrder = new Map(
      sourceRows.map(row => [row.rowId, row.rowNumber])
    );
    rows.sort(
      (a, b) =>
        (sourceOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  const sum = (values: Array<number | null | undefined>) =>
    values.some(value => value != null)
      ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
      : null;
  const days = data.days.map(day => {
    const values = rows.flatMap(row =>
      row.cells
        .filter(cell => cell.date === day.date)
        .map(cell => cell.leadVolume)
    );
    const count = sum(values);
    return { ...day, computedTotal: count, sourceTotal: count };
  });
  const total = sum(days.map(day => day.computedTotal));
  return {
    ...data,
    rows,
    days,
    dashboardTotal: data.totals.computed,
    totals: {
      ...data.totals,
      computed: total,
      sourceDailySum: total,
      declaredInInstructions: null,
      sourceManualOk: rows.reduce(
        (n, row) =>
          n +
          row.cells.filter(
            cell => cell.sourceManual.trim().toUpperCase() === "OK"
          ).length,
        0
      ),
      auditedOk: rows.reduce(
        (n, row) => n + row.cells.filter(cell => cell.validation?.isOk).length,
        0
      ),
    },
  };
}
