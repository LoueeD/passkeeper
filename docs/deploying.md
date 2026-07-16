# Deploying The Site

The site and embedded Passkeeper demo deploy as one Cloudflare Worker at `https://passkeeper.lougd.com`. Static assets and `/demo/auth/*` use the same origin, and demo state is stored in the `passkeeper` D1 database.

## Preflight

From the repository root, confirm Cloudflare authentication and run the local checks:

```bash
pnpm --filter @passkeeper/app-site exec wrangler whoami
pnpm --filter @passkeeper/app-site run typecheck
pnpm --filter @passkeeper/app-site run build
pnpm --filter @passkeeper/app-site run test:e2e
```

The production Wrangler configuration uses a Workers Custom Domain for `passkeeper.lougd.com`. Its WebAuthn settings must remain:

```txt
RP_ID=passkeeper.lougd.com
RP_ORIGIN=https://passkeeper.lougd.com
```

## Migrate

Inspect and apply remote D1 migrations before deploying code that depends on them:

```bash
pnpm --filter @passkeeper/app-site exec wrangler d1 migrations list passkeeper --remote --config wrangler.jsonc
pnpm --filter @passkeeper/app-site exec wrangler d1 migrations apply passkeeper --remote --config wrangler.jsonc
```

Never apply `scripts/seed-development-invite.sql` to the remote database.

## Deploy

Build and deploy the Worker and static assets:

```bash
pnpm --filter @passkeeper/app-site run deploy
```

Cloudflare creates and manages the DNS record and certificate for the Custom Domain. Seed the intentionally public, multi-use demo invite:

```bash
pnpm --filter @passkeeper/app-site run demo:seed-invite
```

The public code is `passkeeper-demo` and is prefilled by the deployed web component. This code is for the disposable site demo only; do not copy its high-use invite policy into an application. The daily scheduled Worker removes demo users, credentials, sessions, and challenges once their user is more than 24 hours old.

## Validate

At `https://passkeeper.lougd.com/#demo`:

- Register with the shared invite from more than one unique email.
- Read the authenticated session and add a second passkey.
- Log out, then log in with each passkey.
- Confirm requests from an untrusted origin are rejected.

List deployments or roll back Worker code with:

```bash
pnpm --filter @passkeeper/app-site exec wrangler versions list --config wrangler.jsonc
pnpm --filter @passkeeper/app-site exec wrangler rollback --config wrangler.jsonc
```

A Worker rollback does not roll back D1 data or migrations.
