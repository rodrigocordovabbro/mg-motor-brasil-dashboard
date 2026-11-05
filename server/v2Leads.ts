import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool, getV2Goal } from "./v2Db";
import { addIsoDays, resolveDashboardPeriod } from "../shared/dashboardDates";
import type {
  V2Dashboard,
  V2Filters,
  V2Lead,
  V2Count,
  V2Pacing,
} from "../shared/v2Types";

export function countBy(rows: V2Lead[], key: keyof V2Lead): V2Count[] {
  const map = new Map<string, number>();
  rows.forEach(row => {
    const value =
      key === "hour"
        ? row.hour == null
          ? "Não informado"
          : `${String(row.hour).padStart(2, "0")}h`
        : String(row[key] ?? "Não informado");
    map.set(value, (map.get(value) ?? 0) + 1);
  });
  return [...map]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")
    );
}
export function makePacing(
  current: number,
  goal: number | null,
  dateTo: string
): V2Pacing {
  const competence = dateTo.slice(0, 7);
  const [year, month, day] = dateTo.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const closedDays = day;
  const daysRemaining = daysInMonth - closedDays;
  const averagePerDay = closedDays ? current / closedDays : 0;
  const projection = Math.round(averagePerDay * daysInMonth);
  const pace = goal == null ? null : (goal * closedDays) / daysInMonth;
  return {
    competence,
    goal,
    current,
    closedDays,
    daysInMonth,
    daysRemaining,
    averagePerDay,
    projection,
    requiredPerDay:
      goal == null || daysRemaining === 0
        ? null
        : Math.max(0, goal - current) / daysRemaining,
    projectedDifference: goal == null ? null : projection - goal,
    remainingToGoal: goal == null ? null : Math.max(0, goal - current),
    progressPercent: goal == null || goal === 0 ? null : (current / goal) * 100,
    status:
      pace == null
        ? "NO_GOAL"
        : Math.abs(current - pace) < 1
          ? "ON_TRACK"
          : current > pace
            ? "AHEAD"
            : "BEHIND",
  };
}
const known = (values: V2Count[]) =>
  values.filter(v => v.label !== "Não informado");
const matches = (row: V2Lead, input: V2Filters) =>
  (!input.model || row.model === input.model) &&
  (!input.channel || row.channel === input.channel) &&
  (!input.campaign || row.campaign === input.campaign) &&
  (!input.dealer || row.dealer === input.dealer) &&
  (!input.search ||
    [
      row.name,
      row.model,
      row.channel,
      row.campaign,
      row.dealer,
      row.city,
      row.state,
    ].some(value =>
      value
        .toLocaleLowerCase("pt-BR")
        .includes(input.search!.toLocaleLowerCase("pt-BR"))
    ));

export function aggregateV2Leads(
  all: V2Lead[],
  input: V2Filters,
  goal: number | null,
  source: V2Dashboard["source"],
  now = new Date()
): V2Dashboard {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const baseRows = all.filter(
    row => row.date >= period.dateFrom && row.date <= period.dateTo
  );
  const rows = baseRows.filter(row => matches(row, input));
  const monthFrom = `${period.dateTo.slice(0, 7)}-01`;
  const mtdRows = all.filter(
    row =>
      row.date >= monthFrom && row.date <= period.dateTo && matches(row, input)
  );
  // A global monthly goal is not compared with a single-channel/model/dealer subset.
  const narrowed = Boolean(
    input.model ||
      input.channel ||
      input.campaign ||
      input.dealer ||
      input.search
  );
  const pacing = makePacing(
    mtdRows.length,
    narrowed ? null : goal,
    period.dateTo
  );
  const channels = countBy(rows, "channel"),
    models = countBy(rows, "model"),
    states = countBy(rows, "state"),
    cities = countBy(rows, "city"),
    dealers = countBy(rows, "dealer"),
    hours = countBy(rows, "hour");
  const dailyMap = new Map<
    string,
    { total: number; channels: Record<string, number> }
  >();
  rows.forEach(row => {
    const value = dailyMap.get(row.date) ?? { total: 0, channels: {} };
    value.total++;
    value.channels[row.channel] = (value.channels[row.channel] ?? 0) + 1;
    dailyMap.set(row.date, value);
  });
  const daily: V2Dashboard["daily"] = [];
  let cumulative = 0;
  for (
    let date = period.dateFrom;
    date <= period.dateTo;
    date = addIsoDays(date, 1)
  ) {
    const value = dailyMap.get(date) ?? { total: 0, channels: {} };
    cumulative += value.total;
    daily.push({
      date,
      ...value,
      cumulative,
      pace:
        pacing.goal == null ||
        period.dateFrom.slice(0, 7) !== period.dateTo.slice(0, 7)
          ? null
          : (pacing.goal / pacing.daysInMonth) * (daily.length + 1),
    });
  }
  const page = input.page ?? 1,
    pageSize = 50;
  const dealerRows = dealers.map(item => ({
    dealer: item.label,
    state:
      rows.find(row => row.dealer === item.label)?.state ?? "Não informado",
    leads: item.count,
    leadGoal: null,
    sales: null,
    salesGoal: null,
    conversionRate: null,
  }));
  return {
    status: source.importedAt ? "READY" : "NOT_CONFIGURED",
    source,
    period,
    options: {
      models: countBy(baseRows, "model").map(v => v.label),
      channels: countBy(baseRows, "channel").map(v => v.label),
      campaigns: countBy(baseRows, "campaign").map(v => v.label),
      dealers: countBy(baseRows, "dealer").map(v => v.label),
    },
    summary: {
      total: rows.length,
      models: known(models).length,
      dealers: known(dealers).length,
      states: known(states).length,
      cities: known(cities).length,
      crmRate: null,
      crmDelivered: null,
      topModel: known(models)[0] ?? null,
      topState: known(states)[0] ?? null,
      peakHour: known(hours)[0] ?? null,
    },
    pacing,
    daily,
    channels,
    models,
    states,
    cities,
    dealers,
    hours,
    campaigns: countBy(rows, "campaign"),
    versions: countBy(rows, "version"),
    crm: countBy(rows, "crm"),
    recent: {
      rows: [...rows]
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            (b.hour ?? -1) - (a.hour ?? -1) ||
            b.id - a.id
        )
        .slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    },
    dealerPerformance: {
      available: false,
      sourceName: null,
      updatedAt: null,
      rows: dealerRows,
      totals: {
        leads: rows.length,
        leadGoal: null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
      },
    },
    notes: [
      "Contagem de registros da planilha com data válida, preservando cada linha e sua origem; não representa pessoas únicas deduplicadas nem comprova integração CRM.",
      "Carga inicial autenticada da planilha. Atualização automática ainda não configurada.",
      "Pacing usa o acumulado do mês até a data final, enquanto gráficos e KPIs usam o período selecionado.",
      "Fonte de vendas e metas por concessionária ainda não configurada. Conversão de Leads em vendas indisponível.",
      ...(period.dateFrom.slice(0, 7) !== period.dateTo.slice(0, 7)
        ? [
            "Pace diário indisponível em intervalos multicompetência; selecione um único mês para comparar com sua meta.",
          ]
        : []),
      ...(narrowed
        ? [
            "Meta mensal global não aplicada ao recorte de canal, modelo, campanha ou concessionária.",
          ]
        : []),
    ],
  };
}

export async function getV2Dashboard(input: V2Filters) {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo);
  const monthFrom = `${period.dateTo.slice(0, 7)}-01`;
  const from = period.dateFrom < monthFrom ? period.dateFrom : monthFrom;
  const [sourceRows] = await getV2Pool().query<RowDataPacket[]>(
    "SELECT name,importedAt,totalRows,invalidDateRows FROM v2_sources WHERE id=1"
  );
  const source: V2Dashboard["source"] = {
    name: "LEADS MG — Base",
    importedAt: null,
    mode: "authenticated-import",
    totalRows: 0,
    invalidDateRows: 0,
  };
  if (sourceRows[0]) {
    source.name = String(sourceRows[0].name);
    source.importedAt = new Date(sourceRows[0].importedAt).toISOString();
    source.totalRows = Number(sourceRows[0].totalRows);
    source.invalidDateRows = Number(sourceRows[0].invalidDateRows);
  }
  const [raw] = await getV2Pool().execute<RowDataPacket[]>(
    "SELECT id,leadDate AS date,leadHour AS hour,name,model,version,channel,campaign,dealer,city,state,crm FROM v2_leads WHERE leadDate>=? AND leadDate<=?",
    [from, period.dateTo]
  );
  const rows = raw.map(row => ({
    id: Number(row.id),
    date: String(row.date),
    hour: row.hour == null ? null : Number(row.hour),
    name: String(row.name),
    model: String(row.model),
    version: String(row.version),
    channel: String(row.channel),
    campaign: String(row.campaign),
    dealer: String(row.dealer),
    city: String(row.city),
    state: String(row.state),
    crm: String(row.crm),
  }));
  return aggregateV2Leads(
    rows,
    input,
    await getV2Goal(period.dateTo.slice(0, 7)),
    source
  );
}
