import axios from "axios";
import nodemailer from "nodemailer";
import { resolvePublicHttpTarget, pinnedAgents } from "./src/monitor/security.js";
import { classifyCheck } from "./src/monitor/classification.js";
import { firestore, firebaseAdminConfigured } from "./src/server/firebase-admin.js";
import type { Query } from "firebase-admin/firestore";

const ONCE = process.argv.includes("--once");
const WORKER_INTERVAL_MS = Number(process.env.MONITOR_WORKER_INTERVAL_MS || 10000);
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.MONITOR_WORKER_CONCURRENCY || 5)));
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

type Monitor = {
  id: string; url: string; enabled: boolean; check_interval_seconds: number;
  timeout_ms: number; expected_status_min: number; expected_status_max: number;
  latency_threshold_ms: number; failure_threshold: number; recovery_threshold: number;
  status: string; alert_email: string | null; alert_cooldown_minutes: number;
  fallback_url: string | null; failover_enabled: boolean; failover_trigger_count: number;
};

let running = false;

function parseValue(raw: string) {
  const decoded = decodeURIComponent(raw);
  if (decoded === "true") return true;
  if (decoded === "false") return false;
  if (decoded !== "" && /^-?\d+(\.\d+)?$/.test(decoded)) return Number(decoded);
  return decoded;
}

async function db(resource: string, init: RequestInit = {}): Promise<any> {
  if (!firebaseAdminConfigured || !firestore) throw new Error("Firebase Admin is not configured");
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
      if (match) {
        query = query.where(key, match[1] === "eq" ? "==" : match[1] === "gte" ? ">=" : "<=", parseValue(match[2]));
      }
    }
    const snap = await query.get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const order = params.get("order");
    if (order) {
      const [field, direction = "asc"] = order.split(".");
      rows.sort((a: any, b: any) => {
        const av = a[field] instanceof Date ? a[field].getTime() : a[field];
        const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
        const left = typeof av === "string" ? Date.parse(av) || av : av;
        const right = typeof bv === "string" ? Date.parse(bv) || bv : bv;
        if (left === right) return 0;
        const result = left > right ? 1 : -1;
        return direction === "desc" ? -result : result;
      });
    }
    const limit = Number(params.get("limit") || 0);
    if (limit > 0) rows = rows.slice(0, Math.min(limit, 100));
    return rows;
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

async function checkMonitor(m: Monitor) {
  const started = Date.now();
  let statusCode: number | null = null, latency = 0, ok = false, httpHealthy = false;
  let errorCode: string | null = null, errorMessage: string | null = null;
  try {
    const target = await resolvePublicHttpTarget(m.url);
    const response = await axios.get(target.url, {
      timeout: Math.min(60000, Math.max(500, m.timeout_ms || 5000)),
      maxRedirects: 0, validateStatus: () => true, responseType: "stream", ...pinnedAgents(target)
    });
    latency = Date.now() - started; statusCode = response.status;
    const classification = classifyCheck(statusCode, latency, m.expected_status_min, m.expected_status_max, m.latency_threshold_ms || 250);
    httpHealthy = classification.httpHealthy; ok = classification.ok; errorCode = classification.errorCode;
    response.data.destroy();
  } catch (error: any) {
    latency = Date.now() - started;
    errorCode = error?.code || "CHECK_FAILED";
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Check failed";
  }

  await db("monitor_checks", { method: "POST", body: JSON.stringify({
    monitor_id: m.id, checked_at: new Date().toISOString(), status_code: statusCode,
    latency_ms: latency, ok, error_code: errorCode, error_message: errorMessage
  }) });

  const recent = await db("monitor_checks?monitor_id=eq." + encodeURIComponent(m.id) + "&order=checked_at.desc&limit=" + Math.max(m.failure_threshold, m.recovery_threshold, 20));
  const failures = recent.slice(0, m.failure_threshold).filter((r: any) => !r.ok).length;
  const recoveries = recent.slice(0, m.recovery_threshold).filter((r: any) => r.ok).length;
  const incidents = await db("monitor_incidents?monitor_id=eq." + encodeURIComponent(m.id) + "&status=eq.open&order=started_at.desc&limit=1");
  const open = incidents[0];

  if (!ok && !open && failures >= m.failure_threshold) {
    const created = await db("monitor_incidents", { method: "POST", body: JSON.stringify({ monitor_id: m.id, reason: errorCode || "CHECK_FAILED", failure_count: failures }) });
    const incidentId = created?.[0]?.id || null;
    await queueAlert(m, incidentId, "incident_opened");
    if (m.failover_enabled && m.fallback_url && failures >= m.failover_trigger_count) {
      const fallback = await resolvePublicHttpTarget(m.fallback_url);
      try {
        const fallbackResponse = await axios.get(fallback.url, { timeout: 5000, maxRedirects: 0, validateStatus: () => true, ...pinnedAgents(fallback) });
        const healthy = fallbackResponse.status >= 200 && fallbackResponse.status < 300;
        await db("monitor_failover_events", { method: "POST", body: JSON.stringify({
          monitor_id: m.id, incident_id: incidentId, primary_url: m.url, fallback_url: fallback.url,
          status: healthy ? "verified" : "failed", completed_at: new Date().toISOString(),
          error_message: healthy ? null : "Fallback returned HTTP " + fallbackResponse.status
        }) });
        if (healthy) await queueAlert(m, incidentId, "failover_triggered");
      } catch (error) {
        await db("monitor_failover_events", { method: "POST", body: JSON.stringify({
          monitor_id: m.id, incident_id: incidentId, primary_url: m.url, fallback_url: fallback.url,
          status: "failed", completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message.slice(0, 500) : "Fallback verification failed"
        }) });
      }
    }
  } else if (ok && open && recoveries >= m.recovery_threshold) {
    await db("monitor_incidents?id=eq." + encodeURIComponent(open.id), { method: "PATCH", body: JSON.stringify({
      status: "resolved", resolved_at: new Date().toISOString(), recovery_count: recoveries
    }) });
    await queueAlert(m, open.id, "incident_resolved");
  }

  await updateReliability(m);
  const status = !httpHealthy ? "down" : latency > m.latency_threshold_ms ? "degraded" : "up";
  await db("monitors?id=eq." + encodeURIComponent(m.id), { method: "PATCH", body: JSON.stringify({
    status, latency_ms: latency, last_checked_at: new Date().toISOString()
  }) });
}

async function queueAlert(m: Monitor, incidentId: string | null, alertType: "incident_opened" | "incident_resolved" | "failover_triggered") {
  if (!m.alert_email) return;
  const cutoff = new Date(Date.now() - Math.max(1, m.alert_cooldown_minutes || 30) * 60000).toISOString();
  const existing = await db("monitor_alerts?monitor_id=eq." + encodeURIComponent(m.id) + "&alert_type=eq." + encodeURIComponent(alertType) + "&created_at=gte." + encodeURIComponent(cutoff) + "&limit=1");
  if (existing.length) return;
  await db("monitor_alerts", { method: "POST", body: JSON.stringify({
    monitor_id: m.id, incident_id: incidentId, alert_type: alertType, recipient: m.alert_email, next_attempt_at: new Date().toISOString()
  }) });
}

async function dispatchAlerts() {
  if (!mailer) return;
  const now = new Date().toISOString();
  const alerts = await db("monitor_alerts?status=eq.pending&next_attempt_at=lte." + encodeURIComponent(now) + "&order=created_at.asc&limit=10");
  for (const alert of alerts) {
    try {
      await mailer.sendMail({ from: SMTP_FROM, to: alert.recipient, subject: "InsureAPI " + alert.alert_type.replace(/_/g, " "), text: "Monitor alert: " + alert.alert_type + "\nMonitor ID: " + alert.monitor_id });
      await db("monitor_alerts?id=eq." + encodeURIComponent(alert.id), { method: "PATCH", body: JSON.stringify({
        status: "sent", attempts: (alert.attempts || 0) + 1, sent_at: new Date().toISOString(), last_error: null
      }) });
    } catch (error) {
      const attempts = (alert.attempts || 0) + 1;
      await db("monitor_alerts?id=eq." + encodeURIComponent(alert.id), { method: "PATCH", body: JSON.stringify({
        status: attempts >= ALERT_MAX_ATTEMPTS ? "failed" : "pending",
        attempts, next_attempt_at: new Date(Date.now() + ALERT_RETRY_DELAY_MS * attempts).toISOString(),
        last_error: error instanceof Error ? error.message.slice(0, 500) : "Email failed"
      }) });
    }
  }
}

async function updateReliability(m: Monitor) {
  const result = await db("rpc/calculate_monitor_reliability", { method: "POST", body: JSON.stringify({ p_monitor_id: m.id, p_window_hours: 24 }) });
  const score = Number(result);
  if (Number.isFinite(score)) await db("monitors?id=eq." + encodeURIComponent(m.id), { method: "PATCH", body: JSON.stringify({ reliability_score: score }) });
}

async function loadMonitors(): Promise<Monitor[]> {
  return db("monitors?enabled=eq.true&select=id,url,enabled,check_interval_seconds,timeout_ms,expected_status_min,expected_status_max,latency_threshold_ms,failure_threshold,recovery_threshold,status,alert_email,alert_cooldown_minutes,fallback_url,failover_enabled,failover_trigger_count");
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const monitors = await loadMonitors();
    const now = Date.now();
    for (let i = 0; i < monitors.length; i += CONCURRENCY) {
      const batch = monitors.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async m => {
        if (m.check_interval_seconds > 0) {
          const last = await db("monitor_checks?monitor_id=eq." + encodeURIComponent(m.id) + "&select=checked_at&order=checked_at.desc&limit=1");
          if (last[0] && now - Date.parse(last[0].checked_at) < m.check_interval_seconds * 1000) return;
        }
        await checkMonitor(m);
      }));
    }
    await dispatchAlerts();
  } catch (error) {
    console.error("[monitor-worker] tick failed", error);
  } finally {
    running = false;
  }
}

export function startMonitorWorker() {
  if (!firebaseAdminConfigured || !firestore) {
    console.warn("[monitor-worker] disabled: Firebase Admin credentials are required");
    return () => {};
  }
  void tick();
  if (ONCE) return () => {};
  const timer = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  console.log("[monitor-worker] started");
  return () => clearInterval(timer);
}
