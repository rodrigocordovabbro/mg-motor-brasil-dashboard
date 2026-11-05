import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { getDashboardCutoffDate } from "../shared/dashboardDates";
import type { V2Identity } from "./v2Auth";
import { getV2Pool } from "./v2Db";

const MAX_BASE64_LENGTH = 1_400_000;
const MAX_ARCHIVE_BYTES = 1 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_ROWS = 500;
const MAX_SOURCE_DAYS = 366;
const EXPECTED_FIXED_HEADERS = [
  "NOME DA LOJA",
  "Responsável por CRM",
  "Integração Syonet",
  "Integração API BBRO",
] as const;
const EXPECTED_DAY_HEADERS = ["SYONET", "Manual", "Vol. Lead"] as const;
const MONTHS = new Map<string, number>([
  ["jan", 1],
  ["janeiro", 1],
  ["fev", 2],
  ["fevereiro", 2],
  ["mar", 3],
  ["março", 3],
  ["marco", 3],
  ["abr", 4],
  ["abril", 4],
  ["mai", 5],
  ["maio", 5],
  ["jun", 6],
  ["junho", 6],
  ["jul", 7],
  ["julho", 7],
  ["ago", 8],
  ["agosto", 8],
  ["set", 9],
  ["setembro", 9],
  ["out", 10],
  ["outubro", 10],
  ["nov", 11],
  ["novembro", 11],
  ["dez", 12],
  ["dezembro", 12],
]);

type SourceDay = {
  date: string;
  label: string;
  sourceTotal: number | null;
  computedTotal: number | null;
};

type SourceCell = {
  date: string;
  syonet: string;
  sourceManual: string;
  volume: number | null;
};

export type ParsedDispatchRow = {
  rowNumber: number;
  storeName: string;
  crmResponsible: string;
  syonetIntegration: string;
  bbroIntegration: string;
  cells: SourceCell[];
};

export type ParsedDispatchWorkbook = {
  fileSha256: string;
  fileName: string;
  title: string;
  dateFrom: string;
  dateTo: string;
  generatedLabel: string;
  days: SourceDay[];
  rows: ParsedDispatchRow[];
  warnings: string[];
};

type Period = { dateFrom: string; dateTo: string };

function fail(message: string): never {
  throw new Error(`Arquivo Envios inválido: ${message}`);
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      richText?: unknown[];
      result?: unknown;
    };
    if (typeof candidate.text === "string") return candidate.text;
    if (Array.isArray(candidate.richText)) {
      return candidate.richText
        .map(part => textOf((part as { text?: unknown }).text ?? part))
        .join("");
    }
    if (candidate.result != null) return textOf(candidate.result);
  }
  return String(value);
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value as unknown;
  if (value && typeof value === "object" && "formula" in value) {
    return (value as { result?: unknown }).result;
  }
  return value;
}

function parseDmy(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearValue = Number(match[3]);
  const year = yearValue < 100 ? 2000 + yearValue : yearValue;
  return makeIsoDate(year, month, day);
}

function makeIsoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  )
    return null;
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

function parsePeriod(title: string): Period {
  const match = title.match(
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+a\s+(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (!match)
    fail("A1 não contém o período no formato DD/MM/AAAA a DD/MM/AAAA.");
  const dateFrom = parseDmy(match[1]);
  const dateTo = parseDmy(match[2]);
  if (!dateFrom || !dateTo || dateFrom > dateTo)
    fail("o período de A1 é inválido.");
  return { dateFrom, dateTo };
}

function excelSerialParts(
  serial: number
): { month: number; day: number } | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 3_000_000) return null;
  const date = new Date(
    Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86_400_000
  );
  if (Number.isNaN(date.getTime())) return null;
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function monthDay(value: unknown): { month: number; day: number } | null {
  if (value instanceof Date) {
    return { month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }
  if (typeof value === "number") return excelSerialParts(value);
  const source = textOf(value).trim().toLocaleLowerCase("pt-BR");
  const fullDate = parseDmy(source);
  if (fullDate) {
    const date = new Date(`${fullDate}T12:00:00.000Z`);
    return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
  const match = source.match(
    /^(\d{1,2})\s*[\/-]\s*([a-zçãéêô]+|\d{1,2})(?:\s*[\/-]\s*(\d{2,4}))?\.?$/i
  );
  if (!match) return null;
  const day = Number(match[1]);
  const month = /^\d+$/.test(match[2])
    ? Number(match[2])
    : MONTHS.get(match[2].replace(/\.$/, ""));
  return month && Number.isInteger(month) ? { month, day } : null;
}

function resolvePeriodDate(value: unknown, period: Period): string | null {
  const parts = monthDay(value);
  if (!parts) return null;
  const fromYear = Number(period.dateFrom.slice(0, 4));
  const toYear = Number(period.dateTo.slice(0, 4));
  for (let year = fromYear - 1; year <= toYear + 1; year++) {
    const candidate = makeIsoDate(year, parts.month, parts.day);
    if (candidate && candidate >= period.dateFrom && candidate <= period.dateTo)
      return candidate;
  }
  return null;
}

function parseVolume(value: unknown): number | null {
  if (value == null || value === "") return null;
  let current: unknown = value;
  if (typeof current === "object" && current !== null && "result" in current) {
    current = (current as { result?: unknown }).result;
  }
  if (current == null || (typeof current === "string" && current.trim() === ""))
    return null;
  const numberValue =
    typeof current === "number" ? current : Number(String(current).trim());
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    fail("há um volume que não é um inteiro seguro não negativo.");
  }
  return numberValue;
}

function formatGeneratedLabel(title: string, dateTo: string): string {
  const match = title.match(/gerado\s+em\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return match?.[1] ?? dateTo.split("-").reverse().join("/");
}

function assertZipExpansionSafe(buffer: Buffer): void {
  if (buffer.length > MAX_ARCHIVE_BYTES)
    fail("o arquivo excede o limite de 1 MiB.");
  if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    fail("não é um XLSX ZIP válido.");
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buffer.lastIndexOf(eocdSignature);
  if (eocd < 0 || eocd + 22 > buffer.length)
    fail("o diretório ZIP está ausente.");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    fail("ZIP64 não é aceito neste importador.");
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES || centralOffset + centralSize > eocd) {
    fail("o diretório ZIP excede os limites permitidos.");
  }
  let cursor = centralOffset;
  let expanded = 0;
  for (let index = 0; index < entryCount; index++) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    ) {
      fail("o diretório ZIP contém uma entrada inválida.");
    }
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (uncompressed === 0xffffffff || compressed === 0xffffffff)
      fail("ZIP64 não é aceito.");
    if (uncompressed > MAX_ENTRY_UNCOMPRESSED_BYTES)
      fail("uma entrada ZIP excede o limite de expansão.");
    expanded += uncompressed;
    if (expanded > MAX_ARCHIVE_UNCOMPRESSED_BYTES)
      fail("a expansão total ZIP excede o limite permitido.");
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function decodeDispatchWorkbookBase64(base64: string): Buffer {
  if (
    typeof base64 !== "string" ||
    base64.length === 0 ||
    base64.length > MAX_BASE64_LENGTH
  ) {
    fail("base64 ausente ou acima do limite de 1,4 MB.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    fail("base64 inválido.");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) fail("arquivo vazio.");
  assertZipExpansionSafe(buffer);
  return buffer;
}

export async function parseDispatchWorkbook(
  fileName: string,
  base64: string
): Promise<ParsedDispatchWorkbook> {
  if (!fileName || fileName.length > 255 || !/\.xlsx$/i.test(fileName)) {
    fail("o nome deve identificar um arquivo .xlsx.");
  }
  const buffer = decodeDispatchWorkbookBase64(base64);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
  } catch {
    fail("não pôde ser lido como XLSX.");
  }
  const worksheet = workbook.getWorksheet("Envios");
  if (!worksheet) fail("a aba Envios não foi encontrada.");
  if (worksheet.rowCount > MAX_SOURCE_ROWS || worksheet.columnCount > 1_500) {
    fail("a aba Envios excede os limites de 500 linhas ou 366 dias.");
  }
  const title = textOf(cellValue(worksheet.getCell(1, 1)));
  const period = parsePeriod(title);
  const generatedLabel = formatGeneratedLabel(title, period.dateTo);
  for (let column = 1; column <= EXPECTED_FIXED_HEADERS.length; column++) {
    if (
      textOf(cellValue(worksheet.getCell(4, column))) !==
      EXPECTED_FIXED_HEADERS[column - 1]
    ) {
      fail(
        `o cabeçalho fixo da coluna ${column} não corresponde ao layout Envios.`
      );
    }
  }

  const groups: { date: string; label: string; startColumn: number }[] = [];
  const seenDates = new Set<string>();
  for (let column = 5; column <= worksheet.columnCount; column++) {
    const rawLabel = cellValue(worksheet.getCell(3, column));
    if (textOf(rawLabel).trim() === "") continue;
    const date = resolvePeriodDate(rawLabel, period);
    if (!date) fail(`a data da coluna ${column} está fora do período de A1.`);
    if (seenDates.has(date)) fail(`a data ${date} aparece mais de uma vez.`);
    if (column + 2 > worksheet.columnCount)
      fail("o último grupo diário está incompleto.");
    EXPECTED_DAY_HEADERS.forEach((expected, offset) => {
      if (
        textOf(cellValue(worksheet.getCell(4, column + offset))) !== expected
      ) {
        fail(`o grupo diário de ${date} não possui os três cabeçalhos exatos.`);
      }
    });
    seenDates.add(date);
    groups.push({ date, label: textOf(rawLabel), startColumn: column });
    column += 2;
    if (groups.length > MAX_SOURCE_DAYS) fail("a planilha excede 366 dias.");
  }
  if (!groups.length) fail("nenhum grupo diário foi encontrado.");

  const parsedRows: ParsedDispatchRow[] = [];
  const storeNames = new Set<string>();
  const dayTotals = new Map<string, number | null>();
  const sums = new Map<string, number>();
  for (const group of groups) {
    dayTotals.set(group.date, null);
    sums.set(group.date, 0);
  }
  let totalRowFound = false;
  for (
    let rowNumber = 5;
    rowNumber <= Math.min(worksheet.rowCount, MAX_SOURCE_ROWS);
    rowNumber++
  ) {
    const storeName = textOf(cellValue(worksheet.getCell(rowNumber, 1)));
    const allEmpty = Array.from({ length: worksheet.columnCount }, (_, i) =>
      textOf(cellValue(worksheet.getCell(rowNumber, i + 1))).trim()
    ).every(value => value === "");
    if (allEmpty) continue;
    if (storeName.trim().toUpperCase() === "TOTAL") {
      totalRowFound = true;
      for (const group of groups) {
        dayTotals.set(
          group.date,
          parseVolume(
            cellValue(worksheet.getCell(rowNumber, group.startColumn + 2))
          )
        );
      }
      break;
    }
    if (!storeName) fail(`a linha ${rowNumber} não possui nome de loja.`);
    if (storeNames.has(storeName))
      fail(`a loja ${JSON.stringify(storeName)} aparece mais de uma vez.`);
    storeNames.add(storeName);
    const parsed: ParsedDispatchRow = {
      rowNumber,
      storeName,
      crmResponsible: textOf(cellValue(worksheet.getCell(rowNumber, 2))),
      syonetIntegration: textOf(cellValue(worksheet.getCell(rowNumber, 3))),
      bbroIntegration: textOf(cellValue(worksheet.getCell(rowNumber, 4))),
      cells: [],
    };
    for (const group of groups) {
      const volume = parseVolume(
        cellValue(worksheet.getCell(rowNumber, group.startColumn + 2))
      );
      if (volume != null)
        sums.set(group.date, (sums.get(group.date) ?? 0) + volume);
      parsed.cells.push({
        date: group.date,
        syonet: textOf(
          cellValue(worksheet.getCell(rowNumber, group.startColumn))
        ),
        sourceManual: textOf(
          cellValue(worksheet.getCell(rowNumber, group.startColumn + 1))
        ),
        volume,
      });
    }
    parsedRows.push(parsed);
  }
  if (!totalRowFound) fail("a linha TOTAL não foi encontrada.");
  if (!parsedRows.length) fail("nenhuma loja foi encontrada.");

  const warnings: string[] = [];
  const days = groups
    .map(group => {
      const sourceTotal = dayTotals.get(group.date) ?? null;
      const computedTotal = sums.get(group.date) ?? 0;
      if (sourceTotal != null && sourceTotal !== computedTotal) {
        warnings.push(
          `Divergência no total de ${group.date}: fonte ${sourceTotal}, soma ${computedTotal}.`
        );
      }
      return {
        date: group.date,
        label: group.label,
        sourceTotal,
        computedTotal,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    fileSha256: sha256(buffer),
    fileName,
    title,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    generatedLabel,
    days,
    rows: parsedRows,
    warnings,
  };
}

export const dispatchXlsxLimits = {
  maxBase64Length: MAX_BASE64_LENGTH,
  maxArchiveBytes: MAX_ARCHIVE_BYTES,
  maxArchiveUncompressedBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
};

type DispatchMetadata = {
  days: (SourceDay & { pending?: boolean })[];
  [key: string]: unknown;
};

function parseReportMetadata(value: unknown): DispatchMetadata {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const object =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const days = Array.isArray(object.days)
    ? object.days
        .filter(
          day =>
            day &&
            typeof day === "object" &&
            typeof (day as { date?: unknown }).date === "string"
        )
        .map(day => {
          const source = day as Record<string, unknown>;
          return {
            date: String(source.date),
            label: String(source.label ?? source.date),
            sourceTotal:
              typeof source.sourceTotal === "number"
                ? source.sourceTotal
                : null,
            computedTotal:
              typeof source.computedTotal === "number"
                ? source.computedTotal
                : null,
            ...(source.pending === true ? { pending: true } : {}),
          };
        })
    : [];
  return { ...object, days };
}

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

function reportNotFound(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Controle de envios não encontrado",
  });
}

export type DispatchImportResult = {
  reportId: number;
  fileSha256: string;
  rowsUpdated: number;
  daysImported: number;
  addedDays: number;
  checksPreserved: true;
  skippedFutureDays: number;
  alreadyImported?: boolean;
  message: string;
};

/**
 * Applies a validated workbook as a source snapshot. The report row lock makes
 * reconciliation and day/cell upserts atomic; no statement in this transaction
 * updates v2_dispatch_checks or v2_dispatch_check_audit.
 */
export async function importDispatchWorkbook(
  reportId: number,
  fileName: string,
  base64: string,
  actor: V2Identity,
  now: Date = new Date()
): Promise<DispatchImportResult> {
  const parsed = await parseDispatchWorkbook(fileName, base64);
  const cutoffDate = getDashboardCutoffDate(now);
  let eligibleDays = parsed.days.filter(day => day.date <= cutoffDate);
  const skippedFutureDays = parsed.days.filter(
    day => day.date > cutoffDate
  ).length;
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const [reports] = await connection.execute<RowDataPacket[]>(
      "SELECT id,fileSha256,metadata FROM v2_dispatch_reports WHERE id=? LIMIT 1 FOR UPDATE",
      [reportId]
    );
    if (!reports[0]) reportNotFound();

    const [imports] = await connection.execute<RowDataPacket[]>(
      "SELECT id,reportId,metadata FROM v2_dispatch_imports WHERE fileSha256=? LIMIT 1 FOR UPDATE",
      [parsed.fileSha256]
    );
    let previousImportMetadata: Record<string, unknown> | null = null;
    if (imports[0]) {
      if (Number(imports[0].reportId) !== reportId)
        conflict("Este arquivo já foi importado em outro controle de envios.");
      previousImportMetadata =
        typeof imports[0].metadata === "string"
          ? JSON.parse(imports[0].metadata)
          : imports[0].metadata;
      const alreadyApplied = new Set(
        Array.isArray(previousImportMetadata?.days)
          ? (previousImportMetadata.days as string[])
          : []
      );
      eligibleDays = eligibleDays.filter(day => !alreadyApplied.has(day.date));
      if (!eligibleDays.length) {
        await connection.commit();
        return {
          reportId,
          fileSha256: parsed.fileSha256,
          rowsUpdated: 0,
          daysImported: 0,
          addedDays: 0,
          checksPreserved: true,
          skippedFutureDays,
          alreadyImported: true,
          message:
            "Este arquivo já foi importado para todos os dias elegíveis; nenhuma alteração foi feita.",
        };
      }
    }
    if (String(reports[0].fileSha256) === parsed.fileSha256) {
      await connection.commit();
      return {
        reportId,
        fileSha256: parsed.fileSha256,
        rowsUpdated: 0,
        daysImported: 0,
        addedDays: 0,
        checksPreserved: true,
        skippedFutureDays,
        alreadyImported: true,
        message:
          "Este arquivo corresponde à fotografia original; nenhuma alteração foi feita.",
      };
    }

    const metadata = parseReportMetadata(reports[0].metadata);
    const daysByDate = new Map(metadata.days.map(day => [day.date, day]));
    let addedDays = 0;
    for (const sourceDay of eligibleDays) {
      const existing = daysByDate.get(sourceDay.date);
      if (existing) {
        existing.label = sourceDay.label;
        existing.sourceTotal = sourceDay.sourceTotal;
        existing.computedTotal = sourceDay.computedTotal;
        delete (existing as { pending?: boolean }).pending;
      } else {
        const next = { ...sourceDay };
        daysByDate.set(sourceDay.date, next);
        addedDays++;
      }
    }
    metadata.days = [...daysByDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id,rowNumber,storeName FROM v2_dispatch_rows WHERE reportId=? ORDER BY rowNumber FOR UPDATE",
      [reportId]
    );
    const rowByStore = new Map<string, { id: number; rowNumber: number }>();
    const usedRowNumbers = new Set<number>();
    let maxRowNumber = 0;
    for (const row of existingRows) {
      const rowNumber = Number(row.rowNumber);
      rowByStore.set(String(row.storeName), { id: Number(row.id), rowNumber });
      usedRowNumbers.add(rowNumber);
      maxRowNumber = Math.max(maxRowNumber, rowNumber);
    }

    const rowIds = new Map<string, number>();
    for (const sourceRow of parsed.rows) {
      const known = rowByStore.get(sourceRow.storeName);
      if (known) {
        rowIds.set(sourceRow.storeName, known.id);
        await connection.execute(
          "UPDATE v2_dispatch_rows SET crmResponsible=?,syonetIntegration=?,bbroIntegration=? WHERE id=? AND reportId=?",
          [
            sourceRow.crmResponsible,
            sourceRow.syonetIntegration,
            sourceRow.bbroIntegration,
            known.id,
            reportId,
          ]
        );
        continue;
      }
      let rowNumber = sourceRow.rowNumber;
      if (usedRowNumbers.has(rowNumber)) rowNumber = maxRowNumber + 1;
      usedRowNumbers.add(rowNumber);
      maxRowNumber = Math.max(maxRowNumber, rowNumber);
      const [result] = await connection.execute(
        "INSERT INTO v2_dispatch_rows (reportId,rowNumber,storeName,crmResponsible,syonetIntegration,bbroIntegration) VALUES (?,?,?,?,?,?)",
        [
          reportId,
          rowNumber,
          sourceRow.storeName,
          sourceRow.crmResponsible,
          sourceRow.syonetIntegration,
          sourceRow.bbroIntegration,
        ]
      );
      const id = Number((result as { insertId?: number }).insertId);
      if (!Number.isSafeInteger(id) || id < 1)
        throw new Error("A inserção da loja não retornou um id válido.");
      rowIds.set(sourceRow.storeName, id);
      rowByStore.set(sourceRow.storeName, { id, rowNumber });
    }

    const allRows = [...rowByStore.values()];
    for (const row of allRows) {
      for (const day of metadata.days) {
        await connection.execute(
          "INSERT IGNORE INTO v2_dispatch_cells (rowId,dispatchDate,syonet,sourceManual,volume,sourcePending) VALUES (?,?,?,?,?,?)",
          [row.id, day.date, "", "", null, day.pending === true]
        );
      }
    }

    const eligibleDates = new Set(eligibleDays.map(day => day.date));
    for (const sourceRow of parsed.rows) {
      const rowId = rowIds.get(sourceRow.storeName);
      if (!rowId) continue;
      for (const sourceCell of sourceRow.cells) {
        if (!eligibleDates.has(sourceCell.date)) continue;
        await connection.execute(
          "INSERT INTO v2_dispatch_cells (rowId,dispatchDate,syonet,sourceManual,volume,sourcePending) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE syonet=VALUES(syonet),sourceManual=VALUES(sourceManual),volume=VALUES(volume),sourcePending=VALUES(sourcePending)",
          [
            rowId,
            sourceCell.date,
            sourceCell.syonet,
            sourceCell.sourceManual,
            sourceCell.volume,
            false,
          ]
        );
      }
    }

    await connection.execute(
      "UPDATE v2_dispatch_reports SET metadata=? WHERE id=?",
      [JSON.stringify({ ...metadata, days: metadata.days }), reportId]
    );
    const previouslyApplied = Array.isArray(previousImportMetadata?.days)
      ? (previousImportMetadata.days as string[])
      : [];
    const previousApplications = Array.isArray(
      previousImportMetadata?.applications
    )
      ? previousImportMetadata.applications
      : [];
    const importMetadata = JSON.stringify({
      rows: parsed.rows.length,
      days: [
        ...new Set([
          ...previouslyApplied,
          ...eligibleDays.map(day => day.date),
        ]),
      ].sort(),
      skippedFutureDays,
      warnings: parsed.warnings,
      applications: [
        ...previousApplications,
        {
          actorId: actor.id,
          at: now.toISOString(),
          days: eligibleDays.map(day => day.date),
        },
      ],
    });
    if (imports[0])
      await connection.execute(
        "UPDATE v2_dispatch_imports SET metadata=? WHERE id=?",
        [importMetadata, Number(imports[0].id)]
      );
    else
      await connection.execute(
        "INSERT INTO v2_dispatch_imports (fileSha256,reportId,fileName,importedBy,metadata) VALUES (?,?,?,?,?)",
        [parsed.fileSha256, reportId, parsed.fileName, actor.id, importMetadata]
      );
    await connection.commit();
    return {
      reportId,
      fileSha256: parsed.fileSha256,
      rowsUpdated: parsed.rows.length,
      daysImported: eligibleDays.length,
      addedDays,
      checksPreserved: true,
      skippedFutureDays,
      message:
        skippedFutureDays > 0
          ? `Arquivo importado até D-1; ${skippedFutureDays} dia(s) futuro(s) foram preservados fora da atualização.`
          : "Arquivo importado até D-1; checks anteriores foram preservados.",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
