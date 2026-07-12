# Package Architecture

Start with four packages, not ten:

```txt
@passkeeper/core
@passkeeper/client
@passkeeper/cloudflare
@passkeeper/d1
```

That gives a complete story without over-fragmenting the product.

## `@passkeeper/core`

Runtime-agnostic passkey authentication primitives for TypeScript apps.

This should be the protocol and domain layer. It should not know about Cloudflare, D1, Astro, Vue, React, Hono, or cookies.

### Responsibilities

```txt
Types
Challenge generation
Passkey registration option creation
Passkey authentication option creation
Registration verification
Authentication verification
Optional session token helpers
Error types
Storage interfaces
```

### Example API

```ts
import { createPasskeeper } from "@passkeeper/core";

const passkeeper = createPasskeeper({
  rpName: "Acme",
  rpId: "acme.com",
  origin: "https://app.acme.com",
  storage,
});

const options = await passkeeper.registration.begin({
  userId: "user_123",
  username: "jane@example.com",
  displayName: "Jane",
});

const result = await passkeeper.registration.complete({
  userId: "user_123",
  credential: body.credential,
});
```

### Core Interfaces

```ts
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
```

### Belongs in Core

```txt
WebAuthn option builders
Verifiers
Typed errors
Storage contracts
Config validation
Challenge lifecycle rules
Credential counter logic
```

### Avoid in Core

```txt
D1 SQL
Route handlers
Vue components
React hooks
Cloudflare bindings
Email
Billing
```

`@passkeeper/core` should be boring and stable.

## `@passkeeper/client`

Browser helpers for passkey registration and login.

The browser WebAuthn API involves `navigator.credentials.create()` and `navigator.credentials.get()`. This package hides the base64url conversion and request/response formatting pain.

### Example API

```ts
import { registerPasskey, loginWithPasskey } from "@passkeeper/client";

await registerPasskey({
  beginUrl: "/auth/passkey/register/begin",
  completeUrl: "/auth/passkey/register/complete",
});

await loginWithPasskey({
  beginUrl: "/auth/passkey/login/begin",
  completeUrl: "/auth/passkey/login/complete",
});
```

### Responsibilities

```txt
Call begin endpoint
Convert server options into browser-compatible values
Call navigator.credentials.create/get
Serialize credential response
POST to complete endpoint
Support conditional UI later
```

### Later API

```ts
await loginWithPasskey({
  beginUrl: "/auth/passkey/login/begin",
  completeUrl: "/auth/passkey/login/complete",
  conditional: true,
});
```

This package is a big part of the product experience. WebAuthn is powerful, but browser-side data conversion is one of the annoying parts for developers.

## `@passkeeper/cloudflare`

Cloudflare Workers route helpers for Passkeeper.

### Responsibilities

```txt
Worker route helpers
Cookie/session helpers
CSRF-safe defaults
Request parsing
Response helpers
Optional rate-limit hooks
Typed Cloudflare env bindings
```

### Example API

```ts
import { createPasskeeperRoutes } from "@passkeeper/cloudflare";
import { d1Adapter } from "@passkeeper/d1";

const auth = createPasskeeperRoutes({
  rpName: "Acme",
  rpId: "acme.com",
  origin: "https://app.acme.com",
  storage: d1Adapter(env.DB),
  sessionCookie: {
    name: "pk_session",
    secure: true,
    sameSite: "Lax",
  },
});

export default {
  async fetch(request: Request, env: Env) {
    return auth.handle(request);
  },
};
```

### Generated Endpoints

```txt
POST /auth/passkey/register/begin
POST /auth/passkey/register/complete
POST /auth/passkey/login/begin
POST /auth/passkey/login/complete
POST /auth/logout
GET  /auth/me
```

This package should make the happy path extremely quick.

## `@passkeeper/d1`

Cloudflare D1 storage adapter and migrations for Passkeeper.

### Responsibilities

```txt
SQL schema
Migrations
D1 storage adapter
Challenge storage
User storage
Credential storage
Session storage
Invite storage
Atomic challenge consumption
Guarded credential counter updates
Guarded invite consumption
Expired record cleanup helper
```

The D1 adapter implements the core `PasskeeperStorage` contract and exposes a D1-specific `deleteExpiredRecords(now)` maintenance helper for scheduled cleanup of expired challenges, sessions, and expiring invites. The helper expects a valid `Date`.
