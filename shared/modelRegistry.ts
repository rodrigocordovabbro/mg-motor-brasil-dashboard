export const OFFICIAL_MODELS = [
  "MG 4",
  "MG Urban",
  "MG S5",
  "MG Cyberster",
  "IM 6",
] as const;

export type OfficialModel = (typeof OFFICIAL_MODELS)[number];

export function normalizeModelKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "");
}

const aliases = new Map<string, OfficialModel>();
function register(model: OfficialModel, values: string[]) {
  for (const value of [model, ...values]) {
    const key = normalizeModelKey(value);
    const previous = aliases.get(key);
    if (previous && previous !== model)
      throw new Error(`Alias de modelo ambíguo: ${value}`);
    aliases.set(key, model);
  }
}

// XPOWER é uma versão MG4, conforme https://mgmotoroficial.com.br/model/mg4.
register("MG 4", [
  "4",
  "MG4",
  "MG4 EV",
  "MG 4 Comfort",
  "MG 4 Luxury",
  "MG4 XPower",
  "XPOWER",
  "X-Power",
]);
register("MG Urban", [
  "Urban",
  "MG4 Urban",
  "MG 4 Urban",
  "4 URBAN",
  "MGR URBAN",
  "Formulário - Ago e Set/26 - Urban 2 - 10.09.26 (Model)",
  "Formulário - Ago/26 - Urban Prospecção - 17.08.26",
  "Formulário - Ago/26 - Urban Prospecção - 13.08.26 (Novo)",
  "Formulário - Ago/26 - Urban Prospecção (Oferta) - 17.08.26",
  "Formulário - Ago e Set/26 - Retargeting - URBAN - 11.09.26",
  "Formulário - Ago/26 - Urban Prospecção (Oferta) - 13.08.26 (Novo)",
  "Formulário - Ago e Set/26 - Hyperlocal (Urban) - 10.09.26",
]);
register("MG S5", ["S5", "MGS5", "MG S5 EV"]);
register("MG Cyberster", ["Cyberster", "MG-CYBERSTER"]);
register("IM 6", ["IM6", "MG IM6", "MG IM 6"]);

/** Somente aliases registrados. Não usa substring ou o nome de campanha para inferir modelo. */
export function resolveOfficialModel(raw: string): OfficialModel | null {
  return aliases.get(normalizeModelKey(raw)) ?? null;
}

/** Valor para agregação, sem alterar o nome original da linha de Lead. */
export function groupedModelLabel(raw: string): string {
  return resolveOfficialModel(raw) ?? raw;
}
