import type { NormalizedPasskeeperConfig } from "./config";
import { base64UrlEncode } from "./encoding";
import { PasskeeperError } from "./errors";
import type { PasskeeperSession, PasskeeperUser } from "./types";

export interface SessionCreateOptions {
  userId: string;
}

export interface SessionCreateResult {
  session: PasskeeperSession;
  token: string;
}

export interface SessionVerifyOptions {
  token: string;
  updateLastSeen?: boolean;
}

export interface SessionVerifyResult {
  session: PasskeeperSession;
  user: PasskeeperUser;
}

export interface SessionService {
  create(options: SessionCreateOptions): Promise<SessionCreateResult>;
  verify(options: SessionVerifyOptions): Promise<SessionVerifyResult>;
  delete(sessionId: string): Promise<void>;
}

export function createSessionService(config: NormalizedPasskeeperConfig): SessionService {
  return {
    async create(options) {
      const userId = normalizeUserId(options.userId);
      const user = await config.storage.getUser(userId);

      if (user === null) {
        throw new PasskeeperError({
          code: "user_not_found",
          message: "Cannot create a session for a missing user.",
        });
      }

      const token = base64UrlEncode(config.randomBytes(32));
      const now = config.now();
      const session = await config.storage.createSession({
        id: base64UrlEncode(config.randomBytes(16)),
        userId: user.id,
        tokenHash: await config.hashToken(token),
        expiresAt: new Date(now.getTime() + config.sessionTtlSeconds * 1000),
        createdAt: now,
      });

      return { session, token };
    },

    async verify(options) {
      const token = normalizeSessionToken(options.token);
      const session = await config.storage.getSessionByTokenHash(await config.hashToken(token));

      if (session === null) {
        throw new PasskeeperError({
          code: "invalid_credential",
          message: "Session token is not valid.",
        });
      }

      if (session.expiresAt.getTime() <= config.now().getTime()) {
        await config.storage.deleteSession(session.id);
        throw new PasskeeperError({
          code: "invalid_credential",
          message: "Session has expired.",
        });
      }

      const user = await config.storage.getUser(session.userId);

      if (user === null) {
        throw new PasskeeperError({
          code: "user_not_found",
          message: "Session does not belong to an existing user.",
        });
      }

      if (options.updateLastSeen !== false) {
        const lastSeenAt = config.now();
        await config.storage.updateSessionLastSeen({
          id: session.id,
          lastSeenAt,
        });

        return {
          session: {
            ...session,
            lastSeenAt,
          },
          user,
        };
      }

      return { session, user };
    },

    async delete(sessionId) {
      await config.storage.deleteSession(normalizeSessionId(sessionId));
    },
  };
}

function normalizeUserId(userId: string): string {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "userId must be a non-empty string.",
    });
  }

  return userId.trim();
}

function normalizeSessionToken(token: string): string {
  if (typeof token !== "string" || token.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_credential",
      message: "Session token must be a non-empty string.",
    });
  }

  return token.trim();
}

function normalizeSessionId(sessionId: string): string {
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionId must be a non-empty string.",
    });
  }

  return sessionId.trim();
}
