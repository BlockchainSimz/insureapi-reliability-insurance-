import React, { useState, useEffect } from "react";
import { Activity, Shield, AlertTriangle, FileText, Plus, Settings, BarChart3, Zap, HelpCircle, RefreshCw } from "lucide-react";
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
import MonitoringRules from "./components/MonitoringRules";
import Onboarding from "./components/Onboarding";

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
  // Custom Rules
  latencyThreshold?: number;
  latencyAction?: string;
  latencyEnabled?: boolean;
  uptimeTarget?: number;
  errorRateThreshold?: number;
  errorRateAction?: string;
  errorRateEnabled?: boolean;
  downtimeThreshold?: number;
  downtimeAction?: string;
  downtimeEnabled?: boolean;
  autoFallbackEnabled?: boolean;
  slackNotificationsEnabled?: boolean;
  customRules?: {
    id: string;
    metric: string;
    threshold: number;
    action: string;
    enabled: boolean;
  }[];
}

import SystemManual from "./components/SystemManual";

export default function App() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("insureapi_onboarding_complete");
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
    fetchMonitors();
    const interval = setInterval(fetchMonitors, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleGlobalHealthCheck = async () => {
    toast.promise(
      Promise.all(monitors.map(m => handleCheckHealth(m.id))),
      {
        loading: 'Executing System-Wide Performance Audit...',
        success: 'Global reliability scan complete.',
        error: 'Global scan encountered issues.',
      }
    );
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem("insureapi_onboarding_complete", "true");
    setShowOnboarding(false);
  };

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

  const handleUpdateRules = (id: string, rules: Partial<Monitor>) => {
    setMonitors(prev => prev.map(m => m.id === id ? { ...m, ...rules } : m));
  };

  const selectedMonitor = monitors.find(m => m.id === selectedMonitorId);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] selection:bg-[#141414] selection:text-[#E4E3E0]">
      <Toaster position="top-right" />
      
      <AnimatePresence>
        {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      </AnimatePresence>
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
          <Button 
            variant="outline"
            size="sm"
            className="border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] rounded-none px-4 hidden xl:flex text-[10px] items-center gap-2"
            onClick={handleGlobalHealthCheck}
          >
            <RefreshCw className="w-3 h-3" />
            PERFORMANCE AUDIT
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            className="border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] rounded-none shrink-0"
            onClick={() => setShowOnboarding(true)}
            title="System Guide"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
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
                onCheckHealth={handleCheckHealth}
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
              <TabsTrigger value="rules" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-3 text-xs uppercase tracking-widest font-bold">Monitoring Rules</TabsTrigger>
              <TabsTrigger value="manual" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-3 text-xs uppercase tracking-widest font-bold">System Manual</TabsTrigger>
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
                      onUpdateRules={handleUpdateRules}
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

              <TabsContent key="rules" value="rules" className="mt-6">
                <MonitoringRules monitor={selectedMonitor} onUpdateRules={handleUpdateRules} />
              </TabsContent>

              <TabsContent key="manual" value="manual" className="mt-6">
                <SystemManual />
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#141414] p-6 mt-12 flex flex-col md:flex-row justify-between items-center gap-4 opacity-40">
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <p className="text-[10px] uppercase tracking-widest">© 2026 INSUREAPI SYSTEMS INC.</p>
          <Button 
            variant="link" 
            className="p-0 h-auto text-[10px] uppercase tracking-widest text-inherit hover:opacity-100"
            onClick={() => setShowOnboarding(true)}
          >
            Run System Initialization
          </Button>
        </div>
        <div className="flex gap-6">
          <p className="text-[10px] uppercase tracking-widest">API v2.4.1</p>
          <p className="text-[10px] uppercase tracking-widest">SECURE ENCRYPTION ACTIVE</p>
        </div>
      </footer>
    </div>
  );
}
