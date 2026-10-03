-- Phase 1 production foundation for InsureAPI.
create extension if not exists pgcrypto;

create table if not exists public.monitors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  url text not null,
  fallback_url text,
  alert_email text,
  status text not null default 'checking' check (status in ('up','down','degraded','checking')),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  last_checked_at timestamptz,
  reliability_score numeric(5,2) not null default 100 check (reliability_score between 0 and 100),
  latency_threshold_ms integer not null default 250 check (latency_threshold_ms between 1 and 60000),
  uptime_target numeric(5,2) not null default 99.90 check (uptime_target between 0 and 100),
  check_interval_seconds integer not null default 30 check (check_interval_seconds between 10 and 86400),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitors_owner_id_idx on public.monitors(owner_id);
create index if not exists monitors_enabled_idx on public.monitors(enabled);

create table if not exists public.monitor_checks (
  id bigint generated always as identity primary key,
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status_code integer,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  ok boolean not null,
  error_code text,
  error_message text
);

create index if not exists monitor_checks_monitor_checked_idx
  on public.monitor_checks(monitor_id, checked_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_owner_created_idx
  on public.audit_logs(owner_id, created_at desc);

alter table public.monitors enable row level security;
alter table public.monitor_checks enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "monitors_select_own" on public.monitors;
create policy "monitors_select_own" on public.monitors for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "monitors_insert_own" on public.monitors;
create policy "monitors_insert_own" on public.monitors for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "monitors_update_own" on public.monitors;
create policy "monitors_update_own" on public.monitors for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "monitors_delete_own" on public.monitors;
create policy "monitors_delete_own" on public.monitors for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "checks_select_own" on public.monitor_checks;
create policy "checks_select_own" on public.monitor_checks for select to authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = monitor_checks.monitor_id and m.owner_id = (select auth.uid())
  ));

drop policy if exists "checks_insert_own" on public.monitor_checks;
create policy "checks_insert_own" on public.monitor_checks for insert to authenticated
  with check (exists (
    select 1 from public.monitors m
    where m.id = monitor_checks.monitor_id and m.owner_id = (select auth.uid())
  ));

drop policy if exists "audit_select_own" on public.audit_logs;
create policy "audit_select_own" on public.audit_logs for select to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists monitors_set_updated_at on public.monitors;
create trigger monitors_set_updated_at before update on public.monitors
for each row execute function public.set_updated_at();

revoke all on public.audit_logs from anon;
