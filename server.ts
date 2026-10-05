import express, { NextFunction, Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dns from "node:dns/promises";
import net from "node:net";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import "dotenv/config";
import { query, migrate, pool } from "./src/server/db";

const PORT = Number(process.env.PORT ?? 3000);
const CHECK_INTERVAL = Number(process.env.MONITOR_INTERVAL_MS ?? 30000);
const REQUEST_TIMEOUT = Math.min(Number(process.env.REQUEST_TIMEOUT_MS ?? 5000), 15000);
const JWT_SECRET = process.env.JWT_SECRET ?? "development-only-secret";

type AuthUser = { id: string; organizationId: string; role: "owner" | "admin" | "member" };
type AuthedRequest = Request & { user?: AuthUser };

function sign(user: AuthUser) {
  return jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role }, JWT_SECRET, { expiresIn: "12h" });
}

function auth(required = true) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      if (!required && process.env.NODE_ENV !== "production") return next();
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const p = jwt.verify(header.slice(7), JWT_SECRET) as jwt.JwtPayload;
      if (!p.sub || !p.organizationId || !p.role) throw new Error("invalid token");
      req.user = { id: String(p.sub), organizationId: String(p.organizationId), role: p.role as AuthUser["role"] };
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

function requireRole(...roles: AuthUser["role"][]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

function isPrivateIpv4(ip: string) {
  const p = ip.split(".").map(Number);
  return p.length === 4 && (
    p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254) ||
    p[0] >= 224
  );
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function assertSafeTarget(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:") throw new Error("Only HTTPS monitor targets are allowed");
  if (u.username || u.password) throw new Error("Credential-bearing URLs are not allowed");
  if (u.port && !["443", "8443"].includes(u.port)) throw new Error("Unsupported target port");
  const addresses = net.isIP(u.hostname) ? [u.hostname] : (await dns.lookup(u.hostname, { all: true })).map(x => x.address);
  if (!addresses.length || addresses.some(ip => net.isIP(ip) === 4 ? isPrivateIpv4(ip) : isPrivateIpv6(ip))) {
    throw new Error("Target resolves to a private or non-routable address");
  }
  return u.toString();
}

async function seedDevelopment() {
  if (process.env.NODE_ENV === "production") return;
  const org = await query<{ id: string }>("SELECT id FROM organizations ORDER BY created_at LIMIT 1");
  if (org.rows[0]) return;
  const created = await query<{ id: string }>("INSERT INTO organizations(name) VALUES($1) RETURNING id", ["InsureAPI Development"]);
  const organizationId = created.rows[0].id;
  const passwordHash = await bcrypt.hash("change-me-in-development", 12);
  await query("INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,$4)", [organizationId, "dev@insureapi.local", passwordHash, "owner"]);
  await query("INSERT INTO monitors(organization_id,name,url,fallback_url,status,latency_ms,reliability_score,last_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()),($1,$8,$9,$10,$11,$12,$13,now())", [
    organizationId, "Example HTTPS API", "https://example.com", null, "checking", 0, 100,
    "Example Service", "https://httpbin.org/status/200", null, "checking", 0, 100
  ]);
}

async function listMonitors(organizationId: string) {
  const { rows } = await query<any>(`
    SELECT m.*,
      COALESCE((SELECT json_agg(h ORDER BY h.checked_at DESC) FROM (
        SELECT checked_at AS timestamp, latency_ms AS latency, CASE WHEN ok THEN 'up' ELSE 'down' END AS status
        FROM monitor_checks WHERE monitor_id=m.id ORDER BY checked_at DESC LIMIT 50
      ) h), '[]'::json) AS history
    FROM monitors m WHERE organization_id=$1 ORDER BY created_at DESC
  `, [organizationId]);
  return rows.map(m => ({
    id: m.id, name: m.name, url: m.url, fallbackUrl: m.fallback_url ?? "",
    alertEmail: m.alert_email ?? "", status: m.status, latency: m.latency_ms,
    lastChecked: m.last_checked_at, reliabilityScore: Number(m.reliability_score), history: m.history
  }));
}

async function performCheck(monitor: any) {
  const started = Date.now();
  let statusCode: number | null = null;
  let ok = false;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  try {
    await assertSafeTarget(monitor.url);
    const response = await axios.get(monitor.url, {
      timeout: REQUEST_TIMEOUT, maxRedirects: 0, validateStatus: () => true,
      responseType: "stream"
    });
    statusCode = response.status;
    ok = response.status >= 200 && response.status < 400;
    response.data.destroy();
  } catch (e: any) {
    errorCode = e.code ?? "CHECK_FAILED";
    errorMessage = String(e.message ?? "Health check failed").slice(0, 500);
  }
  const latency = Date.now() - started;
  const status = ok ? (latency > 250 ? "degraded" : "up") : "down";
  await query("INSERT INTO monitor_checks(monitor_id,status_code,latency_ms,ok,error_code,error_message) VALUES($1,$2,$3,$4,$5,$6)", [monitor.id,statusCode,latency,ok,errorCode,errorMessage]);
  await query("UPDATE monitors SET status=$1,latency_ms=$2,reliability_score=GREATEST(0,LEAST(100,reliability_score + $3)),last_checked_at=now(),updated_at=now() WHERE id=$4", [status,latency,ok ? 0.02 : -1,monitor.id]);
  return { status: statusCode ?? 503, statusText: ok ? "OK" : "Service Unavailable", latency, timestamp: new Date().toISOString(), ok };
}

async function startServer() {
  await migrate();
  await seedDevelopment();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req,res) => {
    try { await query("SELECT 1"); res.json({ ok: true, service: "insureapi", database: "up", timestamp: new Date().toISOString() }); }
    catch { res.status(503).json({ ok:false, service:"insureapi", database:"down" }); }
  });

  app.post("/api/auth/register", async (req,res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const organizationName = String(req.body?.organizationName ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || organizationName.length < 2) {
      return res.status(400).json({ error: "Valid email, 12+ character password and organization name are required" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const org = await client.query<{id:string}>("INSERT INTO organizations(name) VALUES($1) RETURNING id",[organizationName]);
      const hash = await bcrypt.hash(password,12);
      const user = await client.query<{id:string}>("INSERT INTO users(organization_id,email,password_hash,role) VALUES($1,$2,$3,'owner') RETURNING id",[org.rows[0].id,email,hash]);
      await client.query("COMMIT");
      const userData={id:user.rows[0].id,organizationId:org.rows[0].id,role:"owner" as const};
      res.status(201).json({ token:sign(userData), user:{id:userData.id,email,role:userData.role} });
    } catch(e:any) { await client.query("ROLLBACK"); if(e.code==="23505") return res.status(409).json({error:"Email already registered"}); throw e; }
    finally { client.release(); }
  });

  app.post("/api/auth/login", async (req,res) => {
    const email=String(req.body?.email??"").trim().toLowerCase(), password=String(req.body?.password??"");
    const {rows}=await query<any>("SELECT id,organization_id,password_hash,role FROM users WHERE email=$1",[email]);
    if(!rows[0] || !(await bcrypt.compare(password,rows[0].password_hash))) return res.status(401).json({error:"Invalid credentials"});
    const user={id:rows[0].id,organizationId:rows[0].organization_id,role:rows[0].role as AuthUser["role"]};
    res.json({token:sign(user),user:{id:user.id,email,role:user.role}});
  });

  app.get("/api/monitors", auth(false), async (req:AuthedRequest,res) => {
    const organizationId=req.user?.organizationId;
    if(!organizationId) {
      if(process.env.NODE_ENV==="production") return res.status(401).json({error:"Authentication required"});
      const org=await query<{id:string}>("SELECT id FROM organizations ORDER BY created_at LIMIT 1");
      return res.json(org.rows[0]?await listMonitors(org.rows[0].id):[]);
    }
    res.json(await listMonitors(organizationId));
  });

  app.post("/api/monitors", auth(), async (req:AuthedRequest,res) => {
    const name=String(req.body?.name??"").trim();
    if(!name || name.length>120) return res.status(400).json({error:"Monitor name is required"});
    try {
      const url=await assertSafeTarget(String(req.body?.url??""));
      const fallbackUrl=req.body?.fallbackUrl?await assertSafeTarget(String(req.body.fallbackUrl)):null;
      const {rows}=await query<any>("INSERT INTO monitors(organization_id,name,url,fallback_url,alert_email) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.user!.organizationId,name,url,fallbackUrl,String(req.body?.alertEmail??"").trim()||null]);
      res.status(201).json(rows[0]);
    } catch(e:any) { res.status(400).json({error:e.message}); }
  });

  app.put("/api/monitors/:id/alerts", auth(), async (req:AuthedRequest,res) => {
    const email=String(req.body?.email??"").trim();
    if(email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({error:"Invalid email"});
    const {rows}=await query<any>("UPDATE monitors SET alert_email=$1,updated_at=now() WHERE id=$2 AND organization_id=$3 RETURNING *",[email||null,req.params.id,req.user!.organizationId]);
    if(!rows[0]) return res.status(404).json({error:"Monitor not found"});
    res.json(rows[0]);
  });

  app.get("/api/monitors/:id/history", auth(false), async (req:AuthedRequest,res) => {
    const org=req.user?.organizationId ?? (await query<{id:string}>("SELECT id FROM organizations ORDER BY created_at LIMIT 1")).rows[0]?.id;
    const {rows}=await query<any>("SELECT checked_at AS timestamp,latency_ms AS latency,CASE WHEN ok THEN 'up' ELSE 'down' END AS status,status_code,ok,error_code FROM monitor_checks c JOIN monitors m ON m.id=c.monitor_id WHERE c.monitor_id=$1 AND m.organization_id=$2 ORDER BY checked_at DESC LIMIT 100",[req.params.id,org]);
    res.json(rows);
  });

  app.get("/api/monitors/:id/check", auth(false), async (req:AuthedRequest,res) => {
    const org=req.user?.organizationId ?? (await query<{id:string}>("SELECT id FROM organizations ORDER BY created_at LIMIT 1")).rows[0]?.id;
    const {rows}=await query<any>("SELECT * FROM monitors WHERE id=$1 AND organization_id=$2",[req.params.id,org]);
    if(!rows[0]) return res.status(404).json({error:"Monitor not found"});
    try { res.json(await performCheck(rows[0])); } catch(e:any) { res.status(400).json({error:e.message}); }
  });

  app.post("/api/monitors/:id/fallback", auth(), requireRole("owner","admin"), async (req:AuthedRequest,res) => {
    const {rows}=await query<any>("SELECT * FROM monitors WHERE id=$1 AND organization_id=$2",[req.params.id,req.user!.organizationId]);
    if(!rows[0]) return res.status(404).json({error:"Monitor not found"});
    await query("INSERT INTO incidents(monitor_id,type,metadata) VALUES($1,'FALLBACK_ACTIVATED',$2)",[req.params.id,JSON.stringify({requestedBy:req.user!.id})]);
    await query("UPDATE monitors SET status='degraded',reliability_score=GREATEST(0,reliability_score-5),updated_at=now() WHERE id=$1",[req.params.id]);
    res.json({message:"Fallback activated"});
  });

  let checking=false;
  setInterval(async () => {
    if(checking) return; checking=true;
    try { const {rows}=await query<any>("SELECT * FROM monitors"); for(const monitor of rows) await performCheck(monitor); }
    catch(e) { console.error("monitor cycle failed",e); }
    finally { checking=false; }
  }, CHECK_INTERVAL);

  if (process.env.NODE_ENV !== "production") {
    const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});
    app.use(vite.middlewares);
  } else {
    const distPath=path.join(process.cwd(),"dist");
    app.use(express.static(distPath));
    app.get("*",(_req,res)=>res.sendFile(path.join(distPath,"index.html")));
  }
  app.listen(PORT,"0.0.0.0",()=>console.log(`InsureAPI listening on :${PORT}`));
}

startServer().catch(err=>{console.error(err);process.exit(1);});
