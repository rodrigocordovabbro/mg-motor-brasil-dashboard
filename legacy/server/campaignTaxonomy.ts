export type RegionClassification = {
  key: string;
  label: string;
  type: "regional" | "national" | "unclassified";
};

const REGION_DEFINITIONS: Array<{
  key: string;
  label: string;
  aliases: string[];
}> = [
  { key: "SAO_PAULO_SP", label: "São Paulo/SP", aliases: ["SP", "SAO_PAULO"] },
  { key: "BRASILIA_DF", label: "Brasília/DF", aliases: ["BRASILIA"] },
  { key: "PORTO_ALEGRE_RS", label: "Porto Alegre/RS", aliases: ["POA", "PORTO_ALEGRE"] },
  { key: "CURITIBA_PR", label: "Curitiba/PR", aliases: ["CURITIBA"] },
  { key: "BELO_HORIZONTE_MG", label: "Belo Horizonte/MG", aliases: ["BH", "BELO_HORIZONTE"] },
  { key: "RIO_DE_JANEIRO_RJ", label: "Rio de Janeiro/RJ", aliases: ["RJ", "RIO_DE_JANEIRO"] },
  { key: "SALVADOR_BA", label: "Salvador/BA", aliases: ["SALVADOR"] },
  { key: "FLORIANOPOLIS_SC", label: "Florianópolis/SC", aliases: ["FLORIANOPOLIS"] },
  { key: "CAMPINAS_SP", label: "Campinas/SP", aliases: ["CAMPINAS"] },
  { key: "FORTALEZA_CE", label: "Fortaleza/CE", aliases: ["FORTALEZA"] },
  { key: "RIBEIRAO_PRETO_SP", label: "Ribeirão Preto/SP", aliases: ["RIBEIRAO_PRETO"] },
  { key: "VITORIA_ES", label: "Vitória/ES", aliases: ["VITORIA"] },
  { key: "PIRACICABA_SP", label: "Piracicaba/SP", aliases: ["PIRACICABA"] },
  { key: "SAO_JOSE_DO_RIO_PRETO_SP", label: "São José do Rio Preto/SP", aliases: ["SAO_JOSE_RP"] },
  { key: "NATAL_RN", label: "Natal/RN", aliases: ["NATAL"] },
  { key: "MACEIO_AL", label: "Maceió/AL", aliases: ["MACEIO"] },
  { key: "BELEM_PA", label: "Belém/PA", aliases: ["BELEM"] },
  { key: "ARACAJU_SE", label: "Aracaju/SE", aliases: ["ARACAJU"] },
  { key: "JOAO_PESSOA_PB", label: "João Pessoa/PB", aliases: ["JOAO_PESSOA"] },
  { key: "RECIFE_PE", label: "Recife/PE", aliases: ["RECIFE"] },
  { key: "GOIANIA_GO", label: "Goiânia/GO", aliases: ["GOIANIA"] },
  { key: "CUIABA_MT", label: "Cuiabá/MT", aliases: ["CUIABA"] },
  { key: "CAMPO_GRANDE_MS", label: "Campo Grande/MS", aliases: ["CAMPO_GRANDE"] },
  { key: "SAO_CAETANO_DO_SUL_SP", label: "São Caetano do Sul/SP", aliases: ["SCS"] },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function containsAlias(campaign: string, alias: string) {
  return `_${campaign}_`.includes(`_${alias}_`);
}

export function classifyProduct(campaignName: string) {
  const campaign = normalize(campaignName);
  if (campaign.includes("CYBESTER") || campaign.includes("CYBERSTER")) return "MG Cyberster";
  if (containsAlias(campaign, "IM6") || campaign.includes("IM_6")) return "MG IM6";
  if (containsAlias(campaign, "MGS5") || campaign.includes("MG_S5")) return "MG S5";
  if (campaign.includes("XPOWER") || campaign.includes("X_POWER")) return "MG4";
  if (containsAlias(campaign, "MG4")) return "MG4";
  if (containsAlias(campaign, "MARCA")) return "Marca MG";
  return "Não classificada";
}

export function classifyRegion(campaignName: string): RegionClassification {
  const campaign = normalize(campaignName);
  if (containsAlias(campaign, "NACIONAL") || containsAlias(campaign, "BRASIL")) {
    return { key: "NATIONAL", label: "Nacional", type: "national" };
  }

  const matches = REGION_DEFINITIONS.filter(region =>
    region.aliases.some(alias => containsAlias(campaign, alias)),
  );

  if (matches.length !== 1) {
    return { key: "UNCLASSIFIED", label: "Não classificada", type: "unclassified" };
  }

  return { key: matches[0].key, label: matches[0].label, type: "regional" };
}
