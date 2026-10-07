import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { resolvePublicHttpTarget, pinnedAgents } from "./src/monitor/security.js";
import { firebaseAdminConfigured, firebaseAuth, firestore, verifyFirebaseIdToken, getFirebaseAdminIdentity, verifyFirestoreConnection } from "./src/server/firebase-admin.js";
import type { Query } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true" || NODE_ENV === "production";
const APP_URL = process.env.APP_URL || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";

const DEMO_MODE = process.env.DEMO_MODE === "true";

type AuthUser = { id: string; email?: string };
type AuthedRequest = Request & { user?: AuthUser };

const demoMonitors = [
  { id: "demo-1", name: "Stripe API", url: "https://api.stripe.com/health", status: "up", latency: 45, lastChecked: new Date().toISOString(), reliabilityScore: 99.8, fallbackUrl: "", alertEmail: "", history: [] },
  { id: "demo-2", name: "Twilio SMS", url: "https://api.twilio.com/health", status: "degraded", latency: 450, lastChecked: new Date().toISOString(), reliabilityScore: 94.2, fallbackUrl: "", alertEmail: "", history: [] }
];

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isDemoMode() {
  return DEMO_MODE || (!AUTH_REQUIRED && !firebaseAdminConfigured);
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

async function getFirebaseUser(token: string): Promise<AuthUser | null> {
  const decoded = await verifyFirebaseIdToken(token);
  return decoded?.uid ? { id: decoded.uid, email: decoded.email } : null;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDemoMode()) return next();
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  const user = await getFirebaseUser(header.slice(7));
  if (!user) return res.status(401).json({ error: "Invalid or expired Firebase session" });
  req.user = user;
  next();
}

function requireFirebase(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDemoMode()) return next();
  if (!firebaseAdminConfigured || !firestore || !req.user) {
    return res.status(503).json({ error: "Firebase persistence is not configured" });
  }
  next();
}

async function monitorOwnedBy(req: AuthedRequest, monitorId: string) {
  if (isDemoMode()) return true;
  if (!firestore || !req.user) return false;
  const snap = await firestore.collection("monitors").doc(monitorId).get();
  return snap.exists && snap.data()?.owner_id === req.user.id;
}

function parseValue(value: string) {
  try { return JSON.parse(value); } catch { return value; }
}

async function firestoreRequest(req: AuthedRequest, resource: string, init: RequestInit = {}): Promise<any> {
  if (!firestore || !req.user) throw new Error("Firebase is not configured");
  const [path, queryString = ""] = resource.split("?");
  const segments = path.split("/").filter(Boolean);
  const collectionName = segments[0];
  const params = new URLSearchParams(queryString);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;

  if (collectionName === "rpc" && segments[1] === "calculate_monitor_reliability") {
    const monitorId = body?.p_monitor_id;
    const hours = Number(body?.p_window_hours || 24);
    if (!monitorId || !(await monitorOwnedBy(req, monitorId))) throw new Error("Monitor not found");
    const cutoff = Date.now() - hours * 3600000;
    const snap = await firestore.collection("monitor_checks").where("monitor_id", "==", monitorId).get();
    const checks = snap.docs.map(d => d.data()).filter(row => Date.parse(String(row.checked_at || "")) >= cutoff);
    return checks.length ? Number(((checks.filter(row => row.ok).length / checks.length) * 100).toFixed(2)) : 100;
  }

  const idMatch = params.get("id")?.match(/^eq\.(.+)$/);
  if (method === "GET") {
    let query: Query = firestore.collection(collectionName);
    if (collectionName === "monitors" && !isDemoMode()) query = query.where("owner_id", "==", req.user.id);
    const monitorFilter = params.get("monitor_id")?.match(/^eq\.(.+)$/);
    if (monitorFilter && !isDemoMode() && !(await monitorOwnedBy(req, decodeURIComponent(monitorFilter[1])))) throw new Error("Monitor not found");
    for (const [key, raw] of params.entries()) {
      if (["order","limit","select"].includes(key)) continue;
      const match = raw.match(/^(eq|gte|lte)\.(.*)$/);
      if (match && key !== "monitor_id") query = query.where(key, match[1] === "eq" ? "==" : match[1] === "gte" ? ">=" : "<=", parseValue(match[2]));
    }
    const snap = await query.get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const order = params.get("order");
    if (order) {
      const [field, direction = "asc"] = order.split(".");
      rows.sort((a: any,b: any) => {
        const av = a[field] instanceof Date ? a[field].getTime() : a[field];
        const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
        const left = typeof av === "string" ? Date.parse(av) || av : av;
        const right = typeof bv === "string" ? Date.parse(bv) || bv : bv;
        return left === right ? 0 : (left > right ? 1 : -1) * (direction === "desc" ? -1 : 1);
      });
    }
    const limit = Number(params.get("limit") || 0);
    if (limit > 0) rows = rows.slice(0, Math.min(limit, 100));
    return rows;
  }
  if (method === "POST") {
    const data = { ...(body || {}) };
    if (collectionName === "monitors") data.owner_id = req.user.id;
    if (collectionName === "monitor_checks" && !data.checked_at) data.checked_at = new Date().toISOString();
    if (collectionName === "monitor_incidents" && !data.started_at) data.started_at = new Date().toISOString();
    if (collectionName === "monitor_alerts" && !data.created_at) data.created_at = new Date().toISOString();
    const ref = await firestore.collection(collectionName).add(data);
    return [{ id: ref.id, ...data }];
  }
  if (method === "PATCH" || method === "DELETE") {
    if (!idMatch) throw new Error("Firebase update requires a document id");
    const id = decodeURIComponent(idMatch[1]);
    const ref = firestore.collection(collectionName).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return [];
    const data = snap.data() || {};
    if (collectionName === "monitors" && data.owner_id !== req.user.id) throw new Error("Monitor not found");
    if (collectionName !== "monitors" && data.monitor_id && !(await monitorOwnedBy(req, String(data.monitor_id)))) throw new Error("Monitor not found");
    if (method === "PATCH") {
      await ref.update(body || {});
      const updated = await ref.get();
      return updated.exists ? [{ id: updated.id, ...updated.data() }] : [];
    }
    await ref.delete();
    return [{ id }];
  }
  throw new Error("Unsupported Firebase request");
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

export async function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(cors);
  app.use(rateLimit);
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "insureapi", environment: NODE_ENV, timestamp: new Date().toISOString() }));
  app.get("/ready", async (_req, res) => {
    const configured = Boolean(FIREBASE_PROJECT_ID && firebaseAdminConfigured && firebaseAuth && firestore);
    if (isDemoMode()) return res.json({ ready: true, mode: "demo", persistence: false, authRequired: false });
    if (!configured) return res.status(503).json({ ready: false, mode: "production", persistence: false, authRequired: AUTH_REQUIRED });
    try {
      await firestore!.collection("_health").doc("readiness").set({ checked_at: new Date().toISOString() });
      return res.json({ ready: true, mode: "production", persistence: true, authRequired: AUTH_REQUIRED, authService: true });
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
      const rows = await firestoreRequest(req, "monitors", { method: "GET", headers: { Prefer: "return=representation" } });
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
      const rows = await firestoreRequest(req, "monitors", { method: "GET", headers: { Prefer: "return=representation" } });
      return res.json((rows || []).map(mapMonitor));
    } catch (error) {
      console.error("list monitors failed", error);
      return res.status(500).json({ error: "Failed to load monitors" });
    }
  });

  app.post("/api/monitors", requireFirebase, async (req: AuthedRequest, res) => {
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
      const created = await firestoreRequest(req, "monitors", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row)
      });
      return res.status(201).json(mapMonitor(created[0]));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor" });
    }
  });

  app.patch("/api/monitors/:id", requireFirebase, async (req: AuthedRequest, res) => {
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 120) return res.status(400).json({ error: "Invalid monitor name" });
      patch.name = body.name.trim();
    }
    try {
      if (body.url !== undefined) patch.url = await validateTargetUrl(body.url);
      if (body.fallbackUrl !== undefined) patch.fallback_url = body.fallbackUrl ? await validateTargetUrl(body.fallbackUrl) : null;
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor URL" });
    }
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
      const rows = await firestoreRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      if (!rows?.length) return res.status(404).json({ error: "Monitor not found" });
      return res.json(mapMonitor(rows[0]));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update monitor" });
    }
  });

  app.delete("/api/monitors/:id", requireFirebase, async (req: AuthedRequest, res) => {
    try {
      const rows = await firestoreRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id), { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (!rows?.length) return res.status(404).json({ error: "Monitor not found" });
      return res.status(204).send();
    } catch {
      return res.status(500).json({ error: "Failed to delete monitor" });
    }
  });

  app.put("/api/monitors/:id/alerts", requireFirebase, async (req: AuthedRequest, res) => {
    const email = req.body?.email;
    if (typeof email !== "string" || (email && !validateEmail(email))) return res.status(400).json({ error: "Invalid alert email" });
    try {
      const rows = await firestoreRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id), {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ alert_email: email || null })
      });
      if (!rows?.length) return res.status(404).json({ error: "Monitor not found" });
      return res.json({ message: "Alert email updated", monitor: mapMonitor(rows[0]) });
    } catch { return res.status(500).json({ error: "Failed to update alert settings" }); }
  });

  app.get("/api/monitors/:id/history", requireFirebase, async (req: AuthedRequest, res) => {
    try {
      const rows = await firestoreRequest(req, "monitor_checks?monitor_id=eq." + encodeURIComponent(req.params.id) + "&order=checked_at.desc&limit=50");
      return res.json((rows || []).map((row: any) => ({
        timestamp: row.checked_at, latency: row.latency_ms, status: row.ok ? "up" : "down"
      })).reverse());
    } catch { return res.status(500).json({ error: "Failed to load monitor history" }); }
  });

  app.get("/api/monitors/:id/check", async (req: AuthedRequest, res) => {
    try {
      const monitorRows = isDemoMode()
        ? demoMonitors.filter(m => m.id === req.params.id)
        : await firestoreRequest(req, "monitors?id=eq." + encodeURIComponent(req.params.id));
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

  app.post("/api/monitors/:id/fallback", requireFirebase, async (_req, res) => {
    res.status(501).json({ error: "Traffic failover requires a deployment-specific routing integration; Phase 3 only verifies and records fallback health." });
  });

  app.post("/api/monitors/:id/notify", requireFirebase, async (_req, res) => {
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

  return app;
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  createApp().then(app => {
    app.listen(PORT, "0.0.0.0", () => {
    const identity = getFirebaseAdminIdentity();
    console.log("[firebase] config", JSON.stringify({
      projectId: identity.projectId,
      clientEmail: identity.clientEmail,
      keyPresent: identity.keyPresent,
      keyFormat: identity.keyFormat,
      keyLength: identity.keyLength,
    }));
    if (firebaseAdminConfigured && firestore) {
      void verifyFirestoreConnection()
        .then(() => console.log("[firebase] Firestore connectivity verified"))
        .catch((error) => console.error("[firebase] Firestore connectivity failed", error instanceof Error ? error.message : String(error)));
    }
      console.log("InsureAPI server listening on port " + PORT);
    });
  }).catch(error => {
    console.error("Fatal startup error", error);
    process.exit(1);
  });
}
