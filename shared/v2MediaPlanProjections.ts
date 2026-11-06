import type {
  MediaPlanRow,
  MediaPlanTotal,
  MonthlyMediaPlan,
} from "./v2MediaPlan";

export const MAX_MEDIA_PLAN_PROJECTION_LEADS = 10_000_000;
export const MEDIA_PLAN_PROJECTION_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type MediaPlanProjectionValues = {
  /** Explicit manual override for the monthly total. Zero is meaningful. */
  globalLeads?: number;
  /** Sparse overrides keyed by the approved product label. */
  products: Record<string, number>;
  /** Sparse overrides keyed by the approved source row id. */
  rows: Record<string, number>;
};

/** Nullable patch: null removes a sparse override and restores the approved source. */
export type MediaPlanProjectionPatch = {
  globalLeads?: number | null;
  products?: Record<string, number | null>;
  rows?: Record<string, number | null>;
};

export type MediaPlanProjectionRead = {
  monthId: string;
  version: number;
  values: MediaPlanProjectionValues;
};

export type MediaPlanProjectionUpdateResult = MediaPlanProjectionRead & {
  success: true;
};

export type MediaPlanProjectionMetadata = {
  version: number;
  values: MediaPlanProjectionValues;
  globalManual: boolean;
  /** Present only when the headline total is a manual override. */
  hint?: "Total manual; projeções detalhadas mantidas";
};

/** The source fields remain intact; only forecast leads/CPL and metadata are augmented. */
export type MediaPlanWithProjectionOverrides = MonthlyMediaPlan & {
  projectionOverrides?: MediaPlanProjectionMetadata;
};

function hasOwn(
  values: Record<string, number> | undefined,
  key: string
): boolean {
  return values != null && Object.prototype.hasOwnProperty.call(values, key);
}

function sumKnown(values: Array<number | null | undefined>): number | null {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function cpl(
  netInvestment: number | null | undefined,
  leads: number | null | undefined
) {
  return netInvestment != null && leads != null && leads > 0
    ? netInvestment / leads
    : null;
}

function productKey(total: MediaPlanTotal): string | null {
  return total.product?.trim() || null;
}

function effectiveRowLeads(
  row: MediaPlanRow,
  values: MediaPlanProjectionValues
): number | null | undefined {
  return hasOwn(values.rows, row.id) ? values.rows[row.id] : row.leads;
}

/**
 * Applies sparse forecast overrides without mutating the imported plan.
 *
 * A row override recomputes only the containing product from numeric row
 * forecasts. A product override takes precedence over row edits for that
 * product, while leaving the row/source forecasts untouched. The global total
 * is the sum of known product totals when every product can be reconciled;
 * otherwise the approved global forecast is retained instead of fabricating an
 * allocation for products whose source has no lead forecast. An explicit global
 * override always wins and changes only the global headline/CPL.
 */
export function applyMediaPlanProjectionOverrides(
  plan: MonthlyMediaPlan | MediaPlanWithProjectionOverrides,
  read:
    | MediaPlanProjectionRead
    | { version?: number; values: MediaPlanProjectionValues }
): MediaPlanWithProjectionOverrides {
  const values = read.values;
  const sourceRows = plan.rows.map(row => ({ ...row }));
  const sourceTotals = plan.totals.map(total => ({ ...total }));
  const sourceTotal = { ...plan.total };

  const rowsByProduct = new Map<string, MediaPlanRow[]>();
  for (const row of sourceRows) {
    const rows = rowsByProduct.get(row.product) ?? [];
    rows.push(row);
    rowsByProduct.set(row.product, rows);
  }

  const effectiveRows = sourceRows.map(row => {
    const rowHasOverride = hasOwn(values.rows, row.id);
    const leads = effectiveRowLeads(row, values);
    return {
      ...row,
      leads,
      cpl: rowHasOverride ? cpl(row.netInvestment, leads) : row.cpl,
    };
  });

  const effectiveProductLeads = new Map<string, number | null | undefined>();
  const effectiveTotals = sourceTotals.map(total => {
    const key = productKey(total);
    if (!key) return { ...total };
    const productRows = rowsByProduct.get(key) ?? [];
    const hasRowOverride = productRows.some(row => hasOwn(values.rows, row.id));
    const hasProductOverride = hasOwn(values.products, key);
    let leads: number | null | undefined = total.leads;
    if (hasProductOverride) {
      leads = values.products[key];
    } else if (hasRowOverride) {
      leads = sumKnown(
        effectiveRows.filter(row => row.product === key).map(row => row.leads)
      );
    }
    effectiveProductLeads.set(key, leads);
    const changed = hasProductOverride || hasRowOverride;
    return {
      ...total,
      leads: leads == null ? undefined : leads,
      cpl: changed
        ? (cpl(total.netInvestment, leads ?? null) ?? undefined)
        : total.cpl,
    };
  });

  const productTotals = effectiveTotals.filter(
    total => productKey(total) !== null
  );
  const productLeads = productTotals.map(total => {
    const key = productKey(total) as string;
    return effectiveProductLeads.get(key) ?? total.leads;
  });
  const allProductsReconciled =
    productTotals.length > 0 && productLeads.every(value => value != null);
  const summedProducts = allProductsReconciled
    ? (productLeads as number[]).reduce((sum, value) => sum + value, 0)
    : null;
  const anyDetailedOverride =
    Object.keys(values.products).length > 0 ||
    Object.keys(values.rows).length > 0;
  const globalManual = values.globalLeads !== undefined;
  const globalLeads = globalManual
    ? values.globalLeads
    : anyDetailedOverride
      ? (summedProducts ?? sourceTotal.leads ?? null)
      : (sourceTotal.leads ?? null);
  const globalChanged =
    globalManual || (anyDetailedOverride && summedProducts != null);
  const effectiveTotal = {
    ...sourceTotal,
    leads: globalLeads == null ? undefined : globalLeads,
    cpl: globalChanged
      ? (cpl(sourceTotal.netInvestment, globalLeads) ?? undefined)
      : sourceTotal.cpl,
  };

  const inheritedMetadata =
    "projectionOverrides" in plan ? plan.projectionOverrides : undefined;
  const version = read.version ?? inheritedMetadata?.version ?? 0;
  const metadata: MediaPlanProjectionMetadata = {
    version,
    values: {
      ...(globalManual ? { globalLeads: values.globalLeads } : {}),
      products: { ...values.products },
      rows: { ...values.rows },
    },
    globalManual,
    ...(globalManual
      ? { hint: "Total manual; projeções detalhadas mantidas" as const }
      : {}),
  };

  return {
    ...plan,
    rows: effectiveRows,
    totals: effectiveTotals,
    total: effectiveTotal,
    projectionOverrides: metadata,
  };
}

export function emptyMediaPlanProjectionValues(): MediaPlanProjectionValues {
  return { products: {}, rows: {} };
}

export function isMediaPlanProjectionMonth(value: string): boolean {
  return MEDIA_PLAN_PROJECTION_MONTH_PATTERN.test(value.trim());
}

export function validateMediaPlanProjectionLead(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_MEDIA_PLAN_PROJECTION_LEADS
  )
    throw new Error(
      `Informe um número inteiro entre 0 e ${MAX_MEDIA_PLAN_PROJECTION_LEADS.toLocaleString("pt-BR")}.`
    );
  return value;
}
