import type { NormalizedPasskeeperConfig } from "./config";
import { base64UrlEncode } from "./encoding";
import { PasskeeperError } from "./errors";
import type { PasskeeperInvite } from "./types";

export interface InviteCreateOptions {
  code: string;
  email?: string;
  maxUses?: number;
  expiresAt?: Date;
}

export interface InviteService {
  create(options: InviteCreateOptions): Promise<PasskeeperInvite>;
  verify(code: string): Promise<PasskeeperInvite>;
  consume(code: string): Promise<PasskeeperInvite>;
}

export function createInviteService(config: NormalizedPasskeeperConfig): InviteService {
  return {
    async create(options) {
      const code = normalizeInviteCode(options.code);
      const now = config.now();
      const maxUses = normalizeMaxUses(options.maxUses);
      const expiresAt = normalizeExpiresAt(options.expiresAt, now);
      const email = normalizeInviteEmail(options.email);

      return config.storage.createInvite({
        id: base64UrlEncode(config.randomBytes(16)),
        codeHash: await config.hashToken(code),
        ...(email === undefined ? {} : { email }),
        maxUses,
        usedCount: 0,
        ...(expiresAt === undefined ? {} : { expiresAt }),
        createdAt: now,
      });
    },

    async verify(code) {
      return getValidInvite(config, code);
    },

    async consume(code) {
      const invite = await config.storage.consumeInvite({
        codeHash: await config.hashToken(normalizeInviteCode(code)),
        now: config.now(),
      });

      if (invite === null) {
        throw new PasskeeperError({
          code: "invalid_invite",
          message: "Invite code is not valid.",
        });
      }

      return invite;
    },
  };
}

async function getValidInvite(
  config: NormalizedPasskeeperConfig,
  code: string,
): Promise<PasskeeperInvite> {
  const invite = await config.storage.getInviteByCodeHash(
    await config.hashToken(normalizeInviteCode(code)),
  );

  if (invite === null) {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite code is not valid.",
    });
  }

  if (invite.expiresAt !== undefined && invite.expiresAt.getTime() <= config.now().getTime()) {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite code has expired.",
    });
  }

  if (invite.usedCount >= invite.maxUses) {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite code has already been used.",
    });
  }

  return invite;
}

function normalizeInviteCode(code: string): string {
  if (typeof code !== "string" || code.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite code is required.",
    });
  }

  return code.trim();
}

function normalizeMaxUses(maxUses = 1): number {
  if (!Number.isInteger(maxUses) || maxUses < 1) {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite maxUses must be a positive integer.",
    });
  }

  return maxUses;
}

function normalizeInviteEmail(email: string | undefined): string | undefined {
  if (email === undefined) {
    return undefined;
  }

  if (typeof email !== "string" || email.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite email must be a non-empty string when provided.",
    });
  }

  return email.trim();
}

function normalizeExpiresAt(expiresAt: Date | undefined, now: Date): Date | undefined {
  if (expiresAt === undefined) {
    return undefined;
  }

  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite expiresAt must be a valid Date.",
    });
  }

  if (expiresAt.getTime() <= now.getTime()) {
    throw new PasskeeperError({
      code: "invalid_invite",
      message: "Invite expiresAt must be in the future.",
    });
  }

  return expiresAt;
}
