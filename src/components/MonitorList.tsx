import React from "react";
import { Monitor } from "../App";
import { cn } from "@/lib/utils";
import { ChevronRight, Globe, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "motion/react";

interface MonitorListProps {
  monitors: Monitor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTriggerFallback?: (id: string) => Promise<void>;
}

export default function MonitorList({ monitors, selectedId, onSelect, onTriggerFallback }: MonitorListProps) {
  return (
    <div className="divide-y divide-[#141414]">
      {monitors.map((monitor) => (
        <div
          key={monitor.id}
          onClick={() => onSelect(monitor.id)}
          className={cn(
            "p-4 cursor-pointer transition-all flex items-center justify-between group",
            selectedId === monitor.id ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#D1D0CC]"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-5 h-5">
              {/* Outer Pulse Ring */}
              <motion.div
                animate={
                  monitor.status === "up" 
                    ? { scale: [1, 1.5, 1], opacity: [0.2, 0.05, 0.2] } 
                    : monitor.status === "down"
                    ? { scale: [1, 2.5, 1], opacity: [0.7, 0, 0.7] }
                    : { scale: [1, 2, 1], opacity: [0.4, 0.1, 0.4] }
                }
                transition={{
                  duration: monitor.status === "up" ? 4 : monitor.status === "down" ? 0.6 : 1.5,
                  repeat: Infinity,
                  ease: monitor.status === "down" ? "easeOut" : "easeInOut",
                }}
                className={cn(
                  "absolute inset-0 rounded-full",
                  monitor.status === "up" ? "bg-emerald-600" : 
                  monitor.status === "down" ? "bg-rose-600" : "bg-amber-700"
                )}
              />
              
              {/* Secondary Warning Ring for Down/Degraded */}
              {(monitor.status === "down" || monitor.status === "degraded") && (
                <motion.div
                  animate={{ 
                    scale: [1, 1.8, 1],
                    opacity: [0, 0.5, 0] 
                  }}
                  transition={{ 
                    duration: monitor.status === "down" ? 0.4 : 1, 
                    repeat: Infinity,
                    delay: 0.2
                  }}
                  className={cn(
                    "absolute inset-0 border rounded-full",
                    monitor.status === "down" ? "border-rose-500" : "border-amber-600"
                  )}
                />
              )}

              {/* Core Dot */}
              <motion.div 
                animate={monitor.status === "down" ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3, repeat: Infinity }}
                className={cn(
                  "relative w-2.5 h-2.5 rounded-full border border-white/40 shadow-sm",
                  monitor.status === "up" ? "bg-emerald-600 shadow-emerald-900/20" : 
                  monitor.status === "down" ? "bg-rose-600 shadow-rose-900/40" : 
                  "bg-amber-700 shadow-amber-900/30"
                )} 
              />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-tight">{monitor.name}</h3>
              <p className={cn(
                "text-[10px] font-mono opacity-60",
                selectedId === monitor.id ? "text-[#E4E3E0]" : "text-[#141414]"
              )}>
                {monitor.url.replace("https://", "")}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              variant="ghost"
              title="Trigger Manual Fallback"
              className={cn(
                "w-8 h-8 rounded-none hover:bg-red-500 hover:text-white transition-colors",
                selectedId === monitor.id ? "text-[#E4E3E0] hover:bg-red-600" : "text-[#141414]"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (onTriggerFallback) {
                  onTriggerFallback(monitor.id).then(() => {
                    toast.success(`Fallback triggered for ${monitor.name}`);
                  });
                }
              }}
            >
              <AlertTriangle className="w-4 h-4" />
            </Button>
            <div className="text-right">
              <p className="text-[10px] font-mono font-bold">{monitor.latency}ms</p>
              <p className="text-[9px] uppercase tracking-tighter opacity-60">Latency</p>
            </div>
            <ChevronRight className={cn(
              "w-4 h-4 transition-transform",
              selectedId === monitor.id ? "translate-x-1" : "opacity-20 group-hover:opacity-100"
            )} />
          </div>
        </div>
      ))}
    </div>
  );
}
