import React, { useState } from "react";
import { Monitor } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, AlertTriangle, TrendingUp, ShieldAlert, Loader2 } from "lucide-react";
import { predictOutage } from "../lib/gemini";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface AIInsightsProps {
  monitors: Monitor[];
}

export default function AIInsights({ monitors }: AIInsightsProps) {
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handlePredict = async (monitor: Monitor) => {
    setLoading(prev => ({ ...prev, [monitor.id]: true }));
    try {
      const result = await predictOutage(monitor.history);
      setPredictions(prev => ({ ...prev, [monitor.id]: result }));
    } catch (error) {
      console.error("Prediction failed", error);
    } finally {
      setLoading(prev => ({ ...prev, [monitor.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#141414] flex items-center justify-center">
          <Brain className="text-[#E4E3E0] w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tighter uppercase">AI Predictive Analysis</h2>
          <p className="text-xs opacity-60 uppercase tracking-widest">Neural Network Outage Forecasting</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {monitors.map((monitor) => (
          <Card key={monitor.id} className="border-[#141414] rounded-none shadow-none bg-transparent overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="p-6 border-b md:border-b-0 md:border-r border-[#141414] md:w-1/3 space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold uppercase tracking-tight">{monitor.name}</h3>
                  <Badge variant="outline" className="border-[#141414] rounded-none text-[9px]">{monitor.status}</Badge>
                </div>
                <p className="text-xs opacity-60 leading-relaxed">
                  Analyzing performance degradation patterns for the last 24 hours.
                </p>
                <Button 
                  onClick={() => handlePredict(monitor)} 
                  disabled={loading[monitor.id]}
                  className="w-full rounded-none bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest"
                >
                  {loading[monitor.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Prediction"}
                </Button>
              </div>

              <div className="p-6 flex-1 bg-[#D1D0CC]/30">
                {predictions[monitor.id] ? (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60">Outage Probability</p>
                        <p className="text-4xl font-bold tracking-tighter">{predictions[monitor.id].probability}%</p>
                      </div>
                      <Badge className={cn(
                        "rounded-none uppercase text-[10px] tracking-widest",
                        predictions[monitor.id].riskLevel === "Critical" ? "bg-red-600" :
                        predictions[monitor.id].riskLevel === "High" ? "bg-orange-500" :
                        predictions[monitor.id].riskLevel === "Medium" ? "bg-yellow-500" : "bg-green-500"
                      )}>
                        {predictions[monitor.id].riskLevel} RISK
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" /> Reasoning
                      </p>
                      <p className="text-xs leading-relaxed italic opacity-80">
                        "{predictions[monitor.id].reasoning}"
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3" /> Recommended Actions
                      </p>
                      <ul className="space-y-1">
                        {predictions[monitor.id].recommendations.map((rec: string, i: number) => (
                          <li key={i} className="text-[10px] uppercase tracking-tight flex items-center gap-2">
                            <span className="w-1 h-1 bg-[#141414] rounded-full" /> {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 gap-2">
                    <TrendingUp className="w-8 h-8" />
                    <p className="text-[10px] uppercase tracking-widest font-bold">Awaiting Analysis</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
