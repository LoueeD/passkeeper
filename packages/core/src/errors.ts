export type PasskeeperErrorCode =
  | "invalid_config"
  | "invalid_challenge"
  | "invalid_credential"
  | "invalid_invite"
  | "invalid_origin"
  | "user_not_found"
  | "credential_not_found"
  | "challenge_expired"
  | "challenge_not_found"
  | "verification_failed";

export interface PasskeeperErrorOptions {
  code: PasskeeperErrorCode;
  message: string;
  cause?: unknown;
}

export class PasskeeperError extends Error {
  readonly code: PasskeeperErrorCode;

  constructor(options: PasskeeperErrorOptions) {
    super(options.message);
    this.name = "PasskeeperError";
    this.code = options.code;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isPasskeeperError(error: unknown): error is PasskeeperError {
  return error instanceof PasskeeperError;
}
