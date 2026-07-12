# Security Policy

Passkeeper is an authentication library, so security reports are important even while the project is pre-1.0.

## Supported Versions

Passkeeper has not published a stable release yet. Until the first stable release, security fixes target the current `main` branch and the next package release.

## Reporting A Vulnerability

Please do not open public issues for suspected vulnerabilities.

Send a private report to the project maintainers with:

- Affected package or example.
- Description of the issue and expected impact.
- Reproduction steps or proof of concept.
- Any known affected versions, commits, or configurations.

If a private security advisory channel is available for the repository, use that. Otherwise, contact the maintainers directly.

## Scope

Security-sensitive areas include:

- WebAuthn verification and relying party configuration.
- Challenge creation, expiry, and one-time consumption.
- Credential counters and credential lookup.
- Session token generation, hashing, expiry, cookies, and logout.
- Invite code hashing and consumption.
- Cloudflare Worker route handling and D1 storage behavior.

Example apps are development examples, not hardened production templates. Production deployments should add rate limiting, monitoring, logging, and explicit trusted-origin configuration.

Production invite codes should be long, randomly generated values. Hashing does not make weak human-chosen invite codes resistant to offline guessing after a database disclosure.

## Security Model

For implementation details and caveats, see [docs/security.md](docs/security.md).
