import {
  formatIsoDateInTimeZone,
  isIsoCalendarDate,
} from "../shared/dashboardDates";
import type { V2Lead } from "../shared/v2Types";
export type MappedLead = Omit<V2Lead, "id"> & {
  sourceSheet: string;
  sourceRow: number;
};
export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function cleanLabel(value: unknown) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function normalizeModel(value: unknown) {
  const label = cleanLabel(value);
  const key = label.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/MG4URBAN/.test(key)) return "MG 4 Urban";
  if (/MG4/.test(key)) return "MG 4";
  if (/MGS5|MG5/.test(key)) return "MG S5";
  if (/CYBERSTER/.test(key)) return "Cyberster";
  if (/IM6/.test(key)) return "IM6";
  return label || "Não informado";
}

export function parseSourceDate(
  value: unknown,
  usDate = false
): { date: string; hour: number | null } | null {
  const input = String(value ?? "").trim();
  if (!input) return null;
  const iso = input.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?/
  );
  if (iso) {
    if (!isIsoCalendarDate(iso[1])) return null;
    const stamp = input
      .replace(/\(UTC([+-]\d\d:\d\d)\)$/, "$1")
      .replace(" ", "T");
    if (iso[2] && /(?:Z|[+-]\d\d:\d\d)$/.test(stamp)) {
      const parsed = new Date(stamp);
      if (!Number.isNaN(parsed.getTime())) {
        const hour = Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hourCycle: "h23",
          }).format(parsed)
        );
        return { date: formatIsoDateInTimeZone(parsed), hour };
      }
    }
    const hour = iso[2] == null ? null : Number(iso[2]);
    return hour != null && hour > 23 ? null : { date: iso[1], hour };
  }
  const slash = input.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):\d{2})?$/
  );
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const month = (usDate ? slash[1] : slash[2]).padStart(2, "0");
    const day = (usDate ? slash[2] : slash[1]).padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    const hour = slash[4] == null ? null : Number(slash[4]);
    return isIsoCalendarDate(date) && (hour == null || hour <= 23)
      ? { date, hour }
      : null;
  }
  if (/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{4}/.test(input)) {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime()))
      return { date: formatIsoDateInTimeZone(parsed), hour: null };
  }
  return null;
}

export function mapSheet(sheet: string, values: unknown[][]) {
  const headers = (values[0] ?? []).map(value =>
    normalizeHeader(String(value ?? ""))
  );
  const get = (row: unknown[], names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(normalizeHeader(name));
      if (index >= 0 && row[index] != null && String(row[index]).trim())
        return row[index];
    }
    return "";
  };
  const channel =
    (
      {
        Site: "Site",
        Meta: "Meta",
        "Tiktok - Live": "TikTok Live",
        Tikok: "TikTok",
        Weebmotors: "Webmotors",
        Uol: "UOL",
        "Mercado Livre": "Mercado Livre",
        Interlagos: "Interlagos",
      } as Record<string, string>
    )[sheet] ?? sheet;
  const leads: MappedLead[] = [];
  let invalidDateRows = 0;
  let nonemptyRows = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row.some(value => value != null && String(value).trim())) continue;
    nonemptyRows++;
    const rawDate = get(
      row,
      sheet === "Site"
        ? ["data", "Criação do ticket - Carimbo de data/hora"]
        : [
            "created_time",
            "created_at",
            "recebimento_lead_ts",
            "Data da conversão",
            "Data",
          ]
    );
    const parsed = parseSourceDate(rawDate, sheet === "Meta");
    if (!parsed) {
      invalidDateRows++;
      continue;
    }
    const rawHour = get(row, ["Hora recebimento lead", "hora"]);
    const extractedHour = String(rawHour).match(/^(\d{1,2})(?::|h|$)/);
    const hour =
      parsed.hour ??
      (extractedHour && Number(extractedHour[1]) < 24
        ? Number(extractedHour[1])
        : null);
    const model = get(row, ["Modelo de Interesse", "Modelo", "interest_model"]);
    const dealer = cleanLabel(
      get(row, [
        "Concessionária",
        "Concessionaria",
        "loja",
        "em_qual_concessionária_gostaria_de_ser_atendido?",
        "dealership_label",
        "Em qual concessionária gostaria de ser atendido?",
      ])
    );
    leads.push({
      sourceSheet: sheet,
      sourceRow: i + 1,
      date: parsed.date,
      hour,
      name: cleanLabel(
        get(row, [
          "Nome do solicitante",
          "full_name",
          "Name",
          "Nome",
          "nomeCliente",
          "Usuario_preferred",
          "Usuario_legal",
        ])
      ),
      model: normalizeModel(model),
      version:
        cleanLabel(
          get(row, [
            "versao",
            "version",
            "qual_versão_do_mg4_você_tem_interesse?",
          ])
        ) || "Não informado",
      channel,
      campaign:
        cleanLabel(
          get(row, ["Canal / Campanha", "campaign_name", "utm_campaign"])
        ) || "Não informado",
      dealer: dealer || "Não informado",
      city:
        cleanLabel(get(row, ["Cidade", "City", "city_label", "city_tag"])) ||
        "Não informado",
      state:
        cleanLabel(
          get(row, ["Estado", "State (Province)", "state"])
        ).toUpperCase() || "Não informado",
      // Lead status is not proof of delivery to a dealer CRM.
      crm: cleanLabel(get(row, ["crm", "crm_name"])) || "Não informado",
    });
  }
  return { leads, invalidDateRows, nonemptyRows };
}
