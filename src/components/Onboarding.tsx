import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shield, Zap, Activity, Brain, FileText, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const steps: Step[] = [
  {
    title: "System Initialization",
    description: "Welcome to InsureAPI. Your autonomous reliability engine is ready to monitor, predict, and insure your critical infrastructure.",
    icon: <Shield className="w-12 h-12" />,
    color: "bg-[#141414]"
  },
  {
    title: "Real-time Monitoring",
    description: "Track latency, uptime, and error rates across all endpoints. Visible grids and data streams give you complete oversight.",
    icon: <Activity className="w-12 h-12" />,
    color: "bg-blue-600"
  },
  {
    title: "Neural Insights",
    description: "Our AI analysis engine predicts outages before they happen, giving you a 'Reliability Score' and proactive warnings.",
    icon: <Brain className="w-12 h-12" />,
    color: "bg-purple-600"
  },
  {
    title: "Reliability Insurance",
    description: "If an SLA breach occurs, our claims system handles it. File claims and manage reimbursements with surgical precision.",
    icon: <FileText className="w-12 h-12" />,
    color: "bg-green-600"
  },
  {
    title: "Operations Manual",
    description: "Need more depth? The 'System Manual' tab in the main console provides full technical documentation for all autonomous protocols.",
    icon: <Zap className="w-12 h-12" />,
    color: "bg-[#141414]"
  }
];

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#E4E3E0] flex items-center justify-center p-6"
    >
      <div className="max-w-2xl w-full">
        <div className="flex gap-1 mb-8">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-1 flex-1 transition-all duration-500 ${
                i <= currentStep ? "bg-[#141414]" : "bg-[#141414]/10"
              }`} 
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease: "circOut" }}
            className="space-y-8"
          >
            <div className="flex items-start gap-8">
              <div className={`p-6 text-[#E4E3E0] ${steps[currentStep].color} shadow-[8px_8px_0px_rgba(20,20,20,0.2)]`}>
                {steps[currentStep].icon}
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 italic font-serif">Step 0{currentStep + 1} / 05</span>
                  <h1 className="text-5xl font-black tracking-tighter uppercase leading-none">{steps[currentStep].title}</h1>
                </div>
                <p className="text-lg leading-relaxed max-w-md font-medium opacity-80 uppercase tracking-tight">
                  {steps[currentStep].description}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-8 border-t border-[#141414]/10">
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 bg-red-600 animate-pulse rounded-full" />
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">System Online / Ready to serve</span>
              </div>
              <Button 
                onClick={nextStep}
                className="rounded-none bg-[#141414] text-[#E4E3E0] hover:bg-[#141414]/90 px-8 py-6 text-sm uppercase tracking-[0.2em] font-black group"
              >
                {currentStep === steps.length - 1 ? "Initialize Console" : "Next Protocol"}
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-24 grid grid-cols-3 gap-12 opacity-20">
          <div className="space-y-2 border-l border-[#141414] pl-4">
            <p className="text-[10px] font-black uppercase tracking-widest font-serif italic">Relay Port</p>
            <p className="text-2xl font-black font-mono">8080/UDP</p>
          </div>
          <div className="space-y-2 border-l border-[#141414] pl-4">
            <p className="text-[10px] font-black uppercase tracking-widest font-serif italic">Encryption</p>
            <p className="text-2xl font-black font-mono">AES-256-GCM</p>
          </div>
          <div className="space-y-2 border-l border-[#141414] pl-4">
            <p className="text-[10px] font-black uppercase tracking-widest font-serif italic">Neural Core</p>
            <p className="text-2xl font-black font-mono">GEMINI-3 PRO</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
