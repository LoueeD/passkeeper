# Contributing

Thanks for working on Passkeeper. The project is still pre-1.0, so keep changes narrow, tested, and aligned with the passkey-first v0.1 scope.

## Setup

```bash
pnpm install
```

## Check Everything

```bash
pnpm run check
```

This runs package typechecks, package tests, package builds, package archive checks, first-party app checks, and example checks.

It also packs each public package and verifies its files and publish metadata. CI follows that with `pnpm run pack:check:consumer` to install the archives in a clean temporary project and import every entrypoint.

## Useful Commands

```bash
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run apps:typecheck
pnpm run apps:build
pnpm run apps:e2e
pnpm run examples:typecheck
pnpm run examples:build
```

## Changesets

For package-facing changes, create a changeset:

```bash
pnpm run changeset
```

Use `pnpm run version` to apply accumulated changesets when preparing a release.

See [docs/releasing.md](docs/releasing.md) for the complete release preflight and verification sequence.

## Scope

Keep the initial implementation focused on passkey registration, passkey login, invite-only signup, sessions, Cloudflare Worker routes, D1 storage, browser helpers, examples, and docs.

Defer OAuth, password fallback, magic links, framework component packages, hosted dashboards, multi-tenant orgs, enterprise SSO, admin UI, and emails.
