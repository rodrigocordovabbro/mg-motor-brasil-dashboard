import { canonicalizeDealerForAnalytics } from "./dealerNormalization";
import { isMg4UrbanLeadModel } from "./leadsCsv";

export const LEADS_UNAVAILABLE = "Indisponível";
export const LEAD_CHANNEL_UPDATE_EXCLUSIONS = ["Campanha Urban"] as const;

export type LeadAnalyticsRow = {
  correctedDate: string;
  channel: string;
  sourceChannel?: string;
  model: string;
  region: string;
  dealerName: string;
};

export type LeadBreakdownItem = {
  value: string;
  leads: number;
  dailyAverage: number;
  sharePercent: number;
};

export type LeadChannelTargetDefinition = {
  target: number;
  targetLabel: string;
  sourceChannels: string[];
};

export type LeadChannelTargetMap = Record<string, LeadChannelTargetDefinition>;

export type LeadChannelBreakdownItem = LeadBreakdownItem & {
  target: number | null;
  targetActual: number | null;
  achievementPercent: number | null;
  remainingToTarget: number | null;
  targetLabel: string | null;
};

export type LeadChannelTargetSummary = {
  totalLeadTarget: number;
  totalChannelTarget: number;
  channelDifference: number;
};

export type LeadDailyPoint = {
  date: string;
  total: number;
  rollingAverage7d: number;
  values: Record<string, number>;
};

export type LeadDealerAuditItem = {
  dealerName: string;
  leads: number;
  dailyAverage: number;
  sharePercent: number;
  channels: LeadBreakdownItem[];
  activeDays: number;
  inactiveDays: number;
  firstReceiptDate: string | null;
  lastReceiptDate: string | null;
  latestDayLeads: number;
  daysSinceLastReceipt: number | null;
  isUnavailable: boolean;
  receiptStatus: "RECEIVING" | "NO_RECEIPT" | "UNAVAILABLE";
};

export type LeadDealerDailyPoint = {
  date: string;
  dealerName: string;
  leads: number;
  isUnavailable: boolean;
};

export type LeadDealerAudit = {
  summary: {
    validDealers: number;
    assignedLeads: number;
    unavailableLeads: number;
    assignedSharePercent: number;
    dealersReceivingOnLatestDay: number;
    latestDay: string;
  };
  dealers: LeadDealerAuditItem[];
  unavailable: LeadDealerAuditItem | null;
  daily: LeadDealerDailyPoint[];
};

export type LeadPacing = {
  competence: string;
  goal: number | null;
  current: number;
  progressPercent: number | null;
  closedDays: number;
  daysInMonth: number;
  daysRemaining: number;
  averagePerDay: number;
  requiredPerDay: number | null;
  projection: number;
  projectedDifference: number | null;
  remainingToGoal: number | null;
  asOfDate: string | null;
  status: "AHEAD" | "BEHIND" | "ON_TRACK" | "NO_GOAL" | "NO_DATA";
};

export type LeadChannelUpdateStatus = {
  date: string;
  updatingChannels: string[];
};

export type LeadAnalytics = {
  summary: {
    totalLeads: number;
    dailyAverage: number;
    primaryChannel: string | null;
    primaryChannelLeads: number;
    activeChannels: number;
    calendarDays: number;
  };
  pacing: LeadPacing;
  channels: LeadChannelBreakdownItem[];
  channelTargetSummary: LeadChannelTargetSummary | null;
  models: LeadBreakdownItem[];
  mg4UrbanSourceChannels: LeadBreakdownItem[];
  regions: LeadBreakdownItem[];
  dealers: LeadBreakdownItem[];
  dealerAudit: LeadDealerAudit;
  daily: LeadDailyPoint[];
  channelOrder: string[];
  channelUpdate: LeadChannelUpdateStatus;
};

export type BuildLeadAnalyticsInput = {
  rows: LeadAnalyticsRow[];
  pacingRows: Array<Pick<LeadAnalyticsRow, "correctedDate">>;
  channelTargetRows?: LeadAnalyticsRow[];
  pacingAsOfDate?: string;
  channelUpdateRows?: LeadAnalyticsRow[];
  channelUpdateDate?: string;
  dateFrom: string;
  dateTo: string;
  competence: string;
  goal: number | null;
  expectedChannels?: string[];
  channelTargetDefinitions?: LeadChannelTargetMap;
  channelTargetSummary?: LeadChannelTargetSummary | null;
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function assertIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Data inválida: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Data inválida: ${value}`);
  }
  return date;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(value: string, amount: number): string {
  const date = assertIsoDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatIsoDate(date);
}

export function startOfUtcMonth(value: string): string {
  const date = assertIsoDate(value);
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-01`;
}

export function endOfUtcMonth(value: string): string {
  const date = assertIsoDate(value);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return formatIsoDate(end);
}

export function calendarDaysInclusive(dateFrom: string, dateTo: string): number {
  const from = assertIsoDate(dateFrom);
  const to = assertIsoDate(dateTo);
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days < 1) throw new Error("A data inicial precisa ser anterior ou igual à data final.");
  return days;
}

export function listIsoDates(dateFrom: string, dateTo: string): string[] {
  const days = calendarDaysInclusive(dateFrom, dateTo);
  return Array.from({ length: days }, (_, index) => addUtcDays(dateFrom, index));
}

const CHANNEL_UPDATE_EXCLUSION_KEYS = new Set(
  LEAD_CHANNEL_UPDATE_EXCLUSIONS.map(channel => channel.toLocaleLowerCase("pt-BR")),
);

function normalizeChannel(value: string): string {
  return value.trim() || LEADS_UNAVAILABLE;
}

function isUrbanCampaignClassification(value: string): boolean {
  return normalizeChannel(value).toLocaleLowerCase("pt-BR") === "campanha urban";
}

export function resolveLeadReportingChannel(
  row: Pick<LeadAnalyticsRow, "channel" | "sourceChannel">,
): string {
  const sourceChannel = normalizeChannel(row.sourceChannel ?? "");
  if (sourceChannel !== LEADS_UNAVAILABLE && !isUrbanCampaignClassification(sourceChannel)) {
    return sourceChannel;
  }
  const storedChannel = normalizeChannel(row.channel);
  return isUrbanCampaignClassification(storedChannel) ? LEADS_UNAVAILABLE : storedChannel;
}

function canShowChannelUpdate(channel: string): boolean {
  const normalized = normalizeChannel(channel);
  return (
    normalized !== LEADS_UNAVAILABLE &&
    !CHANNEL_UPDATE_EXCLUSION_KEYS.has(normalized.toLocaleLowerCase("pt-BR"))
  );
}

function sortCounts(counter: Map<string, number>): Array<[string, number]> {
  return Array.from(counter.entries()).sort(
    ([valueA, countA], [valueB, countB]) => countB - countA || valueA.localeCompare(valueB, "pt-BR"),
  );
}

function buildBreakdown(
  rows: LeadAnalyticsRow[],
  pick: (row: LeadAnalyticsRow) => string,
  calendarDays: number,
): LeadBreakdownItem[] {
  const counter = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row).trim() || LEADS_UNAVAILABLE;
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  const total = rows.length;
  return sortCounts(counter).map(([value, leads]) => ({
    value,
    leads,
    dailyAverage: round(leads / calendarDays),
    sharePercent: total ? round((leads / total) * 100) : 0,
  }));
}

function buildChannelBreakdown(
  rows: LeadAnalyticsRow[],
  monthlyRows: LeadAnalyticsRow[],
  calendarDays: number,
  targetDefinitions: LeadChannelTargetMap,
): LeadChannelBreakdownItem[] {
  const breakdown = buildBreakdown(rows, resolveLeadReportingChannel, calendarDays);
  const existing = new Set(breakdown.map(item => item.value));
  for (const channel of Object.keys(targetDefinitions)) {
    if (existing.has(channel)) continue;
    breakdown.push({ value: channel, leads: 0, dailyAverage: 0, sharePercent: 0 });
  }

  const monthlySourceCounts = new Map<string, number>();
  for (const row of monthlyRows) {
    const source = resolveLeadReportingChannel(row);
    monthlySourceCounts.set(source, (monthlySourceCounts.get(source) ?? 0) + 1);
  }

  return breakdown.map(item => {
    const definition = targetDefinitions[item.value];
    if (!definition) {
      return {
        ...item,
        target: null,
        targetActual: null,
        achievementPercent: null,
        remainingToTarget: null,
        targetLabel: null,
      };
    }
    const targetActual = definition.sourceChannels.reduce(
      (sum, source) => sum + (monthlySourceCounts.get(source) ?? 0),
      0,
    );
    return {
      ...item,
      target: definition.target,
      targetActual,
      achievementPercent: definition.target > 0 ? round((targetActual / definition.target) * 100) : null,
      remainingToTarget: definition.target > 0 ? definition.target - targetActual : null,
      targetLabel: definition.targetLabel,
    };
  });
}

function buildDaily(
  rows: LeadAnalyticsRow[],
  dateFrom: string,
  dateTo: string,
  channelOrder: string[],
): LeadDailyPoint[] {
  const byDate = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const channel = resolveLeadReportingChannel(row);
    let channelCounts = byDate.get(row.correctedDate);
    if (!channelCounts) {
      channelCounts = new Map<string, number>();
      byDate.set(row.correctedDate, channelCounts);
    }
    channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
  }

  const points = listIsoDates(dateFrom, dateTo).map(date => {
    const channelCounts = byDate.get(date);
    const values = Object.fromEntries(
      channelOrder.map(channel => [channel, channelCounts?.get(channel) ?? 0]),
    );
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return { date, total, rollingAverage7d: 0, values };
  });

  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 6), index + 1);
    return {
      ...point,
      rollingAverage7d: round(window.reduce((sum, item) => sum + item.total, 0) / window.length),
    };
  });
}

export type MetaBaseDailyLeadMetric = {
  date: string;
  leads: number;
};

/**
 * Recompõe exclusivamente a faixa diária de Meta a partir da planilha-base
 * de Leads. Os demais canais seguem a série canônica; o retorno deixa a
 * diferença explícita para que a UI não misture as duas regras sem contexto.
 */
export function buildDailyWithMetaBase(
  daily: readonly LeadDailyPoint[],
  metaBaseDaily: readonly MetaBaseDailyLeadMetric[],
) {
  const metaByDate = new Map(metaBaseDaily.map(item => [item.date, Math.max(0, Math.trunc(item.leads))]));
  let canonicalMetaLeads = 0;
  let sourceMetaLeads = 0;
  let appliedDays = 0;

  const reconciled = daily.map(point => {
    const sourceMetaLeadsForDay = metaByDate.get(point.date);
    if (sourceMetaLeadsForDay === undefined) return { ...point, values: { ...point.values } };

    const canonicalMetaLeadsForDay = point.values.Meta ?? 0;
    canonicalMetaLeads += canonicalMetaLeadsForDay;
    sourceMetaLeads += sourceMetaLeadsForDay;
    appliedDays += 1;

    return {
      ...point,
      total: point.total - canonicalMetaLeadsForDay + sourceMetaLeadsForDay,
      values: { ...point.values, Meta: sourceMetaLeadsForDay },
    };
  });

  const dailyWithRollingAverage = reconciled.map((point, index) => {
    const window = reconciled.slice(Math.max(0, index - 6), index + 1);
    return {
      ...point,
      rollingAverage7d: round(window.reduce((sum, item) => sum + item.total, 0) / window.length),
    };
  });

  return {
    daily: dailyWithRollingAverage,
    appliedDays,
    canonicalMetaLeads,
    sourceMetaLeads,
    adjustmentLeads: sourceMetaLeads - canonicalMetaLeads,
  };
}

function buildDealerAudit(
  rows: LeadAnalyticsRow[],
  dateFrom: string,
  dateTo: string,
  calendarDays: number,
): LeadDealerAudit {
  const byDealer = new Map<string, Map<string, number>>();
  const channelsByDealer = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const dealerName = row.dealerName.trim() || LEADS_UNAVAILABLE;
    const channel = resolveLeadReportingChannel(row);
    let byDate = byDealer.get(dealerName);
    if (!byDate) {
      byDate = new Map<string, number>();
      byDealer.set(dealerName, byDate);
    }
    byDate.set(row.correctedDate, (byDate.get(row.correctedDate) ?? 0) + 1);

    let byChannel = channelsByDealer.get(dealerName);
    if (!byChannel) {
      byChannel = new Map<string, number>();
      channelsByDealer.set(dealerName, byChannel);
    }
    byChannel.set(channel, (byChannel.get(channel) ?? 0) + 1);
  }

  const total = rows.length;
  const items = Array.from(byDealer.entries())
    .map(([dealerName, byDate]): LeadDealerAuditItem => {
      const receiptDates = Array.from(byDate.keys()).sort();
      const leads = Array.from(byDate.values()).reduce((sum, value) => sum + value, 0);
      const lastReceiptDate = receiptDates.at(-1) ?? null;
      const isUnavailable = dealerName === LEADS_UNAVAILABLE;
      const latestDayLeads = byDate.get(dateTo) ?? 0;
      const channels = sortCounts(channelsByDealer.get(dealerName) ?? new Map()).map(
        ([value, channelLeads]): LeadBreakdownItem => ({
          value,
          leads: channelLeads,
          dailyAverage: round(channelLeads / calendarDays),
          sharePercent: leads ? round((channelLeads / leads) * 100) : 0,
        }),
      );
      return {
        dealerName,
        leads,
        dailyAverage: round(leads / calendarDays),
        sharePercent: total ? round((leads / total) * 100) : 0,
        channels,
        activeDays: receiptDates.length,
        inactiveDays: Math.max(0, calendarDays - receiptDates.length),
        firstReceiptDate: receiptDates.at(0) ?? null,
        lastReceiptDate,
        latestDayLeads,
        daysSinceLastReceipt: lastReceiptDate
          ? calendarDaysInclusive(lastReceiptDate, dateTo) - 1
          : null,
        isUnavailable,
        receiptStatus: isUnavailable
          ? "UNAVAILABLE"
          : latestDayLeads > 0
            ? "RECEIVING"
            : "NO_RECEIPT",
      };
    })
    .sort((a, b) => b.leads - a.leads || a.dealerName.localeCompare(b.dealerName, "pt-BR"));

  const unavailable = items.find(item => item.isUnavailable) ?? null;
  const dealers = items.filter(item => !item.isUnavailable);
  const assignedLeads = dealers.reduce((sum, item) => sum + item.leads, 0);
  const daily = Array.from(byDealer.entries())
    .flatMap(([dealerName, byDate]) =>
      Array.from(byDate.entries()).map(([date, leads]) => ({
        date,
        dealerName,
        leads,
        isUnavailable: dealerName === LEADS_UNAVAILABLE,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.dealerName.localeCompare(b.dealerName, "pt-BR"));

  return {
    summary: {
      validDealers: dealers.length,
      assignedLeads,
      unavailableLeads: unavailable?.leads ?? 0,
      assignedSharePercent: total ? round((assignedLeads / total) * 100) : 0,
      dealersReceivingOnLatestDay: dealers.filter(item => item.latestDayLeads > 0).length,
      latestDay: dateTo,
    },
    dealers,
    unavailable,
    daily,
  };
}

function buildPacing(
  pacingRows: Array<Pick<LeadAnalyticsRow, "correctedDate">>,
  competence: string,
  goal: number | null,
  pacingAsOfDate?: string,
): LeadPacing {
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competência mensal inválida.");
  const monthStart = `${competence}-01`;
  const monthEnd = endOfUtcMonth(monthStart);
  const daysInMonth = Number(monthEnd.slice(-2));
  if (pacingAsOfDate && (pacingAsOfDate < monthStart || pacingAsOfDate > monthEnd)) {
    throw new Error("A data de corte do pacing precisa pertencer à competência informada.");
  }
  const validDates = pacingRows
    .map(row => row.correctedDate)
    .filter(
      date =>
        date >= monthStart &&
        date <= monthEnd &&
        (!pacingAsOfDate || date <= pacingAsOfDate),
    )
    .sort();
  const current = validDates.length;
  const asOfDate = pacingAsOfDate ?? validDates.at(-1) ?? null;
  const closedDays = asOfDate ? Number(asOfDate.slice(-2)) : 0;
  const daysRemaining = Math.max(0, daysInMonth - closedDays);
  const averagePerDay = closedDays ? round(current / closedDays) : 0;
  const projection = closedDays ? Math.round((current / closedDays) * daysInMonth) : 0;
  const normalizedGoal = goal && goal > 0 ? Math.round(goal) : null;
  const remainingToGoal = normalizedGoal == null ? null : Math.max(0, normalizedGoal - current);
  const requiredPerDay =
    normalizedGoal == null || daysRemaining === 0
      ? remainingToGoal === 0
        ? 0
        : null
      : round(remainingToGoal! / daysRemaining);
  const progressPercent = normalizedGoal == null ? null : round((current / normalizedGoal) * 100);
  const projectedDifference = normalizedGoal == null ? null : projection - normalizedGoal;

  let status: LeadPacing["status"] = "NO_GOAL";
  if (!current) status = normalizedGoal == null ? "NO_GOAL" : "NO_DATA";
  else if (normalizedGoal != null) {
    const idealProgress = closedDays / daysInMonth;
    const actualProgress = current / normalizedGoal;
    if (Math.abs(actualProgress - idealProgress) <= 0.02) status = "ON_TRACK";
    else status = actualProgress > idealProgress ? "AHEAD" : "BEHIND";
  }

  return {
    competence,
    goal: normalizedGoal,
    current,
    progressPercent,
    closedDays,
    daysInMonth,
    daysRemaining,
    averagePerDay,
    requiredPerDay,
    projection,
    projectedDifference,
    remainingToGoal,
    asOfDate,
    status,
  };
}

export function buildLeadAnalytics(input: BuildLeadAnalyticsInput): LeadAnalytics {
  const calendarDays = calendarDaysInclusive(input.dateFrom, input.dateTo);
  const rows = input.rows
    .filter(row => row.correctedDate >= input.dateFrom && row.correctedDate <= input.dateTo)
    .map(row => ({
      ...row,
      dealerName: canonicalizeDealerForAnalytics(row.dealerName),
    }));
  const channels = buildChannelBreakdown(
    rows,
    input.channelTargetRows ?? [],
    calendarDays,
    input.channelTargetDefinitions ?? {},
  );
  const mg4UrbanRows = rows.filter(row => isMg4UrbanLeadModel(row.model));
  const mg4UrbanSourceChannels = buildBreakdown(
    mg4UrbanRows,
    resolveLeadReportingChannel,
    calendarDays,
  );
  const dealers = buildBreakdown(rows, row => row.dealerName, calendarDays);
  const dealerAudit = buildDealerAudit(rows, input.dateFrom, input.dateTo, calendarDays);
  const activeChannelOrder = channels.map(item => item.value);
  const expectedChannels = Array.from(
    new Set(
      [...(input.expectedChannels ?? []), ...activeChannelOrder].map(normalizeChannel),
    ),
  ).filter(
    channel => channel !== LEADS_UNAVAILABLE && !isUrbanCampaignClassification(channel),
  );
  const channelOrder = [
    ...activeChannelOrder,
    ...expectedChannels
      .filter(channel => !activeChannelOrder.includes(channel))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
  ];
  const daily = buildDaily(rows, input.dateFrom, input.dateTo, channelOrder);
  const channelUpdateDate = input.channelUpdateDate ?? input.dateTo;
  const channelUpdateRows = (input.channelUpdateRows ?? rows).filter(
    row => row.correctedDate === channelUpdateDate,
  );
  const channelUpdateCounts = new Map<string, number>();
  for (const row of channelUpdateRows) {
    const channel = resolveLeadReportingChannel(row);
    channelUpdateCounts.set(channel, (channelUpdateCounts.get(channel) ?? 0) + 1);
  }
  const updatingChannels = channelOrder.filter(
    channel => canShowChannelUpdate(channel) && (channelUpdateCounts.get(channel) ?? 0) === 0,
  );
  const primary = channels.find(item => item.value !== LEADS_UNAVAILABLE) ?? null;
  const activeChannels = channels.filter(item => item.value !== LEADS_UNAVAILABLE && item.leads > 0).length;

  return {
    summary: {
      totalLeads: rows.length,
      dailyAverage: round(rows.length / calendarDays),
      primaryChannel: primary?.value ?? null,
      primaryChannelLeads: primary?.leads ?? 0,
      activeChannels,
      calendarDays,
    },
    pacing: buildPacing(
      input.pacingRows,
      input.competence,
      input.goal,
      input.pacingAsOfDate,
    ),
    channels,
    channelTargetSummary: input.channelTargetSummary ?? null,
    models: buildBreakdown(rows, row => row.model, calendarDays),
    mg4UrbanSourceChannels,
    regions: buildBreakdown(rows, row => row.region, calendarDays),
    dealers,
    dealerAudit,
    daily,
    channelOrder,
    channelUpdate: {
      date: channelUpdateDate,
      updatingChannels,
    },
  };
}
