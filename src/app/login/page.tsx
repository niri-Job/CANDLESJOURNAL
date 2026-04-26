"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }

      // Middleware handles onboarding vs dashboard routing after login
      window.location.href = "/";
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      setSuccess("Account created! Check your email to confirm, then log in.");
      setMode("login");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center px-4">

      {/* Theme toggle — top right */}
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600
                          flex items-center justify-center text-2xl font-bold text-white mb-4">
            CJ
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">CandlesJournal</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {mode === "login" ? "Welcome back. Sign in to continue." : "Create your free account."}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7">

          {/* Tabs */}
          <div className="flex mb-6 bg-[var(--cj-raised)] rounded-xl p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all
                            ${mode === m
                    ? "bg-[var(--cj-bg)] text-zinc-100 shadow"
                    : "text-zinc-500 hover:text-zinc-300"
                  }`}
              >
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="you@example.com"
                className="inp"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••"
                className="inp"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30
                            text-rose-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30
                            text-emerald-400 text-sm">
              {success}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-5 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500
                       disabled:opacity-50 disabled:cursor-not-allowed text-white
                       font-semibold text-sm tracking-wide transition-all active:scale-[0.98]"
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Your trades are private and secured.
        </p>
      </div>
    </div>
  );
}
