# InsureAPI Reliability Insurance

InsureAPI is a reliability monitoring and insurance operations console.

## Phase 1 — production foundation

Phase 1 establishes persistent Cloud Firestore storage, Firebase Authentication integration, server-side validation, security middleware, readiness endpoints and CI.

### Firebase setup

Use a dedicated Firebase project for InsureAPI. Do not reuse another application's database.

Apply `firebase/migrations/202610030001_phase1_foundation.sql`, then configure the variables in `.env.example`.

Production requires:
- `NODE_ENV=production`
- `AUTH_REQUIRED=true`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` for server/worker access
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID` for the web client
- `APP_URL`

Never put Firebase Admin credentials, especially `FIREBASE_PRIVATE_KEY`, in a `VITE_*` variable.

The API verifies Firebase ID tokens on every protected request. Firestore access is performed by the trusted Admin SDK, while ownership is enforced in the API by the authenticated Firebase UID.

### Local development

1. Use Node.js 22 and npm.
2. Copy `.env.example` to `.env.local`.
3. Configure Firebase values for authenticated testing.
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

The production API no longer starts the long-running monitor worker automatically. Run the worker as a separate persistent process/service using `npm run worker`, with the same Firebase Admin server-side credentials and SMTP configuration. This avoids coupling monitoring to an Express/serverless request lifecycle. A scheduler or managed worker platform should keep that process alive and restart it on failure.

## Standalone deployment

InsureAPI is a standalone Node.js + Express application. The same server serves the built Vite frontend and the /api/*, /health, and /ready endpoints. Production deployment does not require Vercel or a separate frontend host.

- Build: npm run build
- Start: npm start
- Container: docker compose -f docker-compose.production.yml up -d --build
- API and frontend are served from the same origin and port (default 3000).
- The monitoring worker runs as a separate process/container against the same application and Firebase backend.

