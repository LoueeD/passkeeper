# AGENTS.md

This file is for coding agents working in this repository.

README files are for humans: quick starts, project descriptions, and contribution guidelines. `AGENTS.md` complements that by containing the extra context coding agents need, such as build steps, tests, conventions, project constraints, and where to find deeper planning notes.

Keep this file separate from the README so human-facing docs stay concise while agents have a clear, predictable place for precise implementation guidance.

## Project Context

Passkeeper is a passkey-first auth toolkit for Cloudflare, edge apps, and TypeScript SaaS projects.

The v0.1 package set is:

```txt
@passkeeper/core
@passkeeper/client
@passkeeper/cloudflare
@passkeeper/d1
```

The preferred initial product is a Cloudflare Worker + D1 starter for passkey-only auth with invite-first signup.

## Documentation Map

- `README.md`: human-facing project summary and wiki index.
- `CONTRIBUTING.md`: human-facing setup, check, and contribution notes.
- `LICENSE`: MIT license text for the repository and packages.
- `SECURITY.md`: vulnerability reporting policy and supported-version note.
- `docs/getting-started.md`: practical quickstart for packages and examples.
- `docs/cloudflare.md`: Worker/D1 setup details and route behavior.
- `docs/cloudflare-staging.md`: guarded staging resource, migration, deploy, validation, and rollback workflow.
- `docs/d1-migrations.md`: local and remote D1 migration and cleanup workflows.
- `docs/releasing.md`: package ownership, versioning, verification, and publishing preflight.
- `docs/concepts.md`: core auth concepts used by the implementation.
- `docs/api-reference.md`: current public package surface.
- `docs/security.md`: security model and caveats.
- `docs/troubleshooting.md`: symptom-first integration troubleshooting.
- `scripts/seed-development-invite.sql`: known local-only invite seed for runnable examples; never apply remotely.
- `apps/README.md`: human-facing index for first-party apps.
- `apps/site`: one-page Vite product site and canonical Worker/D1 dogfood app with an embedded demo.
- `examples/README.md`: human-facing index for runnable examples.
- `packages/*/README.md`: npm-facing package usage summaries.
- `wiki/Home.md`: high-level positioning and source links.
- `wiki/Product-Positioning.md`: product wedge and opinionated decisions.
- `wiki/Package-Architecture.md`: package responsibilities and example APIs.
- `wiki/D1-Storage-Schema.md`: initial D1 schema.
- `wiki/Roadmap.md`: phases, monorepo structure, and MVP.
- `wiki/Two-Week-Plan.md`: day-by-day implementation plan.
- `wiki/API-Shape.md`: target developer-facing API.
- `wiki/Security-Model.md`: security docs and defaults to preserve.
- `wiki/Landing-Page.md`: landing page structure.
- `wiki/Business-Model.md`: later commercial options.

## Current Repository State

This repository is a pnpm workspace with four initial packages, one first-party app, and three examples.

`@passkeeper/core` has initial runtime-agnostic primitives for config validation, typed errors, storage contracts, challenge lifecycle helpers, invite-gated registration, authenticated additional-passkey registration, authentication backed by Oslo/WebCrypto verification, and hashed session tokens. `@passkeeper/d1` has a SQL-backed D1 adapter for users, credentials, challenges, invites, sessions, and credential counter updates. `@passkeeper/cloudflare` has Worker-native auth routes for passkey registration, session-protected additional-passkey registration, passkey login, `/auth/me`, and logout with session cookies. `@passkeeper/client` has browser helpers for registration/additional-passkey/login endpoint calls, WebAuthn option conversion, and credential serialization.

`apps/site` is the canonical first-party dogfood app and one-page product site. Cloudflare's Vite plugin builds the frontend and Worker together; the Worker mounts Passkeeper routes under `/demo/auth/*`, serves the embedded auth web component, uses D1 migrations from `packages/d1/migrations`, and performs scheduled cleanup. Keep it useful for end-to-end manual validation and keep package and security claims synchronized with the current implementation.

`pnpm --filter @passkeeper/app-site run dev` performs idempotent local D1 setup before starting Vite on port 4174. Use `dev:setup` to prepare D1 without starting the server. The local development invite is `launch-code`.

`examples/cloudflare-worker` is a runnable Worker + D1 example that serves a small HTML UI at `/`, auth routes under `/auth/*`, and uses the D1 migrations from `packages/d1/migrations`.

`examples/astro-cloudflare` is an Astro app configured for Cloudflare server output. It exposes Passkeeper auth endpoints from an Astro catch-all route backed by D1 and uses `@passkeeper/client` in the page script.

`examples/vue-cloudflare` is a Vite + Vue app that uses `@passkeeper/client` and proxies `/auth` to the Worker example on `localhost:8787` during development.

The public APIs are still pre-1.0 and should be treated as subject to change.

## Build And Test Commands

Install dependencies:

```bash
pnpm install
```

Run the full local gate:

```bash
pnpm run check
```

Run the isolated Chrome/WebAuthn embedded demo flow:

```bash
pnpm run apps:e2e
```

This starts the Cloudflare Vite development environment and Chrome with virtual WebAuthn authenticators. It requires an installed Chrome or Chromium executable; set `CHROME_PATH` when it is not in a common macOS or Linux location.

Verify publishable tarball contents and metadata:

```bash
pnpm run pack:check
```

`pack:check` is offline and verifies archive contents and metadata. CI additionally runs the registry-capable clean consumer install:

```bash
pnpm run pack:check:consumer
```

The stricter release variant rejects placeholder `0.0.0` package versions:

```bash
pnpm run pack:check:release
```

Build packages:

```bash
pnpm run build
```

Create a changeset:

```bash
pnpm run changeset
```

Version packages from changesets:

```bash
pnpm run version
```

Run package tests:

```bash
pnpm run test
```

Typecheck packages:

```bash
pnpm run typecheck
```

Build apps:

```bash
pnpm run apps:build
```

Typecheck apps:

```bash
pnpm run apps:typecheck
```

Build examples:

```bash
pnpm run examples:build
```

Typecheck examples:

```bash
pnpm run examples:typecheck
```

Clean package build output:

```bash
pnpm run clean
```

Do not claim that builds or tests pass unless dependencies are installed and the relevant command has been run in this workspace. Root `build`, `test`, and `typecheck` currently target packages only; use the `apps:*` scripts for first-party apps and `examples:*` scripts for example apps.

## Tooling

```txt
pnpm 11.7.0 workspaces
strict TypeScript
vitest
tsup
Changesets
Astro
Vue
Vite
Wrangler
playwright-core
```

`pnpm-workspace.yaml` allows build scripts for `esbuild`, `sharp`, and `workerd`, which are needed by the current toolchain and Wrangler dependencies.

GitHub Actions runs `pnpm run check` from `.github/workflows/ci.yml`. Package verification packs each public package and inspects required files and publish metadata. The CI consumer check installs the archives into a clean temporary project, preferring the local pnpm store with registry fallback, and imports every package entrypoint. CI also runs `pnpm run apps:e2e` against Chrome with virtual WebAuthn authenticators and isolated local D1 state.

Changesets config lives in `.changeset/config.json`. Packages are scoped public packages, so each publishable package should keep `publishConfig.access` set to `public`.

`@passkeeper/core` depends on `@oslojs/webauthn` for WebAuthn parsing and uses runtime WebCrypto for assertion signature verification. Runtime WebCrypto is used because it is the standards-based primitive already available in target runtimes; if Oslo later provides a higher-level assertion verifier for the full parsed-authenticator-data/client-data-hash/COSE-key/signature flow, prefer that before expanding the local code. `@passkeeper/core` and `@passkeeper/client` use `@oslojs/encoding` for RFC base64url helpers. Oslo packages are preferred for WebAuthn-adjacent primitives. If a feature does not use an Oslo package, document why the project is avoiding the dependency and whether an Oslo package would improve correctness, maintenance, or security. Keep WebAuthn verification centralized in `packages/core/src/verification.ts`; do not hand-roll CBOR/client-data/authenticator-data parsing elsewhere.

`@passkeeper/d1` uses Miniflare as a test-only dependency to apply the shipped migration and verify adapter behavior against Cloudflare's local D1 simulator. Keep the focused SQL-shape tests as well; they provide clearer failures for individual statements while the integration suite protects the real migration/adapter contract.

## Implementation Conventions

- Keep `@passkeeper/core` runtime-agnostic.
- Do not add Cloudflare, D1, framework, route, cookie, email, or billing concerns to `@passkeeper/core`.
- Keep the first implementation narrow: passkey registration, passkey login, invite-only signup, sessions, Cloudflare Worker routes, D1 adapter, browser client helper, Cloudflare/Astro/Vue examples, and docs.
- Defer OAuth, password fallback, magic links, framework component packages, hosted dashboards, multi-tenant orgs, enterprise SSO, admin UI, and emails.
- Treat `rpId`, `origin`, challenge expiry, credential counters, session token hashing, and secure cookie defaults as security-critical.
- Keep SQL readable and inspectable.
- Prefer examples before framework adapters. Package adapters only after repeated demand.
- Keep README human-facing. Put agent-specific build, test, and convention details here.
- Keep package runtime imports publishable, but examples may use Vite/Astro aliases to local package source while the packages are unpublished.

## Agent Maintenance Notes

When adding new tooling or packages, update this file in the same change with:

```txt
build commands
test commands
lint/typecheck commands
package manager choice
repo layout changes
important implementation conventions
known caveats
```

If a subdirectory later needs different instructions, add a nested `AGENTS.md` in that directory.
