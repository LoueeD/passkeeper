# @passkeeper/cloudflare

Cloudflare Workers route helpers for Passkeeper.

This package exposes a Worker-native request handler for passkey registration, passkey login, session lookup, and logout.

## Install

```bash
pnpm add @passkeeper/cloudflare @passkeeper/d1
```

## Usage

```ts
import { createPasskeeperRoutes } from "@passkeeper/cloudflare";
import { d1Adapter } from "@passkeeper/d1";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const routes = createPasskeeperRoutes({
      rpName: "My App",
      rpId: env.RP_ID ?? url.hostname,
      origin: env.RP_ORIGIN ?? url.origin,
      storage: d1Adapter(env.DB),
      maxBodyBytes: 64 * 1024,
      beforeRequest: async ({ request, path }) => {
        // Optionally call your rate limiter here and return a Response to stop the request.
        return null;
      },
      sessionCookie: {
        secure: url.protocol === "https:",
      },
    });

    return routes.handle(request);
  },
};
```

## Routes

The default base path is `/auth`. Custom `basePath` values are normalized as URL paths and must not include query strings, fragments, or control characters.

Use explicit `RP_ID` and `RP_ORIGIN` bindings in production. Falling back to the request URL is useful for local development, but deployed WebAuthn verification should trust configured domain values.

Route creation validates the Passkeeper core config, including the required storage contract methods.

JSON request bodies are limited to 64 KiB by default. Set `maxBodyBytes` to an integer from 1 KiB through 1 MiB when an integration needs a different cap. Both declared and streamed oversized bodies return `413 request_too_large`.

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

Known routes called with an unsupported HTTP method return `405 Method Not Allowed` with an `Allow` header. Unknown routes return `404`.

When `inviteRequired` is enabled, send `inviteCode` to both registration endpoints. Begin validates the invite without consuming it; completion consumes it after WebAuthn verification succeeds.

Public signup rejects usernames that already have a credential. The `/passkey/register/add/*` route pair requires a valid session cookie and adds a credential only for that authenticated user.

POST routes require an `application/json` media type (optional parameters such as `charset` are accepted) and a JSON object body. Invalid request bodies return JSON error responses with 4xx status codes.

Known POST routes reject a present `Origin` header unless it exactly matches the configured trusted `origin`. This check runs before hooks or body parsing. Requests without an `Origin` remain available to non-browser clients.

Use `beforeRequest` to plug in rate limiting or other request guards. The hook receives the matched auth `path`, HTTP `method`, and original `request`; it must return a `Response`, `null`, or `undefined`. Returning a `Response` short-circuits the route. Unknown paths under the base path return `404` without running the hook.

Session responses omit the internal `tokenHash` field. The session token is only sent in the `HttpOnly` cookie.

Empty or malformed session cookie values are treated as unauthenticated. Logout still clears those cookies.

`SameSite=None` requires `Secure`; route creation rejects `sessionCookie.sameSite: "None"` when `sessionCookie.secure` is `false`.

Custom cookie names must be valid cookie token names. Custom cookie paths must start with `/` and cannot contain control characters or semicolons.

## Status

Pre-1.0. APIs may change.
