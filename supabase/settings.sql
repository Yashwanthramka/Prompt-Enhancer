-- Supabase settings schema for per-user API & MCP controls
-- Run in Supabase SQL editor. Assumes `auth.users` exists.

create extension if not exists pgcrypto;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

-- Profiles (one row per user)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  default_model text,
  default_ruleset text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_self_select on public.profiles
  for select using (user_id = auth.uid() or public.is_admin());
create policy profiles_self_upsert on public.profiles
  for insert with check (user_id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles
  for update using (user_id = auth.uid() or public.is_admin());

-- API credentials (BYO keys encrypted at rest; encryption is app-side)
create table if not exists public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openrouter','openai','anthropic','google','azure_openai','custom')),
  name text not null,
  encrypted_secret bytea not null,
  last4 text,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);

alter table public.api_credentials enable row level security;
create policy api_creds_owner_select on public.api_credentials
  for select using (user_id = auth.uid() or public.is_admin());
create policy api_creds_owner_insert on public.api_credentials
  for insert with check (user_id = auth.uid() or public.is_admin());
create policy api_creds_owner_update on public.api_credentials
  for update using (user_id = auth.uid() or public.is_admin());
create policy api_creds_owner_delete on public.api_credentials
  for delete using (user_id = auth.uid() or public.is_admin());

-- Model policies (per-model gates and limits)
create table if not exists public.model_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null,
  allowed boolean not null default true,
  daily_token_cap integer,
  per_min_limit integer,
  created_at timestamptz not null default now(),
  unique(user_id, model_id)
);

alter table public.model_policies enable row level security;
create policy model_policies_owner_rw on public.model_policies
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- MCP tool policies
create table if not exists public.mcp_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  allowed boolean not null default true,
  scopes text[] not null default '{}'::text[],
  per_min_limit integer,
  created_at timestamptz not null default now(),
  unique(user_id, tool)
);

alter table public.mcp_policies enable row level security;
create policy mcp_policies_owner_rw on public.mcp_policies
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Optional per-user rulesets (DB copies in addition to file-based defaults)
create table if not exists public.rulesets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  content jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name, version)
);

alter table public.rulesets enable row level security;
create policy rulesets_owner_rw on public.rulesets
  using (coalesce(user_id, auth.uid()) = auth.uid() or public.is_admin())
  with check (coalesce(user_id, auth.uid()) = auth.uid() or public.is_admin());

-- Usage events (for charts and budgets)
create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('complete','validate','summarize','export')),
  model text,
  tokens integer,
  cost_cents integer,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_time_idx on public.usage_events(user_id, created_at desc);
alter table public.usage_events enable row level security;
create policy usage_events_owner_select on public.usage_events
  for select using (user_id = auth.uid() or public.is_admin());
create policy usage_events_owner_insert on public.usage_events
  for insert with check (user_id = auth.uid() or public.is_admin());

-- Settings audit log (who changed what, when)
create table if not exists public.settings_audit (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists settings_audit_user_time_idx on public.settings_audit(user_id, created_at desc);
alter table public.settings_audit enable row level security;
create policy settings_audit_owner_select on public.settings_audit
  for select using (user_id = auth.uid() or public.is_admin());
create policy settings_audit_owner_insert on public.settings_audit
  for insert with check (user_id = auth.uid() or public.is_admin());

-- Notes
-- * Store secrets encrypted at the app/server layer before inserting into api_credentials.
-- * Keep service role keys only on trusted servers. Admin UI should call a trusted backend, not from the browser.
-- * Consider triggers to bump updated_at; omitted for simplicity.

