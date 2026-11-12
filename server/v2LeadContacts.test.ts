import { beforeEach, describe, expect, it, vi } from "vitest";
import type { V2Lead } from "../shared/v2Types";

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  getGoal: vi.fn(),
  performance: vi.fn(),
  extras: vi.fn(),
  sql: [] as string[],
}));

vi.mock("./v2Db", () => ({
  getV2Pool: () => ({ execute: state.execute, query: state.query }),
  getV2Goal: state.getGoal,
}));
vi.mock("./v2Commercial", () => ({
  getCommercialPerformance: state.performance,
}));
vi.mock("./v2DealerRegistry", () => ({
  readExtraDealerRegistry: state.extras,
}));

import {
  buildV2LeadContactsSelect,
  enrichV2LeadContacts,
  extractV2LeadContactDetails,
  V2_LEAD_CONTACTS_BATCH_SIZE,
} from "./v2LeadContacts";
import { getV2Dashboard, invalidateAnalyticalCache } from "./v2Leads";

function json(value: unknown): string {
  return JSON.stringify(value);
}

function lead(id: number, overrides: Partial<V2Lead> = {}): V2Lead {
  return {
    id,
    date: "2026-11-03",
    hour: 10,
    name: "Pessoa canônica",
    model: "MG 4",
    version: "Conforto",
    channel: "Site",
    campaign: "Campanha",
    dealer: "Dealer",
    city: "São Paulo",
    state: "SP",
    crm: "Não informado",
    ...overrides,
  };
}

function source(
  sourceSheet: string,
  headers: readonly string[],
  values: readonly unknown[],
  overrides: Record<string, unknown> = {}
) {
  return {
    sourceSheet,
    headersJson: json(headers),
    valuesJson: json(values),
    ...overrides,
  };
}

const executor = { execute: state.execute } as any;

beforeEach(() => {
  vi.clearAllMocks();
  state.sql = [];
  state.extras.mockResolvedValue([]);
  state.getGoal.mockResolvedValue(null);
  state.performance.mockImplementation(async (dashboard: unknown) => {
    return (dashboard as { dealerPerformance: unknown }).dealerPerformance;
  });
  invalidateAnalyticalCache();
});

describe("V2 opportunity detail extraction", () => {
  it("preserves aligned contacts when Sheets omits empty trailing cells", () => {
    expect(
      extractV2LeadContactDetails(
        source(
          "Site",
          [
            "E-mail do solicitante",
            "Número de telefone do solicitante",
            "Modelo de Interesse",
            "Tickets",
          ],
          ["trailing@example.invalid", "+550000000007", "MG 4"]
        )
      )
    ).toEqual({
      email: "trailing@example.invalid",
      phone: "+550000000007",
      interestVehicle: "MG 4",
    });
    expect(
      extractV2LeadContactDetails(
        source(
          "Weebmotors",
          ["email", "whatsapp"],
          ["without-phone@example.invalid"]
        )
      )
    ).toEqual({
      email: "without-phone@example.invalid",
      phone: null,
      interestVehicle: null,
    });
  });

  it.each([
    ["Interlagos", "email", "phone_e164"],
    ["Tikok", "Email", "Phone number"],
    ["Tiktok - Live", "E-mail", "Telefone"],
    ["Uol", "Email", "Telefone"],
    ["Weebmotors", "email", "whatsapp"],
  ])(
    "reads the original contact headers of %s without unrelated fields",
    (sheet, emailHeader, phoneHeader) => {
      const result = extractV2LeadContactDetails(
        source(
          sheet,
          [emailHeader, phoneHeader, "CPF", "Observação"],
          ["source@example.invalid", "+550000000003"]
        )
      );
      expect(result).toEqual({
        email: "source@example.invalid",
        phone: "+550000000003",
        interestVehicle: null,
      });
      expect(Object.keys(result).sort()).toEqual([
        "email",
        "interestVehicle",
        "phone",
      ]);
    }
  );

  it("chooses the first provided alias and does not discard duplicated headers with an empty first value", () => {
    const result = extractV2LeadContactDetails(
      source(
        "Meta",
        ["email", "email", "phone_number", "Phone"],
        ["", "duplicate@example.invalid", "", "+550000000004"]
      )
    );
    expect(result.email).toBe("duplicate@example.invalid");
    expect(result.phone).toBe("+550000000004");
  });

  it("uses source-specific aliases and preserves phone formatting", () => {
    expect(
      extractV2LeadContactDetails(
        source(
          "Site",
          [
            "Nome do solicitante",
            "E-mail do solicitante",
            "Número de telefone do solicitante",
            "Modelo de Interesse",
          ],
          [
            "Nome original completo",
            " site@example.invalid ",
            "+55 (011) 0000-0000",
            "MG Urban",
          ]
        )
      )
    ).toEqual({
      email: "site@example.invalid",
      phone: "+55 (011) 0000-0000",
      interestVehicle: "MG Urban",
    });

    expect(
      extractV2LeadContactDetails(
        source(
          "Meta",
          ["email", "phone_number", "interest_model"],
          ["meta@example.invalid", "+5511999990000", "MG4"]
        )
      )
    ).toEqual({
      email: "meta@example.invalid",
      phone: "+5511999990000",
      interestVehicle: "MG4",
    });
  });

  it("uses marketplace variants and limits Chave_2/Chave_3 to Mercado Livre", () => {
    expect(
      extractV2LeadContactDetails(
        source(
          "Mercado Livre",
          ["usuario_mail", "contato_fone"],
          ["market@example.invalid", "0011-2222"]
        )
      )
    ).toEqual({
      email: "market@example.invalid",
      phone: "0011-2222",
      interestVehicle: null,
    });

    expect(
      extractV2LeadContactDetails(
        source(
          "Mercado Livre",
          ["Chave_2", "Chave_3"],
          ["old@example.invalid", "+55011"]
        )
      )
    ).toEqual({
      email: "old@example.invalid",
      phone: "+55011",
      interestVehicle: null,
    });

    expect(
      extractV2LeadContactDetails(
        source(
          "Meta",
          ["Chave_2", "Chave_3"],
          ["must-not@example.invalid", "must-not"]
        )
      )
    ).toEqual({ email: null, phone: null, interestVehicle: null });
  });

  it("prefers explicit interest fields and otherwise uses only mapped model/version", () => {
    expect(
      extractV2LeadContactDetails(
        source(
          "Meta",
          ["ad_name", "modelo", "interest_model"],
          ["MG5 ad", "MG S5", "MG 4"]
        ),
        { model: "MG4", version: "Conforto" }
      ).interestVehicle
    ).toBe("MG 4");

    expect(
      extractV2LeadContactDetails(
        { headersJson: "[]", valuesJson: "[]" },
        { model: "MG4", version: "Conforto" }
      ).interestVehicle
    ).toBe("MG 4 · Comfort");

    expect(
      extractV2LeadContactDetails(
        source("Meta", ["ad_name"], ["MG4 unrelated campaign"]),
        { model: "modelo desconhecido", version: "Não informado" }
      ).interestVehicle
    ).toBeNull();
  });

  it("fails closed on malformed provenance and returns only whitelisted values", () => {
    const malformed = extractV2LeadContactDetails({
      sourceSheet: "Site",
      headersJson: '{"email":"not-an-array"}',
      valuesJson: json(["<script>payload-secret</script>"]),
      model: "MG4",
      version: "Conforto",
    });
    expect(malformed).toEqual({
      email: null,
      phone: null,
      interestVehicle: null,
    });
    expect(JSON.stringify(malformed)).not.toContain("payload-secret");

    const extracted = extractV2LeadContactDetails(
      source("Meta", ["email"], ["escaped <b>value</b>"])
    );
    expect(extracted).toEqual({
      email: "escaped <b>value</b>",
      phone: null,
      interestVehicle: null,
    });
    expect(Object.keys(extracted).sort()).toEqual([
      "email",
      "interestVehicle",
      "phone",
    ]);
  });

  it("returns canonical fallback details when provenance is absent", () => {
    expect(
      extractV2LeadContactDetails(
        { sourceSheet: "Meta", model: "MG4", version: "X-Power" },
        { model: "MG4", version: "X-Power" }
      )
    ).toEqual({ email: null, phone: null, interestVehicle: "MG 4 · XPOWER" });
  });
});

describe("V2 opportunity detail enrichment", () => {
  it("matches same-named opportunities by ID, preserves order, and uses one parameterized page query", async () => {
    const rows = [lead(101, { name: "Pessoa" }), lead(102, { name: "Pessoa" })];
    state.execute.mockResolvedValueOnce([
      [
        source(
          "Meta",
          ["email", "phone_number", "interest_model"],
          ["two@example.invalid", "+2", "MG S5"],
          { id: 102 }
        ),
        source(
          "Meta",
          ["email", "phone_number", "interest_model"],
          ["one@example.invalid", "+1", "MG 4"],
          { id: 101 }
        ),
      ],
      [],
    ]);

    const result = await enrichV2LeadContacts(rows, executor);

    expect(result.map(row => row.id)).toEqual([101, 102]);
    expect(
      result.map(row => [row.email, row.phone, row.interestVehicle])
    ).toEqual([
      ["one@example.invalid", "+1", "MG 4"],
      ["two@example.invalid", "+2", "MG S5"],
    ]);
    expect(result.map(row => row.name)).toEqual(["Pessoa", "Pessoa"]);
    expect(state.execute).toHaveBeenCalledOnce();
    const [sql, ids] = state.execute.mock.calls[0];
    expect(sql).toContain(
      "LEFT JOIN v2_lead_sync_rows r ON r.sourceId=1 AND r.leadId=l.id"
    );
    expect(sql).toContain("WHERE l.id IN (?,?)");
    expect(sql).not.toContain("payloadJson");
    expect(sql).not.toContain("l.name");
    expect(ids).toEqual([101, 102]);
  });

  it("validates IDs and bounds batches at fifty without discarding invalid rows", async () => {
    const rows = [
      ...Array.from({ length: 51 }, (_, index) => lead(index + 1)),
      lead(0),
      lead(Number.NaN),
    ];
    state.execute.mockImplementation(async (_sql: string, ids: number[]) => [
      ids.map(id =>
        source("Meta", ["email"], [`person-${id}@example.invalid`], { id })
      ),
      [],
    ]);

    const result = await enrichV2LeadContacts(rows, executor);

    expect(state.execute).toHaveBeenCalledTimes(2);
    expect(
      state.execute.mock.calls.every(
        ([, ids]) => ids.length <= V2_LEAD_CONTACTS_BATCH_SIZE
      )
    ).toBe(true);
    expect(result).toHaveLength(53);
    expect(result[0].email).toBe("person-1@example.invalid");
    expect(result[50].email).toBe("person-51@example.invalid");
    expect(result[51].email).toBeNull();
    expect(result[52].email).toBeNull();
  });

  it("propagates database errors without logging or replacing them", async () => {
    state.execute.mockRejectedValueOnce(
      new Error("contact lookup unavailable")
    );
    await expect(enrichV2LeadContacts([lead(1)], executor)).rejects.toThrow(
      "contact lookup unavailable"
    );
  });

  it("builds only placeholder-based ID predicates", () => {
    expect(buildV2LeadContactsSelect(3)).toContain("WHERE l.id IN (?,?,?)");
    expect(buildV2LeadContactsSelect(3)).not.toContain("1,2,3");
    expect(() => buildV2LeadContactsSelect(0)).toThrow();
    expect(() => buildV2LeadContactsSelect(51)).toThrow();
  });
});

describe("getV2Dashboard integration", () => {
  it("enriches only the canonical recent page and leaves aggregates unchanged", async () => {
    state.query.mockResolvedValue([
      [
        {
          name: "LEADS MG — Base",
          importedAt: "2026-11-05T12:00:00Z",
          totalRows: 1,
          invalidDateRows: 0,
          inputSha256: "fixture-v1",
          earliestLeadDate: "2026-11-03",
          latestLeadDate: "2026-11-03",
        },
      ],
      [],
    ]);
    const raw = {
      id: 501,
      date: "2026-11-03",
      hour: 10,
      name: "Pessoa canônica",
      model: "MG4",
      version: "Conforto",
      channel: "Site",
      campaign: "Campanha",
      dealer: "Dealer",
      city: "São Paulo",
      state: "SP",
      crm: "Não informado",
      sourceSheet: "Site",
      headersJson: json([
        "data",
        "Modelo de Interesse",
        "Concessionária",
        "Nome do solicitante",
        "E-mail do solicitante",
        "Número de telefone do solicitante",
      ]),
      valuesJson: json([
        "03/11/2026",
        "MG4",
        "Dealer",
        "Pessoa original completa",
        "owner@example.invalid",
        "+55 (11) 0000-0000",
      ]),
      sourceTimestampRaw: "03/11/2026",
    };
    state.execute.mockImplementation(async (sql: string, ids: number[]) => {
      state.sql.push(sql);
      if (sql.includes("LIMIT 1000 OFFSET 0")) return [[raw], []];
      if (sql.includes("WHERE l.id IN"))
        return [
          [
            {
              id: ids[0],
              sourceSheet: "Site",
              model: "MG4",
              version: "Conforto",
              headersJson: raw.headersJson,
              valuesJson: raw.valuesJson,
            },
          ],
          [],
        ];
      throw new Error("unexpected query shape");
    });

    const result = await getV2Dashboard({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
      page: 1,
    });

    expect(result.summary.total).toBe(1);
    expect(result.recent.total).toBe(1);
    expect(result.recent.page).toBe(1);
    expect(result.recent.rows).toHaveLength(1);
    expect(result.recent.rows[0]).toMatchObject({
      id: 501,
      name: "Pessoa canônica",
      email: "owner@example.invalid",
      phone: "+55 (11) 0000-0000",
      interestVehicle: "MG4",
    });
    expect(result.recent.rows[0]).not.toHaveProperty("headersJson");
    expect(result.recent.rows[0]).not.toHaveProperty("valuesJson");
    expect(state.sql.filter(sql => sql.includes("WHERE l.id IN")).length).toBe(
      1
    );
    expect(
      state.sql.filter(sql => sql.includes("LIMIT 1000 OFFSET 0")).length
    ).toBe(1);
  });

  it("does not issue a contact query for an unconfigured source or an empty recent page", async () => {
    state.query.mockResolvedValue([
      [
        {
          name: "LEADS MG — Base",
          importedAt: null,
          totalRows: 0,
          invalidDateRows: 0,
          inputSha256: "",
          earliestLeadDate: null,
          latestLeadDate: null,
        },
      ],
      [],
    ]);
    state.execute.mockResolvedValue([[], []]);

    const result = await getV2Dashboard({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-04",
    });

    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.recent.rows).toEqual([]);
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(
      state.execute.mock.calls.some(([sql]) =>
        String(sql).includes("WHERE l.id IN")
      )
    ).toBe(false);
  });
});
