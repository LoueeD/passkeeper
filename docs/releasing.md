# Releasing

Passkeeper uses Changesets to version and publish its four public packages together for the initial release.

## Publisher Preflight

Before versioning packages:

- Confirm the publishing npm account owns or can publish under the `@passkeeper` scope.
- Confirm the intended source repository URL, issue tracker URL, and project homepage.
- Add those URLs to every publishable package manifest once they are authoritative.
- Confirm npm two-factor authentication and provenance requirements for the publishing account.
- Confirm the four package names are still unclaimed in the public registry.

Do not invent or copy placeholder ownership metadata into published manifests. A registry `404` means a public package is not currently visible; it does not prove that the active npm account controls the scope.

## Version Packages

Review the pending changesets, then apply them:

```bash
pnpm run version
```

For the initial changeset, this should move all four packages from `0.0.0` to `0.1.0` and replace internal `workspace:*` dependency ranges with publishable versions.

Review the resulting package versions, internal dependency ranges, changelogs, and lockfile before continuing.

## Verify Release Artifacts

Run the full workspace gate:

```bash
pnpm run check
```

Then run the release package check:

```bash
pnpm run pack:check:release
```

The release check rejects placeholder `0.0.0` versions, inspects required archive files and manifest fields, installs all packed packages into a clean temporary consumer, and imports every package entrypoint.

## Manual Validation

Before the first release, validate the site's embedded demo against a local D1 database in a real passkey-capable browser:

Run the automated Chrome ceremony first:

```bash
pnpm run apps:e2e
```

It uses virtual WebAuthn authenticators and isolated local D1 state to cover registration, session lookup, adding another passkey, logout, and login. Then repeat the critical flow manually with physical passkey-capable devices:

- Register with the development invite.
- Log out and log back in.
- Read the current session from `/auth/me`.
- Add a second passkey while authenticated.
- Confirm an invalid or reused invite is rejected.
- Confirm an untrusted browser origin is rejected.

Also deploy the Worker example to a non-production Cloudflare environment and repeat registration, login, session, and logout checks over HTTPS.

## Publish

Once package ownership, metadata, versioning, automated checks, and manual validation are complete:

```bash
pnpm run release
```

The release command reruns the workspace and release artifact checks before invoking `changeset publish`.
