-- Facebook/Instagram connected accounts and scheduled posts.
-- Access tokens are only readable by the service role (used by Edge Functions),
-- never exposed to the anon key the frontend uses.

create extension if not exists pgcrypto;

create table if not exists smm_social_accounts (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  page_name text not null,
  page_access_token text not null,
  ig_id text,
  ig_username text,
  connected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table smm_social_accounts enable row level security;
-- No policies granted to anon/authenticated: only the service role (Edge Functions) can read/write this table.

-- Safe view for the frontend: everything except the access token.
create or replace view smm_social_accounts_public as
  select id, page_id, page_name, ig_id, ig_username, connected_by, created_at
  from smm_social_accounts;

grant select on smm_social_accounts_public to anon, authenticated;

create table if not exists smm_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  task_id text,
  page_id text not null references smm_social_accounts(page_id) on delete cascade,
  target text not null check (target in ('facebook', 'instagram', 'both')),
  caption text not null default '',
  media_url text,
  media_type text not null default 'IMAGE' check (media_type in ('IMAGE', 'VIDEO')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'publishing', 'posted', 'failed')),
  error text,
  facebook_post_id text,
  instagram_post_id text,
  created_by text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

alter table smm_scheduled_posts enable row level security;

-- Frontend (anon key) can create and read scheduled posts, but only the
-- service role (social-scheduler function) can transition their status.
create policy "anon can insert scheduled posts"
  on smm_scheduled_posts for insert
  to anon
  with check (true);

create policy "anon can read scheduled posts"
  on smm_scheduled_posts for select
  to anon
  using (true);

create policy "anon can cancel own pending posts"
  on smm_scheduled_posts for delete
  to anon
  using (status = 'pending');

create index if not exists idx_scheduled_posts_due
  on smm_scheduled_posts (status, scheduled_for);
