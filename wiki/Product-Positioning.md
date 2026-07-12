# Product Positioning

Passkeeper should be a package-first auth toolkit:

> Passkey-first auth primitives for Cloudflare, edge apps, and TypeScript SaaS projects.

Do not start with a hosted auth platform. Start with npm packages that solve a specific pain, then add a hosted dashboard only after people use the libraries.

## What Makes Passkeeper Different

The wedge should not be "another auth framework."

The wedge should be:

```txt
Passkey-only
Cloudflare-first
Invite-friendly
Small SaaS ready
No passwords
No magic links
No OAuth required
No hosted lock-in
```

## Opinionated Decisions

### 1. Passkey-only, not auth everything

Do not add passwords.
Do not add email magic links.
Do not add OAuth in v0.1.

The brand promise is stronger if it is narrow.

### 2. Invite-first signup

Invite-coded signup should become a Passkeeper differentiator.

```txt
Public signups: optional
Invite-only signups: first-class
```

This is good for small SaaS, private betas, internal tools, agencies, and client portals.

### 3. Cloudflare-first, not Cloudflare-only

Design `@passkeeper/core` so it works anywhere, but make the first great experience Cloudflare.

That gives focus without trapping the architecture.

### 4. No hosted dependency

The package should work without calling Passkeeper servers.

That is the trust angle:

> Your users, credentials, sessions, and auth data stay in your own database.
