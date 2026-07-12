# Security

Passkeeper is passkey-first. It intentionally does not implement passwords, password reset, magic links, or OAuth fallback in the initial scope.

For vulnerability reporting, see [../SECURITY.md](../SECURITY.md).

## WebAuthn Verification

`@passkeeper/core` uses `@oslojs/webauthn` for WebAuthn client-data, attestation-object, authenticator-data, and COSE public-key parsing. `@passkeeper/core` and `@passkeeper/client` use `@oslojs/encoding` for RFC base64url helpers. Prefer Oslo packages for WebAuthn-adjacent primitives; if the implementation avoids one, document why and whether Oslo would improve correctness, maintenance, or security. Keep this verification centralized instead of duplicating WebAuthn parsing or cryptographic checks across routes or adapters.

Authentication assertion signatures are verified with runtime WebCrypto because the runtime already provides the required standards-based signature verification primitive, and using it keeps `@passkeeper/core` portable across edge and browser-compatible TypeScript runtimes. An Oslo package would improve this area if it added a higher-level assertion signature verifier that accepts the parsed authenticator data, client-data hash, COSE key material, and signature format directly. Until then, keep WebAuthn parsing in Oslo and keep the WebCrypto signature check small, centralized, and well tested.

The relying party ID and origin are security-critical. `rpId` must match the origin hostname or a parent domain of it. In production, configure them explicitly for the deployed domain rather than trusting arbitrary forwarded host data.

Passkeeper requests and requires WebAuthn user verification for both registration and authentication.

`@oslojs/webauthn` 1.0 does not expose the authenticator backup-eligibility and backup-state flags. The default verifier therefore leaves credential `backedUp` metadata unset rather than recording an unsupported `false` value. A custom verifier may supply `credentialBackedUp` when it obtains that state from a trusted parser. Prefer a future Oslo API for these flags instead of duplicating authenticator-data parsing locally.

## Stored Data

Passkeeper stores public key credentials, credential counters, users, challenges, sessions, and invites. It does not store authenticator private keys.

Session tokens and invite codes are stored as hashes. Raw session tokens are only returned to the caller when a session is created.

## Challenges

Challenges expire and are consumed during completion. A consumed challenge cannot be reused.

The D1 adapter consumes challenges with a single delete-and-return statement so challenge consumption is atomic at the storage layer.

## Invites

Invite codes are hashed before storage. `verify()` checks an invite without consuming it, while `consume()` must atomically increment usage only when the invite exists, has not expired, and has remaining uses.

The D1 adapter consumes invites with a single guarded update-and-return statement so limited-use invites cannot be overused by concurrent registration completions.

Invite codes are caller-supplied and may have much less entropy than session tokens. Hashing protects the plaintext during normal database reads, but an attacker with the hash database can still guess weak codes offline. Production invite issuers should generate long random codes and avoid short words or reusable human-chosen values. The shared `launch-code` seed is strictly for local development.

## Credential Counters

Authentication updates credential counters after successful verification. Counter behavior is part of WebAuthn replay/cloning defense and should stay wired through storage adapters.

Storage adapters should guard credential counter updates with the previously observed counter value and report whether the update succeeded. The D1 adapter does this with a single guarded update-and-return statement so concurrent authentications cannot silently overwrite a newer counter.

The D1 adapter validates timestamp inputs before persisting them and validates timestamp strings read from D1 rows before returning domain objects. Malformed optional credential transport metadata is treated as an empty transport list, and unknown backup-status values are omitted.

## Additional Passkeys

Public signup cannot begin registration for a username that already has a credential. Adding another passkey requires the authenticated Cloudflare route pair, verifies that completion targets the session user, and uses a distinct `registration_additional` challenge purpose so it cannot cross into initial signup completion.

## Cookies

The Cloudflare route helper defaults to secure session cookies with `SameSite=Lax`. Disable `Secure` only for local HTTP development. `SameSite=None` requires `Secure`; the route helper rejects that combination when `secure` is `false`. Cookie names and paths are validated before being serialized into `Set-Cookie`. Empty or malformed session cookie values are treated as missing credentials rather than server errors.

Known POST auth routes reject browser requests whose `Origin` header does not match the configured trusted origin. This provides a route-layer CSRF guard even when an integration intentionally uses `SameSite=None`. Requests without an `Origin` remain supported for non-browser clients; integrations that require browser-only access can enforce a stricter missing-header policy in `beforeRequest`.

Cloudflare route JSON bodies are capped at 64 KiB by default and are stopped while streaming when they exceed the configured limit. Integrations can set `maxBodyBytes` between 1 KiB and 1 MiB. This cap limits memory spent on malformed or abusive auth requests before JSON parsing and schema validation.

## Current Caveats

- APIs are pre-1.0 and still stabilizing.
- Example apps are development examples, not production templates.
- There is no admin UI for invite creation yet.
- Production deployments should add rate limiting, logging, monitoring, and explicit trusted-origin configuration. `@passkeeper/cloudflare` exposes a `beforeRequest` hook so integrations can call their own rate limiter before request bodies are parsed.
