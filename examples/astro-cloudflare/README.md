# Passkeeper Astro Cloudflare Example

Astro app configured for Cloudflare server output with Passkeeper auth endpoints backed by D1.

The app renders a small passkey UI at `/` and serves auth routes from `src/pages/auth/[...path].ts`.

This Pages-style example does not define a scheduled cleanup entrypoint. For long-running deployments, run `d1Adapter(env.DB).deleteExpiredRecords(new Date())` from a scheduled Worker that shares the same D1 database.

For production, set `RP_ID` and `RP_ORIGIN` in `wrangler.jsonc` to the deployed domain. Local development falls back to the request URL when those vars are omitted.

## Setup

Install dependencies from the repository root:

```bash
pnpm install
```

Apply the local D1 migration:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare exec wrangler d1 migrations apply passkeeper-astro-example --local
```

Seed the development-only invite used by the form:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare exec wrangler d1 execute passkeeper-astro-example --local --file ../../scripts/seed-development-invite.sql
```

The example enables `inviteRequired` and prefills the seeded plaintext code `launch-code`. Do not apply this shared development seed to a deployed database.

Start local dev:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare run dev
```

Then open the Astro dev URL and use the form to register or log in. A successful session reveals the protected dashboard, session details, logout, and authenticated second-passkey registration.

## Commands

```bash
pnpm --filter @passkeeper/example-astro-cloudflare run typecheck
pnpm --filter @passkeeper/example-astro-cloudflare run build
pnpm --filter @passkeeper/example-astro-cloudflare run preview
```

## Files

```txt
astro.config.mjs
src/pages/index.astro
src/pages/auth/[...path].ts
wrangler.jsonc
```

The example aliases local workspace package source in `astro.config.mjs` because the packages are not published yet.
