-- Case-insensitive usernames: enforce uniqueness on lower(username).
create unique index if not exists profiles_username_lower_uk on profiles (lower(username));

-- Admin-initiated password reset tokens.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  created_by uuid references profiles(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_resets_token on password_resets(token);
create index if not exists idx_password_resets_user on password_resets(user_id);
