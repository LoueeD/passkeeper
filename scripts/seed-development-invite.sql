-- Development examples only. Plaintext invite code: launch-code
insert into passkeeper_invites (
  id,
  code_hash,
  max_uses,
  used_count,
  created_at
)
values (
  'invite_development_launch_code',
  'a56d27d796dcb031d34a58611c9b9ee3c5ef9788958d119d24026ae6b96d97b0',
  100,
  0,
  '2026-01-01T00:00:00.000Z'
)
on conflict (code_hash) do nothing;
