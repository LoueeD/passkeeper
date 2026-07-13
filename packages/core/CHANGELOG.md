# @passkeeper/core

## 0.1.0

### Minor Changes

- d767b63: Harden package behavior and Cloudflare integrations.

  - Use `@oslojs/webauthn` in core for WebAuthn parsing and document why assertion signature verification stays on runtime WebCrypto for now.
  - Use `@oslojs/encoding` for core and client base64url helpers, while keeping Passkeeper's public helper names stable.
  - Trim and validate direct-core registration, authentication, challenge, and session IDs/tokens before challenge, credential, user, session, or token-hash storage work.
  - Separate initial registration from authenticated additional-passkey registration, with distinct challenge purposes and session-protected Cloudflare routes.
  - Validate the core storage contract shape during config normalization so setup mistakes fail before request handling.
  - Validate custom `now()` providers so challenge, invite, and session expiry calculations only use valid `Date` values.
  - Add guarded storage flows for challenge consumption, credential counter updates, invite consumption, and D1 expired-record cleanup.
  - Validate D1 timestamp inputs and row timestamps, and make optional credential metadata decoding tolerant of malformed transport data or unknown backup-status values.
  - Validate the D1 binding shape when constructing the adapter so setup mistakes fail with a clear error.
  - Add Cloudflare route guardrails for trusted browser origins, exact JSON media-type and request-body validation, resilient session-cookie parsing, cookie/base path validation, method-not-allowed responses, public session JSON, and validated `beforeRequest` hooks.
  - Cap Cloudflare JSON request bodies while streaming, expose a bounded `maxBodyBytes` option, and return `413 request_too_large` for oversized payloads.
  - Leave backup-state metadata unset in the default Oslo verifier instead of recording an unsupported `false` value when the parser does not expose authenticator backup flags.
  - Improve client failure handling with `PasskeeperClientError` for failed or malformed endpoint responses, clear errors for malformed WebAuthn begin options, and early validation for empty endpoint URLs, string request fields, custom fetch, and custom credentials.
  - Add the browser `addPasskey()` flow for authenticated additional credential registration.
