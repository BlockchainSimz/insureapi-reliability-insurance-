# InsureAPI production foundation

Phase 1 replaces the demo monitor store with PostgreSQL persistence and establishes the base for authenticated multi-tenant monitoring.

## Required production environment
- DATABASE_URL
- JWT_SECRET (long random value)
- NODE_ENV=production
- REQUEST_TIMEOUT_MS
- MONITOR_INTERVAL_MS

## Database
Run db/migrations/001_initial.sql against PostgreSQL, or let the server apply the equivalent migration at startup.

## Security baseline
- Monitor URLs are restricted to HTTPS.
- Private, loopback, link-local and non-routable targets are rejected.
- Request timeouts are bounded.
- Production requires a database.
- Mutating monitor operations require authentication once auth is enabled in the application layer.
