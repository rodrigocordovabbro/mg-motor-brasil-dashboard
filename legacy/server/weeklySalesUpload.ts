import { MTD_RETAIL_ORDER_LABEL } from "@shared/dashboardLabels";

const MAX_WEEKLY_SALES_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
]);
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const GENERIC_MIME_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/vnd.ms-excel",
]);

export type WeeklySalesFileDescriptor = {
  fileName: string;
  kind: "CSV" | "PDF" | "XLSX";
  contentType: string;
};

export type DecodedWeeklySalesUpload = {
  bytes: Buffer;
  declaredMimeType: string | null;
};

function normalizeMimeType(value: string | null | undefined): string | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US") ?? "";
  return normalized || null;
}

function sanitizeFileName(fileName: string): string {
  const basename = fileName.replace(/\\/g, "/").split("/").at(-1)?.trim() ?? "";
  return basename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 180);
}

function isValidUtcDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function inferWeeklySalesReportDate(fileName: string): string | null {
  const sanitized = sanitizeFileName(fileName);
  const match = sanitized.match(
    /(?:^|[^0-9])(?:(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])|(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01]))(?=[^0-9]|$)/,
  );
  if (!match) return null;

  const year = match[1] ? Number(match[1]) : 2000 + Number(match[4]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[3] ?? match[6]);
  if (!isValidUtcDate(year, month, day)) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function resolveWeeklySalesCompetence(fileName: string, fallbackCompetence: string): string {
  return inferWeeklySalesReportDate(fileName)?.slice(0, 7) ?? fallbackCompetence;
}

export type WeeklySalesCompetencePolicy = "AUTO" | "EXPLICIT";

export function resolveWeeklySalesCompetenceWithPolicy(
  fileName: string,
  fallbackCompetence: string,
  policy: WeeklySalesCompetencePolicy = "AUTO",
): string {
  return policy === "EXPLICIT"
    ? fallbackCompetence
    : resolveWeeklySalesCompetence(fileName, fallbackCompetence);
}

function hasPdfSignature(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function hasZipSignature(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  const signature = bytes.subarray(0, 4).toString("hex");
  return signature === "504b0304" || signature === "504b0506" || signature === "504b0708";
}

function assertLikelyCsv(bytes: Buffer): void {
  if (bytes.includes(0)) {
    throw new Error("O conteúdo do arquivo não corresponde a um CSV de texto válido.");
  }
}

export function decodeWeeklySalesBase64(value: string): DecodedWeeklySalesUpload {
  const trimmed = value.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,/i);
  const declaredMimeType = normalizeMimeType(dataUrlMatch?.[1]);
  let base64 = dataUrlMatch ? trimmed.slice(dataUrlMatch[0].length) : trimmed;

  if (!dataUrlMatch && /^data:/i.test(trimmed)) {
    throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} não está em um Data URL Base64 válido.`);
  }

  base64 = base64.replace(/\s+/g, "");
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error(`O conteúdo do arquivo de ${MTD_RETAIL_ORDER_LABEL} está corrompido.`);
  }

  const bytes = Buffer.from(base64, "base64");
  const canonicalInput = base64.replace(/=+$/, "");
  const canonicalDecoded = bytes.toString("base64").replace(/=+$/, "");
  if (canonicalInput !== canonicalDecoded) {
    throw new Error(`O conteúdo do arquivo de ${MTD_RETAIL_ORDER_LABEL} está corrompido.`);
  }
  if (bytes.length === 0) {
    throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} está vazio.`);
  }
  if (bytes.length > MAX_WEEKLY_SALES_FILE_SIZE_BYTES) {
    throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} excede o limite de 5 MB.`);
  }

  return { bytes, declaredMimeType };
}

export function describeWeeklySalesFile(input: {
  fileName: string;
  bytes: Buffer;
  declaredMimeType?: string | null;
}): WeeklySalesFileDescriptor {
  const fileName = sanitizeFileName(input.fileName);
  const lowerName = fileName.toLocaleLowerCase("en-US");
  const extensionKind = lowerName.endsWith(".pdf")
    ? "PDF"
    : lowerName.endsWith(".xlsx")
      ? "XLSX"
    : lowerName.endsWith(".csv")
      ? "CSV"
      : null;
  const declaredMimeType = normalizeMimeType(input.declaredMimeType);
  const mimeKind = declaredMimeType && PDF_MIME_TYPES.has(declaredMimeType)
    ? "PDF"
    : declaredMimeType && XLSX_MIME_TYPES.has(declaredMimeType)
      ? "XLSX"
    : declaredMimeType && CSV_MIME_TYPES.has(declaredMimeType)
      ? "CSV"
      : null;
  const signatureKind = hasPdfSignature(input.bytes)
    ? "PDF"
    : hasZipSignature(input.bytes)
      ? "XLSX"
      : "CSV";

  if (!extensionKind) {
    throw new Error(`Selecione um arquivo de ${MTD_RETAIL_ORDER_LABEL} no formato XLSX, CSV ou PDF.`);
  }
  if (declaredMimeType && !mimeKind && !GENERIC_MIME_TYPES.has(declaredMimeType)) {
    throw new Error(`O tipo de arquivo ${declaredMimeType} não é aceito. Envie um XLSX, CSV ou PDF.`);
  }
  if (extensionKind !== signatureKind || (mimeKind && mimeKind !== signatureKind)) {
    throw new Error(
      "A extensão, o tipo e o conteúdo do arquivo não correspondem. Selecione o XLSX, CSV ou PDF original.",
    );
  }

  if (signatureKind === "PDF") {
    return {
      fileName: fileName || "weekly-sales.pdf",
      kind: "PDF",
      contentType: "application/pdf",
    };
  }

  if (signatureKind === "XLSX") {
    return {
      fileName: fileName || "daily-sales-fup.xlsx",
      kind: "XLSX",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  assertLikelyCsv(input.bytes);
  return {
    fileName: fileName || "weekly-sales.csv",
    kind: "CSV",
    contentType: "text/csv; charset=utf-8",
  };
}
