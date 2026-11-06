import { beforeEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
const mock = vi.hoisted(() => ({
  imports: [] as any[],
  audits: [] as any[],
  pool: null as any,
}));
const sourceRows = [
  {
    key: "a",
    sourceLabel: "STEFANINI CAMPINAS",
    state: "SP",
    value: 7,
    rawDealers: ["Stefanini Campinas"],
  },
];
vi.mock("./v2Db", () => ({ getV2Pool: () => mock.pool }));
vi.mock("./v2CommercialParser", async () => {
  const actual = await vi.importActual<any>("./v2CommercialParser");
  return {
    ...actual,
    parseCommercialWorkbook: vi.fn(async () => ({
      kind: "sales-goals",
      competence: "2026-11",
      asOf: null,
      sourceWeek: null,
      fileName: "fixture.xlsx",
      fileSha256: "a".repeat(64),
      rows: [
        {
          key: "a",
          sourceLabel: "STEFANINI CAMPINAS",
          state: "SP",
          value: 7,
          rawDealers: ["Stefanini Campinas"],
        },
      ],
      total: 7,
      warnings: [],
    })),
  };
});
import { commitCommercialUpload, readCommercialStatus } from "./v2Commercial";
beforeEach(() => {
  const hash = createHash("sha256")
    .update(JSON.stringify([["a", ["Stefanini Campinas"]]]))
    .update("")
    .digest("hex");
  const base = {
    kind: "sales-goals",
    competence: "2026-11",
    asOf: null,
    sourceWeek: null,
    asOfKey: "",
    fileName: "fixture.xlsx",
    rowCount: 1,
    warningsJson: "[]",
    importedAt: "2026-11-04T12:00:00Z",
  };
  mock.imports = [
    {
      ...base,
      id: 11,
      fileSha256: "a".repeat(64),
      mappingSha256: hash,
      total: 7,
      rowsJson: JSON.stringify(sourceRows),
      removedAt: null,
    },
    {
      ...base,
      id: 12,
      fileSha256: "b".repeat(64),
      mappingSha256: "other",
      total: 9,
      rowsJson: JSON.stringify(sourceRows),
      removedAt: "2026-11-05T12:00:00Z",
    },
  ];
  mock.audits = [];
  const execute = vi.fn(async (sql: string, args: any[] = []) => {
    if (sql.startsWith("SELECT DISTINCT BINARY dealer"))
      return [[{ dealer: "Stefanini Campinas", state: "SP" }], []];
    if (sql.includes("WHERE i.kind=? AND i.competence=? AND i.fileSha256=?"))
      return [
        mock.imports.filter(
          row => row.fileSha256 === args[2] && row.mappingSha256 === args[4]
        ),
        [],
      ];
    if (sql.includes("WHERE i.kind=? AND i.competence=? ORDER BY i.id DESC"))
      return [[mock.imports.at(-1)], []];
    if (sql.startsWith("SELECT id FROM v2_commercial_imports"))
      return [mock.imports.filter(row => row.fileSha256 === args[2]), []];
    if (sql.startsWith("INSERT INTO v2_commercial_imports")) {
      const id = mock.imports.at(-1).id + 1;
      mock.imports.push({
        ...base,
        id,
        kind: args[0],
        competence: args[1],
        asOf: args[2],
        sourceWeek: args[3],
        asOfKey: args[4],
        fileName: args[5],
        fileSha256: args[6],
        mappingSha256: args[7],
        total: args[8],
        rowCount: args[9],
        rowsJson: args[10],
        warningsJson: args[11],
        removedAt: null,
      });
      return [{ insertId: id }, []];
    }
    if (sql.startsWith("INSERT INTO v2_commercial_import_audit")) {
      mock.audits.push(args);
      return [{ insertId: mock.audits.length }, []];
    }
    if (sql.includes("WHERE i.competence=?"))
      return [[...mock.imports].reverse(), []];
    throw new Error(`Consulta não prevista no fixture: ${sql}`);
  });
  const connection = {
    execute,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  mock.pool = { execute, getConnection: async () => connection };
});
it("restaura arquivo antigo como nova versão ativa e não duplica ao reenviar", async () => {
  const old = JSON.stringify(mock.imports.slice(0, 2));
  const input = {
    kind: "sales-goals" as const,
    competence: "2026-11",
    fileName: "fixture.xlsx",
    base64: "AA==",
  };
  const actor = { id: 77, username: "fixture-admin", role: "admin" as const };
  const restored = await commitCommercialUpload(input, actor);
  expect(restored.importId).toBe(13);
  expect(restored.alreadyImported).toBe(false);
  const status = await readCommercialStatus("2026-11");
  expect(status.files.find(file => file.kind === "sales-goals")?.id).toBe(13);
  expect(
    status.files.find(file => file.kind === "sales-goals")?.configured
  ).toBe(true);
  expect(JSON.stringify(mock.imports.slice(0, 2))).toBe(old);
  expect(mock.audits.map(entry => entry[3])).toContain("reactivated");
  const repeat = await commitCommercialUpload(input, actor);
  expect(repeat.importId).toBe(13);
  expect(repeat.alreadyImported).toBe(true);
  expect(mock.imports).toHaveLength(3);
  expect(mock.audits).toHaveLength(1);
});
