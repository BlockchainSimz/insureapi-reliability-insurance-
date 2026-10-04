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

1. Foundation — completed.
2. Monitoring engine — current phase: real worker, retries/timeouts and durable checks.
3. Reliability and alerting — completed: rolling reliability scoring, durable alert outbox, SMTP dispatch, incident escalation and fallback verification. Failover events are recorded; actual traffic/DNS routing remains deployment-specific.
4. Security and quality — current phase: shared SSRF hardening with DNS pinning, automated unit tests, and CI verification gates.
5. Deployment — staging/production, observability, backups, DR and smoke tests.


### Phase 3 configuration

The worker calculates a 24-hour reliability score from durable checks and stores it in `monitors.reliability_score`. Incident alerts are placed in a durable outbox and dispatched through SMTP when `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` are configured. Alert cooldowns prevent repeated notifications.

Fallback endpoints can be health-verified and recorded as failover events. This does not change customer traffic routing; production routing must be implemented through the application's gateway, DNS, load balancer, or service-mesh layer.


### Phase 4 verification

Phase 4 adds reusable monitoring security/classification modules, automated tests, durable alert retry/backoff, bounded check-history cleanup, and separates the long-running monitor worker from the HTTP API lifecycle. for private/reserved IPv4 and IPv6 ranges, IPv4-mapped IPv6 addresses, HTTP status classification, and latency degradation. The worker and API use the same DNS validation and pinned-address HTTP agents, with redirects disabled for monitor targets.

The repository also exposes `npm test`, `npm run verify`, and `npm run security:audit`. CI now runs linting, tests, and the production build on pushes and pull requests. Dependency audit results still depend on the current npm advisory database.


### Worker deployment requirement

The production API no longer starts the long-running monitor worker automatically. Run the worker as a separate persistent process/service using `npm run worker`, with the same Supabase server-side credentials and SMTP configuration. This avoids coupling monitoring to an Express/serverless request lifecycle. A scheduler or managed worker platform should keep that process alive and restart it on failure.
