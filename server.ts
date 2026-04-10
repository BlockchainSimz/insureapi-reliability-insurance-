import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email Transporter Setup (Mock for demo, use real SMTP in production)
let transporter: nodemailer.Transporter;

async function setupEmail() {
  // For demo purposes, we'll use a test account from Ethereal
  // In production, you would use process.env.SMTP_HOST, etc.
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log("Email service initialized (Ethereal Test Account)");
  } catch (error) {
    console.error("Failed to initialize email service", error);
    // Fallback to console logging if Ethereal fails
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }
}

async function sendAlertEmail(to: string, monitorName: string, type: string, latency: number) {
  if (!transporter) return;

  const isReport = type.includes("REPORT");
  const subject = isReport 
    ? `📊 SLA COMPLIANCE REPORT: ${monitorName}`
    : `⚠️ SLA BREACH DETECTED: ${monitorName}`;
  
  const title = isReport ? "SLA COMPLIANCE REPORT" : "SLA BREACH DETECTED";
  const color = isReport ? "#141414" : "#e11d48";

  const info = await transporter.sendMail({
    from: '"InsureAPI Alert System" <alerts@insureapi.com>',
    to: to,
    subject: subject,
    text: `${title} for ${monitorName}.\nType: ${type}\n${latency > 0 ? `Latency: ${latency}ms\n` : ''}Timestamp: ${new Date().toISOString()}\n\nPlease check the dashboard for details.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #141414;">
        <h2 style="color: ${color}; text-transform: uppercase; letter-spacing: 0.1em;">${title}</h2>
        <p><strong>Monitor:</strong> ${monitorName}</p>
        <p><strong>Event Type:</strong> ${type.replace(/_/g, ' ')}</p>
        ${latency > 0 ? `<p><strong>Latency:</strong> ${latency}ms</p>` : ''}
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        <div style="margin-top: 20px; padding: 15px; background: #f4f4f4; border-left: 4px solid ${color};">
          <p style="margin: 0; font-size: 13px;">${isReport ? 'A manual compliance report has been generated for this endpoint.' : 'An immediate SLA breach has been detected and requires attention.'}</p>
        </div>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.05em;">This is an automated transmission from InsureAPI Systems Mission Control.</p>
      </div>
    `,
  });

  console.log("Alert email sent: %s", info.messageId);
  if (nodemailer.getTestMessageUrl(info)) {
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
  }
}

async function startServer() {
  await setupEmail();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock database for monitors
  let monitors = [
    {
      id: "1",
      name: "Stripe API",
      url: "https://api.stripe.com/health",
      status: "up",
      latency: 45,
      lastChecked: new Date().toISOString(),
      reliabilityScore: 99.8,
      fallbackUrl: "https://backup-api.stripe.com/health",
      alertEmail: "",
      history: Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - (20 - i) * 3600000).toISOString(),
        latency: 40 + Math.random() * 20,
        status: "up"
      }))
    },
    {
      id: "2",
      name: "Twilio SMS",
      url: "https://api.twilio.com/health",
      status: "degraded",
      latency: 450,
      lastChecked: new Date().toISOString(),
      reliabilityScore: 94.2,
      fallbackUrl: "https://messagebird.com/api/health",
      alertEmail: "",
      history: Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - (20 - i) * 3600000).toISOString(),
        latency: i > 15 ? 400 + Math.random() * 100 : 50 + Math.random() * 20,
        status: i > 15 ? "degraded" : "up"
      }))
    }
  ];

  // API Routes
  app.get("/api/monitors", (req, res) => {
    res.json(monitors);
  });

  app.put("/api/monitors/:id/alerts", (req, res) => {
    const monitor = monitors.find(m => m.id === req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    
    monitor.alertEmail = req.body.email;
    res.json({ message: "Alert email updated", monitor });
  });

  app.post("/api/monitors/:id/notify", async (req, res) => {
    const monitor = monitors.find(m => m.id === req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    
    const { email, type, latency } = req.body;
    try {
      await sendAlertEmail(email || monitor.alertEmail, monitor.name, type || "MANUAL_ALERT", latency || monitor.latency);
      res.json({ message: "Notification sent" });
    } catch (error) {
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/monitors", (req, res) => {
    const newMonitor = {
      id: Math.random().toString(36).substr(2, 9),
      ...req.body,
      status: "checking",
      latency: 0,
      lastChecked: new Date().toISOString(),
      reliabilityScore: 100,
      history: []
    };
    monitors.push(newMonitor);
    res.status(201).json(newMonitor);
  });

  app.get("/api/monitors/:id/history", (req, res) => {
    const monitor = monitors.find(m => m.id === req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    res.json(monitor.history);
  });

  app.post("/api/monitors/:id/fallback", (req, res) => {
    const monitor = monitors.find(m => m.id === req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    
    monitor.status = "degraded";
    monitor.reliabilityScore = Math.max(0, monitor.reliabilityScore - 5);
    
    // Log fallback event in history
    monitor.history.push({
      timestamp: new Date().toISOString(),
      latency: monitor.latency,
      status: "fallback_activated"
    });

    res.json({ message: "Fallback activated", monitor });
  });

  app.get("/api/monitors/:id/check", async (req, res) => {
    const monitor = monitors.find(m => m.id === req.params.id);
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });

    try {
      const start = Date.now();
      // We'll try a real request, but fallback to mock if it fails/times out
      // to ensure the UI always shows something meaningful in this demo environment
      const response = await axios.get(monitor.url, { timeout: 3000 }).catch(() => null);
      const latency = Date.now() - start;

      const result = {
        status: response ? response.status : 503,
        statusText: response ? response.statusText : "Service Unavailable",
        latency: latency,
        timestamp: new Date().toISOString(),
        ok: response ? response.status >= 200 && response.status < 300 : false
      };

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Health check failed" });
    }
  });

  // Background monitoring simulation
  setInterval(async () => {
    for (const monitor of monitors) {
      try {
        const start = Date.now();
        // Simulate variability
        const latency = Math.floor(Math.random() * 100) + (monitor.status === "degraded" ? 300 : 0);
        
        const oldStatus = monitor.status;
        const oldLatency = monitor.latency;
        
        monitor.latency = latency;
        monitor.lastChecked = new Date().toISOString();
        
        // Check for SLA breaches
        const isBreach = monitor.status !== "up" || monitor.latency > 250;
        const wasBreach = oldStatus !== "up" || oldLatency > 250;

        // If a new breach occurs and we have an alert email, send it
        if (isBreach && !wasBreach && monitor.alertEmail) {
          console.log(`[ALERT] SLA Breach detected for ${monitor.name}. Sending email to ${monitor.alertEmail}`);
          sendAlertEmail(
            monitor.alertEmail, 
            monitor.name, 
            monitor.status !== "up" ? "DOWNTIME" : "LATENCY_BREACH", 
            monitor.latency
          ).catch(err => console.error("Failed to send automated alert", err));
        }

        // Add to history
        monitor.history.push({
          timestamp: monitor.lastChecked,
          latency: monitor.latency,
          status: monitor.status
        });
        if (monitor.history.length > 50) monitor.history.shift();

      } catch (error) {
        monitor.status = "down";
        monitor.latency = 0;
      }
    }
  }, 30000); // Check every 30 seconds

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
