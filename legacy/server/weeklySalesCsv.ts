import { createHash } from "node:crypto";

import weeklySalesAliasesSource from "./data/weekly-sales-dealer-aliases.json";
import { MTD_RETAIL_ORDER_LABEL } from "@shared/dashboardLabels";
import {
  canonicalizeDealerName,
  isExplicitDealerAlias,
  normalizeDealerLookupKey,
} from "./dealerNormalization";

export type WeeklySalesWeek = 1 | 2 | 3 | 4 | 5;

export type WeeklySalesWeekMetrics = {
  target: number | null;
  retail: number | null;
  achievementPercent: number | null;
};

export type WeeklySalesRow = {
  sourceRowNumber: number;
  rowType: "DEALER" | "REGION" | "TOTAL";
  sourceName: string;
  sourceKey: string;
  canonicalDealer: string | null;
  canonicalDealerKey: string | null;
  explicitMapping: boolean;
  recordHash: string;
  tokens: string[];
  weeks: Record<string, WeeklySalesWeekMetrics>;
};

export type WeeklySalesCsvPreview = {
  fileHash: string;
  rows: WeeklySalesRow[];
  errors: string[];
  warnings: string[];
  summary: {
    rowsTotal: number;
    dealerRows: number;
    regionRows: number;
    totalRows: number;
    referenceWeek: WeeklySalesWeek | null;
    dealersWithoutReferenceSales: number;
    referenceDealerSalesTotal: number;
    referenceRegionSalesTotal: number;
    referenceReportedSalesTotal: number | null;
    dealersWithoutWeek4Sales: number;
    week4DealerSalesTotal: number;
    week4RegionSalesTotal: number;
    week4ReportedSalesTotal: number | null;
    reconciliationPassed: boolean;
  };
};

type AliasRow = {
  source: string;
  sourceKey: string;
  canonical: string;
};

type ParsedCandidate = {
  weeks: Record<string, WeeklySalesWeekMetrics>;
  score: number;
};

const weeklySalesAliasMap = new Map(
  (weeklySalesAliasesSource.mappings as AliasRow[]).map(mapping => [
    mapping.sourceKey,
    mapping.canonical,
  ]),
);

const EXPECTED_HEADER = [
  "REGION",
  "W1 TGT",
  "W1 RETAIL",
  "%W1",
  "W2 TGT",
  "W2 RETAIL",
  "%W2",
  "W3 TGT",
  "W3 RETAIL",
  "%W3",
  "W4 TGT",
  "W4 RETAIL",
  "%W4",
  "W5 TGT",
  "W5 RETAIL",
  "%W5",
];

function decodeCsv(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  const decoded = utf8.includes("\uFFFD")
    ? new TextDecoder("windows-1252").decode(buffer)
    : utf8;
  return decoded.replace(/^\uFEFF/, "");
}

function splitLooseCsvLine(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      tokens.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  tokens.push(current.trim());
  return tokens;
}

function parseIntegerToken(token: string): number | null | undefined {
  const value = token.trim();
  if (!value) return null;
  if (!/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseDecimalTokens(tokens: string[]): number | null | undefined {
  if (tokens.length === 1) {
    const value = tokens[0].trim();
    if (!value) return null;
    if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) return undefined;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (tokens.length === 2) {
    const whole = tokens[0].trim();
    const fraction = tokens[1].trim();
    if (!/^-?\d+$/.test(whole) || !/^\d{1,2}$/.test(fraction)) return undefined;
    const parsed = Number(`${whole}.${fraction}`);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseAchievementTokens(tokens: string[]): number | null | undefined {
  if (tokens.length === 1) {
    const value = tokens[0].trim();
    if (!value) return null;
    if (!/^-?\d+(?:[.,]\d+)?%$/.test(value)) return undefined;
    const parsed = Number(value.slice(0, -1).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (tokens.length === 2) {
    const whole = tokens[0].trim();
    const fractionWithPercent = tokens[1].trim();
    if (!/^-?\d+$/.test(whole) || !/^\d{1,2}%$/.test(fractionWithPercent)) {
      return undefined;
    }
    const parsed = Number(`${whole}.${fractionWithPercent.slice(0, -1)}`);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function scoreWeek(metrics: WeeklySalesWeekMetrics): number {
  const { target, retail, achievementPercent } = metrics;
  if (target === null && retail === null && achievementPercent === null) return 25;
  if (retail === null || achievementPercent === null) {
    return retail === achievementPercent ? 0 : 100;
  }
  if (target === null || target < 0 || retail < 0 || achievementPercent < 0) return 1000;
  if (target === 0) return retail === 0 && achievementPercent === 0 ? 0 : 500;
  const expected = (retail / target) * 100;
  return Math.abs(expected - achievementPercent);
}

function parseWeekCandidates(tokens: string[], offset: number): Array<{
  nextOffset: number;
  metrics: WeeklySalesWeekMetrics;
  score: number;
}> {
  const candidates: Array<{
    nextOffset: number;
    metrics: WeeklySalesWeekMetrics;
    score: number;
  }> = [];

  for (const targetLength of [1, 2]) {
    for (const achievementLength of [1, 2]) {
      const groupLength = targetLength + 1 + achievementLength;
      if (offset + groupLength > tokens.length) continue;

      const target = parseDecimalTokens(tokens.slice(offset, offset + targetLength));
      const retail = parseIntegerToken(tokens[offset + targetLength] ?? "");
      const achievementPercent = parseAchievementTokens(
        tokens.slice(offset + targetLength + 1, offset + groupLength),
      );
      if (target === undefined || retail === undefined || achievementPercent === undefined) continue;

      const metrics = { target, retail, achievementPercent };
      const score = scoreWeek(metrics);
      if (score >= 1000) continue;
      candidates.push({ nextOffset: offset + groupLength, metrics, score });
    }
  }

  return candidates;
}

function parseWeekGroups(tokens: string[]): ParsedCandidate | null {
  if (tokens.length === 15) {
    const weeks: Record<string, WeeklySalesWeekMetrics> = {};
    for (let week = 1; week <= 5; week += 1) {
      const offset = (week - 1) * 3;
      const target = parseDecimalTokens([tokens[offset] ?? ""]);
      const retail = parseIntegerToken(tokens[offset + 1] ?? "");
      const achievementPercent = parseAchievementTokens([tokens[offset + 2] ?? ""]);
      if (target === undefined || retail === undefined || achievementPercent === undefined) {
        return null;
      }
      weeks[String(week)] = { target, retail, achievementPercent };
    }
    return { weeks, score: 0 };
  }

  const candidates: ParsedCandidate[] = [];

  function walk(
    week: WeeklySalesWeek,
    offset: number,
    weeks: Record<string, WeeklySalesWeekMetrics>,
    score: number,
  ): void {
    if (week === 5) {
      for (const candidate of parseWeekCandidates(tokens, offset)) {
        if (candidate.nextOffset !== tokens.length) continue;
        candidates.push({
          weeks: { ...weeks, "5": candidate.metrics },
          score: score + candidate.score,
        });
      }
      return;
    }

    for (const candidate of parseWeekCandidates(tokens, offset)) {
      walk(
        (week + 1) as WeeklySalesWeek,
        candidate.nextOffset,
        { ...weeks, [String(week)]: candidate.metrics },
        score + candidate.score,
      );
    }
  }

  walk(1, 0, {}, 0);
  candidates.sort((left, right) => left.score - right.score);
  const best = candidates[0];
  if (!best || best.score > 2) return null;
  const second = candidates[1];
  if (second && Math.abs(second.score - best.score) < 0.0001) return null;
  return best;
}

export function classifyWeeklySalesRow(name: string): WeeklySalesRow["rowType"] {
  if (name.trim().toUpperCase() === "TOTAL") return "TOTAL";
  if (/^R\d+$/i.test(name.trim())) return "REGION";
  return "DEALER";
}

export function resolveWeeklySalesCanonicalDealer(sourceName: string): {
  canonicalDealer: string;
  explicitMapping: boolean;
} {
  const sourceKey = normalizeDealerLookupKey(sourceName);
  const weeklyAlias = weeklySalesAliasMap.get(sourceKey);
  if (weeklyAlias) {
    return {
      canonicalDealer: canonicalizeDealerName(weeklyAlias),
      explicitMapping: true,
    };
  }

  return {
    canonicalDealer: canonicalizeDealerName(sourceName),
    explicitMapping: isExplicitDealerAlias(sourceName),
  };
}

export function createWeeklySalesRow(input: {
  sourceRowNumber: number;
  sourceName: string;
  weeks: Record<string, WeeklySalesWeekMetrics>;
  tokens?: string[];
}): WeeklySalesRow {
  const sourceName = input.sourceName.trim();
  const rowType = classifyWeeklySalesRow(sourceName);
  const sourceKey = normalizeDealerLookupKey(sourceName);
  const resolved =
    rowType === "DEALER"
      ? resolveWeeklySalesCanonicalDealer(sourceName)
      : { canonicalDealer: null, explicitMapping: false };
  const recordHash = createHash("sha256")
    .update(JSON.stringify({
      sourceRowNumber: input.sourceRowNumber,
      sourceName,
      weeks: input.weeks,
    }))
    .digest("hex");

  return {
    sourceRowNumber: input.sourceRowNumber,
    rowType,
    sourceName,
    sourceKey,
    canonicalDealer: resolved.canonicalDealer,
    canonicalDealerKey: resolved.canonicalDealer
      ? normalizeDealerLookupKey(resolved.canonicalDealer)
      : null,
    explicitMapping: resolved.explicitMapping,
    recordHash,
    tokens: input.tokens ?? [],
    weeks: input.weeks,
  };
}

const WEEK_NUMBERS: WeeklySalesWeek[] = [1, 2, 3, 4, 5];

function sumWeekRetail(rows: WeeklySalesRow[], week: WeeklySalesWeek): number {
  return rows.reduce((total, row) => total + (row.weeks[String(week)]?.retail ?? 0), 0);
}

export function resolveWeeklySalesReferenceWeek(
  rows: WeeklySalesRow[],
): WeeklySalesWeek | null {
  const totalRows = rows.filter(row => row.rowType === "TOTAL");
  if (totalRows.length !== 1) return null;
  const total = totalRows[0];
  for (const week of [...WEEK_NUMBERS].reverse()) {
    if (total.weeks[String(week)]?.retail !== null) return week;
  }
  return null;
}

export function buildWeeklySalesPreview(input: {
  fileHash: string;
  rows: WeeklySalesRow[];
  rowsTotal: number;
  errors?: string[];
  warnings?: string[];
}): WeeklySalesCsvPreview {
  const errors = [...(input.errors ?? [])];
  const dealerRows = input.rows.filter(row => row.rowType === "DEALER");
  const regionRows = input.rows.filter(row => row.rowType === "REGION");
  const totalRows = input.rows.filter(row => row.rowType === "TOTAL");
  const referenceWeek = resolveWeeklySalesReferenceWeek(input.rows);
  const referenceDealerSalesTotal = referenceWeek === null ? 0 : sumWeekRetail(dealerRows, referenceWeek);
  const referenceRegionSalesTotal = referenceWeek === null ? 0 : sumWeekRetail(regionRows, referenceWeek);
  const referenceReportedSalesTotal =
    referenceWeek === null ? null : totalRows[0]?.weeks[String(referenceWeek)]?.retail ?? null;
  const week4DealerSalesTotal = sumWeekRetail(dealerRows, 4);
  const week4RegionSalesTotal = sumWeekRetail(regionRows, 4);
  const week4ReportedSalesTotal = totalRows[0]?.weeks["4"]?.retail ?? null;
  const reconciliationPassed =
    totalRows.length === 1 &&
    referenceWeek !== null &&
    referenceReportedSalesTotal !== null &&
    referenceDealerSalesTotal === referenceRegionSalesTotal &&
    referenceDealerSalesTotal === referenceReportedSalesTotal;

  if (totalRows.length !== 1) {
    errors.push(`Esperada exatamente 1 linha TOTAL; encontradas ${totalRows.length}.`);
  } else if (referenceWeek === null) {
    errors.push(`A linha TOTAL não possui ${MTD_RETAIL_ORDER_LABEL} preenchido em nenhuma semana.`);
  } else if (!reconciliationPassed) {
    errors.push(
      `O total de ${MTD_RETAIL_ORDER_LABEL} da Semana ${referenceWeek} não reconcilia entre concessionárias, regiões e TOTAL.`,
    );
  }

  if (totalRows.length === 1) {
    const partialWeeks = WEEK_NUMBERS.filter(week => {
      const reportedRetail = totalRows[0]?.weeks[String(week)]?.retail ?? null;
      if (reportedRetail !== null) return false;
      return [...dealerRows, ...regionRows].some(
        row => row.weeks[String(week)]?.retail !== null,
      );
    });
    for (const week of partialWeeks) {
      errors.push(
        `A Semana ${week} possui ${MTD_RETAIL_ORDER_LABEL} em concessionárias ou regiões, mas o campo ${MTD_RETAIL_ORDER_LABEL} do TOTAL está vazio.`,
      );
    }
  }

  const referenceWarnings =
    referenceWeek === null
      ? []
      : dealerRows
          .filter(row => row.weeks[String(referenceWeek)]?.retail === null)
          .map(row => `${row.sourceName}: Semana ${referenceWeek} sem ${MTD_RETAIL_ORDER_LABEL} informado.`);
  const dealersWithoutWeek4Sales = dealerRows.filter(
    row => row.weeks["4"]?.retail === null,
  ).length;
  const warnings = Array.from(new Set([...(input.warnings ?? []), ...referenceWarnings]));

  return {
    fileHash: input.fileHash,
    rows: input.rows,
    errors,
    warnings,
    summary: {
      rowsTotal: input.rowsTotal,
      dealerRows: dealerRows.length,
      regionRows: regionRows.length,
      totalRows: totalRows.length,
      referenceWeek,
      dealersWithoutReferenceSales: referenceWarnings.length,
      referenceDealerSalesTotal,
      referenceRegionSalesTotal,
      referenceReportedSalesTotal,
      dealersWithoutWeek4Sales,
      week4DealerSalesTotal,
      week4RegionSalesTotal,
      week4ReportedSalesTotal,
      reconciliationPassed,
    },
  };
}

export function parseWeeklySalesCsv(buffer: Buffer): WeeklySalesCsvPreview {
  if (buffer.length === 0) throw new Error(`O arquivo de ${MTD_RETAIL_ORDER_LABEL} está vazio.`);

  const content = decodeCsv(buffer).replace(/\r\n?/g, "\n").trimEnd();
  const lines = content.split("\n").filter(line => line.trim().length > 0);
  if (lines.length < 2) throw new Error(`O arquivo precisa conter cabeçalho e dados de ${MTD_RETAIL_ORDER_LABEL}.`);

  const header = splitLooseCsvLine(lines[0]).map(value => value.toUpperCase());
  if (
    header.length !== EXPECTED_HEADER.length ||
    header.some((value, index) => value !== EXPECTED_HEADER[index])
  ) {
    throw new Error("Cabeçalho incompatível com a base Weekly Target Achievement esperada.");
  }

  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const rows: WeeklySalesRow[] = [];
  const errors: string[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const sourceRowNumber = lineIndex + 1;
    const columns = splitLooseCsvLine(lines[lineIndex]);
    const sourceName = columns[0]?.trim() ?? "";
    const tokens = columns.slice(1);
    if (!sourceName) {
      errors.push(`Linha ${sourceRowNumber}: nome da concessionária/região ausente.`);
      continue;
    }

    const parsedGroups = parseWeekGroups(tokens);
    if (!parsedGroups) {
      errors.push(`Linha ${sourceRowNumber} (${sourceName}): colunas semanais ambíguas ou inválidas.`);
      continue;
    }

    rows.push(
      createWeeklySalesRow({
        sourceRowNumber,
        sourceName,
        tokens,
        weeks: parsedGroups.weeks,
      }),
    );
  }

  return buildWeeklySalesPreview({
    fileHash,
    rows,
    errors,
    rowsTotal: lines.length - 1,
  });
}
