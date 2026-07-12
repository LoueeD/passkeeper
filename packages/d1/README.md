# @passkeeper/d1

Cloudflare D1 storage adapter and migrations for Passkeeper.

This package implements the `PasskeeperStorage` contract from `@passkeeper/core` using D1 tables for users, credentials, challenges, sessions, and invites.

Challenge consumption uses a single delete-and-return statement so challenges are consumed atomically. Invite consumption uses a single guarded update-and-return statement so limited-use invites cannot be overused by concurrent requests.

Credential counter updates are also guarded by the previously observed counter value. If another request updates the same credential first, the guarded update fails and core rejects the authentication completion.

When reading credentials, malformed transport metadata is treated as an empty transport list and unknown backup-status values are omitted.

The migration includes indexes for credential listing by user and expiry-based cleanup paths for challenges, sessions, and invites. Call `deleteExpiredRecords(now)` with a valid `Date` from scheduled maintenance to remove expired challenges, sessions, and invites with an `expiresAt` value.

All adapter methods that persist timestamps require valid `Date` inputs.

The package test suite includes focused SQL-shape tests and a Miniflare-backed integration test that applies the shipped migration and exercises guarded challenge, invite, credential-counter, session, and cleanup behavior.

## Install

```bash
pnpm add @passkeeper/d1
```

## Usage

```ts
import { d1Adapter } from "@passkeeper/d1";

const storage = d1Adapter(env.DB);
```

`d1Adapter()` validates that the provided binding exposes D1's `prepare(query)` method and throws a clear setup error if the binding shape is wrong.

For scheduled cleanup:

```ts
await storage.deleteExpiredRecords(new Date());
```

Use the migration included in this package:

```txt
migrations/0001_initial.sql
```

In this repository's examples, Wrangler points at the migration directory:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "migrations_dir": "../../packages/d1/migrations"
    }
  ]
}
```

## Status

Pre-1.0. APIs may change.
