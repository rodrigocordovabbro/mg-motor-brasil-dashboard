export type MediaPlanFunnel = "AWARENESS" | "CONSIDERATION" | "CONVERSION";
export type MediaPlanMode = "DELIVERY" | "FINANCIAL" | "HYBRID";
export type MediaPlanStatus = "PAID" | "PAYABLES" | "NOT_INFORMED";

export type MediaPlanContextItem = {
  id: string;
  labelPt: string;
  labelEn: string;
  value: number;
  notePt?: string;
  noteEn?: string;
};

export type MediaPlanRow = {
  id: string;
  sourceRow: number;
  funnel?: MediaPlanFunnel;
  channel: string;
  publisher?: string;
  product: string;
  objectivePt?: string;
  objectiveEn?: string;
  investment: number;
  commission?: number;
  netInvestment?: number;
  actualInvestment?: number;
  status?: MediaPlanStatus;
  cpm?: number;
  impressions?: number;
  ctr?: number;
  clicks?: number;
  connectRate?: number;
  visits?: number;
  cvr?: number;
  leads?: number | null;
  cpl?: number | null;
};

export type MediaPlanTotal = {
  sourceRow: number;
  label: string;
  product: string | null;
  investment: number;
  commission?: number;
  netInvestment?: number;
  actualInvestment?: number;
  impressions?: number;
  ctr?: number;
  clicks?: number;
  visits?: number;
  cvr?: number;
  leads?: number;
  cpl?: number;
};

export type MonthlyMediaPlan = {
  month: string;
  titlePt: string;
  titleEn: string;
  sourceFile: string;
  sourceSheet: string;
  formulaCount: number;
  updatedAt: string;
  mode: MediaPlanMode;
  sourceNotePt: string;
  sourceNoteEn: string;
  rows: MediaPlanRow[];
  totals: MediaPlanTotal[];
  total: MediaPlanTotal;
  contextItems?: MediaPlanContextItem[];
};

const OCTOBER_2026: MonthlyMediaPlan = {
  month: "2026-10",
  titlePt: "Plano de Mídia — Outubro de 2026",
  titleEn: "Media Plan — October 2026",
  sourceFile: "Quadros MG MEDIA PLAN | DIGITAL + MG MEDIA PLAN | IM",
  sourceSheet: "Line-up Media + IM6 Media",
  formulaCount: 0,
  updatedAt: "2026-10-02T12:51:00.000Z",
  mode: "HYBRID",
  sourceNotePt: "Fonte: quadros MG MEDIA PLAN | DIGITAL e MG MEDIA PLAN | IM enviados em 2 de outubro de 2026. Os dois planos convivem na mesma competência: Line-up e IM6. Valores e projeções são os aprovados na fonte; a comissão total de cada frente é de 4%.",
  sourceNoteEn: "Source: MG MEDIA PLAN | DIGITAL and MG MEDIA PLAN | IM tables supplied on October 2, 2026. Both plans coexist in the same month: Line-up and IM6. Values and projections reflect the approved source; the total commission for each stream is 4%.",
  rows: [
    { id: "oct-lineup-google", sourceRow: 5, funnel: "CONVERSION", channel: "Google Ads", publisher: "Google", product: "Line-up", objectivePt: "Leads / Conversão", objectiveEn: "Leads / Conversion", investment: 200000, commission: 8000, netInvestment: 192000, status: "NOT_INFORMED", leads: 2133, cpl: 90 },
    { id: "oct-lineup-globo", sourceRow: 6, funnel: "CONVERSION", channel: "Globo", publisher: "Globo", product: "Line-up", objectivePt: "Leads / Conversão", objectiveEn: "Leads / Conversion", investment: 50000, commission: 2000, netInvestment: 48000, status: "NOT_INFORMED", leads: 343, cpl: 140 },
    { id: "oct-lineup-webmotors", sourceRow: 7, funnel: "CONVERSION", channel: "Webmotors", publisher: "Webmotors", product: "Line-up", objectivePt: "Leads / Inventário", objectiveEn: "Leads / Inventory", investment: 100000, commission: 4000, netInvestment: 96000, status: "NOT_INFORMED", leads: 640, cpl: 150 },
    { id: "oct-lineup-meta", sourceRow: 8, funnel: "CONVERSION", channel: "Meta Ads (via Publya)", publisher: "Publya", product: "Line-up", objectivePt: "Leads / Social", objectiveEn: "Leads / Social", investment: 330000, commission: 13200, netInvestment: 316800, status: "NOT_INFORMED", leads: 5280, cpl: 60 },
    { id: "oct-lineup-mercado-livre", sourceRow: 9, funnel: "CONVERSION", channel: "Mercado Livre Ads", publisher: "Mercado Livre", product: "Line-up", objectivePt: "Leads / Marketplace", objectiveEn: "Leads / Marketplace", investment: 70000, commission: 2800, netInvestment: 67200, status: "NOT_INFORMED", leads: 448, cpl: 150 },
    { id: "oct-im6-forbes", sourceRow: 15, funnel: "AWARENESS", channel: "Forbes — branded content", publisher: "Forbes", product: "IM6", objectivePt: "Autoridade / Editorial", objectiveEn: "Authority / Editorial", investment: 67708, commission: 2708.32, netInvestment: 64999.68, status: "NOT_INFORMED", leads: null, cpl: null },
    { id: "oct-im6-cnn", sourceRow: 16, funnel: "AWARENESS", channel: "CNN TV", publisher: "CNN", product: "IM6", objectivePt: "Alcance / Frequência", objectiveEn: "Reach / Frequency", investment: 52968, commission: 2118.72, netInvestment: 50849.28, status: "NOT_INFORMED", leads: null, cpl: null },
    { id: "oct-im6-meta", sourceRow: 17, funnel: "CONVERSION", channel: "Meta Ads", publisher: "Meta", product: "IM6", objectivePt: "Leads / Social", objectiveEn: "Leads / Social", investment: 103907, commission: 4156.28, netInvestment: 99750.72, status: "NOT_INFORMED", leads: 1814, cpl: 55 },
    { id: "oct-im6-google-search", sourceRow: 18, funnel: "CONVERSION", channel: "Google Search", publisher: "Google", product: "IM6", objectivePt: "Leads / Busca", objectiveEn: "Leads / Search", investment: 10417, commission: 416.68, netInvestment: 10000.32, status: "NOT_INFORMED", leads: 105, cpl: 95 },
    { id: "oct-im6-webmotors", sourceRow: 19, funnel: "CONVERSION", channel: "Webmotors", publisher: "Webmotors", product: "IM6", objectivePt: "Leads / Inventário", objectiveEn: "Leads / Inventory", investment: 25000, commission: 1000, netInvestment: 24000, status: "NOT_INFORMED", leads: 160, cpl: 150 },
  ],
  totals: [
    { sourceRow: 11, label: "LINE-UP — MEDIA", product: "Line-up", investment: 750000, commission: 30000, netInvestment: 720000, leads: 8844, cpl: 81.4111262 },
    { sourceRow: 21, label: "IM6 — MEDIA", product: "IM6", investment: 260000, commission: 10400, netInvestment: 249600, leads: 2079, cpl: 120.0577201 },
  ],
  total: { sourceRow: 23, label: "TOTAL DIGITAL + IM6", product: null, investment: 1010000, commission: 40400, netInvestment: 969600, leads: 10923, cpl: 88.7668223 },
  contextItems: [
    { id: "oct-lineup-media", labelPt: "Plano Line-up", labelEn: "Line-up plan", value: 750000, notePt: "Incluído no total", noteEn: "Included in total" },
    { id: "oct-im6-media", labelPt: "Plano IM6", labelEn: "IM6 plan", value: 260000, notePt: "Incluído no total", noteEn: "Included in total" },
  ],
};

const SEPTEMBER_2026: MonthlyMediaPlan = {
  month: "2026-09",
  titlePt: "Plano de Mídia — Setembro de 2026",
  titleEn: "Media Plan — September 2026",
  sourceFile: "MG-SetembroMidia(1).xlsx",
  sourceSheet: "Media Plan - Digital",
  formulaCount: 556,
  updatedAt: "2026-09-02T22:11:44.533Z",
  mode: "HYBRID",
  sourceNotePt: "Fonte: MG-SetembroMidia(1).xlsx, recebida em 2 de setembro de 2026. As 556 fórmulas foram auditadas sem erros. O plano digital calculado fecha em R$ 799.999,67 brutos, R$ 767.999,68 líquidos e 9.998,96 Leads projetados. Revista, produção e reserva tática SAVE são exibidas separadamente porque não integram a projeção digital.",
  sourceNoteEn: "Source: MG-SetembroMidia(1).xlsx, received on September 2, 2026. All 556 formulas were audited with no errors. The calculated digital plan reconciles to BRL 799,999.67 gross, BRL 767,999.68 net and 9,998.96 projected Leads. Magazine, production and tactical SAVE reserve are shown separately because they are not part of the digital projection.",
  rows: [
    { id: "sep-google", sourceRow: 5, funnel: "CONVERSION", channel: "Google Ads", publisher: "Google", product: "Line-up", objectivePt: "Leads / Conversão", objectiveEn: "Leads / Conversion", investment: 279583, commission: 11183.32, netInvestment: 268399.68, status: "NOT_INFORMED", leads: 3116.577798, cpl: 86.12 },
    { id: "sep-webmotors", sourceRow: 6, funnel: "CONVERSION", channel: "Webmotors", publisher: "Webmotors", product: "Line-up", objectivePt: "Leads / Inventário", objectiveEn: "Leads / Inventory", investment: 110416.67, commission: 4416.6668, netInvestment: 106000.0032, status: "NOT_INFORMED", leads: 706.666688, cpl: 150 },
    { id: "sep-publya", sourceRow: 7, funnel: "CONVERSION", channel: "Publya Programmatic Display", publisher: "Publya", product: "Line-up", objectivePt: "Leads / Geolocalização", objectiveEn: "Leads / Geolocation", investment: 30000, commission: 1200, netInvestment: 28800, status: "NOT_INFORMED", leads: 335.3126092, cpl: 85.89 },
    { id: "sep-meta", sourceRow: 8, funnel: "CONVERSION", channel: "Meta Ads", publisher: "Publya", product: "Line-up", objectivePt: "Leads / Social", objectiveEn: "Leads / Social", investment: 300000, commission: 12000, netInvestment: 288000, status: "NOT_INFORMED", leads: 5328.39963, cpl: 54.05 },
    { id: "sep-mercado-livre", sourceRow: 9, funnel: "CONVERSION", channel: "Mercado Livre Ads", publisher: "Mercado Livre", product: "Line-up", objectivePt: "Leads / Marketplace", objectiveEn: "Leads / Marketplace", investment: 80000, commission: 3200, netInvestment: 76800, status: "NOT_INFORMED", leads: 512, cpl: 150 },
  ],
  totals: [
    { sourceRow: 11, label: "LINE-UP — MEDIA", product: "Line-up", investment: 799999.67, commission: 31999.9868, netInvestment: 767999.6832, leads: 9998.956726, cpl: 76.8079815 },
  ],
  total: { sourceRow: 13, label: "TOTAL DIGITAL", product: null, investment: 799999.67, commission: 31999.9868, netInvestment: 767999.6832, leads: 9998.956726, cpl: 76.8079815 },
  contextItems: [
    { id: "sep-digital", labelPt: "Mídia digital alocada", labelEn: "Allocated digital media", value: 799999.67, notePt: "Incluída na projeção", noteEn: "Included in projection" },
    { id: "sep-magazine", labelPt: "Revista", labelEn: "Magazine", value: 25000, notePt: "Reserva mensal", noteEn: "Monthly reserve" },
    { id: "sep-production", labelPt: "Produção", labelEn: "Production", value: 70000, notePt: "Filme e fotos IM6", noteEn: "IM6 film and photos" },
    { id: "sep-executive-total", labelPt: "Orçamento total", labelEn: "Total budget", value: 894999.67, notePt: "Digital + revista + produção", noteEn: "Digital + magazine + production" },
    { id: "sep-save", labelPt: "Reserva tática SAVE", labelEn: "Tactical SAVE reserve", value: 99000, notePt: "Exibida separadamente", noteEn: "Shown separately" },
  ],
};

const AUGUST_2026: MonthlyMediaPlan = {
  month: "2026-08",
  titlePt: "Plano de Mídia Digital — Agosto de 2026",
  titleEn: "Digital Media Plan — August 2026",
  sourceFile: "controle-financeiro.xlsx + MGPLANO-AGOSTO(1).xlsx",
  sourceSheet: "Agosto + Resume Plan / Lead Projection",
  formulaCount: 51,
  updatedAt: "2026-08-05T14:26:45.000Z",
  mode: "FINANCIAL",
  sourceNotePt: "Fontes: controle-financeiro.xlsx, aba Agosto, para PLAN GROSS, comissão de 4%, NET, investimento realizado e status; e MGPLANO-AGOSTO(1).xlsx, abas Resume Plan e Lead Projection, para a meta de 12.000 Leads. O CPL superior padronizado usa Plano líquido ÷ Leads projetados. A fonte financeira não informa projeções por linha.",
  sourceNoteEn: "Sources: controle-financeiro.xlsx, August sheet, for PLAN GROSS, 4% commission, NET, actual investment and status; and MGPLANO-AGOSTO(1).xlsx, Resume Plan and Lead Projection sheets, for the 12,000-Lead target. The standardized headline CPL uses Net plan ÷ Projected Leads. The financial source does not provide row-level projections.",
  rows: [
    { id: "aug-lineup-google", sourceRow: 10, channel: "Google Ads", publisher: "Google", product: "Line-up", investment: 350000, commission: 14000, netInvestment: 336000, actualInvestment: 0, status: "PAID" },
    { id: "aug-lineup-webmotors", sourceRow: 11, channel: "Webmotors", publisher: "Webmotors", product: "Line-up", investment: 170846.96, commission: 6833.8784, netInvestment: 164013.0816, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-lineup-uol", sourceRow: 12, channel: "UOL / Quatro Rodas", publisher: "UOL", product: "Line-up", investment: 0, commission: 0, netInvestment: 0, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-lineup-tiktok", sourceRow: 13, channel: "TikTok", publisher: "Publya", product: "Line-up", investment: 30000, commission: 1200, netInvestment: 28800, actualInvestment: 0, status: "NOT_INFORMED" },
    { id: "aug-lineup-display", sourceRow: 14, channel: "Display", publisher: "Publya", product: "Line-up", investment: 96250, commission: 3850, netInvestment: 92400, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-lineup-meta", sourceRow: 15, channel: "Meta", publisher: "Publya", product: "Line-up", investment: 150000, commission: 6000, netInvestment: 144000, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-lineup-youtube", sourceRow: 16, channel: "YouTube", publisher: "Publya", product: "Line-up", investment: 0, commission: 0, netInvestment: 0, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-lineup-mercado-livre", sourceRow: 17, channel: "Mercado Livre", publisher: "Mercado Livre", product: "Line-up", investment: 71458.3, commission: 2858.332, netInvestment: 68599.968, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-urban-google", sourceRow: 22, channel: "Google Ads", publisher: "Google", product: "MG4 Urban", investment: 80000, commission: 3200, netInvestment: 76800, actualInvestment: 0, status: "PAID" },
    { id: "aug-urban-youtube", sourceRow: 23, channel: "YouTube", publisher: "Publya", product: "MG4 Urban", investment: 26444.74, commission: 1057.7896, netInvestment: 25386.9504, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-urban-meta", sourceRow: 24, channel: "Meta", publisher: "Publya", product: "MG4 Urban", investment: 45000, commission: 1800, netInvestment: 43200, actualInvestment: 0, status: "PAYABLES" },
    { id: "aug-urban-webmotors", sourceRow: 25, channel: "Webmotors", publisher: "Webmotors", product: "MG4 Urban", investment: 15000, commission: 600, netInvestment: 14400, actualInvestment: 0, status: "NOT_INFORMED" },
    { id: "aug-urban-mercado-livre", sourceRow: 26, channel: "Mercado Livre", publisher: "Mercado Livre", product: "MG4 Urban", investment: 15000, commission: 600, netInvestment: 14400, actualInvestment: 0, status: "NOT_INFORMED" },
  ],
  totals: [
    { sourceRow: 18, label: "LINE-UP", product: "Line-up", investment: 868555.26, commission: 34742.2104, netInvestment: 833813.0496, actualInvestment: 0 },
    { sourceRow: 27, label: "MG4 URBAN", product: "MG4 Urban", investment: 181444.74, commission: 7257.7896, netInvestment: 174186.9504, actualInvestment: 0 },
  ],
  total: { sourceRow: 29, label: "GERAL DIGITAL", product: null, investment: 1050000, commission: 42000, netInvestment: 1008000, actualInvestment: 0, leads: 12000 },
};

const JULY_2026: MonthlyMediaPlan = {
  month: "2026-07",
  titlePt: "Plano de Mídia Digital — Julho de 2026",
  titleEn: "Digital Media Plan — July 2026",
  sourceFile: "Planilhasemtítulo.xlsx",
  sourceSheet: "Página1",
  formulaCount: 0,
  updatedAt: "2026-07-21T19:13:56.000Z",
  mode: "HYBRID",
  sourceNotePt: "Fonte: planilha enviada em 21 de julho de 2026, aba Página1. Os valores brutos e as premissas de entrega já registrados no dashboard foram preservados. Para padronizar o controle histórico, comissão e plano líquido foram calculados pela mesma regra de 4% usada em agosto e setembro. O CPL superior padronizado usa Plano líquido ÷ Leads projetados. Investimento realizado não foi informado e permanece como N/D.",
  sourceNoteEn: "Source: workbook supplied on July 21, 2026, sheet Página1. The gross values and delivery assumptions already registered in the dashboard were preserved. To standardize the historical control, commission and net plan were calculated using the same 4% rule applied in August and September. The standardized headline CPL uses Net plan ÷ Projected Leads. Actual investment was not reported and remains N/A.",
  rows: [
    { id: "lineup-google-pmax", sourceRow: 5, funnel: "CONVERSION", channel: "Google PMAX", publisher: "Google", product: "Line-up", objectivePt: "Leads / Conversão", objectiveEn: "Leads / Conversion", investment: 300000, commission: 12000, netInvestment: 288000, status: "NOT_INFORMED", cpm: 16.82, impressions: 17835910, ctr: 0.025, clicks: 445898, connectRate: 0.35, visits: 156064, cvr: 0.0396, leads: 6173, cpl: 48.6 },
    { id: "lineup-google-search", sourceRow: 6, funnel: "CONVERSION", channel: "Google Search", publisher: "Google", product: "Line-up", objectivePt: "Leads / Intenção", objectiveEn: "Leads / Intent", investment: 70000, commission: 2800, netInvestment: 67200, status: "NOT_INFORMED", cpm: 33.33, impressions: 2100210, ctr: 0.05, clicks: 105011, connectRate: 0.4, visits: 42004, cvr: 0.0181, leads: 759, cpl: 92.23 },
    { id: "lineup-webmotors", sourceRow: 7, funnel: "CONVERSION", channel: "Webmotors", publisher: "Webmotors", product: "Line-up", objectivePt: "Leads / Inventário", objectiveEn: "Leads / Inventory", investment: 100000, commission: 4000, netInvestment: 96000, status: "NOT_INFORMED", cpm: 15, impressions: 6666667, ctr: 0.012, clicks: 80000, connectRate: 0.4, visits: 32000, cvr: 0.0127, leads: 407, cpl: 245.7 },
    { id: "lineup-uol-quatro-rodas", sourceRow: 8, funnel: "CONVERSION", channel: "UOL / Quatro Rodas", publisher: "UOL", product: "Line-up", objectivePt: "Leads / Contextual", objectiveEn: "Leads / Contextual", investment: 50000, commission: 2000, netInvestment: 48000, status: "NOT_INFORMED", cpm: 12, impressions: 4166667, ctr: 0.012, clicks: 50000, connectRate: 0.4, visits: 20000, cvr: 0.0102, leads: 204, cpl: 245.1 },
    { id: "lineup-proxy-media", sourceRow: 9, funnel: "CONVERSION", channel: "Proxy Media", publisher: "Proxy", product: "Line-up", objectivePt: "Leads / Afiliados", objectiveEn: "Leads / Affiliates", investment: 30000, commission: 1200, netInvestment: 28800, status: "NOT_INFORMED", cpm: 11.43, impressions: 2624672, ctr: 0.012, clicks: 31496, connectRate: 0.4, visits: 12598, cvr: 0.0097, leads: 122, cpl: 245.9 },
    { id: "lineup-publya", sourceRow: 10, funnel: "CONVERSION", channel: "Publya (Programmatic)", publisher: "Publya", product: "Line-up", objectivePt: "Leads / Geolocalização", objectiveEn: "Leads / Geolocation", investment: 150000, commission: 6000, netInvestment: 144000, status: "NOT_INFORMED", cpm: 12, impressions: 12500000, ctr: 0.015, clicks: 187500, connectRate: 0.35, visits: 65625, cvr: 0.0119, leads: 784, cpl: 191.33 },
    { id: "lineup-meta-via-publya", sourceRow: 11, funnel: "CONVERSION", channel: "Meta Ads (via Publya)", publisher: "Publya", product: "Line-up", objectivePt: "Leads / Social", objectiveEn: "Leads / Social", investment: 80000, commission: 3200, netInvestment: 76800, status: "NOT_INFORMED", cpm: 10, impressions: 8000000, ctr: 0.02, clicks: 160000, connectRate: 0.38, visits: 60800, cvr: 0.0163, leads: 991, cpl: 80.73 },
    { id: "lineup-google-demand-gen", sourceRow: 12, funnel: "CONSIDERATION", channel: "Google Demand Gen", publisher: "Google", product: "Line-up", objectivePt: "Tráfego / Consideração", objectiveEn: "Traffic / Consideration", investment: 30000, commission: 1200, netInvestment: 28800, status: "NOT_INFORMED", cpm: 8.33, impressions: 3601441, ctr: 0.015, clicks: 54022, connectRate: 0.4, visits: 21609, cvr: 0, leads: null, cpl: null },
    { id: "lineup-mercado-livre", sourceRow: 13, funnel: "CONSIDERATION", channel: "Mercado Livre Ads", publisher: "Mercado Livre", product: "Line-up", objectivePt: "Tráfego / Marketplace", objectiveEn: "Traffic / Marketplace", investment: 40000, commission: 1600, netInvestment: 38400, status: "NOT_INFORMED", cpm: 10, impressions: 4000000, ctr: 0.012, clicks: 48000, connectRate: 0.4, visits: 19200, cvr: 0, leads: null, cpl: null },
    { id: "mg4-youtube-video", sourceRow: 17, funnel: "AWARENESS", channel: "YouTube Video", publisher: "Publya", product: "MG4 Urban", objectivePt: "Visualizações / Lançamento", objectiveEn: "Views / Launch", investment: 45000, commission: 1800, netInvestment: 43200, status: "NOT_INFORMED", cpm: 6, impressions: 7500000, ctr: 0.006, clicks: 45000, connectRate: 0.2, visits: 9000, cvr: 0, leads: null, cpl: null },
    { id: "mg4-google-demand-gen", sourceRow: 18, funnel: "CONSIDERATION", channel: "Google Demand Gen", publisher: "Google", product: "MG4 Urban", objectivePt: "Tráfego / Descoberta", objectiveEn: "Traffic / Discovery", investment: 30000, commission: 1200, netInvestment: 28800, status: "NOT_INFORMED", cpm: 8, impressions: 3750000, ctr: 0.015, clicks: 56250, connectRate: 0.4, visits: 22500, cvr: 0, leads: null, cpl: null },
    { id: "mg4-google-pmax", sourceRow: 19, funnel: "CONVERSION", channel: "Google PMAX", publisher: "Google", product: "MG4 Urban", objectivePt: "Leads / Pré-venda", objectiveEn: "Leads / Pre-sale", investment: 50000, commission: 2000, netInvestment: 48000, status: "NOT_INFORMED", cpm: 15, impressions: 3333333, ctr: 0.025, clicks: 83333, connectRate: 0.35, visits: 29167, cvr: 0.0109, leads: 317, cpl: 157.73 },
    { id: "mg4-google-search", sourceRow: 20, funnel: "CONVERSION", channel: "Google Search", publisher: "Google", product: "MG4 Urban", objectivePt: "Leads / Intenção", objectiveEn: "Leads / Intent", investment: 20000, commission: 800, netInvestment: 19200, status: "NOT_INFORMED", cpm: 33.33, impressions: 600060, ctr: 0.05, clicks: 30003, connectRate: 0.4, visits: 12001, cvr: 0.0072, leads: 86, cpl: 232.56 },
    { id: "mg4-webmotors", sourceRow: 21, funnel: "CONVERSION", channel: "Webmotors", publisher: "Webmotors", product: "MG4 Urban", objectivePt: "Leads / Inventário", objectiveEn: "Leads / Inventory", investment: 25000, commission: 1000, netInvestment: 24000, status: "NOT_INFORMED", cpm: 15, impressions: 1666667, ctr: 0.012, clicks: 20000, connectRate: 0.4, visits: 8000, cvr: 0.0127, leads: 102, cpl: 245.1 },
    { id: "mg4-mercado-livre", sourceRow: 22, funnel: "CONSIDERATION", channel: "Mercado Livre Ads", publisher: "Mercado Livre", product: "MG4 Urban", objectivePt: "Tráfego / Marketplace", objectiveEn: "Traffic / Marketplace", investment: 30000, commission: 1200, netInvestment: 28800, status: "NOT_INFORMED", cpm: 10, impressions: 3000000, ctr: 0.012, clicks: 36000, connectRate: 0.4, visits: 14400, cvr: 0.0038, leads: 55, cpl: 545.45 },
  ],
  totals: [
    { sourceRow: 14, label: "LINE-UP", product: "Line-up", investment: 850000, commission: 34000, netInvestment: 816000, impressions: 61495565, ctr: 0.0189, clicks: 1161926, visits: 429900, cvr: 0.022, leads: 9440, cpl: 90.04 },
    { sourceRow: 23, label: "MG4 URBAN", product: "MG4 Urban", investment: 200000, commission: 8000, netInvestment: 192000, impressions: 19850060, ctr: 0.0136, clicks: 270586, visits: 95068, cvr: 0.0059, leads: 560, cpl: 357.14 },
  ],
  total: { sourceRow: 25, label: "GERAL DIGITAL", product: null, investment: 1050000, commission: 42000, netInvestment: 1008000, impressions: 81345625, ctr: 0.0176, clicks: 1432512, visits: 524968, cvr: 0.019, leads: 10000, cpl: 105 },
};

export const MEDIA_PLANS: MonthlyMediaPlan[] = [OCTOBER_2026, SEPTEMBER_2026, AUGUST_2026, JULY_2026];

export function getMediaPlan(month: string): MonthlyMediaPlan | null {
  return MEDIA_PLANS.find((plan) => plan.month === month) ?? null;
}
