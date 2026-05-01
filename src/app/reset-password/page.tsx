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

// ── Password input with show/hide toggle ─────────────────────────
function PwInput({
  value, onChange, placeholder = "••••••••", label,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; label: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.1em] font-medium mb-2"
             style={{ color: "var(--cj-gold-muted)" }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
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
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function ResetPasswordPage() {
  const [password,  setPassword]  = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState(false);
  const [ready,     setReady]     = useState(false);

  // Wait for Supabase to process the recovery token from the URL hash
  useEffect(() => {
    const supabase = createClient();

    // Check if a session already exists (handles page reloads)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    // PASSWORD_RECOVERY fires when Supabase processes the token in the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPw) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: e } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (e) {
      setError(e.message);
      return;
    }

    setSuccess(true);
    // Redirect to dashboard after 2 seconds
    setTimeout(() => { window.location.href = "/"; }, 2000);
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5C518] to-[#C9A227]
                          flex items-center justify-center text-2xl font-bold text-[#0A0A0F] mb-4"
               style={{ boxShadow: "0 0 32px rgba(245,197,24,0.30)" }}>
            NI
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">NIRI</h1>
          <p className="text-zinc-400 text-sm mt-1">Set a new password for your account</p>
        </div>

        <div className="bg-[var(--cj-surface)] rounded-2xl p-7"
             style={{ border: "1px solid var(--cj-border)", borderTop: "2px solid var(--cj-gold-muted)" }}>

          {success ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-emerald-400 font-semibold mb-1">Password updated!</p>
              <p className="text-zinc-500 text-sm">Redirecting you to the dashboard…</p>
            </div>

          ) : !ready ? (
            /* Waiting for token */
            <div className="text-center py-6">
              <p className="text-zinc-500 text-sm">Verifying your reset link…</p>
              <p className="text-zinc-600 text-xs mt-2">
                If nothing happens, the link may have expired.{" "}
                <a href="/login" className="underline" style={{ color: "var(--cj-gold)" }}>
                  Request a new one
                </a>
              </p>
            </div>

          ) : (
            /* Password form */
            <>
              <h2 className="text-lg font-bold text-zinc-100 mb-5">Choose a new password</h2>

              <div className="space-y-4">
                <PwInput label="New Password"     value={password}  onChange={setPassword} />
                <PwInput label="Confirm Password" value={confirmPw} onChange={setConfirmPw} />
              </div>

              {confirmPw && confirmPw !== password && (
                <p className="text-[11px] text-rose-400 mt-2">Passwords don't match</p>
              )}
              {confirmPw && confirmPw === password && (
                <p className="text-[11px] text-emerald-400 mt-2">✓ Passwords match</p>
              )}

              {error && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                  {error}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                className="btn-gold mt-5 w-full py-3 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50">
                {loading ? "Updating…" : "Update Password →"}
              </button>

              <a href="/login"
                className="mt-4 block text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                ← Back to Sign In
              </a>
            </>
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">Your trades are private and secured.</p>
      </div>
    </div>
  );
}
