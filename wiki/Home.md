# Passkeeper Wiki

Passkeeper should be positioned as:

> Passkey-first auth primitives for Cloudflare, edge apps, and TypeScript SaaS projects.

The important move is to start with npm packages that solve a specific developer pain, then add a hosted dashboard only after people use the libraries.

## Core Wedge

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

Most auth tools are broad. Passkeeper should be narrow.

## Wiki Pages

- [Product Positioning](Product-Positioning.md)
- [Package Architecture](Package-Architecture.md)
- [D1 Storage Schema](D1-Storage-Schema.md)
- [Roadmap](Roadmap.md)
- [Two-Week Plan](Two-Week-Plan.md)
- [API Shape](API-Shape.md)
- [Security Model](Security-Model.md)
- [Landing Page](Landing-Page.md)
- [Business Model](Business-Model.md)

## Sources

- npm supports publishing public scoped packages under an organization namespace. See [npm scopes][npm-scopes].
- Passkeys are built on WebAuthn, where sites authenticate users using public-key cryptography rather than passwords or shared secrets. See [MDN passkeys][mdn-passkeys].
- WebAuthn credentials are scoped to the relying party and origin, so `rpId`, `origin`, and challenge storage need to be first-class configuration. See [WebAuthn Level 3][webauthn].
- Cloudflare Workers are a strong fit because the runtime is edge-native, with D1 and Durable Objects as deployable primitives. See [Cloudflare Durable Objects][durable-objects].

[npm-scopes]: https://docs.npmjs.com/misc/scope/ "npm scopes"
[mdn-passkeys]: https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys "Passkeys - MDN Web Docs"
[webauthn]: https://www.w3.org/TR/webauthn-3/ "WebAuthn Level 3"
[durable-objects]: https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/ "What are Durable Objects?"
