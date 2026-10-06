import axios from "axios";
import nodemailer from "nodemailer";
import { resolvePublicHttpTarget, pinnedAgents } from "./src/monitor/security.js";
import { classifyCheck } from "./src/monitor/classification.js";
import { firestore, firebaseAdminConfigured } from "./src/server/firebase-admin.js";
import type { Query } from "firebase-admin/firestore";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const ALERT_MAX_ATTEMPTS = Math.max(1, Math.min(10, Number(process.env.ALERT_MAX_ATTEMPTS || 5)));
const ALERT_RETRY_DELAY_MS = Math.max(1000, Math.min(3600000, Number(process.env.ALERT_RETRY_DELAY_MS || 30000)));
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;
async function db(resource: string, init: RequestInit = {}) {
  if (!firestore) throw new Error("Firebase Admin is not configured");
  const [path, queryString = ""] = resource.split("?");
  const segments = path.split("/").filter(Boolean);
  const collectionName = segments[0];
  const params = new URLSearchParams(queryString);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;

  if (collectionName === "rpc" && segments[1] === "calculate_monitor_reliability") {
    const monitorId = body?.p_monitor_id;
    const hours = Number(body?.p_window_hours || 24);
    const cutoff = Date.now() - hours * 3600000;
    const snap = await firestore.collection("monitor_checks").where("monitor_id", "==", monitorId).get();
    const checks = snap.docs.map(d => d.data()).filter(row => Date.parse(String(row.checked_at || "")) >= cutoff);
    return checks.length ? Number(((checks.filter(row => row.ok).length / checks.length) * 100).toFixed(2)) : 100;
  }

  if (method === "GET") {
    let query: Query = firestore.collection(collectionName);
    for (const [key, raw] of params.entries()) {
      if (["order", "limit", "select"].includes(key)) continue;
      const match = raw.match(/^(eq|gte|lte)\.(.*)$/);
      if (match) query = query.where(key, match[1] === "eq" ? "==" : match[1] === "gte" ? ">=" : "<=", decodeURIComponent(match[2]));
    }
    const order = params.get("order");
    if (order) {
      const [field, direction = "asc"] = order.split(".");
      query = query.orderBy(field, direction === "desc" ? "desc" : "asc");
    }
    const limit = Number(params.get("limit") || 0);
    if (limit > 0) query = query.limit(Math.min(limit, 100));
    const snap = await query.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const idMatch = params.get("id")?.match(/^eq\.(.+)$/);
  if (method === "POST") {
    const data = { ...(body || {}) };
    if (collectionName === "monitor_checks" && !data.checked_at) data.checked_at = new Date().toISOString();
    if (collectionName === "monitor_incidents" && !data.started_at) data.started_at = new Date().toISOString();
    if (collectionName === "monitor_alerts" && !data.created_at) data.created_at = new Date().toISOString();
    const ref = await firestore.collection(collectionName).add(data);
    return [{ id: ref.id, ...data }];
  }
  if (method === "PATCH") {
    if (!idMatch) throw new Error("Firebase update requires a document id");
    const id = decodeURIComponent(idMatch[1]);
    await firestore.collection(collectionName).doc(id).update(body || {});
    const snap = await firestore.collection(collectionName).doc(id).get();
    return snap.exists ? [{ id: snap.id, ...snap.data() }] : [];
  }
  if (method === "DELETE") {
    if (!idMatch) throw new Error("Firebase delete requires a document id");
    const id = decodeURIComponent(idMatch[1]);
    await firestore.collection(collectionName).doc(id).delete();
    return [{ id }];
  }
  throw new Error("Unsupported Firebase request");
}
