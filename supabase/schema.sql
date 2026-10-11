-- Release Radar schema. Run once in the Supabase SQL editor.

create table if not exists repos (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  full_name text not null unique,
  html_url text not null,
  description text,
  added_at timestamptz not null default now()
);

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('scheduled', 'manual')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  created_at timestamptz not null default now(),
  repos_checked int not null default 0,
  counts jsonb not null default '{}'::jsonb,
  quiet_repos jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  headline text,
  email_status text,
  email_sent_at timestamptz,
  email_to text,
  email_error text
);

create table if not exists digest_items (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references digests(id) on delete cascade,
  repo_full_name text not null,
  release_tag text,
  release_name text,
  release_url text,
  published_at timestamptz,
  is_prerelease boolean not null default false,
  importance text not null check (importance in ('red', 'yellow', 'green')),
  unsure boolean not null default false,
  is_security boolean not null default false,
  is_breaking boolean not null default false,
  summary text,
  key_changes jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  reason text,
  ai_status text
);

-- Added in step 4: cache of the AI's answer, so the same release is never summarised twice (the free Gemini tier is 20 requests/day per model).
alter table digest_items add column if not exists body_hash text;
alter table digest_items add column if not exists ai_raw jsonb;
alter table digest_items add column if not exists ai_model text;

create index if not exists digest_items_cache_idx on digest_items (repo_full_name, release_tag, body_hash);
create index if not exists digest_items_digest_id_idx on digest_items (digest_id);
create index if not exists digests_created_at_idx on digests (created_at desc);

-- Only the server (secret key) touches these tables. No public policies = browsers cannot read or write them.
alter table repos enable row level security;
alter table digests enable row level security;
alter table digest_items enable row level security;
