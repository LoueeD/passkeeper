# Passkeeper Examples

This directory contains runnable examples for the current workspace packages.

## Cloudflare Worker

Use `examples/cloudflare-worker` when you want the smallest Worker + D1 integration. It serves a plain HTML page and handles `/auth/*` directly from a Worker.

The Worker and Astro examples enforce invite-first signup and share a documented local-only seed invite. The Vue example uses the Worker backend and the same invite.

See [cloudflare-worker/README.md](cloudflare-worker/README.md).

## Astro Cloudflare

Use `examples/astro-cloudflare` when you want an Astro app deployed to Cloudflare with Passkeeper endpoints served from Astro routes.

See [astro-cloudflare/README.md](astro-cloudflare/README.md).

## Vue Cloudflare

Use `examples/vue-cloudflare` when you want a frontend-only Vue app that talks to the Worker example during local development.

See [vue-cloudflare/README.md](vue-cloudflare/README.md).

## Check All Examples

From the repository root:

```bash
pnpm run examples:typecheck
pnpm run examples:build
```
