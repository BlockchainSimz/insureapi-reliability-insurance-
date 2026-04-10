import React, { useState, useEffect } from "react";
import { Activity, Shield, AlertTriangle, FileText, Plus, Settings, BarChart3, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import MonitorList from "./components/MonitorList";
import MonitorDetail from "./components/MonitorDetail";
import AIInsights from "./components/AIInsights";
import InsuranceClaims from "./components/InsuranceClaims";

export interface Monitor {
  id: string;
  name: string;
  url: string;
  status: "up" | "down" | "degraded" | "checking";
  latency: number;
  lastChecked: string;
  reliabilityScore: number;
  fallbackUrl: string;
  alertEmail?: string;
  history: { timestamp: string; latency: number; status: string }[];
}

export default function App() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonitors();
    const interval = setInterval(fetchMonitors, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchMonitors = async () => {
    try {
      const res = await fetch("/api/monitors");
      const data = await res.json();
      setMonitors(data);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch monitors", error);
    }
  };

  const handleTriggerFallback = async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${id}/fallback`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to trigger fallback");
      await fetchMonitors();
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const handleCheckHealth = async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${id}/check`);
      if (!res.ok) throw new Error("Health check failed");
      return await res.json();
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const selectedMonitor = monitors.find(m => m.id === selectedMonitorId);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] selection:bg-[#141414] selection:text-[#E4E3E0]">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-[#E4E3E0] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] flex items-center justify-center">
            <Shield className="text-[#E4E3E0] w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase">InsureAPI</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-60 font-medium">AI Reliability Insurance & Monitoring</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-[10px] uppercase tracking-widest opacity-60">System Status</p>
            <div className="flex items-center gap-2 justify-end">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono uppercase">All Systems Operational</span>
            </div>
          </div>
          <Button variant="outline" className="border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] rounded-none px-6">
            <Plus className="w-4 h-4 mr-2" /> NEW MONITOR
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar / List */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
            <CardHeader className="border-b border-[#141414] py-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Active Monitors
                </CardTitle>
                <Badge variant="outline" className="border-[#141414] rounded-none font-mono text-[10px]">
                  {monitors.length} TOTAL
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <MonitorList 
                monitors={monitors} 
                selectedId={selectedMonitorId} 
                onSelect={setSelectedMonitorId} 
                onTriggerFallback={handleTriggerFallback}
              />
            </CardContent>
          </Card>

          <Card className="border-[#141414] rounded-none shadow-none bg-[#141414] text-[#E4E3E0]">
            <CardHeader className="py-4 border-b border-[#E4E3E0]/20">
              <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" /> AI Reliability Score
              </CardTitle>
            </CardHeader>
            <CardContent className="py-6 space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-5xl font-bold tracking-tighter">97.4%</span>
                <span className="text-[10px] uppercase tracking-widest opacity-60 mb-2">Aggregate Health</span>
              </div>
              <Progress value={97.4} className="h-2 rounded-none bg-[#E4E3E0]/20" />
              <p className="text-xs opacity-70 leading-relaxed italic">
                "Overall infrastructure is stable. Minor degradation detected in Twilio SMS endpoints. Predictive analysis suggests 12% risk of failure in next 12h."
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-8 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-transparent border-b border-[#141414] w-full justify-start rounded-none h-auto p-0 gap-8">
              <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-3 text-xs uppercase tracking-widest font-bold">Overview</TabsTrigger>
              <TabsTrigger value="ai-insights" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-3 text-xs uppercase tracking-widest font-bold">AI Insights</TabsTrigger>
              <TabsTrigger value="insurance" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-3 text-xs uppercase tracking-widest font-bold">Insurance & Claims</TabsTrigger>
              <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-3 text-xs uppercase tracking-widest font-bold">Settings</TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <TabsContent key="overview" value="overview" className="mt-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {selectedMonitor ? (
                    <MonitorDetail 
                      monitor={selectedMonitor} 
                      onTriggerFallback={handleTriggerFallback}
                      onCheckHealth={handleCheckHealth}
                    />
                  ) : (
                    <div className="h-[500px] border border-dashed border-[#141414] flex flex-col items-center justify-center gap-4 opacity-40">
                      <BarChart3 className="w-12 h-12" />
                      <p className="uppercase tracking-widest text-xs font-bold">Select a monitor to view details</p>
                    </div>
                  )}
                </motion.div>
              </TabsContent>

              <TabsContent key="ai-insights" value="ai-insights" className="mt-6">
                <AIInsights monitors={monitors} />
              </TabsContent>

              <TabsContent key="insurance" value="insurance" className="mt-6">
                <InsuranceClaims monitors={monitors} />
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#141414] p-6 mt-12 flex justify-between items-center opacity-40">
        <p className="text-[10px] uppercase tracking-widest">© 2026 INSUREAPI SYSTEMS INC.</p>
        <div className="flex gap-6">
          <p className="text-[10px] uppercase tracking-widest">API v2.4.1</p>
          <p className="text-[10px] uppercase tracking-widest">SECURE ENCRYPTION ACTIVE</p>
        </div>
      </footer>
    </div>
  );
}
