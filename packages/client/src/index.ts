import { decodeBase64urlIgnorePadding, encodeBase64urlNoPadding } from "@oslojs/encoding";

export interface PasskeyClientEndpoints {
  beginUrl: string;
  completeUrl: string;
}

export interface RegisterPasskeyOptions extends PasskeyClientEndpoints {
  username: string;
  displayName?: string;
  userId?: string;
  inviteCode?: string;
  fetch?: typeof fetch;
  credentials?: CredentialsContainer;
}

export interface LoginWithPasskeyOptions extends PasskeyClientEndpoints {
  username: string;
  fetch?: typeof fetch;
  credentials?: CredentialsContainer;
}

export interface AddPasskeyOptions extends PasskeyClientEndpoints {
  fetch?: typeof fetch;
  credentials?: CredentialsContainer;
}

export interface PublicKeyCredentialCreationOptionsJSON {
  rp: PublicKeyCredentialRpEntity;
  user: PublicKeyCredentialUserEntityJSON;
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection: AuthenticatorSelectionCriteria;
  attestation: AttestationConveyancePreference;
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification: UserVerificationRequirement;
}

export interface PublicKeyCredentialRpEntity {
  id: string;
  name: string;
}

export interface PublicKeyCredentialUserEntityJSON {
  id: string;
  name: string;
  displayName: string;
}

export interface PublicKeyCredentialDescriptorJSON {
  type: PublicKeyCredentialType;
  id: string;
  transports?: AuthenticatorTransport[];
}

export interface RegistrationBeginResponse {
  challengeId: string;
  user: {
    id: string;
    username: string;
    displayName?: string;
  };
  publicKey: PublicKeyCredentialCreationOptionsJSON;
}

export interface AuthenticationBeginResponse {
  challengeId: string;
  user: {
    id: string;
    username: string;
    displayName?: string;
  };
  publicKey: PublicKeyCredentialRequestOptionsJSON;
}

export interface RegistrationCredentialJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData?: string;
    transports?: string[];
    publicKeyAlgorithm?: number;
    publicKey?: string;
  };
  authenticatorAttachment?: AuthenticatorAttachment;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  type: PublicKeyCredentialType;
}

export interface AuthenticationCredentialJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  authenticatorAttachment?: AuthenticatorAttachment;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  type: PublicKeyCredentialType;
}

export interface CompleteResponse {
  user: unknown;
  credential: unknown;
  session: unknown;
}

export class PasskeeperClientError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(input: { status: number; message: string; body: unknown; cause?: unknown }) {
    super(input.message, { cause: input.cause });
    this.name = "PasskeeperClientError";
    this.status = input.status;
    this.body = input.body;
  }
}

export async function registerPasskey(options: RegisterPasskeyOptions): Promise<CompleteResponse> {
  const fetchFn = resolveFetch(options.fetch);
  const normalized = normalizeRegisterOptions(options);
  const begin = await postJson<RegistrationBeginResponse>(fetchFn, normalized.beginUrl, {
    username: normalized.username,
    ...(normalized.displayName === undefined ? {} : { displayName: normalized.displayName }),
    ...(normalized.userId === undefined ? {} : { userId: normalized.userId }),
    ...(normalized.inviteCode === undefined ? {} : { inviteCode: normalized.inviteCode }),
  });
  const publicKey = convertPublicKeyOptions(
    () => creationOptionsFromJSON(begin.publicKey),
    "Passkeeper registration begin response contains invalid WebAuthn options.",
  );
  const credentials = resolveCredentials(options.credentials, "create");
  const credential = await credentials.create({
    publicKey,
  });

  if (!isPublicKeyCredential(credential)) {
    throw new Error("Passkey registration did not return a public key credential.");
  }

  return postJson<CompleteResponse>(fetchFn, normalized.completeUrl, {
    challengeId: begin.challengeId,
    userId: begin.user.id,
    credential: registrationCredentialToJSON(credential),
    ...(normalized.inviteCode === undefined ? {} : { inviteCode: normalized.inviteCode }),
  });
}

export async function addPasskey(options: AddPasskeyOptions): Promise<CompleteResponse> {
  const fetchFn = resolveFetch(options.fetch);
  const beginUrl = normalizeEndpointUrl(options.beginUrl, "beginUrl");
  const completeUrl = normalizeEndpointUrl(options.completeUrl, "completeUrl");
  const begin = await postJson<RegistrationBeginResponse>(fetchFn, beginUrl, {});
  const publicKey = convertPublicKeyOptions(
    () => creationOptionsFromJSON(begin.publicKey),
    "Passkeeper additional registration begin response contains invalid WebAuthn options.",
  );
  const credentials = resolveCredentials(options.credentials, "create");
  const credential = await credentials.create({ publicKey });

  if (!isPublicKeyCredential(credential)) {
    throw new Error("Additional passkey registration did not return a public key credential.");
  }

  return postJson<CompleteResponse>(fetchFn, completeUrl, {
    challengeId: begin.challengeId,
    userId: begin.user.id,
    credential: registrationCredentialToJSON(credential),
  });
}

export async function loginWithPasskey(options: LoginWithPasskeyOptions): Promise<CompleteResponse> {
  const fetchFn = resolveFetch(options.fetch);
  const normalized = normalizeLoginOptions(options);
  const begin = await postJson<AuthenticationBeginResponse>(fetchFn, normalized.beginUrl, {
    username: normalized.username,
  });
  const publicKey = convertPublicKeyOptions(
    () => requestOptionsFromJSON(begin.publicKey),
    "Passkeeper login begin response contains invalid WebAuthn options.",
  );
  const credentials = resolveCredentials(options.credentials, "get");
  const credential = await credentials.get({
    publicKey,
  });

  if (!isPublicKeyCredential(credential)) {
    throw new Error("Passkey login did not return a public key credential.");
  }

  return postJson<CompleteResponse>(fetchFn, normalized.completeUrl, {
    challengeId: begin.challengeId,
    credential: authenticationCredentialToJSON(credential),
  });
}

function normalizeRegisterOptions(options: RegisterPasskeyOptions): RegisterPasskeyOptions {
  return {
    ...options,
    beginUrl: normalizeEndpointUrl(options.beginUrl, "beginUrl"),
    completeUrl: normalizeEndpointUrl(options.completeUrl, "completeUrl"),
    username: normalizeRequiredString(options.username, "username"),
    ...(options.displayName === undefined
      ? {}
      : { displayName: normalizeRequiredString(options.displayName, "displayName") }),
    ...(options.userId === undefined ? {} : { userId: normalizeRequiredString(options.userId, "userId") }),
    ...(options.inviteCode === undefined
      ? {}
      : { inviteCode: normalizeRequiredString(options.inviteCode, "inviteCode") }),
  };
}

function normalizeLoginOptions(options: LoginWithPasskeyOptions): LoginWithPasskeyOptions {
  return {
    ...options,
    beginUrl: normalizeEndpointUrl(options.beginUrl, "beginUrl"),
    completeUrl: normalizeEndpointUrl(options.completeUrl, "completeUrl"),
    username: normalizeRequiredString(options.username, "username"),
  };
}

function normalizeEndpointUrl(value: string, field: string): string {
  return normalizeRequiredString(value, field);
}

function normalizeRequiredString(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function resolveFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  if (fetchFn !== undefined) {
    if (typeof fetchFn !== "function") {
      throw new Error("Passkeeper client fetch option must be a function.");
    }

    return fetchFn;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("Passkeeper client requires fetch. Pass a custom fetch implementation.");
  }

  return globalThis.fetch.bind(globalThis);
}

function resolveCredentials(
  credentials: CredentialsContainer | undefined,
  method: "create" | "get",
): CredentialsContainer {
  const resolved = credentials ?? globalThis.navigator?.credentials;

  if (
    typeof resolved !== "object" ||
    resolved === null ||
    typeof resolved[method] !== "function"
  ) {
    throw new Error(
      `Passkeeper client requires navigator.credentials.${method}. Pass a custom credentials implementation.`,
    );
  }

  return resolved;
}

function convertPublicKeyOptions<T>(convert: () => T, message: string): T {
  try {
    return convert();
  } catch (error) {
    throw new Error(message, { cause: error });
  }
}

export function creationOptionsFromJSON(
  options: PublicKeyCredentialCreationOptionsJSON,
): PublicKeyCredentialCreationOptions {
  const { excludeCredentials, ...rest } = options;

  return {
    ...rest,
    challenge: base64UrlDecode(options.challenge),
    user: {
      ...options.user,
      id: base64UrlDecode(options.user.id),
    },
    ...(excludeCredentials === undefined
      ? {}
      : {
          excludeCredentials: excludeCredentials.map((credential) => ({
            ...credential,
            id: base64UrlDecode(credential.id),
          })),
        }),
  };
}

export function requestOptionsFromJSON(
  options: PublicKeyCredentialRequestOptionsJSON,
): PublicKeyCredentialRequestOptions {
  const { allowCredentials, ...rest } = options;

  return {
    ...rest,
    challenge: base64UrlDecode(options.challenge),
    ...(allowCredentials === undefined
      ? {}
      : {
          allowCredentials: allowCredentials.map((credential) => ({
            ...credential,
            id: base64UrlDecode(credential.id),
          })),
        }),
  };
}

export function registrationCredentialToJSON(
  credential: PublicKeyCredential,
): RegistrationCredentialJSON {
  const response = credential.response;

  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("Credential response is not a registration response.");
  }

  return {
    id: credential.id,
    rawId: base64UrlEncode(new Uint8Array(credential.rawId)),
    response: {
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
      attestationObject: base64UrlEncode(new Uint8Array(response.attestationObject)),
      ...(typeof response.getAuthenticatorData === "function"
        ? { authenticatorData: base64UrlEncode(new Uint8Array(response.getAuthenticatorData())) }
        : {}),
      ...(typeof response.getTransports === "function" ? { transports: response.getTransports() } : {}),
      ...(typeof response.getPublicKeyAlgorithm === "function"
        ? { publicKeyAlgorithm: response.getPublicKeyAlgorithm() }
        : {}),
      ...(typeof response.getPublicKey === "function" && response.getPublicKey() !== null
        ? { publicKey: base64UrlEncode(new Uint8Array(response.getPublicKey() as ArrayBuffer)) }
        : {}),
    },
    ...authenticatorAttachmentProperty(credential.authenticatorAttachment),
    clientExtensionResults: credential.getClientExtensionResults(),
    type: "public-key",
  };
}

export function authenticationCredentialToJSON(
  credential: PublicKeyCredential,
): AuthenticationCredentialJSON {
  const response = credential.response;

  if (!(response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("Credential response is not an authentication response.");
  }

  return {
    id: credential.id,
    rawId: base64UrlEncode(new Uint8Array(credential.rawId)),
    response: {
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
      authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
      signature: base64UrlEncode(new Uint8Array(response.signature)),
      ...(response.userHandle === null
        ? {}
        : { userHandle: base64UrlEncode(new Uint8Array(response.userHandle)) }),
    },
    ...authenticatorAttachmentProperty(credential.authenticatorAttachment),
    clientExtensionResults: credential.getClientExtensionResults(),
    type: "public-key",
  };
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return encodeBase64urlNoPadding(bytes);
}

export function base64UrlDecode(value: string): ArrayBuffer {
  let bytes: Uint8Array;

  try {
    bytes = decodeBase64urlIgnorePadding(value);
  } catch (error) {
    throw new Error("Value must be valid base64url.", { cause: error });
  }

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function postJson<T>(fetchFn: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await readResponseBody(response);

    throw new PasskeeperClientError({
      status: response.status,
      body: responseBody,
      message: messageForFailedResponse(response.status, responseBody),
    });
  }

  return (await readSuccessfulJsonResponse(response)) as T;
}

async function readSuccessfulJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new PasskeeperClientError({
      status: response.status,
      body: null,
      message: "Passkeeper response must be valid JSON.",
      cause: error,
    });
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");

  if (contentType?.toLowerCase().includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text === "" ? null : text;
}

function messageForFailedResponse(status: number, body: unknown): string {
  if (isErrorBody(body) && body.message.trim() !== "") {
    return body.message;
  }

  if (isErrorBody(body) && body.error.trim() !== "") {
    return body.error;
  }

  return `Passkeeper request failed with status ${status}.`;
}

function isErrorBody(body: unknown): body is { error: string; message: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    "message" in body &&
    typeof body.error === "string" &&
    typeof body.message === "string"
  );
}

function isPublicKeyCredential(credential: Credential | null): credential is PublicKeyCredential {
  return credential !== null && credential.type === "public-key";
}

function authenticatorAttachmentProperty(
  value: string | null,
): { authenticatorAttachment: AuthenticatorAttachment } | Record<string, never> {
  if (value === "cross-platform" || value === "platform") {
    return { authenticatorAttachment: value };
  }

  return {};
}
