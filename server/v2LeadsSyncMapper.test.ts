import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  canonicalizeLeadsSyncValues,
  normalizeLeadsSyncRangeSheet,
  prepareLeadsSnapshot,
} from "./v2LeadsSyncMapper";

const metaHeaders = [
  "Modelo",
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "is_organic",
  "platform",
  "qual_versão_do_mg4_você_tem_interesse?_",
  "como_gostaria_de_ser_contatado?_",
  "em_qual_concessionária_gostaria_de_ser_atendido?_",
  "full_name",
  "phone_number",
  "email",
  "retailer_item_id",
  "lead_status",
  "Cidade",
  "Estado",
];

function metaRow(overrides: Record<number, unknown> = [] as never) {
  const row: unknown[] = Array.from({ length: 23 }, () => "");
  row[0] = "MG4_RAW__exact";
  row[1] = "same-original-id";
  row[2] = "7/19/26 10:15";
  row[13] = "MG4 Urban version";
  row[15] = "Dealer_RAW__exact";
  row[16] = "Pessoa de teste";
  row[20] = "Novo";
  row[21] = "São Paulo";
  row[22] = "SP";
  Object.entries(overrides).forEach(([index, value]) => {
    row[Number(index)] = value;
  });
  return row;
}

describe("v2 Leads sync mapper", () => {
  it("maps the real Meta headers, including the trailing underscore alias", () => {
    const prepared = prepareLeadsSnapshot([
      { range: "'Meta'!A:W", values: [metaHeaders, metaRow()] },
    ]);
    const row = prepared.rows[0];
    expect(row.sourceSheet).toBe("Meta");
    expect(row.sourceRow).toBe(2);
    expect(row.leadDate).toBe("2026-07-19");
    expect(row.leadHour).toBe(10);
    expect(row.rawModel).toBe("MG4_RAW__exact");
    expect(row.rawDealer).toBe("Dealer_RAW__exact");
    expect(row.sourceIdRaw).toBe("same-original-id");
    expect(row.sourceTimestampRaw).toBe("7/19/26 10:15");
    expect(row.city).toBe("São Paulo");
    expect(row.state).toBe("SP");
    expect(row.payloadJson).toContain("phone_number");
    expect(row.payloadJson).toContain("São Paulo");
  });

  it("keeps repeated source IDs as separate physical occurrences", () => {
    const prepared = prepareLeadsSnapshot([
      {
        range: "Meta!A:W",
        values: [
          metaHeaders,
          metaRow(),
          metaRow({ 0: "SECOND_RAW", 2: "7/20/26" }),
        ],
      },
    ]);
    expect(prepared.rows.map(row => [row.sourceIdRaw, row.sourceRow])).toEqual([
      ["same-original-id", 2],
      ["same-original-id", 3],
    ]);
    expect(prepared.rows[0].rowHash).not.toBe(prepared.rows[1].rowHash);
  });

  it("rejects any non-empty row with an invalid date before import", () => {
    expect(() =>
      prepareLeadsSnapshot([
        {
          range: "Meta!A:W",
          values: [metaHeaders, metaRow({ 2: "31/02/2026" })],
        },
      ])
    ).toThrow("data inválida");
  });

  it("rejects a source with no required date header and excludes Página10", () => {
    expect(() =>
      prepareLeadsSnapshot([
        { range: "Meta!A:W", values: [["Modelo"], ["MG4"]] },
      ])
    ).toThrow("cabeçalho obrigatório");
    expect(() =>
      prepareLeadsSnapshot([
        { range: "Página10!A:W", values: [["anything"], ["anything"]] },
      ])
    ).toThrow("abas autorizadas");
  });

  it("ignores trailing empty rendered cells when hashing but preserves them in payload", () => {
    const first = prepareLeadsSnapshot([
      { range: "Meta!A:W", values: [metaHeaders, metaRow()] },
    ]);
    const second = prepareLeadsSnapshot([
      {
        range: "Meta!A:W",
        values: [metaHeaders.concat("", ""), metaRow().concat("", "")],
      },
    ]);
    expect(second.inputSha256).toBe(first.inputSha256);
    expect(second.rows[0].rawValues).toHaveLength(25);
    expect(canonicalizeLeadsSyncValues([["a", "", ""], ["b"]])).toEqual([
      ["a"],
      ["b"],
    ]);
  });

  it("parses quoted sheet names without changing the physical sheet identity", () => {
    expect(normalizeLeadsSyncRangeSheet("'Tiktok - Live'!A:W")).toBe(
      "Tiktok - Live"
    );
  });
});

it("usa data operacional do Site, preservando timestamp e ID de ticket originais", () => {
  const p = prepareLeadsSnapshot([
    {
      range: "Site!A:X",
      values: [
        [
          "ID do ticket",
          "Criação do ticket - Carimbo de data/hora",
          "data",
          "Modelo de Interesse",
          "Concessionária",
        ],
        [
          "ticket-007",
          "Wed Jul 01 2026 15:40:00 GMT-0300",
          "01/07/2026",
          " MG_4__raw ",
          " Dealer__raw ",
        ],
      ],
    },
  ]);
  expect(p.rows[0]).toMatchObject({
    sourceIdRaw: "ticket-007",
    sourceTimestampRaw: "Wed Jul 01 2026 15:40:00 GMT-0300",
    leadDate: "2026-07-01",
    rawModel: " MG_4__raw ",
    rawDealer: " Dealer__raw ",
  });
});
it("preserva ID Webmotors e não interpreta lead_status como CRM", () => {
  const p = prepareLeadsSnapshot([
    {
      range: "Weebmotors!A:Z",
      values: [
        ["idLead", "recebimento_lead_ts", "modelo", "loja", "lead_status"],
        ["web-009", "2026-11-05T12:00:00-03:00", "4", "Dealer", "COMPLETED"],
      ],
    },
  ]);
  expect(p.rows[0].sourceIdRaw).toBe("web-009");
  expect(p.rows[0].crm).toBe("Não informado");
});

it("inclui posições físicas no hash quando há linhas vazias no meio da fonte", () => {
  const before = prepareLeadsSnapshot([
    { range: "Meta!A:W", values: [metaHeaders, metaRow()] },
  ]);
  const moved = prepareLeadsSnapshot([
    { range: "Meta!A:W", values: [metaHeaders, [], metaRow()] },
  ]);
  expect(moved.rows[0].sourceRow).toBe(3);
  expect(moved.inputSha256).not.toBe(before.inputSha256);
});

it("emite exatamente o hash canônico anterior sem criar um JSON de todo o workbook", () => {
  const prepared = prepareLeadsSnapshot([
    {
      range: "Meta!A:W",
      values: [
        metaHeaders.concat("", ""),
        metaRow().concat("", ""),
        [],
        metaRow({ 16: "Outra pessoa de teste", 2: "7/20/26" }),
      ],
    },
    {
      range: "Site!A:E",
      values: [
        ["data", "Modelo de Interesse", "Concessionária"],
        ["01/07/2026", "MG4", "Dealer"],
      ],
    },
  ]);
  const trim = (values: readonly unknown[]) => {
    const result = [...values];
    while (
      result.length &&
      (result.at(-1) == null || String(result.at(-1)).trim() === "")
    )
      result.pop();
    return result;
  };
  const previous = prepared.sources
    .slice()
    .sort((a, b) => a.sourceSheet.localeCompare(b.sourceSheet))
    .map(source => ({
      sourceSheet: source.sourceSheet,
      ...(source.rows.some((r, i) => r.sourceRow !== i + 2)
        ? { physicalRows: source.rows.map(r => r.sourceRow) }
        : {}),
      headers: trim(source.headers),
      values: canonicalizeLeadsSyncValues([
        source.headers,
        ...source.rows.map(r => r.rawValues),
      ]),
    }));
  expect(prepared.inputSha256).toBe(
    createHash("sha256").update(JSON.stringify(previous)).digest("hex")
  );
});

it("mantém payload completo acessível mas não retém uma string duplicada por linha", () => {
  const row = prepareLeadsSnapshot([
    { range: "Meta!A:W", values: [metaHeaders, metaRow()] },
  ]).rows[0];
  const descriptor = Object.getOwnPropertyDescriptor(row, "payloadJson");
  expect(descriptor?.get).toBeTypeOf("function");
  expect(descriptor?.value).toBeUndefined();
  expect(JSON.parse(row.payloadJson)).toMatchObject({
    sourceSheet: "Meta",
    sourceRow: 2,
    headers: metaHeaders,
    values: metaRow(),
  });
});
