import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(),
    query: vi.fn(),
  };
  return {
    poolExecute: vi.fn(),
    getConnection: vi.fn(() => Promise.resolve(connection)),
    connection,
    getV2Account: vi.fn(),
  };
});

vi.mock("./v2Db", () => ({
  getV2Pool: () => ({
    execute: mock.poolExecute,
    getConnection: mock.getConnection,
  }),
  getV2Account: mock.getV2Account,
}));

import {
  createV2Account,
  listV2Accounts,
  resetV2AccountPassword,
  updateV2Account,
} from "./v2Accounts";
import { createV2Token, readV2Session, verifyV2Token } from "./v2Auth";

const admin = { id: 1, username: "rodrigo", role: "admin" as const };
const client = { id: 2, username: "cliente", role: "client" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mock.getConnection.mockResolvedValue(mock.connection);
  mock.connection.beginTransaction.mockResolvedValue(undefined);
  mock.connection.commit.mockResolvedValue(undefined);
  mock.connection.rollback.mockResolvedValue(undefined);
  mock.connection.release.mockReturnValue(undefined);
  mock.getV2Account.mockReset();
});

describe("V2 account management", () => {
  it("rejects non-admin actors before any database mutation", async () => {
    await expect(
      createV2Account(
        { username: "new-client", password: "safe-pass", role: "client" },
        client
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listV2Accounts(client)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      updateV2Account({ id: 4, isActive: false }, client)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      resetV2AccountPassword({ id: 4, password: "safe-pass" }, client)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.getConnection).not.toHaveBeenCalled();
    expect(mock.poolExecute).not.toHaveBeenCalled();
  });

  it("lists only public account fields and fails closed for unknown roles", async () => {
    mock.poolExecute.mockResolvedValueOnce([
      [
        {
          id: 4,
          username: "new-client",
          role: "unexpected",
          isActive: 1,
          createdAt: new Date("2026-11-05T12:00:00Z"),
          passwordHash: "must-not-leak",
        },
      ],
      [],
    ]);
    await expect(listV2Accounts(admin)).resolves.toEqual([
      {
        id: 4,
        username: "new-client",
        role: "client",
        isActive: true,
        createdAt: "2026-11-05T12:00:00.000Z",
      },
    ]);
    expect(mock.poolExecute.mock.calls[0][0]).not.toContain("passwordHash");
  });

  it("creates a salted scrypt account and audits without secret fields", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([{ insertId: 9 }, []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            username: "new-client",
            role: "client",
            isActive: 1,
            createdAt: new Date("2026-11-05T12:00:00Z"),
          },
        ],
        [],
      ]);
    const result = await createV2Account(
      { username: " New-Client ", password: "safe-pass", role: "client" },
      admin
    );
    expect(result).not.toHaveProperty("passwordHash");
    expect(result.username).toBe("new-client");
    expect(mock.connection.execute.mock.calls[0][0]).not.toContain(
      "passwordHash=?"
    );
    expect(mock.connection.execute.mock.calls[0][1][1]).toMatch(/^scrypt\$/);
    expect(mock.connection.execute.mock.calls[1][0]).toContain(
      "v2_account_audit"
    );
    expect(mock.connection.execute.mock.calls[1][1]).toEqual([
      9,
      admin.id,
      "create",
    ]);
    expect(mock.connection.commit).toHaveBeenCalledOnce();
  });

  it("prevents removing the final active administrator inside a locked transaction", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([[{ id: 1 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            username: "rodrigo",
            role: "admin",
            isActive: 1,
            createdAt: null,
            sessionVersion: 3,
          },
        ],
        [],
      ]);
    await expect(
      updateV2Account({ id: 1, role: "client" }, admin)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mock.connection.execute.mock.calls[0][0]).toContain("FOR UPDATE");
    expect(mock.connection.commit).not.toHaveBeenCalled();
    expect(mock.connection.rollback).toHaveBeenCalledOnce();
    expect(
      mock.connection.execute.mock.calls.some(([sql]) =>
        String(sql).startsWith("UPDATE v2_accounts")
      )
    ).toBe(false);
  });

  it("changes role with a session-version bump and returns no password data", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([[{ id: 1 }, { id: 8 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 4,
            username: "new-client",
            role: "client",
            isActive: 1,
            createdAt: null,
            sessionVersion: 0,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([
        [
          {
            id: 4,
            username: "new-client",
            role: "admin",
            isActive: 1,
            createdAt: null,
          },
        ],
        [],
      ]);
    const result = await updateV2Account({ id: 4, role: "admin" }, admin);
    expect(result).toMatchObject({ id: 4, role: "admin", isActive: true });
    expect(
      mock.connection.execute.mock.calls.some(([sql]) =>
        String(sql).includes("sessionVersion=sessionVersion+1")
      )
    ).toBe(true);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("resets a password, bumps session version, and returns only success", async () => {
    mock.connection.execute
      .mockResolvedValueOnce([[{ id: 4 }], []])
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([{}, []]);
    await expect(
      resetV2AccountPassword({ id: 4, password: "another-safe-pass" }, admin)
    ).resolves.toEqual({ success: true });
    const updateCall = mock.connection.execute.mock.calls.find(([sql]) =>
      String(sql).startsWith("UPDATE v2_accounts")
    );
    expect(updateCall?.[0]).toContain("sessionVersion=sessionVersion+1");
    expect(updateCall?.[1][0]).toMatch(/^scrypt\$/);
    expect(updateCall?.[1][0]).not.toContain("another-safe-pass");
    expect(mock.connection.execute.mock.calls[2][1]).toEqual([
      4,
      admin.id,
      "reset_password",
    ]);
  });
});

describe("V2 JWT session version", () => {
  beforeEach(() => {
    vi.stubEnv("MANUS_JWT_SECRET", "unit-test-secret-only");
    vi.stubEnv("MANUS_PROJECT_ID", "project-v2-unit-test");
  });

  it("emits v on login-shaped tokens and rejects stale sessions from DB state", async () => {
    const token = await createV2Token({
      id: 1,
      username: "rodrigo",
      sessionVersion: 2,
    });
    expect(await verifyV2Token(token)).toMatchObject({
      id: 1,
      username: "rodrigo",
      sessionVersion: 2,
    });
    mock.getV2Account.mockResolvedValueOnce({
      id: 1,
      username: "rodrigo",
      isActive: 1,
      role: "admin",
      sessionVersion: 3,
      passwordHash: "fixture-only",
    });
    await expect(
      readV2Session({ headers: { cookie: `mg_v2_session=${token}` } } as any)
    ).resolves.toBeNull();
  });

  it("treats a legacy token without v as version zero and reads role from DB", async () => {
    const token = await createV2Token({ id: 1, username: "rodrigo" });
    mock.getV2Account.mockResolvedValueOnce({
      id: 1,
      username: "rodrigo",
      isActive: 1,
      role: "admin",
      sessionVersion: 0,
      passwordHash: "fixture-only",
    });
    await expect(
      readV2Session({ headers: { cookie: `mg_v2_session=${token}` } } as any)
    ).resolves.toMatchObject({ role: "admin", sessionVersion: 0 });
  });
});
