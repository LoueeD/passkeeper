import { describe, expect, it } from "vitest";
import {
  PasskeeperError,
  createPasskeeper,
  defaultVerifyAuthentication,
  type Challenge,
  type CreateChallengeInput,
  type AuthenticationResponseJSON,
  type PasskeeperUser,
  type PasskeeperInvite,
  type PasskeeperSession,
  type PasskeyCredential,
  type PasskeeperStorage,
  type RegistrationResponseJSON,
  type VerifyAuthentication,
  type VerifyRegistration,
} from "../src/index";

describe("createPasskeeper", () => {
  it("normalizes relying party configuration", () => {
    const passkeeper = createPasskeeper({
      rpName: " Acme ",
      rpId: " acme.com ",
      origin: "https://app.acme.com/path?ignored=true",
      storage: createMemoryStorage(),
    });

    expect(passkeeper.config).toEqual({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      challengeTtlSeconds: 300,
      sessionTtlSeconds: 2592000,
    });
  });

  it("rejects insecure non-localhost origins", () => {
    expect(() =>
      createPasskeeper({
        rpName: "Acme",
        rpId: "acme.com",
        origin: "http://app.acme.com",
        storage: createMemoryStorage(),
      }),
    ).toThrow(PasskeeperError);
  });

  it("allows localhost origins for development", () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "localhost",
      origin: "http://localhost:8787",
      storage: createMemoryStorage(),
    });

    expect(passkeeper.config.origin).toBe("http://localhost:8787");
  });

  it("rejects relying party IDs that do not match the origin hostname", () => {
    expect(() =>
      createPasskeeper({
        rpName: "Acme",
        rpId: "other.example.com",
        origin: "https://app.acme.com",
        storage: createMemoryStorage(),
      }),
    ).toThrow(PasskeeperError);
  });

  it("rejects storage objects missing required methods", () => {
    expect(() =>
      createPasskeeper({
        rpName: "Acme",
        rpId: "acme.com",
        origin: "https://app.acme.com",
        storage: {
          ...createMemoryStorage(),
          consumeInvite: undefined,
        } as unknown as PasskeeperStorage,
      }),
    ).toThrow("storage.consumeInvite must be a function.");
  });

  it("allows relying party IDs that are parent domains of the origin hostname", () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
    });

    expect(passkeeper.config.rpId).toBe("acme.com");
  });

  it("does not allow partial hostname suffix matches for relying party IDs", () => {
    expect(() =>
      createPasskeeper({
        rpName: "Acme",
        rpId: "me.com",
        origin: "https://acme.com",
        storage: createMemoryStorage(),
      }),
    ).toThrow(PasskeeperError);
  });

  it("rejects custom randomBytes implementations that return the wrong type", async () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
      randomBytes: (() => [1, 2, 3]) as unknown as (size: number) => Uint8Array,
    });

    await expect(
      passkeeper.challenges.create({
        type: "registration",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "randomBytes must return a Uint8Array.",
    });
  });

  it("rejects custom randomBytes implementations that return the wrong byte length", async () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
      randomBytes: () => new Uint8Array(1),
    });

    await expect(
      passkeeper.challenges.create({
        type: "registration",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "randomBytes must return the requested number of bytes.",
    });
  });

  it("rejects custom hashToken implementations that resolve to the wrong type", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage({
        users: [
          {
            id: "user_123",
            username: "jane@example.com",
            displayName: "Jane",
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      randomBytes: (size) => new Uint8Array(size).fill(1),
      hashToken: (async () => 123) as unknown as (token: string) => Promise<string>,
    });

    await expect(
      passkeeper.sessions.create({
        userId: "user_123",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "hashToken must resolve to a non-empty string.",
    });
  });

  it("rejects custom hashToken implementations that resolve to an empty string", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage({
        users: [
          {
            id: "user_123",
            username: "jane@example.com",
            displayName: "Jane",
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      randomBytes: (size) => new Uint8Array(size).fill(1),
      hashToken: async () => " ",
    });

    await expect(
      passkeeper.sessions.create({
        userId: "user_123",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "hashToken must resolve to a non-empty string.",
    });
  });

  it("rejects custom now implementations that return an invalid date", async () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
      now: () => new Date("not-a-date"),
      randomBytes: (size) => new Uint8Array(size).fill(1),
    });

    await expect(
      passkeeper.challenges.create({
        type: "registration",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "now must return a valid Date.",
    });
  });

  it("rejects custom now implementations that return the wrong type", async () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
      now: (() => "2026-01-01T00:00:00.000Z") as unknown as () => Date,
      randomBytes: (size) => new Uint8Array(size).fill(1),
    });

    await expect(
      passkeeper.challenges.create({
        type: "registration",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "now must return a valid Date.",
    });
  });


  it("creates and stores challenges with deterministic dependencies", async () => {
    const storage = createMemoryStorage();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      challengeTtlSeconds: 60,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(1),
    });

    const challenge = await passkeeper.challenges.create({
      type: "registration",
      userId: " user_123 ",
    });

    expect(challenge).toEqual({
      id: "AQEBAQEBAQEBAQEBAQEBAQ",
      userId: "user_123",
      type: "registration",
      challenge: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
      createdAt: now,
      expiresAt: new Date("2026-01-01T00:01:00.000Z"),
    });
    await expect(
      passkeeper.challenges.create({
        type: "registration",
        userId: " ",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "userId must be a non-empty string.",
    });
  });

  it("consumes a valid challenge once", async () => {
    const storage = createMemoryStorage();
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytes: (size) => new Uint8Array(size).fill(2),
    });

    const challenge = await passkeeper.challenges.create({
      type: "authentication",
    });

    await expect(
      passkeeper.challenges.consume({
        id: ` ${challenge.id} `,
        type: "authentication",
      }),
    ).resolves.toEqual(challenge);

    await expect(
      passkeeper.challenges.consume({
        id: challenge.id,
        type: "authentication",
      }),
    ).rejects.toMatchObject({
      code: "challenge_not_found",
    });
    await expect(
      passkeeper.challenges.consume({
        id: " ",
        type: "authentication",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "challengeId must be a non-empty string.",
    });
  });

  it("rejects expired challenges", async () => {
    const storage = createMemoryStorage();
    let currentTime = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      challengeTtlSeconds: 30,
      now: () => currentTime,
      randomBytes: (size) => new Uint8Array(size).fill(3),
    });

    const challenge = await passkeeper.challenges.create({
      type: "registration",
    });

    currentTime = new Date("2026-01-01T00:00:30.000Z");

    await expect(
      passkeeper.challenges.consume({
        id: challenge.id,
        type: "registration",
      }),
    ).rejects.toMatchObject({
      code: "challenge_expired",
    });
  });

  it("begins registration by creating a user and public key options", async () => {
    const storage = createMemoryStorage();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      challengeTtlSeconds: 90,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(4),
    });

    const result = await passkeeper.register.begin({
      username: " Jane@Example.com ",
      displayName: " Jane ",
    });

    expect(result.user).toEqual({
      id: "BAQEBAQEBAQEBAQEBAQEBA",
      username: "jane@example.com",
      displayName: "Jane",
      createdAt: now,
      updatedAt: now,
    });
    expect(result.challengeId).toBe("BAQEBAQEBAQEBAQEBAQEBA");
    expect(result.publicKey).toEqual({
      rp: {
        id: "acme.com",
        name: "Acme",
      },
      user: {
        id: "BAQEBAQEBAQEBAQEBAQEBA",
        name: "jane@example.com",
        displayName: "Jane",
      },
      challenge: "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ",
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 90000,
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      attestation: "none",
    });
  });

  it("trims custom registration user IDs and rejects empty values", async () => {
    const storage = createMemoryStorage();
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytes: (size) => new Uint8Array(size).fill(4),
    });

    const result = await passkeeper.register.begin({
      username: "jane@example.com",
      userId: " custom-user ",
    });

    expect(result.user.id).toBe("custom-user");
    expect(result.publicKey.user.id).toBe("custom-user");
    await expect(
      passkeeper.register.begin({
        username: "alex@example.com",
        userId: " ",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "userId must be a non-empty string.",
    });
  });

  it("requires the additional-passkey flow for existing users with credentials", async () => {
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      ],
      credentials: [
        {
          id: "credential_123",
          userId: "user_123",
          credentialId: "credential-id",
          publicKey: "public-key",
          counter: 0,
          transports: ["internal"],
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytes: (size) => new Uint8Array(size).fill(5),
    });

    await expect(
      passkeeper.register.begin({
        username: "jane@example.com",
      }),
    ).rejects.toMatchObject({
      code: "invalid_credential",
      message: "Username is already registered. Authenticate before adding another passkey.",
    });

    const result = await passkeeper.register.add.begin({ userId: "user_123" });

    expect(result.user.id).toBe("user_123");
    expect(result.publicKey.user.displayName).toBe("Jane");
    expect(result.publicKey.excludeCredentials).toEqual([
      {
        type: "public-key",
        id: "credential-id",
        transports: ["internal"],
      },
    ]);
  });

  it("does not accept additional-passkey challenges in initial registration", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(5),
    });
    const begin = await passkeeper.register.add.begin({ userId: "user_123" });

    await expect(
      passkeeper.register.complete({
        challengeId: begin.challengeId,
        userId: "user_123",
        credential: createRegistrationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_challenge",
      message: "Challenge type does not match the expected flow.",
    });
  });

  it("completes registration by verifying and storing a credential", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const verifyRegistration: VerifyRegistration = async (options) => {
      expect(options).toEqual({
        response: createRegistrationResponse(),
        expectedChallenge: "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ",
        expectedOrigin: "https://app.acme.com",
        expectedRPID: "acme.com",
        requireUserVerification: true,
      });

      return {
        verified: true,
        registrationInfo: {
          fmt: "none",
          aaguid: "00000000-0000-0000-0000-000000000000",
          credential: {
            id: "credential-id",
            publicKey: new Uint8Array([9, 8, 7]),
            counter: 42,
            transports: ["internal", "hybrid"],
          },
          credentialType: "public-key",
          attestationObject: new Uint8Array(),
          userVerified: true,
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
          origin: "https://app.acme.com",
          rpID: "acme.com",
        },
      };
    };
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(4),
      verifyRegistration,
    });
    const begin = await passkeeper.register.begin({
      username: "jane@example.com",
    });

    const result = await passkeeper.register.complete({
      challengeId: begin.challengeId,
      userId: "user_123",
      credential: createRegistrationResponse(),
    });

    expect(result).toEqual({
      user: {
        id: "user_123",
        username: "jane@example.com",
        displayName: "Jane",
        createdAt: now,
        updatedAt: now,
      },
      credential: {
        id: "BAQEBAQEBAQEBAQEBAQEBA",
        userId: "user_123",
        credentialId: "credential-id",
        publicKey: "CQgH",
        counter: 42,
        transports: ["internal", "hybrid"],
        backedUp: true,
        createdAt: now,
      },
      verified: true,
    });
  });

  it("rejects empty registration completion IDs before reading storage", async () => {
    const storage = createMemoryStorage();
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
    });

    await expect(
      passkeeper.register.complete({
        challengeId: " ",
        userId: "user_123",
        credential: createRegistrationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "challengeId must be a non-empty string.",
    });
    await expect(
      passkeeper.register.complete({
        challengeId: "challenge_123",
        userId: " ",
        credential: createRegistrationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "userId must be a non-empty string.",
    });
  });

  it("rejects registration completion when verification fails", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(6),
      verifyRegistration: async () => ({ verified: false }),
    });
    const begin = await passkeeper.register.add.begin({ userId: "user_123" });

    await expect(
      passkeeper.register.add.complete({
        challengeId: begin.challengeId,
        userId: "user_123",
        credential: createRegistrationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "verification_failed",
    });
  });

  it("rejects registration completion for an already registered credential", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
      credentials: [
        {
          id: "stored_credential",
          userId: "user_123",
          credentialId: "credential-id",
          publicKey: "stored-public-key",
          counter: 0,
          createdAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(7),
      verifyRegistration: async () => ({
        verified: true,
        registrationInfo: {
          fmt: "none",
          aaguid: "00000000-0000-0000-0000-000000000000",
          credential: {
            id: "credential-id",
            publicKey: new Uint8Array([1]),
            counter: 0,
          },
          credentialType: "public-key",
          attestationObject: new Uint8Array(),
          userVerified: true,
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
          origin: "https://app.acme.com",
        },
      }),
    });
    const begin = await passkeeper.register.add.begin({ userId: "user_123" });

    await expect(
      passkeeper.register.add.complete({
        challengeId: begin.challengeId,
        userId: "user_123",
        credential: createRegistrationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_credential",
    });
  });

  it("begins authentication with allowed credentials for an existing user", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
      credentials: [
        {
          id: "credential_123",
          userId: "user_123",
          credentialId: "credential-id",
          publicKey: "CQgH",
          counter: 42,
          transports: ["internal"],
          createdAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      challengeTtlSeconds: 120,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(8),
    });

    const result = await passkeeper.login.begin({
      username: " Jane@Example.com ",
    });

    expect(result).toEqual({
      challengeId: "CAgICAgICAgICAgICAgICA",
      user: {
        id: "user_123",
        username: "jane@example.com",
        displayName: "Jane",
        createdAt: now,
        updatedAt: now,
      },
      publicKey: {
        challenge: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg",
        timeout: 120000,
        rpId: "acme.com",
        allowCredentials: [
          {
            type: "public-key",
            id: "credential-id",
            transports: ["internal"],
          },
        ],
        userVerification: "required",
      },
    });
  });

  it("rejects authentication begin for a user without credentials", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage({
        users: [
          {
            id: "user_123",
            username: "jane@example.com",
            displayName: "Jane",
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    });

    await expect(
      passkeeper.login.begin({
        username: "jane@example.com",
      }),
    ).rejects.toMatchObject({
      code: "credential_not_found",
    });
  });

  it("completes authentication and updates the credential counter", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
      credentials: [
        {
          id: "credential_123",
          userId: "user_123",
          credentialId: "credential-id",
          publicKey: "CQgH",
          counter: 42,
          transports: ["internal"],
          createdAt: now,
        },
      ],
    });
    const verifyAuthentication: VerifyAuthentication = async (options) => {
      expect(options).toEqual({
        response: createAuthenticationResponse(),
        expectedChallenge: "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk",
        expectedOrigin: "https://app.acme.com",
        expectedRPID: "acme.com",
        credential: {
          id: "credential-id",
          publicKey: new Uint8Array([9, 8, 7]),
          counter: 42,
          transports: ["internal"],
        },
        requireUserVerification: true,
      });

      return {
        verified: true,
        authenticationInfo: {
          credentialID: "credential-id",
          newCounter: 43,
          userVerified: true,
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
          origin: "https://app.acme.com",
          rpID: "acme.com",
        },
      };
    };
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(9),
      verifyAuthentication,
    });
    const begin = await passkeeper.login.begin({
      username: "jane@example.com",
    });

    const result = await passkeeper.login.complete({
      challengeId: begin.challengeId,
      credential: createAuthenticationResponse(),
    });

    expect(result).toEqual({
      user: {
        id: "user_123",
        username: "jane@example.com",
        displayName: "Jane",
        createdAt: now,
        updatedAt: now,
      },
      credential: {
        id: "credential_123",
        userId: "user_123",
        credentialId: "credential-id",
        publicKey: "CQgH",
        counter: 43,
        transports: ["internal"],
        createdAt: now,
        lastUsedAt: now,
      },
      verified: true,
    });
    await expect(storage.getCredential("credential-id")).resolves.toMatchObject({
      counter: 43,
      lastUsedAt: now,
    });
  });

  it("rejects invalid authentication completion inputs before storage lookups", async () => {
    const storage = createMemoryStorage();
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
    });

    await expect(
      passkeeper.login.complete({
        challengeId: " ",
        credential: createAuthenticationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "challengeId must be a non-empty string.",
    });
    await expect(
      passkeeper.login.complete({
        challengeId: "challenge_123",
        credential: null as unknown as ReturnType<typeof createAuthenticationResponse>,
      }),
    ).rejects.toMatchObject({
      code: "invalid_credential",
      message: "Authentication credential must be an object.",
    });
    await expect(
      passkeeper.login.complete({
        challengeId: "challenge_123",
        credential: {
          ...createAuthenticationResponse(),
          id: " ",
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_credential",
      message: "Authentication credential id must be a non-empty string.",
    });
  });

  it("rejects authentication completion when the credential counter update races", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
      credentials: [
        {
          id: "credential_123",
          userId: "user_123",
          credentialId: "credential-id",
          publicKey: "CQgH",
          counter: 42,
          createdAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(9),
      verifyAuthentication: async () => {
        await storage.updateCredentialCounter({
          credentialId: "credential-id",
          previousCounter: 42,
          counter: 43,
          lastUsedAt: now,
        });

        return {
          verified: true,
          authenticationInfo: {
            credentialID: "credential-id",
            newCounter: 43,
          },
        };
      },
    });
    const begin = await passkeeper.login.begin({
      username: "jane@example.com",
    });

    await expect(
      passkeeper.login.complete({
        challengeId: begin.challengeId,
        credential: createAuthenticationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "verification_failed",
    });
  });

  it("rejects authentication completion when verification fails", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
      credentials: [
        {
          id: "credential_123",
          userId: "user_123",
          credentialId: "credential-id",
          publicKey: "CQgH",
          counter: 42,
          createdAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(10),
      verifyAuthentication: async () => ({
        verified: false,
        authenticationInfo: {
          credentialID: "credential-id",
          newCounter: 43,
          userVerified: false,
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
          origin: "https://app.acme.com",
          rpID: "acme.com",
        },
      }),
    });
    const begin = await passkeeper.login.begin({
      username: "jane@example.com",
    });

    await expect(
      passkeeper.login.complete({
        challengeId: begin.challengeId,
        credential: createAuthenticationResponse(),
      }),
    ).rejects.toMatchObject({
      code: "verification_failed",
    });
  });

  it("creates sessions with a hashed token", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      sessionTtlSeconds: 120,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(11),
      hashToken: async (token) => `hash:${token}`,
    });

    const result = await passkeeper.sessions.create({
      userId: "user_123",
    });

    expect(result).toEqual({
      token: "CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws",
      session: {
        id: "CwsLCwsLCwsLCwsLCwsLCw",
        userId: "user_123",
        tokenHash: "hash:CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws",
        expiresAt: new Date("2026-01-01T00:02:00.000Z"),
        createdAt: now,
      },
    });
  });

  it("trims session user IDs and rejects empty session create user IDs", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(11),
      hashToken: async (token) => `hash:${token}`,
    });

    const result = await passkeeper.sessions.create({
      userId: " user_123 ",
    });

    expect(result.session.userId).toBe("user_123");
    await expect(
      passkeeper.sessions.create({
        userId: " ",
      }),
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "userId must be a non-empty string.",
    });
  });

  it("verifies sessions and updates last seen", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
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
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      hashToken: async (token) => `hash:${token}`,
    });

    const result = await passkeeper.sessions.verify({
      token: " token-value ",
    });

    expect(result.session).toEqual({
      id: "session_123",
      userId: "user_123",
      tokenHash: "hash:token-value",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
      createdAt: now,
      lastSeenAt: now,
    });
    expect(result.user.id).toBe("user_123");
  });

  it("rejects empty session verify tokens", async () => {
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
    });

    await expect(
      passkeeper.sessions.verify({
        token: " ",
      }),
    ).rejects.toMatchObject({
      code: "invalid_credential",
      message: "Session token must be a non-empty string.",
    });
  });

  it("deletes expired sessions during verification", async () => {
    const now = new Date("2026-01-01T00:05:00.000Z");
    const storage = createMemoryStorage({
      users: [
        {
          id: "user_123",
          username: "jane@example.com",
          displayName: "Jane",
          createdAt: now,
          updatedAt: now,
        },
      ],
      sessions: [
        {
          id: "session_123",
          userId: "user_123",
          tokenHash: "hash:token-value",
          expiresAt: now,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      hashToken: async (token) => `hash:${token}`,
    });

    await expect(
      passkeeper.sessions.verify({
        token: "token-value",
      }),
    ).rejects.toMatchObject({
      code: "invalid_credential",
    });
    await expect(storage.getSessionByTokenHash("hash:token-value")).resolves.toBeNull();
  });

  it("trims session delete IDs and rejects empty values", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
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
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
    });

    await passkeeper.sessions.delete(" session_123 ");

    await expect(storage.getSessionByTokenHash("hash:token-value")).resolves.toBeNull();
    await expect(passkeeper.sessions.delete(" ")).rejects.toMatchObject({
      code: "invalid_config",
      message: "sessionId must be a non-empty string.",
    });
  });

  it("creates and consumes invite codes", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage();
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(12),
      hashToken: async (token) => `hash:${token}`,
    });

    const invite = await passkeeper.invites.create({
      code: "launch-code",
      email: " jane@example.com ",
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(invite).toEqual({
      id: "DAwMDAwMDAwMDAwMDAwMDA",
      codeHash: "hash:launch-code",
      email: "jane@example.com",
      maxUses: 1,
      usedCount: 0,
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      createdAt: now,
    });
    await expect(passkeeper.invites.consume("launch-code")).resolves.toMatchObject({
      id: invite.id,
      usedCount: 1,
    });
    await expect(passkeeper.invites.consume("launch-code")).rejects.toMatchObject({
      code: "invalid_invite",
    });
  });

  it("verifies the development seed invite with the default hash", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage({
        invites: [
          {
            id: "invite_development_launch_code",
            codeHash: "a56d27d796dcb031d34a58611c9b9ee3c5ef9788958d119d24026ae6b96d97b0",
            maxUses: 100,
            usedCount: 0,
            createdAt: now,
          },
        ],
      }),
      now: () => now,
    });

    await expect(passkeeper.invites.verify("launch-code")).resolves.toMatchObject({
      id: "invite_development_launch_code",
      usedCount: 0,
    });
  });

  it("supports multi-use invite codes", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(12),
      hashToken: async (token) => `hash:${token}`,
    });

    await passkeeper.invites.create({
      code: "team-code",
      maxUses: 2,
    });

    await expect(passkeeper.invites.consume("team-code")).resolves.toMatchObject({
      usedCount: 1,
    });
    await expect(passkeeper.invites.consume("team-code")).resolves.toMatchObject({
      usedCount: 2,
    });
    await expect(passkeeper.invites.consume("team-code")).rejects.toMatchObject({
      code: "invalid_invite",
    });
  });

  it("rejects invalid invite create options", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage: createMemoryStorage(),
      now: () => now,
      hashToken: async (token) => `hash:${token}`,
    });

    await expect(
      passkeeper.invites.create({
        code: "team-code",
        maxUses: 0,
      }),
    ).rejects.toMatchObject({
      code: "invalid_invite",
      message: "Invite maxUses must be a positive integer.",
    });
    await expect(
      passkeeper.invites.create({
        code: "team-code",
        maxUses: 1.5,
      }),
    ).rejects.toMatchObject({
      code: "invalid_invite",
    });
    await expect(
      passkeeper.invites.create({
        code: "team-code",
        email: " ",
      }),
    ).rejects.toMatchObject({
      code: "invalid_invite",
      message: "Invite email must be a non-empty string when provided.",
    });
    await expect(
      passkeeper.invites.create({
        code: "team-code",
        expiresAt: now,
      }),
    ).rejects.toMatchObject({
      code: "invalid_invite",
      message: "Invite expiresAt must be in the future.",
    });
    await expect(
      passkeeper.invites.create({
        code: "team-code",
        expiresAt: new Date(Number.NaN),
      }),
    ).rejects.toMatchObject({
      code: "invalid_invite",
      message: "Invite expiresAt must be a valid Date.",
    });
  });

  it("requires an invite code for new users when inviteRequired is enabled", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const storage = createMemoryStorage({
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
    const passkeeper = createPasskeeper({
      rpName: "Acme",
      rpId: "acme.com",
      origin: "https://app.acme.com",
      storage,
      inviteRequired: true,
      now: () => now,
      randomBytes: (size) => new Uint8Array(size).fill(13),
      hashToken: async (token) => `hash:${token}`,
      verifyRegistration: async () => ({
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
          origin: "https://app.acme.com",
          rpID: "acme.com",
        },
      }),
    });

    await expect(
      passkeeper.register.begin({
        username: "jane@example.com",
      }),
    ).rejects.toMatchObject({
      code: "invalid_invite",
    });
    const begin = await passkeeper.register.begin({
      username: "jane@example.com",
      inviteCode: "launch-code",
    });

    expect(begin).toMatchObject({
      user: {
        username: "jane@example.com",
      },
    });
    await expect(storage.getInviteByCodeHash("hash:launch-code")).resolves.toMatchObject({
      usedCount: 0,
    });

    await expect(
      passkeeper.register.complete({
        challengeId: begin.challengeId,
        userId: begin.user.id,
        credential: createRegistrationResponse(),
        inviteCode: "launch-code",
      }),
    ).resolves.toMatchObject({
      verified: true,
    });
    await expect(storage.getInviteByCodeHash("hash:launch-code")).resolves.toMatchObject({
      usedCount: 1,
    });
  });

  it("verifies authentication assertions with the default Oslo/WebCrypto verifier", async () => {
    const fixture = await createAuthenticationAssertionFixture();

    await expect(
      defaultVerifyAuthentication({
        response: fixture.response,
        expectedChallenge: fixture.challenge,
        expectedOrigin: "https://app.acme.com",
        expectedRPID: "acme.com",
        credential: {
          id: fixture.credentialId,
          publicKey: base64UrlDecodeForTest(fixture.storedPublicKey),
          counter: 4,
        },
        requireUserVerification: true,
      }),
    ).resolves.toEqual({
      verified: true,
      authenticationInfo: {
        credentialID: fixture.credentialId,
        newCounter: 5,
      },
    });
  });

  it("verifies DER-encoded ECDSA assertions from WebAuthn authenticators", async () => {
    const fixture = await createAuthenticationAssertionFixture({ signatureFormat: "der" });

    await expect(
      defaultVerifyAuthentication({
        response: fixture.response,
        expectedChallenge: fixture.challenge,
        expectedOrigin: "https://app.acme.com",
        expectedRPID: "acme.com",
        credential: {
          id: fixture.credentialId,
          publicKey: base64UrlDecodeForTest(fixture.storedPublicKey),
          counter: 4,
        },
        requireUserVerification: true,
      }),
    ).resolves.toMatchObject({
      verified: true,
    });
  });

  it("rejects authentication assertions with a stale signature counter", async () => {
    const fixture = await createAuthenticationAssertionFixture();

    await expect(
      defaultVerifyAuthentication({
        response: fixture.response,
        expectedChallenge: fixture.challenge,
        expectedOrigin: "https://app.acme.com",
        expectedRPID: "acme.com",
        credential: {
          id: fixture.credentialId,
          publicKey: base64UrlDecodeForTest(fixture.storedPublicKey),
          counter: 5,
        },
        requireUserVerification: true,
      }),
    ).resolves.toEqual({
      verified: false,
    });
  });
});

interface MemoryStorageOptions {
  users?: PasskeeperUser[];
  credentials?: PasskeyCredential[];
  sessions?: PasskeeperSession[];
  invites?: PasskeeperInvite[];
}

function createRegistrationResponse(): RegistrationResponseJSON {
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

function createAuthenticationResponse(): AuthenticationResponseJSON {
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

async function createAuthenticationAssertionFixture(
  options: { signatureFormat?: "raw" | "der" } = {},
): Promise<{
  challenge: string;
  credentialId: string;
  response: AuthenticationResponseJSON;
  storedPublicKey: string;
}> {
  const credentialId = "credential-id";
  const challenge = base64UrlEncodeForTest(new Uint8Array([1, 2, 3, 4, 5]));
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  if (publicJwk.x === undefined || publicJwk.y === undefined) {
    throw new Error("Expected generated P-256 key to export x and y coordinates.");
  }

  const clientDataJSON = utf8EncodeForTest(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin: "https://app.acme.com",
      crossOrigin: false,
    }),
  );
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(await sha256ForTest(utf8EncodeForTest("acme.com")), 0);
  authenticatorData[32] = 0x05;
  new DataView(authenticatorData.buffer).setUint32(33, 5);
  const signatureMessage = concatBytes(
    authenticatorData,
    await sha256ForTest(clientDataJSON),
  );
  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      copyBytesForTest(signatureMessage),
    ),
  );
  const signature =
    options.signatureFormat === "der" ? rawEcdsaSignatureToDer(rawSignature) : rawSignature;

  return {
    challenge,
    credentialId,
    storedPublicKey: base64UrlEncodeForTest(
      utf8EncodeForTest(
        JSON.stringify({
          kty: "EC",
          alg: "ES256",
          crv: "P-256",
          x: publicJwk.x,
          y: publicJwk.y,
        }),
      ),
    ),
    response: {
      id: credentialId,
      rawId: credentialId,
      response: {
        authenticatorData: base64UrlEncodeForTest(authenticatorData),
        clientDataJSON: base64UrlEncodeForTest(clientDataJSON),
        signature: base64UrlEncodeForTest(signature),
      },
      clientExtensionResults: {},
      type: "public-key",
    },
  };
}

async function sha256ForTest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copyBytesForTest(bytes)));
}

function utf8EncodeForTest(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function base64UrlEncodeForTest(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecodeForTest(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function copyBytesForTest(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function rawEcdsaSignatureToDer(signature: Uint8Array): Uint8Array {
  const r = derInteger(signature.slice(0, 32));
  const s = derInteger(signature.slice(32));
  const sequenceLength = r.byteLength + s.byteLength;
  const der = new Uint8Array(2 + sequenceLength);
  der[0] = 0x30;
  der[1] = sequenceLength;
  der.set(r, 2);
  der.set(s, 2 + r.byteLength);
  return der;
}

function derInteger(bytes: Uint8Array): Uint8Array {
  let offset = 0;

  while (offset < bytes.length - 1 && bytes[offset] === 0) {
    offset += 1;
  }

  const value = bytes.slice(offset);
  const first = value[0];

  if (first === undefined) {
    throw new Error("Expected ECDSA signature integer to contain at least one byte.");
  }

  const needsPadding = (first & 0x80) !== 0;
  const der = new Uint8Array(2 + value.byteLength + (needsPadding ? 1 : 0));
  der[0] = 0x02;
  der[1] = value.byteLength + (needsPadding ? 1 : 0);
  der.set(value, needsPadding ? 3 : 2);
  return der;
}

function createMemoryStorage(options: MemoryStorageOptions = {}): PasskeeperStorage {
  const challenges = new Map<string, Challenge>();
  const users = new Map<string, PasskeeperUser>();
  const credentials = new Map<string, PasskeyCredential>();
  const sessions = new Map<string, PasskeeperSession>();
  const invites = new Map<string, PasskeeperInvite>();

  for (const user of options.users ?? []) {
    users.set(user.id, user);
  }

  for (const credential of options.credentials ?? []) {
    credentials.set(credential.credentialId, credential);
  }

  for (const session of options.sessions ?? []) {
    sessions.set(session.id, session);
  }

  for (const invite of options.invites ?? []) {
    invites.set(invite.id, invite);
  }

  return {
    async createChallenge(input: CreateChallengeInput) {
      const challenge = { ...input };
      challenges.set(challenge.id, challenge);
      return challenge;
    },
    async consumeChallenge(id: string) {
      const challenge = challenges.get(id) ?? null;
      challenges.delete(id);
      return challenge;
    },
    async getUser(id: string) {
      return users.get(id) ?? null;
    },
    async getUserByUsername(username: string) {
      for (const user of users.values()) {
        if (user.username === username) {
          return user;
        }
      }

      return null;
    },
    async createUser(input) {
      users.set(input.id, input);
      return input;
    },
    async listCredentials(userId: string) {
      return [...credentials.values()].filter((credential) => credential.userId === userId);
    },
    async getCredential(credentialId: string) {
      return credentials.get(credentialId) ?? null;
    },
    async createCredential(input) {
      credentials.set(input.credentialId, input);
      return input;
    },
    async updateCredentialCounter(input) {
      const credential = credentials.get(input.credentialId);

      if (credential === undefined || credential.counter !== input.previousCounter) {
        return false;
      }

      credentials.set(input.credentialId, {
        ...credential,
        counter: input.counter,
        lastUsedAt: input.lastUsedAt,
      });
      return true;
    },
    async createSession(input) {
      sessions.set(input.id, input);
      return input;
    },
    async getSessionByTokenHash(tokenHash: string) {
      for (const session of sessions.values()) {
        if (session.tokenHash === tokenHash) {
          return session;
        }
      }

      return null;
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
    async deleteSession(id: string) {
      sessions.delete(id);
    },
    async createInvite(input) {
      invites.set(input.id, input);
      return input;
    },
    async getInviteByCodeHash(codeHash: string) {
      for (const invite of invites.values()) {
        if (invite.codeHash === codeHash) {
          return invite;
        }
      }

      return null;
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
