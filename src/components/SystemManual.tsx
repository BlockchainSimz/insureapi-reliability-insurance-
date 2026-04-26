import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Activity, Brain, Zap, RefreshCw, AlertTriangle, FileText, Globe, Bell } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const sections = [
  {
    title: "Relentless Monitoring",
    icon: Activity,
    color: "text-blue-500",
    content: [
      {
        subtitle: "Real-Time Probing",
        text: "The system executes millisecond-precise heartbeat checks on every configured endpoint. Use the 'Performance Audit' in the header for a global sweep or the sidebar 'Activity' icons for surgical probes."
      },
      {
        subtitle: "Status Manifest",
        text: "UP: Optimal operational state. DEGRADED: Latency or error spikes detected. DOWN: Total service failure, autonomous recovery initiated."
      }
    ]
  },
  {
    title: "Neural Engine (AI)",
    icon: Brain,
    color: "text-yellow-500",
    content: [
      {
        subtitle: "Predictive Analytics",
        text: "InsureAPI uses neural networks to analyze latency variance. It doesn't just watch for failure—it predicts it before it happens. Check the 'AI Insights' tab for risk forecasting."
      },
      {
        subtitle: "SLA Modeling",
        text: "The engine models your uptime against industry standards to ensure you never violate your own customer commitments."
      }
    ]
  },
  {
    title: "Incident Response",
    icon: Zap,
    color: "text-red-500",
    content: [
      {
        subtitle: "Autonomous Fallback",
        text: "Configure a secondary endpoint in 'Monitoring Rules'. If the primary breaches SLA, the system can instantly reroute your traffic to ensure 0% downtime."
      },
      {
        subtitle: "Security Alerts",
        text: "Critical breaches trigger immediate multi-channel dispatch (Slack, Email, and internal mission control)."
      }
    ]
  },
  {
    title: "Reliability Insurance",
    icon: Shield,
    color: "text-emerald-500",
    content: [
      {
        subtitle: "Automatic Protection",
        text: "Your monitoring isn't just a dashboard—it's an insurance policy. If a service you rely on fails, the system logs the incident for automatic payout claims."
      },
      {
        subtitle: "Compliance Proof",
        text: "Every second of downtime is mathematically verified, providing undeniable proof for vendor SLA negotiations."
      }
    ]
  }
];

export default function SystemManual() {
  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#141414] flex items-center justify-center">
          <FileText className="text-[#E4E3E0] w-7 h-7" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tighter uppercase">Operations Manual</h2>
          <p className="text-xs opacity-60 uppercase tracking-widest font-mono">Standard Operating Procedures v4.2.0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="border-[#141414] rounded-none shadow-none bg-transparent h-full">
              <CardHeader className="border-b border-[#141414] py-4 bg-[#141414]/5">
                <CardTitle className="text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                  <section.icon className={cn("w-4 h-4", section.color)} />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {section.content.map((item, i) => (
                  <div key={i} className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest border-l-2 border-[#141414] pl-3">
                      {item.subtitle}
                    </h4>
                    <p className="text-xs opacity-70 leading-relaxed font-serif italic pl-4">
                      {item.text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-[#141414] border-dashed rounded-none bg-[#141414] text-[#E4E3E0] p-8 text-center space-y-4">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto" />
        <h3 className="text-lg font-bold uppercase tracking-tighter">System Critical Protocol</h3>
        <p className="text-xs opacity-60 max-w-lg mx-auto uppercase tracking-widest leading-loose">
          In the event of a total grid failure, manual fallback triggers must be executed via the central Command Center. Autonomous protocols are fail-safe but require human verification for major routing shifts.
        </p>
        <div className="pt-4 flex justify-center gap-8 text-[10px] font-mono opacity-40 uppercase tracking-[0.3em]">
          <span>AES-256 Enabled</span>
          <span>Zero-Trust Protocol</span>
          <span>EAL6+ Certified</span>
        </div>
      </Card>
    </div>
  );
}
