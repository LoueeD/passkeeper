# D1 Storage Schema

`@passkeeper/d1` should provide the Cloudflare D1 storage adapter, migrations, and readable SQL.

Developers should be able to inspect the schema and trust it.

## Tables

```txt
passkeeper_users
passkeeper_credentials
passkeeper_challenges
passkeeper_sessions
passkeeper_invites
```

## Initial Schema

```sql
create table passkeeper_users (
  id text primary key,
  username text not null unique,
  display_name text,
  created_at text not null,
  updated_at text not null
);

create table passkeeper_credentials (
  id text primary key,
  user_id text not null,
  credential_id text not null unique,
  public_key text not null,
  counter integer not null default 0,
  transports text,
  backed_up integer,
  created_at text not null,
  last_used_at text,
  foreign key (user_id) references passkeeper_users(id)
);

create index passkeeper_credentials_user_created_idx
  on passkeeper_credentials (user_id, created_at);

create table passkeeper_challenges (
  id text primary key,
  user_id text,
  type text not null,
  challenge text not null,
  expires_at text not null,
  created_at text not null
);

create index passkeeper_challenges_expires_idx
  on passkeeper_challenges (expires_at);

create table passkeeper_sessions (
  id text primary key,
  user_id text not null,
  token_hash text not null unique,
  expires_at text not null,
  created_at text not null,
  last_seen_at text,
  foreign key (user_id) references passkeeper_users(id)
);

create index passkeeper_sessions_user_idx
  on passkeeper_sessions (user_id);

create index passkeeper_sessions_expires_idx
  on passkeeper_sessions (expires_at);

create table passkeeper_invites (
  id text primary key,
  code_hash text not null unique,
  email text,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at text,
  created_at text not null
);

create index passkeeper_invites_expires_idx
  on passkeeper_invites (expires_at);
```

The `username`, `credential_id`, `token_hash`, and `code_hash` unique constraints cover direct lookup paths. Additional indexes support credential listing by user and `d1Adapter(...).deleteExpiredRecords(now)` cleanup for expired challenges, sessions, and invites.
