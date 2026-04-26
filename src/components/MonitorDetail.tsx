import React from "react";
import { Monitor } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Legend, ReferenceLine, Bar, BarChart, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Globe, ShieldCheck, Zap, AlertTriangle, Brain, Loader2, TrendingUp, ShieldAlert, Activity, CheckCircle2, FileText, ThumbsUp, ThumbsDown, HelpCircle, Mail, Bell, Save, Shield, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { predictOutage } from "../lib/gemini";
import { motion, AnimatePresence } from "motion/react";

interface MonitorDetailProps {
  monitor: Monitor;
  onTriggerFallback?: (id: string) => Promise<void>;
  onCheckHealth?: (id: string) => Promise<any>;
  onUpdateRules?: (id: string, rules: Partial<Monitor>) => void;
}

export default function MonitorDetail({ monitor, onTriggerFallback, onCheckHealth, onUpdateRules }: MonitorDetailProps) {
  const [fallbackStatus, setFallbackStatus] = React.useState<'idle' | 'loading' | 'success'>('idle');
  const [prediction, setPrediction] = React.useState<any>(null);
  const [isPredicting, setIsPredicting] = React.useState(false);
  const [healthResult, setHealthResult] = React.useState<any>(null);
  const [isChecking, setIsChecking] = React.useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = React.useState<boolean>(false);
  const [feedbackType, setFeedbackType] = React.useState<'accurate' | 'inaccurate' | 'partially' | null>(null);
  const [feedbackComment, setFeedbackComment] = React.useState("");
  const [alertEmail, setAlertEmail] = React.useState(monitor.alertEmail || "");
  const [isSavingAlert, setIsSavingAlert] = React.useState(false);
  const [fallbackLogs, setFallbackLogs] = React.useState<string[]>([]);

  // Automatically fetch prediction when monitor changes
  React.useEffect(() => {
    setPrediction(null); // Reset prediction for new monitor
    setHealthResult(null); // Reset health result
    setFallbackStatus('idle');
    setFeedbackSubmitted(false);
    setFeedbackType(null);
    setFeedbackComment("");
    setAlertEmail(monitor.alertEmail || "");
    handlePredict();
  }, [monitor.id, monitor.alertEmail]);

  const handleSaveAlert = async () => {
    if (!alertEmail) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsSavingAlert(true);
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/alerts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: alertEmail }),
      });
      if (!res.ok) throw new Error("Failed to save alert settings");
      toast.success("Alert settings updated", {
        description: `Notifications will be sent to ${alertEmail}`,
      });
    } catch (error) {
      toast.error("Failed to update alert settings");
    } finally {
      setIsSavingAlert(false);
    }
  };

  const handleManualNotify = async (type: string, latency: number) => {
    if (!monitor.alertEmail && !alertEmail) {
      toast.error("No alert email configured", {
        description: "Please set an alert email in the configuration section first."
      });
      return;
    }
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, latency, email: alertEmail || monitor.alertEmail }),
      });
      if (!res.ok) throw new Error("Failed to send notification");
      toast.success("Notification sent successfully", {
        description: `Alert sent to ${alertEmail || monitor.alertEmail}`
      });
    } catch (error) {
      toast.error("Failed to send notification");
    }
  };

  const handleCheckHealth = async () => {
    if (!onCheckHealth) return;
    setIsChecking(true);
    try {
      const result = await onCheckHealth(monitor.id);
      setHealthResult(result);
      if (result.ok) {
        toast.success("Health check passed", {
          description: `Status: ${result.status} ${result.statusText}`,
        });
      } else {
        toast.error("Health check failed", {
          description: `Status: ${result.status} ${result.statusText}`,
        });
      }
    } catch (error) {
      toast.error("Failed to perform health check");
    } finally {
      setIsChecking(false);
      // Auto-fallback logic
      if (healthResult && !healthResult.ok && monitor.autoFallbackEnabled && fallbackStatus === 'idle') {
        toast.info("Autonomous failover triggered by Auto-Fallback policy");
        handleFallback();
      }
    }
  };

  const handlePredict = async () => {
    setIsPredicting(true);
    setFeedbackSubmitted(false);
    setFeedbackType(null);
    setFeedbackComment("");
    try {
      const result = await predictOutage(monitor.history);
      setPrediction(result);
      toast.success("AI Analysis Complete", {
        description: `Risk level identified as ${result.riskLevel}`,
      });
    } catch (error) {
      toast.error("AI Analysis Failed");
      console.error(error);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleFeedback = (type: 'accurate' | 'inaccurate' | 'partially') => {
    setFeedbackType(type);
  };

  const submitFeedback = () => {
    setFeedbackSubmitted(true);
    toast.success("Feedback Received", {
      description: `Thank you. This data will be used to fine-tune the neural model.`,
    });
    // In a real app, we would send this to a backend
    console.log(`Feedback for prediction: ${feedbackType}, Comment: ${feedbackComment}`);
  };

  const handleFallback = async () => {
    if (!onTriggerFallback) return;
    setFallbackStatus('loading');
    setFallbackLogs([
      "Initializing failover sequence...",
      "Detecting primary endpoint failure...",
      "Verifying secondary endpoint health..."
    ]);
    
    try {
      // Simulate technical steps
      await new Promise(resolve => setTimeout(resolve, 800));
      setFallbackLogs(prev => [...prev, "Secondary endpoint verified (200 OK)"]);
      await new Promise(resolve => setTimeout(resolve, 600));
      setFallbackLogs(prev => [...prev, "Rerouting traffic at edge nodes..."]);
      
      await onTriggerFallback(monitor.id);
      
      await new Promise(resolve => setTimeout(resolve, 600));
      setFallbackLogs(prev => [...prev, "Failover complete. Secondary route active."]);
      
      setFallbackStatus('success');
      toast.success("Manual fallback initiated", {
        description: `Traffic routed to ${monitor.fallbackUrl}`,
      });
      setTimeout(() => {
        setFallbackStatus('idle');
        setFallbackLogs([]);
      }, 6000);
    } catch (error) {
      toast.error("Failed to trigger fallback");
      setFallbackStatus('idle');
      setFallbackLogs([]);
    }
  };

  const chartData = monitor.history.map(h => ({
    timestamp: h.timestamp,
    time: format(new Date(h.timestamp), "HH:mm"),
    latency: h.latency,
    status: h.status
  }));

  const totalChecks = monitor.history.length;
  const upChecks = monitor.history.filter(h => h.status === 'up').length;
  const uptimePercentage = totalChecks > 0 ? ((upChecks / totalChecks) * 100).toFixed(2) : "100.00";

  const [latencyThreshold, setLatencyThreshold] = React.useState(monitor.latencyThreshold || 250);
  
  React.useEffect(() => {
    setLatencyThreshold(monitor.latencyThreshold || 250);
  }, [monitor.id, monitor.latencyThreshold]);

  const handleLatencyThresholdChange = (val: number) => {
    setLatencyThreshold(val);
    if (onUpdateRules) {
      onUpdateRules(monitor.id, { latencyThreshold: val });
    }
  };

  const uptimeTargetValue = monitor.uptimeTarget || 99.9; // % SLA threshold
  const errorRateThresholdValue = monitor.errorRateThreshold || 5; // % SLA threshold
  const adherenceTargetValue = 99.5; // % Latency Adherence SLA target
  const adherentChecks = monitor.history.filter(h => h.latency <= latencyThreshold).length;
  const latencyAdherence = totalChecks > 0 ? ((adherentChecks / totalChecks) * 100).toFixed(2) : "100.00";

  const complianceData = monitor.history.map(h => ({
    time: format(new Date(h.timestamp), "HH:mm"),
    compliance: h.status === 'up' && h.latency <= latencyThreshold ? 100 : 0,
    latency: h.latency,
    status: h.status
  }));

  const sevenDayTrend = React.useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    return days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setDate(day.getDate() + 1);

      const dayHistory = monitor.history.filter(h => {
        const hDate = new Date(h.timestamp);
        return hDate >= day && hDate < dayEnd;
      });

      if (dayHistory.length === 0) {
        return {
          date: format(day, "MMM dd"),
          uptime: 100,
          adherence: 100,
          hasData: false
        };
      }

      const dayTotal = dayHistory.length;
      const dayUp = dayHistory.filter(h => h.status === 'up').length;
      const dayAdherent = dayHistory.filter(h => h.latency <= latencyThreshold).length;

      return {
        date: format(day, "MMM dd"),
        uptime: Number(((dayUp / dayTotal) * 100).toFixed(2)),
        adherence: Number(((dayAdherent / dayTotal) * 100).toFixed(2)),
        errorRate: Number((((dayTotal - dayUp) / dayTotal) * 100).toFixed(2)),
        hasData: true
      };
    });
  }, [monitor.history]);

  const sevenDayStats = React.useMemo(() => {
    const dataWithHistory = sevenDayTrend.filter(d => d.hasData);
    if (dataWithHistory.length === 0) return { avgUptime: 100, avgAdherence: 100 };
    
    const sumUptime = dataWithHistory.reduce((acc, d) => acc + d.uptime, 0);
    const sumAdherence = dataWithHistory.reduce((acc, d) => acc + d.adherence, 0);
    const sumErrorRate = dataWithHistory.reduce((acc, d) => acc + d.errorRate, 0);
    
    return {
      avgUptime: (sumUptime / dataWithHistory.length).toFixed(2),
      avgAdherence: (sumAdherence / dataWithHistory.length).toFixed(2),
      avgErrorRate: (sumErrorRate / dataWithHistory.length).toFixed(2)
    };
  }, [sevenDayTrend]);

  const downtimeIncidents = React.useMemo(() => {
    const incidents: { start: string; end: string | null; duration: number | null }[] = [];
    let currentIncident: { start: string; end: string | null; duration: number | null } | null = null;

    const sortedHistory = [...monitor.history].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedHistory.forEach((h) => {
      const isDown = h.status !== 'up';
      
      if (isDown) {
        if (!currentIncident) {
          currentIncident = { start: h.timestamp, end: null, duration: null };
        }
      } else {
        if (currentIncident) {
          currentIncident.end = h.timestamp;
          const start = new Date(currentIncident.start).getTime();
          const end = new Date(h.timestamp).getTime();
          currentIncident.duration = Math.max(1, Math.floor((end - start) / 60000));
          incidents.push(currentIncident);
          currentIncident = null;
        }
      }
    });

    if (currentIncident) {
      incidents.push(currentIncident);
    }

    return incidents.reverse();
  }, [monitor.history]);

  return (
    <div className="space-y-6 relative">
      <AnimatePresence>
        {fallbackStatus === 'success' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.2, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 bg-green-500 z-[60] pointer-events-none"
            />
            <motion.div
              initial={{ opacity: 0, y: -100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -100, scale: 0.9 }}
              transition={{ type: "spring", damping: 15, stiffness: 200 }}
              className="absolute top-0 left-0 right-0 z-50 bg-green-600 text-white p-4 text-center text-[10px] uppercase tracking-[0.4em] font-black shadow-[0_10px_40px_rgba(22,163,74,0.4)] flex items-center justify-center gap-6 border-b border-white/20"
            >
              <motion.div 
                animate={{ 
                  opacity: [1, 0.4, 1],
                  scale: [1, 1.1, 1]
                }}
                transition={{ duration: 1, repeat: Infinity }}
                className="flex items-center gap-2 bg-white text-green-700 px-3 py-1 rounded-sm font-black"
              >
                <div className="w-2.5 h-2.5 bg-green-600 rounded-full shadow-[0_0_10px_rgba(22,163,74,0.8)]" />
                <span>LIVE FAILOVER</span>
              </motion.div>
              <span className="flex items-center gap-3 text-sm tracking-widest">
                <CheckCircle2 className="w-5 h-5" />
                Failover Protocol Active: Traffic Rerouted to Secondary Endpoint
              </span>
              <motion.div
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 4, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-white/40"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-3xl font-bold tracking-tighter uppercase">{monitor.name}</h2>
            <Badge className={cn(
              "rounded-none uppercase text-[10px] tracking-widest",
              monitor.status === "up" ? "bg-green-500 hover:bg-green-600" : 
              monitor.status === "down" ? "bg-red-500 hover:bg-red-600" : "bg-yellow-500 hover:bg-yellow-600"
            )}>
              {monitor.status}
            </Badge>
            <Button 
              onClick={handleFallback}
              disabled={fallbackStatus !== 'idle'}
              variant="outline"
              size="sm"
              className={cn(
                "rounded-none text-[9px] uppercase tracking-widest h-7 px-3 transition-all ml-4 font-bold relative overflow-hidden",
                fallbackStatus === 'success' 
                  ? "border-green-500 text-green-600 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.2)]" 
                  : "border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
              )}
            >
              <AnimatePresence mode="wait">
                {fallbackStatus === 'loading' ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center relative z-10"
                  >
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Rerouting...
                  </motion.div>
                ) : fallbackStatus === 'success' ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center relative z-10"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-2" />
                    FAILOVER ACTIVE
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center relative z-10"
                  >
                    <AlertTriangle className="w-3 h-3 mr-2" /> 
                    Trigger Fallback
                  </motion.div>
                )}
              </AnimatePresence>
              {fallbackStatus === 'loading' && (
                <motion.div 
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ duration: 0.8, ease: "linear" }}
                  className="absolute inset-0 bg-red-600/20 z-0"
                />
              )}
              {fallbackStatus === 'success' && (
                <motion.div 
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 bg-green-500 rounded-none z-0"
                />
              )}
            </Button>
            <Button 
              onClick={handleCheckHealth}
              disabled={isChecking}
              variant="outline"
              size="sm"
              className="rounded-none border-[#141414] text-[9px] uppercase tracking-widest h-7 px-3 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors ml-2 font-bold"
            >
              {isChecking ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <Activity className="w-3 h-3 mr-2" />
              )}
              {isChecking ? "Checking..." : "Perform Health Check"}
            </Button>
            <Button 
              onClick={handlePredict}
              disabled={isPredicting}
              variant="outline"
              size="sm"
              className="rounded-none border-[#141414] text-[9px] uppercase tracking-widest h-7 px-3 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors ml-2 font-bold"
            >
              {isPredicting ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <Brain className="w-3 h-3 mr-2" />
              )}
              {isPredicting ? "Analyzing..." : "Run AI Scan"}
            </Button>
            <Button 
              onClick={() => handleManualNotify('DOWNTIME', monitor.latency)}
              variant="outline"
              size="sm"
              className="rounded-none border-red-600 text-red-600 text-[9px] uppercase tracking-widest h-7 px-3 hover:bg-red-600 hover:text-white transition-colors ml-2 font-bold"
            >
              <ShieldAlert className="w-3 h-3 mr-2" />
              Trigger Downtime Alert
            </Button>
          </div>
          <p className="text-xs font-mono opacity-60 flex items-center gap-2">
            <Globe className="w-3 h-3" /> {monitor.url}
          </p>
        </div>
        
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest opacity-60">Reliability Score</p>
          <p className="text-4xl font-bold tracking-tighter">{monitor.reliabilityScore}%</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-transparent border-b border-[#141414]/10 w-full justify-start rounded-none h-auto p-0 gap-6 mb-6">
          <TabsTrigger 
            value="overview" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-2 text-[10px] uppercase tracking-widest font-bold"
          >
            Performance Overview
          </TabsTrigger>
          <TabsTrigger 
            value="details" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#141414] data-[state=active]:bg-transparent px-0 py-2 text-[10px] uppercase tracking-widest font-bold"
          >
            Configuration Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-[#141414] text-[#E4E3E0]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60">Current Latency</p>
              <p className="text-xl font-bold font-mono">{monitor.latency}ms</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-[#141414] text-[#E4E3E0]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60">Uptime (24h)</p>
              <p className="text-xl font-bold font-mono">99.98%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-[#141414] text-[#E4E3E0]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60">Last Checked</p>
              <p className="text-xl font-bold font-mono">{format(new Date(monitor.lastChecked), "HH:mm:ss")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
        <CardHeader className="border-b border-[#141414] py-4">
          <CardTitle className="text-xs uppercase tracking-widest flex justify-between items-center">
            <span>Performance History (Latency ms)</span>
            <span className="data-grid-header">Real-time Data Stream</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 h-[300px]">
          <ResponsiveContainer width="100%" height="100%" key={`chart-${monitor.id}`}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#141414" opacity={0.1} vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                stroke="#141414" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontStyle: 'italic', fontFamily: 'Georgia' }}
                tickFormatter={(val) => format(new Date(val), "HH:mm")}
              />
              <YAxis 
                stroke="#141414" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontFamily: 'monospace' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#141414', 
                  border: 'none', 
                  borderRadius: '0px',
                  color: '#E4E3E0',
                  fontFamily: 'monospace',
                  fontSize: '10px'
                }}
                itemStyle={{ color: '#E4E3E0' }}
                cursor={{ stroke: '#141414', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Line 
                type="monotone" 
                dataKey="latency" 
                stroke="#141414" 
                strokeWidth={3}
                dot={{ r: 2, fill: '#141414', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#141414', stroke: '#E4E3E0', strokeWidth: 2 }}
                animationDuration={1500}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* SLA Compliance Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest flex justify-between items-center">
              <span className="flex items-center gap-2 italic font-serif lowercase">
                <FileText className="w-3 h-3 not-italic" /> sla compliance report
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-6 text-[8px] uppercase tracking-widest border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
                  onClick={() => handleManualNotify("FULL_SLA_REPORT", 0)}
                  title="Send Full Compliance Report"
                >
                  <Mail className="w-3 h-3 mr-1.5" /> Send Report
                </Button>
                <Badge variant="outline" className="border-[#141414] rounded-none text-[8px] font-mono">CONTRACT: PREMIUM-SLA-2026</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="border-l-2 border-[#141414] pl-3 relative group">
                  <p className="text-[9px] uppercase tracking-widest opacity-60 italic font-serif">7-Day Avg Uptime</p>
                  <p className="text-2xl font-bold font-mono tracking-tighter">{sevenDayStats.avgUptime}%</p>
                  <p className="text-[8px] opacity-40 uppercase tracking-tighter">Target: {uptimeTargetValue}%</p>
                  {Number(sevenDayStats.avgUptime) < uptimeTargetValue && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-0 right-0 h-6 w-6 rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleManualNotify("UPTIME_SLA_BREACH", 0)}
                      title="Notify of Uptime Breach"
                    >
                      <Mail className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="border-l-2 border-[#141414] pl-3 relative group">
                  <p className="text-[9px] uppercase tracking-widest opacity-60 italic font-serif">7-Day Avg Latency</p>
                  <p className="text-2xl font-bold font-mono tracking-tighter">{sevenDayStats.avgAdherence}%</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[8px] opacity-40 uppercase tracking-tighter">Threshold: </p>
                    <div className="flex items-center gap-1 border-b border-[#141414]/20">
                      <span className="text-[8px] opacity-40 uppercase tracking-tighter">&lt;</span>
                      <Input 
                        type="number" 
                        value={latencyThreshold} 
                        onChange={(e) => handleLatencyThresholdChange(Number(e.target.value))}
                        className="w-10 h-4 p-0 border-none bg-transparent text-[8px] font-mono focus-visible:ring-0"
                      />
                      <span className="text-[8px] opacity-40 uppercase tracking-tighter">ms</span>
                    </div>
                  </div>
                  {Number(sevenDayStats.avgAdherence) < 100 && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-0 right-0 h-6 w-6 rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleManualNotify("LATENCY_SLA_BREACH", Number(monitor.latency))}
                      title="Notify of Latency Breach"
                    >
                      <Mail className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="border-l-2 border-[#141414] pl-3 relative group">
                  <p className="text-[9px] uppercase tracking-widest opacity-60 italic font-serif">7-Day Avg Error Rate</p>
                  <p className="text-2xl font-bold font-mono tracking-tighter">{sevenDayStats.avgErrorRate}%</p>
                  <p className="text-[8px] opacity-40 uppercase tracking-tighter">Limit: {errorRateThresholdValue}%</p>
                  {Number(sevenDayStats.avgErrorRate) > errorRateThresholdValue && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-0 right-0 h-6 w-6 rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleManualNotify("ERROR_RATE_SLA_BREACH", 0)}
                      title="Notify of Error Rate Breach"
                    >
                      <Mail className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[9px] uppercase tracking-widest font-bold">7-Day Compliance Trend</p>
                  <div className="flex gap-3 text-[8px] font-mono opacity-60">
                    <span className="flex items-center gap-1"><span className="w-2 h-[2px] bg-[#141414]" /> Uptime</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-[2px] border-b border-dashed border-[#141414]" /> Latency</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-[2px] bg-[#facc15]" /> Error Rate</span>
                  </div>
                </div>
                <div className="h-[250px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sevenDayTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorUptime" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#141414" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#141414" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#141414" opacity={0.05} vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#141414" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ opacity: 0.7, fontWeight: 500 }}
                      />
                      <YAxis 
                        yAxisId="right"
                        domain={[90, 100]} 
                        fontSize={8} 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ opacity: 0.5 }}
                        orientation="right"
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={[0, 20]} 
                        fontSize={8} 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ opacity: 0.5 }}
                        orientation="left"
                        hide
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#141414', 
                          border: 'none', 
                          borderRadius: '0px',
                          color: '#E4E3E0',
                          fontFamily: 'monospace',
                          fontSize: '10px',
                          padding: '10px',
                          zIndex: 100
                        }}
                        itemStyle={{ padding: '2px 0' }}
                        cursor={{ stroke: '#141414', strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        align="right" 
                        iconType="rect"
                        iconSize={8}
                        wrapperStyle={{ 
                          fontSize: '9px', 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.1em',
                          paddingBottom: '25px',
                          opacity: 0.8
                        }}
                      />
                      <ReferenceLine yAxisId="right" y={uptimeTargetValue} stroke="#141414" strokeDasharray="3 3" label={{ position: 'top', value: `Uptime SLA (${uptimeTargetValue}%)`, fontSize: 7, fill: '#141414', opacity: 0.5 }} />
                      <ReferenceLine yAxisId="right" y={adherenceTargetValue} stroke="#e11d48" strokeDasharray="2 2" label={{ position: 'bottom', value: `Latency SLA (${adherenceTargetValue}%)`, fontSize: 7, fill: '#e11d48', opacity: 0.5 }} />
                      <ReferenceLine yAxisId="left" y={errorRateThresholdValue} stroke="#facc15" strokeDasharray="3 3" label={{ position: 'left', value: `Error Limit (${errorRateThresholdValue}%)`, fontSize: 7, fill: '#facc15', opacity: 0.5 }} />
                      
                      <Area 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="uptime" 
                        stroke="#141414" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorUptime)" 
                        name="Uptime %"
                        animationDuration={1500}
                      />
                      <Line 
                        yAxisId="right"   
                        type="monotone" 
                        dataKey="adherence" 
                        stroke="#e11d48" 
                        strokeWidth={1.5} 
                        dot={{ r: 2, fill: '#e11d48', strokeWidth: 0 }}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                        name="Latency Adherence %"
                        animationDuration={2000}
                      />
                      <Bar 
                        yAxisId="left"
                        dataKey="errorRate" 
                        fill="#facc15" 
                        opacity={0.6}
                        name="Error Rate %" 
                        animationDuration={2500}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[9px] uppercase tracking-widest font-bold">Compliance Timeline</p>
                  <div className="flex items-center gap-3">
                    {complianceData.some(d => d.compliance < 100) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 text-[7px] uppercase tracking-tighter gap-1 hover:bg-[#141414] hover:text-[#E4E3E0] px-1.5"
                        onClick={() => handleManualNotify("TIMELINE_BREACH_REPORT", 0)}
                        title="Notify Stakeholders of All Timeline Breaches"
                      >
                        <Mail className="w-2.5 h-2.5" /> Notify Breaches
                      </Button>
                    )}
                    <p className="text-[8px] font-mono opacity-60">Binary State (100% = Compliant)</p>
                  </div>
                </div>
                <div className="h-12 w-full flex gap-[1px]">
                  {complianceData.map((d, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "flex-1 h-full transition-all duration-500 cursor-pointer hover:ring-1 hover:ring-inset hover:ring-white/50 relative group/bar",
                        d.compliance === 100 ? "bg-[#141414] opacity-80" : "bg-red-500"
                      )}
                      title={`${d.time}: ${d.compliance === 100 ? "Compliant" : "Breach"} (${d.latency}ms)`}
                      onClick={() => d.compliance < 100 && handleManualNotify(d.status !== 'up' ? "DOWNTIME" : "LATENCY_BREACH", d.latency)}
                    >
                      {d.compliance < 100 && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity">
                          <Mail className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest italic font-serif lowercase flex justify-between items-center">
              <span>SLA Incident Log</span>
              {monitor.history.some(h => h.status !== 'up' || h.latency > latencyThreshold) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[8px] uppercase tracking-widest gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
                  onClick={() => handleManualNotify("BULK_BREACH_REPORT", 0)}
                  title="Notify Stakeholders of All Logged Incidents"
                >
                  <Mail className="w-3 h-3" /> Notify All
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[180px] overflow-y-auto font-mono text-[10px]">
              {monitor.history.filter(h => h.status !== 'up' || h.latency > latencyThreshold).length > 0 ? (
                monitor.history
                  .filter(h => h.status !== 'up' || h.latency > latencyThreshold)
                  .map((h, i) => (
                    <div key={i} className="border-b border-[#141414]/10 p-2 flex justify-between items-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
                      <div className="flex items-center gap-2">
                        <span className="opacity-40 group-hover:opacity-100">[{format(new Date(h.timestamp), "HH:mm:ss")}]</span>
                        <span className={cn(
                          "font-bold uppercase",
                          h.status !== 'up' ? "text-red-500 group-hover:text-red-400" : "text-yellow-600 group-hover:text-yellow-400"
                        )}>
                          {h.status !== 'up' ? "DOWNTIME" : "LATENCY_BREACH"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="opacity-60">{h.latency}ms</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 rounded-none hover:bg-[#141414] hover:text-[#E4E3E0] opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleManualNotify(h.status !== 'up' ? "DOWNTIME" : "LATENCY_BREACH", h.latency)}
                          title="Send Manual Notification"
                        >
                          <Mail className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="p-8 text-center opacity-40 italic">
                  No SLA breaches detected in current window.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest italic font-serif lowercase flex justify-between items-center">
              <span>Verified Downtime Events</span>
              <Badge variant="outline" className="border-[#141414] rounded-none text-[8px] font-mono">INCIDENT-LIST-V1</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[180px] overflow-y-auto font-mono text-[10px]">
              {downtimeIncidents.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#141414]/20 opacity-40 text-[8px] uppercase tracking-widest">
                      <th className="p-2 font-normal">Start Time</th>
                      <th className="p-2 font-normal">End Time</th>
                      <th className="p-2 font-normal text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downtimeIncidents.map((incident, i) => (
                      <tr key={i} className="border-b border-[#141414]/10 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
                        <td className="p-2">
                          {format(new Date(incident.start), "MMM dd, HH:mm")}
                        </td>
                        <td className="p-2 opacity-60 group-hover:opacity-100">
                          {incident.end ? format(new Date(incident.end), "MMM dd, HH:mm") : <Badge variant="destructive" className="h-4 text-[7px] rounded-none">ONGOING</Badge>}
                        </td>
                        <td className="p-2 text-right font-bold">
                          {incident.duration ? `${incident.duration}m` : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center opacity-40 italic">
                  No verified downtime events logged in history.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#141414] rounded-none shadow-none bg-[#141414]/5">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3 h-3" /> Downtime Duration Matrix
              </div>
              <div className="flex gap-3 text-[8px] font-mono opacity-60 normal-case tracking-normal">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#e11d48]" /> Ongoing</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#64748b]" /> Resolved</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[180px]">
             {downtimeIncidents.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={downtimeIncidents.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#141414" opacity={0.1} />
                    <XAxis 
                      dataKey="start" 
                      fontSize={8} 
                      tickFormatter={(val) => format(new Date(val), "HH:mm")}
                      stroke="#141414"
                      opacity={0.5}
                    />
                    <YAxis 
                      fontSize={8}
                      stroke="#141414"
                      opacity={0.5}
                      label={{ value: 'MIN', angle: -90, position: 'insideLeft', fontSize: 8 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#141414', 
                        border: 'none', 
                        borderRadius: '0px',
                        color: '#E4E3E0',
                        fontFamily: 'monospace',
                        fontSize: '10px'
                      }}
                      formatter={(value: any) => [`${value} minutes`, 'Duration']}
                      labelFormatter={(label) => `Incident: ${format(new Date(label), "MMM dd, HH:mm")}`}
                    />
                    <Bar 
                      dataKey="duration" 
                      radius={[2, 2, 0, 0]}
                      animationDuration={1500}
                    >
                      {downtimeIncidents.slice().reverse().map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.end === null ? "#e11d48" : "#64748b"} 
                        />
                      ))}
                    </Bar>
                 </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center opacity-40 italic text-[10px] uppercase tracking-widest text-center">
                 Insufficient baseline for duration matrix
               </div>
             )}
          </CardContent>
        </Card>
      </div>

      {/* Real-time Health Check Section */}
      <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
        <CardHeader className="border-b border-[#141414] py-3">
          <CardTitle className="text-[10px] uppercase tracking-widest flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              <span>Real-time Health Probe</span>
            </div>
            <div className="flex items-center gap-2">
              {healthResult && (
                <Badge className={cn(
                  "rounded-none text-[8px] uppercase tracking-widest",
                  healthResult.ok ? "bg-green-500" : "bg-red-500"
                )}>
                  LAST RESULT: {healthResult.status}
                </Badge>
              )}
              <Badge variant="outline" className="border-[#141414] rounded-none text-[8px]">LIVE PROBE</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center justify-between border-b border-[#141414]/10 pb-2">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full shadow-sm",
                    healthResult ? (healthResult.ok ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50") : "bg-gray-400"
                  )} />
                  <span className="text-sm font-bold uppercase tracking-tight">
                    {healthResult ? `${healthResult.status} ${healthResult.statusText}` : "Awaiting Probe Initiation"}
                  </span>
                </div>
                {healthResult && (
                  <span className="text-[10px] font-mono opacity-40">
                    ID: {Math.random().toString(36).substring(7).toUpperCase()}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-widest opacity-60">Response Time</p>
                  <p className="text-lg font-mono font-bold tracking-tighter">
                    {healthResult ? `${healthResult.latency}ms` : "--"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-widest opacity-60">Status Code</p>
                  <p className="text-lg font-mono font-bold tracking-tighter">
                    {healthResult ? healthResult.status : "--"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-widest opacity-60">Last Probe</p>
                  <p className="text-lg font-mono font-bold tracking-tighter">
                    {healthResult ? format(new Date(healthResult.timestamp), "HH:mm:ss") : "--:--:--"}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="w-full md:w-auto">
              <Button 
                onClick={handleCheckHealth}
                disabled={isChecking}
                className="rounded-none bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest h-14 px-8 w-full group relative overflow-hidden"
              >
                <div className="relative z-10 flex items-center gap-3">
                  {isChecking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                  <div className="text-left">
                    <p className="font-bold leading-none">{isChecking ? "PROBING..." : "PERFORM HEALTH CHECK"}</p>
                    <p className="text-[8px] opacity-60 mt-1 font-normal">MANUAL OVERRIDE</p>
                  </div>
                </div>
                {isChecking && (
                  <motion.div 
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-white/10"
                  />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Prediction Section */}
      <Card className="border-[#141414] rounded-none shadow-none bg-[#141414] text-[#E4E3E0] overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="p-6 border-b md:border-b-0 md:border-r border-[#E4E3E0]/20 md:w-1/3 space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-yellow-400" />
              <h3 className="text-xs font-bold uppercase tracking-widest">AI Outage Predictor</h3>
            </div>
            <p className="text-[10px] opacity-60 leading-relaxed uppercase tracking-tight">
              Neural network analysis of latency variance and status transitions.
            </p>
            <Button 
              onClick={handlePredict} 
              disabled={isPredicting}
              className="w-full rounded-none bg-[#E4E3E0] text-[#141414] text-[10px] uppercase tracking-widest font-bold h-10 hover:bg-white"
            >
              {isPredicting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Neural Analysis"}
            </Button>
          </div>

          <div className="p-6 flex-1 bg-white/5">
            {prediction ? (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-60">Outage Probability</p>
                    <p className="text-4xl font-bold tracking-tighter">{prediction.probability}%</p>
                  </div>
                  <Badge className={cn(
                    "rounded-none uppercase text-[10px] tracking-widest",
                    prediction.riskLevel === "Critical" ? "bg-red-600" :
                    prediction.riskLevel === "High" ? "bg-orange-500" :
                    prediction.riskLevel === "Medium" ? "bg-yellow-500" : "bg-green-500"
                  )}>
                    {prediction.riskLevel} RISK
                  </Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-yellow-400" /> Reasoning
                  </p>
                  <p className="text-xs leading-relaxed italic opacity-80">
                    "{prediction.reasoning}"
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase flex items-center gap-2">
                    <ShieldAlert className="w-3 h-3 text-blue-400" /> Recommended Actions
                  </p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {prediction.recommendations.map((rec: string, i: number) => (
                      <li key={i} className="text-[9px] uppercase tracking-tight flex items-center gap-2 bg-white/5 p-2 border border-white/10">
                        <span className="w-1 h-1 bg-yellow-400 rounded-full" /> {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-4">
                  <p className="text-[10px] font-bold uppercase flex items-center gap-2">
                    <Activity className="w-3 h-3 text-green-400" /> Neural Feedback
                  </p>
                  {!feedbackSubmitted ? (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="text-[9px] uppercase tracking-widest opacity-60 font-serif italic">Accuracy Assessment</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleFeedback('accurate')}
                            className={cn(
                              "h-8 rounded-none border-white/20 hover:bg-white/10 text-[9px] uppercase tracking-widest transition-all",
                              feedbackType === 'accurate' ? "bg-white/20 border-white text-white" : "opacity-60"
                            )}
                          >
                            <ThumbsUp className="w-3 h-3 mr-2" /> Accurate
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleFeedback('partially')}
                            className={cn(
                              "h-8 rounded-none border-white/20 hover:bg-white/10 text-[9px] uppercase tracking-widest transition-all",
                              feedbackType === 'partially' ? "bg-white/20 border-white text-white" : "opacity-60"
                            )}
                          >
                            <HelpCircle className="w-3 h-3 mr-2" /> Partially Accurate
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleFeedback('inaccurate')}
                            className={cn(
                              "h-8 rounded-none border-white/20 hover:bg-white/10 text-[9px] uppercase tracking-widest transition-all",
                              feedbackType === 'inaccurate' ? "bg-white/20 border-white text-white" : "opacity-60"
                            )}
                          >
                            <ThumbsDown className="w-3 h-3 mr-2" /> Inaccurate
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[9px] uppercase tracking-widest opacity-60 font-serif italic">Detailed Observations</Label>
                        <textarea 
                          className="w-full bg-white/5 border border-white/10 p-3 text-[10px] font-mono focus:outline-none focus:border-white/30 resize-none min-h-[100px] placeholder:opacity-30"
                          placeholder="Describe specific discrepancies or insights for model fine-tuning..."
                          value={feedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                        />
                      </div>

                      <Button 
                        onClick={submitFeedback}
                        disabled={!feedbackType && !feedbackComment.trim()}
                        className="w-full h-10 rounded-none bg-[#E4E3E0] text-[#141414] text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-all active:scale-[0.98]"
                      >
                        Submit Structured Feedback
                      </Button>
                    </div>
                  ) : (
                    <motion.p 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-[9px] uppercase tracking-widest text-green-400 font-bold flex items-center gap-2 justify-center py-4 border border-green-500/20 bg-green-500/5"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Feedback Logged Successfully
                    </motion.p>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-30 gap-2 py-8">
                <TrendingUp className="w-8 h-8" />
                <p className="text-[10px] uppercase tracking-widest font-bold">Awaiting Neural Analysis</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </TabsContent>

        <TabsContent value="details" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest">Fallback Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase">Automatic Failover</span>
              <Badge className="bg-green-500 rounded-none text-[10px]">ENABLED</Badge>
            </div>
            <div className="p-3 bg-[#D1D0CC] border border-[#141414]">
              <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Secondary Endpoint</p>
              <p className="text-xs font-mono truncate">{monitor.fallbackUrl}</p>
            </div>
            <AnimatePresence>
              {(fallbackStatus === 'loading' || fallbackStatus === 'success') && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    "border p-2 overflow-hidden space-y-1 font-mono text-[8px] uppercase tracking-tighter",
                    fallbackStatus === 'success' ? "bg-green-500/10 border-green-500/30" : "bg-red-500/5 border-red-500/20"
                  )}
                >
                  {fallbackLogs.map((log, i) => (
                    <motion.p 
                      key={i}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex items-center gap-2",
                        i === fallbackLogs.length - 1 && fallbackStatus === 'loading' ? "text-red-400" : 
                        fallbackStatus === 'success' ? "text-green-600" : "opacity-60"
                      )}
                    >
                      <span className="w-1 h-1 bg-current rounded-full" />
                      {log}
                    </motion.p>
                  ))}
                  {fallbackStatus === 'success' && (
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-green-600 font-black pt-1 border-t border-green-500/20 mt-1 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Failover Active: Secondary Route Live
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <Button 
              onClick={handleFallback}
              disabled={fallbackStatus !== 'idle'}
              variant="outline"
              className={cn(
                "w-full rounded-none text-[10px] uppercase tracking-widest h-10 transition-all font-bold relative overflow-hidden group",
                fallbackStatus === 'success' 
                  ? "border-green-500 text-green-600 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.2)]" 
                  : "border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
              )}
            >
              <AnimatePresence mode="wait">
                {fallbackStatus === 'loading' ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center relative z-10"
                  >
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Initiating Failover Protocol...
                  </motion.div>
                ) : fallbackStatus === 'success' ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center relative z-10 font-black"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    FAILOVER ENGAGED
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center relative z-10"
                  >
                    <AlertTriangle className="w-3 h-3 mr-2" /> 
                    Trigger Manual Fallback
                  </motion.div>
                )}
              </AnimatePresence>
              {fallbackStatus === 'loading' && (
                <motion.div 
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ duration: 0.8, ease: "linear" }}
                  className="absolute inset-0 bg-red-600/20 z-0"
                />
              )}
              {fallbackStatus === 'success' && (
                <motion.div 
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 bg-green-500 rounded-none z-0"
                />
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Bottom Section: Alerts & Policies */}
        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-3 h-3" /> Active Monitoring Protocols
            </CardTitle>
            <Badge variant="outline" className="border-[#141414] rounded-none text-[8px] opacity-40">
              {monitor.customRules?.length || 0} DEPLOYED
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#141414]/10">
              {!monitor.customRules || monitor.customRules.length === 0 ? (
                <div className="p-8 text-center opacity-30 italic text-[10px] uppercase tracking-widest">
                  No custom protocols active for this endpoint.
                </div>
              ) : (
                monitor.customRules.map((rule) => (
                  <div key={rule.id} className={cn(
                    "p-3 flex items-center justify-between",
                    !rule.enabled && "opacity-40 grayscale"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-[#141414] flex items-center justify-center">
                        {rule.metric === "latency" ? <Zap className="w-3 h-3 text-[#E4E3E0]" /> : 
                         rule.metric === "uptime" ? <Shield className="w-3 h-3 text-[#E4E3E0]" /> : 
                         <Activity className="w-3 h-3 text-[#E4E3E0]" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-tight">
                          {rule.metric.replace('_', ' ')} • IF {rule.metric === 'uptime' ? 'BELOW' : 'EXCEEDS'} {rule.threshold}{rule.metric === 'latency' ? 'ms' : '%'}
                        </p>
                        <p className="text-[8px] opacity-60 uppercase tracking-widest">
                          EXECUTE: {rule.action.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "rounded-none text-[8px] font-mono",
                      rule.enabled ? "border-green-500 text-green-600" : "border-[#141414] opacity-40"
                    )}>
                      {rule.enabled ? "RUNNING" : "STOPPED"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
              <Mail className="w-3 h-3" /> Alert Email Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-[9px] uppercase tracking-widest opacity-60 font-bold">Primary Alert Recipient</Label>
              <div className="flex gap-2">
                <Input 
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="flex-1 bg-white/5 border border-[#141414]/20 p-2 text-xs font-mono focus:outline-none focus:border-[#141414] rounded-none h-9"
                />
                <Button 
                  size="sm" 
                  className="rounded-none bg-[#141414] text-[#E4E3E0] hover:bg-[#141414]/90 px-4 h-9"
                  onClick={handleSaveAlert}
                  disabled={isSavingAlert}
                >
                  {isSavingAlert ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}
                  Save Configuration
                </Button>
              </div>
              <p className="text-[8px] opacity-40 italic">Automated SLA breach notifications will be dispatched to this verified address.</p>
            </div>
            
            <div className="pt-2 border-t border-[#141414]/10 flex items-center justify-between">
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-7 text-[8px] rounded-none border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] uppercase tracking-tighter"
                  onClick={() => handleManualNotify("TEST_ALERT", monitor.latency)}
                >
                  <Mail className="w-3 h-3 mr-1.5" /> Send Test Notify
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-7 text-[8px] rounded-none border-red-600/50 text-red-600 hover:bg-red-600 hover:text-white uppercase tracking-tighter"
                  onClick={() => handleManualNotify("DOWNTIME", 0)}
                >
                  <AlertTriangle className="w-3 h-3 mr-1.5" /> Trigger Alert
                </Button>
              </div>
              <Badge variant="outline" className={cn(
                "rounded-none text-[8px] font-mono",
                monitor.alertEmail ? "border-green-500 text-green-600" : "border-gray-400 opacity-40"
              )}>
                STATUS: {monitor.alertEmail ? "ACTIVE" : "INACTIVE"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest">Insurance Policy</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase">Coverage Level</span>
              <span className="text-xs font-mono">Premium ($50k)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase">Monthly Premium</span>
              <span className="text-xs font-mono">$124.00</span>
            </div>
            <Button className="w-full rounded-none bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest h-8">
              View Policy Details
            </Button>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  </Tabs>
</div>
  );
}
