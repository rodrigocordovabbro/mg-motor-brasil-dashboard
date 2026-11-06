import { createHash, createSign } from "node:crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getV2Pool } from "./v2Db";
import {
  LEADS_SYNC_ALLOWED_SHEETS,
  LEADS_SYNC_CONFIGURATION_MESSAGE,
  LEADS_SYNC_SOURCE_ID,
  type LeadsSnapshotInput,
  type LeadsSyncActor,
  type LeadsSyncConnectionStatus,
  type LeadsSyncOrigin,
  type LeadsSyncResult,
  type LeadsSyncSourceCount,
} from "../shared/leadsSync";
import {
  prepareLeadsSnapshot,
  type MappedLeadSyncRow,
  type PreparedLeadsSnapshot,
} from "./v2LeadsSyncMapper";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_REQUEST_TIMEOUT_MS = 90_000;
const GOOGLE_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const ROW_BATCH_SIZE = 300;
const ORIGINS = new Set<LeadsSyncOrigin>(["gws", "server"]);

type DbMap = RowDataPacket & Record<string, unknown>;
type ExistingSyncRow = {
  leadId: number;
  sourceSheet: string;
  sourceRow: number;
  rowHash: string | null;
  sourceIdRaw: string | null;
  sourceTimestampRaw: string | null;
  rawModel: string | null;
  rawDealer: string | null;
  headersJson: string | null;
  valuesJson: string | null;
  payloadJson: string | null;
  normalized?: Record<string, unknown>;
};

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
};

export class LeadsSyncError extends Error {
  readonly code: "PRECONDITION_FAILED" | "INVALID_SOURCE" | "IMPORT_FAILED";

  constructor(code: LeadsSyncError["code"], message: string) {
    super(message);
    this.name = "LeadsSyncError";
    this.code = code;
  }
}

function configurationError(): LeadsSyncError {
  return new LeadsSyncError(
    "PRECONDITION_FAILED",
    `PRECONDITION_FAILED: ${LEADS_SYNC_CONFIGURATION_MESSAGE}`
  );
}

function invalidSourceError(message: string): LeadsSyncError {
  return new LeadsSyncError("INVALID_SOURCE", message);
}

function asDbRows(value: unknown): DbMap[] {
  return Array.isArray(value) ? (value as DbMap[]) : [];
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function asInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function asIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function assertActor(actor: LeadsSyncActor): void {
  if (
    !actor ||
    !Number.isInteger(actor.id) ||
    actor.id <= 0 ||
    typeof actor.username !== "string" ||
    actor.username.trim() === ""
  )
    throw invalidSourceError("Ator de importação inválido.");
}

function assertOrigin(origin: LeadsSyncOrigin): void {
  if (!ORIGINS.has(origin))
    throw invalidSourceError("Origem de importação inválida.");
}

function assertSnapshotInput(snapshot: LeadsSnapshotInput): void {
  if (
    !snapshot ||
    typeof snapshot.spreadsheetId !== "string" ||
    snapshot.spreadsheetId.trim() === "" ||
    snapshot.spreadsheetId.length > 100 ||
    !Array.isArray(snapshot.valueRanges)
  )
    throw invalidSourceError("Snapshot de Leads inválido.");
}

function safeJson(value: unknown): string {
  try {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error("undefined");
    return result;
  } catch {
    throw invalidSourceError("A fonte de Leads contém valores inválidos.");
  }
}

function parsePrivateJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowKey(sheet: string, sourceRow: number): string {
  return `${sheet}\u0000${sourceRow}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    output.push(items.slice(index, index + size));
  return output;
}

function placeholders(rowCount: number, columnCount: number): string {
  return Array.from(
    { length: rowCount },
    () => `(${Array.from({ length: columnCount }, () => "?").join(",")})`
  ).join(",");
}

function sourceMetadataJson(prepared: PreparedLeadsSnapshot): string {
  return safeJson(
    prepared.sources.map(source => ({
      sourceSheet: source.sourceSheet,
      range: source.range,
      headers: source.headers,
      rowCount: source.rows.length,
    }))
  );
}

function newSnapshotJson(row: MappedLeadSyncRow): string {
  return safeJson({
    payload: parsePrivateJson(row.payloadJson),
    normalized: {
      leadDate: row.leadDate,
      leadHour: row.leadHour,
      name: row.name,
      model: row.rawModel,
      version: row.version,
      channel: row.channel,
      campaign: row.campaign,
      dealer: row.rawDealer,
      city: row.city,
      state: row.state,
      crm: row.crm,
    },
    rowHash: row.rowHash,
  });
}

function oldSnapshotJson(row: ExistingSyncRow | undefined): string | null {
  if (!row) return null;
  return safeJson({
    normalized: row.normalized,
    sourceIdRaw: row.sourceIdRaw,
    sourceTimestampRaw: row.sourceTimestampRaw,
    rawModel: row.rawModel,
    rawDealer: row.rawDealer,
    headers: parsePrivateJson(row.headersJson),
    values: parsePrivateJson(row.valuesJson),
    payload: parsePrivateJson(row.payloadJson),
    rowHash: row.rowHash,
  });
}

async function readExistingRows(
  connection: PoolConnection,
  rows: readonly MappedLeadSyncRow[]
): Promise<Map<string, ExistingSyncRow>> {
  const byKey = new Map<string, ExistingSyncRow>();
  if (rows.length === 0) return byKey;
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const sourceRows = groups.get(row.sourceSheet) ?? [];
    sourceRows.push(row.sourceRow);
    groups.set(row.sourceSheet, sourceRows);
  }
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const [sheet, sourceRows] of groups) {
    clauses.push(
      `(l.sourceSheet=? AND l.sourceRow IN (${sourceRows
        .map(() => "?")
        .join(",")}))`
    );
    params.push(sheet, ...sourceRows);
  }
  const [result] = await connection.execute<DbMap[]>(
    `SELECT l.id AS leadId,l.sourceSheet,l.sourceRow,l.leadDate,l.leadHour,l.name,l.model,l.version,l.channel,l.campaign,l.dealer,l.city,l.state,l.crm,
       r.rowHash,r.sourceIdRaw,r.sourceTimestampRaw,r.rawModel,r.rawDealer,
       r.headersJson,r.valuesJson,r.payloadJson
       FROM v2_leads l
       LEFT JOIN v2_lead_sync_rows r
         ON r.sourceId=? AND r.sourceSheet=l.sourceSheet AND r.sourceRow=l.sourceRow
       WHERE ${clauses.join(" OR ")}`,
    [LEADS_SYNC_SOURCE_ID, ...params]
  );
  for (const raw of result) {
    const row: ExistingSyncRow = {
      leadId: asInteger(raw.leadId ?? raw.id),
      normalized: Object.fromEntries(
        [
          "leadDate",
          "leadHour",
          "name",
          "model",
          "version",
          "channel",
          "campaign",
          "dealer",
          "city",
          "state",
          "crm",
        ].map(key => [key, raw[key]])
      ),
      sourceSheet: asString(raw.sourceSheet),
      sourceRow: asInteger(raw.sourceRow),
      rowHash: raw.rowHash == null ? null : asString(raw.rowHash),
      sourceIdRaw: raw.sourceIdRaw == null ? null : asString(raw.sourceIdRaw),
      sourceTimestampRaw:
        raw.sourceTimestampRaw == null
          ? null
          : asString(raw.sourceTimestampRaw),
      rawModel: raw.rawModel == null ? null : asString(raw.rawModel),
      rawDealer: raw.rawDealer == null ? null : asString(raw.rawDealer),
      headersJson: raw.headersJson == null ? null : asString(raw.headersJson),
      valuesJson: raw.valuesJson == null ? null : asString(raw.valuesJson),
      payloadJson: raw.payloadJson == null ? null : asString(raw.payloadJson),
    };
    byKey.set(rowKey(row.sourceSheet, row.sourceRow), row);
  }
  return byKey;
}

async function readLeadIds(
  connection: PoolConnection,
  rows: readonly MappedLeadSyncRow[]
): Promise<Map<string, number>> {
  const existing = await readExistingRows(connection, rows);
  const ids = new Map<string, number>();
  for (const row of rows) {
    const current = existing.get(rowKey(row.sourceSheet, row.sourceRow));
    if (current?.leadId)
      ids.set(rowKey(row.sourceSheet, row.sourceRow), current.leadId);
  }
  return ids;
}

async function upsertLeads(
  connection: PoolConnection,
  rows: readonly MappedLeadSyncRow[]
): Promise<void> {
  for (const batch of chunk(rows, ROW_BATCH_SIZE)) {
    const values: unknown[] = [];
    for (const row of batch) {
      values.push(
        row.sourceSheet,
        row.sourceRow,
        row.leadDate,
        row.leadHour,
        row.name,
        row.rawModel,
        row.version,
        row.channel,
        row.campaign,
        row.rawDealer,
        row.city,
        row.state,
        row.crm
      );
    }
    await connection.execute(
      `INSERT INTO v2_leads
       (sourceSheet,sourceRow,leadDate,leadHour,name,model,version,channel,campaign,dealer,city,state,crm)
       VALUES ${placeholders(batch.length, 13)}
       ON DUPLICATE KEY UPDATE
         leadDate=VALUES(leadDate),leadHour=VALUES(leadHour),name=VALUES(name),
         model=VALUES(model),version=VALUES(version),channel=VALUES(channel),
         campaign=VALUES(campaign),dealer=VALUES(dealer),city=VALUES(city),
         state=VALUES(state),crm=VALUES(crm)`,
      values
    );
  }
}

async function insertHistory(
  connection: PoolConnection,
  rows: readonly {
    row: MappedLeadSyncRow;
    leadId: number;
    old: ExistingSyncRow | undefined;
    importId: number;
    actor: LeadsSyncActor;
    spreadsheetId: string;
  }[]
): Promise<void> {
  for (const batch of chunk(rows, ROW_BATCH_SIZE)) {
    const values: unknown[] = [];
    for (const item of batch) {
      const { row, old, importId, actor } = item;
      values.push(
        LEADS_SYNC_SOURCE_ID,
        row.sourceSheet,
        row.sourceRow,
        item.leadId,
        importId,
        actor.id,
        actor.username,
        old ? "update" : "insert",
        oldSnapshotJson(old),
        newSnapshotJson(row),
        safeJson({
          sourceId: LEADS_SYNC_SOURCE_ID,
          spreadsheetId: item.spreadsheetId,
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
          importId,
          actorId: actor.id,
          actorUsername: actor.username,
        })
      );
    }
    await connection.execute(
      `INSERT INTO v2_lead_sync_history
       (sourceId,sourceSheet,sourceRow,leadId,importId,actorId,actorUsername,
        changeKind,oldSnapshotJson,newSnapshotJson,provenanceJson)
       VALUES ${placeholders(batch.length, 11)}`,
      values
    );
  }
}

async function upsertCurrentSnapshots(
  connection: PoolConnection,
  rows: readonly MappedLeadSyncRow[],
  leadIds: ReadonlyMap<string, number>,
  importId: number
): Promise<void> {
  for (const batch of chunk(rows, ROW_BATCH_SIZE)) {
    const values: unknown[] = [];
    for (const row of batch) {
      const leadId = leadIds.get(rowKey(row.sourceSheet, row.sourceRow));
      if (!leadId) throw new Error("Lead físico não encontrado após UPSERT.");
      values.push(
        LEADS_SYNC_SOURCE_ID,
        row.sourceSheet,
        row.sourceRow,
        leadId,
        row.sourceIdRaw,
        row.sourceTimestampRaw,
        row.rawModel,
        row.rawDealer,
        row.rowHash,
        safeJson(row.headers),
        safeJson(row.rawValues),
        row.payloadJson,
        importId
      );
    }
    await connection.execute(
      `INSERT INTO v2_lead_sync_rows
       (sourceId,sourceSheet,sourceRow,leadId,sourceIdRaw,sourceTimestampRaw,
        rawModel,rawDealer,rowHash,headersJson,valuesJson,payloadJson,lastImportId)
       VALUES ${placeholders(batch.length, 13)}
       ON DUPLICATE KEY UPDATE
         leadId=VALUES(leadId),sourceIdRaw=VALUES(sourceIdRaw),
         sourceTimestampRaw=VALUES(sourceTimestampRaw),rawModel=VALUES(rawModel),
         rawDealer=VALUES(rawDealer),rowHash=VALUES(rowHash),
         headersJson=VALUES(headersJson),valuesJson=VALUES(valuesJson),
         payloadJson=VALUES(payloadJson),lastImportId=VALUES(lastImportId)`,
      values
    );
  }
}

async function readAggregate(connection: PoolConnection): Promise<{
  totalRows: number;
  latestLeadDate: string | null;
  sourceCounts: LeadsSyncSourceCount[];
}> {
  const [totals] = await connection.execute<DbMap[]>(
    "SELECT COUNT(*) AS totalRows,MAX(leadDate) AS latestLeadDate FROM v2_leads"
  );
  const [sources] = await connection.execute<DbMap[]>(
    "SELECT sourceSheet AS name,COUNT(*) AS count,MIN(leadDate) AS minDate,MAX(leadDate) AS maxDate FROM v2_leads GROUP BY sourceSheet ORDER BY sourceSheet"
  );
  return {
    totalRows: asInteger(totals[0]?.totalRows),
    latestLeadDate: totals[0]?.latestLeadDate
      ? asString(totals[0].latestLeadDate)
      : null,
    sourceCounts: sources.map(source => ({
      name: asString(source.name),
      count: asInteger(source.count),
      minDate: source.minDate ? asString(source.minDate) : null,
      maxDate: source.maxDate ? asString(source.maxDate) : null,
    })),
  };
}

async function importPreparedSnapshot(
  snapshot: LeadsSnapshotInput,
  prepared: PreparedLeadsSnapshot,
  actor: LeadsSyncActor,
  origin: LeadsSyncOrigin
): Promise<LeadsSyncResult> {
  const pool = getV2Pool();
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [sourceRows] = await connection.execute<DbMap[]>(
      "SELECT id,spreadsheetId,importedAt,totalRows,invalidDateRows,inputSha256 FROM v2_sources WHERE id=? FOR UPDATE",
      [LEADS_SYNC_SOURCE_ID]
    );
    const source = sourceRows[0];
    if (!source) throw configurationError();
    if (asString(source.spreadsheetId) !== snapshot.spreadsheetId)
      throw invalidSourceError(
        "A planilha não corresponde à fonte autorizada."
      );

    // This lock serializes the source hash check and makes two identical first
    // loads converge even when the import-history table is initially empty.
    await connection.execute(
      "SELECT id FROM v2_lead_imports WHERE sourceId=? AND inputSha256=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [LEADS_SYNC_SOURCE_ID, prepared.inputSha256]
    );

    const currentHash = asString(source.inputSha256);
    if (currentHash && currentHash === prepared.inputSha256) {
      const aggregate = await readAggregate(connection);
      await connection.commit();
      transactionStarted = false;
      return {
        changed: false,
        importedAt: asIso(source.importedAt),
        totalRows: aggregate.totalRows,
        inserted: 0,
        updated: 0,
        sourceCounts: aggregate.sourceCounts,
        latestLeadDate: aggregate.latestLeadDate,
      };
    }

    const [importResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO v2_lead_imports
       (sourceId,spreadsheetId,origin,actorId,actorUsername,inputSha256,
        totalRows,invalidDateRows,metadataJson)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        LEADS_SYNC_SOURCE_ID,
        snapshot.spreadsheetId,
        origin,
        actor.id,
        actor.username,
        prepared.inputSha256,
        prepared.rows.length,
        0,
        sourceMetadataJson(prepared),
      ]
    );
    const importId = asInteger(importResult.insertId);
    if (importId <= 0) throw new Error("Import ID inválido.");

    let inserted = 0;
    let updated = 0;
    const changedRows: Array<{
      row: MappedLeadSyncRow;
      leadId: number;
      old: ExistingSyncRow | undefined;
      importId: number;
      actor: LeadsSyncActor;
      spreadsheetId: string;
    }> = [];

    for (const batch of chunk(prepared.rows, ROW_BATCH_SIZE)) {
      const oldRows = await readExistingRows(connection, batch);
      await upsertLeads(connection, batch);
      const leadIds = await readLeadIds(connection, batch);
      const batchChangedRows: typeof changedRows = [];
      for (const row of batch) {
        const key = rowKey(row.sourceSheet, row.sourceRow);
        const old = oldRows.get(key);
        const leadId = leadIds.get(key);
        if (!leadId) throw new Error("ID físico não encontrado após UPSERT.");
        const changed = !old || old.rowHash !== row.rowHash;
        if (!old) inserted += 1;
        else if (changed) updated += 1;
        if (changed)
          batchChangedRows.push({
            row,
            leadId,
            old,
            importId,
            actor,
            spreadsheetId: snapshot.spreadsheetId,
          });
      }
      changedRows.push(...batchChangedRows);
      await insertHistory(connection, batchChangedRows);
      await upsertCurrentSnapshots(connection, batch, leadIds, importId);
    }

    const aggregate = await readAggregate(connection);
    const importedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await connection.execute(
      "UPDATE v2_sources SET importedAt=?,totalRows=?,invalidDateRows=?,inputSha256=? WHERE id=?",
      [
        importedAt,
        aggregate.totalRows,
        0,
        prepared.inputSha256,
        LEADS_SYNC_SOURCE_ID,
      ]
    );
    await connection.commit();
    transactionStarted = false;
    return {
      changed: true,
      importedAt: importedAt.toISOString(),
      totalRows: aggregate.totalRows,
      inserted,
      updated,
      sourceCounts: aggregate.sourceCounts,
      latestLeadDate: aggregate.latestLeadDate,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the safe import error and never expose driver details.
      }
    }
    if (error instanceof LeadsSyncError) throw error;
    throw new LeadsSyncError(
      "IMPORT_FAILED",
      "Não foi possível importar a base de Leads. Nenhuma alteração foi confirmada."
    );
  } finally {
    connection.release();
  }
}

/** Imports a fully materialized Google Sheets snapshot supplied by the caller. */
export async function importLeadsSnapshot(
  snapshot: LeadsSnapshotInput,
  actor: LeadsSyncActor,
  origin: LeadsSyncOrigin
): Promise<LeadsSyncResult> {
  assertSnapshotInput(snapshot);
  assertActor(actor);
  assertOrigin(origin);
  let prepared: PreparedLeadsSnapshot;
  try {
    prepared = prepareLeadsSnapshot(snapshot.valueRanges);
  } catch (error) {
    if (error instanceof LeadsSyncError) throw error;
    throw invalidSourceError(
      error instanceof Error
        ? error.message
        : "A fonte de Leads não pôde ser validada."
    );
  }
  return importPreparedSnapshot(snapshot, prepared, actor, origin);
}

function readServiceAccount(): GoogleServiceAccount | null {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleServiceAccount>;
    if (
      typeof parsed.client_email !== "string" ||
      parsed.client_email.trim() === "" ||
      typeof parsed.private_key !== "string" ||
      parsed.private_key.trim() === ""
    )
      return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function makeGoogleAssertion(account: GoogleServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: GOOGLE_SHEETS_READONLY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
}

async function readResponseText(
  response: Response,
  maxBytes: number
): Promise<string> {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunkValue = next.value as Uint8Array;
        total += chunkValue.byteLength;
        if (total > maxBytes) throw new Error("Google response too large");
        chunks.push(chunkValue);
      }
    } finally {
      reader.releaseLock();
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunkValue of chunks) {
      merged.set(chunkValue, offset);
      offset += chunkValue.byteLength;
    }
    return new TextDecoder().decode(merged);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes)
    throw new Error("Google response too large");
  return text;
}

async function fetchJson(
  url: string,
  accessToken: string,
  deadline: number
): Promise<Record<string, unknown>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Google request timed out");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Google request failed");
    const body = await readResponseText(response, GOOGLE_MAX_RESPONSE_BYTES);
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object")
      throw new Error("Google response invalid");
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAccessToken(
  account: GoogleServiceAccount,
  deadline: number
): Promise<string> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Google request timed out");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remaining);
  try {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: makeGoogleAssertion(account),
    });
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Google token request failed");
    const text = await readResponseText(response, 128 * 1024);
    const parsed = JSON.parse(text) as { access_token?: unknown };
    if (typeof parsed.access_token !== "string" || !parsed.access_token)
      throw new Error("Google token response invalid");
    return parsed.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

async function readSpreadsheetIdFromDb(): Promise<string | null> {
  try {
    const [rows] = await getV2Pool().execute<DbMap[]>(
      "SELECT spreadsheetId FROM v2_sources WHERE id=? LIMIT 1",
      [LEADS_SYNC_SOURCE_ID]
    );
    const value = rows[0]?.spreadsheetId;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

async function resolveSpreadsheetId(): Promise<string> {
  const configured = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (configured) return configured;
  const fromDb = await readSpreadsheetIdFromDb();
  if (!fromDb) throw configurationError();
  return fromDb;
}

async function fetchGoogleSnapshot(
  spreadsheetId: string,
  accessToken: string,
  deadline: number
): Promise<LeadsSnapshotInput> {
  const metadataUrl = new URL(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`
  );
  metadataUrl.searchParams.set(
    "fields",
    "sheets(properties(title,gridProperties(columnCount)))"
  );
  const metadata = await fetchJson(
    metadataUrl.toString(),
    accessToken,
    deadline
  );
  const sheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
  const existing = new Set(
    sheets
      .map(sheet => {
        const properties =
          sheet && typeof sheet === "object"
            ? (sheet as { properties?: { title?: unknown } }).properties
            : undefined;
        return typeof properties?.title === "string" ? properties.title : "";
      })
      .filter(
        title =>
          title !== "Página10" &&
          (LEADS_SYNC_ALLOWED_SHEETS as readonly string[]).includes(title)
      )
  );
  const titles = LEADS_SYNC_ALLOWED_SHEETS.filter(sheet => existing.has(sheet));
  if (titles.length === 0)
    throw new Error("Google workbook has no allowed source sheets");

  const valuesUrl = new URL(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet`
  );
  valuesUrl.searchParams.set("majorDimension", "ROWS");
  valuesUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  valuesUrl.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  for (const title of titles) {
    const metadataSheet = sheets.find(
      sheet =>
        (sheet as { properties?: { title?: string } })?.properties?.title ===
        title
    ) as
      | { properties?: { gridProperties?: { columnCount?: number } } }
      | undefined;
    const columns =
      title === "Meta"
        ? 23
        : Math.min(
            52,
            metadataSheet?.properties?.gridProperties?.columnCount ?? 32
          );
    let columnName = "";
    let remainingColumns = columns;
    while (remainingColumns > 0) {
      remainingColumns--;
      columnName =
        String.fromCharCode(65 + (remainingColumns % 26)) + columnName;
      remainingColumns = Math.floor(remainingColumns / 26);
    }
    valuesUrl.searchParams.append(
      "ranges",
      `${quoteSheetTitle(title)}!A:${columnName}`
    );
  }
  const values = await fetchJson(valuesUrl.toString(), accessToken, deadline);
  const valueRanges = Array.isArray(values.valueRanges)
    ? values.valueRanges
    : [];
  return {
    spreadsheetId,
    valueRanges: valueRanges
      .filter(valueRange => valueRange && typeof valueRange === "object")
      .map(valueRange => {
        const item = valueRange as { range?: unknown; values?: unknown };
        return {
          range: typeof item.range === "string" ? item.range : "",
          values: Array.isArray(item.values)
            ? (item.values as unknown[][])
            : [],
        };
      }),
  };
}

/** Reads metadata and rendered values from Google Sheets, never writes Sheets. */
export async function syncLeadsFromGoogle(
  actor: LeadsSyncActor
): Promise<LeadsSyncResult> {
  assertActor(actor);
  const account = readServiceAccount();
  if (!account) throw configurationError();
  const spreadsheetId = await resolveSpreadsheetId();
  const deadline = Date.now() + GOOGLE_REQUEST_TIMEOUT_MS;
  try {
    const accessToken = await requestAccessToken(account, deadline);
    const snapshot = await fetchGoogleSnapshot(
      spreadsheetId,
      accessToken,
      deadline
    );
    return await importLeadsSnapshot(snapshot, actor, "server");
  } catch (error) {
    if (error instanceof LeadsSyncError) throw error;
    throw new LeadsSyncError(
      "IMPORT_FAILED",
      "Não foi possível sincronizar a base de Leads do Google Sheets."
    );
  }
}

/** Reports runtime readiness without returning credentials or spreadsheet secrets. */
export async function getLeadsSyncConnectionStatus(): Promise<LeadsSyncConnectionStatus> {
  if (!readServiceAccount())
    return { configured: false, message: LEADS_SYNC_CONFIGURATION_MESSAGE };
  if (process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim())
    return { configured: true };
  if (await readSpreadsheetIdFromDb()) return { configured: true };
  return { configured: false, message: LEADS_SYNC_CONFIGURATION_MESSAGE };
}
