import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { leadImports, leads, type LeadImport } from "../drizzle/schema";
import { getDb } from "./db";
import {
  getLeadCsvFileHash,
  getYesterdayInSaoPaulo,
  LeadCsvValidationError,
  MAX_LEAD_CSV_BYTES,
  parseLeadCsv,
  type ParsedLeadCsv,
} from "./leadsCsv";
import { storagePut } from "./storage";

const INSERT_CHUNK_SIZE = 500;
const QUERY_CHUNK_SIZE = 1_000;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1_000;

export type LeadDuplicateChannelBreakdown = {
  channel: string;
  withinFile: number;
  alreadyStored: number;
  total: number;
};

export type LeadCsvPreview = {
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  rowsTotal: number;
  validRows: number;
  invalidRows: number;
  fallbackDateUsed: string;
  fallbackDateCount: number;
  uniqueValidRows: number;
  duplicateRowsWithinFile: number;
  duplicateRowsByChannel: LeadDuplicateChannelBreakdown[];
  rowsAlreadyStored: number;
  rowsReadyToInsert: number;
  dateFrom: string | null;
  dateTo: string | null;
  channels: ParsedLeadCsv["channels"];
  models: ParsedLeadCsv["models"];
  regions: ParsedLeadCsv["regions"];
  errors: ParsedLeadCsv["errors"];
  alreadyImported: boolean;
  existingImport: LeadImport | null;
};

export type LeadCsvImportResult = LeadCsvPreview & {
  importId: number;
  status: "COMPLETED";
  rowsInserted: number;
  rowsSkipped: number;
  rowsInvalid: number;
  idempotent: boolean;
  fileUrl: string | null;
  importedAt: number;
};

export type LeadCsvCurrentBaseAnalysis = LeadCsvPreview & {
  currentBaseRows: number;
  rowsRemovedFromSource: number;
  hasChanges: boolean;
};

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function sanitizeLeadCsvFileName(fileName: string): string {
  const basename = fileName.replace(/\\/g, "/").split("/").at(-1)?.trim() ?? "";
  if (!basename || !basename.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
    throw new LeadCsvValidationError("Selecione um arquivo com extensão .csv.");
  }
  const sanitized = basename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 180);
  return sanitized || "leads.csv";
}

export function decodeLeadCsvBase64(value: string): Buffer {
  const base64 = value.replace(/^data:text\/csv(?:;charset=[^;,]+)?;base64,/i, "").replace(/\s+/g, "");
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new LeadCsvValidationError("O conteúdo do arquivo CSV está corrompido.");
  }
  const bytes = Buffer.from(base64, "base64");
  const canonicalInput = base64.replace(/=+$/, "");
  const canonicalDecoded = bytes.toString("base64").replace(/=+$/, "");
  if (canonicalInput !== canonicalDecoded) {
    throw new LeadCsvValidationError("O conteúdo do arquivo CSV está corrompido.");
  }
  if (bytes.length > MAX_LEAD_CSV_BYTES) {
    throw new LeadCsvValidationError("O arquivo CSV excede o limite de 10 MB.");
  }
  return bytes;
}

async function findImportByHash(fileHash: string): Promise<LeadImport | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [record] = await db.select().from(leadImports).where(eq(leadImports.fileHash, fileHash)).limit(1);
  return record ?? null;
}

async function findLatestCompletedImport(): Promise<LeadImport | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [record] = await db
    .select()
    .from(leadImports)
    .where(eq(leadImports.status, "COMPLETED"))
    .orderBy(desc(leadImports.completedAt), desc(leadImports.id))
    .limit(1);
  return record ?? null;
}

async function findExistingContentHashes(contentHashes: string[]): Promise<Set<string>> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const existing = new Set<string>();
  for (const hashChunk of chunk(contentHashes, QUERY_CHUNK_SIZE)) {
    if (!hashChunk.length) continue;
    const rows = await db
      .select({ contentHash: leads.contentHash })
      .from(leads)
      .where(inArray(leads.contentHash, hashChunk));
    for (const row of rows) existing.add(row.contentHash);
  }
  return existing;
}

function buildDuplicateRowsByChannel(
  parsed: ParsedLeadCsv,
  existingContentHashes: ReadonlySet<string>,
): LeadDuplicateChannelBreakdown[] {
  const byChannel = new Map<string, { withinFile: number; alreadyStored: number }>();
  const getEntry = (channel: string) => {
    const current = byChannel.get(channel) ?? { withinFile: 0, alreadyStored: 0 };
    byChannel.set(channel, current);
    return current;
  };

  for (const item of parsed.duplicateRowsByChannel) {
    getEntry(item.value).withinFile += item.count;
  }
  for (const record of parsed.records) {
    if (existingContentHashes.has(record.contentHash)) {
      getEntry(record.channel).alreadyStored += 1;
    }
  }

  return Array.from(byChannel.entries())
    .map(([channel, counts]) => ({
      channel,
      withinFile: counts.withinFile,
      alreadyStored: counts.alreadyStored,
      total: counts.withinFile + counts.alreadyStored,
    }))
    .sort(
      (left, right) =>
        right.total - left.total || left.channel.localeCompare(right.channel, "pt-BR"),
    );
}

function buildPreview(
  parsed: ParsedLeadCsv,
  fileName: string,
  existingContentHashes: ReadonlySet<string>,
  existingImport: LeadImport | null,
): LeadCsvPreview {
  const rowsAlreadyStored = existingContentHashes.size;
  const rowsReadyToInsert = Math.max(0, parsed.uniqueValidRows - rowsAlreadyStored);
  const duplicateRowsByChannel = buildDuplicateRowsByChannel(parsed, existingContentHashes);
  const classifiedDuplicates = duplicateRowsByChannel.reduce(
    (sum, item) => sum + item.total,
    0,
  );
  const reconciledRows = rowsReadyToInsert + classifiedDuplicates + parsed.invalidRows;
  if (reconciledRows !== parsed.rowsTotal) {
    throw new Error(
      `Falha de reconciliação do CSV: ${parsed.rowsTotal} linha(s) lida(s), mas ${reconciledRows} foram classificadas.`,
    );
  }

  return {
    fileName,
    fileHash: parsed.fileHash,
    fileSizeBytes: parsed.fileSizeBytes,
    rowsTotal: parsed.rowsTotal,
    validRows: parsed.validRows,
    invalidRows: parsed.invalidRows,
    fallbackDateUsed: parsed.fallbackDateUsed,
    fallbackDateCount: parsed.fallbackDateCount,
    uniqueValidRows: parsed.uniqueValidRows,
    duplicateRowsWithinFile: parsed.duplicateRowsWithinFile,
    duplicateRowsByChannel,
    rowsAlreadyStored,
    rowsReadyToInsert,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    channels: parsed.channels,
    models: parsed.models,
    regions: parsed.regions,
    errors: parsed.errors,
    alreadyImported:
      existingImport?.status === "COMPLETED" && rowsAlreadyStored === parsed.uniqueValidRows,
    existingImport,
  };
}

export async function previewLeadCsv(input: {
  fileName: string;
  bytes: Buffer;
  fallbackDate?: string;
}): Promise<LeadCsvPreview> {
  const fileName = sanitizeLeadCsvFileName(input.fileName);
  const existingImport = await findImportByHash(getLeadCsvFileHash(input.bytes));
  const fallbackDate =
    existingImport?.fallbackDateUsed ?? input.fallbackDate ?? getYesterdayInSaoPaulo();
  const parsed = parseLeadCsv(input.bytes, fallbackDate);
  const existingContentHashes = existingImport
    ? await findExistingContentHashes(parsed.records.map(record => record.contentHash))
    : new Set<string>();
  return buildPreview(parsed, fileName, existingContentHashes, existingImport);
}

export async function analyzeLeadCsvAgainstCurrentBase(input: {
  fileName: string;
  bytes: Buffer;
  fallbackDate?: string;
}): Promise<LeadCsvCurrentBaseAnalysis> {
  const fileName = sanitizeLeadCsvFileName(input.fileName);
  const fallbackDate = input.fallbackDate ?? getYesterdayInSaoPaulo();
  const parsed = parseLeadCsv(input.bytes, fallbackDate);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const latestCompletedImport = await findLatestCompletedImport();
  if (latestCompletedImport?.fileHash === parsed.fileHash) {
    const currentHashes = new Set(parsed.records.map(record => record.contentHash));
    const preview = buildPreview(parsed, fileName, currentHashes, latestCompletedImport);
    return {
      ...preview,
      currentBaseRows: latestCompletedImport.rowsInserted,
      rowsRemovedFromSource: 0,
      hasChanges: false,
    };
  }
  const currentRows = await db
    .select({ contentHash: leads.contentHash, sourceChannel: leads.sourceChannel })
    .from(leads);
  const currentBaseRows = currentRows.length;
  const candidateHashes = new Set(parsed.records.map(record => record.contentHash));
  const existingContentHashes = new Set(
    currentRows
      .map(row => row.contentHash)
      .filter(contentHash => candidateHashes.has(contentHash)),
  );
  const preview = buildPreview(parsed, fileName, existingContentHashes, null);
  const rowsRemovedFromSource = Math.max(0, currentBaseRows - preview.rowsAlreadyStored);
  const candidateSourceChannels = new Map(
    parsed.records.map(record => [record.contentHash, record.sourceChannel]),
  );
  const sourceChannelChanges = currentRows.filter(row => {
    const candidate = candidateSourceChannels.get(row.contentHash);
    return candidate !== undefined && row.sourceChannel !== candidate;
  }).length;
  return {
    ...preview,
    currentBaseRows,
    rowsRemovedFromSource,
    hasChanges:
      preview.rowsReadyToInsert > 0 || rowsRemovedFromSource > 0 || sourceChannelChanges > 0,
  };
}

async function markImportFailed(importId: number, error: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const message = error instanceof Error ? error.message : "Falha não identificada durante a importação.";
  await db
    .update(leadImports)
    .set({
      status: "FAILED",
      errorSummary: [message.slice(0, 500)],
      completedAt: Date.now(),
    })
    .where(eq(leadImports.id, importId));
}

async function createOrResetImport(input: {
  parsed: ParsedLeadCsv;
  fileName: string;
  actor: string;
  existingImport: LeadImport | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = Date.now();

  if (input.existingImport) {
    if (
      input.existingImport.status === "PROCESSING" &&
      now - input.existingImport.createdAt < PROCESSING_TIMEOUT_MS
    ) {
      throw new Error("Este arquivo já está sendo processado. Aguarde a conclusão antes de tentar novamente.");
    }
    await db
      .update(leadImports)
      .set({
        fileName: input.fileName,
        fileSizeBytes: input.parsed.fileSizeBytes,
        fileKey: null,
        fileUrl: null,
        status: "PROCESSING",
        rowsTotal: input.parsed.rowsTotal,
        rowsInserted: 0,
        rowsSkipped: 0,
        rowsInvalid: input.parsed.invalidRows,
        fallbackDateUsed: input.parsed.fallbackDateUsed,
        fallbackDateCount: input.parsed.fallbackDateCount,
        errorSummary: null,
        importedBy: input.actor,
        createdAt: now,
        completedAt: null,
      })
      .where(eq(leadImports.id, input.existingImport.id));
    return input.existingImport.id;
  }

  await db.insert(leadImports).values({
    fileName: input.fileName,
    fileHash: input.parsed.fileHash,
    fileSizeBytes: input.parsed.fileSizeBytes,
    status: "PROCESSING",
    rowsTotal: input.parsed.rowsTotal,
    rowsInserted: 0,
    rowsSkipped: 0,
    rowsInvalid: input.parsed.invalidRows,
    fallbackDateUsed: input.parsed.fallbackDateUsed,
    fallbackDateCount: input.parsed.fallbackDateCount,
    importedBy: input.actor,
    createdAt: now,
  });
  const [created] = await db
    .select({ id: leadImports.id })
    .from(leadImports)
    .where(eq(leadImports.fileHash, input.parsed.fileHash))
    .limit(1);
  if (!created) throw new Error("Não foi possível registrar o lote de importação.");
  return created.id;
}

export async function importLeadCsv(input: {
  fileName: string;
  bytes: Buffer;
  actor: string;
  fallbackDate?: string;
  forceReplace?: boolean;
}): Promise<LeadCsvImportResult> {
  const fileName = sanitizeLeadCsvFileName(input.fileName);
  const existingImport = await findImportByHash(getLeadCsvFileHash(input.bytes));
  const fallbackDate =
    existingImport?.fallbackDateUsed ?? input.fallbackDate ?? getYesterdayInSaoPaulo();
  const parsed = parseLeadCsv(input.bytes, fallbackDate);
  const actor = input.actor.trim();
  if (!actor) throw new Error("Usuário responsável pela importação não identificado.");

  const existingContentHashes = existingImport
    ? await findExistingContentHashes(parsed.records.map(record => record.contentHash))
    : new Set<string>();
  const rowsAlreadyStored = existingContentHashes.size;
  const preview = buildPreview(parsed, fileName, existingContentHashes, existingImport);

  if (
    !input.forceReplace &&
    existingImport?.status === "COMPLETED" &&
    rowsAlreadyStored === parsed.uniqueValidRows
  ) {
    return {
      ...preview,
      importId: existingImport.id,
      status: "COMPLETED",
      rowsInserted: 0,
      rowsSkipped: parsed.validRows,
      rowsInvalid: parsed.invalidRows,
      idempotent: true,
      fileUrl: existingImport.fileUrl,
      importedAt: existingImport.completedAt ?? existingImport.createdAt,
    };
  }
  if (parsed.invalidRows > 0) {
    throw new LeadCsvValidationError(
      `O arquivo possui ${parsed.invalidRows.toLocaleString("pt-BR")} linha(s) inválida(s). Corrija o CSV antes de confirmar a importação.`,
    );
  }
  if (parsed.validRows === 0) {
    throw new LeadCsvValidationError(
      "O arquivo não contém nenhuma linha válida para substituir a base consolidada.",
    );
  }

  const importId = await createOrResetImport({ parsed, fileName, actor, existingImport });

  try {
    const stored = await storagePut(
      `lead-imports/${parsed.fileHash.slice(0, 12)}/${fileName}`,
      input.bytes,
      "text/csv; charset=utf-8",
    );
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    const now = Date.now();

    const result = await db.transaction(async tx => {
      // Cada upload confirmado substitui a base consolidada. A exclusão ocorre
      // dentro da mesma transação: qualquer falha restaura integralmente a base anterior.
      await tx.delete(leads);

      for (const recordsChunk of chunk(parsed.records, INSERT_CHUNK_SIZE)) {
        await tx
          .insert(leads)
          .ignore()
          .values(
            recordsChunk.map(record => ({
              importId,
              sourceRowNumber: record.sourceRowNumber,
              recordHash: record.recordHash,
              contentHash: record.contentHash,
              correctedDate: record.correctedDate,
              correctedDateRaw: record.correctedDateRaw,
              sourceDateRaw: record.sourceDateRaw,
              channel: record.channel,
              channelRaw: record.channelRaw,
              sourceChannel: record.sourceChannel,
              model: record.model,
              modelRaw: record.modelRaw,
              region: record.region,
              regionRaw: record.regionRaw,
              city: record.city,
              cityRaw: record.cityRaw,
              dealerName: record.dealerName,
              dealerRaw: record.dealerRaw,
              contactName: record.contactName,
              email: record.email,
              phone: record.phone,
              rawPayload: record.rawPayload,
              createdAt: now,
            })),
          );
      }

      const insertedRows = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.importId, importId));
      const rowsInserted = insertedRows.length;
      if (rowsInserted !== parsed.uniqueValidRows) {
        throw new Error(
          `Falha de integridade: eram esperadas ${parsed.uniqueValidRows} identidades únicas, mas somente ${rowsInserted} foram confirmadas.`,
        );
      }
      const rowsSkipped = parsed.validRows - rowsInserted;

      await tx
        .update(leadImports)
        .set({
          fileKey: stored.key,
          fileUrl: stored.url,
          status: "COMPLETED",
          rowsTotal: parsed.rowsTotal,
          rowsInserted,
          rowsSkipped,
          rowsInvalid: parsed.invalidRows,
          fallbackDateUsed: parsed.fallbackDateUsed,
          fallbackDateCount: parsed.fallbackDateCount,
          errorSummary: null,
          completedAt: now,
        })
        .where(and(eq(leadImports.id, importId), eq(leadImports.status, "PROCESSING")));

      return { rowsInserted, rowsSkipped };
    });

    return {
      ...preview,
      importId,
      status: "COMPLETED",
      rowsInserted: result.rowsInserted,
      rowsSkipped: result.rowsSkipped,
      rowsInvalid: parsed.invalidRows,
      idempotent: false,
      fileUrl: stored.url,
      importedAt: now,
    };
  } catch (error) {
    await markImportFailed(importId, error);
    throw error;
  }
}

export async function getLeadImportHistory(limit = 20): Promise<LeadImport[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db
    .select()
    .from(leadImports)
    .orderBy(desc(leadImports.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
}
