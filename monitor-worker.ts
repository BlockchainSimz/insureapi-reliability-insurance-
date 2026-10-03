import axios from "axios";
import nodemailer from "nodemailer";
import dns from "dns/promises";
import { URL } from "url";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

const ONCE = process.argv.includes("--once");
const WORKER_INTERVAL_MS = Number(process.env.MONITOR_WORKER_INTERVAL_MS || 10000);
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.MONITOR_WORKER_CONCURRENCY || 5)));
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;

type Monitor = {
  id: string; url: string; enabled: boolean; check_interval_seconds: number;
  timeout_ms: number; expected_status_min: number; expected_status_max: number;
  latency_threshold_ms: number; failure_threshold: number; recovery_threshold: number;
  status: string;
};

let running = false;

function isPrivateIp(ip: string) {
  const v = ip.toLowerCase();
  return v === "127.0.0.1" || v === "::1" || v.startsWith("10.") ||
    v.startsWith("192.168.") || v.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(v) ||
    v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
}

async function safeUrl(raw: string) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("Unsafe target URL");
  const addresses = await dns.lookup(u.hostname, { all: true });
  if (addresses.some(a => isPrivateIp(a.address))) throw new Error("Private target blocked");
  return u.toString();
}

async function db(table: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Worker persistence is not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Authorization", "Bearer " + SUPABASE_KEY);
  headers.set("Content-Type", "application/json");
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table, { ...init, headers });
  const body = await res.text();
  if (!res.ok) throw new Error(body || "Database request failed");
  return body ? JSON.parse(body) : [];
}

async function checkMonitor(m: Monitor) {
  const started = Date.now();
  let statusCode: number | null = null;
  let latency = 0;
  let ok = false;
  let httpHealthy = false;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    const target = await safeUrl(m.url);
    const response = await axios.get(target, {
      timeout: Math.min(60000, Math.max(500, m.timeout_ms || 5000)),
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "stream"
    });
    latency = Date.now() - started;
    statusCode = response.status;
    httpHealthy = statusCode >= m.expected_status_min && statusCode <= m.expected_status_max;
    ok = httpHealthy;
    response.data.destroy();
    if (!httpHealthy) errorCode = "HTTP_STATUS";
    else if (latency > (m.latency_threshold_ms || 250)) errorCode = "LATENCY";
  } catch (error: any) {
    latency = Date.now() - started;
    errorCode = error?.code || "CHECK_FAILED";
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Check failed";
  }

  await db("monitor_checks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      monitor_id: m.id, checked_at: new Date().toISOString(), status_code: statusCode,
      latency_ms: latency, ok, error_code: errorCode, error_message: errorMessage
    })
  });

  const recent = await db(
    "monitor_checks?monitor_id=eq." + encodeURIComponent(m.id) +
    "&order=checked_at.desc&limit=" + Math.max(m.failure_threshold, m.recovery_threshold, 20)
  );
  const failures = recent.slice(0, m.failure_threshold).filter((r: any) => !r.ok).length;
  const recoveries = recent.slice(0, m.recovery_threshold).filter((r: any) => r.ok).length;

  const incidents = await db(
    "monitor_incidents?monitor_id=eq." + encodeURIComponent(m.id) + "&status=eq.open&order=started_at.desc&limit=1"
  );
  const open = incidents[0];

  if (!ok && !open && failures >= m.failure_threshold) {
    const created = await db("monitor_incidents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ monitor_id: m.id, reason: errorCode || "CHECK_FAILED", failure_count: failures }) });
    const incidentId = created?.[0]?.id || null;
    await queueAlert(m, incidentId, "incident_opened");
    if (m.failover_enabled && m.fallback_url && failures >= m.failover_trigger_count) {
      const fallback = await safeUrl(m.fallback_url);
      try {
        const fallbackResponse = await axios.get(fallback, { timeout: 5000, maxRedirects: 0, validateStatus: () => true });
        const healthy = fallbackResponse.status >= 200 && fallbackResponse.status < 300;
        await db("monitor_failover_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ monitor_id: m.id, incident_id: incidentId, primary_url: m.url, fallback_url: fallback, status: healthy ? "verified" : "failed", completed_at: new Date().toISOString(), error_message: healthy ? null : "Fallback returned HTTP " + fallbackResponse.status }) });
        if (healthy) await queueAlert(m, incidentId, "failover_triggered");
      } catch (error) {
        await db("monitor_failover_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ monitor_id: m.id, incident_id: incidentId, primary_url: m.url, fallback_url: fallback, status: "failed", completed_at: new Date().toISOString(), error_message: error instanceof Error ? error.message.slice(0, 500) : "Fallback verification failed" }) });
      }
    }
  } else if (ok && open && recoveries >= m.recovery_threshold) {
    await db("monitor_incidents?id=eq." + encodeURIComponent(open.id), {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString(), recovery_count: recoveries })
    });
  }

  const status = !httpHealthy ? "down" : latency > m.latency_threshold_ms ? "degraded" : "up";
  await db("monitors?id=eq." + encodeURIComponent(m.id), {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, latency_ms: latency, last_checked_at: new Date().toISOString() })
  });
}

async function queueAlert(m: Monitor, incidentId: string | null, alertType: "incident_opened" | "incident_resolved" | "failover_triggered") {
  if (!m.alert_email) return;
  const cutoff = new Date(Date.now() - Math.max(1, m.alert_cooldown_minutes || 30) * 60000).toISOString();
  const existing = await db("monitor_alerts?monitor_id=eq." + encodeURIComponent(m.id) + "&alert_type=eq." + encodeURIComponent(alertType) + "&created_at=gte." + encodeURIComponent(cutoff) + "&limit=1");
  if (existing.length) return;
  await db("monitor_alerts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ monitor_id: m.id, incident_id: incidentId, alert_type: alertType, recipient: m.alert_email }) });
}

async function dispatchAlerts() {
  if (!mailer) return;
  const alerts = await db("monitor_alerts?status=eq.pending&order=created_at.asc&limit=10");
  for (const alert of alerts) {
    try {
      await mailer.sendMail({ from: SMTP_FROM, to: alert.recipient, subject: "InsureAPI " + alert.alert_type.replace(/_/g, " "), text: "Monitor alert: " + alert.alert_type + "\nMonitor ID: " + alert.monitor_id });
      await db("monitor_alerts?id=eq." + encodeURIComponent(alert.id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "sent", attempts: (alert.attempts || 0) + 1, sent_at: new Date().toISOString(), last_error: null }) });
    } catch (error) {
      await db("monitor_alerts?id=eq." + encodeURIComponent(alert.id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "failed", attempts: (alert.attempts || 0) + 1, last_error: error instanceof Error ? error.message.slice(0, 500) : "Email failed" }) });
    }
  }
}

async function updateReliability(m: Monitor) {
  const result = await db("rpc/calculate_monitor_reliability", { method: "POST", body: JSON.stringify({ p_monitor_id: m.id, p_window_hours: 24 }) });
  const score = Number(result);
  if (Number.isFinite(score)) await db("monitors?id=eq." + encodeURIComponent(m.id), { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ reliability_score: score }) });
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
        // Avoid checking more often than the monitor's configured interval.
        if (m.check_interval_seconds > 0) {
          const last = await db("monitor_checks?monitor_id=eq." + encodeURIComponent(m.id) + "&select=checked_at&order=checked_at.desc&limit=1");
          if (last[0] && now - Date.parse(last[0].checked_at) < m.check_interval_seconds * 1000) return;
        }
        await checkMonitor(m);
      }));
    }
  } catch (error) {
    console.error("[monitor-worker] tick failed", error);
  } finally {
    running = false;
  }
}

export function startMonitorWorker() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[monitor-worker] disabled: Supabase persistence credentials are not configured");
    return () => {};
  }
  void tick();
  if (ONCE) return () => {};
  const timer = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  console.log("[monitor-worker] started");
  return () => clearInterval(timer);
}
