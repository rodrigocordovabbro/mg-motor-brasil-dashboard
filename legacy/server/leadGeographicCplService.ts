import { normalizeDealerLookupKey } from "./dealerNormalization";
import type { LeadDealerAudit } from "./leadsAnalytics";
import type {
  PaidMediaChannel,
  PaidMediaMeasurement,
  PaidMediaSourceStatus,
  MetaBudgetPlan,
} from "./leadMediaInvestmentService";

type GeographicPaidChannel = PaidMediaChannel;

export type GeographicCplDealerTarget = {
  canonicalDealer: string;
  canonicalDealerKey: string;
  stateCode: string;
  channelTargets: {
    google?: number;
    meta?: number;
    tiktok?: number;
  };
};

export type GeographicCplRow = {
  stateCode: string;
  dealerName: string;
  leads: number;
  investment: number | null;
  availableInvestment: number;
  estimatedCpl: number | null;
  channelLeads: Record<GeographicPaidChannel, number>;
  channelInvestment: Record<GeographicPaidChannel, number>;
};

export type GeographicCplStateRow = Omit<GeographicCplRow, "dealerName"> & {
  dealerCount: number;
};

export type LeadGeographicCplReference = {
  dateFrom: string;
  dateTo: string;
  competence: string;
  formula:
    | "ACTUAL_CHANNEL_SPEND_ALLOCATED_BY_DEALER_CHANNEL_TARGET_SHARE"
    | "AUGUST_META_BUDGET_AND_CHANNEL_TARGET_SHARE";
  stateDefinition: "DEALER_OPERATIONAL_STATE";
  allSourcesAvailable: boolean;
  status: PaidMediaSourceStatus;
  totalInvestment: number | null;
  availableInvestment: number;
  paidMediaLeads: number;
  assignedPaidMediaLeads: number;
  unavailableDealerPaidMediaLeads: number;
  unmatchedDealerPaidMediaLeads: number;
  dealerCoveragePercent: number;
  estimatedOverallCpl: number | null;
  targetTotals: Record<GeographicPaidChannel, number>;
  channels: PaidMediaMeasurement[];
  states: GeographicCplStateRow[];
  dealers: GeographicCplRow[];
};

type PaidMediaMeasurements = Record<GeographicPaidChannel, PaidMediaMeasurement>;

const CHANNELS = ["Site", "Meta", "TikTok"] as const;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cpl(investment: number | null, leads: number): number | null {
  return investment != null && leads > 0 ? round(investment / leads) : null;
}

function resolveStatus(measurements: PaidMediaMeasurements): PaidMediaSourceStatus {
  const statuses = CHANNELS.map(channel => measurements[channel].status);
  if (statuses.every(status => status === "AVAILABLE")) return "AVAILABLE";
  if (statuses.every(status => status === "UNAVAILABLE")) return "UNAVAILABLE";
  return "PARTIAL";
}

function allocateCurrencyByWeights(input: {
  investment: number;
  items: Array<{ key: string; weight: number }>;
}): Map<string, number> {
  const investmentCents = Math.round(input.investment * 100);
  const totalWeight = input.items.reduce((sum, item) => sum + safeNumber(item.weight), 0);
  if (investmentCents <= 0 || totalWeight <= 0) {
    return new Map(input.items.map(item => [item.key, 0]));
  }

  const rows = input.items.map(item => {
    const rawCents = (investmentCents * safeNumber(item.weight)) / totalWeight;
    const floorCents = Math.floor(rawCents);
    return { key: item.key, cents: floorCents, remainder: rawCents - floorCents };
  });
  let remainder = investmentCents - rows.reduce((sum, item) => sum + item.cents, 0);
  const byRemainder = [...rows].sort(
    (left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key, "pt-BR"),
  );
  for (let index = 0; remainder > 0; index = (index + 1) % byRemainder.length) {
    byRemainder[index].cents += 1;
    remainder -= 1;
  }
  return new Map(rows.map(item => [item.key, item.cents / 100]));
}

function leadCountByChannel(
  channels: LeadDealerAudit["dealers"][number]["channels"],
): Record<GeographicPaidChannel, number> {
  const counts = new Map(channels.map(item => [item.value, item.leads]));
  return {
    Site: counts.get("Site") ?? 0,
    Meta: counts.get("Meta") ?? 0,
    TikTok: counts.get("TikTok") ?? 0,
  };
}

function totalPaidLeads(channels: LeadDealerAudit["dealers"][number]["channels"]): number {
  const counts = leadCountByChannel(channels);
  return CHANNELS.reduce((sum, channel) => sum + counts[channel], 0);
}

function targetWeight(
  target: GeographicCplDealerTarget,
  channel: GeographicPaidChannel,
): number {
  if (channel === "Site") return safeNumber(target.channelTargets.google);
  if (channel === "Meta") return safeNumber(target.channelTargets.meta);
  return safeNumber(target.channelTargets.tiktok);
}

function targetKey(target: GeographicCplDealerTarget): string {
  return normalizeDealerLookupKey(target.canonicalDealerKey || target.canonicalDealer);
}

export function buildLeadGeographicCplReference(input: {
  dateFrom: string;
  dateTo: string;
  competence: string;
  dealerAudit: LeadDealerAudit;
  dealerTargets: GeographicCplDealerTarget[];
  measurements: PaidMediaMeasurements;
  metaBudgetPlan?: MetaBudgetPlan | null;
}): LeadGeographicCplReference {
  const status = resolveStatus(input.measurements);
  const allSourcesAvailable = status === "AVAILABLE";
  const targetTotals = CHANNELS.reduce<Record<GeographicPaidChannel, number>>(
    (result, channel) => {
      result[channel] = input.dealerTargets.reduce(
        (sum, target) => sum + targetWeight(target, channel),
        0,
      );
      return result;
    },
    { Site: 0, Meta: 0, TikTok: 0 },
  );

  const allocationByChannel = CHANNELS.reduce<Record<GeographicPaidChannel, Map<string, number>>>(
    (result, channel) => {
      result[channel] = allocateCurrencyByWeights({
        investment: input.measurements[channel].investment ?? 0,
        items: input.dealerTargets.map(target => ({
          key: targetKey(target),
          weight: targetWeight(target, channel),
        })),
      });
      return result;
    },
    { Site: new Map(), Meta: new Map(), TikTok: new Map() },
  );

  const auditByDealerKey = new Map(
    input.dealerAudit.dealers.map(dealer => [normalizeDealerLookupKey(dealer.dealerName), dealer]),
  );
  const targetDealerKeys = new Set(input.dealerTargets.map(target => targetKey(target)));
  const dealers = input.dealerTargets
    .map(target => {
      const canonicalTargetKey = targetKey(target);
      const audit = auditByDealerKey.get(canonicalTargetKey);
      const channelLeads = leadCountByChannel(audit?.channels ?? []);
      const leads = CHANNELS.reduce((sum, channel) => sum + channelLeads[channel], 0);
      const channelInvestment = CHANNELS.reduce<Record<GeographicPaidChannel, number>>(
        (result, channel) => {
          result[channel] = allocationByChannel[channel].get(canonicalTargetKey) ?? 0;
          return result;
        },
        { Site: 0, Meta: 0, TikTok: 0 },
      );
      const availableInvestment = round(
        CHANNELS.reduce((sum, channel) => sum + channelInvestment[channel], 0),
      );
      const investment = allSourcesAvailable ? availableInvestment : null;
      return {
        stateCode: target.stateCode,
        dealerName: target.canonicalDealer,
        leads,
        investment,
        availableInvestment,
        estimatedCpl: cpl(investment, leads),
        channelLeads,
        channelInvestment,
      } satisfies GeographicCplRow;
    })
    .sort(
      (left, right) =>
        right.leads - left.leads || left.dealerName.localeCompare(right.dealerName, "pt-BR"),
    );

  const stateMap = new Map<string, GeographicCplStateRow>();
  for (const dealer of dealers) {
    const current = stateMap.get(dealer.stateCode) ?? {
      stateCode: dealer.stateCode,
      dealerCount: 0,
      leads: 0,
      investment: allSourcesAvailable ? 0 : null,
      availableInvestment: 0,
      estimatedCpl: null,
      channelLeads: { Site: 0, Meta: 0, TikTok: 0 },
      channelInvestment: { Site: 0, Meta: 0, TikTok: 0 },
    };
    current.dealerCount += 1;
    current.leads += dealer.leads;
    current.availableInvestment = round(current.availableInvestment + dealer.availableInvestment);
    current.investment = allSourcesAvailable ? current.availableInvestment : null;
    for (const channel of CHANNELS) {
      current.channelLeads[channel] += dealer.channelLeads[channel];
      current.channelInvestment[channel] = round(
        current.channelInvestment[channel] + dealer.channelInvestment[channel],
      );
    }
    current.estimatedCpl = cpl(current.investment, current.leads);
    stateMap.set(dealer.stateCode, current);
  }
  const states = Array.from(stateMap.values()).sort(
    (left, right) => right.leads - left.leads || left.stateCode.localeCompare(right.stateCode),
  );

  const assignedPaidMediaLeads = dealers.reduce((sum, dealer) => sum + dealer.leads, 0);
  const unavailableDealerPaidMediaLeads = input.dealerAudit.unavailable
    ? totalPaidLeads(input.dealerAudit.unavailable.channels)
    : 0;
  const unmatchedDealerPaidMediaLeads = input.dealerAudit.dealers
    .filter(dealer => !targetDealerKeys.has(normalizeDealerLookupKey(dealer.dealerName)))
    .reduce((sum, dealer) => sum + totalPaidLeads(dealer.channels), 0);
  const paidMediaLeads =
    assignedPaidMediaLeads + unavailableDealerPaidMediaLeads + unmatchedDealerPaidMediaLeads;
  const availableInvestment = round(
    CHANNELS.reduce(
      (sum, channel) => sum + (input.measurements[channel].investment ?? 0),
      0,
    ),
  );
  const totalInvestment = allSourcesAvailable ? availableInvestment : null;

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    competence: input.competence,
    formula: input.metaBudgetPlan
      ? "AUGUST_META_BUDGET_AND_CHANNEL_TARGET_SHARE"
      : "ACTUAL_CHANNEL_SPEND_ALLOCATED_BY_DEALER_CHANNEL_TARGET_SHARE",
    stateDefinition: "DEALER_OPERATIONAL_STATE",
    allSourcesAvailable,
    status,
    totalInvestment,
    availableInvestment,
    paidMediaLeads,
    assignedPaidMediaLeads,
    unavailableDealerPaidMediaLeads,
    unmatchedDealerPaidMediaLeads,
    dealerCoveragePercent: paidMediaLeads
      ? round((assignedPaidMediaLeads / paidMediaLeads) * 100)
      : 0,
    estimatedOverallCpl: cpl(totalInvestment, paidMediaLeads),
    targetTotals,
    channels: CHANNELS.map(channel => input.measurements[channel]),
    states,
    dealers,
  };
}
