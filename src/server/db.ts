import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values);
}

export async function migrate() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await query<{ id: string }>("SELECT id FROM _migrations");
  const applied = new Set(rows.map(r => r.id));
  const migration = `CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, email text NOT NULL UNIQUE, password_hash text NOT NULL, role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS monitors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name text NOT NULL, url text NOT NULL, fallback_url text, alert_email text, status text NOT NULL DEFAULT 'checking' CHECK (status IN ('up','down','degraded','checking')), latency_ms integer NOT NULL DEFAULT 0, reliability_score numeric(5,2) NOT NULL DEFAULT 100, last_checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS monitor_checks (id bigserial PRIMARY KEY, monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE, checked_at timestamptz NOT NULL DEFAULT now(), status_code integer, latency_ms integer NOT NULL DEFAULT 0, ok boolean NOT NULL, error_code text, error_message text);
CREATE TABLE IF NOT EXISTS incidents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE, type text NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS idx_monitors_org ON monitors(organization_id);
CREATE INDEX IF NOT EXISTS idx_checks_monitor_time ON monitor_checks(monitor_id, checked_at DESC);
`;
  if (!applied.has("001_initial")) {
    await query(migration);
    await query("INSERT INTO _migrations(id) VALUES($1)", ["001_initial"]);
  }
}
