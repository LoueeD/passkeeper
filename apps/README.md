# Passkeeper Apps

This directory contains first-party applications used to dogfood the workspace packages.

## Site

`apps/site` is the product site and canonical dogfood app. Vite builds the one-page frontend while the same Cloudflare Worker serves the embedded demo API under `/demo/auth/*`, backed by D1 and the workspace packages.

The demo covers passkey registration, login, sessions, logout, additional passkeys, and invite-gated signup. Examples stay small and copy-paste friendly; the site can be a more complete integration and release-validation surface.

Run it locally with:

```bash
pnpm --filter @passkeeper/app-site run dev
```

Open `http://localhost:4174/#demo`. Local setup applies D1 migrations and seeds the development invite `launch-code`.

## Check All Apps

From the repository root:

```bash
pnpm run apps:typecheck
pnpm run apps:build
```
