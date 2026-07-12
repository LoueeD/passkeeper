# Roadmap

## Phase 1: Library-first

```txt
@passkeeper/core
@passkeeper/client
@passkeeper/cloudflare
@passkeeper/d1
```

Goal:

> I can add passkey auth to a Cloudflare Worker app.

This is the two-week build.

## Phase 2: Framework Adapters

```txt
@passkeeper/astro
@passkeeper/hono
@passkeeper/vue
@passkeeper/react
```

Do not build these first. Start with examples instead:

```txt
examples/astro-cloudflare
examples/hono-cloudflare
examples/vue-spa
```

If people ask for adapters repeatedly, then package them.

## Phase 3: Product Layer

```txt
@passkeeper/admin
@passkeeper/cli
```

### `@passkeeper/cli`

```bash
npx passkeeper init
npx passkeeper migrate
npx passkeeper doctor
```

### `@passkeeper/admin`

Embeddable admin UI:

```txt
Users
Credentials
Sessions
Invites
Audit log
```

This could become the bridge to a hosted Passkeeper app.

## Phase 4: Hosted Passkeeper

Only after library traction:

```txt
passkeeper.dev
hosted dashboard
managed invites
usage analytics
session/device overview
audit logs
team management
```

Hosted product positioning:

> Passkey-first auth for small SaaS apps. Start self-hosted. Upgrade when you want hosted dashboards, team management, and audit logs.

## Monorepo Structure

```txt
passkeeper/
  packages/
    core/
      src/
      test/
      package.json
    client/
      src/
      test/
      package.json
    cloudflare/
      src/
      test/
      package.json
    d1/
      src/
      migrations/
      test/
      package.json

  examples/
    cloudflare-worker/
    astro-cloudflare/
    vue-cloudflare/

  docs/
    getting-started.md
    cloudflare.md
    concepts.md
    security.md
    api-reference.md

  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts
```

Use `pnpm`, `tsup` or `unbuild`, `vitest`, strict TypeScript, and Changesets for publishing.

## Strongest MVP

The best initial product is:

> Passkeeper Cloudflare Starter: add passkey-only auth to a Cloudflare Worker + D1 app.

The developer should be able to do this:

```bash
npm install @passkeeper/core @passkeeper/client @passkeeper/cloudflare @passkeeper/d1
```

Then:

```ts
const auth = createPasskeeperRoutes({
  rpName: "My App",
  rpId: "localhost",
  origin: "http://localhost:8787",
  storage: d1Adapter(env.DB),
});
```

And get working endpoints.

That is a compelling v0.1.
