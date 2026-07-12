# @passkeeper/client

Browser helpers for Passkeeper registration, additional passkeys, and login.

This package converts JSON WebAuthn options into browser `ArrayBuffer` options, runs `navigator.credentials.create()` or `navigator.credentials.get()`, serializes the credential response, and posts it back to Passkeeper endpoints.

Base64url conversion is backed by `@oslojs/encoding`.

## Install

```bash
pnpm add @passkeeper/client
```

## Usage

```ts
import { addPasskey, loginWithPasskey, registerPasskey } from "@passkeeper/client";

await registerPasskey({
  beginUrl: "/auth/passkey/register/begin",
  completeUrl: "/auth/passkey/register/complete",
  username: "jane@example.com",
  displayName: "Jane",
  inviteCode: "launch-code",
});

await loginWithPasskey({
  beginUrl: "/auth/passkey/login/begin",
  completeUrl: "/auth/passkey/login/complete",
  username: "jane@example.com",
});

await addPasskey({
  beginUrl: "/auth/passkey/register/add/begin",
  completeUrl: "/auth/passkey/register/add/complete",
});
```

The helper forwards `inviteCode` to both registration endpoints when supplied. It also accepts optional custom `fetch` and `credentials` implementations for tests, SSR boundaries, or non-standard browser hosts. Custom `fetch` must be a function, registration requires `credentials.create`, and login requires `credentials.get`. If neither a usable global implementation nor a custom implementation is available, the helper throws a setup error before starting the request.

Endpoint URLs and string request fields are trimmed and must be non-empty before the helper starts network or WebAuthn work.

`addPasskey()` uses the session-protected Cloudflare route pair to register another credential for the current user. `creationOptionsFromJSON()` and `requestOptionsFromJSON()` accept omitted credential descriptor lists and preserve them as omitted in the browser options.
Invalid base64url values in WebAuthn JSON options throw a clear conversion error before the browser ceremony starts. The high-level registration and login helpers wrap malformed begin responses with flow-specific errors.

Failed begin or complete requests throw `PasskeeperClientError`, which includes the HTTP `status` and parsed response `body` when available. A successful HTTP response that is not valid JSON also throws `PasskeeperClientError`.

## Status

Pre-1.0. APIs may change.
