import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getV2Pool: vi.fn(),
}));

vi.mock("./v2Db", () => ({ getV2Pool: mock.getV2Pool }));

import {
  CLIENT_PROFILE_MIGRATION_ID,
  migrateV2ClientProfiles,
} from "./migrateV2ClientProfiles";
import type { MigrationConnection, MigrationDb } from "./migrateV2Accounts";

function fakeDb({ alreadyApplied = false, administratorActive = true } = {}): {
  db: MigrationDb;
  connection: MigrationConnection;
  calls: Array<[string, unknown[] | undefined]>;
} {
  const calls: Array<[string, unknown[] | undefined]> = [];
  let roleUpgraded = false;
  const connection = {
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(),
    query: vi.fn(async <T = any>(sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql === "SHOW COLUMNS FROM v2_accounts") {
        return [
          [
            {
              Field: "role",
              Type: roleUpgraded
                ? "enum('admin','client','client_admin','bbro')"
                : "enum('admin','client','bbro')",
              Null: "NO",
              Default: "client",
            },
            {
              Field: "sessionVersion",
              Type: "int unsigned",
              Null: "NO",
              Default: "0",
            },
          ],
          [],
        ] as unknown as [T, any];
      }
      if (sql.startsWith("ALTER TABLE v2_accounts MODIFY COLUMN role")) {
        roleUpgraded = true;
        return [[], []] as unknown as [T, any];
      }
      if (sql.startsWith("SELECT migrationId"))
        return [
          alreadyApplied ? [{ migrationId: CLIENT_PROFILE_MIGRATION_ID }] : [],
          [],
        ] as unknown as [T, any];
      if (sql.startsWith("SELECT id FROM v2_accounts WHERE id=?"))
        return [administratorActive ? [{ id: 1 }] : [], []] as unknown as [
          T,
          any,
        ];
      if (sql.startsWith("SELECT id,role,sessionVersion"))
        return alreadyApplied
          ? ([[], []] as unknown as [T, any])
          : ([
              [{ id: 41, role: "client", sessionVersion: 7 }],
              [],
            ] as unknown as [T, any]);
      if (sql.startsWith("UPDATE v2_accounts SET role='client_admin'"))
        return [{ affectedRows: 1 }, []] as unknown as [T, any];
      return [[], []] as unknown as [T, any];
    }),
  } as unknown as MigrationConnection;
  const db = {
    getConnection: vi.fn(async () => connection),
  } as unknown as MigrationDb;
  return { db, connection, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("migrateV2ClientProfiles", () => {
  it("é exportável sem executar no import", () => {
    expect(mock.getV2Pool).not.toHaveBeenCalled();
  });

  it("converte somente clientes legados, audita e revoga a sessão sem tocar senha/status", async () => {
    const fixture = fakeDb();
    const result = await migrateV2ClientProfiles(fixture.db, 1);

    expect(result).toEqual({
      migrationId: CLIENT_PROFILE_MIGRATION_ID,
      alreadyApplied: false,
      migratedAccounts: 1,
    });
    expect(fixture.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(fixture.connection.commit).toHaveBeenCalledOnce();
    expect(fixture.connection.rollback).not.toHaveBeenCalled();
    const update = fixture.calls.find(([sql]) =>
      sql.startsWith("UPDATE v2_accounts SET role='client_admin'")
    );
    expect(update?.[0]).toContain("sessionVersion=sessionVersion+1");
    expect(update?.[0]).not.toContain("passwordHash");
    expect(update?.[0]).not.toContain("isActive");
    const audit = fixture.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO v2_account_audit")
    );
    expect(audit?.[1]).toEqual([41, 1, "update"]);
    const marker = fixture.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO v2_user_migrations")
    );
    expect(marker?.[1]).toEqual([CLIENT_PROFILE_MIGRATION_ID]);
  });

  it("é idempotente quando o marcador já existe", async () => {
    const fixture = fakeDb({ alreadyApplied: true });
    await expect(migrateV2ClientProfiles(fixture.db)).resolves.toMatchObject({
      alreadyApplied: true,
      migratedAccounts: 0,
    });
    expect(
      fixture.calls.some(([sql]) =>
        sql.startsWith("UPDATE v2_accounts SET role='client_admin'")
      )
    ).toBe(false);
    expect(fixture.connection.commit).toHaveBeenCalledOnce();
  });

  it("não altera papéis nem registra autoria fictícia sem Administrador ativo", async () => {
    const fixture = fakeDb({ administratorActive: false });
    await expect(migrateV2ClientProfiles(fixture.db, 41)).rejects.toThrow(
      "Administrador ativo"
    );
    expect(fixture.connection.rollback).toHaveBeenCalledOnce();
    expect(
      fixture.calls.some(([sql]) => sql.startsWith("UPDATE v2_accounts"))
    ).toBe(false);
    expect(
      fixture.calls.some(([sql]) =>
        sql.startsWith("INSERT INTO v2_account_audit")
      )
    ).toBe(false);
  });
});
