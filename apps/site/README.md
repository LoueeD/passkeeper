# Passkeeper Site

The Passkeeper site is a one-page Vite app deployed with a Cloudflare Worker. Its embedded demo uses the same Worker for Passkeeper routes under `/demo/auth/*` and stores demo auth state in D1.

## Local Development

From the repository root:

```bash
pnpm --filter @passkeeper/app-site run dev
```

Open `http://localhost:4174/#demo`. Startup applies local migrations and seeds the development invite `launch-code`.

Run the isolated browser flow with:

```bash
pnpm run apps:e2e
```

See [Deploying The Site](../../docs/deploying.md) for the production D1 and deployment workflow.
