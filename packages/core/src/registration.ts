import type { ChallengeService } from "./challenges";
import type { NormalizedPasskeeperConfig } from "./config";
import { base64UrlEncode } from "./encoding";
import { PasskeeperError } from "./errors";
import { createInviteService } from "./invites";
import type { PasskeeperUser, PasskeyCredential } from "./types";
import type { RegistrationResponseJSON } from "./verification";
import {
  DEFAULT_PUBLIC_KEY_CREDENTIAL_PARAMETERS,
  type PublicKeyCredentialCreationOptionsJSON,
} from "./webauthn";

export interface RegistrationBeginOptions {
  username: string;
  displayName?: string;
  userId?: string;
  inviteCode?: string;
}

export interface RegistrationBeginResult {
  challengeId: string;
  user: PasskeeperUser;
  publicKey: PublicKeyCredentialCreationOptionsJSON;
}

export interface RegistrationCompleteOptions {
  challengeId: string;
  userId: string;
  credential: RegistrationResponseJSON;
  inviteCode?: string;
}

export interface RegistrationCompleteResult {
  user: PasskeeperUser;
  credential: PasskeyCredential;
  verified: true;
}

export interface AdditionalRegistrationBeginOptions {
  userId: string;
}

export interface AdditionalRegistrationCompleteOptions {
  challengeId: string;
  userId: string;
  credential: RegistrationResponseJSON;
}

export interface AdditionalRegistrationService {
  begin(options: AdditionalRegistrationBeginOptions): Promise<RegistrationBeginResult>;
  complete(options: AdditionalRegistrationCompleteOptions): Promise<RegistrationCompleteResult>;
}

export interface RegistrationService {
  begin(options: RegistrationBeginOptions): Promise<RegistrationBeginResult>;
  complete(options: RegistrationCompleteOptions): Promise<RegistrationCompleteResult>;
  readonly add: AdditionalRegistrationService;
}

export function createRegistrationService(
  config: NormalizedPasskeeperConfig,
  challenges: ChallengeService,
): RegistrationService {
  async function beginForUser(
    user: PasskeeperUser,
    type: "registration" | "registration_additional",
  ): Promise<RegistrationBeginResult> {
    const challenge = await challenges.create({
      type,
      userId: user.id,
    });
    const credentials = await config.storage.listCredentials(user.id);

    return {
      challengeId: challenge.id,
      user,
      publicKey: {
        rp: {
          id: config.rpId,
          name: config.rpName,
        },
        user: {
          id: user.id,
          name: user.username,
          displayName: user.displayName ?? user.username,
        },
        challenge: challenge.challenge,
        pubKeyCredParams: DEFAULT_PUBLIC_KEY_CREDENTIAL_PARAMETERS,
        timeout: config.challengeTtlSeconds * 1000,
        excludeCredentials: credentials.map((credential) => ({
          type: "public-key",
          id: credential.credentialId,
          ...(credential.transports === undefined ? {} : { transports: credential.transports }),
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
      },
    };
  }

  async function completeForUser(options: {
    challengeId: string;
    userId: string;
    credential: RegistrationResponseJSON;
    type: "registration" | "registration_additional";
    inviteCode?: string;
  }): Promise<RegistrationCompleteResult> {
    const challengeId = normalizeChallengeId(options.challengeId);
    const userId = normalizeUserId(options.userId);
    const challenge = await challenges.consume({
      id: challengeId,
      type: options.type,
      userId,
    });
    const user = await config.storage.getUser(userId);

    if (user === null) {
      throw new PasskeeperError({
        code: "invalid_challenge",
        message: "Registration challenge does not belong to an existing user.",
      });
    }

    const verification = await config.verifyRegistration({
      response: options.credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new PasskeeperError({
        code: "verification_failed",
        message: "Registration credential could not be verified.",
      });
    }

    const existingCredential = await config.storage.getCredential(
      verification.registrationInfo.credential.id,
    );

    if (existingCredential !== null) {
      throw new PasskeeperError({
        code: "invalid_credential",
        message: "Credential is already registered.",
      });
    }

    const createdAt = config.now();
    const userCredentials = await config.storage.listCredentials(user.id);

    if (options.type === "registration" && config.inviteRequired && userCredentials.length === 0) {
      await createInviteService(config).consume(options.inviteCode ?? "");
    }

    const transports = verification.registrationInfo.credential.transports?.filter(
      (transport) =>
        transport === "ble" ||
        transport === "hybrid" ||
        transport === "internal" ||
        transport === "nfc" ||
        transport === "usb",
    );
    const credential = await config.storage.createCredential({
      id: base64UrlEncode(config.randomBytes(16)),
      userId: user.id,
      credentialId: verification.registrationInfo.credential.id,
      publicKey: base64UrlEncode(verification.registrationInfo.credential.publicKey),
      counter: verification.registrationInfo.credential.counter,
      ...(transports === undefined ? {} : { transports }),
      ...(verification.registrationInfo.credentialBackedUp === undefined
        ? {}
        : { backedUp: verification.registrationInfo.credentialBackedUp }),
      createdAt,
    });

    return {
      user,
      credential,
      verified: true,
    };
  }

  const service: RegistrationService = {
    async begin(options) {
      const username = normalizeUsername(options.username);
      const displayName = normalizeDisplayName(options.displayName, username);
      const userId = normalizeOptionalUserId(options.userId);
      const now = config.now();
      const existingUser = await config.storage.getUserByUsername(username);
      const existingCredentials =
        existingUser === null ? [] : await config.storage.listCredentials(existingUser.id);

      if (existingCredentials.length > 0) {
        throw new PasskeeperError({
          code: "invalid_credential",
          message: "Username is already registered. Authenticate before adding another passkey.",
        });
      }

      if (config.inviteRequired && (existingUser === null || existingCredentials.length === 0)) {
        await createInviteService(config).verify(options.inviteCode ?? "");
      }

      const user =
        existingUser ??
        (await config.storage.createUser({
          id: userId ?? base64UrlEncode(config.randomBytes(16)),
          username,
          displayName,
          createdAt: now,
          updatedAt: now,
        }));

      return beginForUser(user, "registration");
    },

    async complete(options) {
      return completeForUser({ ...options, type: "registration" });
    },

    add: {
      async begin(options) {
        const userId = normalizeUserId(options.userId);
        const user = await config.storage.getUser(userId);

        if (user === null) {
          throw new PasskeeperError({
            code: "user_not_found",
            message: "Cannot add a passkey for a missing user.",
          });
        }

        return beginForUser(user, "registration_additional");
      },

      async complete(options) {
        return completeForUser({ ...options, type: "registration_additional" });
      },
    },
  };

  return service;
}

function normalizeUsername(username: string): string {
  if (typeof username !== "string" || username.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "username must be a non-empty string.",
    });
  }

  return username.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string | undefined, username: string): string {
  if (displayName === undefined || displayName.trim() === "") {
    return username;
  }

  return displayName.trim();
}

function normalizeOptionalUserId(userId: string | undefined): string | undefined {
  if (userId === undefined) {
    return undefined;
  }

  return normalizeUserId(userId);
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

function normalizeChallengeId(challengeId: string): string {
  if (typeof challengeId !== "string" || challengeId.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "challengeId must be a non-empty string.",
    });
  }

  return challengeId.trim();
}
