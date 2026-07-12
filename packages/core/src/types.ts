import type { AuthenticatorTransport } from "./webauthn";

export type ChallengeType = "registration" | "registration_additional" | "authentication";

export interface PasskeeperUser {
  id: string;
  username: string;
  displayName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PasskeyCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  backedUp?: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface Challenge {
  id: string;
  userId?: string;
  type: ChallengeType;
  challenge: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface PasskeeperSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt?: Date;
}

export interface PasskeeperInvite {
  id: string;
  codeHash: string;
  email?: string;
  maxUses: number;
  usedCount: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CreateChallengeInput {
  id: string;
  userId?: string;
  type: ChallengeType;
  challenge: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateUserInput {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  backedUp?: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface UpdateCredentialCounterInput {
  credentialId: string;
  previousCounter: number;
  counter: number;
  lastUsedAt: Date;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt?: Date;
}

export interface UpdateSessionLastSeenInput {
  id: string;
  lastSeenAt: Date;
}

export interface CreateInviteInput {
  id: string;
  codeHash: string;
  email?: string;
  maxUses: number;
  usedCount: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ConsumeInviteInput {
  codeHash: string;
  now: Date;
}

export interface PasskeeperStorage {
  createChallenge(input: CreateChallengeInput): Promise<Challenge>;
  consumeChallenge(id: string): Promise<Challenge | null>;

  getUser(id: string): Promise<PasskeeperUser | null>;
  getUserByUsername(username: string): Promise<PasskeeperUser | null>;
  createUser(input: CreateUserInput): Promise<PasskeeperUser>;

  listCredentials(userId: string): Promise<PasskeyCredential[]>;
  getCredential(credentialId: string): Promise<PasskeyCredential | null>;
  createCredential(input: CreateCredentialInput): Promise<PasskeyCredential>;
  updateCredentialCounter(input: UpdateCredentialCounterInput): Promise<boolean>;

  createSession(input: CreateSessionInput): Promise<PasskeeperSession>;
  getSessionByTokenHash(tokenHash: string): Promise<PasskeeperSession | null>;
  updateSessionLastSeen(input: UpdateSessionLastSeenInput): Promise<void>;
  deleteSession(id: string): Promise<void>;

  createInvite(input: CreateInviteInput): Promise<PasskeeperInvite>;
  getInviteByCodeHash(codeHash: string): Promise<PasskeeperInvite | null>;
  consumeInvite(input: ConsumeInviteInput): Promise<PasskeeperInvite | null>;
}
