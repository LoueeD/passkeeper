# Getting Started

Passkeeper is currently a pnpm workspace with local packages and runnable examples. The packages are not documented here as published npm packages yet; use workspace dependencies while developing.

## Install

```bash
pnpm install
```

## Package Checks

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

These root scripts run the library packages under `packages/*`.

## Changesets

Create a changeset for package-facing changes:

```bash
pnpm run changeset
```

Version packages from accumulated changesets:

```bash
pnpm run version
```

## Example Checks

```bash
pnpm run apps:typecheck
pnpm run apps:build
pnpm run examples:typecheck
pnpm run examples:build
```

The `apps:*` scripts check first-party apps under `apps/*`. The `examples:*` scripts check runnable integrations under `examples/*`.

Run the complete local gate with:

```bash
pnpm run check
```

## Run The Worker Example

See [../examples/cloudflare-worker/README.md](../examples/cloudflare-worker/README.md) for the example-specific guide.

Generate Worker types:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler types
```

Apply the local D1 migration:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations apply passkeeper-example --local
```

Seed its local development invite:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 execute passkeeper-example --local --file ../../scripts/seed-development-invite.sql
```

Start Wrangler dev:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker run dev
```

Open the local Wrangler URL and use the form to register a passkey, log in, check the session, and log out. WebAuthn requires a browser context that supports passkeys. Localhost works for development; production should use HTTPS.

## Run The Vue Example

See [../examples/vue-cloudflare/README.md](../examples/vue-cloudflare/README.md) for the example-specific guide.

Start the Worker example on port `8787`, then in another shell:

```bash
pnpm --filter @passkeeper/example-vue-cloudflare run dev
```

The Vue dev server proxies `/auth` to `http://localhost:8787`.

## Run The Astro Example

See [../examples/astro-cloudflare/README.md](../examples/astro-cloudflare/README.md) for the example-specific guide.

Apply the Astro example D1 migration locally:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare exec wrangler d1 migrations apply passkeeper-astro-example --local
```

Seed its local development invite:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare exec wrangler d1 execute passkeeper-astro-example --local --file ../../scripts/seed-development-invite.sql
```

Start Astro dev:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare run dev
```

The Astro app has its own `/auth/*` route backed by `@passkeeper/cloudflare` and `@passkeeper/d1`.

## Next Steps

- [Cloudflare setup](cloudflare.md)
- [D1 migrations](d1-migrations.md)
- [API reference](api-reference.md)
- [Security model](security.md)
- [Troubleshooting](troubleshooting.md)
