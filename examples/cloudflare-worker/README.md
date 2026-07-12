# Passkeeper Cloudflare Worker Example

Minimal Worker + D1 example for Passkeeper.

## Setup

```bash
pnpm install
```

Generate Worker binding/runtime types:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler types
```

Apply the D1 migration locally:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations apply passkeeper-example --local
```

Seed the development-only invite used by the form:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 execute passkeeper-example --local --file ../../scripts/seed-development-invite.sql
```

The example enables `inviteRequired` and prefills the seeded plaintext code `launch-code`. Create unique invites through trusted application code for real deployments; never apply this development seed remotely.

Start local dev:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker run dev
```

Then open the Wrangler dev URL and use the form to register, log in, check `/auth/me`, and log out.

The example serves a small HTML page at `/` and uses the auth routes under `/auth/*`.

Configuration lives in `wrangler.jsonc`. The example includes a daily cron trigger that calls `deleteExpiredRecords(new Date())` to clean up expired challenges, sessions, and expiring invites.

For production, set `RP_ID` and `RP_ORIGIN` in `wrangler.jsonc` to the deployed domain. Local development falls back to the request URL when those vars are omitted.

## Commands

```bash
pnpm --filter @passkeeper/example-cloudflare-worker run typecheck
pnpm --filter @passkeeper/example-cloudflare-worker run build
pnpm --filter @passkeeper/example-cloudflare-worker run dev
```

## Files

```txt
src/index.ts
wrangler.jsonc
worker-configuration.d.ts
```
