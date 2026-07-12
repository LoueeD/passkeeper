import { describe, expect, it } from "vitest";
import type { AuthenticatorTransport } from "@passkeeper/core";
import { d1Adapter, type D1DatabaseLike, type D1PreparedStatementLike } from "../src/index";

describe("d1Adapter", () => {
  it("keeps a reference to the D1 database binding", () => {
    const database = createFakeD1();

    expect(d1Adapter(database).database).toBe(database);
  });

  it("rejects invalid D1 database bindings", () => {
    expect(() => d1Adapter(null as unknown as D1DatabaseLike)).toThrow(
      "D1 database binding must provide a prepare(query) function.",
    );
    expect(() => d1Adapter({} as D1DatabaseLike)).toThrow(
      "D1 database binding must provide a prepare(query) function.",
    );
  });

  it("creates and consumes challenges", async () => {
    const database = createFakeD1({
      firstRows: [
        {
          id: "challenge_123",
          user_id: "user_123",
          type: "registration",
          challenge: "challenge-value",
          expires_at: "2026-01-01T00:05:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const adapter = d1Adapter(database);

    await expect(
      adapter.createChallenge({
        id: "challenge_123",
        userId: "user_123",
        type: "registration",
        challenge: "challenge-value",
        expiresAt: new Date("2026-01-01T00:05:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      id: "challenge_123",
    });
    await expect(adapter.consumeChallenge("challenge_123")).resolves.toEqual({
      id: "challenge_123",
      userId: "user_123",
      type: "registration",
      challenge: "challenge-value",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(database.calls.map((call) => call.kind)).toEqual(["run", "first"]);
    expect(database.calls[0]?.values).toEqual([
      "challenge_123",
      "user_123",
      "registration",
      "challenge-value",
      "2026-01-01T00:05:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
    expect(database.calls[1]?.query).toContain("delete from passkeeper_challenges");
    expect(database.calls[1]?.query).toContain("returning id, user_id, type, challenge");
  });

  it("creates and reads users", async () => {
    const database = createFakeD1({
      firstRows: [
        {
          id: "user_123",
          username: "jane@example.com",
          display_name: "Jane",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "user_123",
          username: "jane@example.com",
          display_name: "Jane",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const adapter = d1Adapter(database);
    const user = {
      id: "user_123",
      username: "jane@example.com",
      displayName: "Jane",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    await expect(adapter.createUser(user)).resolves.toEqual(user);
    await expect(adapter.getUser("user_123")).resolves.toEqual(user);
    await expect(adapter.getUserByUsername("jane@example.com")).resolves.toEqual(user);

    expect(database.calls[0]?.values).toEqual([
      "user_123",
      "jane@example.com",
      "Jane",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("creates, reads, lists, and updates credentials", async () => {
    const credentialRow = {
      id: "credential_123",
      user_id: "user_123",
      credential_id: "credential-id",
      public_key: "public-key",
      counter: 42,
      transports: JSON.stringify(["internal", "hybrid", "future-value"]),
      backed_up: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      last_used_at: "2026-01-01T00:01:00.000Z",
    };
    const database = createFakeD1({
      firstRows: [credentialRow, { credential_id: "credential-id" }],
      allResults: [[credentialRow]],
    });
    const adapter = d1Adapter(database);
    const transports: AuthenticatorTransport[] = ["internal", "hybrid"];
    const credential = {
      id: "credential_123",
      userId: "user_123",
      credentialId: "credential-id",
      publicKey: "public-key",
      counter: 42,
      transports,
      backedUp: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastUsedAt: new Date("2026-01-01T00:01:00.000Z"),
    };

    await expect(adapter.createCredential(credential)).resolves.toEqual(credential);
    await expect(adapter.getCredential("credential-id")).resolves.toEqual(credential);
    await expect(adapter.listCredentials("user_123")).resolves.toEqual([credential]);
    await expect(
      adapter.updateCredentialCounter({
        credentialId: "credential-id",
        previousCounter: 42,
        counter: 43,
        lastUsedAt: new Date("2026-01-01T00:02:00.000Z"),
      }),
    ).resolves.toBe(true);

    expect(database.calls[0]?.values).toEqual([
      "credential_123",
      "user_123",
      "credential-id",
      "public-key",
      42,
      JSON.stringify(["internal", "hybrid"]),
      1,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:01:00.000Z",
    ]);
    expect(database.calls.at(-1)?.values).toEqual([
      43,
      "2026-01-01T00:02:00.000Z",
      "credential-id",
      42,
    ]);
    expect(database.calls.at(-1)?.query).toContain("and counter = ?");
    expect(database.calls.at(-1)?.query).toContain("returning credential_id");
  });

  it("ignores invalid optional credential metadata from D1 rows", async () => {
    const credentialRow = {
      id: "credential_123",
      user_id: "user_123",
      credential_id: "credential-id",
      public_key: "public-key",
      counter: 42,
      transports: "{",
      backed_up: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      last_used_at: null,
    };
    const adapter = d1Adapter(
      createFakeD1({
        firstRows: [credentialRow],
      }),
    );

    await expect(adapter.getCredential("credential-id")).resolves.toEqual({
      id: "credential_123",
      userId: "user_123",
      credentialId: "credential-id",
      publicKey: "public-key",
      counter: 42,
      transports: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("creates, reads, updates, and deletes sessions", async () => {
    const sessionRow = {
      id: "session_123",
      user_id: "user_123",
      token_hash: "token-hash",
      expires_at: "2026-01-31T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      last_seen_at: "2026-01-01T00:01:00.000Z",
    };
    const database = createFakeD1({
      firstRows: [sessionRow],
    });
    const adapter = d1Adapter(database);
    const session = {
      id: "session_123",
      userId: "user_123",
      tokenHash: "token-hash",
      expiresAt: new Date("2026-01-31T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-01-01T00:01:00.000Z"),
    };

    await expect(adapter.createSession(session)).resolves.toEqual(session);
    await expect(adapter.getSessionByTokenHash("token-hash")).resolves.toEqual(session);
    await adapter.updateSessionLastSeen({
      id: "session_123",
      lastSeenAt: new Date("2026-01-01T00:02:00.000Z"),
    });
    await adapter.deleteSession("session_123");

    expect(database.calls[0]?.values).toEqual([
      "session_123",
      "user_123",
      "token-hash",
      "2026-01-31T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:01:00.000Z",
    ]);
    expect(database.calls[2]?.values).toEqual([
      "2026-01-01T00:02:00.000Z",
      "session_123",
    ]);
    expect(database.calls[3]?.query).toContain("delete from passkeeper_sessions");
    expect(database.calls[3]?.values).toEqual(["session_123"]);
  });

  it("creates, reads, and consumes invites atomically", async () => {
    const inviteRow = {
      id: "invite_123",
      code_hash: "code-hash",
      email: "jane@example.com",
      max_uses: 2,
      used_count: 1,
      expires_at: "2026-01-31T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const database = createFakeD1({
      firstRows: [
        inviteRow,
        {
          ...inviteRow,
          used_count: 2,
        },
      ],
    });
    const adapter = d1Adapter(database);
    const invite = {
      id: "invite_123",
      codeHash: "code-hash",
      email: "jane@example.com",
      maxUses: 2,
      usedCount: 1,
      expiresAt: new Date("2026-01-31T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    await expect(adapter.createInvite(invite)).resolves.toEqual(invite);
    await expect(adapter.getInviteByCodeHash("code-hash")).resolves.toEqual(invite);
    await expect(
      adapter.consumeInvite({
        codeHash: "code-hash",
        now: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      ...invite,
      usedCount: 2,
    });

    expect(database.calls[0]?.values).toEqual([
      "invite_123",
      "code-hash",
      "jane@example.com",
      2,
      1,
      "2026-01-31T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
    expect(database.calls[2]?.query).toContain("used_count = used_count + 1");
    expect(database.calls[2]?.query).toContain("used_count < max_uses");
    expect(database.calls[2]?.query).toContain("returning id, code_hash");
    expect(database.calls[2]?.values).toEqual(["code-hash", "2026-01-02T00:00:00.000Z"]);
  });

  it("returns null when records are missing", async () => {
    const adapter = d1Adapter(createFakeD1());

    await expect(adapter.consumeChallenge("missing")).resolves.toBeNull();
    await expect(adapter.getUser("missing")).resolves.toBeNull();
    await expect(adapter.getUserByUsername("missing@example.com")).resolves.toBeNull();
    await expect(adapter.getCredential("missing")).resolves.toBeNull();
    await expect(adapter.getSessionByTokenHash("missing")).resolves.toBeNull();
    await expect(adapter.getInviteByCodeHash("missing")).resolves.toBeNull();
  });

  it("rejects invalid date strings from D1 rows", async () => {
    const adapter = d1Adapter(
      createFakeD1({
        firstRows: [
          {
            id: "session_123",
            user_id: "user_123",
            token_hash: "token-hash",
            expires_at: "not-a-date",
            created_at: "2026-01-01T00:00:00.000Z",
            last_seen_at: null,
          },
        ],
      }),
    );

    await expect(adapter.getSessionByTokenHash("token-hash")).rejects.toThrow(
      "passkeeper_sessions.expires_at must be a valid ISO date string.",
    );
  });

  it("rejects invalid dates before writing to D1", async () => {
    const adapter = d1Adapter(createFakeD1());
    const validDate = new Date("2026-01-01T00:00:00.000Z");
    const invalidDate = new Date(Number.NaN);

    await expect(
      adapter.createChallenge({
        id: "challenge_123",
        type: "registration",
        challenge: "challenge-value",
        expiresAt: invalidDate,
        createdAt: validDate,
      }),
    ).rejects.toThrow("challenge.expiresAt must be a valid Date.");
    await expect(
      adapter.updateCredentialCounter({
        credentialId: "credential-id",
        previousCounter: 1,
        counter: 2,
        lastUsedAt: invalidDate,
      }),
    ).rejects.toThrow("credential.lastUsedAt must be a valid Date.");
    await expect(
      adapter.consumeInvite({
        codeHash: "code-hash",
        now: invalidDate,
      }),
    ).rejects.toThrow("invite.now must be a valid Date.");
  });

  it("deletes expired challenges, sessions, and invites", async () => {
    const database = createFakeD1();
    const adapter = d1Adapter(database);

    await adapter.deleteExpiredRecords(new Date("2026-01-02T00:00:00.000Z"));

    expect(database.calls.map((call) => call.kind)).toEqual(["run", "run", "run"]);
    expect(database.calls[0]?.query).toContain("delete from passkeeper_challenges");
    expect(database.calls[0]?.query).toContain("expires_at <= ?");
    expect(database.calls[1]?.query).toContain("delete from passkeeper_sessions");
    expect(database.calls[1]?.query).toContain("expires_at <= ?");
    expect(database.calls[2]?.query).toContain("delete from passkeeper_invites");
    expect(database.calls[2]?.query).toContain("expires_at is not null");
    expect(database.calls[2]?.query).toContain("expires_at <= ?");
    expect(database.calls.map((call) => call.values)).toEqual([
      ["2026-01-02T00:00:00.000Z"],
      ["2026-01-02T00:00:00.000Z"],
      ["2026-01-02T00:00:00.000Z"],
    ]);
  });

  it("rejects invalid cleanup dates", async () => {
    const adapter = d1Adapter(createFakeD1());

    await expect(adapter.deleteExpiredRecords(new Date(Number.NaN))).rejects.toThrow(
      "now must be a valid Date.",
    );
  });
});

interface D1Call {
  kind: "first" | "all" | "run";
  query: string;
  values: unknown[];
}

interface FakeD1 extends D1DatabaseLike {
  calls: D1Call[];
}

interface FakeD1Options {
  firstRows?: unknown[];
  allResults?: unknown[][];
}

function createFakeD1(options: FakeD1Options = {}): FakeD1 {
  const calls: D1Call[] = [];
  const firstRows = [...(options.firstRows ?? [])];
  const allResults = [...(options.allResults ?? [])];

  return {
    calls,
    prepare(query: string) {
      return createFakeStatement({
        query,
        calls,
        firstRows,
        allResults,
      });
    },
  };
}

interface FakeStatementOptions {
  query: string;
  calls: D1Call[];
  firstRows: unknown[];
  allResults: unknown[][];
}

function createFakeStatement(options: FakeStatementOptions): D1PreparedStatementLike {
  let values: unknown[] = [];

  return {
    bind(...nextValues: unknown[]) {
      values = nextValues;
      return this;
    },
    async first<T>() {
      options.calls.push({
        kind: "first",
        query: options.query,
        values,
      });

      return (options.firstRows.shift() ?? null) as T | null;
    },
    async all<T>() {
      options.calls.push({
        kind: "all",
        query: options.query,
        values,
      });

      return {
        results: (options.allResults.shift() ?? []) as T[],
      };
    },
    async run() {
      options.calls.push({
        kind: "run",
        query: options.query,
        values,
      });

      return {};
    },
  };
}
