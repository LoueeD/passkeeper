# Troubleshooting

## Registration Or Login Fails Verification

Check `rpId` and `origin` first. They must describe the browser-visible relying party, not an internal Worker hostname or proxy target.

For production, configure explicit values:

```jsonc
{
  "vars": {
    "RP_ID": "app.example.com",
    "RP_ORIGIN": "https://app.example.com"
  }
}
```

An RP ID is a hostname without a scheme or port. An origin includes the scheme and any non-default port. Localhost can use HTTP during development; deployed passkeys require a secure browser context.

## The Browser Does Not Offer A Passkey

Confirm that the page is running in a browser with WebAuthn support and that `navigator.credentials.create` or `navigator.credentials.get` is available. Passkeeper's client helpers report a setup error when those APIs are missing.

The username supplied to login must belong to an existing user with at least one registered credential. Public signup rejects established usernames; after login, the authenticated additional-passkey ceremony includes existing credentials in `excludeCredentials`.

## Session Requests Return 401

Make requests to `/auth/me` with credentials enabled when the frontend and auth endpoint are fetched through browser APIs:

```ts
await fetch("/auth/me", { credentials: "include" });
```

Use `sessionCookie.secure: false` only on local HTTP. Production cookies should remain secure. `SameSite=None` is valid only with `Secure`; route creation rejects an unsafe combination.

Check that the cookie path covers the auth routes. Empty, expired, or malformed session cookies are treated as unauthenticated.

## An Auth POST Returns 400

Passkeeper POST routes require an object JSON body and the `application/json` media type:

```ts
await fetch("/auth/passkey/login/begin", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "jane@example.com" }),
});
```

Read the JSON `error` and `message` fields. Missing or blank request fields, malformed JSON, arrays, and unsupported content types are rejected before WebAuthn work begins.

## An Auth POST Returns `403 invalid_origin`

The browser request's `Origin` header does not match the trusted `origin` passed to `createPasskeeperRoutes()`. Configure `RP_ORIGIN` as the browser-visible origin, including its scheme and any non-default port. Do not set it to an internal Worker or proxy hostname.

## Invite Registration Is Rejected

When `inviteRequired` is enabled, send the same invite code to registration begin and completion. Begin verifies the invite without consuming it; successful completion consumes one use after WebAuthn verification.

Verify that the stored invite has not expired and has remaining uses. Invite codes are stored as hashes, so the original plaintext code cannot be recovered from D1.

## D1 Reports A Missing Table Or Binding

Confirm the binding name used by the app matches the Wrangler configuration, normally `DB`. Apply the package migrations before running the app:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations apply passkeeper-example --local
```

See [D1 Migrations](d1-migrations.md) for local and remote workflows.

## A Known Route Returns 405

Use `POST` for registration, login, and logout routes. `/auth/me` uses `GET`. Known paths called with the wrong method return `405` and an `Allow` header; unknown paths return `404`.

## Client Helpers Throw `PasskeeperClientError`

Inspect `status` and `body` to preserve the server's error detail:

```ts
import { PasskeeperClientError } from "@passkeeper/client";

try {
  // Run registration or login.
} catch (error) {
  if (error instanceof PasskeeperClientError) {
    console.error(error.status, error.body);
  }
}
```

Malformed successful JSON responses and malformed WebAuthn options are also rejected before a browser ceremony proceeds.
