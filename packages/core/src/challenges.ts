import type { NormalizedPasskeeperConfig } from "./config";
import { base64UrlEncode } from "./encoding";
import { PasskeeperError } from "./errors";
import type { Challenge, ChallengeType } from "./types";

export interface CreateChallengeOptions {
  userId?: string;
  type: ChallengeType;
}

export interface ConsumeChallengeOptions {
  id: string;
  type: ChallengeType;
  userId?: string;
}

export interface ChallengeService {
  create(options: CreateChallengeOptions): Promise<Challenge>;
  consume(options: ConsumeChallengeOptions): Promise<Challenge>;
}

export function createChallengeService(config: NormalizedPasskeeperConfig): ChallengeService {
  return {
    async create(options) {
      const userId = normalizeOptionalUserId(options.userId);
      const createdAt = config.now();
      const expiresAt = new Date(createdAt.getTime() + config.challengeTtlSeconds * 1000);
      const challenge = base64UrlEncode(config.randomBytes(32));
      const id = base64UrlEncode(config.randomBytes(16));

      return config.storage.createChallenge({
        id,
        ...(userId === undefined ? {} : { userId }),
        type: options.type,
        challenge,
        expiresAt,
        createdAt,
      });
    },

    async consume(options) {
      const id = normalizeChallengeId(options.id);
      const userId = normalizeOptionalUserId(options.userId);
      const challenge = await config.storage.consumeChallenge(id);

      if (challenge === null) {
        throw new PasskeeperError({
          code: "challenge_not_found",
          message: "Challenge was not found or has already been consumed.",
        });
      }

      if (challenge.type !== options.type) {
        throw new PasskeeperError({
          code: "invalid_challenge",
          message: "Challenge type does not match the expected flow.",
        });
      }

      if (userId !== undefined && challenge.userId !== userId) {
        throw new PasskeeperError({
          code: "invalid_challenge",
          message: "Challenge user does not match the expected user.",
        });
      }

      if (challenge.expiresAt.getTime() <= config.now().getTime()) {
        throw new PasskeeperError({
          code: "challenge_expired",
          message: "Challenge has expired.",
        });
      }

      return challenge;
    },
  };
}

function normalizeOptionalUserId(userId: string | undefined): string | undefined {
  if (userId === undefined) {
    return undefined;
  }

  if (typeof userId !== "string" || userId.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "userId must be a non-empty string.",
    });
  }

  return userId.trim();
}

function normalizeChallengeId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "challengeId must be a non-empty string.",
    });
  }

  return id.trim();
}
