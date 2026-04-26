import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Monitor } from "../App";
import { Bell, Shield, Zap, AlertTriangle, Save, RefreshCw, Plus, Trash2, Activity, Mail as MailIcon, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MonitoringRulesProps {
  monitor: Monitor | null;
  onUpdateRules: (id: string, rules: Partial<Monitor>) => void;
}

export default function MonitoringRules({ monitor, onUpdateRules }: MonitoringRulesProps) {
  const [latencyThreshold, setLatencyThreshold] = useState(250);
  const [latencyAction, setLatencyAction] = useState("alert");
  const [latencyEnabled, setLatencyEnabled] = useState(true);
  const [uptimeTarget, setUptimeTarget] = useState(99.9);
  const [alertEmail, setAlertEmail] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [autoFallback, setAutoFallback] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);
  const [errorRatePolicyThreshold, setErrorRatePolicyThreshold] = useState(5);
  const [errorRateAction, setErrorRateAction] = useState("alert");
  const [errorRateEnabled, setErrorRateEnabled] = useState(true);
  const [downtimeThreshold, setDowntimeThreshold] = useState(5);
  const [downtimeAction, setDowntimeAction] = useState("alert");
  const [downtimeEnabled, setDowntimeEnabled] = useState(true);
  const [customRules, setCustomRules] = useState<{id: string, metric: string, threshold: number, action: string, enabled: boolean}[]>([]);

  useEffect(() => {
    if (monitor) {
      setLatencyThreshold(monitor.latencyThreshold || 250);
      setLatencyAction(monitor.latencyAction || "alert");
      setLatencyEnabled(monitor.latencyEnabled ?? true);
      setUptimeTarget(monitor.uptimeTarget || 99.9);
      setAlertEmail(monitor.alertEmail || "");
      setFallbackUrl(monitor.fallbackUrl || "");
      setAutoFallback(monitor.autoFallbackEnabled ?? true);
      setSlackNotifications(monitor.slackNotificationsEnabled ?? false);
      setErrorRatePolicyThreshold(monitor.errorRateThreshold || 5);
      setErrorRateAction(monitor.errorRateAction || "alert");
      setErrorRateEnabled(monitor.errorRateEnabled ?? true);
      setDowntimeThreshold(monitor.downtimeThreshold || 5);
      setDowntimeAction(monitor.downtimeAction || "alert");
      setDowntimeEnabled(monitor.downtimeEnabled ?? true);
      setCustomRules(monitor.customRules || []);
    }
  }, [monitor]);

  if (!monitor) {
    return (
      <div className="h-[400px] border border-dashed border-[#141414] flex flex-col items-center justify-center gap-4 opacity-40">
        <Zap className="w-12 h-12" />
        <p className="uppercase tracking-widest text-xs font-bold">Select a monitor to configure rules</p>
      </div>
    );
  }

  const handleSave = () => {
    if (!monitor) return;
    onUpdateRules(monitor.id, {
      latencyThreshold,
      latencyAction,
      latencyEnabled,
      uptimeTarget,
      errorRateThreshold: errorRatePolicyThreshold,
      errorRateAction,
      errorRateEnabled,
      downtimeThreshold,
      downtimeAction,
      downtimeEnabled,
      alertEmail,
      fallbackUrl,
      autoFallbackEnabled: autoFallback,
      slackNotificationsEnabled: slackNotifications,
      customRules
    });
    toast.success("Monitoring Rules Updated", {
      description: `Custom policies for ${monitor.name} have been deployed.`
    });
  };

  const addRule = () => {
    const newRule = {
      id: Math.random().toString(36).substr(2, 9),
      metric: "error_rate",
      threshold: 5,
      action: "alert",
      enabled: true
    };
    setCustomRules([...customRules, newRule]);
    toast.info("New Error Rate monitoring rule draft created");
  };

  const removeRule = (id: string) => {
    setCustomRules(customRules.filter(r => r.id !== id));
    toast.info("Policy removed");
  };

  const updateRule = (id: string, updates: any) => {
    setCustomRules(customRules.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleTestAlert = () => {
    if (!alertEmail) {
      toast.error("Deployment Error", {
        description: "No alert recipient email defined."
      });
      return;
    }
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'Dispatching test notification...',
        success: `Verification signal sent to ${alertEmail}`,
        error: 'Communication failure',
      }
    );
  };

  const handleSlackTest = () => {
    if (!slackNotifications) {
      toast.error("Integration Error", {
        description: "Slack notifications are currently disabled."
      });
      return;
    }
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1500)),
      {
        loading: 'Verifying Slack Webhook...',
        success: 'Test incident pushed to #reliability channel',
        error: 'Webhook connection timeout',
      }
    );
  };

  const handleReset = () => {
    setLatencyThreshold(250);
    setLatencyAction("alert");
    setLatencyEnabled(true);
    setUptimeTarget(99.9);
    setErrorRatePolicyThreshold(5);
    setErrorRateAction("alert");
    setErrorRateEnabled(true);
    setDowntimeThreshold(5);
    setDowntimeAction("alert");
    setDowntimeEnabled(true);
    setAutoFallback(true);
    toast.info("Rules reset to system defaults");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tighter uppercase">Monitoring Rules</h2>
          <p className="text-xs opacity-60 uppercase tracking-widest">Configure autonomous triggers & safety thresholds</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-none border-[#141414]" onClick={handleReset}>
            <RefreshCw className="w-3 h-3 mr-2" /> Reset Defaults
          </Button>
          <Button size="sm" className="rounded-none bg-[#141414] text-[#E4E3E0]" onClick={handleSave}>
            <Save className="w-3 h-3 mr-2" /> Save Configuration
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
            <CardHeader className="border-b border-[#141414] py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> Latency Policy
              </CardTitle>
              <div className="flex items-center gap-3">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "rounded-none text-[7px] font-bold tracking-widest px-1 py-0 border-[#141414]",
                    latencyEnabled ? "bg-blue-500 text-[#E4E3E0]" : "bg-[#D1D0CC] text-[#141414] opacity-50"
                  )}
                >
                  {latencyEnabled ? "ACTIVE" : "STANDBY"}
                </Badge>
                <Switch checked={latencyEnabled} onCheckedChange={setLatencyEnabled} />
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <div className={cn("space-y-6 transition-all duration-300", !latencyEnabled && "opacity-40 grayscale pointer-events-none")}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[8px] uppercase opacity-50">Metric Tracked</Label>
                    <Badge variant="outline" className="text-[10px] rounded-none border-[#141414] w-full justify-start py-1">LATENCY</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[8px] uppercase opacity-50">Action on Breach</Label>
                    <select 
                      className="w-full bg-transparent border border-[#141414]/20 rounded-none p-1 text-[10px] font-bold uppercase outline-none focus:border-[#141414]"
                      value={latencyAction}
                      onChange={(e) => setLatencyAction(e.target.value)}
                    >
                      <option value="alert">Slack Alert</option>
                      <option value="notify">Email Notify</option>
                      <option value="fallback">Trigger Failover</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Latency Threshold (ms)</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        value={latencyThreshold} 
                        onChange={(e) => setLatencyThreshold(Number(e.target.value))}
                        className="w-20 h-7 rounded-none border-[#141414] bg-transparent text-[10px] font-mono text-right"
                      />
                      <span className="text-[10px] font-bold opacity-40 uppercase">ms</span>
                    </div>
                  </div>
                  <Slider 
                    value={[latencyThreshold]} 
                    onValueChange={(val) => setLatencyThreshold(val[0])} 
                    max={2000} 
                    step={50} 
                    className="py-2"
                  />
                  <p className="text-[8px] opacity-60 italic">Define the threshold for high-speed response. Alerts will trigger if average latency exceeds this value over a 5-minute window.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
            <CardHeader className="border-b border-[#141414] py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-3 h-3 text-red-500" /> Error Rate Policy
              </CardTitle>
              <div className="flex items-center gap-3">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "rounded-none text-[7px] font-bold tracking-widest px-1 py-0 border-[#141414]",
                    errorRateEnabled ? "bg-red-500 text-[#E4E3E0]" : "bg-[#D1D0CC] text-[#141414] opacity-50"
                  )}
                >
                  {errorRateEnabled ? "ACTIVE" : "STANDBY"}
                </Badge>
                <Switch checked={errorRateEnabled} onCheckedChange={setErrorRateEnabled} />
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <div className={cn("space-y-6 transition-all duration-300", !errorRateEnabled && "opacity-40 grayscale pointer-events-none")}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[8px] uppercase opacity-50">Metric Tracked</Label>
                    <Badge variant="outline" className="text-[10px] rounded-none border-[#141414] w-full justify-start py-1">ERROR_RATE</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[8px] uppercase opacity-50">Action on Breach</Label>
                    <select 
                      className="w-full bg-transparent border border-[#141414]/20 rounded-none p-1 text-[10px] font-bold uppercase outline-none focus:border-[#141414]"
                      value={errorRateAction}
                      onChange={(e) => setErrorRateAction(e.target.value)}
                    >
                      <option value="alert">Slack Alert</option>
                      <option value="notify">Email Notify</option>
                      <option value="fallback">Trigger Failover</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Policy Threshold (%)</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        value={errorRatePolicyThreshold} 
                        onChange={(e) => setErrorRatePolicyThreshold(Number(e.target.value))}
                        className="w-20 h-7 rounded-none border-[#141414] bg-transparent text-[10px] font-mono text-right"
                      />
                      <span className="text-[10px] font-bold opacity-40 uppercase">%</span>
                    </div>
                  </div>
                  <Slider 
                    value={[errorRatePolicyThreshold]} 
                    onValueChange={(val) => setErrorRatePolicyThreshold(val[0])} 
                    max={50} 
                    step={1} 
                    className="py-2"
                  />
                  <p className="text-[8px] opacity-60 italic">Define the precise tolerance for HTTP 4xx/5xx responses. If the error percentage exceeds this limit, the system will execute the selected action.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
            <CardHeader className="border-b border-[#141414] py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-orange-500" /> Downtime Policy
              </CardTitle>
              <div className="flex items-center gap-3">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "rounded-none text-[7px] font-bold tracking-widest px-1 py-0 border-[#141414]",
                    downtimeEnabled ? "bg-orange-500 text-[#E4E3E0]" : "bg-[#D1D0CC] text-[#141414] opacity-50"
                  )}
                >
                  {downtimeEnabled ? "ACTIVE" : "STANDBY"}
                </Badge>
                <Switch checked={downtimeEnabled} onCheckedChange={setDowntimeEnabled} />
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <div className={cn("space-y-6 transition-all duration-300", !downtimeEnabled && "opacity-40 grayscale pointer-events-none")}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[8px] uppercase opacity-50">Metric Tracked</Label>
                    <Badge variant="outline" className="text-[10px] rounded-none border-[#141414] w-full justify-start py-1">DOWNTIME_DURATION</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[8px] uppercase opacity-50">Action on Breach</Label>
                    <select 
                      className="w-full bg-transparent border border-[#141414]/20 rounded-none p-1 text-[10px] font-bold uppercase outline-none focus:border-[#141414]"
                      value={downtimeAction}
                      onChange={(e) => setDowntimeAction(e.target.value)}
                    >
                      <option value="alert">Slack Alert</option>
                      <option value="notify">Email Notify</option>
                      <option value="fallback">Trigger Failover</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Downtime Threshold (min)</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        value={downtimeThreshold} 
                        onChange={(e) => setDowntimeThreshold(Number(e.target.value))}
                        className="w-20 h-7 rounded-none border-[#141414] bg-transparent text-[10px] font-mono text-right"
                      />
                      <span className="text-[10px] font-bold opacity-40 uppercase">min</span>
                    </div>
                  </div>
                  <Slider 
                    value={[downtimeThreshold]} 
                    onValueChange={(val) => setDowntimeThreshold(val[0])} 
                    max={60} 
                    step={1} 
                    className="py-2"
                  />
                  <p className="text-[8px] opacity-60 italic">Define the continuous downtime duration required to trigger a high-priority incident. Small blips below this threshold will be logged but won't trigger critical escalations.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
            <CardHeader className="border-b border-[#141414] py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                <Globe className="w-3 h-3 text-emerald-500" /> Uptime Compliance
              </CardTitle>
              <Badge variant="outline" className="rounded-none text-[7px] font-bold tracking-widest px-1 py-0 border-[#141414] bg-emerald-500 text-[#E4E3E0]">
                ENFORCED
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Availability Target (%)</Label>
                    <p className="text-[8px] opacity-60">Minimum uptime commitment</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={uptimeTarget} 
                      onChange={(e) => setUptimeTarget(Number(e.target.value))}
                      step="0.01"
                      className="w-20 h-7 rounded-none border-[#141414] bg-transparent text-[10px] font-mono text-right"
                    />
                    <span className="text-[10px] font-bold opacity-40 uppercase">%</span>
                  </div>
                </div>
                <Slider 
                  value={[uptimeTarget]} 
                  onValueChange={(val) => setUptimeTarget(val[0])} 
                  min={90}
                  max={100} 
                  step={0.01} 
                  className="py-2"
                />
                <div className="p-2 border border-[#141414]/10 bg-[#141414]/5">
                  <p className="text-[8px] opacity-60 italic leading-relaxed">
                    The system monitors the heartbeat of this endpoint. If the calculated availability falls below your <strong>{uptimeTarget}%</strong> target, the incident response protocols will be activated and SLA insurance claims may be auto-initiated.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
          <CardHeader className="border-b border-[#141414] py-3">
            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-3 h-3" /> Autonomous Response
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Auto-Fallback</Label>
                  <Badge variant="outline" className={cn(
                    "text-[7px] h-3 px-1 rounded-none border-[#141414]/20",
                    autoFallback ? "bg-green-500/10 text-green-600 border-green-500/20" : "opacity-40"
                  )}>
                    {autoFallback ? "ACTIVE" : "STANDBY"}
                  </Badge>
                </div>
                <p className="text-[8px] opacity-60">Automatically trigger failover protocol to secondary endpoint during critical SLA breaches.</p>
              </div>
              <Switch checked={autoFallback} onCheckedChange={setAutoFallback} />
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Slack Incident Notifications</Label>
                  <Badge variant="outline" className={cn(
                    "text-[7px] h-3 px-1 rounded-none border-[#141414]/20",
                    slackNotifications ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "opacity-40"
                  )}>
                    {slackNotifications ? "CONNECTED" : "DISCONNECTED"}
                  </Badge>
                </div>
                <p className="text-[8px] opacity-60">Push real-time critical incidents and SLA breach events directly to the Slack #reliability channel.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className={cn(
                    "h-7 flex items-center px-2 rounded-none border-[#141414] text-[9px] font-bold uppercase tracking-widest transition-all",
                    !slackNotifications && "opacity-20 pointer-events-none"
                  )}
                  onClick={handleSlackTest}
                  title="Push Test Slack Event"
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Test
                </Button>
                <Switch checked={slackNotifications} onCheckedChange={setSlackNotifications} />
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Alert Recipient Email</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Bell className="absolute left-3 top-2.5 h-4 w-4 opacity-40" />
                  <Input 
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    placeholder="alerts@company.com" 
                    className="pl-10 rounded-none border-[#141414] bg-transparent text-xs" 
                  />
                </div>
                <Button 
                  size="sm" 
                  className="rounded-none bg-[#141414] text-[#E4E3E0] px-3" 
                  onClick={handleSave}
                  title="Save Alert Configuration"
                >
                  <Save className="w-3 h-3" />
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-none border-[#141414] px-3 transition-colors hover:bg-[#141414] hover:text-[#E4E3E0]" 
                  onClick={handleTestAlert}
                  title="Send Test Notification"
                >
                  <MailIcon className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="bg-[#141414]/5 p-3 border-l-2 border-[#141414]">
              <div className="flex gap-2 items-start text-red-600">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase">Critical Policy</p>
                  <p className="text-[9px] font-medium leading-tight">If uptime drops below {uptimeTarget}% while auto-fallback is disabled, a global incident will be declared and PagerDuty notified.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#141414]/10">
              <Label className="text-[10px] uppercase tracking-widest font-bold">Secondary Endpoint (Fallback)</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 opacity-40" />
                <Input 
                  value={fallbackUrl}
                  onChange={(e) => setFallbackUrl(e.target.value)}
                  placeholder="https://backup-api.service.com" 
                  className="pl-10 rounded-none border-[#141414] bg-transparent text-xs" 
                />
              </div>
              <p className="text-[8px] opacity-60">Specify the destination for rerouted traffic when the primary endpoint breaches SLA.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <Card className="border-[#141414] rounded-none shadow-none bg-transparent">
        <CardHeader className="border-b border-[#141414] flex flex-row items-center justify-between py-3">
          <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
            <Shield className="w-3 h-3" /> Custom Logic Engine
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-6 rounded-none border-[#141414] text-[9px] uppercase tracking-widest px-2"
            onClick={addRule}
          >
            <Plus className="w-3 h-3 mr-1" /> Add Rule
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-[#141414]">
            {customRules.length === 0 ? (
              <div className="p-8 text-center opacity-40">
                <p className="text-[10px] uppercase tracking-widest font-bold">No custom logic defined for this endpoint</p>
              </div>
            ) : (
              customRules.map((rule) => (
                <div key={rule.id} className="p-4 flex items-center gap-4 animate-in fade-in slide-in-from-left-2 transition-all">
                  <div className="flex-1 grid grid-cols-5 gap-6">
                    <div className="space-y-1">
                      <Label className="text-[8px] uppercase opacity-50">Metric</Label>
                      <select 
                        className="w-full bg-transparent border border-[#141414] rounded-none p-1 text-[10px] font-bold uppercase outline-none"
                        value={rule.metric}
                        onChange={(e) => updateRule(rule.id, { metric: e.target.value })}
                      >
                        <option value="latency">Latency</option>
                        <option value="uptime">Uptime</option>
                        <option value="error_rate">Error Rate</option>
                      </select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-[8px] uppercase opacity-50">Threshold</Label>
                        <Input 
                          type="number"
                          className="h-6 w-16 border-[#141414] rounded-none bg-transparent text-[10px] font-mono text-right p-1"
                          value={rule.threshold}
                          onChange={(e) => updateRule(rule.id, { threshold: Number(e.target.value) })}
                        />
                      </div>
                      <Slider 
                        value={[rule.threshold]} 
                        onValueChange={(val) => updateRule(rule.id, { threshold: val[0] })} 
                        max={rule.metric === 'latency' ? 2000 : 100} 
                        step={rule.metric === 'latency' ? 50 : 1} 
                        className="py-1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[8px] uppercase opacity-50">Action</Label>
                      <select 
                        className="w-full bg-transparent border border-[#141414] rounded-none p-1 text-[10px] font-bold uppercase outline-none"
                        value={rule.action}
                        onChange={(e) => updateRule(rule.id, { action: e.target.value })}
                      >
                        <option value="alert">Slack Alert</option>
                        <option value="fallback">Trigger Fallback</option>
                        <option value="scaling">Auto-Scale</option>
                        <option value="notify">Email Notify</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-end gap-3 self-end">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "rounded-none text-[6px] font-bold px-1 py-0 h-4 flex items-center border-[#141414]",
                          rule.enabled ? "bg-[#141414] text-[#E4E3E0]" : "bg-[#D1D0CC] text-[#141414] opacity-50"
                        )}
                      >
                        {rule.enabled ? "ACTIVE" : "STANDBY"}
                      </Badge>
                      <Switch 
                        checked={rule.enabled} 
                        onCheckedChange={(val) => updateRule(rule.id, { enabled: val })}
                      />
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-red-600 hover:bg-red-600/10 rounded-none"
                        onClick={() => removeRule(rule.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
