import React, { useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authConfigured, signIn, signUp } from "@/lib/auth";

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const session = await signUp(email.trim(), password);
        if (!session) {
          setError("Account created. Check your email to confirm the account, then sign in.");
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  if (!authConfigured) return (
    <div className="min-h-screen flex items-center justify-center bg-[#E4E3E0] p-6">
      <div className="max-w-md w-full border border-[#141414] p-8 space-y-4">
        <Shield className="w-8 h-8" />
        <h1 className="text-2xl font-black uppercase">Authentication not configured</h1>
        <p className="text-sm opacity-70">Configure the Firebase web configuration variables before using the production console.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E4E3E0] p-6">
      <form onSubmit={submit} className="max-w-md w-full border border-[#141414] p-8 space-y-6">
        <div className="space-y-2">
          <Shield className="w-8 h-8" />
          <h1 className="text-3xl font-black uppercase">InsureAPI</h1>
          <p className="text-xs uppercase tracking-widest opacity-60">Secure operator {mode === "signin" ? "sign-in" : "registration"}</p>
        </div>
        <div className="space-y-4">
          <Input required type="email" autoComplete="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input required minLength={12} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Password (12+ characters)" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {mode === "signup" && <p className="text-xs opacity-60">Email confirmation may be required by the configured Firebase Authentication policy.</p>}
        <Button disabled={busy} type="submit" className="w-full rounded-none bg-[#141414] text-[#E4E3E0]">
          {busy ? (mode === "signup" ? "CREATING ACCOUNT..." : "AUTHENTICATING...") : (mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN")}
        </Button>
        <button type="button" className="w-full text-xs uppercase tracking-widest underline underline-offset-4" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
          {mode === "signin" ? "Create an account" : "Back to sign in"}
        </button>
      </form>
    </div>
  );
}
