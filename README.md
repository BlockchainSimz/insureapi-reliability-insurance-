# InsureAPI Reliability Insurance

InsureAPI is a reliability monitoring and insurance operations console.

## Phase 1 — production foundation

Phase 1 establishes persistent Postgres storage, RLS, Supabase Auth integration, server-side validation, security middleware, readiness endpoints and CI.

### Supabase setup

Use a dedicated Supabase project for InsureAPI. Do not reuse another application's database.

Apply `supabase/migrations/202610030001_phase1_foundation.sql`, then configure the variables in `.env.example`.

Production requires:
- `NODE_ENV=production`
- `AUTH_REQUIRED=true`
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- `APP_URL`

Never put a Supabase service-role or secret key in a VITE_ variable.

The API validates the authenticated Supabase user on every protected request. Database access uses that user's bearer token so RLS remains the authorization boundary.

### Local development

1. Use Node.js 22 and npm.
2. Copy `.env.example` to `.env.local`.
3. Configure Supabase values for authenticated testing.
4. Run `npm install`.
5. Run `npm run dev`.
6. Run `npm run lint`.
7. Run `npm run build`.

### Current roadmap

1. Foundation — current phase.
2. Monitoring engine — real worker, retries, timeouts and durable checks.
3. Reliability and alerting — real email provider, SLA calculations, escalation and failover.
4. Security and quality — deeper SSRF hardening, automated tests, audit coverage and dependency scanning.
5. Deployment — staging/production, observability, backups, DR and smoke tests.
