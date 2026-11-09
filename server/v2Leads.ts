import {
  groupedStateLabel,
  resolveBrazilianState,
} from "../shared/stateRegistry";
import { aggregateRegionalModels } from "./v2Regional";
import {
  OFFICIAL_MODELS,
  UNIDENTIFIED_MODEL,
  groupedModelLabel,
  resolveOfficialModel,
} from "../shared/modelRegistry";
import {
  combinedDealerRegistry,
  dealerRegistryList,
  findDealerRegistryEntry,
  resolveRegisteredDealer,
  type ExtraDealerRegistryEntry,
} from "../shared/dealerRegistryExtensions";
import { getCommercialPerformance } from "./v2Commercial";
import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool, getV2Goal } from "./v2Db";
import { readExtraDealerRegistry } from "./v2DealerRegistry";
import { aggregateModelAnalysis, resolveModelVersion } from "./v2ModelAnalysis";
import { addIsoDays, resolveDashboardPeriod } from "../shared/dashboardDates";
import {
  buildHistoricalLeadPace,
  historicalLeadPaceWindow,
} from "./v2HistoricalLeadPace";
import {
  createLegacyLeadCountingAccumulator,
  isLegacyLeadChannelActive,
} from "./v2LeadCounting";
import type {
  V2Dashboard,
  V2Filters,
  V2Lead,
  V2Count,
  V2Pacing,
} from "../shared/v2Types";

export function countBy(
  rows: V2Lead[],
  key: keyof V2Lead,
  extraDealers: readonly ExtraDealerRegistryEntry[] = []
): V2Count[] {
  const map = new Map<string, number>();
  rows.forEach(row => {
    const value =
      key === "hour"
        ? row.hour == null
          ? "Não informado"
          : `${String(row.hour).padStart(2, "0")}h`
        : key === "dealer"
          ? (resolveRegisteredDealer(row.dealer, extraDealers) ?? row.dealer)
          : key === "model"
            ? (resolveOfficialModel(row.model) ?? UNIDENTIFIED_MODEL)
            : key === "state"
              ? groupedStateLabel(row.state)
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

/** The one canonical dimension/search predicate used by dashboard and dispatch. */
export function matchesV2LeadFilters(
  row: V2Lead,
  input: Pick<
    V2Filters,
    "model" | "channel" | "campaign" | "dealer" | "search"
  >,
  extraDealers: readonly ExtraDealerRegistryEntry[] = []
): boolean {
  const lowerSearch = input.search?.toLocaleLowerCase("pt-BR");
  const modelMatches =
    !input.model ||
    (input.model === UNIDENTIFIED_MODEL
      ? resolveOfficialModel(row.model) === null
      : row.model === input.model ||
        groupedModelLabel(row.model) === input.model);
  const searchValues = [
    row.name,
    row.model,
    resolveOfficialModel(row.model) ?? "",
    row.version,
    row.channel,
    row.campaign,
    row.dealer,
    resolveRegisteredDealer(row.dealer, extraDealers) ?? "",
    row.city,
    row.state,
    resolveBrazilianState(row.state)?.name ?? "",
  ];
  if (lowerSearch) {
    const version = resolveModelVersion(row.model, row.version);
    if (version.status === "IDENTIFIED") searchValues.push(version.version);
  }
  return (
    modelMatches &&
    (!input.channel || row.channel === input.channel) &&
    (!input.campaign || row.campaign === input.campaign) &&
    (!input.dealer ||
      row.dealer === input.dealer ||
      resolveRegisteredDealer(row.dealer, extraDealers) === input.dealer) &&
    (!lowerSearch ||
      searchValues.some(value =>
        value.toLocaleLowerCase("pt-BR").includes(lowerSearch)
      ))
  );
}

/** Pure row selection shared by the dashboard and dashboard-lead dispatch. */
export function filterV2LeadRows(
  rows: V2Lead[],
  input: V2Filters,
  now = new Date(),
  extraDealers: readonly ExtraDealerRegistryEntry[] = []
): V2Lead[] {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  return rows.filter(
    row =>
      row.date >= period.dateFrom &&
      row.date <= period.dateTo &&
      isLegacyLeadChannelActive(row.channel, row.date) &&
      matchesV2LeadFilters(row, input, extraDealers)
  );
}

export function mapV2LeadRow(row: RowDataPacket): V2Lead {
  return {
    id: Number(row.id),
    date: String(row.date ?? row.leadDate),
    hour:
      row.hour == null && row.leadHour == null
        ? null
        : Number(row.hour ?? row.leadHour),
    name: String(row.name),
    model: String(row.model),
    version: String(row.version),
    channel: String(row.channel),
    campaign: String(row.campaign),
    dealer: String(row.dealer),
    city: String(row.city),
    state: String(row.state),
    crm: String(row.crm),
  };
}

type LeadPeriod = Pick<V2Filters, "dateFrom" | "dateTo">;

/** Private SELECT shared with CRM preparation; never serialize raw provenance. */
export const V2_COUNTING_SOURCE_SELECT = `SELECT l.id,l.leadDate AS date,l.leadHour AS hour,l.name,l.model,l.version,l.channel,l.campaign,l.dealer,l.city,l.state,l.crm,
  l.sourceSheet,r.headersJson,r.valuesJson,r.sourceTimestampRaw
  FROM v2_leads l LEFT JOIN v2_lead_sync_rows r ON r.sourceId=1 AND r.leadId=l.id
  ORDER BY CASE l.sourceSheet WHEN 'Site' THEN 0 WHEN 'Interlagos' THEN 1 WHEN 'Tiktok - Live' THEN 2 WHEN 'Tikok' THEN 3 WHEN 'Meta' THEN 4 WHEN 'Weebmotors' THEN 5 WHEN 'Mercado Livre' THEN 6 WHEN 'Uol' THEN 7 ELSE 8 END,l.sourceRow,l.id`;

export const V2_COUNTING_PAGE_SIZE = 1000;

function toLegacyCountingInput(row: RowDataPacket) {
  return {
    lead: mapV2LeadRow(row),
    provenance: {
      sourceSheet: row.sourceSheet,
      headersJson: row.headersJson,
      valuesJson: row.valuesJson,
      sourceTimestampRaw: row.sourceTimestampRaw,
    },
  };
}

export function mapLegacyCountedLeadRows(
  raw: readonly RowDataPacket[]
): V2Lead[] {
  const counter = createLegacyLeadCountingAccumulator();
  for (const row of raw) counter.add(toLegacyCountingInput(row));
  return counter.finish();
}

let countingCache: { version: string; rows: Promise<V2Lead[]> } | undefined;
export function invalidateAnalyticalCache(): void {
  countingCache = undefined;
}

async function readCountedSourceRows(): Promise<V2Lead[]> {
  const pool = getV2Pool();
  const [sources] = await pool.query<RowDataPacket[]>(
    "SELECT importedAt,totalRows,inputSha256 FROM v2_sources WHERE id=1"
  );
  const version = sources[0]?.importedAt
    ? JSON.stringify([
        sources[0].importedAt,
        sources[0].totalRows,
        sources[0].inputSha256,
      ])
    : null;
  const load = async () => {
    // Read the complete snapshot before date filtering: corrected dates can cross
    // a month boundary. Pages bound the raw JSON/payload working set while the
    // accumulator preserves canonical first-occurrence precedence across pages.
    const counter = createLegacyLeadCountingAccumulator();
    if (pool.pool) {
      // mysql2 exposes its core pool for streaming. Backpressure bounds private
      // rows without rerunning the full ordered SELECT for every OFFSET page.
      const stream = pool.pool
        .query(V2_COUNTING_SOURCE_SELECT)
        .stream({ highWaterMark: 32 });
      for await (const row of stream)
        counter.add(toLegacyCountingInput(row as RowDataPacket));
      return counter.finish();
    }
    for (let offset = 0; ; offset += V2_COUNTING_PAGE_SIZE) {
      const [raw] = await pool.execute<RowDataPacket[]>(
        `${V2_COUNTING_SOURCE_SELECT} LIMIT ${V2_COUNTING_PAGE_SIZE} OFFSET ${offset}`
      );
      for (const row of raw) counter.add(toLegacyCountingInput(row));
      if (raw.length < V2_COUNTING_PAGE_SIZE) break;
    }
    return counter.finish();
  };
  if (!version) return load();
  if (countingCache?.version === version) return countingCache.rows;
  const rows = load();
  countingCache = { version, rows };
  try {
    return await rows;
  } catch (error) {
    if (countingCache?.rows === rows) countingCache = undefined;
    throw error;
  }
}

/** Shared analytical source; physical v2_leads and Envios remain unmodified. */
export async function readV2LeadsForPeriod(
  periodOrDateFrom: LeadPeriod | string,
  dateTo?: string
): Promise<V2Lead[]> {
  const dateFrom =
    typeof periodOrDateFrom === "string"
      ? periodOrDateFrom
      : periodOrDateFrom.dateFrom;
  const end =
    typeof periodOrDateFrom === "string" ? dateTo : periodOrDateFrom.dateTo;
  if (!end) throw new Error("Período de leads incompleto");
  const rows = await readCountedSourceRows();
  return rows
    .filter(row => row.date >= dateFrom && row.date <= end)
    .map(row => ({ ...row }));
}

export function aggregateV2Leads(
  all: V2Lead[],
  input: V2Filters,
  goal: number | null,
  source: V2Dashboard["source"],
  now = new Date(),
  extraDealers: readonly ExtraDealerRegistryEntry[] = []
): V2Dashboard {
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const baseRows = filterV2LeadRows(
    all,
    { dateFrom: period.dateFrom, dateTo: period.dateTo },
    now,
    extraDealers
  );
  const rows = filterV2LeadRows(all, input, now, extraDealers);
  const monthFrom = `${period.dateTo.slice(0, 7)}-01`;
  const mtdRows = filterV2LeadRows(
    all,
    { ...input, dateFrom: monthFrom, dateTo: period.dateTo },
    now,
    extraDealers
  );
  // A global monthly goal is not compared with a single-channel/model/dealer subset.
  const narrowed = Boolean(
    input.model ||
      input.channel ||
      input.campaign ||
      input.dealer ||
      input.search
  );
  const historicalWindow = historicalLeadPaceWindow(input, now);
  const historicalRows = filterV2LeadRows(
    all,
    {
      ...input,
      dateFrom: historicalWindow.dateFrom,
      dateTo: historicalWindow.dateTo,
    },
    now,
    extraDealers
  );
  const historicalPace = buildHistoricalLeadPace(
    all,
    input,
    narrowed ? null : goal,
    source,
    now,
    extraDealers,
    { filteredRows: historicalRows }
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
    dealers = countBy(rows, "dealer", extraDealers),
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
    const sourceAvailable =
      Boolean(source.importedAt) &&
      (source.latestLeadDate === undefined ||
        (source.latestLeadDate !== null && date <= source.latestLeadDate));
    daily.push({
      date,
      total: sourceAvailable ? value.total : null,
      channels: sourceAvailable ? value.channels : {},
      cumulative: sourceAvailable ? cumulative : null,
      sourceAvailable,
      pace:
        pacing.goal == null || period.dateFrom !== monthFrom
          ? null
          : (pacing.goal / pacing.daysInMonth) * Number(date.slice(8, 10)),
    });
  }
  const page = input.page ?? 1,
    pageSize = 50;
  const dealerRows = dealers.map(item => ({
    dealer: item.label,
    state:
      findDealerRegistryEntry(item.label, extraDealers)?.state ??
      rows.find(row => row.dealer === item.label)?.state ??
      "Não informado",
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
      models: [
        ...new Set([
          ...OFFICIAL_MODELS,
          ...countBy(baseRows, "model").map(v => v.label),
        ]),
      ],
      channels: countBy(baseRows, "channel").map(v => v.label),
      campaigns: countBy(baseRows, "campaign").map(v => v.label),
      dealers: [
        ...new Set([
          ...combinedDealerRegistry(extraDealers).map(dealer => dealer.name),
          ...countBy(baseRows, "dealer", extraDealers).map(v => v.label),
        ]),
      ],
    },
    dealerRegistry: dealerRegistryList(extraDealers),
    summary: {
      total: rows.length,
      models: models.filter(
        item => resolveOfficialModel(item.label) && item.count > 0
      ).length,
      dealers: known(dealers).length,
      states: states.filter(
        item => resolveBrazilianState(item.label) && item.count > 0
      ).length,
      cities: known(cities).length,
      crmRate: null,
      crmDelivered: null,
      topModel:
        models.find(
          item => resolveOfficialModel(item.label) && item.count > 0
        ) ?? null,
      topState:
        states.find(
          item => resolveBrazilianState(item.label) && item.count > 0
        ) ?? null,
      peakHour: known(hours)[0] ?? null,
    },
    pacing,
    historicalPace,
    daily,
    channels,
    models,
    states,
    regionalModels: aggregateRegionalModels(rows),
    modelAnalysis: aggregateModelAnalysis(rows, extraDealers),
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
      "Contagem analítica compatível com o dashboard antigo: deduplicação por conteúdo e ciclo de canais, antes dos filtros. Registros físicos e proveniência permanecem preservados; não representa pessoas únicas nem comprova entrega CRM.",
      "Data analítica e validação de modelo/concessionária seguem o transformador da versão antiga sobre os campos de cada aba; Site prioriza data. Atualizar base sincroniza a planilha mediante ação administrativa.",
      "Pacing usa o acumulado do mês até a data final, enquanto gráficos e KPIs usam o período selecionado.",
      "Nomes originais de Leads preservados; distribuição por dealer e modelo usa de-para explícito. Linhas que não passam a validação histórica permanecem na base bruta, fora da contagem analítica.",
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
  const now = new Date();
  const period = resolveDashboardPeriod(input.dateFrom, input.dateTo, now);
  const historicalWindow = historicalLeadPaceWindow(input, now);
  const from = historicalWindow.dateFrom;
  const [[sourceRows], rows, extraDealers, goal] = await Promise.all([
    getV2Pool().query<RowDataPacket[]>(
      "SELECT name,importedAt,totalRows,invalidDateRows,(SELECT MIN(leadDate) FROM v2_leads) AS earliestLeadDate,(SELECT MAX(leadDate) FROM v2_leads) AS latestLeadDate FROM v2_sources WHERE id=1"
    ),
    readV2LeadsForPeriod(from, period.dateTo),
    readExtraDealerRegistry(),
    getV2Goal(period.dateTo.slice(0, 7)),
  ]);
  const source: V2Dashboard["source"] = {
    name: "LEADS MG — Base",
    importedAt: null,
    mode: "authenticated-import",
    totalRows: 0,
    invalidDateRows: 0,
    earliestLeadDate: null,
    latestLeadDate: null,
  };
  if (sourceRows[0]) {
    source.name = String(sourceRows[0].name);
    source.importedAt = sourceRows[0].importedAt
      ? new Date(sourceRows[0].importedAt).toISOString()
      : null;
    source.totalRows = Number(sourceRows[0].totalRows);
    source.invalidDateRows = Number(sourceRows[0].invalidDateRows);
    source.earliestLeadDate = sourceRows[0].earliestLeadDate
      ? String(sourceRows[0].earliestLeadDate)
      : null;
    source.latestLeadDate = sourceRows[0].latestLeadDate
      ? String(sourceRows[0].latestLeadDate)
      : null;
  }
  const dashboard = aggregateV2Leads(
    rows,
    input,
    goal,
    source,
    now,
    extraDealers
  );
  return {
    ...dashboard,
    dealerPerformance: await getCommercialPerformance(dashboard, input),
    checkedAt: new Date().toISOString(),
  };
}
