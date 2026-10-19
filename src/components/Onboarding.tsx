import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shield, Activity, Brain, Bell, CheckCircle2, ChevronRight, ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OnboardingProps {
  onComplete: () => void;
  onCreateMonitor?: (input: { name: string; url: string; alertEmail?: string }) => Promise<void>;
}

const steps = [
  { title: "Welcome to InsureAPI", eyebrow: "01 / 04", description: "A reliability command center for monitoring your APIs and services, spotting problems early, and keeping your operations visible.", icon: Shield },
  { title: "Know what is happening", eyebrow: "02 / 04", description: "Track uptime, latency, health checks, reliability scores, AI insights, rules, and incidents from one console.", icon: Activity },
  { title: "Add your first monitor", eyebrow: "03 / 04", description: "Start with one public HTTPS endpoint. We will run health checks against it and give you a live reliability view.", icon: Plus },
  { title: "You are ready", eyebrow: "04 / 04", description: "Your workspace is set. You can add more monitors, tune rules, review insights, and manage reliability workflows whenever you need.", icon: CheckCircle2 }
];

export default function Onboarding({ onComplete, onCreateMonitor }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("My first API");
  const [url, setUrl] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = async () => {
    if (step === 2 && url.trim() && onCreateMonitor) {
      setBusy(true);
      setError("");
      try {
        await onCreateMonitor({ name: name.trim() || "My first API", url: url.trim(), alertEmail: alertEmail.trim() || undefined });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create your first monitor.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (step < steps.length - 1) setStep(step + 1);
    else onComplete();
  };

  const skip = () => onComplete();

  const Icon = steps[step].icon;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-[#E4E3E0] text-[#141414] overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-5 sm:p-8">
        <div className="max-w-4xl w-full">
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1 flex-1 max-w-md">
              {steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 transition-all ${i <= step ? "bg-[#141414]" : "bg-[#141414]/10"}`} />)}
            </div>
            <button type="button" onClick={skip} className="ml-6 text-[10px] uppercase tracking-[0.2em] font-bold opacity-50 hover:opacity-100">Skip setup</button>
          </div>

          <div className="grid lg:grid-cols-[0.8fr_1.2fr] border border-[#141414] bg-[#E4E3E0]">
            <div className="bg-[#141414] text-[#E4E3E0] p-8 sm:p-12 min-h-[440px] flex flex-col justify-between">
              <div>
                <div className="w-16 h-16 flex items-center justify-center border border-[#E4E3E0]/30 mb-10">
                  <Icon className="w-8 h-8" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-3">{steps[step].eyebrow}</p>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-[0.95]">{steps[step].title}</h1>
              </div>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest opacity-50">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Secure connection active
              </div>
            </div>

            <div className="p-8 sm:p-12 min-h-[440px] flex flex-col justify-between">
              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} className="space-y-7">
                  <p className="text-lg leading-relaxed max-w-xl opacity-80">{steps[step].description}</p>

                  {step === 1 && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[
                        ["Live monitoring", "Health, latency and uptime visibility", Activity],
                        ["AI insights", "Reliability trends and warnings", Brain],
                        ["Rules", "Set thresholds and automated responses", Shield],
                        ["Alerts", "Keep your team informed about issues", Bell]
                      ].map(([title, copy, FeatureIcon]) => (
                        <div key={String(title)} className="border border-[#141414]/15 p-4">
                          <FeatureIcon className="w-4 h-4 mb-3" />
                          <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
                          <p className="text-xs opacity-55 mt-1">{copy}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-4 max-w-xl">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold">Monitor name</label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Production API" className="mt-2 rounded-none border-[#141414]" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold">Public HTTPS URL</label>
                        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.example.com/health" type="url" className="mt-2 rounded-none border-[#141414]" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold">Alert email <span className="opacity-40">(optional)</span></label>
                        <Input value={alertEmail} onChange={e => setAlertEmail(e.target.value)} placeholder="ops@example.com" type="email" autoComplete="email" className="mt-2 rounded-none border-[#141414]" />
                      </div>
                      {error && <p className="text-sm text-red-700">{error}</p>}
                      <p className="text-[11px] opacity-50">You can skip this step and add monitors later from the console.</p>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="border border-[#141414]/15 p-6 space-y-4">
                      <CheckCircle2 className="w-7 h-7" />
                      <p className="font-bold uppercase tracking-wider text-sm">Console initialized</p>
                      <p className="text-sm opacity-60">Your dashboard is ready. Use the help button anytime to reopen this guide.</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center justify-between pt-8 mt-8 border-t border-[#141414]/10">
                <Button type="button" variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy} className="rounded-none text-xs uppercase tracking-widest">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button type="button" onClick={finish} disabled={busy || (step === 2 && !url.trim())}
                  className="rounded-none bg-[#141414] text-[#E4E3E0] px-7 py-5 text-xs uppercase tracking-[0.18em] font-bold">
                  {busy ? "Creating monitor..." : step === 2 ? "Create & continue" : step === steps.length - 1 ? "Open console" : "Continue"}
                  {!busy && step !== steps.length - 1 && <ChevronRight className="ml-2 w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
