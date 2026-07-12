import type { ChallengeService } from "./challenges";
import type { NormalizedPasskeeperConfig } from "./config";
import { base64UrlDecode } from "./encoding";
import { PasskeeperError } from "./errors";
import type { PasskeeperUser, PasskeyCredential } from "./types";
import type { AuthenticationResponseJSON } from "./verification";
import type { PublicKeyCredentialRequestOptionsJSON } from "./webauthn";

export interface AuthenticationBeginOptions {
  username: string;
}

export interface AuthenticationBeginResult {
  challengeId: string;
  user: PasskeeperUser;
  publicKey: PublicKeyCredentialRequestOptionsJSON;
}

export interface AuthenticationCompleteOptions {
  challengeId: string;
  credential: AuthenticationResponseJSON;
}

export interface AuthenticationCompleteResult {
  user: PasskeeperUser;
  credential: PasskeyCredential;
  verified: true;
}

export interface AuthenticationService {
  begin(options: AuthenticationBeginOptions): Promise<AuthenticationBeginResult>;
  complete(options: AuthenticationCompleteOptions): Promise<AuthenticationCompleteResult>;
}

export function createAuthenticationService(
  config: NormalizedPasskeeperConfig,
  challenges: ChallengeService,
): AuthenticationService {
  return {
    async begin(options) {
      const username = normalizeUsername(options.username);
      const user = await config.storage.getUserByUsername(username);

      if (user === null) {
        throw new PasskeeperError({
          code: "user_not_found",
          message: "User was not found.",
        });
      }

      const credentials = await config.storage.listCredentials(user.id);

      if (credentials.length === 0) {
        throw new PasskeeperError({
          code: "credential_not_found",
          message: "User does not have any registered credentials.",
        });
      }

      const challenge = await challenges.create({
        type: "authentication",
        userId: user.id,
      });

      return {
        challengeId: challenge.id,
        user,
        publicKey: {
          challenge: challenge.challenge,
          timeout: config.challengeTtlSeconds * 1000,
          rpId: config.rpId,
          allowCredentials: credentials.map((credential) => ({
            type: "public-key",
            id: credential.credentialId,
            ...(credential.transports === undefined ? {} : { transports: credential.transports }),
          })),
          userVerification: "required",
        },
      };
    },

    async complete(options) {
      const challengeId = normalizeChallengeId(options.challengeId);
      const credential = normalizeAuthenticationResponse(options.credential);
      const storedCredential = await config.storage.getCredential(credential.id);

      if (storedCredential === null) {
        throw new PasskeeperError({
          code: "credential_not_found",
          message: "Credential was not found.",
        });
      }

      const user = await config.storage.getUser(storedCredential.userId);

      if (user === null) {
        throw new PasskeeperError({
          code: "user_not_found",
          message: "Credential does not belong to an existing user.",
        });
      }

      const challenge = await challenges.consume({
        id: challengeId,
        type: "authentication",
        userId: user.id,
      });
      const verification = await config.verifyAuthentication({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        credential: {
          id: storedCredential.credentialId,
          publicKey: base64UrlDecode(storedCredential.publicKey),
          counter: storedCredential.counter,
          ...(storedCredential.transports === undefined
            ? {}
            : { transports: storedCredential.transports }),
        },
        requireUserVerification: true,
      });

      if (!verification.verified) {
        throw new PasskeeperError({
          code: "verification_failed",
          message: "Authentication credential could not be verified.",
        });
      }

      const lastUsedAt = config.now();
      const counterUpdated = await config.storage.updateCredentialCounter({
        credentialId: verification.authenticationInfo.credentialID,
        previousCounter: storedCredential.counter,
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt,
      });

      if (!counterUpdated) {
        throw new PasskeeperError({
          code: "verification_failed",
          message: "Authentication credential counter could not be updated.",
        });
      }

      return {
        user,
        credential: {
          ...storedCredential,
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt,
        },
        verified: true,
      };
    },
  };
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

function normalizeChallengeId(challengeId: string): string {
  if (typeof challengeId !== "string" || challengeId.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "challengeId must be a non-empty string.",
    });
  }

  return challengeId.trim();
}

function normalizeAuthenticationResponse(credential: AuthenticationResponseJSON): AuthenticationResponseJSON {
  if (typeof credential !== "object" || credential === null) {
    throw new PasskeeperError({
      code: "invalid_credential",
      message: "Authentication credential must be an object.",
    });
  }

  if (typeof credential.id !== "string" || credential.id.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_credential",
      message: "Authentication credential id must be a non-empty string.",
    });
  }

  return {
    ...credential,
    id: credential.id.trim(),
  };
}
