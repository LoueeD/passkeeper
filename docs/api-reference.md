# API Reference

The APIs below describe the current workspace implementation. They are pre-1.0 and may change.

## `@passkeeper/core`

```ts
import { createPasskeeper } from "@passkeeper/core";

const passkeeper = createPasskeeper({
  rpName: "My App",
  rpId: "localhost",
  origin: "http://localhost:8787",
  storage,
});
```

The returned object exposes:

```txt
passkeeper.register.begin()
passkeeper.register.complete()
passkeeper.register.add.begin()
passkeeper.register.add.complete()
passkeeper.login.begin()
passkeeper.login.complete()
passkeeper.sessions.create()
passkeeper.sessions.verify()
passkeeper.sessions.delete()
passkeeper.invites.create()
passkeeper.invites.verify()
passkeeper.invites.consume()
passkeeper.challenges.create()
passkeeper.challenges.consume()
```

The `storage` option must implement `PasskeeperStorage`. Configuration validates that every required storage contract method is present before creating services.

Custom `randomBytes(size)` implementations must return a `Uint8Array` with exactly `size` bytes.
Custom `hashToken(token)` implementations must resolve to a non-empty string.
Custom `now()` implementations must return a valid `Date`.

Registration and authentication normalize usernames to lowercase trimmed values. Optional custom registration `userId` values are trimmed and must be non-empty. Registration, authentication, challenge, and session IDs/tokens must be non-empty before storage or hashing work starts.

Initial registration rejects an existing username once that user has a credential. Authenticated integrations can use `register.add.begin({ userId })` and `register.add.complete(...)`; these methods use `registration_additional` challenges that cannot be completed through initial registration.

When `inviteRequired` is enabled, pass `inviteCode` to `register.begin()` and `register.complete()`. Begin validates the invite without consuming it; completion consumes it after WebAuthn verification succeeds.

`passkeeper.invites.create()` accepts `code`, optional non-empty `email` metadata, optional positive-integer `maxUses`, and optional future `expiresAt`.

## `@passkeeper/cloudflare`

```ts
import { createPasskeeperRoutes } from "@passkeeper/cloudflare";

const routes = createPasskeeperRoutes({
  rpName,
  rpId,
  origin,
  storage,
  basePath: "/auth",
  maxBodyBytes: 64 * 1024,
  beforeRequest: async ({ request, path, method }) => {
    return null;
  },
  sessionCookie: {
    name: "pk_session",
    secure: true,
    sameSite: "Lax",
    path: "/",
  },
});

return routes.handle(request);
```

`basePath`, `maxBodyBytes`, `beforeRequest`, and `sessionCookie` are optional. JSON bodies default to a 64 KiB limit; `maxBodyBytes` accepts integers from 1 KiB through 1 MiB, and oversized bodies return `413 request_too_large`. Known POST routes reject a present `Origin` that differs from the configured trusted origin with `403 invalid_origin`. `beforeRequest` must be a function when supplied and must resolve to a `Response`, `null`, or `undefined`. A `Response` short-circuits a known auth route after origin validation and before request body parsing. Unknown paths under the base path return `404` without running the hook.

The default route surface is:

```txt
POST /auth/passkey/register/begin
POST /auth/passkey/register/complete
POST /auth/passkey/register/add/begin
POST /auth/passkey/register/add/complete
POST /auth/passkey/login/begin
POST /auth/passkey/login/complete
GET  /auth/me
POST /auth/logout
```

Known routes called with another method return `405 Method Not Allowed` and an `Allow` header. Unknown routes return `404`.

Cloudflare route responses omit internal session `tokenHash` values. Session tokens are delivered only via the configured `HttpOnly` cookie.

`POST /auth/passkey/register/add/begin` and `POST /auth/passkey/register/add/complete` require a valid session cookie. Completion must target the authenticated user. The browser `addPasskey()` helper drives this route pair.

## `@passkeeper/d1`

```ts
import { d1Adapter } from "@passkeeper/d1";

const storage = d1Adapter(env.DB);
```

The adapter expects the tables from `packages/d1/migrations/0001_initial.sql`.

The returned D1 adapter also exposes `deleteExpiredRecords(now)`, a D1-specific maintenance helper that accepts a valid `Date` and deletes expired challenges, sessions, and expiring invites.

The adapter applies no migrations automatically. Apply the packaged `migrations/0001_initial.sql` through Wrangler before handling auth requests, and call `deleteExpiredRecords()` from scheduled maintenance.

## `@passkeeper/client`

```ts
import { addPasskey, PasskeeperClientError, loginWithPasskey, registerPasskey } from "@passkeeper/client";

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

The client helpers call the begin endpoint, run the browser WebAuthn ceremony through `navigator.credentials`, serialize the credential response, and call the completion endpoint. `registerPasskey()` forwards `inviteCode` to both registration endpoints when supplied. Custom `fetch` and `credentials` implementations can be supplied for tests, SSR boundaries, or non-standard browser hosts. Custom `fetch` must be a function, registration requires `credentials.create`, and login requires `credentials.get`.

Endpoint URLs and string request fields are trimmed and must be non-empty before network or WebAuthn work starts.

Malformed WebAuthn options in a successful begin response throw before the browser ceremony starts.

Failed begin or complete requests throw `PasskeeperClientError`, which exposes the HTTP `status` and parsed response `body` when available. A successful HTTP response that is not valid JSON also throws `PasskeeperClientError`.

```ts
try {
  await loginWithPasskey({
    beginUrl: "/auth/passkey/login/begin",
    completeUrl: "/auth/passkey/login/complete",
    username: "jane@example.com",
  });
} catch (error) {
  if (error instanceof PasskeeperClientError) {
    console.error(error.status, error.body);
  }
}
```
