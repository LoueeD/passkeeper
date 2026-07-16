# Passkeeper

Passkeeper is a passkey-first auth toolkit for Cloudflare, edge apps, and TypeScript SaaS projects.

The initial product wedge is not a hosted auth platform. It is a small package family that helps developers add passkey-only signup, login, sessions, and invite codes without passwords, magic links, or hosted auth lock-in.

## Workspace

This repository is a pnpm workspace.

```txt
packages/core
packages/client
packages/cloudflare
packages/d1
apps/site
examples/cloudflare-worker
examples/astro-cloudflare
examples/vue-cloudflare
```

First-party app notes live in [apps/README.md](apps/README.md).
Example-specific setup notes live in [examples/README.md](examples/README.md).

Install dependencies with:

```bash
pnpm install
```

Run the package checks with:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

Run the example app checks with:

```bash
pnpm run apps:typecheck
pnpm run apps:build
pnpm run examples:typecheck
pnpm run examples:build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full local verification command and contribution notes.

## License

MIT. See [LICENSE](LICENSE).

## Security

Please report suspected vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Docs

- [Getting Started](docs/getting-started.md)
- [Cloudflare](docs/cloudflare.md)
- [Deploying the Site](docs/deploying.md)
- [D1 Migrations](docs/d1-migrations.md)
- [Releasing](docs/releasing.md)
- [Concepts](docs/concepts.md)
- [API Reference](docs/api-reference.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)

## Wiki

The wiki keeps planning, positioning, and roadmap notes separate from the quickstart docs.

- [Home](wiki/Home.md)
- [Product Positioning](wiki/Product-Positioning.md)
- [Package Architecture](wiki/Package-Architecture.md)
- [D1 Storage Schema](wiki/D1-Storage-Schema.md)
- [Roadmap](wiki/Roadmap.md)
- [Two-Week Plan](wiki/Two-Week-Plan.md)
- [API Shape](wiki/API-Shape.md)
- [Security Model](wiki/Security-Model.md)
- [Landing Page](wiki/Landing-Page.md)
- [Business Model](wiki/Business-Model.md)

## v0.1 Scope

The current implementation is focused on:

```txt
Passkey registration
Passkey login
Invite-only signup
Sessions
Cloudflare Worker routes
D1 adapter
Browser client helper
Embedded site demo
Astro example
Vue example
Docs
```

Defer OAuth, password fallback, magic links, framework components, hosted dashboards, multi-tenant orgs, enterprise SSO, admin UI, and emails.
