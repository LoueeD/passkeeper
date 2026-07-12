import { describe, expect, it } from "vitest";
import {
  addPasskey,
  authenticationCredentialToJSON,
  base64UrlDecode,
  base64UrlEncode,
  creationOptionsFromJSON,
  loginWithPasskey,
  PasskeeperClientError,
  registerPasskey,
  registrationCredentialToJSON,
  requestOptionsFromJSON,
} from "../src/index";

describe("@passkeeper/client", () => {
  it("converts base64url values", () => {
    const bytes = new Uint8Array([1, 2, 3, 253, 254, 255]);

    expect(base64UrlEncode(bytes)).toBe("AQID_f7_");
    expect([...new Uint8Array(base64UrlDecode("AQID_f7_"))]).toEqual([...bytes]);
  });

  it("throws clear errors for invalid base64url values", () => {
    expect(() => base64UrlDecode("*")).toThrow("Value must be valid base64url.");
    expect(() =>
      creationOptionsFromJSON({
        rp: { id: "example.com", name: "Example" },
        user: {
          id: "AQID",
          name: "jane@example.com",
          displayName: "Jane",
        },
        challenge: "*",
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        timeout: 300000,
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        attestation: "none",
      }),
    ).toThrow("Value must be valid base64url.");
  });

  it("converts registration public key options for the browser", () => {
    const options = creationOptionsFromJSON({
      rp: { id: "example.com", name: "Example" },
      user: {
        id: "AQID",
        name: "jane@example.com",
        displayName: "Jane",
      },
      challenge: "BAUG",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 300000,
      excludeCredentials: [{ type: "public-key", id: "BwgJ", transports: ["internal"] }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      attestation: "none",
    });

    expect(bytesFromBufferSource(options.challenge)).toEqual([4, 5, 6]);
    expect(bytesFromBufferSource(options.user.id)).toEqual([1, 2, 3]);
    expect(options.excludeCredentials?.[0]?.id).toBeInstanceOf(ArrayBuffer);
  });

  it("converts authentication public key options for the browser", () => {
    const options = requestOptionsFromJSON({
      challenge: "AQID",
      timeout: 300000,
      rpId: "example.com",
      allowCredentials: [{ type: "public-key", id: "BAUG" }],
      userVerification: "preferred",
    });

    expect(bytesFromBufferSource(options.challenge)).toEqual([1, 2, 3]);
    expect(options.allowCredentials?.[0]?.id).toBeInstanceOf(ArrayBuffer);
  });

  it("allows optional credential descriptor lists", () => {
    const creationOptions = creationOptionsFromJSON({
      rp: { id: "example.com", name: "Example" },
      user: {
        id: "AQID",
        name: "jane@example.com",
        displayName: "Jane",
      },
      challenge: "BAUG",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 300000,
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      attestation: "none",
    });
    const requestOptions = requestOptionsFromJSON({
      challenge: "AQID",
      timeout: 300000,
      rpId: "example.com",
      userVerification: "preferred",
    });

    expect(creationOptions.excludeCredentials).toBeUndefined();
    expect(requestOptions.allowCredentials).toBeUndefined();
  });

  it("serializes registration credentials", () => {
    installCredentialResponseConstructors();
    const credential = createPublicKeyCredential(
      new FakeRegistrationResponse(),
    ) as unknown as PublicKeyCredential;

    expect(registrationCredentialToJSON(credential)).toEqual({
      id: "credential-id",
      rawId: "AQID",
      response: {
        clientDataJSON: "BAUG",
        attestationObject: "BwgJ",
        authenticatorData: "CgsM",
        transports: ["internal"],
        publicKeyAlgorithm: -7,
        publicKey: "DQ4P",
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    });
  });

  it("serializes authentication credentials", () => {
    installCredentialResponseConstructors();
    const credential = createPublicKeyCredential(
      new FakeAuthenticationResponse(),
    ) as unknown as PublicKeyCredential;

    expect(authenticationCredentialToJSON(credential)).toEqual({
      id: "credential-id",
      rawId: "AQID",
      response: {
        clientDataJSON: "BAUG",
        authenticatorData: "BwgJ",
        signature: "CgsM",
        userHandle: "DQ4P",
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    });
  });

  it("registers a passkey through begin, browser create, and complete", async () => {
    installCredentialResponseConstructors();
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch = createFetchMock(calls, [
      {
        challengeId: "challenge_123",
        user: { id: "AQID", username: "jane@example.com" },
        publicKey: {
          rp: { id: "example.com", name: "Example" },
          user: { id: "AQID", name: "jane@example.com", displayName: "Jane" },
          challenge: "BAUG",
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 300000,
          excludeCredentials: [],
          authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
          attestation: "none",
        },
      },
      { ok: true },
    ]);
    const credentials = {
      async create() {
        return createPublicKeyCredential(new FakeRegistrationResponse());
      },
    } as CredentialsContainer;

    await expect(
      registerPasskey({
        beginUrl: " /auth/passkey/register/begin ",
        completeUrl: " /auth/passkey/register/complete ",
        username: " jane@example.com ",
        displayName: " Jane ",
        inviteCode: " launch-code ",
        fetch,
        credentials,
      }),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      url: "/auth/passkey/register/begin",
      body: {
        username: "jane@example.com",
        displayName: "Jane",
        inviteCode: "launch-code",
      },
    });
    expect(calls[1]?.body).toMatchObject({
      challengeId: "challenge_123",
      userId: "AQID",
      inviteCode: "launch-code",
      credential: {
        id: "credential-id",
      },
    });
  });

  it("adds a passkey through authenticated registration endpoints", async () => {
    installCredentialResponseConstructors();
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch = createFetchMock(calls, [
      {
        challengeId: "challenge_add",
        user: { id: "AQID", username: "jane@example.com" },
        publicKey: {
          rp: { id: "example.com", name: "Example" },
          user: { id: "AQID", name: "jane@example.com", displayName: "Jane" },
          challenge: "BAUG",
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 300000,
          excludeCredentials: [{ type: "public-key", id: "BwgJ" }],
          authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
          attestation: "none",
        },
      },
      { ok: true },
    ]);
    const credentials = {
      async create() {
        return createPublicKeyCredential(new FakeRegistrationResponse());
      },
    } as CredentialsContainer;

    await expect(
      addPasskey({
        beginUrl: " /auth/passkey/register/add/begin ",
        completeUrl: " /auth/passkey/register/add/complete ",
        fetch,
        credentials,
      }),
    ).resolves.toEqual({ ok: true });

    expect(calls[0]).toEqual({
      url: "/auth/passkey/register/add/begin",
      body: {},
    });
    expect(calls[1]?.body).toMatchObject({
      challengeId: "challenge_add",
      userId: "AQID",
      credential: { id: "credential-id" },
    });
  });

  it("logs in with a passkey through begin, browser get, and complete", async () => {
    installCredentialResponseConstructors();
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch = createFetchMock(calls, [
      {
        challengeId: "challenge_123",
        user: { id: "user_123", username: "jane@example.com" },
        publicKey: {
          challenge: "AQID",
          timeout: 300000,
          rpId: "example.com",
          allowCredentials: [{ type: "public-key", id: "BAUG" }],
          userVerification: "required",
        },
      },
      { ok: true },
    ]);
    const credentials = {
      async get() {
        return createPublicKeyCredential(new FakeAuthenticationResponse());
      },
    } as CredentialsContainer;

    await expect(
      loginWithPasskey({
        beginUrl: " /auth/passkey/login/begin ",
        completeUrl: " /auth/passkey/login/complete ",
        username: " jane@example.com ",
        fetch,
        credentials,
      }),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      url: "/auth/passkey/login/begin",
      body: {
        username: "jane@example.com",
      },
    });
    expect(calls[1]?.body).toMatchObject({
      challengeId: "challenge_123",
      credential: {
        id: "credential-id",
      },
    });
  });

  it("rejects empty client options before network or WebAuthn work", async () => {
    let fetchCalls = 0;
    const fetch = (async () => {
      fetchCalls += 1;
      return new Response("{}");
    }) as typeof globalThis.fetch;
    const credentials = {
      async create() {
        throw new Error("credentials.create should not run");
      },
      async get() {
        throw new Error("credentials.get should not run");
      },
    } as unknown as CredentialsContainer;

    await expect(
      registerPasskey({
        beginUrl: " ",
        completeUrl: "/auth/passkey/register/complete",
        username: "jane@example.com",
        fetch,
        credentials,
      }),
    ).rejects.toThrow("beginUrl must be a non-empty string.");
    await expect(
      registerPasskey({
        beginUrl: "/auth/passkey/register/begin",
        completeUrl: "/auth/passkey/register/complete",
        username: " ",
        fetch,
        credentials,
      }),
    ).rejects.toThrow("username must be a non-empty string.");
    await expect(
      loginWithPasskey({
        beginUrl: "/auth/passkey/login/begin",
        completeUrl: " ",
        username: "jane@example.com",
        fetch,
        credentials,
      }),
    ).rejects.toThrow("completeUrl must be a non-empty string.");

    expect(fetchCalls).toBe(0);
  });

  it("throws response details when begin requests fail with JSON errors", async () => {
    const fetch = createFetchMock([], [
      {
        body: {
          error: "invalid_invite",
          message: "Invite code is not valid.",
        },
        status: 401,
      },
    ]);

    await expect(
      registerPasskey({
        beginUrl: "/auth/passkey/register/begin",
        completeUrl: "/auth/passkey/register/complete",
        username: "jane@example.com",
        fetch,
        credentials: {} as CredentialsContainer,
      }),
    ).rejects.toMatchObject({
      name: "PasskeeperClientError",
      status: 401,
      message: "Invite code is not valid.",
      body: {
        error: "invalid_invite",
        message: "Invite code is not valid.",
      },
    });
  });

  it("throws fallback response details when requests fail without JSON errors", async () => {
    await expect(
      loginWithPasskey({
        beginUrl: "/auth/passkey/login/begin",
        completeUrl: "/auth/passkey/login/complete",
        username: "jane@example.com",
        fetch: createFetchMock([], [
          {
            body: "Too many requests",
            contentType: "text/plain",
            status: 429,
          },
        ]),
        credentials: {} as CredentialsContainer,
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Passkeeper request failed with status 429.",
      body: "Too many requests",
    });
  });

  it("throws response details when successful responses are not JSON", async () => {
    await expect(
      loginWithPasskey({
        beginUrl: "/auth/passkey/login/begin",
        completeUrl: "/auth/passkey/login/complete",
        username: "jane@example.com",
        fetch: createFetchMock([], [
          {
            body: "ok",
            contentType: "text/plain",
            status: 200,
          },
        ]),
        credentials: {} as CredentialsContainer,
      }),
    ).rejects.toMatchObject({
      name: "PasskeeperClientError",
      status: 200,
      message: "Passkeeper response must be valid JSON.",
      body: null,
    });
  });

  it("throws clear errors when registration begin returns invalid WebAuthn options", async () => {
    const fetch = createFetchMock([], [
      {
        challengeId: "challenge_123",
        user: { id: "AQID", username: "jane@example.com" },
        publicKey: {
          rp: { id: "example.com", name: "Example" },
          user: { id: "AQID", name: "jane@example.com", displayName: "Jane" },
          challenge: "*",
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 300000,
          authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
          attestation: "none",
        },
      },
    ]);
    const credentials = {
      async create() {
        throw new Error("credentials.create should not run");
      },
    } as unknown as CredentialsContainer;

    await expect(
      registerPasskey({
        beginUrl: "/auth/passkey/register/begin",
        completeUrl: "/auth/passkey/register/complete",
        username: "jane@example.com",
        fetch,
        credentials,
      }),
    ).rejects.toThrow("Passkeeper registration begin response contains invalid WebAuthn options.");
  });

  it("throws clear errors when login begin returns invalid WebAuthn options", async () => {
    const fetch = createFetchMock([], [
      {
        challengeId: "challenge_123",
        user: { id: "user_123", username: "jane@example.com" },
        publicKey: {
          challenge: "*",
          timeout: 300000,
          rpId: "example.com",
          allowCredentials: [{ type: "public-key", id: "BAUG" }],
          userVerification: "required",
        },
      },
    ]);
    const credentials = {
      async get() {
        throw new Error("credentials.get should not run");
      },
    } as unknown as CredentialsContainer;

    await expect(
      loginWithPasskey({
        beginUrl: "/auth/passkey/login/begin",
        completeUrl: "/auth/passkey/login/complete",
        username: "jane@example.com",
        fetch,
        credentials,
      }),
    ).rejects.toThrow("Passkeeper login begin response contains invalid WebAuthn options.");
  });

  it("throws clear setup errors when fetch is unavailable", async () => {
    const originalFetch = globalThis.fetch;

    try {
      Object.defineProperty(globalThis, "fetch", {
        value: undefined,
        configurable: true,
      });

      await expect(
        loginWithPasskey({
          beginUrl: "/auth/passkey/login/begin",
          completeUrl: "/auth/passkey/login/complete",
          username: "jane@example.com",
          credentials: {} as CredentialsContainer,
        }),
      ).rejects.toThrow("Passkeeper client requires fetch. Pass a custom fetch implementation.");
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        value: originalFetch,
        configurable: true,
      });
    }
  });

  it("throws clear setup errors for invalid custom fetch implementations", async () => {
    await expect(
      loginWithPasskey({
        beginUrl: "/auth/passkey/login/begin",
        completeUrl: "/auth/passkey/login/complete",
        username: "jane@example.com",
        fetch: {} as typeof globalThis.fetch,
        credentials: { get: async () => null } as unknown as CredentialsContainer,
      }),
    ).rejects.toThrow("Passkeeper client fetch option must be a function.");
  });

  it("throws clear setup errors when navigator credentials are unavailable", async () => {
    const originalNavigator = globalThis.navigator;

    try {
      Object.defineProperty(globalThis, "navigator", {
        value: undefined,
        configurable: true,
      });

      await expect(
        loginWithPasskey({
          beginUrl: "/auth/passkey/login/begin",
          completeUrl: "/auth/passkey/login/complete",
          username: "jane@example.com",
          fetch: createFetchMock([], [
            {
              challengeId: "challenge_123",
              user: { id: "user_123", username: "jane@example.com" },
              publicKey: {
                challenge: "AQID",
                timeout: 300000,
                rpId: "example.com",
                allowCredentials: [{ type: "public-key", id: "BAUG" }],
                userVerification: "required",
              },
            },
          ]),
        }),
      ).rejects.toThrow(
        "Passkeeper client requires navigator.credentials.get. Pass a custom credentials implementation.",
      );
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });

  it("throws clear setup errors for invalid custom credentials implementations", async () => {
    await expect(
      registerPasskey({
        beginUrl: "/auth/passkey/register/begin",
        completeUrl: "/auth/passkey/register/complete",
        username: "jane@example.com",
        fetch: createFetchMock([], [
          {
            challengeId: "challenge_123",
            user: { id: "AQID", username: "jane@example.com" },
            publicKey: {
              rp: { id: "example.com", name: "Example" },
              user: { id: "AQID", name: "jane@example.com", displayName: "Jane" },
              challenge: "BAUG",
              pubKeyCredParams: [{ type: "public-key", alg: -7 }],
              timeout: 300000,
              authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
              attestation: "none",
            },
          },
        ]),
        credentials: { get: async () => null } as unknown as CredentialsContainer,
      }),
    ).rejects.toThrow(
      "Passkeeper client requires navigator.credentials.create. Pass a custom credentials implementation.",
    );
    await expect(
      loginWithPasskey({
        beginUrl: "/auth/passkey/login/begin",
        completeUrl: "/auth/passkey/login/complete",
        username: "jane@example.com",
        fetch: createFetchMock([], [
          {
            challengeId: "challenge_123",
            user: { id: "user_123", username: "jane@example.com" },
            publicKey: {
              challenge: "AQID",
              timeout: 300000,
              rpId: "example.com",
              allowCredentials: [{ type: "public-key", id: "BAUG" }],
              userVerification: "required",
            },
          },
        ]),
        credentials: { create: async () => null } as unknown as CredentialsContainer,
      }),
    ).rejects.toThrow(
      "Passkeeper client requires navigator.credentials.get. Pass a custom credentials implementation.",
    );
  });
});

interface FetchMockResponse {
  body: unknown;
  contentType?: string;
  status?: number;
}

class FakeRegistrationResponse {
  clientDataJSON = new Uint8Array([4, 5, 6]).buffer;
  attestationObject = new Uint8Array([7, 8, 9]).buffer;

  getAuthenticatorData(): ArrayBuffer {
    return new Uint8Array([10, 11, 12]).buffer;
  }

  getTransports(): string[] {
    return ["internal"];
  }

  getPublicKeyAlgorithm(): number {
    return -7;
  }

  getPublicKey(): ArrayBuffer {
    return new Uint8Array([13, 14, 15]).buffer;
  }
}

class FakeAuthenticationResponse {
  clientDataJSON = new Uint8Array([4, 5, 6]).buffer;
  authenticatorData = new Uint8Array([7, 8, 9]).buffer;
  signature = new Uint8Array([10, 11, 12]).buffer;
  userHandle = new Uint8Array([13, 14, 15]).buffer;
}

function createPublicKeyCredential(response: unknown): Partial<PublicKeyCredential> {
  return {
    id: "credential-id",
    rawId: new Uint8Array([1, 2, 3]).buffer,
    response: response as AuthenticatorResponse,
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => ({}),
    type: "public-key",
  };
}

function installCredentialResponseConstructors(): void {
  Object.defineProperty(globalThis, "AuthenticatorAttestationResponse", {
    value: FakeRegistrationResponse,
    configurable: true,
  });
  Object.defineProperty(globalThis, "AuthenticatorAssertionResponse", {
    value: FakeAuthenticationResponse,
    configurable: true,
  });
}

function createFetchMock(
  calls: Array<{ url: string; body: unknown }>,
  responses: Array<unknown | FetchMockResponse>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });

    const response = responses.shift();
    const body =
      typeof response === "object" && response !== null && "body" in response ? response.body : response;
    const status =
      isFetchMockResponse(response) && response.status !== undefined
        ? response.status
        : 200;
    const contentType =
      isFetchMockResponse(response) && response.contentType !== undefined
        ? response.contentType
        : "application/json";

    return new Response(contentType === "application/json" ? JSON.stringify(body) : String(body), {
      status,
      headers: {
        "content-type": contentType,
      },
    });
  }) as typeof fetch;
}

function isFetchMockResponse(response: unknown): response is FetchMockResponse {
  return typeof response === "object" && response !== null && "body" in response;
}

function bytesFromBufferSource(source: BufferSource): number[] {
  if (source instanceof ArrayBuffer) {
    return [...new Uint8Array(source)];
  }

  return [...new Uint8Array(source.buffer, source.byteOffset, source.byteLength)];
}
