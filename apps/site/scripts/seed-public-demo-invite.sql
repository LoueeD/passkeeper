-- Public site demo only. Plaintext invite code: passkeeper-demo
insert into passkeeper_invites (
  id,
  code_hash,
  max_uses,
  used_count,
  created_at
)
values (
  'invite_public_passkeeper_demo',
  '3a78612d6d5e28cd39b5627f282850e6cfc6004c6054c655547a7716fa189f7a',
  2147483647,
  0,
  '2026-07-13T00:00:00.000Z'
)
on conflict (code_hash) do update set
  max_uses = excluded.max_uses,
  expires_at = null;
