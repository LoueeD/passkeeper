# Cloudflare

Passkeeper's Cloudflare integration is split into two packages:

- `@passkeeper/cloudflare` exposes Worker-native auth routes.
- `@passkeeper/d1` implements the storage contract against D1.

## Worker Route Setup

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

The default route base path is `/auth`. Custom `basePath` values are trimmed, get a leading `/` when omitted, drop trailing slashes, and must not include query strings, fragments, or control characters.

Use explicit `RP_ID` and `RP_ORIGIN` bindings for deployed Workers. Falling back to the request URL is useful for localhost development, but production WebAuthn verification should trust configured deployment values rather than arbitrary forwarded host data.

## Routes

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

Registration and login completion create a session and set the session cookie. `/auth/me` verifies the cookie and returns the current user/session. `/auth/logout` deletes the session when possible and clears the cookie.

Initial signup rejects usernames that already have a credential. The additional-passkey route pair requires an existing valid session and binds registration to that session's user; it does not create a replacement session.

Known routes called with an unsupported HTTP method return `405 Method Not Allowed` with an `Allow` header. Unknown routes return `404`.

Session JSON returned from Cloudflare routes omits the internal `tokenHash` field. The session token itself is only sent in the `HttpOnly` cookie.

## Request Bodies

POST routes require `Content-Type: application/json` and a JSON object body. Invalid JSON, missing required fields, and non-object JSON bodies return a 400 JSON error response.

Known POST routes compare a present `Origin` header with the configured trusted `origin`. A mismatch returns `403 invalid_origin` before request hooks or body parsing. Requests without an `Origin` are allowed for server-to-server and CLI integrations.

## Request Hooks

Pass `beforeRequest` to run code after the request matches a known auth route and passes the POST origin check, but before method-specific body parsing or auth work. Return a `Response` to short-circuit the route, for example when a rate limiter rejects the request. Return `null` or `undefined` to continue. Unknown routes under the configured base path return `404` without running the hook.

## D1

Configure a D1 binding and point Wrangler at the shared migrations:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "passkeeper-example",
      "database_id": "local-passkeeper-example",
      "migrations_dir": "../../packages/d1/migrations"
    }
  ]
}
```

Apply migrations locally:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations apply passkeeper-example --local
```

See [D1 Migrations](d1-migrations.md) for remote application, migration maintenance, cleanup, and verification guidance.

## Cookies

The default session cookie name is `pk_session`. Defaults are:

```txt
Secure
SameSite=Lax
Path=/
```

Set `sessionCookie.secure` to `false` only for local non-HTTPS development.

`SameSite=None` requires `Secure`; `createPasskeeperRoutes()` rejects `sessionCookie.sameSite: "None"` when `sessionCookie.secure` is `false`.

Custom `sessionCookie.name` values must be valid cookie token names. Custom `sessionCookie.path` values are trimmed, must start with `/`, and must not contain control characters or semicolons.

## Invites

Set `inviteRequired: true` in the route options to require an invite code for new users. Registration begin validates the invite code, and registration completion consumes it after WebAuthn verification succeeds. The runnable examples enable this option and use a known local-only seed from `scripts/seed-development-invite.sql`. Invite creation is available from `@passkeeper/core`; the examples do not expose an admin invite screen.
