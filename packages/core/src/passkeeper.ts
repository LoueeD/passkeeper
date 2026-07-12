import { createAuthenticationService, type AuthenticationService } from "./authentication";
import { createChallengeService, type ChallengeService } from "./challenges";
import { normalizeConfig, type NormalizedPasskeeperConfig, type PasskeeperConfig } from "./config";
import { createInviteService, type InviteService } from "./invites";
import { createRegistrationService, type RegistrationService } from "./registration";
import { createSessionService, type SessionService } from "./sessions";

export interface Passkeeper {
  readonly config: Pick<
    NormalizedPasskeeperConfig,
    "rpName" | "rpId" | "origin" | "challengeTtlSeconds" | "sessionTtlSeconds"
  >;
  readonly challenges: ChallengeService;
  readonly register: RegistrationService;
  readonly login: AuthenticationService;
  readonly sessions: SessionService;
  readonly invites: InviteService;
}

export function createPasskeeper(config: PasskeeperConfig): Passkeeper {
  const normalizedConfig = normalizeConfig(config);
  const challenges = createChallengeService(normalizedConfig);

  return {
    config: {
      rpName: normalizedConfig.rpName,
      rpId: normalizedConfig.rpId,
      origin: normalizedConfig.origin,
      challengeTtlSeconds: normalizedConfig.challengeTtlSeconds,
      sessionTtlSeconds: normalizedConfig.sessionTtlSeconds,
    },
    challenges,
    register: createRegistrationService(normalizedConfig, challenges),
    login: createAuthenticationService(normalizedConfig, challenges),
    sessions: createSessionService(normalizedConfig),
    invites: createInviteService(normalizedConfig),
  };
}
