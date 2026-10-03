-- Phase 2: durable monitoring and incident lifecycle.

alter table public.monitors
  add column if not exists expected_status_min integer not null default 200 check (expected_status_min between 100 and 599),
  add column if not exists expected_status_max integer not null default 299 check (expected_status_max between 100 and 599),
  add column if not exists timeout_ms integer not null default 5000 check (timeout_ms between 500 and 60000),
  add column if not exists failure_threshold integer not null default 3 check (failure_threshold between 1 and 20),
  add column if not exists recovery_threshold integer not null default 2 check (recovery_threshold between 1 and 20);

create table if not exists public.monitor_incidents (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  status text not null default 'open' check (status in ('open','resolved')),
  reason text not null,
  failure_count integer not null default 0,
  recovery_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists monitor_incidents_monitor_started_idx
  on public.monitor_incidents(monitor_id, started_at desc);
create index if not exists monitor_incidents_open_idx
  on public.monitor_incidents(monitor_id, status) where status = 'open';

alter table public.monitor_incidents enable row level security;

drop policy if exists "incidents_select_own" on public.monitor_incidents;
create policy "incidents_select_own" on public.monitor_incidents for select to authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = monitor_incidents.monitor_id and m.owner_id = (select auth.uid())
  ));

drop policy if exists "incidents_insert_own" on public.monitor_incidents;
create policy "incidents_insert_own" on public.monitor_incidents for insert to authenticated
  with check (exists (
    select 1 from public.monitors m
    where m.id = monitor_incidents.monitor_id and m.owner_id = (select auth.uid())
  ));

drop policy if exists "incidents_update_own" on public.monitor_incidents;
create policy "incidents_update_own" on public.monitor_incidents for update to authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = monitor_incidents.monitor_id and m.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.monitors m
    where m.id = monitor_incidents.monitor_id and m.owner_id = (select auth.uid())
  ));

-- Worker-only columns are protected from browser clients by keeping mutations server-side.
create index if not exists monitor_checks_ok_idx on public.monitor_checks(monitor_id, ok, checked_at desc);

-- Worker uses the dedicated authenticated service identity rather than browser sessions.
-- The actual role/key provisioning is deployment-specific; do not place a service-role key in VITE_* variables.
-- Prevent duplicate open incidents if multiple worker instances overlap.
create unique index if not exists monitor_incidents_one_open_idx
  on public.monitor_incidents(monitor_id)
  where status = 'open';

-- Phase 3: reliability metrics, notification outbox, and failover events.
alter table public.monitors
  add column if not exists alert_cooldown_minutes integer not null default 30
    check (alert_cooldown_minutes between 1 and 1440),
  add column if not exists failover_enabled boolean not null default false,
  add column if not exists failover_trigger_count integer not null default 3
    check (failover_trigger_count between 1 and 20);

create table if not exists public.monitor_alerts (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  incident_id uuid references public.monitor_incidents(id) on delete set null,
  alert_type text not null check (alert_type in ('incident_opened','incident_resolved','failover_triggered')),
  recipient text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists monitor_alerts_pending_idx
  on public.monitor_alerts(status, created_at)
  where status = 'pending';

create index if not exists monitor_alerts_monitor_created_idx
  on public.monitor_alerts(monitor_id, created_at desc);

alter table public.monitor_alerts enable row level security;

drop policy if exists "alerts_select_own" on public.monitor_alerts;
create policy "alerts_select_own" on public.monitor_alerts for select to authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = monitor_alerts.monitor_id and m.owner_id = (select auth.uid())
  ));

create table if not exists public.monitor_failover_events (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  incident_id uuid references public.monitor_incidents(id) on delete set null,
  primary_url text not null,
  fallback_url text not null,
  status text not null default 'triggered' check (status in ('triggered','verified','failed','reverted')),
  triggered_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create index if not exists monitor_failover_events_monitor_idx
  on public.monitor_failover_events(monitor_id, triggered_at desc);

alter table public.monitor_failover_events enable row level security;

drop policy if exists "failover_select_own" on public.monitor_failover_events;
create policy "failover_select_own" on public.monitor_failover_events for select to authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = monitor_failover_events.monitor_id and m.owner_id = (select auth.uid())
  ));

-- Keep reliability calculations in the database so the worker and API share one definition.
create or replace function public.calculate_monitor_reliability(
  p_monitor_id uuid,
  p_window_hours integer default 24
)
returns numeric
language sql
stable
as $$
  select coalesce(
    round(
      100.0 * avg(case when ok then 1.0 else 0.0 end),
      2
    ),
    100.00
  )
  from public.monitor_checks
  where monitor_id = p_monitor_id
    and checked_at >= now() - make_interval(hours => greatest(1, least(p_window_hours, 720)));
$;


-- Phase 4: durable alert retry scheduling and monitor-check retention support.
alter table public.monitor_alerts
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists monitor_alerts_retry_idx
  on public.monitor_alerts(status, next_attempt_at, created_at)
  where status = 'pending';

-- Keep high-volume check history bounded by retention policy.
create schema if not exists private;

create or replace function private.cleanup_monitor_checks(p_retention_days integer default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.monitor_checks
  where checked_at < now() - make_interval(days => greatest(7, least(p_retention_days, 3650)));
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


-- This is a privileged maintenance function; never expose it to browser roles.
revoke execute on function private.cleanup_monitor_checks(integer) from public, anon, authenticated;
grant execute on function private.cleanup_monitor_checks(integer) to service_role;
