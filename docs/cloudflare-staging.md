# Cloudflare Staging

The site includes a staging configuration and preflight for its embedded demo, but its committed RP domain and D1 UUID are placeholders. This prevents an accidental deployment from binding local state or trusting the wrong WebAuthn origin.

## Prerequisites

Confirm Wrangler authentication:

```bash
pnpm --filter @passkeeper/app-site exec wrangler whoami
```

The account needs Workers and D1 write permissions.

## Create The Staging Database

Creating a D1 database changes Cloudflare account state. Run this only when the account and resource name are correct:

```bash
pnpm --filter @passkeeper/app-site exec wrangler d1 create passkeeper-site-demo-staging
```

Copy the returned UUID into `apps/site/wrangler.staging.jsonc`. Set `RP_ID` and `RP_ORIGIN` to the final HTTPS staging hostname. For a `workers.dev` deployment, the origin normally has this shape:

```txt
https://passkeeper-site-staging.<account-subdomain>.workers.dev
```

`RP_ORIGIN` must be the exact origin without a path. `RP_ID` must be its hostname or a parent domain.

## Preflight

The preflight rejects placeholders, non-HTTPS origins, mismatched RP IDs, stale compatibility dates, missing observability or cleanup triggers, incorrect demo routing, non-staging resource names, invalid D1 UUIDs, and an incorrect migration path. It builds the site in Vite's staging mode, verifies that client assets are attached to the generated Worker configuration, and asks Wrangler to bundle that generated deployment without uploading it:

```bash
pnpm --filter @passkeeper/app-site run staging:preflight
```

## Migrate

Inspect migration status:

```bash
pnpm --filter @passkeeper/app-site exec wrangler d1 migrations list passkeeper-site-demo-staging --remote --config wrangler.staging.jsonc
```

Record the current D1 Time Travel bookmark before applying migrations:

```bash
pnpm --filter @passkeeper/app-site exec wrangler d1 time-travel info passkeeper-site-demo-staging --config wrangler.staging.jsonc
```

Apply migrations:

```bash
pnpm --filter @passkeeper/app-site exec wrangler d1 migrations apply passkeeper-site-demo-staging --remote --config wrangler.staging.jsonc
```

Never apply `scripts/seed-development-invite.sql` remotely.

## Deploy

The staging deploy command always reruns the preflight first:

```bash
pnpm --filter @passkeeper/app-site run deploy:staging
```

After deployment, create a random one-use invite in the staging database:

```bash
pnpm --filter @passkeeper/app-site run staging:create-invite
```

The plaintext invite is printed once. Store it securely and do not put it in source control, shell history, screenshots, or logs.

## Validate

Over HTTPS on the configured staging origin:

- Register in the site's demo section with the one-use staging invite.
- Confirm the same invite cannot register another account.
- Read the authenticated session.
- Add a second passkey.
- Log out and confirm the session is unavailable.
- Log in with each passkey from its device.
- Confirm requests with another `Origin` are rejected.
- Trigger or inspect scheduled expired-record cleanup.

## Roll Back

List Worker versions and roll back code with Wrangler:

```bash
pnpm --filter @passkeeper/app-site exec wrangler versions list --config wrangler.staging.jsonc
pnpm --filter @passkeeper/app-site exec wrangler rollback --config wrangler.staging.jsonc
```

A Worker rollback does not roll back D1. If a migration or write must be reversed, use the bookmark recorded before migration with D1 Time Travel only after reviewing the destructive restore operation:

```bash
pnpm --filter @passkeeper/app-site exec wrangler d1 time-travel restore passkeeper-site-demo-staging --bookmark=<bookmark> --config wrangler.staging.jsonc
```

Time Travel overwrites the database in place and cancels in-flight queries. Treat restore as an incident operation, not a routine migration command.
