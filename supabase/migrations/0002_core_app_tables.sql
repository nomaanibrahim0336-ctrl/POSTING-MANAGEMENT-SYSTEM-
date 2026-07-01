-- Core app data tables (clients, tasks, team). The frontend stores each
-- record's full state as a JSON payload and talks to these directly with
-- the anon/publishable key (see assets/js/app.js supaFetch calls).

create table if not exists smm_clients (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists smm_tasks (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists smm_team (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table smm_clients enable row level security;
alter table smm_tasks enable row level security;
alter table smm_team enable row level security;

create policy "anon full access" on smm_clients for all to anon using (true) with check (true);
create policy "anon full access" on smm_tasks for all to anon using (true) with check (true);
create policy "anon full access" on smm_team for all to anon using (true) with check (true);
