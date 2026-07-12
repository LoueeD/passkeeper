# Two-Week Plan

## Days 1-2: Core Domain Model

Build:

```txt
Config validation
Types
Storage interface
Challenge lifecycle
Registration begin
Registration complete
Login begin
Login complete
Typed errors
```

Do not build sessions yet unless registration and login work cleanly.

## Days 3-4: D1 Adapter

Build:

```txt
SQL migrations
D1 adapter
Challenge CRUD
User CRUD
Credential CRUD
Session CRUD
Tests against local D1 or mocked adapter
```

## Days 5-6: Cloudflare Routes

Build:

```txt
Route handler factory
Register begin/complete
Login begin/complete
Logout
Me endpoint
Secure cookie helpers
JSON error responses
```

The goal is a developer-friendly default route layer.

## Days 7-8: Browser Client

Build:

```txt
registerPasskey()
loginWithPasskey()
Base64URL conversion helpers
PublicKeyCredential serialization
Friendly browser errors
```

This is where the package starts to feel polished.

## Days 9-10: Example App

Build one excellent example:

```txt
examples/astro-cloudflare
```

Include:

```txt
Sign up with invite code
Register passkey
Login with passkey
Protected dashboard
Logout
Session display
Add second passkey
```

This example is more important than extra packages.

## Days 11-12: Docs

Write:

```txt
Quickstart
Concepts
Cloudflare setup
D1 migration guide
Security model
API reference
Troubleshooting
```

Docs should include copy-paste snippets.

## Day 13: Polish

Add:

```txt
Better errors
Package READMEs
npm metadata
Badges
License
Security policy
Minimal landing page
```

## Day 14: Publish and Launch

Publish:

```txt
@passkeeper/core
@passkeeper/client
@passkeeper/cloudflare
@passkeeper/d1
```

Launch with a very specific message:

> I built Passkeeper: passkey-only auth for Cloudflare Workers.
> No passwords, no magic links, no hosted auth provider required.
> Install four packages, add D1, and ship passkey login.
