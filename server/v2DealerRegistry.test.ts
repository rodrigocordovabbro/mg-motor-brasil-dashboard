import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import type { CommercialSourceRow } from "../shared/v2Commercial";
import { normalizeDealerKey } from "../shared/dealerRegistryExtensions";
import type { V2Lead } from "../shared/v2Types";
import {
  readExtraDealerRegistry,
  registerNewUploadDealers,
} from "./v2DealerRegistry";
import { aggregateV2Leads, matchesV2LeadFilters } from "./v2Leads";

type FakeRegistryRow = {
  id: number;
  label: string;
  normalizedKey: string;
  state: string | null;
  sourceImportId: number | null;
  createdBy: number;
  createdByUsername: string;
  createdAt: Date;
};

function row(
  sourceLabel: string,
  key = sourceLabel,
  state: string | null = null,
  rawDealers: string[] = []
): CommercialSourceRow {
  return {
    key,
    sourceLabel,
    state,
    value: 1,
    rawDealers,
  };
}

function fakeExecutor(initial: FakeRegistryRow[] = []) {
  const records = new Map(initial.map(item => [item.normalizedKey, item]));
  let nextId = Math.max(0, ...initial.map(item => item.id)) + 1;
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("ORDER BY id")) return [[...records.values()], []];
    if (sql.startsWith("INSERT INTO v2_dealer_registry")) {
      const [label, normalizedKey, state, _origin, sourceImportId, createdBy, username] =
        params;
      const key = String(normalizedKey);
      if (records.has(key)) return [{ affectedRows: 0 }, []];
      records.set(key, {
        id: nextId++,
        label: String(label),
        normalizedKey: key,
        state: state == null ? null : String(state),
        sourceImportId: sourceImportId == null ? null : Number(sourceImportId),
        createdBy: Number(createdBy),
        createdByUsername: String(username),
        createdAt: new Date("2026-11-05T12:00:00.000Z"),
      });
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes("WHERE normalizedKey=?")) {
      return [[records.get(String(params[0]))], []];
    }
    throw new Error(`SQL de teste não suportado: ${sql}`);
  });
  return { executor: { execute } as unknown as PoolConnection, execute, records };
}

describe("V2 extra dealer registry", () => {
  it("lê extras com nome original e estado persistido sem tocar em transação", async () => {
    const fixture: FakeRegistryRow = {
      id: 7,
      label: "Nova Unidade/SP",
      normalizedKey: normalizeDealerKey("Nova Unidade/SP"),
      state: "SP",
      sourceImportId: 123,
      createdBy: 4,
      createdByUsername: "admin",
      createdAt: new Date("2026-11-05T10:00:00.000Z"),
    };
    const fake = fakeExecutor([fixture]);
    const result = await readExtraDealerRegistry(fake.executor);
    expect(result).toEqual([
      expect.objectContaining({
        id: 7,
        name: "Nova Unidade/SP",
        label: "Nova Unidade/SP",
        normalizedKey: normalizeDealerKey("Nova Unidade/SP"),
        state: "SP",
        sourceImportId: 123,
      }),
    ]);
    expect(fake.execute).not.toHaveBeenCalledWith(
      expect.stringMatching(/BEGIN|COMMIT|ROLLBACK/i)
    );
  });

  it("cria somente nome completo desconhecido, preserva label original e valida UF", async () => {
    const fake = fakeExecutor();
    const result = await registerNewUploadDealers(
      [
        row("  Nova Unidade São Paulo/SP  ", "new-1"),
        row("SINAL/SP", "known-official"),
        row("HG/SE", "known-collective"),
        row("GRUPO NOVO/SP", "explicit-group"),
        row("ABC/SP", "unknown-acronym"),
        row("TOTAL DEALER", "total"),
        row("   ", "blank"),
      ],
      { id: 4, username: "admin" },
      fake.executor,
      321
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toEqual(
      expect.objectContaining({
        name: "  Nova Unidade São Paulo/SP  ",
        label: "  Nova Unidade São Paulo/SP  ",
        normalizedKey: normalizeDealerKey("  Nova Unidade São Paulo/SP  "),
        state: "SP",
        sourceImportId: 321,
        createdBy: 4,
        createdByUsername: "admin",
      })
    );
    expect(result.pending).toEqual([
      expect.objectContaining({
        rowKey: "explicit-group",
        sourceLabel: "GRUPO NOVO/SP",
        reason: "explicit-group",
        state: "SP",
      }),
      expect.objectContaining({
        rowKey: "unknown-acronym",
        sourceLabel: "ABC/SP",
        reason: "unknown-group-acronym",
        state: "SP",
      }),
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowKey: "known-official", reason: "already-known" }),
        expect.objectContaining({ rowKey: "known-collective", reason: "already-known" }),
        expect.objectContaining({ rowKey: "total", reason: "total-label" }),
        expect.objectContaining({ rowKey: "blank", reason: "blank-label" }),
      ])
    );
  });

  it("não cria novamente chave repetida no mesmo upload e não inicia/finaliza transação", async () => {
    const fake = fakeExecutor();
    const result = await registerNewUploadDealers(
      [row("Dealer Novo Completo/SP", "first"), row("dealer novo completo/sp", "second")],
      { id: 9, username: "operator" },
      fake.executor,
      88
    );

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ rowKey: "second", reason: "duplicate-in-upload" })
    );
    expect(fake.execute).not.toHaveBeenCalledWith(
      expect.stringMatching(/BEGIN|COMMIT|ROLLBACK/i)
    );
  });

  it("não cadastra novo dealer quando o rótulo já existe no registry dinâmico ou tem mapping explícito", async () => {
    const fake = fakeExecutor([
      {
        id: 2,
        label: "Dealer Extra/SP",
        normalizedKey: normalizeDealerKey("Dealer Extra/SP"),
        state: "SP",
        sourceImportId: 11,
        createdBy: 1,
        createdByUsername: "seed",
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
      },
    ]);
    const result = await registerNewUploadDealers(
      [
        row("Dealer Extra/SP", "existing"),
        row("Grupo Desconhecido/SP", "mapped", null, ["Dealer Extra/SP"]),
      ],
      { id: 9, username: "operator" },
      fake.executor,
      89
    );
    expect(result.created).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowKey: "existing", reason: "already-known" }),
        expect.objectContaining({ rowKey: "mapped", reason: "explicit-mapping" }),
      ])
    );
  });

  it("mantém UF nula quando o campo e o sufixo não são válidos", async () => {
    const fake = fakeExecutor();
    const result = await registerNewUploadDealers(
      [row("Dealer Sem UF ZZ", "invalid-state", "ZZ")],
      { id: 2, username: "admin" },
      fake.executor
    );
    expect(result.created[0]?.state).toBeNull();
    expect(result.created[0]?.sourceImportId).toBeNull();
  });

  it("consolida e filtra extra no dashboard sem reescrever dealer raw do Lead", () => {
    const extra = {
      id: 3,
      name: "Dealer Novo Completo/SP",
      label: "Dealer Novo Completo/SP",
      normalizedKey: normalizeDealerKey("Dealer Novo Completo/SP"),
      state: "SP",
      sourceImportId: 90,
      createdBy: 2,
      createdByUsername: "admin",
      createdAt: "2026-11-05T12:00:00.000Z",
    };
    const lead: V2Lead = {
      id: 101,
      date: "2026-11-04",
      hour: 10,
      name: "Lead extra",
      model: "MG4",
      version: "-",
      channel: "Google Ads",
      campaign: "Extra",
      dealer: "Dealer Novo Completo/SP",
      city: "São Paulo",
      state: "SP",
      crm: "-",
    };
    const data = aggregateV2Leads(
      [lead],
      { dateFrom: "2026-11-01", dateTo: "2026-11-04" },
      null,
      {
        name: "Fixture",
        importedAt: "2026-11-05T12:00:00.000Z",
        mode: "authenticated-import",
        totalRows: 1,
        invalidDateRows: 0,
      },
      new Date("2026-11-05T15:00:00.000Z"),
      [extra]
    );

    expect(data.dealers).toEqual([{ label: "Dealer Novo Completo/SP", count: 1 }]);
    expect(data.dealerRegistry).toContainEqual({
      name: "Dealer Novo Completo/SP",
      state: "SP",
    });
    expect(data.options.dealers).toContain("Dealer Novo Completo/SP");
    expect(data.dealerPerformance.rows).toContainEqual(
      expect.objectContaining({ dealer: "Dealer Novo Completo/SP", state: "SP" })
    );
    expect(data.recent.rows[0]?.dealer).toBe("Dealer Novo Completo/SP");
    expect(
      matchesV2LeadFilters(
        lead,
        { dealer: "Dealer Novo Completo/SP" },
        [extra]
      )
    ).toBe(true);
  });
});
