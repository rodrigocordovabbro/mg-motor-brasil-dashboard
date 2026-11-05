import { createHash } from "node:crypto";

import { z } from "zod";
import { MTD_RETAIL_ORDER_LABEL } from "@shared/dashboardLabels";

import { invokeLLM, listLLMModels } from "./_core/llm";
import {
  buildWeeklySalesPreview,
  createWeeklySalesRow,
  type WeeklySalesCsvPreview,
  type WeeklySalesRow,
  type WeeklySalesWeekMetrics,
} from "./weeklySalesCsv";

const RETAIL_TABLE_TITLE = "Weekly Target Achievement - Retail";
const PDF_MODEL_PREFERENCES = [
  "gemini-3-flash-preview",
  "gpt-5-mini",
  "claude-haiku-4-5",
] as const;
const PDF_SIGNATURE = "%PDF-";
const MAX_PDF_ROWS = 200;
const WEEK_KEYS = ["1", "2", "3", "4", "5"] as const;

type WeekKey = (typeof WEEK_KEYS)[number];

const pdfMetricSchema = z
  .object({
    target: z.number().finite().nonnegative().nullable(),
    retail: z.number().int().nonnegative().nullable(),
    achievementPercent: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const pdfRowSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    weeks: z
      .object({
        "1": pdfMetricSchema,
        "2": pdfMetricSchema,
        "3": pdfMetricSchema,
        "4": pdfMetricSchema,
        "5": pdfMetricSchema,
      })
      .strict(),
  })
  .strict();

const pdfExtractionSchema = z
  .object({
    tableTitle: z.string().trim().min(1).max(120),
    rows: z.array(pdfRowSchema).min(3).max(MAX_PDF_ROWS),
  })
  .strict();

export type WeeklySalesPdfExtraction = z.infer<typeof pdfExtractionSchema>;

const metricJsonSchema = {
  type: "object",
  properties: {
    target: { type: ["number", "null"] },
    retail: { type: ["integer", "null"] },
    achievementPercent: { type: ["number", "null"] },
  },
  required: ["target", "retail", "achievementPercent"],
  additionalProperties: false,
} as const;

const pdfExtractionJsonSchema = {
  type: "object",
  properties: {
    tableTitle: { type: "string" },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          weeks: {
            type: "object",
            properties: {
              "1": metricJsonSchema,
              "2": metricJsonSchema,
              "3": metricJsonSchema,
              "4": metricJsonSchema,
              "5": metricJsonSchema,
            },
            required: ["1", "2", "3", "4", "5"],
            additionalProperties: false,
          },
        },
        required: ["name", "weeks"],
        additionalProperties: false,
      },
    },
  },
  required: ["tableTitle", "rows"],
  additionalProperties: false,
} as const;

function assertPdfBuffer(buffer: Buffer): void {
  if (buffer.length === 0) throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} está vazio.`);
  const signature = buffer.subarray(0, PDF_SIGNATURE.length).toString("ascii");
  if (signature !== PDF_SIGNATURE) {
    throw new Error("O arquivo selecionado não possui uma assinatura PDF válida.");
  }
}

async function resolvePdfModels(): Promise<string[]> {
  const catalog = await listLLMModels();
  const available = new Set(catalog.data.map(model => model.id));
  const selected = PDF_MODEL_PREFERENCES.filter(model => available.has(model));
  if (!selected.length) {
    throw new Error("Nenhum modelo multimodal compatível está disponível.");
  }
  return selected;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function toAuditTokens(weeks: Record<WeekKey, WeeklySalesWeekMetrics>): string[] {
  return WEEK_KEYS.flatMap(week => {
    const metric = weeks[week];
    return [metric.target, metric.retail, metric.achievementPercent].map(value =>
      value === null ? "" : String(value),
    );
  });
}

function sumRetail(rows: WeeklySalesRow[], week: WeekKey): number {
  return rows.reduce((total, row) => total + (row.weeks[week]?.retail ?? 0), 0);
}

function repairUniqueRegionRetailResiduals(rows: WeeklySalesRow[]): {
  rows: WeeklySalesRow[];
  warnings: string[];
} {
  const repairedRows = rows.map(row => ({
    ...row,
    weeks: Object.fromEntries(
      WEEK_KEYS.map(week => [week, { ...row.weeks[week] }]),
    ) as Record<WeekKey, WeeklySalesWeekMetrics>,
  }));
  const warnings: string[] = [];
  const modifiedIndexes = new Set<number>();
  const regionIndexes = repairedRows
    .map((row, index) => (row.rowType === "REGION" ? index : -1))
    .filter(index => index >= 0);
  const totalRows = repairedRows.filter(row => row.rowType === "TOTAL");
  if (regionIndexes.length === 0 || totalRows.length !== 1) {
    return { rows: repairedRows, warnings };
  }

  const segments = regionIndexes.map((regionIndex, segmentIndex) => {
    const nextRegionIndex = regionIndexes[segmentIndex + 1] ?? repairedRows.length;
    return {
      regionIndex,
      dealerIndexes: repairedRows
        .map((row, index) =>
          index > regionIndex && index < nextRegionIndex && row.rowType === "DEALER"
            ? index
            : -1,
        )
        .filter(index => index >= 0),
    };
  });
  const totalRow = totalRows[0];

  for (const week of WEEK_KEYS) {
    const reportedTotal = totalRow.weeks[week]?.retail ?? null;
    const regionRetails = regionIndexes.map(
      index => repairedRows[index]?.weeks[week]?.retail ?? null,
    );
    if (reportedTotal === null || regionRetails.some(value => value === null)) continue;
    const regionSum = regionRetails.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (regionSum !== reportedTotal) continue;

    for (const segment of segments) {
      const regionRow = repairedRows[segment.regionIndex];
      const regionRetail = regionRow?.weeks[week]?.retail ?? null;
      if (regionRetail === null) continue;

      const missingDealerIndexes = segment.dealerIndexes.filter(index => {
        const metrics = repairedRows[index]?.weeks[week];
        return metrics?.retail === null && metrics.achievementPercent === null;
      });
      if (missingDealerIndexes.length !== 1) continue;

      const knownDealerRetail = segment.dealerIndexes.reduce((sum, index) => {
        const value = repairedRows[index]?.weeks[week]?.retail;
        return sum + (value ?? 0);
      }, 0);
      const residual = regionRetail - knownDealerRetail;
      if (residual <= 0 || !Number.isInteger(residual)) continue;

      const dealerIndex = missingDealerIndexes[0];
      const dealerRow = repairedRows[dealerIndex];
      const metrics = dealerRow?.weeks[week];
      if (!dealerRow || !metrics || metrics.target === null || metrics.target <= 0) continue;

      const achievementPercent = Number(((residual / metrics.target) * 100).toFixed(1));
      dealerRow.weeks[week] = {
        ...metrics,
        retail: residual,
        achievementPercent,
      };
      modifiedIndexes.add(dealerIndex);
      warnings.push(
        `${dealerRow.sourceName}: Semana ${week} reconciliada em ${residual} ${MTD_RETAIL_ORDER_LABEL} pelo residual único de ${regionRow.sourceName}; percentual derivado em ${achievementPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%.`,
      );
    }
  }

  return {
    rows: repairedRows.map((row, index) =>
      modifiedIndexes.has(index)
        ? createWeeklySalesRow({
            sourceRowNumber: row.sourceRowNumber,
            sourceName: row.sourceName,
            weeks: row.weeks,
            tokens: row.tokens,
          })
        : row,
    ),
    warnings,
  };
}

function validatePdfRows(rows: WeeklySalesRow[]): string[] {
  const errors: string[] = [];
  const dealerRows = rows.filter(row => row.rowType === "DEALER");
  const regionRows = rows.filter(row => row.rowType === "REGION");
  const totalRows = rows.filter(row => row.rowType === "TOTAL");

  if (regionRows.length === 0) {
    errors.push("A tabela Retail não contém linhas de região reconhecíveis (R01, R02...).");
  }
  if (dealerRows.length === 0) {
    errors.push("A tabela Retail não contém concessionárias reconhecíveis.");
  }
  if (totalRows.length === 1 && rows.at(-1)?.rowType !== "TOTAL") {
    errors.push("A linha TOTAL precisa encerrar a tabela Retail.");
  }

  const duplicateDealerNames = new Set<string>();
  const seenDealerKeys = new Set<string>();
  for (const row of dealerRows) {
    if (seenDealerKeys.has(row.sourceKey)) duplicateDealerNames.add(row.sourceName);
    seenDealerKeys.add(row.sourceKey);
  }
  if (duplicateDealerNames.size > 0) {
    errors.push(
      `Concessionárias repetidas na tabela Retail: ${Array.from(duplicateDealerNames).join(", ")}.`,
    );
  }

  for (const row of rows) {
    for (const week of WEEK_KEYS) {
      const metrics = row.weeks[week];
      if (!metrics) {
        errors.push(`Linha ${row.sourceRowNumber} (${row.sourceName}): Semana ${week} ausente.`);
        continue;
      }
      if (metrics.target === null) {
        errors.push(
          `Linha ${row.sourceRowNumber} (${row.sourceName}): meta da Semana ${week} ausente.`,
        );
      }
      const retailIsNull = metrics.retail === null;
      const percentageIsNull = metrics.achievementPercent === null;
      if (retailIsNull !== percentageIsNull) {
        errors.push(
          `Linha ${row.sourceRowNumber} (${row.sourceName}): ${MTD_RETAIL_ORDER_LABEL} e percentual da Semana ${week} precisam estar ambos preenchidos ou ambos vazios.`,
        );
      }

      if (
        metrics.target !== null &&
        metrics.target > 0 &&
        metrics.retail !== null &&
        metrics.achievementPercent !== null
      ) {
        // A meta visível é arredondada (W4 sem casas; demais semanas com uma casa),
        // enquanto o percentual usa a meta interna antes do arredondamento. Validamos se o
        // percentual cabe no intervalo matemático permitido pela precisão exibida.
        const targetHalfUnit = Number.isInteger(metrics.target) ? 0.5 : 0.05;
        const lowerTarget = Math.max(metrics.target - targetHalfUnit, Number.EPSILON);
        const upperTarget = metrics.target + targetHalfUnit;
        const minimumPercentage = (metrics.retail / upperTarget) * 100;
        const maximumPercentage = (metrics.retail / lowerTarget) * 100;
        const displayTolerance = 0.15;
        if (
          metrics.achievementPercent < minimumPercentage - displayTolerance ||
          metrics.achievementPercent > maximumPercentage + displayTolerance
        ) {
          errors.push(
            `Linha ${row.sourceRowNumber} (${row.sourceName}): percentual da Semana ${week} incompatível com meta e ${MTD_RETAIL_ORDER_LABEL}.`,
          );
        }
      }
    }
  }

  const totalRow = totalRows[0];
  for (const week of WEEK_KEYS) {
    const dealerRetail = sumRetail(dealerRows, week);
    const regionRetail = sumRetail(regionRows, week);
    const reportedRetail = totalRow?.weeks[week]?.retail ?? null;
    const hasReportedData =
      dealerRows.some(row => row.weeks[week]?.retail !== null) ||
      regionRows.some(row => row.weeks[week]?.retail !== null) ||
      reportedRetail !== null;

    if (!hasReportedData) continue;
    if (reportedRetail === null) {
      errors.push(`A linha TOTAL não informa ${MTD_RETAIL_ORDER_LABEL} para a Semana ${week}.`);
      continue;
    }
    if (dealerRetail !== regionRetail || dealerRetail !== reportedRetail) {
      errors.push(
        `O total de ${MTD_RETAIL_ORDER_LABEL} da Semana ${week} não reconcilia entre concessionárias, regiões e TOTAL.`,
      );
    }
  }

  return errors;
}

export function buildWeeklySalesPreviewFromPdfExtraction(
  buffer: Buffer,
  rawExtraction: unknown,
): WeeklySalesCsvPreview {
  assertPdfBuffer(buffer);
  const extraction = pdfExtractionSchema.parse(rawExtraction);
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const errors: string[] = [];

  if (normalizeTitle(extraction.tableTitle) !== normalizeTitle(RETAIL_TABLE_TITLE)) {
    errors.push(
      `Tabela incorreta: esperada “${RETAIL_TABLE_TITLE}”; encontrada “${extraction.tableTitle}”.`,
    );
  }

  const extractedRows = extraction.rows.map((row, index) =>
    createWeeklySalesRow({
      sourceRowNumber: index + 2,
      sourceName: row.name,
      weeks: row.weeks,
      tokens: toAuditTokens(row.weeks),
    }),
  );
  const repaired = repairUniqueRegionRetailResiduals(extractedRows);
  const rows = repaired.rows;
  errors.push(...validatePdfRows(rows));

  return buildWeeklySalesPreview({
    fileHash,
    rows,
    rowsTotal: extraction.rows.length,
    errors,
    warnings: repaired.warnings,
  });
}

async function extractWeeklySalesRetailTable(buffer: Buffer): Promise<WeeklySalesPdfExtraction> {
  const models = await resolvePdfModels();
  const pdfDataUrl = `data:application/pdf;base64,${buffer.toString("base64")}`;
  const failures: string[] = [];

  for (const model of models) {
    try {
      const response = await invokeLLM({
        model,
        max_tokens: 16_384,
        messages: [
          {
            role: "system",
            content:
              "You are a precise document extraction engine. Read only the page titled exactly 'Weekly Target Achievement - Retail'. Never read or merge the similar 'Weekly Target Achievement - Registration' table. Transcribe every visible value; do not calculate, infer, repair, or fill cells. Preserve blank cells as null. Return every visible data row in top-to-bottom order, including region rows such as R01/R02 and the final Total row.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Extract the complete 'Weekly Target Achievement - Retail' table. For every row return its visible label and W1 through W5 TGT, Retail and percentage values. Decimal commas are decimal separators. Percentages must be numeric percentage points (for example, 120,4% becomes 120.4). Blank cells must be null, not zero. Use only values printed in the Retail table and keep all accents in dealer names.",
              },
              {
                type: "file_url",
                file_url: { url: pdfDataUrl, mime_type: "application/pdf" },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "weekly_target_achievement_retail",
            strict: true,
            schema: pdfExtractionJsonSchema,
          },
        },
      });

      const content = response.choices?.[0]?.message.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("A leitura do PDF não retornou dados estruturados.");
      }
      return pdfExtractionSchema.parse(JSON.parse(content));
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha não identificada";
      failures.push(`${model}: ${message}`);
      console.error(`Weekly sales PDF structured output rejected for ${model}`, error);
    }
  }

  console.error("Weekly sales PDF exhausted multimodal fallbacks", failures);
  throw new Error("Não foi possível validar a tabela Retail extraída do PDF.");
}

export async function parseWeeklySalesPdf(buffer: Buffer): Promise<WeeklySalesCsvPreview> {
  assertPdfBuffer(buffer);
  try {
    const extraction = await extractWeeklySalesRetailTable(buffer);
    return buildWeeklySalesPreviewFromPdfExtraction(buffer, extraction);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Não foi possível")) throw error;
    console.error("Weekly sales PDF extraction failed", error);
    throw new Error(
      "Não foi possível ler a tabela “Weekly Target Achievement - Retail” deste PDF. Confirme o formato do relatório e tente novamente.",
    );
  }
}
