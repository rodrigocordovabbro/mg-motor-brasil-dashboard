export type BrazilianRegion =
  | "Norte"
  | "Nordeste"
  | "Centro-Oeste"
  | "Sudeste"
  | "Sul";
export type BrazilianState = {
  uf: string;
  name: string;
  region: BrazilianRegion;
};
export const BRAZILIAN_REGIONS: readonly BrazilianRegion[] = [
  "Norte",
  "Nordeste",
  "Centro-Oeste",
  "Sudeste",
  "Sul",
];
export const UNIDENTIFIED_STATE = "Estado não identificado";
export const UNIDENTIFIED_REGION = "Região não identificada";
export const BRAZILIAN_STATES: readonly BrazilianState[] = [
  { uf: "AC", name: "Acre", region: "Norte" },
  { uf: "AL", name: "Alagoas", region: "Nordeste" },
  { uf: "AP", name: "Amapá", region: "Norte" },
  { uf: "AM", name: "Amazonas", region: "Norte" },
  { uf: "BA", name: "Bahia", region: "Nordeste" },
  { uf: "CE", name: "Ceará", region: "Nordeste" },
  { uf: "DF", name: "Distrito Federal", region: "Centro-Oeste" },
  { uf: "ES", name: "Espírito Santo", region: "Sudeste" },
  { uf: "GO", name: "Goiás", region: "Centro-Oeste" },
  { uf: "MA", name: "Maranhão", region: "Nordeste" },
  { uf: "MT", name: "Mato Grosso", region: "Centro-Oeste" },
  { uf: "MS", name: "Mato Grosso do Sul", region: "Centro-Oeste" },
  { uf: "MG", name: "Minas Gerais", region: "Sudeste" },
  { uf: "PA", name: "Pará", region: "Norte" },
  { uf: "PB", name: "Paraíba", region: "Nordeste" },
  { uf: "PR", name: "Paraná", region: "Sul" },
  { uf: "PE", name: "Pernambuco", region: "Nordeste" },
  { uf: "PI", name: "Piauí", region: "Nordeste" },
  { uf: "RJ", name: "Rio de Janeiro", region: "Sudeste" },
  { uf: "RN", name: "Rio Grande do Norte", region: "Nordeste" },
  { uf: "RS", name: "Rio Grande do Sul", region: "Sul" },
  { uf: "RO", name: "Rondônia", region: "Norte" },
  { uf: "RR", name: "Roraima", region: "Norte" },
  { uf: "SC", name: "Santa Catarina", region: "Sul" },
  { uf: "SP", name: "São Paulo", region: "Sudeste" },
  { uf: "SE", name: "Sergipe", region: "Nordeste" },
  { uf: "TO", name: "Tocantins", region: "Norte" },
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "");
const aliases = new Map<string, BrazilianState>();
for (const state of BRAZILIAN_STATES) {
  for (const label of [state.uf, state.name, `BR-${state.uf}`])
    aliases.set(normalize(label), state);
}
aliases.set(normalize("S.Paulo"), BRAZILIAN_STATES.find(s => s.uf === "SP")!);
aliases.set(normalize("Brasília"), BRAZILIAN_STATES.find(s => s.uf === "DF")!);

/** Resolve sigla/nome ou uma indicação explícita de estado no próprio campo. Nunca usa o dealer/cidade do Lead. */
export function resolveBrazilianState(raw: string): BrazilianState | null {
  if (raw.includes("@") || /https?:/i.test(raw)) return null;
  const exact = aliases.get(normalize(raw));
  if (exact) return exact;
  const matches = new Map<string, BrazilianState>();
  for (const segment of raw.split(/[/,;]+/)) {
    const state = aliases.get(normalize(segment));
    if (state) matches.set(state.uf, state);
  }
  const suffix = raw.trim().match(/(?:^|[\s./,-])([a-zA-Z]{2})$/);
  if (suffix) {
    const state = aliases.get(normalize(suffix[1]));
    if (state) matches.set(state.uf, state);
  }
  return matches.size === 1 ? [...matches.values()][0] : null;
}
export function groupedStateLabel(raw: string): string {
  return resolveBrazilianState(raw)?.name ?? UNIDENTIFIED_STATE;
}
