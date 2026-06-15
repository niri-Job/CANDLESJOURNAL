"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { parseTradeFile, type PreviewRow } from "@/lib/parseTradeFile";

interface OnboardingData {
  name: string;
  broker: string;
  account_size: string;
  preferred_pairs: string[];
  experience_level: string;
  trading_style: string;
  preferred_sessions: string[];
  monthly_target: string;
}

interface ProfileRow {
  onboarding_completed: boolean;
  name: string | null;
  broker: string | null;
  account_size: string | null;
  preferred_pairs: string[] | null;
  experience_level: string | null;
  trading_style: string | null;
  preferred_sessions: string[] | null;
  monthly_target: number | null;
}

const BROKERS = ["ICMarkets", "Exness", "HFM", "FBS", "OctaFX", "XM", "Deriv", "Other"];
const ACCOUNT_SIZES = ["Under $100", "$100-$500", "$500-$2,000", "$2,000+"];
const PAIRS = [
  "EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "GBPJPY", "USDCHF",
  "USDCAD", "AUDUSD", "NZDUSD", "EURCAD", "EURGBP", "USDNOK",
  "US30", "NAS100", "BTCUSD",
];
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];
const TRADING_STYLES = ["Scalping", "Day Trading", "Swing Trading"];
const SESSIONS = ["London", "New York", "Asian", "Overlap (London/NY)"];

const EMPTY: OnboardingData = {
  name: "",
  broker: "",
  account_size: "",
  preferred_pairs: [],
  experience_level: "",
  trading_style: "",
  preferred_sessions: [],
  monthly_target: "",
};

const fieldCls =
  "w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5 " +
  "text-sm text-zinc-100 placeholder-zinc-600 " +
  "focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors";

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all ${
        active
          ? "bg-blue-500/15 border-blue-500 text-blue-400"
          : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

export default function OnboardingPage() {
  const [user,  setUser]  = useState<User | null>(null);
  const [step,  setStep]  = useState(1);
  const [data,  setData]  = useState<OnboardingData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // MT5 Direct Connect
  const [mt5Login,      setMt5Login]      = useState("");
  const [mt5Password,   setMt5Password]   = useState("");
  const [mt5Server,     setMt5Server]     = useState("");
  const [mt5Platform,   setMt5Platform]   = useState<"mt5" | "mt4">("mt5");
  const [mt5Connecting, setMt5Connecting] = useState(false);
  const [mt5Error,      setMt5Error]      = useState<string | null>(null);
  const [mt5Connected,  setMt5Connected]  = useState<string | null>(null);
  const [showPassword,  setShowPassword]  = useState(false);

  // CSV Import
  const [csvLogin,     setCsvLogin]     = useState("");
  const [csvBroker,    setCsvBroker]    = useState("");
  const [csvPreview,   setCsvPreview]   = useState<PreviewRow[] | null>(null);
  const [csvRaw,       setCsvRaw]       = useState("");
  const [csvFileName,  setCsvFileName]  = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError,     setCsvError]     = useState<string | null>(null);
  const [csvConnected, setCsvConnected] = useState(false);

  useEffect(() => {
    const payload = step <= 4 ? String(step) : "complete";
    window.dispatchEvent(new CustomEvent("niri:onboarding", { detail: { step: payload } }));
  }, [step]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const [profileRes, countRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select(
            "onboarding_completed, name, broker, account_size, preferred_pairs, " +
            "experience_level, trading_style, preferred_sessions, monthly_target"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      const profile = profileRes.data as ProfileRow | null;
      const hasTrades = (countRes.count ?? 0) > 0;

      if (profile?.onboarding_completed || hasTrades) {
        if (hasTrades && !profile?.onboarding_completed) {
          await supabase.from("user_profiles").upsert(
            { user_id: user.id, onboarding_completed: true, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }
        window.location.href = "/dashboard";
        return;
      }

      if (profile) {
        setData({
          name:               profile.name               || "",
          broker:             profile.broker             || "",
          account_size:       profile.account_size       || "",
          preferred_pairs:    profile.preferred_pairs    || [],
          experience_level:   profile.experience_level   || "",
          trading_style:      profile.trading_style      || "",
          preferred_sessions: profile.preferred_sessions || [],
          monthly_target:     profile.monthly_target != null ? String(profile.monthly_target) : "",
        });
      }
    }
    init();
  }, []);

  function toggle(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  async function upsert(patch: Record<string, unknown>) {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("user_profiles").upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }

  async function finish() {
    await upsert({ onboarding_completed: true });
    window.dispatchEvent(new CustomEvent("niri:onboarding", { detail: { step: "complete" } }));
    setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
  }

  async function next() {
    setError(null);
    setSaving(true);
    try {
      if (step === 1) {
        if (!data.name.trim())    { setError("Please enter your name.");          return; }
        if (!data.broker)         { setError("Please select your broker.");       return; }
        if (!data.account_size)   { setError("Please select your account size."); return; }
        await upsert({ name: data.name.trim(), broker: data.broker, account_size: data.account_size });
      } else if (step === 2) {
        if (data.preferred_pairs.length === 0) { setError("Select at least one pair.");      return; }
        if (!data.experience_level)            { setError("Select your experience level."); return; }
        if (!data.trading_style)               { setError("Select your trading style.");    return; }
        await upsert({
          preferred_pairs:    data.preferred_pairs,
          experience_level:   data.experience_level,
          trading_style:      data.trading_style,
          preferred_sessions: data.preferred_sessions,
          monthly_target:     data.monthly_target ? parseFloat(data.monthly_target) : null,
        });
      }
      setStep((s) => s + 1);
    } finally {
      setSaving(false);
    }
  }

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    if (!mt5Login.trim() || !mt5Password.trim() || !mt5Server.trim()) {
      setMt5Error("All fields are required.");
      return;
    }
    setMt5Connecting(true);
    setMt5Error(null);
    try {
      const res = await fetch("/api/metaapi/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login:    mt5Login.trim(),
          password: mt5Password.trim(),
          server:   mt5Server.trim(),
          platform: mt5Platform,
        }),
      });
      const json = await res.json() as { success?: boolean; account_label?: string; error?: string };
      if (!res.ok) {
        setMt5Error(json.error ?? "Connection failed. Please try again.");
      } else {
        const label = json.account_label ?? `${mt5Login.trim()} — ${mt5Server.trim()}`;
        setMt5Connected(label);
        // Fire background sync (non-blocking)
        fetch("/api/metaapi/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_signature: `${mt5Login.trim()}_${mt5Server.trim()}` }),
        }).catch(() => {});
        setTimeout(() => setStep(4), 2000);
      }
    } catch {
      setMt5Error("Network error. Check your connection and try again.");
    } finally {
      setMt5Connecting(false);
    }
  }

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!csvLogin.trim() || !csvBroker.trim()) {
      setCsvError("Fill in your MT5 Login Number and Broker first.");
      return;
    }
    setCsvFileName(file.name);
    setCsvError(null);
    setCsvPreview(null);
    const result = await parseTradeFile(file);
    if (result.error) {
      setCsvError(result.error);
      setCsvRaw("");
    } else {
      setCsvRaw(result.csvRaw);
      setCsvPreview(result.preview);
    }
    e.target.value = "";
  };

  async function handleCsvConfirm() {
    if (!csvLogin.trim() || !csvBroker.trim()) { setCsvError("Fill in Login and Broker first."); return; }
    if (!csvRaw) { setCsvError("Please select a file first."); return; }
    setCsvImporting(true);
    setCsvError(null);
    try {
      const res = await fetch("/api/trades/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_content:    csvRaw,
          account_login:  csvLogin.trim(),
          account_broker: csvBroker.trim(),
        }),
      });
      const json = await res.json() as { success?: boolean; inserted?: number; error?: string };
      if (!res.ok) {
        setCsvError(json.error ?? "Import failed.");
      } else {
        setCsvConnected(true);
        setTimeout(() => setStep(4), 2000);
      }
    } catch {
      setCsvError("Network error. Check your connection.");
    } finally {
      setCsvImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans flex flex-col items-center justify-center px-4 py-10">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-10 h-10 shrink-0"
             style={{ filter: "drop-shadow(0 0 10px rgba(245,197,24,0.28))" }}>
          <rect width="100" height="100" fill="#0A0A0F" rx="18"/>
          <path d="M50 36 Q40 36 35 42 Q30 48 33 54 Q30 60 35 64 Q40 68 45 67 L50 67" fill="none" stroke="#C49A00" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M50 36 Q60 36 65 42 Q70 48 67 54 Q70 60 65 64 Q60 68 55 67 L50 67" fill="none" stroke="#C49A00" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="50" y1="36" x2="50" y2="67" stroke="#C49A00" strokeWidth="0.8" strokeDasharray="2.5,2"/>
          <path d="M52 54 L56 47 L60 56 L64 44 L68 50" fill="none" stroke="#F5C518" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="68" cy="50" r="2.5" fill="#F5C518"/>
        </svg>
        <span className="font-bold text-xl tracking-tight text-zinc-100">NIRI</span>
        <span className="text-[10px] font-semibold tracking-widest" style={{ color: "var(--cj-gold-muted)" }}>
          Master your behaviour, master your trading.
        </span>
      </div>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
            s === step ? "w-8 bg-[var(--cj-gold)]" : s < step ? "w-4 bg-[var(--cj-gold)]/40" : "w-4 bg-zinc-700"
          }`} />
        ))}
      </div>

      <div className="w-full max-w-md bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7">

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
              Step 1 of 4 · Welcome
            </p>
            <h2 className="text-2xl font-bold mb-1">Welcome to NIRI</h2>
            <p className="text-sm text-zinc-500 mb-7">
              Your AI-powered trading journal. Let&apos;s set up your profile.
            </p>

            <div className="space-y-5">
              <div>
                <label className="label">What should we call you?</label>
                <input className="inp" placeholder="Your first name" value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && next()} autoFocus />
              </div>
              <div>
                <label className="label">Which broker do you trade with?</label>
                <select className="inp" value={data.broker}
                  onChange={(e) => setData({ ...data, broker: e.target.value })}>
                  <option value="">Select broker…</option>
                  {BROKERS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="label">What is your account size?</label>
                <select className="inp" value={data.account_size}
                  onChange={(e) => setData({ ...data, account_size: e.target.value })}>
                  <option value="">Select account size…</option>
                  {ACCOUNT_SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
              Step 2 of 4 · Trading Style
            </p>
            <h2 className="text-xl font-bold mb-1">How do you trade?</h2>
            <p className="text-sm text-zinc-500 mb-6">
              This helps your AI coach give personalised feedback.
            </p>

            <div className="space-y-6">
              <div>
                <label className="label">
                  Which pairs do you trade?{" "}
                  <span className="normal-case font-normal text-zinc-600">(select all that apply)</span>
                </label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {PAIRS.map((pair) => (
                    <Pill key={pair} label={pair}
                      active={data.preferred_pairs.includes(pair)}
                      onClick={() => setData({ ...data, preferred_pairs: toggle(data.preferred_pairs, pair) })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Experience level</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {EXPERIENCE_LEVELS.map((lvl) => (
                    <Pill key={lvl} label={lvl}
                      active={data.experience_level === lvl}
                      onClick={() => setData({ ...data, experience_level: lvl })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Trading style</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {TRADING_STYLES.map((style) => (
                    <Pill key={style} label={style}
                      active={data.trading_style === style}
                      onClick={() => setData({ ...data, trading_style: style })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="label">
                  Sessions you trade{" "}
                  <span className="normal-case font-normal text-zinc-600">(optional)</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SESSIONS.map((session) => (
                    <Pill key={session} label={session}
                      active={data.preferred_sessions.includes(session)}
                      onClick={() => setData({ ...data, preferred_sessions: toggle(data.preferred_sessions, session) })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="label">
                  Monthly P&amp;L target{" "}
                  <span className="normal-case font-normal text-zinc-600">(optional)</span>
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">$</span>
                  <input className="inp pl-7" type="number" min="0" placeholder="e.g. 500"
                    value={data.monthly_target}
                    onChange={(e) => setData({ ...data, monthly_target: e.target.value })} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 3 — Connect Your MT5 ── */}
        {step === 3 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
              Step 3 of 4 · Connect Your MT5
            </p>
            <h2 className="text-xl font-bold mb-1">Connect Your MT5</h2>
            <p className="text-sm text-zinc-500 mb-5">
              Import your trade history to start journalling immediately.
            </p>

            {/* Primary: MT5 Direct Connect */}
            <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-zinc-100">MT5 Direct Connect</p>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  LIVE
                </span>
              </div>
              <p className="text-xs text-zinc-500 mb-4">
                Connect your MT5 account directly. NIRI fetches your trade history automatically.
              </p>

              {mt5Connected ? (
                <div className="flex flex-col items-center text-center gap-3 py-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                       style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Connected!</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{mt5Connected}</p>
                    <p className="text-xs text-emerald-400 mt-1">Your trades are syncing…</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleMt5Connect} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                        MT5 Login Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text" inputMode="numeric"
                        value={mt5Login}
                        onChange={(e) => { setMt5Login(e.target.value); setMt5Error(null); }}
                        disabled={mt5Connecting}
                        placeholder="e.g. 12345678"
                        className={fieldCls}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                        Broker Server <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={mt5Server}
                        onChange={(e) => { setMt5Server(e.target.value); setMt5Error(null); }}
                        disabled={mt5Connecting}
                        placeholder="e.g. Exness-MT5Trial9"
                        className={fieldCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                      MT5 Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={mt5Password}
                        onChange={(e) => { setMt5Password(e.target.value); setMt5Error(null); }}
                        disabled={mt5Connecting}
                        placeholder="Your MT5 investor or master password"
                        className={fieldCls + " pr-10"}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                        {showPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">Platform</label>
                    <div className="flex gap-3">
                      {(["mt5", "mt4"] as const).map((p) => (
                        <button key={p} type="button" onClick={() => setMt5Platform(p)} disabled={mt5Connecting}
                          className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                          style={mt5Platform === p
                            ? { background: "rgba(245,197,24,0.15)", border: "1px solid rgba(245,197,24,0.4)", color: "var(--cj-gold)" }
                            : { background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "var(--cj-text-muted)" }}>
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mt5Error && (
                    <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                      <p className="text-xs text-rose-400">{mt5Error}</p>
                    </div>
                  )}

                  <button type="submit" disabled={mt5Connecting}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                    {mt5Connecting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin" />
                        Connecting… (may take up to 60s)
                      </span>
                    ) : "Connect Account"}
                  </button>

                  <p className="text-center text-[10px] text-zinc-600">
                    Your password is encrypted in transit and never stored by NIRI
                  </p>
                </form>
              )}
            </div>

            {/* Secondary: CSV Import */}
            {!mt5Connected && (
              <div className="bg-[var(--cj-raised)] border border-zinc-800 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-zinc-200">Import from CSV instead</p>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                   bg-zinc-700/60 text-zinc-400 border border-zinc-700">
                    Alternative
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mb-4">
                  Export your history from MT5 and import it manually.
                </p>

                {csvConnected ? (
                  <div className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                         style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">Imported!</p>
                      <p className="text-xs text-emerald-400 mt-0.5">Your trades are loading…</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                          MT5 Login <span className="text-rose-500">*</span>
                        </label>
                        <input type="text" inputMode="numeric" value={csvLogin}
                          onChange={(e) => { setCsvLogin(e.target.value); setCsvError(null); }}
                          placeholder="e.g. 12345678"
                          className={fieldCls}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                          Broker <span className="text-rose-500">*</span>
                        </label>
                        <input type="text" value={csvBroker}
                          onChange={(e) => { setCsvBroker(e.target.value); setCsvError(null); }}
                          placeholder="e.g. Exness"
                          className={fieldCls}
                        />
                      </div>
                    </div>

                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.htm,.html,.txt"
                      onChange={handleCsvFile}
                      style={{
                        display: "block", width: "100%", padding: "8px 12px",
                        borderRadius: "10px", border: "1px solid #3f3f46",
                        background: "var(--cj-raised)", color: "#d4d4d8",
                        cursor: "pointer", fontSize: "13px",
                      }}
                    />
                    {csvFileName && <p className="text-xs text-emerald-400">Selected: {csvFileName}</p>}

                    {csvError && (
                      <div className="px-4 py-3 rounded-xl text-xs"
                           style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                        {csvError}
                      </div>
                    )}

                    {csvPreview && csvPreview.length > 0 && (
                      <p className="text-[10px] text-zinc-500">
                        {csvPreview.length} trade{csvPreview.length !== 1 ? "s" : ""} detected
                      </p>
                    )}

                    {csvPreview && (
                      <button
                        onClick={handleCsvConfirm}
                        disabled={csvImporting || !csvLogin.trim() || !csvBroker.trim()}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
                        {csvImporting ? "Importing…" : `Import ${csvPreview.length} trades`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Skip */}
            <button type="button" onClick={() => setStep(4)}
              className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Skip for now
            </button>
          </>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5C518]/20 to-[#C9A227]/10
                            border border-[var(--cj-gold-muted)]/30 flex items-center justify-center
                            mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cj-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">
              You&apos;re all set{data.name ? `, ${data.name}` : ""}!
            </h2>
            <p className="text-sm text-zinc-500 mb-7">
              Your journal is configured and ready to use.
            </p>

            {(mt5Connected || csvConnected) && (
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3 mb-5 text-left">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                <div>
                  <p className="text-xs font-semibold text-emerald-300">
                    {mt5Connected ?? "CSV account connected"}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Trades syncing in the background</p>
                </div>
              </div>
            )}

            <div className="space-y-3 text-left mb-7">
              {[
                { title: "View your dashboard", body: "See your equity curve, win rate, and performance stats at a glance." },
                { title: "Sync or import trades", body: "Use CSV Import or MT5 Direct Connect from Settings to add more." },
                { title: "Get AI coaching", body: "After a few trades, get personalised feedback from your AI coach." },
              ].map((item) => (
                <div key={item.title}
                  className="flex gap-3 bg-[var(--cj-raised)] border border-zinc-800 rounded-xl p-4">
                  <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold"
                        style={{ background: "rgba(245,197,24,0.12)", color: "var(--cj-gold)" }}>N</span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{item.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 justify-center mb-7">
              {[data.broker, data.account_size, data.experience_level, data.trading_style]
                .filter(Boolean)
                .map((tag) => (
                  <span key={tag} className="text-[11px] bg-zinc-800 text-zinc-400 rounded-full px-3 py-1">
                    {tag}
                  </span>
                ))}
            </div>

            <button type="button" onClick={finish}
              className="btn-gold w-full py-3 rounded-xl text-sm font-bold">
              Start Journalling
            </button>
          </div>
        )}

        {/* Inline error for steps 1-2 */}
        {error && step <= 2 && (
          <div className="mt-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Nav buttons steps 1-2 */}
        {step <= 2 && (
          <div className={`mt-7 flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
            {step > 1 && (
              <button type="button" onClick={() => { setError(null); setStep((s) => s - 1); }}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                           hover:border-zinc-500 hover:text-zinc-200 transition-all">
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={saving}
              className="btn-gold px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Saving…" : "Next"}
            </button>
          </div>
        )}

        {/* Back button for step 3 */}
        {step === 3 && (
          <div className="mt-3">
            <button type="button" onClick={() => { setError(null); setStep(2); }}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                         hover:border-zinc-500 hover:text-zinc-200 transition-all">
              Back
            </button>
          </div>
        )}
      </div>

      {/* Skip setup — only steps 1-2 */}
      {step <= 2 && (
        <button type="button" onClick={finish}
          className="mt-5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          Skip setup for now
        </button>
      )}
    </div>
  );
}
