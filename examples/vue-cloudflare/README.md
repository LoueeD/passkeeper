# Passkeeper Vue Cloudflare Example

Vite + Vue app that uses `@passkeeper/client` against the standard Passkeeper `/auth/*` endpoints.

This example is frontend-only. During local development, Vite proxies `/auth` to the Cloudflare Worker example on `http://localhost:8787`.

## Setup

Install dependencies from the repository root:

```bash
pnpm install
```

Start the Worker example in one shell:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker run dev
```

Apply the Worker example's local migration and development invite seed first, as described in [../cloudflare-worker/README.md](../cloudflare-worker/README.md). The Vue form prefills that local-only `launch-code` invite.

Start Vue in another shell:

```bash
pnpm --filter @passkeeper/example-vue-cloudflare run dev
```

Then open the Vite dev URL and use the form to register, log in, check the session, and log out.

## Commands

```bash
pnpm --filter @passkeeper/example-vue-cloudflare run typecheck
pnpm --filter @passkeeper/example-vue-cloudflare run build
pnpm --filter @passkeeper/example-vue-cloudflare run preview
```

## Files

```txt
index.html
src/App.vue
src/main.ts
src/style.css
vite.config.ts
```

The example aliases local workspace package source in `vite.config.ts` because the packages are not published yet.
