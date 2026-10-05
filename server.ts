import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { resolvePublicHttpTarget, pinnedAgents } from "./src/monitor/security.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true" || NODE_ENV === "production";
const APP_URL = process.env.APP_URL || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";

type AuthUser = { id: string; email?: string };
type AuthedRequest = Request & { user?: AuthUser };

const demoMonitors = [
  { id: "demo-1", name: "Stripe API", url: "https://api.stripe.com/health", status: "up", latency: 45, lastChecked: new Date().toISOString(), reliabilityScore: 99.8, fallbackUrl: "", alertEmail: "", history: [] },
  { id: "demo-2", name: "Twilio SMS", url: "https://api.twilio.com/health", status: "degraded", latency: 450, lastChecked: new Date().toISOString(), reliabilityScore: 94.2, fallbackUrl: "", alertEmail: "", history: [] }
];

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isDemoMode() {
  return !AUTH_REQUIRED && (!SUPABASE_URL || !SUPABASE_KEY);
}

function validateEmail(value: unknown) {
  if (typeof value !== "string" || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function validateTargetUrl(raw: unknown) {
  if (typeof raw !== "string") throw new Error("Invalid URL");
  const target = await resolvePublicHttpTarget(raw);
  return target.url;
}

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'");
  next();
}

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (!origin || !APP_URL || origin === APP_URL) {
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  }
  return res.status(403).json({ error: "Origin not allowed" });
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 120) return res.status(429).json({ error: "Too many requests" });
  next();
}

async function getSupabaseUser(token: string): Promise<AuthUser | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token }
  });
  if (!response.ok) return null;
  const user = await response.json() as AuthUser;
  return user?.id ? user : null;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDemoMode()) return next();
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  const user = await getSupabaseUser(header.slice(7));
  if (!user) return res.status(401).json({ error: "Invalid or expired session" });
  req.user = user;
  next();
}

function requireSupabase(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDemoMode()) return next();
  if (!SUPABASE_URL || !SUPABASE_KEY || !req.user) {
    return res.status(503).json({ error: "Persistent storage is not configured" });
  }
  next();
}

async function supabaseRequest(req: AuthedRequest, table: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !req.headers.authorization) throw new Error("Supabase is not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Authorization", req.headers.authorization);
  headers.set("Content-Type", "application/json");
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + table, { ...init, headers });
  const body = await response.text();
  if (!response.ok) throw new Error(body || "Supabase request failed");
  return body ? JSON.parse(body) : null;
}

function mapMonitor(row: any) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status,
    latency: row.latency_ms,
    lastChecked: row.last_checked_at,
    reliabilityScore: Number(row.reliability_score),
    fallbackUrl: row.fallback_url || "",
    alertEmail: row.alert_email || "",
    history: []
  };
}

async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(cors);
  app.use(rateLimit);
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "insureapi", environment: NODE_ENV, timestamp: new Date().toISOString() }));
  app.get("/ready", async (_req, res) => {
    const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);
    if (isDemoMode()) return res.json({ ready: true, mode: "demo", persistence: false, authRequired: false });
    if (!configured) return res.status(503).json({ ready: false, mode: "production", persistence: false, authRequired: AUTH_REQUIRED });
    try {
      const response = await fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_KEY } });
      const authService = response.ok;
      const ready = AUTH_REQUIRED ? authService : true;
      return res.status(ready ? 200 : 503).json({ ready, mode: "production", persistence: true, authRequired: AUTH_REQUIRED, authService });
    } catch {
      return res.status(503).json({ ready: false, mode: "production", persistence: true, authRequired: AUTH_REQUIRED, authService: false });
    }
  });

  app.use("/api", requireAuth);

  app.get("/api/dashboard/summary", async (req: AuthedRequest, res) => {
    try {
      if (isDemoMode()) {
        const total = demoMonitors.length;
        const healthy = demoMonitors.filter(m => m.status === "up").length;
        const score = demoMonitors.reduce((sum, m) => sum + m.reliabilityScore, 0) / Math.max(total, 1);
        return res.json({ total, healthy, degraded: demoMonitors.filter(m => m.status === "degraded").length, down: demoMonitors.filter(m => m.status === "down").length, aggregateReliability: Number(score.toFixed(2)), status: healthy === total ? "operational" : "attention" });
      }
      const rows = await supabaseRequest(req, "monitors", { method: "GET", headers: { Prefer: "return=representation" } });
      const monitors = rows || [];
      const total = monitors.length;
      const healthy = monitors.filter((m: any) => m.status === "up").length;
      const degraded = monitors.filter((m: any) => m.status === "degraded").length;
      const down = monitors.filter((m: any) => m.status === "down").length;
      const aggregateReliability = total ? monitors.reduce((sum: number, m: any) => sum + Number(m.reliability_score || 0), 0) / total : 100;
      return res.json({ total, healthy, degraded, down, aggregateReliability: Number(aggregateReliability.toFixed(2)), status: down > 0 ? "critical" : degraded > 0 ? "attention" : "operational" });
    } catch (error) {
      console.error("dashboard summary failed", error);
      return res.status(500).json({ error: "Failed to load dashboard summary" });
    }
  });

  app.get("/api/monitors", async (req: AuthedRequest, res) => {
    try {
      if (isDemoMode()) return res.json(demoMonitors);
      const rows = await supabaseRequest(req, "monitors", { method: "GET", headers: { Prefer: "return=representation" } });
      return res.json((rows || []).map(mapMonitor));
    } catch (error) {
      console.error("list monitors failed", error);
      return res.status(500).json({ error: "Failed to load monitors" });
    }
  });

  app.post("/api/monitors", requireSupabase, async (req: AuthedRequest, res) => {
    const { name, url, fallbackUrl, alertEmail, latencyThreshold, uptimeTarget } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 120) return res.status(400).json({ error: "Invalid monitor name" });
    if (alertEmail !== undefined && alertEmail !== "" && !validateEmail(alertEmail)) return res.status(400).json({ error: "Invalid alert email" });
    try {
      const safeUrl = await validateTargetUrl(url);
      const safeFallback = fallbackUrl ? await validateTargetUrl(fallbackUrl) : null;
      const row = {
        owner_id: req.user!.id,
        name: name.trim(),
        url: safeUrl,
        fallback_url: safeFallback,
        alert_email: alertEmail || null,
        latency_threshold_ms: Number.isInteger(latencyThreshold) ? Math.min(60000, Math.max(1, latencyThreshold)) : 250,
        uptime_target: typeof uptimeTarget === "number" ? Math.min(100, Math.max(0, uptimeTarget)) : 99.9
      };
      const created = await supabaseRequest(req, "monitors", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row)
      });
      return res.status(201).json(mapMonitor(created[0]));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor" });
    }
  });

  app.patch("/api/monitors/:id", requireSupabase, async (req: AuthedRequest, res) => {
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 120) return res.status(400).json({ error: "Invalid monitor name" });
      patch.name = body.name.trim();
    }
    if (body.url !== undefined) patch.url = await validateTargetUrl(body.url);
    if (body.fallbackUrl !== undefined) patch.fallback_url = body.fallbackUrl ? await validateTargetUrl(body.fallbackUrl) : null;
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
      patch.enabled = body.enabled;
    }
    if (body.checkIntervalSeconds !== undefined) {
      const value = Number(body.checkIntervalSeconds);
      if (!Number.isInteger(value) || value < 10 || value > 86400) return res.status(400).json({ error: "checkIntervalSeconds must be 10-86400" });
      patch.check_interval_seconds = value;
    }
    if (body.latencyThreshold !== undefined) {
      const value = Number(body.latencyThreshold);
      if (!Number.isInteger(value) || value < 1 || value > 60000) return res.status(400).json({ error: "latencyThreshold must be 1-60000" });
      patch.latency_threshold_ms = value;
    }
    try {
      const rows = await supabaseRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      if (!rows?.length) return res.status(404).json({ error: "Monitor not found" });
      return res.json(mapMonitor(rows[0]));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update monitor" });
    }
  });

  app.delete("/api/monitors/:id", requireSupabase, async (req: AuthedRequest, res) => {
    try {
      const rows = await supabaseRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id), { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (!rows?.length) return res.status(404).json({ error: "Monitor not found" });
      return res.status(204).send();
    } catch {
      return res.status(500).json({ error: "Failed to delete monitor" });
    }
  });

  app.put("/api/monitors/:id/alerts", requireSupabase, async (req: AuthedRequest, res) => {
    const email = req.body?.email;
    if (typeof email !== "string" || (email && !validateEmail(email))) return res.status(400).json({ error: "Invalid alert email" });
    try {
      const rows = await supabaseRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id), {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ alert_email: email || null })
      });
      if (!rows?.length) return res.status(404).json({ error: "Monitor not found" });
      return res.json({ message: "Alert email updated", monitor: mapMonitor(rows[0]) });
    } catch { return res.status(500).json({ error: "Failed to update alert settings" }); }
  });

  app.get("/api/monitors/:id/history", requireSupabase, async (req: AuthedRequest, res) => {
    try {
      const rows = await supabaseRequest(req, "monitor_checks?monitor_id=eq." + encodeURIComponent(req.params.id) + "&order=checked_at.desc&limit=50");
      return res.json((rows || []).map((row: any) => ({
        timestamp: row.checked_at, latency: row.latency_ms, status: row.ok ? "up" : "down"
      })).reverse());
    } catch { return res.status(500).json({ error: "Failed to load monitor history" }); }
  });

  app.get("/api/monitors/:id/check", async (req: AuthedRequest, res) => {
    try {
      const monitorRows = isDemoMode()
        ? demoMonitors.filter(m => m.id === req.params.id)
        : await supabaseRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id));
      const monitor = monitorRows?.[0];
      if (!monitor) return res.status(404).json({ error: "Monitor not found" });
      const target = await resolvePublicHttpTarget(monitor.url);
      const started = Date.now();
      const response = await axios.get(target.url, {
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: () => true,
        ...pinnedAgents(target)
      });
      const latency = Date.now() - started;
      return res.json({ status: response.status, statusText: response.statusText, latency, timestamp: new Date().toISOString(), ok: response.status >= 200 && response.status < 300 });
    } catch (error) {
      return res.json({ status: 503, statusText: "Service Unavailable", latency: 0, timestamp: new Date().toISOString(), ok: false });
    }
  });

  app.post("/api/monitors/:id/fallback", requireSupabase, async (_req, res) => {
    res.status(501).json({ error: "Traffic failover requires a deployment-specific routing integration; Phase 3 only verifies and records fallback health." });
  });

  app.post("/api/monitors/:id/notify", requireSupabase, async (_req, res) => {
    res.status(501).json({ error: "Notifications are handled by the Phase 3 worker alert outbox and SMTP dispatcher." });
  });

  if (NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { maxAge: "1h" }));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled request error", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log("InsureAPI server listening on port " + PORT);
  });
}

startServer().catch(error => {
  console.error("Fatal startup error", error);
  process.exit(1);
});
