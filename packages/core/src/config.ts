import { PasskeeperError } from "./errors";
import type { PasskeeperStorage } from "./types";
import {
  defaultVerifyAuthentication,
  defaultVerifyRegistration,
  type VerifyAuthentication,
  type VerifyRegistration,
} from "./verification";

export interface PasskeeperConfig {
  rpName: string;
  rpId: string;
  origin: string;
  storage: PasskeeperStorage;
  inviteRequired?: boolean;
  challengeTtlSeconds?: number;
  sessionTtlSeconds?: number;
  randomBytes?: (size: number) => Uint8Array;
  hashToken?: (token: string) => Promise<string>;
  now?: () => Date;
  verifyRegistration?: VerifyRegistration;
  verifyAuthentication?: VerifyAuthentication;
}

export interface NormalizedPasskeeperConfig {
  rpName: string;
  rpId: string;
  origin: string;
  storage: PasskeeperStorage;
  inviteRequired: boolean;
  challengeTtlSeconds: number;
  sessionTtlSeconds: number;
  randomBytes: (size: number) => Uint8Array;
  hashToken: (token: string) => Promise<string>;
  now: () => Date;
  verifyRegistration: VerifyRegistration;
  verifyAuthentication: VerifyAuthentication;
}

export const DEFAULT_CHALLENGE_TTL_SECONDS = 300;
export const MIN_CHALLENGE_TTL_SECONDS = 30;
export const MAX_CHALLENGE_TTL_SECONDS = 900;
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const MIN_SESSION_TTL_SECONDS = 60;

export function normalizeConfig(config: PasskeeperConfig): NormalizedPasskeeperConfig {
  const rpName = requireNonEmptyString("rpName", config.rpName);
  const rpId = requireNonEmptyString("rpId", config.rpId);
  const origin = normalizeOrigin(config.origin);
  validateRelyingPartyIdForOrigin(rpId, origin);
  const inviteRequired = config.inviteRequired ?? false;
  const challengeTtlSeconds = normalizeChallengeTtl(config.challengeTtlSeconds);
  const sessionTtlSeconds = normalizeSessionTtl(config.sessionTtlSeconds);
  const randomBytes = normalizeRandomBytes(config.randomBytes ?? defaultRandomBytes);
  const hashToken = normalizeHashToken(config.hashToken ?? defaultHashToken);
  const now = normalizeNow(config.now ?? (() => new Date()));
  const verifyRegistration = config.verifyRegistration ?? defaultVerifyRegistration;
  const verifyAuthentication = config.verifyAuthentication ?? defaultVerifyAuthentication;

  const storage = normalizeStorage(config.storage);

  return {
    rpName,
    rpId,
    origin,
    storage,
    inviteRequired,
    challengeTtlSeconds,
    sessionTtlSeconds,
    randomBytes,
    hashToken,
    now,
    verifyRegistration,
    verifyAuthentication,
  };
}

function normalizeStorage(storage: PasskeeperStorage): PasskeeperStorage {
  if (storage === undefined || storage === null) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "storage is required.",
    });
  }

  const methods: Array<keyof PasskeeperStorage> = [
    "createChallenge",
    "consumeChallenge",
    "getUser",
    "getUserByUsername",
    "createUser",
    "listCredentials",
    "getCredential",
    "createCredential",
    "updateCredentialCounter",
    "createSession",
    "getSessionByTokenHash",
    "updateSessionLastSeen",
    "deleteSession",
    "createInvite",
    "getInviteByCodeHash",
    "consumeInvite",
  ];

  for (const method of methods) {
    if (typeof storage[method] !== "function") {
      throw new PasskeeperError({
        code: "invalid_config",
        message: `storage.${method} must be a function.`,
      });
    }
  }

  return storage;
}

function validateRelyingPartyIdForOrigin(rpId: string, origin: string): void {
  const hostname = new URL(origin).hostname;

  if (hostname === rpId || hostname.endsWith(`.${rpId}`)) {
    return;
  }

  throw new PasskeeperError({
    code: "invalid_config",
    message: "rpId must match the origin hostname or a parent domain of it.",
  });
}

function normalizeSessionTtl(sessionTtlSeconds = DEFAULT_SESSION_TTL_SECONDS): number {
  if (!Number.isInteger(sessionTtlSeconds)) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionTtlSeconds must be an integer.",
    });
  }

  if (sessionTtlSeconds < MIN_SESSION_TTL_SECONDS) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: `sessionTtlSeconds must be at least ${MIN_SESSION_TTL_SECONDS}.`,
    });
  }

  return sessionTtlSeconds;
}

function requireNonEmptyString(field: string, value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: `${field} must be a non-empty string.`,
    });
  }

  return value.trim();
}

function normalizeOrigin(origin: string): string {
  const value = requireNonEmptyString("origin", origin);

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new PasskeeperError({
        code: "invalid_config",
        message: "origin must use https, except for localhost development.",
      });
    }

    url.pathname = "";
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/$/, "");
  } catch (error) {
    if (error instanceof PasskeeperError) {
      throw error;
    }

    throw new PasskeeperError({
      code: "invalid_config",
      message: "origin must be a valid URL.",
      cause: error,
    });
  }
}

function normalizeChallengeTtl(challengeTtlSeconds = DEFAULT_CHALLENGE_TTL_SECONDS): number {
  if (!Number.isInteger(challengeTtlSeconds)) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "challengeTtlSeconds must be an integer.",
    });
  }

  if (
    challengeTtlSeconds < MIN_CHALLENGE_TTL_SECONDS ||
    challengeTtlSeconds > MAX_CHALLENGE_TTL_SECONDS
  ) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: `challengeTtlSeconds must be between ${MIN_CHALLENGE_TTL_SECONDS} and ${MAX_CHALLENGE_TTL_SECONDS}.`,
    });
  }

  return challengeTtlSeconds;
}

function normalizeRandomBytes(randomBytes: (size: number) => Uint8Array): (size: number) => Uint8Array {
  return (size) => {
    const bytes = randomBytes(size);

    if (!(bytes instanceof Uint8Array)) {
      throw new PasskeeperError({
        code: "invalid_config",
        message: "randomBytes must return a Uint8Array.",
      });
    }

    if (bytes.byteLength !== size) {
      throw new PasskeeperError({
        code: "invalid_config",
        message: "randomBytes must return the requested number of bytes.",
      });
    }

    return bytes;
  };
}

function defaultRandomBytes(size: number): Uint8Array {
  const crypto = globalThis.crypto;

  if (crypto === undefined) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "crypto.getRandomValues is required. Provide randomBytes in unsupported runtimes.",
    });
  }

  return crypto.getRandomValues(new Uint8Array(size));
}

function normalizeHashToken(hashToken: (token: string) => Promise<string>): (token: string) => Promise<string> {
  return async (token) => {
    const tokenHash = await hashToken(token);

    if (typeof tokenHash !== "string" || tokenHash.trim() === "") {
      throw new PasskeeperError({
        code: "invalid_config",
        message: "hashToken must resolve to a non-empty string.",
      });
    }

    return tokenHash;
  };
}

function normalizeNow(now: () => Date): () => Date {
  return () => {
    const date = now();

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new PasskeeperError({
        code: "invalid_config",
        message: "now must return a valid Date.",
      });
    }

    return date;
  };
}

async function defaultHashToken(token: string): Promise<string> {
  const crypto = globalThis.crypto;

  if (crypto === undefined) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "crypto.subtle.digest is required. Provide hashToken in unsupported runtimes.",
    });
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const bytes = new Uint8Array(digest);
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}
