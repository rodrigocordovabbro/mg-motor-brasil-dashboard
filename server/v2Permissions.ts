import { TRPCError } from "@trpc/server";
import type { UserRole } from "../shared/accountRoles";
import { OFFICIAL_MODELS, resolveOfficialModel } from "../shared/modelRegistry";
import { groupedStateLabel } from "../shared/stateRegistry";
import type { V2Dashboard } from "../shared/v2Types";
import { CRM_DEALERS, resolveOfficialDealer } from "../shared/dealerRegistry";
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
export function dashboardForClient(data: V2Dashboard): V2Dashboard {
  const models = new Map<string, number>();
  for (const row of data.models) {
    const label = resolveOfficialModel(row.label) ?? "Modelo não identificado";
    models.set(label, (models.get(label) ?? 0) + row.count);
  }
  return {
    ...data,
    source: { ...data.source, name: "Base de Leads MG" },
    options: { ...data.options, models: [...OFFICIAL_MODELS] },
    models: [...models].map(([label, count]) => ({ label, count })),
    notes: [],
    recent: {
      ...data.recent,
      rows: data.recent.rows.map(row => ({
        ...row,
        name: "Contato protegido",
        crm: "Informação restrita",
        model: resolveOfficialModel(row.model) ?? "Modelo não identificado",
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
      crmResponsible: row.crmResponsible ? "Contato protegido" : "",
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
  const rows = CRM_DEALERS.flatMap(dealer => {
    const candidates = data.rows.filter(
      row => resolveOfficialDealer(row.storeName) === dealer.name
    );
    const row =
      candidates.find(row => row.storeName === dealer.name) ??
      candidates.sort((a, b) => a.rowNumber - b.rowNumber)[0];
    return row ? [{ ...row, storeName: dealer.name }] : [];
  });
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
