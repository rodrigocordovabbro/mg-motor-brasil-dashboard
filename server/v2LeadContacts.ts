import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool } from "./v2Db";
import { resolveOfficialModel } from "../shared/modelRegistry";
import { resolveModelVersion } from "./v2ModelAnalysis";
import type { V2Lead } from "../shared/v2Types";

/** Contact/vehicle enrichment is deliberately bounded to the current page. */
export const V2_LEAD_CONTACTS_BATCH_SIZE = 50;

/**
 * This query is the only database shape used by the dashboard enrichment. It
 * joins provenance by the canonical physical ID, never by a name or contact.
 * The values are parameterized by buildV2LeadContactsSelect().
 */
const V2_LEAD_CONTACTS_SELECT = `SELECT l.id,l.sourceSheet,l.model,l.version,r.headersJson,r.valuesJson
  FROM v2_leads l
  LEFT JOIN v2_lead_sync_rows r ON r.sourceId=1 AND r.leadId=l.id
  WHERE l.id IN (__IDS__)
  ORDER BY l.id,r.sourceSheet,r.sourceRow`;

export type V2LeadContactDetails = {
  email: string | null;
  phone: string | null;
  interestVehicle: string | null;
};

export type V2LeadContactSource = {
  sourceSheet?: unknown;
  model?: unknown;
  version?: unknown;
  headersJson?: unknown;
  valuesJson?: unknown;
};

type JsonArrayResult =
  | { status: "missing"; values: null }
  | { status: "valid"; values: unknown[] }
  | { status: "invalid"; values: null };

type ProvenanceResult =
  | { status: "missing"; headers: null; values: null }
  | { status: "valid"; headers: unknown[]; values: unknown[] }
  | { status: "invalid"; headers: null; values: null };

type LeadContactExecutor = Pick<ReturnType<typeof getV2Pool>, "execute">;

const UNKNOWN_VALUES = new Set([
  "",
  "indisponivel",
  "na",
  "naoinformado",
  "nd",
  "null",
  "undefined",
]);

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "");

function textValue(value: unknown): string | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.toString("utf8").trim() || null;
  if (value instanceof Uint8Array)
    return Buffer.from(value).toString("utf8").trim() || null;
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "bigint"
  )
    return null;
  const text = String(value).trim();
  if (UNKNOWN_VALUES.has(normalizeHeader(text))) return null;
  return text || null;
}

function parseJsonArray(value: unknown): JsonArrayResult {
  if (value == null) return { status: "missing", values: null };
  if (Array.isArray(value)) return { status: "valid", values: value };
  let parsed: unknown;
  try {
    if (Buffer.isBuffer(value)) parsed = JSON.parse(value.toString("utf8"));
    else if (value instanceof Uint8Array)
      parsed = JSON.parse(Buffer.from(value).toString("utf8"));
    else if (typeof value === "string") parsed = JSON.parse(value);
    else return { status: "invalid", values: null };
  } catch {
    return { status: "invalid", values: null };
  }
  return Array.isArray(parsed)
    ? { status: "valid", values: parsed }
    : { status: "invalid", values: null };
}

function parseProvenance(source: V2LeadContactSource): ProvenanceResult {
  const headers = parseJsonArray(source.headersJson);
  const values = parseJsonArray(source.valuesJson);
  if (headers.status === "missing" && values.status === "missing")
    return { status: "missing", headers: null, values: null };
  if (headers.status !== "valid" || values.status !== "valid")
    return { status: "invalid", headers: null, values: null };
  // Sheets omits trailing empty cells. Header and value arrays remain positional;
  // a shorter row is valid and aliases beyond its last cell simply have no value.
  return { status: "valid", headers: headers.values, values: values.values };
}

function sourceKey(sourceSheet: unknown): string {
  return normalizeHeader(sourceSheet);
}

function aliasesForSource(
  sourceSheet: unknown,
  field: "email" | "phone"
): string[] {
  const source = sourceKey(sourceSheet);
  const site = source === "site";
  const meta = source === "meta";
  const marketplace =
    source === "mercadolivre" ||
    source === "marketplace" ||
    source === "weebmotors" ||
    source === "webmotors";
  const oldMercadoLivre = source === "mercadolivre";
  if (field === "email") {
    if (site)
      return [
        "E-mail do solicitante",
        "Email do solicitante",
        "E-mail",
        "Email",
      ];
    if (meta) return ["email", "Email", "E-mail"];
    if (marketplace)
      return [
        "email",
        "usuario_mail",
        "contato_mail",
        "E-mail",
        "Email",
        ...(oldMercadoLivre ? ["Chave_2"] : []),
      ];
    return ["email", "E-mail", "Email"];
  }
  if (site)
    return [
      "Número de telefone do solicitante",
      "Numero de telefone do solicitante",
      "Telefone",
      "Phone",
    ];
  if (meta)
    return ["phone_number", "Phone number", "Phone", "Telefone", "phone"];
  if (source === "interlagos")
    return ["phone_e164", "Phone", "Phone number", "Telefone"];
  if (marketplace)
    return [
      "usuario_fone",
      "contato_fone",
      "phone_e164",
      "whatsapp",
      "Phone",
      "Phone number",
      "Telefone",
      ...(oldMercadoLivre ? ["Chave_3"] : []),
    ];
  return ["phone", "Phone", "Phone number", "Telefone", "whatsapp"];
}

function firstAliasedValue(
  headers: readonly unknown[],
  values: readonly unknown[],
  aliases: readonly string[]
): string | null {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    for (let index = 0; index < normalizedHeaders.length; index += 1) {
      if (normalizedHeaders[index] !== key) continue;
      const value = textValue(values[index]);
      if (value != null) return value;
    }
  }
  return null;
}

function fallbackInterestVehicle(
  model: unknown,
  version: unknown
): string | null {
  const mappedModel = resolveOfficialModel(String(model ?? ""));
  if (!mappedModel) return null;
  const resolvedVersion = resolveModelVersion(model, version);
  const mappedVersion =
    resolvedVersion.status === "IDENTIFIED"
      ? textValue(resolvedVersion.version)
      : null;
  return [mappedModel, mappedVersion].filter(Boolean).join(" · ") || null;
}

function emptyDetails(): V2LeadContactDetails {
  return { email: null, phone: null, interestVehicle: null };
}

/**
 * Extract only the three whitelisted opportunity-detail fields. Invalid
 * provenance fails closed; in particular it never logs or serializes payload
 * contents. Missing provenance still permits the canonical model/version
 * fallback because those values are already on the opportunity row.
 */
export function extractV2LeadContactDetails(
  source: V2LeadContactSource,
  canonical: Pick<V2Lead, "model" | "version"> = {
    model: String(source.model ?? ""),
    version: String(source.version ?? ""),
  }
): V2LeadContactDetails {
  const provenance = parseProvenance(source);
  if (provenance.status === "invalid") return emptyDetails();
  if (provenance.status === "missing")
    return {
      ...emptyDetails(),
      interestVehicle: fallbackInterestVehicle(
        canonical.model,
        canonical.version
      ),
    };
  const { headers, values } = provenance;
  const interestVehicle = firstAliasedValue(headers, values, [
    "interest_model",
    "Modelo de Interesse",
    "modelo",
    "model",
  ]);
  return {
    email: firstAliasedValue(
      headers,
      values,
      aliasesForSource(source.sourceSheet, "email")
    ),
    phone: firstAliasedValue(
      headers,
      values,
      aliasesForSource(source.sourceSheet, "phone")
    ),
    interestVehicle:
      interestVehicle ??
      fallbackInterestVehicle(canonical.model, canonical.version),
  };
}

export function buildV2LeadContactsSelect(idCount: number): string {
  if (
    !Number.isInteger(idCount) ||
    idCount < 1 ||
    idCount > V2_LEAD_CONTACTS_BATCH_SIZE
  )
    throw new Error("A consulta de detalhes de Leads exige IDs.");
  return V2_LEAD_CONTACTS_SELECT.replace(
    "__IDS__",
    Array.from({ length: idCount }, () => "?").join(",")
  );
}

function validLeadId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

function nullContactRow(row: V2Lead): V2Lead {
  return {
    ...row,
    email: null,
    phone: null,
    interestVehicle:
      validLeadId(row.id) === null
        ? null
        : fallbackInterestVehicle(row.model, row.version),
  };
}

/**
 * Enriches only the supplied page, preserving row order and canonical fields.
 * A caller may pass more than one page; IDs are deduplicated and queried in
 * parameterized batches of at most fifty.
 */
export async function enrichV2LeadContacts(
  rows: readonly V2Lead[],
  executor: LeadContactExecutor = getV2Pool()
): Promise<V2Lead[]> {
  if (rows.length === 0) return [];
  // The same bounded lookup also serves full exports. Index once rather than
  // searching the complete population for every returned provenance row.
  const canonicalById = new Map<number, V2Lead>();
  for (const row of rows) {
    const id = validLeadId(row.id);
    if (id !== null && !canonicalById.has(id)) canonicalById.set(id, row);
  }
  const ids = [...canonicalById.keys()];
  const byId = new Map<number, V2LeadContactDetails>();
  for (
    let offset = 0;
    offset < ids.length;
    offset += V2_LEAD_CONTACTS_BATCH_SIZE
  ) {
    const batch = ids.slice(offset, offset + V2_LEAD_CONTACTS_BATCH_SIZE);
    const [sourceRows] = await executor.execute<RowDataPacket[]>(
      buildV2LeadContactsSelect(batch.length),
      batch
    );
    for (const sourceRow of sourceRows) {
      const id = validLeadId(sourceRow.id);
      if (id === null || byId.has(id)) continue;
      const matchingLead = canonicalById.get(id);
      if (!matchingLead) continue;
      byId.set(
        id,
        extractV2LeadContactDetails(sourceRow as V2LeadContactSource, {
          model: matchingLead.model,
          version: matchingLead.version,
        })
      );
    }
  }
  return rows.map(row => {
    const id = validLeadId(row.id);
    const details = id === null ? undefined : byId.get(id);
    return details ? { ...row, ...details } : nullContactRow(row);
  });
}
