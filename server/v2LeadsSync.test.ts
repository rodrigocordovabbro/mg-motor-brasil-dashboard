import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  type Lead = {
    id: number;
    sourceSheet: string;
    sourceRow: number;
    leadDate: string;
    leadHour: number | null;
    name: string;
    model: string;
    version: string;
    channel: string;
    campaign: string;
    dealer: string;
    city: string;
    state: string;
    crm: string;
  };
  type Sync = {
    rowHash: string;
    sourceIdRaw: string;
    sourceTimestampRaw: string;
    rawModel: string;
    rawDealer: string;
    headersJson: string;
    valuesJson: string;
    payloadJson: string;
  };
  const state: {
    source: Record<string, unknown>;
    leads: Map<string, Lead>;
    sync: Map<string, Sync>;
    nextId: number;
    failSource: boolean;
  } = {
    source: {
      id: 1,
      spreadsheetId: "sheet-test",
      importedAt: new Date("2026-11-05T12:00:00Z"),
      totalRows: 0,
      invalidDateRows: 0,
      inputSha256: "",
    },
    leads: new Map(),
    sync: new Map(),
    nextId: 1,
    failSource: false,
  };
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (state.failSource && sql.includes("FROM v2_sources"))
        throw new Error("db failure");
      if (sql.includes("SELECT id,spreadsheetId,importedAt"))
        return [[state.source], []];
      if (sql.includes("SELECT id FROM v2_lead_imports")) return [[], []];
      if (sql.includes("INSERT INTO v2_lead_imports"))
        return [{ insertId: 99 }, []];
      if (sql.includes("SELECT l.id AS leadId")) {
        return [
          [...state.leads.values()].map(lead => ({
            ...lead,
            leadId: lead.id,
            ...(state.sync.get(`${lead.sourceSheet}\u0000${lead.sourceRow}`) ??
              {}),
          })),
          [],
        ];
      }
      if (sql.includes("INSERT INTO v2_leads")) {
        for (let offset = 0; offset < params.length; offset += 13) {
          const [
            sourceSheet,
            sourceRow,
            leadDate,
            leadHour,
            name,
            model,
            version,
            channel,
            campaign,
            dealer,
            city,
            stateValue,
            crm,
          ] = params.slice(offset, offset + 13);
          const key = `${String(sourceSheet)}\u0000${Number(sourceRow)}`;
          const id = state.leads.get(key)?.id ?? state.nextId++;
          state.leads.set(key, {
            id,
            sourceSheet: String(sourceSheet),
            sourceRow: Number(sourceRow),
            leadDate: String(leadDate),
            leadHour: leadHour == null ? null : Number(leadHour),
            name: String(name),
            model: String(model),
            version: String(version),
            channel: String(channel),
            campaign: String(campaign),
            dealer: String(dealer),
            city: String(city),
            state: String(stateValue),
            crm: String(crm),
          });
        }
        return [{ affectedRows: params.length / 13 }, []];
      }
      if (sql.includes("INSERT INTO v2_lead_sync_history")) return [{}, []];
      if (sql.includes("INSERT INTO v2_lead_sync_rows")) {
        for (let offset = 0; offset < params.length; offset += 13) {
          const [
            sourceId,
            sheet,
            sourceRow,
            leadId,
            sourceIdRaw,
            timestamp,
            rawModel,
            rawDealer,
            rowHash,
            headersJson,
            valuesJson,
            payloadJson,
          ] = params.slice(offset, offset + 13);
          state.sync.set(`${String(sheet)}\u0000${Number(sourceRow)}`, {
            rowHash: String(rowHash),
            sourceIdRaw: String(sourceIdRaw),
            sourceTimestampRaw: String(timestamp),
            rawModel: String(rawModel),
            rawDealer: String(rawDealer),
            headersJson: String(headersJson),
            valuesJson: String(valuesJson),
            payloadJson: String(payloadJson),
          });
          void sourceId;
          void leadId;
        }
        return [{}, []];
      }
      if (sql.includes("SELECT COUNT(*) AS totalRows")) {
        const leads = [...state.leads.values()];
        return [
          [
            {
              totalRows: leads.length,
              latestLeadDate:
                leads
                  .map(lead => lead.leadDate)
                  .sort()
                  .at(-1) ?? null,
            },
          ],
          [],
        ];
      }
      if (sql.includes("SELECT sourceSheet AS name")) {
        const grouped = new Map<string, Lead[]>();
        for (const lead of state.leads.values())
          grouped.set(lead.sourceSheet, [
            ...(grouped.get(lead.sourceSheet) ?? []),
            lead,
          ]);
        return [
          [...grouped].map(([name, leads]) => ({
            name,
            count: leads.length,
            minDate: leads.map(lead => lead.leadDate).sort()[0],
            maxDate: leads
              .map(lead => lead.leadDate)
              .sort()
              .at(-1),
          })),
          [],
        ];
      }
      if (sql.includes("UPDATE v2_sources")) {
        state.source.inputSha256 = params[3];
        state.source.importedAt = new Date(params[0] as Date);
        state.source.totalRows = params[1];
        return [{}, []];
      }
      return [[], []];
    }),
  };
  const pool = { getConnection: vi.fn(async () => connection) };
  return { state, connection, pool };
});

vi.mock("./v2Db", () => ({ getV2Pool: () => mock.pool }));

import { importLeadsSnapshot } from "./v2LeadsSync";

const actor = { id: 7, username: "rodrigo" };
const metaHeaders = [
  "Modelo",
  "id",
  "created_time",
  "qual_versão_do_mg4_você_tem_interesse?_",
  "em_qual_concessionária_gostaria_de_ser_atendido?_",
  "full_name",
  "Cidade",
  "Estado",
];
const siteHeaders = ["data", "Modelo de Interesse", "Concessionária", "Nome"];
const meta = (...rows: unknown[][]) => ({
  range: "Meta!A:W",
  values: [metaHeaders, ...rows],
});
const site = (...rows: unknown[][]) => ({
  range: "Site!A:W",
  values: [siteHeaders, ...rows],
});

beforeEach(() => {
  mock.state.leads.clear();
  mock.state.sync.clear();
  mock.state.nextId = 1;
  mock.state.failSource = false;
  mock.state.source.inputSha256 = "";
  mock.state.source.importedAt = new Date("2026-11-05T12:00:00Z");
  vi.clearAllMocks();
});

describe("v2 Leads sync service", () => {
  it("upserts physical occurrences, preserves raw fields, and does not delete absent channels", async () => {
    const first = await importLeadsSnapshot(
      {
        spreadsheetId: "sheet-test",
        valueRanges: [
          meta(
            [
              "MG4_RAW__",
              "same-id",
              "7/19/26 10:15",
              "v1",
              "Dealer_RAW__",
              "A",
              "SP",
              "SP",
            ],
            [
              "MG5_RAW__",
              "same-id",
              "7/20/26 11:15",
              "v2",
              "Dealer_TWO__",
              "B",
              "RJ",
              "RJ",
            ]
          ),
          site(["05/11/2026", "SiteModel", "SiteDealer", "C"]),
        ],
      },
      actor,
      "server"
    );
    expect(first).toMatchObject({
      changed: true,
      inserted: 3,
      updated: 0,
      totalRows: 3,
    });
    const firstPhysicalId = mock.state.leads.get("Meta\u00002")?.id;
    expect(mock.state.leads.get("Meta\u00002")?.model).toBe("MG4_RAW__");
    expect(mock.state.leads.get("Meta\u00002")?.dealer).toBe("Dealer_RAW__");

    const second = await importLeadsSnapshot(
      {
        spreadsheetId: "sheet-test",
        valueRanges: [
          meta(
            [
              "MG4_RAW__",
              "same-id",
              "7/19/26 10:15",
              "v1",
              "Dealer_RAW__",
              "A",
              "SP",
              "SP",
            ],
            [
              "MG5_CHANGED__",
              "same-id",
              "7/21/26 12:15",
              "v3",
              "Dealer_CHANGED__",
              "B",
              "RJ",
              "RJ",
            ]
          ),
        ],
      },
      actor,
      "server"
    );
    expect(second).toMatchObject({
      changed: true,
      inserted: 0,
      updated: 1,
      totalRows: 3,
    });
    expect(mock.state.leads.get("Meta\u00002")?.id).toBe(firstPhysicalId);
    expect(mock.state.leads.get("Meta\u00003")?.model).toBe("MG5_CHANGED__");
    expect(mock.state.leads.get("Meta\u00003")?.dealer).toBe(
      "Dealer_CHANGED__"
    );
    expect(second.sourceCounts).toEqual([
      expect.objectContaining({ name: "Meta", count: 2 }),
      expect.objectContaining({ name: "Site", count: 1 }),
    ]);
  });

  it("is a no-op for an identical current SHA and keeps importedAt unchanged", async () => {
    const snapshot = {
      spreadsheetId: "sheet-test",
      valueRanges: [
        meta(["MG4_RAW", "id-1", "7/19/26", "v", "Dealer", "A", "SP", "SP"]),
      ],
    };
    const first = await importLeadsSnapshot(snapshot, actor, "server");
    const importedAt = first.importedAt;
    const insertsBefore = mock.connection.execute.mock.calls.filter(call =>
      String(call[0]).includes("INSERT INTO v2_leads")
    ).length;
    const second = await importLeadsSnapshot(snapshot, actor, "server");
    expect(second.changed).toBe(false);
    expect(second.importedAt).toBe(importedAt);
    expect(second.inserted).toBe(0);
    expect(
      mock.connection.execute.mock.calls.filter(call =>
        String(call[0]).includes("INSERT INTO v2_leads")
      ).length
    ).toBe(insertsBefore);
  });

  it("rolls back a database failure without exposing driver details", async () => {
    mock.state.failSource = true;
    await expect(
      importLeadsSnapshot(
        {
          spreadsheetId: "sheet-test",
          valueRanges: [meta(["MG4", "id-1", "7/19/26"])],
        },
        actor,
        "server"
      )
    ).rejects.toThrow("Nenhuma alteração foi confirmada");
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
    expect(mock.connection.commit).not.toHaveBeenCalled();
  });
});
