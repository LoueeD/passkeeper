# @passkeeper/core

Runtime-agnostic passkey authentication primitives for TypeScript apps.

This package owns the Passkeeper domain model: relying party config, WebAuthn registration and authentication, challenge lifecycle, invite-gated signup, sessions, and the storage contract.

Invite-gated signup validates invite codes before registration begins and consumes them only after registration verification succeeds.

## Install

```bash
pnpm add @passkeeper/core
```

## Usage

```ts
import { createPasskeeper } from "@passkeeper/core";

const passkeeper = createPasskeeper({
  rpName: "My App",
  rpId: "example.com",
  origin: "https://example.com",
  storage,
});

const begin = await passkeeper.register.begin({
  username: "jane@example.com",
  displayName: "Jane",
});
```

Public registration rejects usernames that already have a credential. After authenticating a user in your transport layer, use `passkeeper.register.add.begin({ userId })` and `passkeeper.register.add.complete(...)` to add another passkey. Additional-passkey challenges use a separate purpose and cannot be completed through initial signup.

`storage` must implement `PasskeeperStorage`. Use `@passkeeper/d1` for Cloudflare D1.
Configuration validates that every required storage contract method is present before creating services.

Custom `randomBytes(size)` implementations must return a `Uint8Array` with exactly `size` bytes.
Custom `hashToken(token)` implementations must resolve to a non-empty string.
Custom `now()` implementations must return a valid `Date`.

Registration and authentication normalize usernames to lowercase trimmed values. Optional custom registration `userId` values are trimmed and must be non-empty. Registration, authentication, challenge, and session IDs/tokens must be non-empty before storage or hashing work starts.

When `inviteRequired` is enabled, pass the invite code to both `register.begin()` and `register.complete()`.

Invite creation accepts optional non-empty `email` metadata, positive-integer `maxUses`, and future `expiresAt` metadata.

## Security

WebAuthn parsing is delegated to `@oslojs/webauthn`, base64url helpers are delegated to `@oslojs/encoding`, and authentication signatures are verified through runtime WebCrypto. Runtime WebCrypto is used here because it provides the standards-based signature primitive `@passkeeper/core` needs without adding another parser or crypto abstraction; an Oslo helper would be preferred if one later covers the full assertion-signature verification step. Prefer Oslo packages for WebAuthn-adjacent primitives before adding a different dependency or hand-rolled parser. Keep `rpId`, `origin`, challenge expiry, credential counters, session token hashing, and secure cookie behavior wired through your integration.

`rpId` must match the origin hostname or a parent domain of it.

Passkeeper requests and requires WebAuthn user verification for both registration and authentication.

The default Oslo verifier leaves `backedUp` unset because `@oslojs/webauthn` 1.0 does not expose authenticator backup-state flags. Custom verifiers may supply `credentialBackedUp` when they use a trusted parser that exposes it. Do not duplicate authenticator-data parsing solely to populate this metadata.

## Status

Pre-1.0. APIs may change.
