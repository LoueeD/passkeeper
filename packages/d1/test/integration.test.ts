import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { d1Adapter, type D1DatabaseLike } from "../src/index";
import migration from "../migrations/0001_initial.sql?raw";

describe("d1Adapter integration", () => {
  let miniflare: Miniflare;
  let database: D1DatabaseLike;

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      cf: false,
      d1Databases: { DB: "passkeeper-integration" },
    });
    const d1 = await miniflare.getD1Database("DB");
    await d1.exec(statementsForD1Exec(migration).join("\n"));
    database = d1 as unknown as D1DatabaseLike;
  });

  afterAll(async () => {
    await miniflare?.dispose();
  });

  it("applies the migration and preserves guarded storage semantics", async () => {
    const adapter = d1Adapter(database);
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const future = new Date("2026-01-02T00:00:00.000Z");

    await adapter.createUser({
      id: "user_123",
      username: "jane@example.com",
      displayName: "Jane",
      createdAt,
      updatedAt: createdAt,
    });
    await adapter.createChallenge({
      id: "challenge_123",
      userId: "user_123",
      type: "registration",
      challenge: "challenge-value",
      expiresAt: future,
      createdAt,
    });

    const consumedChallenges = await Promise.all([
      adapter.consumeChallenge("challenge_123"),
      adapter.consumeChallenge("challenge_123"),
    ]);
    expect(consumedChallenges.filter((challenge) => challenge !== null)).toHaveLength(1);
    expect(consumedChallenges.filter((challenge) => challenge === null)).toHaveLength(1);

    await adapter.createCredential({
      id: "credential_123",
      userId: "user_123",
      credentialId: "credential-id",
      publicKey: "public-key",
      counter: 0,
      transports: ["internal"],
      backedUp: true,
      createdAt,
    });
    const counterUpdates = await Promise.all([
      adapter.updateCredentialCounter({
        credentialId: "credential-id",
        previousCounter: 0,
        counter: 1,
        lastUsedAt: createdAt,
      }),
      adapter.updateCredentialCounter({
        credentialId: "credential-id",
        previousCounter: 0,
        counter: 2,
        lastUsedAt: createdAt,
      }),
    ]);
    expect(counterUpdates.filter(Boolean)).toHaveLength(1);
    expect(await adapter.getCredential("credential-id")).toMatchObject({
      userId: "user_123",
      transports: ["internal"],
      backedUp: true,
    });

    await adapter.createInvite({
      id: "invite_123",
      codeHash: "invite-hash",
      maxUses: 1,
      usedCount: 0,
      expiresAt: future,
      createdAt,
    });
    const consumedInvites = await Promise.all([
      adapter.consumeInvite({ codeHash: "invite-hash", now: createdAt }),
      adapter.consumeInvite({ codeHash: "invite-hash", now: createdAt }),
    ]);
    expect(consumedInvites.filter((invite) => invite !== null)).toHaveLength(1);
    expect(consumedInvites.filter((invite) => invite === null)).toHaveLength(1);

    await adapter.createSession({
      id: "session_expired",
      userId: "user_123",
      tokenHash: "expired-token-hash",
      expiresAt: createdAt,
      createdAt,
    });
    await adapter.createSession({
      id: "session_active",
      userId: "user_123",
      tokenHash: "active-token-hash",
      expiresAt: future,
      createdAt,
    });
    await adapter.deleteExpiredRecords(new Date("2026-01-01T12:00:00.000Z"));

    await expect(adapter.getSessionByTokenHash("expired-token-hash")).resolves.toBeNull();
    await expect(adapter.getSessionByTokenHash("active-token-hash")).resolves.toMatchObject({
      id: "session_active",
    });

    const tables = await database
      .prepare("select name from sqlite_master where type = 'table' and name like 'passkeeper_%'")
      .all<{ name: string }>();
    expect(tables.results.map(({ name }) => name).sort()).toEqual([
      "passkeeper_challenges",
      "passkeeper_credentials",
      "passkeeper_invites",
      "passkeeper_sessions",
      "passkeeper_users",
    ]);
  });
});

function statementsForD1Exec(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gmu, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/gu, " ").trim())
    .filter((statement) => statement !== "")
    .map((statement) => `${statement};`);
}
