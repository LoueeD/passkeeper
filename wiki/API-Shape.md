# API Shape

For the simple path, defaults matter more than flexibility.

## Registration

```ts
const options = await passkeeper.register.begin({
  username: "jane@example.com",
  displayName: "Jane",
  inviteCode: "launch-code",
});

const result = await passkeeper.register.complete({
  challengeId: options.challengeId,
  userId: options.user.id,
  credential,
  inviteCode: "launch-code",
});
```

When `inviteRequired` is enabled, begin validates the invite without consuming it. Completion consumes the invite after WebAuthn verification succeeds.

Public registration rejects established users. Add another passkey only after authenticating the user:

```ts
const options = await passkeeper.register.add.begin({ userId: session.userId });

await passkeeper.register.add.complete({
  challengeId: options.challengeId,
  userId: session.userId,
  credential,
});
```

## Login

```ts
const options = await passkeeper.login.begin({
  username: "jane@example.com",
});

const result = await passkeeper.login.complete({
  challengeId: options.challengeId,
  credential,
});
```

## Sessions

```ts
const session = await passkeeper.sessions.create({
  userId: result.user.id,
});
```

## Route Factory

```ts
const routes = createPasskeeperRoutes({
  rpName: "My App",
  rpId: env.RP_ID ?? url.hostname,
  origin: env.RP_ORIGIN ?? url.origin,
  storage: d1Adapter(env.DB),
  basePath: "/auth",
  beforeRequest: async ({ request, path, method }) => {
    return null;
  },
  sessionCookie: {
    secure: url.protocol === "https:",
  },
});

return routes.handle(request);
```

Known route paths return `405 Method Not Allowed` with an `Allow` header when called with the wrong method. Unknown routes return `404`.

`POST /auth/passkey/register/add/begin` and `POST /auth/passkey/register/add/complete` require the session cookie and bind the new credential to the authenticated user.

Known POST routes reject a present browser `Origin` that differs from the configured trusted origin. `beforeRequest` runs after that check and before body parsing or method-specific work, which gives Cloudflare integrations a place to plug in rate limiting or other request guards. Unknown paths under the base path return `404` without running the hook.

## Client

```ts
await registerPasskey({
  beginUrl: "/auth/passkey/register/begin",
  completeUrl: "/auth/passkey/register/complete",
  username: "jane@example.com",
  displayName: "Jane",
  inviteCode: "launch-code",
});

await loginWithPasskey({
  beginUrl: "/auth/passkey/login/begin",
  completeUrl: "/auth/passkey/login/complete",
  username: "jane@example.com",
});

await addPasskey({
  beginUrl: "/auth/passkey/register/add/begin",
  completeUrl: "/auth/passkey/register/add/complete",
});
```

Failed begin or complete requests throw `PasskeeperClientError` with the HTTP status and parsed response body when available.

## D1 Maintenance

```ts
const storage = d1Adapter(env.DB);

await storage.deleteExpiredRecords(new Date());
```

`deleteExpiredRecords(now)` expects a valid `Date`.

## Package Descriptions

### `@passkeeper/core`

> Runtime-agnostic passkey authentication primitives for TypeScript apps.

### `@passkeeper/client`

> Browser helpers for passkey registration and login.

### `@passkeeper/cloudflare`

> Cloudflare Workers route helpers for Passkeeper.

### `@passkeeper/d1`

> Cloudflare D1 storage adapter and migrations for Passkeeper.

### `create-passkeeper`

Later:

> Create a passkey-first Cloudflare app in seconds.
