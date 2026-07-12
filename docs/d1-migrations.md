# D1 Migrations

`@passkeeper/d1` ships the SQL migrations that create Passkeeper's users, credentials, challenges, invites, and sessions tables.

## Configure Wrangler

Point the consuming Worker or Astro app at the package migration directory:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "passkeeper-example",
      "database_id": "replace-with-your-database-id",
      "migrations_dir": "../../packages/d1/migrations"
    }
  ]
}
```

The relative `migrations_dir` is resolved from the consuming app's Wrangler configuration. Adjust it when the app is not two directories below the repository root.

## Apply Locally

For the Worker example:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations apply passkeeper-example --local
```

For the Astro example:

```bash
pnpm --filter @passkeeper/example-astro-cloudflare exec wrangler d1 migrations apply passkeeper-astro-example --local
```

Apply migrations before starting the app for the first time and whenever a new migration is added.

The runnable examples enable invite-first signup. After applying local migrations, seed their shared development invite with the command in each example README. `scripts/seed-development-invite.sql` contains a known code and must never be applied to a remote or production database.

## Apply Remotely

Create the production database once, place its returned ID in the app's Wrangler configuration, and then apply migrations without `--local`:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations apply passkeeper-example --remote
```

Review the target database name and Wrangler account before confirming a remote migration. Keep migration files immutable after they have been applied; add a new numbered migration for later schema changes.

## Expired Records

Schema migration and expired-record cleanup are separate operations. Run cleanup from a scheduled Worker that shares the D1 binding:

```ts
import { d1Adapter } from "@passkeeper/d1";

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await d1Adapter(env.DB).deleteExpiredRecords(new Date());
  },
};
```

The first-party site Worker and Worker example include scheduled cleanup. The Astro Pages-style example does not expose a scheduled entrypoint, so pair it with a scheduled Worker for long-running deployments.

## Verify

List migration state through the consuming workspace package:

```bash
pnpm --filter @passkeeper/example-cloudflare-worker exec wrangler d1 migrations list passkeeper-example --local
```

Then run the repository gate:

```bash
pnpm run check
```
