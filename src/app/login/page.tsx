"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

// ── Eye SVG icons ────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ── Password strength ────────────────────────────────────────────
function pwStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)             score++;
  if (pw.length >= 12)            score++;
  if (/[0-9]/.test(pw))           score++;
  if (/[^A-Za-z0-9]/.test(pw))   score++;
  if (score <= 1) return { score: 1, label: "Weak",   color: "#f87171" };
  if (score <= 2) return { score: 2, label: "Fair",   color: "#facc15" };
  return              { score: 3, label: "Strong", color: "#34d399" };
}

// ── Password input with show/hide ────────────────────────────────
function PwInput({
  value, onChange, onKeyDown, placeholder = "••••••••", id,
}: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string; id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="inp pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
type View = "auth" | "forgot";

export default function LoginPage() {
  const [mode,       setMode]       = useState<"login" | "signup">("login");
  const [view,       setView]       = useState<View>("auth");

  // Persist referral code from ?ref= query param into localStorage
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("cj_ref", ref.toUpperCase());
  }, []);
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [loading,    setLoading]    = useState(false);

  // Forgot-password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent,  setResetSent]  = useState(false);

  const strength = mode === "signup" ? pwStrength(password) : null;

  function switchMode(m: "login" | "signup") {
    setMode(m); setError(""); setSuccess(""); setPassword(""); setConfirmPw("");
  }

  function goForgot() {
    setView("forgot"); setResetEmail(email); setError(""); setSuccess(""); setResetSent(false);
  }

  function goBack() {
    setView("auth"); setError(""); setSuccess("");
  }

  // ── Submit login / signup ──────────────────────────────────────
  async function handleSubmit() {
    setError(""); setSuccess("");
    if (!email || !password) { setError("Please enter your email and password"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    if (mode === "signup" && password !== confirmPw) { setError("Passwords don't match"); return; }

    setLoading(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e) { setError(e.message); setLoading(false); return; }
      window.location.href = "/";
    } else {
      // Use server-side admin route to create + auto-confirm user
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Sign up failed. Please try again or contact support@niri.live for help.");
        setLoading(false);
        return;
      }

      // Account created and confirmed — sign in immediately
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError("Account created! Sign in failed: " + signInErr.message);
        setLoading(false);
        return;
      }

      // Track referral if a code was stored
      const refCode = localStorage.getItem("cj_ref");
      if (refCode) {
        try {
          await fetch("/api/referrals/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referral_code: refCode }),
          });
        } finally {
          localStorage.removeItem("cj_ref");
        }
      }

      window.location.href = "/";
    }
    setLoading(false);
  }

  // ── Submit forgot password ─────────────────────────────────────
  async function handleForgot() {
    setError(""); setSuccess("");
    if (!resetEmail) { setError("Please enter your email address"); return; }
    setLoading(true);
    const supabase = createClient();
    const { error: e } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (e) { setError(e.message); return; }
    setResetSent(true);
  }

  // ── Logo ───────────────────────────────────────────────────────
  const Logo = () => (
    <div className="flex flex-col items-center mb-10">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5C518] to-[#C9A227]
                      flex items-center justify-center text-2xl font-bold text-[#0A0A0F] mb-4"
           style={{ boxShadow: "0 0 32px rgba(245,197,24,0.30)" }}>
        NI
      </div>
      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">NIRI</h1>
      {view === "auth" && (
        <p className="text-zinc-400 text-sm mt-1">
          {mode === "login" ? "Welcome back. Sign in to continue." : "Create your free account."}
        </p>
      )}
    </div>
  );

  // ── Forgot password view ───────────────────────────────────────
  if (view === "forgot") {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <Logo />
          <div className="bg-[var(--cj-surface)] rounded-2xl p-7"
               style={{ border: "1px solid var(--cj-border)", borderTop: "2px solid var(--cj-gold-muted)" }}>
            <h2 className="text-lg font-bold text-zinc-100 mb-1">Reset your password</h2>
            <p className="text-zinc-500 text-xs mb-5">
              Enter your email and we'll send you a reset link.
            </p>

            {resetSent ? (
              <div className="px-4 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm text-center leading-relaxed">
                ✓ Check your email — we sent a password reset link
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] font-medium mb-2"
                         style={{ color: "var(--cj-gold-muted)" }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleForgot()}
                    placeholder="you@example.com"
                    className="inp"
                  />
                </div>

                {error && (
                  <div className="mt-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    {error}
                  </div>
                )}

                <button onClick={handleForgot} disabled={loading}
                  className="btn-gold mt-5 w-full py-3 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50">
                  {loading ? "Sending…" : "Send Reset Link →"}
                </button>
              </>
            )}

            <button onClick={goBack}
              className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              ← Back to Sign In
            </button>
          </div>

          <p className="text-center text-zinc-600 text-xs mt-6">Your trades are private and secured.</p>
        </div>
      </div>
    );
  }

  // ── Auth view (login / signup) ─────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo />

        <div className="bg-[var(--cj-surface)] rounded-2xl p-7"
             style={{ border: "1px solid var(--cj-border)", borderTop: "2px solid var(--cj-gold-muted)" }}>

          {/* Mode tabs */}
          <div className="flex mb-6 bg-[var(--cj-raised)] rounded-xl p-1">
            {(["login", "signup"] as const).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all
                  ${mode === m
                    ? "bg-[var(--cj-surface)] text-zinc-100 shadow"
                    : "text-zinc-500 hover:text-zinc-300"}`}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] font-medium mb-2"
                     style={{ color: "var(--cj-gold-muted)" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="you@example.com" className="inp" />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] uppercase tracking-[0.1em] font-medium"
                       style={{ color: "var(--cj-gold-muted)" }}>Password</label>
                {mode === "login" && (
                  <button type="button" onClick={goForgot}
                    className="text-[11px] font-medium transition-colors"
                    style={{ color: "var(--cj-gold)" }}>
                    Forgot password?
                  </button>
                )}
              </div>
              <PwInput value={password} onChange={setPassword}
                onKeyDown={e => e.key === "Enter" && mode === "login" && handleSubmit()} />

              {/* Strength indicator — signup only */}
              {mode === "signup" && password && strength && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                           style={{ background: i <= strength.score ? strength.color : "var(--cj-border)" }} />
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password — signup only */}
            {mode === "signup" && (
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] font-medium mb-2"
                       style={{ color: "var(--cj-gold-muted)" }}>Confirm Password</label>
                <PwInput value={confirmPw} onChange={setConfirmPw}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                {confirmPw && confirmPw !== password && (
                  <p className="text-[10px] text-rose-400 mt-1">Passwords don't match</p>
                )}
                {confirmPw && confirmPw === password && (
                  <p className="text-[10px] text-emerald-400 mt-1">✓ Passwords match</p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
              {success}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            className="btn-gold mt-5 w-full py-3 rounded-xl text-sm tracking-wide font-bold disabled:opacity-50">
            {loading ? "Please wait…" : mode === "login" ? "Sign In →" : "Create Account →"}
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">Your trades are private and secured.</p>
        {mode === "signup" && (
          <p className="text-center text-zinc-600 text-xs mt-2">
            Having trouble signing up?{" "}
            <a href="mailto:support@niri.live" className="text-zinc-400 hover:text-zinc-200 underline transition-colors">
              Email us at support@niri.live
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
