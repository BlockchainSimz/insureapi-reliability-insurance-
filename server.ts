import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { resolvePublicHttpTarget, pinnedAgents } from "./src/monitor/security.js";
import { firebaseAdminConfigured, firebaseAuth, firestore, verifyFirebaseIdToken } from "./src/server/firebase-admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true" || NODE_ENV === "production";
const APP_URL = process.env.APP_URL || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const FIREBASE_PROJECT_ID = process.env.SUPABASE_PUBLISHABLE_KEY || "";
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

function decodeQueryValue(value: string) {
  return decodeURIComponent(value);
}

async function monitorOwnedBy(req: AuthedRequest, id: string) {
  if (!firestore || !req.user) return false;
  const snap = await firestore.collection("monitors").doc(id).get();
  return snap.exists && snap.data()?.owner_id === req.user.id;
}

async function firestoreRequest(req: AuthedRequest, resource: string, init: RequestInit = {}) {
  if (!firestore || !req.user) throw new Error("Firebase is not configured");
  const [path, queryString = ""] = resource.split("?");
  const segments = path.split("/").filter(Boolean);
  const collectionName = segments[0];
  const docId = segments[1];
  const params = new URLSearchParams(queryString);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;

  if (collectionName === "rpc" && segments[1] === "calculate_monitor_reliability") {
    const monitorId = body?.p_monitor_id;
    const windowHours = Number(body?.p_window_hours || 24);
    if (!monitorId || !(await monitorOwnedBy(req, monitorId))) throw new Error("Monitor not found");
    const cutoff = Date.now() - windowHours * 3600000;
    const snap = await firestore.collection("monitor_checks").where("monitor_id", "==", monitorId).get();
    const checks = snap.docs.map(d => d.data()).filter(row => Date.parse(String(row.checked_at || "")) >= cutoff);
    return checks.length ? Number(((checks.filter(row => row.ok).length / checks.length) * 100).toFixed(2)) : 100;
  }

  if (method === "GET") {
    let query: FirebaseFirestore.Query = firestore.collection(collectionName);
    if (collectionName === "monitors") query = query.where("owner_id", "==", req.user.id);
    if (collectionName !== "monitors" && params.get("monitor_id")) {
      const monitorId = decodeQueryValue(params.get("monitor_id")!.replace(/^eq\./, ""));
      if (!(await monitorOwnedBy(req, monitorId))) return [];
    }
    for (const [key, raw] of params.entries()) {
      if (["order", "limit", "select"].includes(key)) continue;
      const match = raw.match(/^(eq|gte|lte)\.(.*)$/);
      if (match) query = query.where(key, match[1] === "eq" ? "==" : match[1] === "gte" ? ">=" : "<=", decodeQueryValue(match[2]));
    }
    const order = params.get("order");
    if (order) {
      const [field, direction = "asc"] = order.split(".");
      query = query.orderBy(field, direction === "desc" ? "desc" : "asc");
    }
    const limit = Number(params.get("limit") || 0);
    if (limit > 0) query = query.limit(Math.min(limit, 100));
    const snap = docId
      ? await firestore.collection(collectionName).doc(docId).get()
      : await query.get();
    if (docId) {
      if (!snap.exists) return [];
      const data = snap.data() || {};
      if (collectionName === "monitors" && data.owner_id !== req.user.id) return [];
      return [{ id: snap.id, ...data }];
    }
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  if (method === "PATCH") {
    const match = params.get("id")?.match(/^eq\.(.+)$/);
    if (!match) throw new Error("Firebase update requires a document id");
    const id = decodeQueryValue(match[1]);
    if (collectionName === "monitors" && !(await monitorOwnedBy(req, id))) return [];
    if (collectionName !== "monitors" && params.get("monitor_id")) {
      const monitorId = decodeQueryValue(params.get("monitor_id")!.replace(/^eq\./, ""));
      if (!(await monitorOwnedBy(req, monitorId))) return [];
    }
    await firestore.collection(collectionName).doc(id).update(body || {});
    const updated = await firestore.collection(collectionName).doc(id).get();
    return updated.exists ? [{ id: updated.id, ...updated.data() }] : [];
  }

  if (method === "DELETE") {
    const match = params.get("id")?.match(/^eq\.(.+)$/);
    if (!match) throw new Error("Firebase delete requires a document id");
    const id = decodeQueryValue(match[1]);
    if (collectionName === "monitors" && !(await monitorOwnedBy(req, id))) return [];
    await firestore.collection(collectionName).doc(id).delete();
    return [{ id }];
  }

  throw new Error("Unsupported Firebase request");
}
