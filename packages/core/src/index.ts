export { createPasskeeper, type Passkeeper } from "./passkeeper";
export {
  createAuthenticationService,
  type AuthenticationBeginOptions,
  type AuthenticationBeginResult,
  type AuthenticationCompleteOptions,
  type AuthenticationCompleteResult,
  type AuthenticationService,
} from "./authentication";
export {
  DEFAULT_CHALLENGE_TTL_SECONDS,
  DEFAULT_SESSION_TTL_SECONDS,
  MAX_CHALLENGE_TTL_SECONDS,
  MIN_CHALLENGE_TTL_SECONDS,
  MIN_SESSION_TTL_SECONDS,
  normalizeConfig,
  type NormalizedPasskeeperConfig,
  type PasskeeperConfig,
} from "./config";
export {
  createChallengeService,
  type ChallengeService,
  type ConsumeChallengeOptions,
  type CreateChallengeOptions,
} from "./challenges";
export {
  createRegistrationService,
  type AdditionalRegistrationBeginOptions,
  type AdditionalRegistrationCompleteOptions,
  type AdditionalRegistrationService,
  type RegistrationBeginOptions,
  type RegistrationBeginResult,
  type RegistrationCompleteOptions,
  type RegistrationCompleteResult,
  type RegistrationService,
} from "./registration";
export { createInviteService, type InviteCreateOptions, type InviteService } from "./invites";
export {
  createSessionService,
  type SessionCreateOptions,
  type SessionCreateResult,
  type SessionService,
  type SessionVerifyOptions,
  type SessionVerifyResult,
} from "./sessions";
export {
  defaultVerifyRegistration,
  defaultVerifyAuthentication,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifyAuthentication,
  type VerifyAuthenticationOptions,
  type VerifyRegistration,
  type VerifyRegistrationOptions,
} from "./verification";
export { PasskeeperError, isPasskeeperError, type PasskeeperErrorCode } from "./errors";
export type {
  Challenge,
  ChallengeType,
  CreateChallengeInput,
  CreateCredentialInput,
  CreateInviteInput,
  CreateUserInput,
  CreateSessionInput,
  ConsumeInviteInput,
  PasskeeperStorage,
  PasskeeperInvite,
  PasskeeperSession,
  PasskeeperUser,
  PasskeyCredential,
  UpdateCredentialCounterInput,
  UpdateSessionLastSeenInput,
} from "./types";
export type {
  AttestationConveyancePreference,
  AuthenticatorSelectionCriteria,
  AuthenticatorTransport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialDescriptor,
  PublicKeyCredentialParameters,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialRpEntity,
  PublicKeyCredentialType,
  PublicKeyCredentialUserEntity,
  ResidentKeyRequirement,
  UserVerificationRequirement,
} from "./webauthn";
