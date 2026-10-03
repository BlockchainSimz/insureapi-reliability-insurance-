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

