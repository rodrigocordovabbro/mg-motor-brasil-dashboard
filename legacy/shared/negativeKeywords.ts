export const NEGATIVE_KEYWORD_MATCH_TYPES = ["BROAD", "PHRASE", "EXACT"] as const;
export type NegativeKeywordMatchType = (typeof NEGATIVE_KEYWORD_MATCH_TYPES)[number];

export type AppliedNegativeKeyword = {
  term: string;
  normalizedTerm: string;
  matchType: NegativeKeywordMatchType;
};

export function normalizeNegativeKeywordTerm(term: string) {
  return term
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function parseNegativeKeywordLine(rawLine: string): AppliedNegativeKeyword | null {
  let value = rawLine.trim();
  if (!value) return null;

  let matchType: NegativeKeywordMatchType = "BROAD";
  if (value.startsWith("[") && value.endsWith("]")) {
    matchType = "EXACT";
    value = value.slice(1, -1).trim();
  } else if (value.startsWith('"') && value.endsWith('"')) {
    matchType = "PHRASE";
    value = value.slice(1, -1).trim();
  }

  value = value.replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (value.length > 500) throw new Error("Cada palavra-chave negativa deve ter no máximo 500 caracteres.");

  return {
    term: value,
    normalizedTerm: normalizeNegativeKeywordTerm(value),
    matchType,
  };
}

export function parseNegativeKeywordList(value: string) {
  const unique = new Map<string, AppliedNegativeKeyword>();
  for (const line of value.split(/\r?\n/)) {
    const parsed = parseNegativeKeywordLine(line);
    if (!parsed) continue;
    const key = `${parsed.normalizedTerm}::${parsed.matchType}`;
    if (!unique.has(key)) unique.set(key, parsed);
  }
  return Array.from(unique.values());
}
