import { createHash } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDashboardCutoffDate } from "../shared/dashboardDates";
import {
  OFFICIAL_DEALERS,
  officialDealer,
  resolveCommercialDealers,
  resolveOfficialDealer,
} from "../shared/dealerRegistry";
import type {
  CommercialActor,
  CommercialCommitInput,
  CommercialCommitResult,
  CommercialPerformance,
  CommercialPreview,
  CommercialReconciliationResult,
  CommercialSourceRow,
  CommercialSourceSnapshot,
  CommercialStatus,
  CommercialStatusFile,
  CommercialUnmappedRow,
  CommercialUploadInput,
  CommercialUploadKind,
} from "../shared/v2Commercial";
import type {
  V2CommercialGroupRecord,
  V2Dashboard,
  V2Filters,
} from "../shared/v2Types";
import { getV2Pool } from "./v2Db";
import {
  normalizeCommercialText,
  parseCommercialWorkbook,
  type ParsedCommercialWorkbook,
} from "./v2CommercialParser";

const KINDS: CommercialUploadKind[] = ["lead-goals", "sales-goals", "sales"];

type DealerRecord = { dealer: string; state: string | null };
export type CommercialStoredImport = {
  id: number;
  kind: CommercialUploadKind;
  competence: string;
  asOf: string | null;
  sourceWeek: number | null;
  fileName: string;
  fileSha256: string;
  total: number | null;
  rowCount: number;
  rows: CommercialSourceRow[];
  warnings: string[];
  importedAt: string | null;
};
export type CommercialLatestImports =
  | ReadonlyMap<CommercialUploadKind, CommercialStoredImport>
  | Partial<Record<CommercialUploadKind, CommercialStoredImport>>;

type WorkRow = V2Dashboard["dealerPerformance"]["rows"][number] & {
  aliases: string[];
  aliasKeys: string[];
  canonical: string | null;
};
type SourceSnapshotMap = Map<CommercialUploadKind, CommercialStoredImport>;
type QueryExecutor = {
  execute: (...args: any[]) => Promise<[RowDataPacket[], unknown]>;
};

function validateCompetence(competence: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence))
    throw new Error("A competência deve estar no formato AAAA-MM.");
}

function validateAsOf(input: CommercialUploadInput): string | null {
  if (input.kind !== "sales") return null;
  if (input.asOf == null || input.asOf === "")
    throw new Error("Informe a data de referência das vendas.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf))
    throw new Error("A data de referência deve estar no formato AAAA-MM-DD.");
  const parsed = new Date(`${input.asOf}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== input.asOf
  )
    throw new Error("A data de referência é inválida.");
  if (input.asOf.slice(0, 7) !== input.competence)
    throw new Error(
      "A data de referência precisa pertencer à competência selecionada."
    );
  if (input.asOf > getDashboardCutoffDate())
    throw new Error("A data de referência não pode ultrapassar D-1.");
  return input.asOf;
}

function validateKind(kind: string): asserts kind is CommercialUploadKind {
  if (!KINDS.includes(kind as CommercialUploadKind))
    throw new Error("Tipo de carga comercial inválido.");
}

function validateInput(input: CommercialUploadInput): string | null {
  validateKind(input.kind);
  validateCompetence(input.competence);
  return validateAsOf(input);
}

/** MySQL BINARY columns and JSON columns can arrive as Buffer in tests and production. */
function storedText(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return String(value ?? "");
}

function storedJson(value: unknown): unknown {
  if (
    typeof value !== "string" &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Uint8Array)
  )
    return value;
  try {
    return JSON.parse(storedText(value));
  } catch {
    return [];
  }
}

function dealerNames(): string[] {
  return OFFICIAL_DEALERS.map(dealer => dealer.name);
}

function canonicalDealer(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return officialDealer(value)?.name ?? resolveOfficialDealer(value);
}

async function readDealerRecords(
  executor: QueryExecutor
): Promise<DealerRecord[]> {
  const [rows] = await executor.execute(
    "SELECT DISTINCT BINARY dealer AS dealer,BINARY state AS state FROM v2_leads WHERE TRIM(dealer) <> '' ORDER BY BINARY dealer,BINARY state"
  );
  return rows.map(row => ({
    dealer: storedText(row.dealer),
    state:
      row.state == null || storedText(row.state).trim() === ""
        ? null
        : storedText(row.state),
  }));
}

function dealerBase(value: string): string {
  return normalizeCommercialText(value.split(/[\\/]/)[0]);
}

function dealerState(value: string | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^[A-Za-z]{2}$/);
  return match ? match[0].toLocaleUpperCase("pt-BR") : null;
}

function isExplicitlyUnmappedCommercialLabel(value: string): boolean {
  return (
    normalizeCommercialText(value) === "sinal av indianopolis" &&
    !canonicalDealer(value)
  );
}

function legacyAutomaticDealers(
  row: CommercialSourceRow,
  records: DealerRecord[]
): string[] {
  const full = normalizeCommercialText(row.sourceLabel);
  const base = dealerBase(row.sourceLabel);
  const state = dealerState(row.state);
  const fullCandidates = records.filter(record => {
    const sameLabel = normalizeCommercialText(record.dealer) === full;
    return sameLabel && (!state || dealerState(record.state) === state);
  });
  if (fullCandidates.length === 1) return [fullCandidates[0].dealer];
  const baseCandidates = records.filter(record => {
    if (dealerBase(record.dealer) !== base) return false;
    if (state) return dealerState(record.state) === state;
    return true;
  });
  const distinct = [
    ...new Map(baseCandidates.map(record => [record.dealer, record])).values(),
  ];
  const states = new Set(
    distinct.map(record => dealerState(record.state)).filter(Boolean)
  );
  return distinct.length && states.size <= 1
    ? distinct.map(record => record.dealer)
    : [];
}

function automaticDealers(
  row: CommercialSourceRow,
  records: DealerRecord[]
): string[] {
  if (isExplicitlyUnmappedCommercialLabel(row.sourceLabel)) return [];
  // Registry resolution is exact and deliberately precedes the legacy database
  // suggestion. It is independent of the UF stored on an individual lead.
  const registered = resolveCommercialDealers(row.sourceLabel, row.state);
  if (registered.length) return [...new Set(registered)];
  const single = canonicalDealer(row.sourceLabel);
  if (single) return [single];
  return legacyAutomaticDealers(row, records);
}

function withDealerSuggestions(
  parsed: ParsedCommercialWorkbook,
  records: DealerRecord[],
  mappings?: Record<string, string[]>
): { rows: CommercialSourceRow[]; availableDealers: string[] } {
  const official = dealerNames();
  const unresolvedRaw = records
    .map(record => record.dealer)
    .filter(dealer => !canonicalDealer(dealer));
  const available = [...new Set([...official, ...unresolvedRaw])].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  const known = new Set(available);
  const mappingKeys = mappings ? Object.keys(mappings) : [];
  const parsedKeys = new Set(parsed.rows.map(row => row.key));
  for (const key of mappingKeys) {
    if (!parsedKeys.has(key))
      throw new Error(`Mapeamento comercial desconhecido: ${key}.`);
  }
  const seen = new Map<string, string>();
  const rows = parsed.rows.map(row => {
    const hasExplicit =
      mappings != null &&
      Object.prototype.hasOwnProperty.call(mappings, row.key);
    const linked = hasExplicit
      ? (mappings?.[row.key] ?? [])
      : automaticDealers(row, records);
    if (!Array.isArray(linked))
      throw new Error(`Mapeamento inválido para ${row.key}.`);
    const unique: string[] = [];
    for (const selected of linked) {
      if (typeof selected !== "string")
        throw new Error(
          `Concessionária não disponível no dashboard: ${String(selected)}.`
        );
      const dealer = canonicalDealer(selected) ?? selected;
      if (!known.has(dealer))
        throw new Error(
          `Concessionária não disponível no dashboard: ${String(selected)}.`
        );
      if (unique.includes(dealer))
        throw new Error(`Concessionária repetida no mapeamento ${row.key}.`);
      unique.push(dealer);
      const previous = seen.get(dealer);
      if (previous && previous !== row.key)
        throw new Error(
          `A concessionária ${dealer} foi vinculada a dois grupos da mesma carga.`
        );
      seen.set(dealer, row.key);
    }
    return { ...row, rawDealers: unique };
  });
  return { rows, availableDealers: available };
}

export async function previewCommercialUpload(
  input: CommercialUploadInput
): Promise<CommercialPreview> {
  const asOf = validateInput(input);
  const parsed = await parseCommercialWorkbook(
    input.kind,
    input.competence,
    asOf ?? undefined,
    input.fileName,
    input.base64,
    input.sourceWeek
  );
  const records = await readDealerRecords(getV2Pool());
  const suggested = withDealerSuggestions(parsed, records);
  return {
    kind: parsed.kind,
    competence: parsed.competence,
    asOf: parsed.asOf,
    sourceWeek: parsed.sourceWeek,
    fileName: parsed.fileName,
    fileSha256: parsed.fileSha256,
    rows: suggested.rows,
    total: parsed.total,
    warnings: parsed.warnings,
    availableDealers: suggested.availableDealers,
  };
}

function jsonRows(value: unknown): CommercialSourceRow[] {
  const parsed = storedJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.sourceLabel !== "string")
      return [];
    const original = Array.isArray(row.originalRawDealers)
      ? row.originalRawDealers.filter(
          (dealer): dealer is string => typeof dealer === "string"
        )
      : undefined;
    return [
      {
        key: row.key,
        sourceLabel: row.sourceLabel,
        state: typeof row.state === "string" ? row.state : null,
        value:
          typeof row.value === "number" && Number.isSafeInteger(row.value)
            ? row.value
            : null,
        rawDealers: Array.isArray(row.rawDealers)
          ? row.rawDealers.filter(
              (dealer): dealer is string => typeof dealer === "string"
            )
          : [],
        ...(original?.length ? { originalRawDealers: original } : {}),
      },
    ];
  });
}

function jsonWarnings(value: unknown): string[] {
  const parsed = storedJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function dateTimeIso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(storedText(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const source = storedText(value);
  return /^\d{4}-\d{2}-\d{2}/.test(source) ? source.slice(0, 10) : null;
}

function mapStoredImport(row: RowDataPacket): CommercialStoredImport {
  const kind = storedText(row.kind) as CommercialUploadKind;
  if (!KINDS.includes(kind))
    throw new Error(`Tipo de importação armazenado inválido: ${kind}.`);
  return {
    id: Number(row.id),
    kind,
    competence: storedText(row.competence),
    asOf: dateOnly(row.asOf),
    sourceWeek: row.sourceWeek == null ? null : Number(row.sourceWeek),
    fileName: storedText(row.fileName),
    fileSha256: storedText(row.fileSha256),
    total: row.total == null ? null : Number(row.total),
    rowCount: Number(row.rowCount),
    rows: jsonRows(row.rowsJson),
    warnings: jsonWarnings(row.warningsJson),
    importedAt: dateTimeIso(row.importedAt),
  };
}

const importSelect =
  "SELECT id,kind,competence,asOf,sourceWeek,fileName,fileSha256,total,rowCount,rowsJson,warningsJson,importedAt FROM v2_commercial_imports WHERE competence=?";

async function readLatestImportsFrom(
  executor: QueryExecutor,
  competence: string,
  lock = false
): Promise<SourceSnapshotMap> {
  const [rows] = await executor.execute(
    `${importSelect} ORDER BY id DESC${lock ? " FOR UPDATE" : ""}`,
    [competence]
  );
  const latest: SourceSnapshotMap = new Map();
  for (const row of rows) {
    const mapped = mapStoredImport(row);
    if (!latest.has(mapped.kind)) latest.set(mapped.kind, mapped);
  }
  return latest;
}

async function readLatestImports(
  competence: string
): Promise<SourceSnapshotMap> {
  return readLatestImportsFrom(getV2Pool(), competence);
}

function statusFile(
  kind: CommercialUploadKind,
  stored: CommercialStoredImport | undefined
): CommercialStatusFile {
  return stored
    ? {
        kind,
        configured: true,
        fileName: stored.fileName,
        total: stored.total,
        asOf: stored.asOf,
        sourceWeek: stored.sourceWeek,
        importedAt: stored.importedAt,
        rows: stored.rowCount,
        warnings: stored.warnings,
      }
    : {
        kind,
        configured: false,
        fileName: null,
        total: null,
        asOf: null,
        sourceWeek: null,
        importedAt: null,
        rows: 0,
        warnings: [],
      };
}

export async function readCommercialStatus(
  competence: string
): Promise<CommercialStatus> {
  validateCompetence(competence);
  const latest = await readLatestImports(competence);
  return {
    competence,
    files: KINDS.map(kind => statusFile(kind, latest.get(kind))),
  };
}

function mappingSha256(
  rows: CommercialSourceRow[],
  sourceWeek: number | null
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map(row => [row.key, [...row.rawDealers].sort()])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      )
    )
    .update(String(sourceWeek ?? ""))
    .digest("hex");
}

export async function commitCommercialUpload(
  input: CommercialCommitInput,
  actor: CommercialActor
): Promise<CommercialCommitResult> {
  const asOf = validateInput(input);
  const parsed = await parseCommercialWorkbook(
    input.kind,
    input.competence,
    asOf ?? undefined,
    input.fileName,
    input.base64,
    input.sourceWeek
  );
  const asOfKey = parsed.asOf ?? "";
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const records = await readDealerRecords(connection);
    const mapped = withDealerSuggestions(parsed, records, input.mappings);
    const rowsJson = JSON.stringify(mapped.rows);
    const warningsJson = JSON.stringify(parsed.warnings);
    const mappingHash = mappingSha256(mapped.rows, parsed.sourceWeek ?? null);
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT id,total,rowCount,warningsJson FROM v2_commercial_imports WHERE kind=? AND competence=? AND fileSha256=? AND asOfKey=? AND mappingSha256=? LIMIT 1 FOR UPDATE",
      [parsed.kind, parsed.competence, parsed.fileSha256, asOfKey, mappingHash]
    );
    if (existing[0]) {
      await connection.commit();
      return {
        importId: Number(existing[0].id),
        alreadyImported: true,
        total: existing[0].total == null ? null : Number(existing[0].total),
        rows: Number(existing[0].rowCount),
        warnings: jsonWarnings(existing[0].warningsJson),
      };
    }

    const [previousSameFile] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM v2_commercial_imports WHERE kind=? AND competence=? AND fileSha256=? LIMIT 1",
      [parsed.kind, parsed.competence, parsed.fileSha256]
    );
    // Do not update v2_lead_goals from a mapping-only operation. A manual goal
    // remains authoritative; the upload's total is only the initial import default.
    if (
      parsed.kind === "lead-goals" &&
      !previousSameFile.length &&
      parsed.total != null &&
      parsed.total > 0
    ) {
      const [goals] = await connection.execute<RowDataPacket[]>(
        "SELECT goal FROM v2_lead_goals WHERE competence=? FOR UPDATE",
        [parsed.competence]
      );
      await connection.execute(
        "INSERT INTO v2_lead_goals (competence,goal,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE goal=VALUES(goal),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
        [parsed.competence, parsed.total, actor.id]
      );
      await connection.execute(
        "INSERT INTO v2_goal_audit (competence,oldGoal,newGoal,accountId) VALUES (?,?,?,?)",
        [
          parsed.competence,
          goals[0]?.goal == null ? null : Number(goals[0].goal),
          parsed.total,
          actor.id,
        ]
      );
    }

    const [inserted] = await connection.execute<ResultSetHeader>(
      "INSERT INTO v2_commercial_imports (kind,competence,asOf,sourceWeek,asOfKey,fileName,fileSha256,mappingSha256,total,rowCount,rowsJson,warningsJson,importedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        parsed.kind,
        parsed.competence,
        parsed.asOf,
        parsed.sourceWeek ?? null,
        asOfKey,
        parsed.fileName,
        parsed.fileSha256,
        mappingHash,
        parsed.total,
        mapped.rows.length,
        rowsJson,
        warningsJson,
        actor.id,
      ]
    );
    await connection.commit();
    return {
      importId: Number(inserted.insertId),
      alreadyImported: false,
      total: parsed.total,
      rows: mapped.rows.length,
      warnings: parsed.warnings,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function distinctWarnings(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim() !== ""))];
}

function noDimensionFilters(filters: V2Filters): boolean {
  return (
    !filters.model &&
    !filters.channel &&
    !filters.campaign &&
    !filters.dealer &&
    !filters.search
  );
}

function formatMissingSourceWarning(kind: CommercialUploadKind): string {
  if (kind === "lead-goals")
    return "MetaLeads ainda não foi importada para esta competência.";
  if (kind === "sales-goals")
    return "MetaVendas ainda não foi importada para esta competência.";
  return "Snapshot de vendas ainda não foi importado para esta competência.";
}

function emptyWorkRow(
  dealer: string,
  state: string,
  canonical: string | null,
  leads = 0
): WorkRow {
  const aliases = [...new Set([dealer, ...(canonical ? [canonical] : [])])];
  return {
    dealer,
    state,
    leads,
    leadGoal: null,
    sales: null,
    salesGoal: null,
    conversionRate: null,
    aliases,
    aliasKeys: aliases.map(normalizeCommercialText),
    canonical,
  };
}

function addWorkRow(
  target: WorkRow,
  row: V2Dashboard["dealerPerformance"]["rows"][number]
): void {
  target.leads += row.leads;
  const aliases = [row.dealer, ...target.aliases];
  target.aliases = [...new Set(aliases)];
  target.aliasKeys = [...new Set(target.aliases.map(normalizeCommercialText))];
  if (target.state === "Não informado" && row.state) target.state = row.state;
}

function buildWork(dashboard: V2Dashboard, filters: V2Filters): WorkRow[] {
  const selectedCanonical = filters.dealer
    ? canonicalDealer(filters.dealer)
    : null;
  const includeAllOfficial = !filters.dealer;
  const officialMap = new Map<string, WorkRow>();
  const unmatched = new Map<string, WorkRow>();

  for (const raw of dashboard.dealerPerformance.rows) {
    const canonical = canonicalDealer(raw.dealer);
    if (canonical && filters.dealer && selectedCanonical !== canonical)
      continue;
    if (canonical) {
      const registration = officialDealer(canonical);
      const current = officialMap.get(canonical);
      if (current) addWorkRow(current, raw);
      else
        officialMap.set(
          canonical,
          emptyWorkRow(
            canonical,
            registration?.state ?? raw.state ?? "Não informado",
            canonical,
            raw.leads
          )
        );
      continue;
    }
    if (
      filters.dealer &&
      normalizeCommercialText(raw.dealer) !==
        normalizeCommercialText(filters.dealer)
    )
      continue;
    const key = `${normalizeCommercialText(raw.dealer)}\u0000${normalizeCommercialText(raw.state)}`;
    const current = unmatched.get(key);
    if (current) addWorkRow(current, raw);
    else
      unmatched.set(key, emptyWorkRow(raw.dealer, raw.state, null, raw.leads));
  }

  const officialRows = OFFICIAL_DEALERS.filter(
    dealer => includeAllOfficial || dealer.name === selectedCanonical
  ).map(
    dealer =>
      officialMap.get(dealer.name) ??
      emptyWorkRow(dealer.name, dealer.state, dealer.name)
  );
  return [...officialRows, ...unmatched.values()];
}

function hasTarget(row: WorkRow, target: string): boolean {
  const canonical = canonicalDealer(target);
  return Boolean(
    (canonical && row.canonical === canonical) ||
      row.aliases.includes(target) ||
      row.aliasKeys.includes(normalizeCommercialText(target))
  );
}

function sameDealerSet(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return (
    a.length === b.length && a.every((dealer, index) => dealer === b[index])
  );
}

function collectiveMatches(work: WorkRow[], targets: string[]): WorkRow[] {
  const canonicalTargets = targets
    .map(target => canonicalDealer(target) ?? target)
    .filter(Boolean);
  return work.filter(row => {
    if (targets.some(target => hasTarget(row, target))) return true;
    // An unresolved raw lead can participate in a collective comparison only
    // when the registry resolves its full label to exactly this same group.
    // It must never become an individual unit row through this inference.
    if (row.canonical !== null) return false;
    return sameDealerSet(
      resolveCommercialDealers(row.dealer, row.state),
      canonicalTargets
    );
  });
}

function sourceTargets(source: CommercialSourceRow): string[] {
  if (isExplicitlyUnmappedCommercialLabel(source.sourceLabel)) return [];
  const registered = [
    ...new Set(resolveCommercialDealers(source.sourceLabel, source.state)),
  ];
  if (source.rawDealers.length) {
    const explicit = [
      ...new Set(
        source.rawDealers.map(target => canonicalDealer(target) ?? target)
      ),
    ];
    const sameRegisteredSet =
      registered.length === explicit.length &&
      registered.every(target => explicit.includes(target));
    return sameRegisteredSet ? registered : explicit;
  }
  return registered;
}

function sourceRecord(
  kind: CommercialUploadKind,
  source: CommercialSourceRow,
  dealers: string[],
  leads: number
): V2CommercialGroupRecord {
  return {
    kind,
    key: source.key,
    sourceLabel: source.sourceLabel,
    dealers,
    value: source.value,
    leads,
  };
}

function sourceInfo(
  kind: CommercialUploadKind,
  stored: CommercialStoredImport | undefined,
  competence: string
): CommercialSourceSnapshot {
  return {
    ...statusFile(kind, stored),
    competence,
  };
}

function latestValue(
  latest: CommercialLatestImports | undefined,
  kind: CommercialUploadKind
): CommercialStoredImport | undefined {
  if (!latest) return undefined;
  if (
    typeof (latest as ReadonlyMap<CommercialUploadKind, CommercialStoredImport>)
      .get === "function"
  )
    return (
      latest as ReadonlyMap<CommercialUploadKind, CommercialStoredImport>
    ).get(kind);
  return (
    latest as Partial<Record<CommercialUploadKind, CommercialStoredImport>>
  )[kind];
}

function buildCommercialRows(
  dashboard: V2Dashboard,
  filters: V2Filters,
  latest: CommercialLatestImports
): {
  work: WorkRow[];
  unmapped: CommercialUnmappedRow[];
  groupedGoals: V2CommercialGroupRecord[];
  warnings: string[];
  salesCompatible: boolean;
  singleMonth: boolean;
  globalScope: boolean;
  leadImport: CommercialStoredImport | undefined;
  salesGoalImport: CommercialStoredImport | undefined;
  salesImport: CommercialStoredImport | undefined;
} {
  const competence = filters.dateTo.slice(0, 7);
  const leadImport = latestValue(latest, "lead-goals");
  const salesGoalImport = latestValue(latest, "sales-goals");
  const salesImport = latestValue(latest, "sales");
  const sameCompetence = filters.dateFrom.slice(0, 7) === competence;
  const singleMonth =
    sameCompetence &&
    filters.dateFrom.slice(0, 7) === filters.dateTo.slice(0, 7);
  const globalScope = noDimensionFilters(filters);
  const nonDealerNarrowed = Boolean(
    filters.model || filters.channel || filters.campaign || filters.search
  );
  const warnings = [
    ...(leadImport?.warnings ?? []),
    ...(salesGoalImport?.warnings ?? []),
    ...(salesImport?.warnings ?? []),
  ];
  const unmapped: CommercialUnmappedRow[] = [];
  const groupedGoals: V2CommercialGroupRecord[] = [];
  const work = buildWork(dashboard, filters);
  if (
    globalScope &&
    dashboard.pacing.goal != null &&
    leadImport?.total != null &&
    dashboard.pacing.goal !== leadImport.total
  )
    warnings.push(
      "A meta global foi alterada manualmente; a distribuição do arquivo de MetaLeads foi preservada, sem rateio automático."
    );

  const applySource = (
    kind: CommercialUploadKind,
    source: CommercialSourceRow
  ): void => {
    if (kind === "sales" && source.value === null) return;
    const targets = sourceTargets(source);
    if (!targets.length) {
      if (isExplicitlyUnmappedCommercialLabel(source.sourceLabel))
        warnings.push(
          `${source.sourceLabel} (${source.value ?? "sem valor"}) não pertence ao cadastro oficial e permaneceu sem unidade.`
        );
      if (!(kind === "sales-goals" && source.sourceLabel === "GLOBAL"))
        unmapped.push({ kind, ...source });
      return;
    }
    const isCollective = targets.length > 1;
    const matches = isCollective
      ? collectiveMatches(work, targets)
      : work.filter(row => targets.some(target => hasTarget(row, target)));
    const complete = targets.every(target =>
      work.some(row => hasTarget(row, target))
    );
    if (isCollective) {
      if (!complete) {
        warnings.push(
          `${kind === "sales" ? "Vendas" : "Meta coletiva"} de ${source.sourceLabel} está fora do recorte atual; não foi alocada por concessionária.`
        );
        return;
      }
      groupedGoals.push(
        sourceRecord(
          kind,
          source,
          targets,
          matches.reduce((sum, row) => sum + row.leads, 0)
        )
      );
      return;
    }
    // A source linked to one known official unit can simply be outside the
    // selected dealer filter. It is not an unmapped source in that case.
    if (!complete && canonicalDealer(targets[0])) return;
    if (matches.length !== 1 || !complete) {
      if (kind === "sales")
        warnings.push(
          `Vendas de ${source.sourceLabel} não foram alocadas por concessionária.`
        );
      else if (matches.length > 1)
        warnings.push(
          `MetaVendas de ${source.sourceLabel} não foi alocada: o vínculo atravessa grupos diferentes.`
        );
      else unmapped.push({ kind, ...source });
      return;
    }
    const row = matches[0];
    const goalCompatible = singleMonth && !nonDealerNarrowed;
    if (kind === "lead-goals")
      row.leadGoal = goalCompatible ? source.value : null;
    else if (kind === "sales-goals")
      row.salesGoal = goalCompatible
        ? source.value == null
          ? row.salesGoal
          : (row.salesGoal ?? 0) + source.value
        : null;
    else row.sales = (row.sales ?? 0) + (source.value ?? 0);
  };

  if (leadImport)
    for (const source of leadImport.rows) applySource("lead-goals", source);
  if (salesGoalImport)
    for (const source of salesGoalImport.rows)
      applySource("sales-goals", source);
  if (salesImport)
    for (const source of salesImport.rows) applySource("sales", source);

  if (!singleMonth && (leadImport || salesGoalImport))
    warnings.push(
      "Metas mensais não foram comparadas a um intervalo de mais de uma competência."
    );
  if (nonDealerNarrowed && (leadImport || salesGoalImport))
    warnings.push(
      "Metas comerciais não foram comparadas a um recorte de modelo, canal, campanha ou busca."
    );
  const salesCompatible = Boolean(
    salesImport &&
      salesImport.asOf &&
      filters.dateFrom === `${competence}-01` &&
      filters.dateTo === salesImport.asOf &&
      !nonDealerNarrowed
  );
  if (salesImport && !salesCompatible)
    warnings.push(
      "Snapshot de vendas só é comparável quando o período cobre a competência desde o dia 1 até asOf, sem recorte de modelo, canal, campanha ou busca."
    );
  for (const group of groupedGoals) {
    if (group.kind === "sales" && !salesCompatible) group.value = null;
    if (group.kind !== "sales" && (!singleMonth || nonDealerNarrowed))
      group.value = null;
  }
  if (!salesCompatible) for (const row of work) row.sales = null;
  for (const row of work) {
    row.conversionRate =
      row.sales == null || row.leads <= 0 ? null : row.sales / row.leads;
  }
  if (leadImport && unmapped.some(row => row.kind === "lead-goals"))
    warnings.push(
      "Há grupos de MetaLeads sem concessionária vinculada; a meta global foi preservada sem repetição por alias."
    );
  if (salesGoalImport && unmapped.some(row => row.kind === "sales-goals"))
    warnings.push(
      "Há grupos de MetaVendas sem concessionária vinculada; não foi feita alocação por aproximação."
    );
  return {
    work,
    unmapped,
    groupedGoals,
    warnings,
    salesCompatible,
    singleMonth,
    globalScope,
    leadImport,
    salesGoalImport,
    salesImport,
  };
}

/** Pure commercial builder used by the dashboard and fixture tests. */
export function buildOfficialCommercialPerformance(
  dashboard: V2Dashboard,
  filters: V2Filters,
  latest: CommercialLatestImports = new Map()
): CommercialPerformance {
  const configured = KINDS.filter(kind => Boolean(latestValue(latest, kind)));
  const competence = filters.dateTo.slice(0, 7);
  const sources = KINDS.map(kind =>
    sourceInfo(kind, latestValue(latest, kind), competence)
  );
  if (!configured.length) {
    return {
      ...dashboard.dealerPerformance,
      available: false,
      sourceName: null,
      updatedAt: null,
      warnings: [],
      sources,
      unmapped: [],
      groupedGoals: [],
      unreconciledDealers: [],
    };
  }

  const built = buildCommercialRows(dashboard, filters, latest);
  const updatedAtValues = configured
    .map(kind => latestValue(latest, kind)?.importedAt)
    .filter((value): value is string => Boolean(value));
  const sourceName =
    [
      ...new Set(
        configured
          .map(kind => latestValue(latest, kind)?.fileName)
          .filter(Boolean)
      ),
    ].join(" + ") || null;
  const allWarnings = [...built.warnings];
  for (const kind of KINDS)
    if (!latestValue(latest, kind))
      allWarnings.push(formatMissingSourceWarning(kind));
  const outputRows = built.work.map(
    ({ aliases: _aliases, aliasKeys: _keys, canonical: _canonical, ...row }) =>
      row
  );
  const leadsTotal = built.work.reduce((sum, row) => sum + row.leads, 0);
  const leadGoalTotal =
    built.globalScope && built.singleMonth
      ? (dashboard.pacing.goal ?? built.leadImport?.total ?? null)
      : null;
  const salesGoalTotal =
    built.globalScope && built.singleMonth
      ? (built.salesGoalImport?.total ?? null)
      : null;
  const salesTotal =
    built.globalScope && built.salesCompatible
      ? (built.salesImport?.total ?? null)
      : null;
  return {
    available: true,
    sourceName,
    updatedAt: updatedAtValues.length
      ? (updatedAtValues.sort().at(-1) ?? null)
      : null,
    rows: outputRows,
    totals: {
      leads: leadsTotal,
      leadGoal: leadGoalTotal,
      sales: salesTotal,
      salesGoal: salesGoalTotal,
      conversionRate:
        salesTotal == null || leadsTotal <= 0 ? null : salesTotal / leadsTotal,
    },
    warnings: distinctWarnings(allWarnings),
    sources,
    unmapped: built.unmapped,
    groupedGoals: built.groupedGoals,
    unreconciledDealers: built.work
      .filter(row => row.canonical === null)
      .map(row => ({ sourceLabel: row.dealer, leads: row.leads })),
  };
}

export async function getCommercialPerformance(
  dashboard: V2Dashboard,
  filters: V2Filters
): Promise<CommercialPerformance> {
  const latest = await readLatestImports(filters.dateTo.slice(0, 7));
  return buildOfficialCommercialPerformance(dashboard, filters, latest);
}

function reconciledRows(rows: CommercialSourceRow[]): {
  rows: CommercialSourceRow[];
  changed: boolean;
} {
  let changed = false;
  const next = rows.map(source => {
    const original = source.rawDealers;
    const registered = [
      ...new Set(resolveCommercialDealers(source.sourceLabel, source.state)),
    ];
    const targets = registered.length
      ? registered
      : original
          .map(target => canonicalDealer(target))
          .filter((target): target is string => Boolean(target));
    const unique = [...new Set(targets)];
    if (JSON.stringify(unique) !== JSON.stringify(original)) changed = true;
    const hasOriginal =
      original.length && JSON.stringify(unique) !== JSON.stringify(original);
    return {
      ...source,
      rawDealers: unique,
      ...(hasOriginal
        ? { originalRawDealers: source.originalRawDealers ?? [...original] }
        : {}),
    };
  });
  return { rows: next, changed };
}

/**
 * Creates additive mapping-only revisions for the latest snapshots. It never
 * updates v2_lead_goals or v2_goal_audit, and a second call is idempotent.
 */
export async function reconcileCommercialDealers(
  competence: string,
  actor: CommercialActor
): Promise<CommercialReconciliationResult> {
  validateCompetence(competence);
  const connection = await getV2Pool().getConnection();
  const importIds: number[] = [];
  try {
    await connection.beginTransaction();
    const latest = await readLatestImportsFrom(connection, competence, true);
    for (const kind of KINDS) {
      const stored = latest.get(kind);
      if (!stored) continue;
      const reconciled = reconciledRows(stored.rows);
      if (!reconciled.changed) continue;
      const asOfKey = stored.asOf ?? "";
      const hash = mappingSha256(reconciled.rows, stored.sourceWeek);
      const [existing] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM v2_commercial_imports WHERE kind=? AND competence=? AND fileSha256=? AND asOfKey=? AND mappingSha256=? LIMIT 1 FOR UPDATE",
        [kind, competence, stored.fileSha256, asOfKey, hash]
      );
      if (existing[0]) continue;
      const [inserted] = await connection.execute<ResultSetHeader>(
        "INSERT INTO v2_commercial_imports (kind,competence,asOf,sourceWeek,asOfKey,fileName,fileSha256,mappingSha256,total,rowCount,rowsJson,warningsJson,importedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          kind,
          competence,
          stored.asOf,
          stored.sourceWeek,
          asOfKey,
          stored.fileName,
          stored.fileSha256,
          hash,
          stored.total,
          stored.rowCount,
          JSON.stringify(reconciled.rows),
          JSON.stringify(stored.warnings),
          actor.id,
        ]
      );
      importIds.push(Number(inserted.insertId));
    }
    await connection.commit();
    return {
      competence,
      revised: importIds.length,
      importIds,
      alreadyReconciled: importIds.length === 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
