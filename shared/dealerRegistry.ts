export type OfficialDealer = {
  name: string;
  state: string;
};

/** Cadastro recebido do usuário em 05/11/2026. Não reescreve a fonte de Leads. */
export const OFFICIAL_DEALERS: readonly OfficialDealer[] = [
  { name: "Autobel Campo Grande (EM BREVE)", state: "MS" },
  { name: "Autobrand Recife", state: "PE" },
  { name: "Automec Sorocaba", state: "SP" },
  { name: "Baltic Alphaville", state: "SP" },
  { name: "Baltic Guarulhos - Shopping Maia", state: "SP" },
  { name: "Barigui Curitiba", state: "PR" },
  { name: "Barigui Florianópolis", state: "SC" },
  { name: "Bastazini Manaus - Manauara Shopping", state: "AM" },
  { name: "Bastazini Manaus (EM BREVE)", state: "AM" },
  { name: "Dão Silveira Natal Midway Mall", state: "RN" },
  { name: "DRSUL Porto Alegre", state: "RS" },
  { name: "Euroville Belo Horizonte", state: "MG" },
  { name: "Euroville Juiz de Fora", state: "MG" },
  { name: "Euroville Uberlândia", state: "MG" },
  { name: "Iguauto Fortaleza", state: "CE" },
  { name: "Inglaterra Salvador", state: "BA" },
  { name: "Javep Bauru (EM BREVE)", state: "SP" },
  { name: "Javep Bauru BOULEVARD SHOPPING BAURU", state: "SP" },
  { name: "Jelta São Luís - Shopping da Ilha", state: "MA" },
  { name: "Jelta Teresina - Teresina Shopping", state: "PI" },
  { name: "JRCA Maceió", state: "AL" },
  { name: "La Fontaine Joinville ( GARTEN Shopping )", state: "SC" },
  { name: "La Fontaine Joinville (EM BREVE)", state: "SC" },
  { name: "London Aracaju", state: "SE" },
  { name: "London Shopping Riomar", state: "SE" },
  { name: "Niscar João Pessoa", state: "PB" },
  { name: "Onne Ribeirão Preto", state: "SP" },
  { name: "Onne São José do Rio Preto", state: "SP" },
  { name: "Orvel Vitória", state: "ES" },
  { name: "Potenza Recreio", state: "RJ" },
  { name: "Ramasa Palmas", state: "TO" },
  { name: "Savol - Shopping Anália Franco", state: "SP" },
  { name: "Savol São Caetano do Sul", state: "SP" },
  { name: "Sinal Av. Europa", state: "SP" },
  { name: "Sinal Av. Indianópolis", state: "SP" },
  { name: "Stefanini Campinas", state: "SP" },
  { name: "Stefanini Piracicaba", state: "SP" },
  { name: "Tecar Goiânia", state: "GO" },
  { name: "Tecar SIA Brasília", state: "DF" },
  { name: "Toriba Ceasa", state: "SP" },
  { name: "Vega Belém", state: "PA" },
];

/** Escopo da planilha CRM solicitado pelo usuário; Indianópolis permanece no cadastro comercial. */
export const CRM_DEALERS = OFFICIAL_DEALERS.filter(
  dealer => dealer.name !== "Sinal Av. Indianópolis"
);

export const DEALER_MAPPING_VERSION = "mg-official-2026-11-05-indianopolis";

export function normalizeDealerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const byName = new Map(OFFICIAL_DEALERS.map(dealer => [dealer.name, dealer]));
const aliases = new Map<string, string>();
function register(name: string, values: string[]) {
  const dealer = byName.get(name);
  if (!dealer) throw new Error(`Dealer oficial desconhecido: ${name}`);
  for (const value of [name, ...values]) {
    for (const variant of [value, `${value}/${dealer.state}`]) {
      const key = normalizeDealerKey(variant);
      const previous = aliases.get(key);
      if (previous && previous !== name)
        throw new Error(`Alias ambíguo: ${variant}`);
      aliases.set(key, name);
    }
  }
}

register("Autobel Campo Grande (EM BREVE)", ["Autobel Campo Grande"]);
register("Autobrand Recife", [
  "Autobrand Recife - Recife",
  "Autobrand - Recife",
]);
register("Automec Sorocaba", [
  "Automec - Sorocaba",
  "Automec Sorocaba - Sorocaba",
]);
register("Baltic Alphaville", [
  "Baltic - Alphaville",
  "Baltic Shopping Tamboré",
  "Baltic Shopping Tamboré - Barueri",
]);
register("Baltic Guarulhos - Shopping Maia", [
  "Baltic Guarulhos",
  "Baltic Guarulhos - Guarulhos",
  "Baltic Guarulhos - Shopping Maia - Guarulhos",
]);
register("Barigui Curitiba", ["Barigui - Curitiba"]);
register("Barigui Florianópolis", [
  "Barigui Floripa",
  "Barigui - Floripa",
  "Barigui - Florianópolis",
  "Barigui Mandarim - Florianópolis",
]);
register("Bastazini Manaus - Manauara Shopping", [
  "Bastazini Manaus - Manauara Shopping - Manaus",
  "GB - Manauara Shopping - Manaus",
]);
register("Bastazini Manaus (EM BREVE)", []);
register("Dão Silveira Natal Midway Mall", [
  "Dão Silveira Natal",
  "Dão Silveira - Natal",
]);
register("DRSUL Porto Alegre", [
  "DR SUL",
  "DRSUL - Porto Alegre",
  "DRSUL - Porto Alegre Shopping",
  "DRSUL Barra Shopping Sul - Porto Alegre",
  "DRSUL POA",
]);
register("Euroville Belo Horizonte", [
  "Euroville - Belo Horizonte",
  "Euroville - BH Barão",
  "Euroville Barão",
  "Euroville BH",
  "Euroville - BH",
  "Euroville - BH Shopping",
]);
register("Euroville Juiz de Fora", [
  "Euroville - Juiz de Fora",
  "Euroville Juiz de Fora - Juiz de Fora",
]);
register("Euroville Uberlândia", [
  "Euroville - Uberlândia",
  "Euroville Uberlandia - Uberlândia",
]);
register("Iguauto Fortaleza", [
  "Iguauto - Fortaleza",
  "Iguauto Shopping - Fortaleza",
  "MG Iguauto - Fortaleza",
]);
register("Inglaterra Salvador", [
  "Inglaterra - Iguatemi",
  "Inglaterra Salvador Shopping",
  "Inglaterra Shopping - Salvador",
  "Inglaterra Salvador - Salvador",
  "MG Inglaterra Salvador Shopping - Salvador",
  "Indiana Salvador",
]);
register("Javep Bauru (EM BREVE)", []);
register("Javep Bauru BOULEVARD SHOPPING BAURU", [
  "Javep Bauru - Boulevard Shopping",
  "Javep Bauru - Boulevard Shopping Bauru",
]);
register("Jelta São Luís - Shopping da Ilha", [
  "Jelta São Luís",
  "Jelta São Luís - Shopping da Ilha - São Luís",
]);
register("Jelta Teresina - Teresina Shopping", [
  "Jelta Teresina",
  "Jelta Teresina - Teresina Shopping - Teresina",
]);
register("JRCA Maceió", ["JRCA - Maceió", "MG JRCA"]);
register("La Fontaine Joinville ( GARTEN Shopping )", [
  "La Fontaine Joinville - Garten Shopping",
  "La Fontaine Joinville - Garten Shopping - Joinville",
]);
register("La Fontaine Joinville (EM BREVE)", []);
register("London Aracaju", []);
register("London Shopping Riomar", ["London Shopping Riomar - Aracaju"]);
register("Niscar João Pessoa", [
  "Niscar - João Pessoa",
  "Niscar João Pessoa - João Pessoa",
  "Niscar Shopping Manaira - João Pessoa",
]);
register("Onne Ribeirão Preto", [
  "Onne - Ribeirão Preto",
  "Onne Ribeirão",
  "Onne Ribeirão - Ribeirão Preto",
]);
register("Onne São José do Rio Preto", [
  "Onne - São José do Rio Preto",
  "Onne Rio Preto",
  "Onne SJRP",
  "Onne SJRP - São José do Rio Preto",
]);
register("Orvel Vitória", [
  "Orvel - Vitória",
  "Orvel Shopping Vitória",
  "Orvel Shopping Vitória - Vitória",
]);
register("Potenza Recreio", [
  "Potenza - Recreio",
  "Potenza Recreio - Rio de Janeiro",
  "Potenza Rio de Janeiro",
]);
register("Ramasa Palmas", ["Ramasa - Palmas"]);
register("Savol - Shopping Anália Franco", [
  "Savol - Shopping Anália Franco",
  "Savol ZL - São Paulo",
  "Savol ZL",
]);
register("Savol São Caetano do Sul", [
  "Savol - São Caetano",
  "Savol São Caetano",
  "Savol - São Caetano do Sul",
]);
register("Sinal Av. Europa", [
  "Sinal - Av. Europa",
  "Sinal Av Europa - São Paulo",
]);
register("Sinal Av. Indianópolis", [
  "Sinal Av Indianopolis",
  "Sinal Av Indianópolis - São Paulo",
]);
register("Stefanini Campinas", [
  "Stefanini - Campinas",
  "Stefanini Campinas - Campinas",
]);
register("Stefanini Piracicaba", [
  "Stefanini - Piracicaba",
  "Stefanini Piracicaba - Piracicaba",
]);
register("Tecar Goiânia", [
  "Tecar Shopping - Goiânia",
  "Tecar Bougainville Shopping",
  "Tecar Bougainville - Goiânia",
  "Tecar Bougainville Shopping - Goiânia",
  "Tecar - Goiânia",
]);
register("Tecar SIA Brasília", [
  "Tecar - SIA Brasília",
  "Tecar SIA",
  "Tecar SIA - Brasília",
  "Tecar Brasília",
]);
register("Toriba Ceasa", [
  "Toriba - Ceasa",
  "Toriba - São Paulo",
  "Toriba São Paulo",
  "Toriba",
]);
register("Vega Belém", [
  "Vega Belém - Belém",
  "Vega Longwall Automotores",
  "Vega Longwall Automotores Comercial LTDA",
]);

export function officialDealer(name: string): OfficialDealer | undefined {
  return byName.get(name);
}

/** Aceita somente aliases registrados; cidades soltas e grupos não viram uma loja. */
export function resolveOfficialDealer(raw: string): string | null {
  // IDs cadastrais presentes na fonte não fazem parte do nome da unidade.
  const value = raw.replace(/\s+-\s+\d{6,}\s*$/, "");
  return aliases.get(normalizeDealerKey(value)) ?? null;
}

const commercial = new Map<string, string[]>();
function source(labels: string[], dealers: string[]) {
  for (const name of dealers)
    if (!byName.has(name)) throw new Error(`Unidade inválida: ${name}`);
  for (const label of labels)
    commercial.set(normalizeDealerKey(label), dealers);
}
source(["SAVOL/SP"], ["Savol São Caetano do Sul"]);
source(["SAVOL ZL/SP"], ["Savol - Shopping Anália Franco"]);
source(["BALTIC/SP"], ["Baltic Alphaville"]);
source(["BALTIC GUA/SP"], ["Baltic Guarulhos - Shopping Maia"]);
source(["TORIBA/SP"], ["Toriba Ceasa"]);
source(["STEFANINI CAMP/SP"], ["Stefanini Campinas"]);
source(["STEFANINI PIRA/SP"], ["Stefanini Piracicaba"]);
source(["ONNE RIB/SP"], ["Onne Ribeirão Preto"]);
source(["ONNE SJRP/SP"], ["Onne São José do Rio Preto"]);
source(["BDG/MG"], ["Euroville Belo Horizonte"]);
source(["BDG JF/MG"], ["Euroville Juiz de Fora"]);
source(["BDG UBE/MG"], ["Euroville Uberlândia"]);
source(["INGLATERRA/BA"], ["Inglaterra Salvador"]);
source(["IGUAUTO/CE"], ["Iguauto Fortaleza"]);
source(["DAO SILVEIRA/RN"], ["Dão Silveira Natal Midway Mall"]);
source(["JRCA/AL"], ["JRCA Maceió"]);
source(["NISCAR/PB"], ["Niscar João Pessoa"]);
source(["AUTOBRAND/PE"], ["Autobrand Recife"]);
source(["AUTOMEC/SP"], ["Automec Sorocaba"]);
source(["SINAL/SP"], ["Sinal Av. Europa"]);
source(["GENIAL/RJ"], ["Potenza Recreio"]);
source(["BARIGUI/PR"], ["Barigui Curitiba"]);
source(["BARIGUI/SC"], ["Barigui Florianópolis"]);
source(["DRSUL/RS"], ["DRSUL Porto Alegre"]);
source(["ORLETTI/ES"], ["Orvel Vitória"]);
source(["TECAR/DF"], ["Tecar SIA Brasília"]);
source(["TECAR/GO"], ["Tecar Goiânia"]);
source(["VEGA/PA"], ["Vega Belém"]);
source(
  ["SAVOL SÃO CAETANO/ANÁLIA"],
  ["Savol São Caetano do Sul", "Savol - Shopping Anália Franco"]
);
source(
  ["BALTIC BARUERI/GUARULHOS"],
  ["Baltic Alphaville", "Baltic Guarulhos - Shopping Maia"]
);
source(
  ["HG/SE", "HG ARACAJU", "HG Aracaju - Aracaju/SE"],
  ["London Aracaju", "London Shopping Riomar"]
);
source(
  ["JAVEP/SP", "JAVEP BAURU", "Javep - Bauru/SP"],
  ["Javep Bauru (EM BREVE)", "Javep Bauru BOULEVARD SHOPPING BAURU"]
);
source(
  [
    "LA FONTAINE/SC",
    "LA FONTAINE JOINVILLE",
    "La Fontaine Joinville - Joinville/SC",
  ],
  [
    "La Fontaine Joinville ( GARTEN Shopping )",
    "La Fontaine Joinville (EM BREVE)",
  ]
);
source(
  ["BASTAZINI MANAUS"],
  ["Bastazini Manaus - Manauara Shopping", "Bastazini Manaus (EM BREVE)"]
);

/** Regra comercial explícita, distinta de atribuir um Lead a uma unidade. */
export function resolveCommercialDealers(
  sourceLabel: string,
  _state?: string | null
): string[] {
  const registered = commercial.get(normalizeDealerKey(sourceLabel));
  if (registered) return [...registered];
  const dealer = resolveOfficialDealer(sourceLabel);
  return dealer ? [dealer] : [];
}
