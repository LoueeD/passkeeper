import type {
  AuthenticatorTransport,
  Challenge,
  ChallengeType,
  CreateChallengeInput,
  CreateCredentialInput,
  CreateInviteInput,
  CreateSessionInput,
  CreateUserInput,
  ConsumeInviteInput,
  PasskeeperInvite,
  PasskeeperStorage,
  PasskeeperSession,
  PasskeeperUser,
  PasskeyCredential,
  UpdateCredentialCounterInput,
  UpdateSessionLastSeenInput,
} from "@passkeeper/core";

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface D1PasskeeperAdapter extends PasskeeperStorage {
  database: D1DatabaseLike;
  deleteExpiredRecords(now: Date): Promise<void>;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ChallengeRow {
  id: string;
  user_id: string | null;
  type: ChallengeType;
  challenge: string;
  expires_at: string;
  created_at: string;
}

interface CredentialRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  backed_up: number | null;
  created_at: string;
  last_used_at: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string | null;
}

interface InviteRow {
  id: string;
  code_hash: string;
  email: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
}

export function d1Adapter(database: D1DatabaseLike): D1PasskeeperAdapter {
  if (typeof database !== "object" || database === null || typeof database.prepare !== "function") {
    throw new Error("D1 database binding must provide a prepare(query) function.");
  }

  return {
    database,

    async createChallenge(input: CreateChallengeInput) {
      await database
        .prepare(
          `insert into passkeeper_challenges (id, user_id, type, challenge, expires_at, created_at)
           values (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.userId ?? null,
          input.type,
          input.challenge,
          isoDateFromInput(input.expiresAt, "challenge.expiresAt"),
          isoDateFromInput(input.createdAt, "challenge.createdAt"),
        )
        .run();

      return input;
    },

    async consumeChallenge(id: string) {
      const row = await database
        .prepare(
          `delete from passkeeper_challenges
           where id = ?
           returning id, user_id, type, challenge, expires_at, created_at`,
        )
        .bind(id)
        .first<ChallengeRow>();

      if (row === null) {
        return null;
      }

      return challengeFromRow(row);
    },

    async getUser(id: string) {
      const row = await database
        .prepare(
          `select id, username, display_name, created_at, updated_at
           from passkeeper_users
           where id = ?`,
        )
        .bind(id)
        .first<UserRow>();

      return row === null ? null : userFromRow(row);
    },

    async getUserByUsername(username: string) {
      const row = await database
        .prepare(
          `select id, username, display_name, created_at, updated_at
           from passkeeper_users
           where username = ?`,
        )
        .bind(username)
        .first<UserRow>();

      return row === null ? null : userFromRow(row);
    },

    async createUser(input: CreateUserInput) {
      await database
        .prepare(
          `insert into passkeeper_users (id, username, display_name, created_at, updated_at)
           values (?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.username,
          input.displayName,
          isoDateFromInput(input.createdAt, "user.createdAt"),
          isoDateFromInput(input.updatedAt, "user.updatedAt"),
        )
        .run();

      return input;
    },

    async listCredentials(userId: string) {
      const { results } = await database
        .prepare(
          `select id, user_id, credential_id, public_key, counter, transports, backed_up, created_at, last_used_at
           from passkeeper_credentials
           where user_id = ?
           order by created_at asc`,
        )
        .bind(userId)
        .all<CredentialRow>();

      return results.map(credentialFromRow);
    },

    async getCredential(credentialId: string) {
      const row = await database
        .prepare(
          `select id, user_id, credential_id, public_key, counter, transports, backed_up, created_at, last_used_at
           from passkeeper_credentials
           where credential_id = ?`,
        )
        .bind(credentialId)
        .first<CredentialRow>();

      return row === null ? null : credentialFromRow(row);
    },

    async createCredential(input: CreateCredentialInput) {
      await database
        .prepare(
          `insert into passkeeper_credentials (
             id, user_id, credential_id, public_key, counter, transports, backed_up, created_at, last_used_at
           )
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.userId,
          input.credentialId,
          input.publicKey,
          input.counter,
          input.transports === undefined ? null : JSON.stringify(input.transports),
          input.backedUp === undefined ? null : booleanToInteger(input.backedUp),
          isoDateFromInput(input.createdAt, "credential.createdAt"),
          input.lastUsedAt === undefined
            ? null
            : isoDateFromInput(input.lastUsedAt, "credential.lastUsedAt"),
        )
        .run();

      return input;
    },

    async updateCredentialCounter(input: UpdateCredentialCounterInput) {
      const row = await database
        .prepare(
          `update passkeeper_credentials
           set counter = ?, last_used_at = ?
           where credential_id = ?
             and counter = ?
           returning credential_id`,
        )
        .bind(
          input.counter,
          isoDateFromInput(input.lastUsedAt, "credential.lastUsedAt"),
          input.credentialId,
          input.previousCounter,
        )
        .first<{ credential_id: string }>();

      return row !== null;
    },

    async createSession(input: CreateSessionInput) {
      await database
        .prepare(
          `insert into passkeeper_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
           values (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.userId,
          input.tokenHash,
          isoDateFromInput(input.expiresAt, "session.expiresAt"),
          isoDateFromInput(input.createdAt, "session.createdAt"),
          input.lastSeenAt === undefined
            ? null
            : isoDateFromInput(input.lastSeenAt, "session.lastSeenAt"),
        )
        .run();

      return input;
    },

    async getSessionByTokenHash(tokenHash: string) {
      const row = await database
        .prepare(
          `select id, user_id, token_hash, expires_at, created_at, last_seen_at
           from passkeeper_sessions
           where token_hash = ?`,
        )
        .bind(tokenHash)
        .first<SessionRow>();

      return row === null ? null : sessionFromRow(row);
    },

    async updateSessionLastSeen(input: UpdateSessionLastSeenInput) {
      await database
        .prepare(
          `update passkeeper_sessions
           set last_seen_at = ?
           where id = ?`,
        )
        .bind(isoDateFromInput(input.lastSeenAt, "session.lastSeenAt"), input.id)
        .run();
    },

    async deleteSession(id: string) {
      await database
        .prepare(
          `delete from passkeeper_sessions
           where id = ?`,
        )
        .bind(id)
        .run();
    },

    async createInvite(input: CreateInviteInput) {
      await database
        .prepare(
          `insert into passkeeper_invites (id, code_hash, email, max_uses, used_count, expires_at, created_at)
           values (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.codeHash,
          input.email ?? null,
          input.maxUses,
          input.usedCount,
          input.expiresAt === undefined ? null : isoDateFromInput(input.expiresAt, "invite.expiresAt"),
          isoDateFromInput(input.createdAt, "invite.createdAt"),
        )
        .run();

      return input;
    },

    async getInviteByCodeHash(codeHash: string) {
      const row = await database
        .prepare(
          `select id, code_hash, email, max_uses, used_count, expires_at, created_at
           from passkeeper_invites
           where code_hash = ?`,
        )
        .bind(codeHash)
        .first<InviteRow>();

      return row === null ? null : inviteFromRow(row);
    },

    async consumeInvite(input: ConsumeInviteInput) {
      const row = await database
        .prepare(
          `update passkeeper_invites
           set used_count = used_count + 1
           where code_hash = ?
             and used_count < max_uses
             and (expires_at is null or expires_at > ?)
           returning id, code_hash, email, max_uses, used_count, expires_at, created_at`,
        )
        .bind(input.codeHash, isoDateFromInput(input.now, "invite.now"))
        .first<InviteRow>();

      return row === null ? null : inviteFromRow(row);
    },

    async deleteExpiredRecords(now: Date) {
      const timestamp = isoDateFromInput(now, "now");

      await database
        .prepare(
          `delete from passkeeper_challenges
           where expires_at <= ?`,
        )
        .bind(timestamp)
        .run();

      await database
        .prepare(
          `delete from passkeeper_sessions
           where expires_at <= ?`,
        )
        .bind(timestamp)
        .run();

      await database
        .prepare(
          `delete from passkeeper_invites
           where expires_at is not null
             and expires_at <= ?`,
        )
        .bind(timestamp)
        .run();
    },
  };
}

function userFromRow(row: UserRow): PasskeeperUser {
  return {
    id: row.id,
    username: row.username,
    ...(row.display_name === null ? {} : { displayName: row.display_name }),
    createdAt: dateFromRow(row.created_at, "passkeeper_users.created_at"),
    updatedAt: dateFromRow(row.updated_at, "passkeeper_users.updated_at"),
  };
}

function challengeFromRow(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    ...(row.user_id === null ? {} : { userId: row.user_id }),
    type: row.type,
    challenge: row.challenge,
    expiresAt: dateFromRow(row.expires_at, "passkeeper_challenges.expires_at"),
    createdAt: dateFromRow(row.created_at, "passkeeper_challenges.created_at"),
  };
}

function credentialFromRow(row: CredentialRow): PasskeyCredential {
  const backedUp = row.backed_up === null ? undefined : integerToBoolean(row.backed_up);

  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    ...(row.transports === null ? {} : { transports: parseTransports(row.transports) }),
    ...(backedUp === undefined ? {} : { backedUp }),
    createdAt: dateFromRow(row.created_at, "passkeeper_credentials.created_at"),
    ...(row.last_used_at === null
      ? {}
      : { lastUsedAt: dateFromRow(row.last_used_at, "passkeeper_credentials.last_used_at") }),
  };
}

function sessionFromRow(row: SessionRow): PasskeeperSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: dateFromRow(row.expires_at, "passkeeper_sessions.expires_at"),
    createdAt: dateFromRow(row.created_at, "passkeeper_sessions.created_at"),
    ...(row.last_seen_at === null
      ? {}
      : { lastSeenAt: dateFromRow(row.last_seen_at, "passkeeper_sessions.last_seen_at") }),
  };
}

function inviteFromRow(row: InviteRow): PasskeeperInvite {
  return {
    id: row.id,
    codeHash: row.code_hash,
    ...(row.email === null ? {} : { email: row.email }),
    maxUses: row.max_uses,
    usedCount: row.used_count,
    ...(row.expires_at === null
      ? {}
      : { expiresAt: dateFromRow(row.expires_at, "passkeeper_invites.expires_at") }),
    createdAt: dateFromRow(row.created_at, "passkeeper_invites.created_at"),
  };
}

function dateFromRow(value: string, field: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date string.`);
  }

  return date;
}

function dateFromInput(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }

  return value;
}

function isoDateFromInput(value: Date, field: string): string {
  return dateFromInput(value, field).toISOString();
}

function booleanToInteger(value: boolean): number {
  return value ? 1 : 0;
}

function integerToBoolean(value: number): boolean | undefined {
  if (value === 1) {
    return true;
  }

  if (value === 0) {
    return false;
  }

  return undefined;
}

function parseTransports(value: string): AuthenticatorTransport[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isAuthenticatorTransport);
}

function isAuthenticatorTransport(value: unknown): value is AuthenticatorTransport {
  return (
    value === "ble" ||
    value === "hybrid" ||
    value === "internal" ||
    value === "nfc" ||
    value === "usb"
  );
}
