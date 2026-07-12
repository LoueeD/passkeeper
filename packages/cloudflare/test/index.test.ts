import { describe, expect, it } from "vitest";
import {
  type AuthenticationResponseJSON,
  type Challenge,
  type CreateChallengeInput,
  type PasskeeperInvite,
  type PasskeeperSession,
  type PasskeeperStorage,
  type PasskeeperUser,
  type PasskeyCredential,
  type RegistrationResponseJSON,
  type VerifyAuthentication,
  type VerifyRegistration,
} from "@passkeeper/core";
import { createPasskeeperRoutes } from "../src/index";
import type { PasskeeperRequestHook } from "../src/index";

describe("createPasskeeperRoutes", () => {
  it("requires secure cookies when SameSite=None is configured", () => {
    expect(() =>
      createPasskeeperRoutes({
        rpName: "Acme",
        rpId: "localhost",
        origin: "http://localhost:8787",
        storage: createStorage(),
        sessionCookie: {
          secure: false,
          sameSite: "None",
        },
      }),
    ).toThrow("sessionCookie.secure must be true when sessionCookie.sameSite is None.");
  });

  it("normalizes cookie name and path options", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      users: [user(now)],
      credentials: [credential(now)],
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      randomBytes: (size) => new Uint8Array(size).fill(2),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      verifyAuthentication: async () => ({
        verified: true,
        authenticationInfo: {
          credentialID: "credential-id",
          newCounter: 2,
        },
      }),
      sessionCookie: {
        name: " pk.sid ",
        path: " /auth ",
        secure: false,
      },
    });
    const begin = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/login/begin", {
        username: "jane@example.com",
      }),
    );
    const beginBody = await begin.json();
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/login/complete", {
        challengeId: beginBody.challengeId,
        credential: authenticationResponse(),
      }),
    );

    expect(response.headers.get("set-cookie")).toBe(
      "pk.sid=AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI; HttpOnly; Path=/auth; SameSite=Lax",
    );
  });

  it("rejects invalid cookie name and path options", () => {
    const options = {
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
    };

    expect(() =>
      createPasskeeperRoutes({
        ...options,
        sessionCookie: {
          name: "bad name",
        },
      }),
    ).toThrow("sessionCookie.name contains invalid cookie name characters.");
    expect(() =>
      createPasskeeperRoutes({
        ...options,
        sessionCookie: {
          path: "auth",
        },
      }),
    ).toThrow("sessionCookie.path must start with /");
    expect(() =>
      createPasskeeperRoutes({
        ...options,
        sessionCookie: {
          path: "/auth; HttpOnly=false",
        },
      }),
    ).toThrow("sessionCookie.path must start with /");
  });

  it("rejects invalid storage options during route creation", () => {
    expect(() =>
      createPasskeeperRoutes({
        rpName: "Acme",
        rpId: "localhost",
        origin: "http://localhost:8787",
        storage: {
          ...createStorage(),
          consumeInvite: undefined,
        } as unknown as PasskeeperStorage,
      }),
    ).toThrow("storage.consumeInvite must be a function.");
  });

  it("rejects invalid request body limits during route creation", () => {
    const options = {
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
    };

    for (const maxBodyBytes of [0, 1023, 1024.5, 1024 * 1024 + 1]) {
      expect(() => createPasskeeperRoutes({ ...options, maxBodyBytes })).toThrow(
        "maxBodyBytes must be an integer between 1024 and 1048576.",
      );
    }
  });

  it("normalizes custom base paths", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      randomBytes: (size) => new Uint8Array(size).fill(1),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      basePath: " /login/ ",
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/login/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("runs beforeRequest hooks for known auth routes", async () => {
    const seen: Array<{ method: string; path: string }> = [];
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      beforeRequest: ({ method, path }) => {
        seen.push({ method, path });
        return null;
      },
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
      }),
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([{ method: "POST", path: "/passkey/register/begin" }]);
  });

  it("rejects cross-origin POST requests before hooks or body parsing", async () => {
    let hookCalls = 0;
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      beforeRequest: () => {
        hookCalls += 1;
        return null;
      },
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/register/begin", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
        },
        body: "not-json",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_origin",
      message: "Request origin does not match the configured origin.",
    });
    expect(response.status).toBe(403);
    expect(hookCalls).toBe(0);
  });

  it("accepts a POST Origin matching the configured trusted origin", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest(
        "http://localhost:8787/auth/passkey/register/begin",
        { username: "jane@example.com" },
        { origin: "http://localhost:8787" },
      ),
    );

    expect(response.status).toBe(200);
  });

  it("allows beforeRequest hooks to short-circuit auth routes", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      beforeRequest: () =>
        Response.json(
          {
            error: "rate_limited",
          },
          {
            status: 429,
            headers: {
              "retry-after": "60",
            },
          },
        ),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "rate_limited" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("rejects non-function beforeRequest options during route creation", () => {
    expect(() =>
      createPasskeeperRoutes({
        rpName: "Acme",
        rpId: "localhost",
        origin: "http://localhost:8787",
        storage: createStorage(),
        beforeRequest: true as unknown as PasskeeperRequestHook,
      }),
    ).toThrow("beforeRequest must be a function.");
  });

  it("returns a configuration error when beforeRequest returns a non-Response value", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      beforeRequest: (() => true) as unknown as PasskeeperRequestHook,
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_config",
      message: "beforeRequest must return a Response, null, or undefined.",
    });
    expect(response.status).toBe(400);
  });

  it("does not run beforeRequest hooks for unknown routes", async () => {
    const seen: string[] = [];
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      beforeRequest: ({ path }) => {
        seen.push(path);
        return null;
      },
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(new Request("http://localhost:8787/auth/nope"));

    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
    expect(response.status).toBe(404);
    expect(seen).toEqual([]);
  });

  it("runs beforeRequest hooks for known routes before method checks", async () => {
    const seen: Array<{ method: string; path: string }> = [];
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      beforeRequest: ({ method, path }) => {
        seen.push({ method, path });
        return null;
      },
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(405);
    expect(seen).toEqual([{ method: "GET", path: "/passkey/login/begin" }]);
  });

  it("rejects invalid base path options", () => {
    const options = {
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
    };

    expect(() =>
      createPasskeeperRoutes({
        ...options,
        basePath: " ",
      }),
    ).toThrow("basePath must be a non-empty string.");
    expect(() =>
      createPasskeeperRoutes({
        ...options,
        basePath: "/auth?x=1",
      }),
    ).toThrow("basePath must be a URL path without query, hash, or control characters.");
    expect(() =>
      createPasskeeperRoutes({
        ...options,
        basePath: "/auth#frag",
      }),
    ).toThrow("basePath must be a URL path without query, hash, or control characters.");
  });

  it("handles registration begin", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      randomBytes: (size) => new Uint8Array(size).fill(1),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      sessionCookie: { secure: false },
    });

    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      challengeId: "AQEBAQEBAQEBAQEBAQEBAQ",
      user: {
        username: "jane@example.com",
        displayName: "Jane",
      },
      publicKey: {
        rp: {
          id: "localhost",
          name: "Acme",
        },
      },
    });
  });

  it("trims string request fields before dispatching to core services", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      invites: [
        {
          id: "invite_123",
          codeHash: "hash:launch-code",
          maxUses: 1,
          usedCount: 0,
          createdAt: now,
        },
      ],
    });
    const verifyRegistration: VerifyRegistration = async () => ({
      verified: true,
      registrationInfo: {
        fmt: "none",
        aaguid: "00000000-0000-0000-0000-000000000000",
        credential: {
          id: "credential-id",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        credentialType: "public-key",
        attestationObject: new Uint8Array(),
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "http://localhost:8787",
        rpID: "localhost",
      },
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      inviteRequired: true,
      randomBytes: (size) => new Uint8Array(size).fill(1),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      verifyRegistration,
      sessionCookie: { secure: false },
    });

    const begin = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: " jane@example.com ",
        displayName: " Jane ",
        userId: " user_custom ",
        inviteCode: " launch-code ",
      }),
    );
    const beginBody = await begin.json();
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/complete", {
        challengeId: ` ${beginBody.challengeId} `,
        userId: ` ${beginBody.user.id} `,
        credential: registrationResponse(),
        inviteCode: " launch-code ",
      }),
    );

    expect(begin.status).toBe(200);
    expect(beginBody.user).toMatchObject({
      id: "user_custom",
      username: "jane@example.com",
      displayName: "Jane",
    });
    expect(response.status).toBe(200);
    await expect(storage.getInviteByCodeHash("hash:launch-code")).resolves.toMatchObject({
      usedCount: 1,
    });
  });

  it("validates invite codes during registration begin without consuming them", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      invites: [
        {
          id: "invite_123",
          codeHash: "hash:launch-code",
          maxUses: 1,
          usedCount: 0,
          createdAt: now,
        },
      ],
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      inviteRequired: true,
      randomBytes: (size) => new Uint8Array(size).fill(1),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      sessionCookie: { secure: false },
    });

    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
        inviteCode: "launch-code",
      }),
    );

    expect(response.status).toBe(200);
    await expect(storage.getInviteByCodeHash("hash:launch-code")).resolves.toMatchObject({
      usedCount: 0,
    });
  });

  it("consumes invite codes during registration completion", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      invites: [
        {
          id: "invite_123",
          codeHash: "hash:launch-code",
          maxUses: 1,
          usedCount: 0,
          createdAt: now,
        },
      ],
    });
    const verifyRegistration: VerifyRegistration = async () => ({
      verified: true,
      registrationInfo: {
        fmt: "none",
        aaguid: "00000000-0000-0000-0000-000000000000",
        credential: {
          id: "credential-id",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        credentialType: "public-key",
        attestationObject: new Uint8Array(),
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "http://localhost:8787",
        rpID: "localhost",
      },
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      inviteRequired: true,
      randomBytes: (size) => new Uint8Array(size).fill(1),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      verifyRegistration,
      sessionCookie: { secure: false },
    });

    const begin = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
        inviteCode: "launch-code",
      }),
    );
    const beginBody = await begin.json();
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/complete", {
        challengeId: beginBody.challengeId,
        userId: beginBody.user.id,
        credential: registrationResponse(),
        inviteCode: "launch-code",
      }),
    );

    expect(response.status).toBe(200);
    await expect(storage.getInviteByCodeHash("hash:launch-code")).resolves.toMatchObject({
      usedCount: 1,
    });
  });

  it("returns a client error for invalid invite codes", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      inviteRequired: true,
      hashToken: async (token) => `hash:${token}`,
      sessionCookie: { secure: false },
    });

    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/begin", {
        username: "jane@example.com",
        displayName: "Jane",
        inviteCode: "missing-code",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "invalid_invite",
      message: "Invite code is not valid.",
    });
  });

  it("returns a client error for POST requests without a JSON content type", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "POST",
        body: JSON.stringify({ username: "jane@example.com" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_config",
      message: "Request body must use application/json.",
    });
    expect(response.status).toBe(400);
  });

  it("rejects media types that only contain application/json as a substring", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "POST",
        headers: {
          "content-type": "text/application/json; charset=utf-8",
        },
        body: JSON.stringify({ username: "jane@example.com" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_config",
      message: "Request body must use application/json.",
    });
    expect(response.status).toBe(400);
  });

  it("returns a client error for malformed JSON request bodies", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_config",
      message: "Request body must be valid JSON.",
    });
    expect(response.status).toBe(400);
  });

  it("rejects a declared request body larger than the configured limit", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
      maxBodyBytes: 1024,
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "POST",
        headers: {
          "content-length": "1025",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "request_too_large",
      message: "Request body is too large.",
    });
    expect(response.status).toBe(413);
  });

  it("stops reading a streamed request body when it exceeds the configured limit", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
      maxBodyBytes: 1024,
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"username":"${"a".repeat(1100)}"}`));
        controller.close();
      },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body,
        duplex: "half",
      } as RequestInit),
    );

    await expect(response.json()).resolves.toEqual({
      error: "request_too_large",
      message: "Request body is too large.",
    });
    expect(response.status).toBe(413);
  });

  it("returns a client error for non-object JSON request bodies", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "[]",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_config",
      message: "Request body must be a JSON object.",
    });
    expect(response.status).toBe(400);
  });

  it("returns a client error for missing required fields", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/login/begin", {}),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_config",
      message: "username must be a non-empty string.",
    });
    expect(response.status).toBe(400);
  });

  it("returns method not allowed for known routes with unsupported methods", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/passkey/login/begin", {
        method: "GET",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "method_not_allowed",
      message: "Method not allowed.",
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("returns not found for unknown routes", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(new Request("http://localhost:8787/auth/nope"));

    await expect(response.json()).resolves.toEqual({
      error: "Not found",
    });
    expect(response.status).toBe(404);
  });

  it("handles login complete and sets the session cookie", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      users: [user(now)],
      credentials: [credential(now)],
    });
    const verifyAuthentication: VerifyAuthentication = async () => ({
      verified: true,
      authenticationInfo: {
        credentialID: "credential-id",
        newCounter: 2,
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "http://localhost:8787",
        rpID: "localhost",
      },
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      randomBytes: (size) => new Uint8Array(size).fill(2),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      verifyAuthentication,
      sessionCookie: { secure: false },
    });

    const begin = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/login/begin", {
        username: "jane@example.com",
      }),
    );
    const beginBody = await begin.json();
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/login/complete", {
        challengeId: beginBody.challengeId,
        credential: authenticationResponse(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(
      "pk_session=AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI; HttpOnly; Path=/; SameSite=Lax",
    );
    expect(body).toMatchObject({
      user: {
        id: "user_123",
      },
      session: {
        id: "AgICAgICAgICAgICAgICAg",
        userId: "user_123",
      },
    });
    expect(body.session).not.toHaveProperty("tokenHash");
  });

  it("returns the current user from the session cookie", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage({
        users: [user(now)],
        sessions: [
          {
            id: "session_123",
            userId: "user_123",
            tokenHash: "hash:token-value",
            expiresAt: new Date("2026-01-01T00:05:00.000Z"),
            createdAt: now,
          },
        ],
      }),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      sessionCookie: { secure: false },
    });

    const response = await routes.handle(
      new Request("http://localhost:8787/auth/me", {
        headers: {
          cookie: "pk_session=token-value",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      user: {
        id: "user_123",
      },
      session: {
        id: "session_123",
        lastSeenAt: now.toISOString(),
      },
    });
    expect(body.session).not.toHaveProperty("tokenHash");
  });

  it("requires authentication to add a passkey", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/add/begin", {}),
    );

    await expect(response.json()).resolves.toEqual({
      error: "invalid_credential",
      message: "Authentication is required.",
    });
    expect(response.status).toBe(401);
  });

  it("adds a passkey for the authenticated session user", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      users: [user(now)],
      credentials: [credential(now)],
      sessions: [
        {
          id: "session_123",
          userId: "user_123",
          tokenHash: "hash:token-value",
          expiresAt: new Date("2026-01-01T00:05:00.000Z"),
          createdAt: now,
        },
      ],
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      randomBytes: (size) => new Uint8Array(size).fill(3),
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      verifyRegistration: async () => ({
        verified: true,
        registrationInfo: {
          fmt: "none",
          aaguid: "00000000-0000-0000-0000-000000000000",
          credential: {
            id: "second-credential-id",
            publicKey: new Uint8Array([4, 5, 6]),
            counter: 0,
          },
          credentialType: "public-key",
          attestationObject: new Uint8Array(),
          userVerified: true,
          credentialDeviceType: "singleDevice",
          credentialBackedUp: true,
          origin: "http://localhost:8787",
          rpID: "localhost",
        },
      }),
      sessionCookie: { secure: false },
    });
    const headers = { cookie: "pk_session=token-value" };
    const begin = await routes.handle(
      jsonRequest("http://localhost:8787/auth/passkey/register/add/begin", {}, headers),
    );
    const beginBody = await begin.json();
    const complete = await routes.handle(
      jsonRequest(
        "http://localhost:8787/auth/passkey/register/add/complete",
        {
          challengeId: beginBody.challengeId,
          userId: beginBody.user.id,
          credential: registrationResponse(),
        },
        headers,
      ),
    );
    const completeBody = await complete.json();

    expect(begin.status).toBe(200);
    expect(beginBody.publicKey.excludeCredentials).toMatchObject([{ id: "credential-id" }]);
    expect(complete.status).toBe(200);
    expect(completeBody.credential).toMatchObject({ credentialId: "second-credential-id" });
    expect(completeBody.session).not.toHaveProperty("tokenHash");
    await expect(storage.getCredential("second-credential-id")).resolves.toMatchObject({
      userId: "user_123",
    });
  });

  it("treats malformed or empty session cookie values as unauthenticated", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });

    for (const cookie of ["pk_session=%", "pk_session="]) {
      const response = await routes.handle(
        new Request("http://localhost:8787/auth/me", {
          headers: { cookie },
        }),
      );

      await expect(response.json()).resolves.toEqual({ user: null, session: null });
      expect(response.status).toBe(401);
    }
  });

  it("logs out and clears the session cookie", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createStorage({
      users: [user(now)],
      sessions: [
        {
          id: "session_123",
          userId: "user_123",
          tokenHash: "hash:token-value",
          expiresAt: new Date("2026-01-01T00:05:00.000Z"),
          createdAt: now,
        },
      ],
    });
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage,
      hashToken: async (token) => `hash:${token}`,
      now: () => now,
      sessionCookie: { secure: false },
    });

    const response = await routes.handle(
      new Request("http://localhost:8787/auth/logout", {
        method: "POST",
        headers: {
          cookie: "pk_session=token-value",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(
      "pk_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
    );
    await expect(storage.getSessionByTokenHash("hash:token-value")).resolves.toBeNull();
  });

  it("clears malformed session cookies during logout", async () => {
    const routes = createPasskeeperRoutes({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createStorage(),
      sessionCookie: { secure: false },
    });
    const response = await routes.handle(
      new Request("http://localhost:8787/auth/logout", {
        method: "POST",
        headers: { cookie: "pk_session=%" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(
      "pk_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
    );
  });
});

interface StorageOptions {
  users?: PasskeeperUser[];
  credentials?: PasskeyCredential[];
  challenges?: Challenge[];
  sessions?: PasskeeperSession[];
  invites?: PasskeeperInvite[];
}

function createStorage(options: StorageOptions = {}): PasskeeperStorage {
  const users = new Map<string, PasskeeperUser>();
  const credentials = new Map<string, PasskeyCredential>();
  const challenges = new Map<string, Challenge>();
  const sessions = new Map<string, PasskeeperSession>();
  const invites = new Map<string, PasskeeperInvite>();

  for (const nextUser of options.users ?? []) {
    users.set(nextUser.id, nextUser);
  }

  for (const nextCredential of options.credentials ?? []) {
    credentials.set(nextCredential.credentialId, nextCredential);
  }

  for (const nextChallenge of options.challenges ?? []) {
    challenges.set(nextChallenge.id, nextChallenge);
  }

  for (const nextSession of options.sessions ?? []) {
    sessions.set(nextSession.id, nextSession);
  }

  for (const nextInvite of options.invites ?? []) {
    invites.set(nextInvite.id, nextInvite);
  }

  return {
    async createChallenge(input: CreateChallengeInput) {
      challenges.set(input.id, input);
      return input;
    },
    async consumeChallenge(id) {
      const challenge = challenges.get(id) ?? null;
      challenges.delete(id);
      return challenge;
    },
    async getUser(id) {
      return users.get(id) ?? null;
    },
    async getUserByUsername(username) {
      return [...users.values()].find((nextUser) => nextUser.username === username) ?? null;
    },
    async createUser(input) {
      users.set(input.id, input);
      return input;
    },
    async listCredentials(userId) {
      return [...credentials.values()].filter((nextCredential) => nextCredential.userId === userId);
    },
    async getCredential(credentialId) {
      return credentials.get(credentialId) ?? null;
    },
    async createCredential(input) {
      credentials.set(input.credentialId, input);
      return input;
    },
    async updateCredentialCounter(input) {
      const existing = credentials.get(input.credentialId);

      if (existing === undefined || existing.counter !== input.previousCounter) {
        return false;
      }

      credentials.set(input.credentialId, {
        ...existing,
        counter: input.counter,
        lastUsedAt: input.lastUsedAt,
      });
      return true;
    },
    async createSession(input) {
      sessions.set(input.id, input);
      return input;
    },
    async getSessionByTokenHash(tokenHash) {
      return [...sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
    },
    async updateSessionLastSeen(input) {
      const session = sessions.get(input.id);

      if (session !== undefined) {
        sessions.set(input.id, {
          ...session,
          lastSeenAt: input.lastSeenAt,
        });
      }
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
    async createInvite(input) {
      invites.set(input.id, input);
      return input;
    },
    async getInviteByCodeHash(codeHash) {
      return [...invites.values()].find((invite) => invite.codeHash === codeHash) ?? null;
    },
    async consumeInvite(input) {
      for (const invite of invites.values()) {
        if (
          invite.codeHash === input.codeHash &&
          invite.usedCount < invite.maxUses &&
          (invite.expiresAt === undefined || invite.expiresAt.getTime() > input.now.getTime())
        ) {
          const consumed = {
            ...invite,
            usedCount: invite.usedCount + 1,
          };
          invites.set(invite.id, consumed);
          return consumed;
        }
      }

      return null;
    },
  };
}

function user(now: Date): PasskeeperUser {
  return {
    id: "user_123",
    username: "jane@example.com",
    displayName: "Jane",
    createdAt: now,
    updatedAt: now,
  };
}

function credential(now: Date): PasskeyCredential {
  return {
    id: "credential_123",
    userId: "user_123",
    credentialId: "credential-id",
    publicKey: "CQgH",
    counter: 1,
    transports: ["internal"],
    createdAt: now,
  };
}

function authenticationResponse(): AuthenticationResponseJSON {
  return {
    id: "credential-id",
    rawId: "credential-id",
    response: {
      clientDataJSON: "client-data-json",
      authenticatorData: "authenticator-data",
      signature: "signature",
    },
    clientExtensionResults: {},
    type: "public-key",
  };
}

function registrationResponse(): RegistrationResponseJSON {
  return {
    id: "credential-id",
    rawId: "credential-id",
    response: {
      clientDataJSON: "client-data-json",
      attestationObject: "attestation-object",
    },
    clientExtensionResults: {},
    type: "public-key",
  };
}

function jsonRequest(url: string, body: unknown, headers?: HeadersInit): Request {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");

  return new Request(url, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}
