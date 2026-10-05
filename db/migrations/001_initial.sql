CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  fallback_url text,
  alert_email text,
  status text NOT NULL DEFAULT 'checking' CHECK (status IN ('up','down','degraded','checking')),
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  reliability_score numeric(5,2) NOT NULL DEFAULT 100 CHECK (reliability_score >= 0 AND reliability_score <= 100),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id bigserial PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  status_code integer,
  latency_ms integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL,
  error_code text,
  error_message text
);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  type text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_monitors_org ON monitors(organization_id);
CREATE INDEX IF NOT EXISTS idx_checks_monitor_time ON monitor_checks(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_time ON incidents(monitor_id, opened_at DESC);
