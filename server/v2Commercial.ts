import { createHash } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDashboardCutoffDate } from "../shared/dashboardDates";
import type {
  CommercialActor,
  CommercialCommitInput,
  CommercialCommitResult,
  CommercialPerformance,
  CommercialPreview,
  CommercialSourceRow,
  CommercialSourceSnapshot,
  CommercialStatus,
  CommercialStatusFile,
  CommercialUnmappedRow,
  CommercialUploadInput,
  CommercialUploadKind,
} from "../shared/v2Commercial";
import type { V2Dashboard, V2Filters } from "../shared/v2Types";
import { getV2Pool } from "./v2Db";
import {
  normalizeCommercialText,
  parseCommercialWorkbook,
  type ParsedCommercialWorkbook,
} from "./v2CommercialParser";

const KINDS: CommercialUploadKind[] = ["lead-goals", "sales-goals", "sales"];

type DealerRecord = { dealer: string; state: string | null };
type StoredImport = {
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

type WorkRow = V2Dashboard["dealerPerformance"]["rows"][number] & {
  aliases: string[];
};

type SourceSnapshotMap = Map<CommercialUploadKind, StoredImport>;

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

async function readDealerRecords(
  executor: ReturnType<typeof getV2Pool>
): Promise<DealerRecord[]> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    "SELECT DISTINCT BINARY dealer AS dealer,BINARY state AS state FROM v2_leads WHERE TRIM(dealer) <> '' ORDER BY BINARY dealer,BINARY state"
  );
  return rows.map(row => ({
    dealer: String(row.dealer),
    state:
      row.state == null || String(row.state).trim() === ""
        ? null
        : String(row.state),
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

function automaticDealers(
  row: CommercialSourceRow,
  records: DealerRecord[],
  kind: CommercialUploadKind
): string[] {
  // Blank cells remain unknown. WEEKLY_REG zeros are actual source values.
  // Names match only whole normalized labels; broad group names are never guessed.
  if (kind === "sales" && row.value === null) return [];
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
  // Several raw labels can be spelling/punctuation aliases of the exact same
  // complete store name. Link that equivalence class, never a substring/fuzzy group.
  return distinct.length && states.size <= 1
    ? distinct.map(record => record.dealer)
    : [];
}

function withDealerSuggestions(
  parsed: ParsedCommercialWorkbook,
  records: DealerRecord[],
  mappings?: Record<string, string[]>
): { rows: CommercialSourceRow[]; availableDealers: string[] } {
  const available = [...new Set(records.map(record => record.dealer))].sort(
    (a, b) => a.localeCompare(b, "pt-BR")
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
      : automaticDealers(row, records, parsed.kind);
    if (!Array.isArray(linked))
      throw new Error(`Mapeamento inválido para ${row.key}.`);
    const unique: string[] = [];
    for (const dealer of linked) {
      if (typeof dealer !== "string" || !known.has(dealer))
        throw new Error(
          `Concessionária não disponível no dashboard: ${String(dealer)}.`
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
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.sourceLabel !== "string")
      return [];
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
      },
    ];
  });
}

function jsonWarnings(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function dateTimeIso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const source = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(source) ? source.slice(0, 10) : null;
}

function mapStoredImport(row: RowDataPacket): StoredImport {
  const kind = String(row.kind) as CommercialUploadKind;
  if (!KINDS.includes(kind))
    throw new Error(`Tipo de importação armazenado inválido: ${kind}.`);
  return {
    id: Number(row.id),
    kind,
    competence: String(row.competence),
    asOf: dateOnly(row.asOf),
    sourceWeek: row.sourceWeek == null ? null : Number(row.sourceWeek),
    fileName: String(row.fileName),
    fileSha256: String(row.fileSha256),
    total: row.total == null ? null : Number(row.total),
    rowCount: Number(row.rowCount),
    rows: jsonRows(row.rowsJson),
    warnings: jsonWarnings(row.warningsJson),
    importedAt: dateTimeIso(row.importedAt),
  };
}

async function readLatestImports(
  competence: string
): Promise<SourceSnapshotMap> {
  const [rows] = await getV2Pool().execute<RowDataPacket[]>(
    "SELECT id,kind,competence,asOf,sourceWeek,fileName,fileSha256,total,rowCount,rowsJson,warningsJson,importedAt FROM v2_commercial_imports WHERE competence=? ORDER BY id DESC",
    [competence]
  );
  const latest: SourceSnapshotMap = new Map();
  for (const row of rows) {
    const mapped = mapStoredImport(row);
    if (!latest.has(mapped.kind)) latest.set(mapped.kind, mapped);
  }
  return latest;
}

function statusFile(
  kind: CommercialUploadKind,
  stored: StoredImport | undefined
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
    const [dealerRows] = await connection.execute<RowDataPacket[]>(
      "SELECT DISTINCT BINARY dealer AS dealer,BINARY state AS state FROM v2_leads WHERE TRIM(dealer) <> '' ORDER BY BINARY dealer,BINARY state"
    );
    const records: DealerRecord[] = dealerRows.map(row => ({
      dealer: String(row.dealer),
      state:
        row.state == null || String(row.state).trim() === ""
          ? null
          : String(row.state),
    }));
    const mapped = withDealerSuggestions(parsed, records, input.mappings);
    const rowsJson = JSON.stringify(mapped.rows);
    const warningsJson = JSON.stringify(parsed.warnings);

    const mappingSha256 = createHash("sha256")
      .update(
        JSON.stringify(
          mapped.rows
            .map(row => [row.key, [...row.rawDealers].sort()])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        )
      )
      .update(String(parsed.sourceWeek ?? ""))
      .digest("hex");
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT id,total,rowCount,warningsJson FROM v2_commercial_imports WHERE kind=? AND competence=? AND fileSha256=? AND asOfKey=? AND mappingSha256=? LIMIT 1 FOR UPDATE",
      [
        parsed.kind,
        parsed.competence,
        parsed.fileSha256,
        asOfKey,
        mappingSha256,
      ]
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
    // A mapping-only revision preserves the user's current manual monthly goal.
    // The imported global MetaLeads and its audit must share this connection
    // with the immutable import snapshot. Calling saveV2Goal here would open a
    // second pool connection and could commit only half of the operation.
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
        mappingSha256,
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

function hasAlias(row: WorkRow, aliases: string[]): boolean {
  return row.aliases.some(alias => aliases.includes(alias));
}

function sourceInfo(
  kind: CommercialUploadKind,
  stored: StoredImport | undefined,
  competence: string
): CommercialSourceSnapshot {
  return {
    ...statusFile(kind, stored),
    competence,
  };
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

export async function getCommercialPerformance(
  dashboard: V2Dashboard,
  filters: V2Filters
): Promise<CommercialPerformance> {
  const competence = filters.dateTo.slice(0, 7);
  const latest = await readLatestImports(competence);
  const configured = KINDS.filter(kind => latest.has(kind));
  const sources = KINDS.map(kind =>
    sourceInfo(kind, latest.get(kind), competence)
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
    };
  }

  const sameCompetence = filters.dateFrom.slice(0, 7) === competence;
  const singleMonth =
    sameCompetence &&
    filters.dateFrom.slice(0, 7) === filters.dateTo.slice(0, 7);
  const globalScope = noDimensionFilters(filters);
  const nonDealerNarrowed = Boolean(
    filters.model || filters.channel || filters.campaign || filters.search
  );
  const warnings = configured.flatMap(kind => latest.get(kind)?.warnings ?? []);
  const unmapped: CommercialUnmappedRow[] = [];
  let work: WorkRow[] = dashboard.dealerPerformance.rows.map(row => ({
    ...row,
    leadGoal: null,
    sales: null,
    salesGoal: null,
    conversionRate: null,
    aliases: [row.dealer],
  }));

  const leadImport = latest.get("lead-goals");
  if (leadImport) {
    for (const source of leadImport.rows) {
      if (!source.rawDealers.length) {
        unmapped.push({ kind: "lead-goals", ...source });
        continue;
      }
      const matches = work.filter(row => hasAlias(row, source.rawDealers));
      if (!matches.length) {
        unmapped.push({ kind: "lead-goals", ...source });
        continue;
      }
      const complete = source.rawDealers.every(alias =>
        work.some(row => row.aliases.includes(alias))
      );
      const firstIndex = Math.min(...matches.map(row => work.indexOf(row)));
      const merged: WorkRow = {
        ...matches[0],
        dealer: source.sourceLabel,
        state: source.state ?? matches[0].state,
        leads: matches.reduce((sum, row) => sum + row.leads, 0),
        leadGoal: singleMonth && complete ? source.value : null,
        sales: null,
        salesGoal: null,
        conversionRate: null,
        aliases: [...new Set(matches.flatMap(row => row.aliases))],
      };
      work = work.filter(row => !matches.includes(row));
      work.splice(firstIndex, 0, merged);
      if (!complete)
        warnings.push(
          `O grupo ${source.sourceLabel} está parcialmente fora do recorte atual; sua meta não foi repetida.`
        );
      if (!singleMonth)
        warnings.push(
          "Metas mensais não foram comparadas a um intervalo de mais de uma competência."
        );
    }
    if (!singleMonth)
      warnings.push(
        "MetaLeads mensal disponível apenas como referência em período multicompetência."
      );
  }

  const salesGoalImport = latest.get("sales-goals");
  if (salesGoalImport) {
    for (const source of salesGoalImport.rows) {
      if (!source.rawDealers.length) {
        if (source.sourceLabel !== "GLOBAL")
          unmapped.push({ kind: "sales-goals", ...source });
        continue;
      }
      const matches = work.filter(row => hasAlias(row, source.rawDealers));
      const complete = source.rawDealers.every(alias =>
        work.some(row => row.aliases.includes(alias))
      );
      if (matches.length !== 1 || !complete) {
        if (matches.length > 1)
          warnings.push(
            `MetaVendas de ${source.sourceLabel} não foi alocada: o vínculo atravessa grupos diferentes.`
          );
        else if (!matches.length)
          unmapped.push({ kind: "sales-goals", ...source });
        continue;
      }
      matches[0].salesGoal =
        singleMonth && source.value !== null
          ? (matches[0].salesGoal ?? 0) + source.value
          : null;
    }
  }

  const salesImport = latest.get("sales");
  if (salesImport) {
    for (const source of salesImport.rows) {
      if (source.value == null) continue;
      if (!source.rawDealers.length) {
        unmapped.push({ kind: "sales", ...source });
        continue;
      }
      const matches = work.filter(row => hasAlias(row, source.rawDealers));
      const complete = source.rawDealers.every(alias =>
        work.some(row => row.aliases.includes(alias))
      );
      if (matches.length !== 1 || !complete) {
        warnings.push(
          `Vendas de ${source.sourceLabel} não foram alocadas por concessionária.`
        );
        continue;
      }
      matches[0].sales = (matches[0].sales ?? 0) + source.value;
    }
  }

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

  const leadGoalTotal =
    globalScope && singleMonth
      ? (dashboard.pacing.goal ?? leadImport?.total ?? null)
      : null;
  const salesGoalTotal =
    globalScope && singleMonth ? (salesGoalImport?.total ?? null) : null;
  const salesTotal =
    globalScope && salesCompatible ? (salesImport?.total ?? null) : null;
  if (!salesCompatible) for (const row of work) row.sales = null;
  if (
    globalScope &&
    dashboard.pacing.goal != null &&
    leadImport?.total != null &&
    dashboard.pacing.goal !== leadImport.total
  )
    warnings.push(
      "A meta global foi alterada manualmente; a distribuição do arquivo de MetaLeads foi preservada, sem rateio automático."
    );
  for (const row of work) {
    row.conversionRate =
      row.sales == null || row.leads <= 0 ? null : row.sales / row.leads;
  }
  const leadsTotal = work.reduce((sum, row) => sum + row.leads, 0);
  const updatedAtValues = configured
    .map(kind => latest.get(kind)?.importedAt)
    .filter((value): value is string => Boolean(value));
  const sourceName =
    [
      ...new Set(
        configured
          .map(kind => latest.get(kind)?.fileName)
          .filter((value): value is string => Boolean(value))
      ),
    ].join(" + ") || null;
  for (const kind of KINDS)
    if (!latest.has(kind)) warnings.push(formatMissingSourceWarning(kind));
  if (leadImport && unmapped.some(row => row.kind === "lead-goals"))
    warnings.push(
      "Há grupos de MetaLeads sem concessionária vinculada; a meta global foi preservada sem repetição por alias."
    );
  if (salesGoalImport && unmapped.some(row => row.kind === "sales-goals"))
    warnings.push(
      "Há grupos de MetaVendas sem concessionária vinculada; não foi feita alocação por aproximação."
    );

  const outputRows = work.map(({ aliases: _aliases, ...row }) => row);
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
    warnings: distinctWarnings(warnings),
    sources,
    unmapped,
  };
}
