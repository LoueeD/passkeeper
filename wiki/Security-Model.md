# Security Model

For auth tooling, perceived trust matters. The human-facing security policy lives in [../SECURITY.md](../SECURITY.md), and the implementation notes live in [../docs/security.md](../docs/security.md).

## Trust Angle

Passkeeper works without calling Passkeeper servers:

> Your users, credentials, sessions, and auth data stay in your own database.

## What Passkeeper Stores

```txt
Users
Public-key credential material
Credential IDs
Credential counters
Credential transport and optional verifier-supplied backup metadata
Challenges with expiry
Hashed invite codes
Hashed session tokens
```

Passkeeper never stores authenticator private keys.

## Security-Critical Defaults

These are first-class in the current implementation:

```txt
rpId and origin validation
Challenge expiry
Atomic challenge consumption
Credential counter verification
Guarded credential counter updates
Invite code hashing
Guarded invite consumption
Session token hashing
Secure cookie defaults
SameSite=Lax cookie defaults
HttpOnly session cookies
Trusted-origin checks for browser POST routes
Public session JSON without token hashes
D1 expired-record cleanup helper
```

## Integration Caveats

Production deployments should still configure explicit `RP_ID` and `RP_ORIGIN` values, add rate limiting through `beforeRequest`, and wire logging and monitoring. Invite creation exists in `@passkeeper/core`, but there is no admin UI yet.
