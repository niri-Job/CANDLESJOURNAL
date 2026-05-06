"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
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

interface QcForm {
  server: string;
  login: string;
  password: string;
  platform: "MT4" | "MT5";
  label: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BROKERS = ["ICMarkets", "HFM", "FBS", "OctaFX", "XM", "Deriv", "Other"];
const ACCOUNT_SIZES = ["Under $100", "$100–$500", "$500–$2,000", "$2,000+"];
const PAIRS = [
  "EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "GBPJPY", "USDCHF",
  "USDCAD", "AUDUSD", "NZDUSD", "EURCAD", "EURGBP", "USDNOK",
  "US30",   "NAS100", "BTCUSD",
];
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];
const TRADING_STYLES    = ["Scalping", "Day Trading", "Swing Trading"];
const SESSIONS          = ["London", "New York", "Asian", "Overlap (London/NY)"];

const EMPTY: OnboardingData = {
  name: "", broker: "", account_size: "",
  preferred_pairs: [], experience_level: "", trading_style: "",
  preferred_sessions: [], monthly_target: "",
};

const EMPTY_QC: QcForm = { server: "", login: "", password: "", platform: "MT5", label: "" };

// ─── Pill toggle button ───────────────────────────────────────────────────────
function Pill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all
        ${active
          ? "bg-blue-500/15 border-blue-500 text-blue-400"
          : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}
    >
      {label}
    </button>
  );
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [user,         setUser]         = useState<User | null>(null);
  const [step,         setStep]         = useState(1);
  const [data,         setData]         = useState<OnboardingData>(EMPTY);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Step 5 — Quick Connect
  const [qcForm,       setQcForm]       = useState<QcForm>(EMPTY_QC);
  const [connecting,   setConnecting]   = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectedSig, setConnectedSig] = useState<string | null>(null);

  // Step 5b — CSV import after connect
  const [importFile,   setImportFile]   = useState<File | null>(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth check + resume partial progress ─────────────────────────────────
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
          await supabase
            .from("user_profiles")
            .upsert(
              { user_id: user.id, onboarding_completed: true, updated_at: new Date().toISOString() },
              { onConflict: "user_id" }
            );
        }
        window.location.href = "/";
        return;
      }

      if (profile) {
        setData({
          name:               profile.name              || "",
          broker:             profile.broker            || "",
          account_size:       profile.account_size      || "",
          preferred_pairs:    profile.preferred_pairs   || [],
          experience_level:   profile.experience_level  || "",
          trading_style:      profile.trading_style     || "",
          preferred_sessions: profile.preferred_sessions || [],
          monthly_target:     profile.monthly_target != null ? String(profile.monthly_target) : "",
        });
      }
    }
    init();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggle(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  async function upsert(patch: Record<string, unknown>) {
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from("user_profiles")
      .upsert(
        { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  }

  async function finish() {
    await upsert({ onboarding_completed: true });
    window.location.href = "/";
  }

  // ── Step navigation ───────────────────────────────────────────────────────
  async function next() {
    setError(null);
    setSaving(true);
    try {
      if (step === 1) {
        if (!data.name.trim())    { setError("Please enter your name.");           return; }
        if (!data.broker)         { setError("Please select your broker.");        return; }
        if (!data.account_size)   { setError("Please select your account size.");  return; }
        await upsert({ name: data.name.trim(), broker: data.broker, account_size: data.account_size });

      } else if (step === 2) {
        if (data.preferred_pairs.length === 0)  { setError("Select at least one pair.");    return; }
        if (!data.experience_level)             { setError("Select your experience level."); return; }
        if (!data.trading_style)                { setError("Select your trading style.");    return; }
        await upsert({
          preferred_pairs:  data.preferred_pairs,
          experience_level: data.experience_level,
          trading_style:    data.trading_style,
        });

      } else if (step === 3) {
        if (data.preferred_sessions.length === 0) { setError("Select at least one session."); return; }
        await upsert({
          preferred_sessions: data.preferred_sessions,
          monthly_target: data.monthly_target ? parseFloat(data.monthly_target) : null,
        });

      } else if (step === 4) {
        // Go to Quick Connect step — do NOT mark onboarding complete yet
        setStep(5);
        return;
      }

      setStep((s) => s + 1);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    await finish();
  }

  // ── Quick Connect ─────────────────────────────────────────────────────────
  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnectError(null);

    if (!qcForm.server.trim() || !qcForm.login.trim() || !qcForm.password.trim()) {
      setConnectError("Please fill in all required fields.");
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch("/api/accounts/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_login:     qcForm.login.trim(),
          account_server:    qcForm.server.trim(),
          investor_password: qcForm.password,
          platform:          qcForm.platform,
          account_label:     qcForm.label.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; account_signature?: string };

      if (!res.ok) {
        setConnectError(json.error ?? "Connection failed");
      } else {
        setConnectedSig(json.account_signature ?? null);
        setQcForm(EMPTY_QC);
      }
    } catch {
      setConnectError("Network error — check your connection.");
    } finally {
      setConnecting(false);
    }
  }

  // ── CSV import (step 5b) ──────────────────────────────────────────────────
  async function handleImport() {
    if (!importFile || !connectedSig) return;
    setImporting(true);
    setImportError(null);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("account_signature", connectedSig);
    try {
      const res = await fetch("/api/accounts/import-history", { method: "POST", body: fd });
      const json = (await res.json()) as { imported?: number; skipped?: number; error?: string };
      if (!res.ok) {
        setImportError(json.error ?? "Import failed");
      } else {
        setImportResult({ imported: json.imported ?? 0, skipped: json.skipped ?? 0 });
      }
    } catch {
      setImportError("Network error — check your connection.");
    } finally {
      setImporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans
                    flex flex-col items-center justify-center px-4 py-10">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5C518] to-[#C9A227]
                     flex items-center justify-center text-base font-bold text-[#0A0A0F]"
          style={{ boxShadow: "0 0 20px rgba(245,197,24,0.28)" }}
        >
          NI
        </div>
        <span className="font-bold text-xl tracking-tight text-zinc-100">NIRI</span>
      </div>

      {/* Step dots */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`h-1.5 rounded-full transition-all duration-300
            ${s === step ? "w-8 bg-blue-500" : s < step ? "w-4 bg-blue-500/50" : "w-4 bg-zinc-700"}`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7">

        {/* ── STEP 1: Welcome ── */}
        {step === 1 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-blue-500/70 font-medium mb-2">
              Step 1 of 5 · Welcome
            </p>
            <h2 className="text-2xl font-bold mb-1">Welcome to NIRI</h2>
            <p className="text-sm text-zinc-500 mb-7">
              Your AI-powered trading journal for African forex traders.
              Let&apos;s set up your profile in 2 minutes.
            </p>

            <div className="space-y-5">
              <div>
                <label className="label">What should we call you?</label>
                <input
                  className="inp"
                  placeholder="Your first name"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Which broker do you trade with?</label>
                <select className="inp" value={data.broker}
                  onChange={(e) => setData({ ...data, broker: e.target.value })}>
                  <option value="">Select broker...</option>
                  {BROKERS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="label">What is your account size?</label>
                <select className="inp" value={data.account_size}
                  onChange={(e) => setData({ ...data, account_size: e.target.value })}>
                  <option value="">Select account size...</option>
                  {ACCOUNT_SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2: Trading Style ── */}
        {step === 2 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-blue-500/70 font-medium mb-2">
              Step 2 of 5 · Trading Style
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
                <label className="label">What is your experience level?</label>
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
                <label className="label">How would you describe your trading style?</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {TRADING_STYLES.map((style) => (
                    <Pill key={style} label={style}
                      active={data.trading_style === style}
                      onClick={() => setData({ ...data, trading_style: style })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 3: Sessions & Goals ── */}
        {step === 3 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-blue-500/70 font-medium mb-2">
              Step 3 of 5 · Sessions &amp; Goals
            </p>
            <h2 className="text-xl font-bold mb-1">When do you trade?</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Session data helps the AI find your best trading windows.
            </p>

            <div className="space-y-6">
              <div>
                <label className="label">
                  Which sessions do you trade?{" "}
                  <span className="normal-case font-normal text-zinc-600">(select all that apply)</span>
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
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">
                    $
                  </span>
                  <input
                    className="inp pl-7"
                    type="number"
                    min="0"
                    placeholder="e.g. 500"
                    value={data.monthly_target}
                    onChange={(e) => setData({ ...data, monthly_target: e.target.value })}
                  />
                </div>
                <p className="text-[11px] text-zinc-600 mt-1.5">
                  We&apos;ll track your progress toward this goal on the dashboard.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 4: All set ── */}
        {step === 4 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20
                            border border-emerald-500/30 flex items-center justify-center
                            text-3xl mx-auto mb-5">
              🎯
            </div>
            <h2 className="text-2xl font-bold mb-2">
              You&apos;re all set{data.name ? `, ${data.name}` : ""}!
            </h2>
            <p className="text-sm text-zinc-500 mb-7">
              Your journal is configured. Here&apos;s how to get started:
            </p>

            <div className="space-y-3 text-left mb-7">
              {[
                {
                  icon: "📝",
                  title: "Log your first trade",
                  body: "Use the form on the dashboard to add any trade — past or present.",
                },
                {
                  icon: "🤖",
                  title: "Get AI coaching",
                  body: "After a few trades, hit \"Analyse Today\" for a personalised coaching report.",
                },
                {
                  icon: "📡",
                  title: "Auto-sync from MT5",
                  body: "Connect your MT5 account to sync trades automatically — we'll set that up next.",
                },
              ].map((item) => (
                <div key={item.title}
                  className="flex gap-3 bg-[var(--cj-raised)] border border-zinc-800 rounded-xl p-4">
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{item.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Profile summary tags */}
            <div className="flex flex-wrap gap-2 justify-center">
              {[data.broker, data.account_size, data.experience_level, data.trading_style]
                .filter(Boolean)
                .map((tag) => (
                  <span key={tag}
                    className="text-[11px] bg-zinc-800 text-zinc-400 rounded-full px-3 py-1">
                    {tag}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* ── STEP 5: Quick Connect / CSV import ── */}
        {step === 5 && (
          <>
            {/* 5a — Quick Connect form (before connecting) */}
            {!connectedSig && (
              <>
                <p className="text-[11px] uppercase tracking-widest text-blue-500/70 font-medium mb-2">
                  Step 5 of 5 · Connect Your MT5 Account
                </p>
                <h2 className="text-xl font-bold mb-1">Sync your trade history</h2>
                <p className="text-sm text-zinc-500 mb-6">
                  Connect with your read-only investor password — we can never place trades on your behalf.
                </p>

                <form onSubmit={handleConnect} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                        Broker Server Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={qcForm.server}
                        onChange={(e) => setQcForm((f) => ({ ...f, server: e.target.value }))}
                        placeholder="e.g. ICMarkets-MT5, HFM-Live"
                        className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                   text-sm text-zinc-100 placeholder-zinc-600
                                   focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                      />
                      <p className="mt-1 text-[11px] text-zinc-600">
                        Find in MT5 → File → Open an Account
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                        Account Login <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={qcForm.login}
                        onChange={(e) => setQcForm((f) => ({ ...f, login: e.target.value }))}
                        placeholder="12345678"
                        className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                   text-sm text-zinc-100 placeholder-zinc-600
                                   focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                                   [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                        Investor Password <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={qcForm.password}
                        onChange={(e) => setQcForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Your read-only investor password"
                        autoComplete="new-password"
                        className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                   text-sm text-zinc-100 placeholder-zinc-600
                                   focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                      />
                      <p className="mt-1 text-[11px] text-zinc-600">
                        Investor passwords are read-only — encrypted before storage.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                          Platform
                        </label>
                        <div className="flex gap-1.5">
                          {(["MT5", "MT4"] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setQcForm((f) => ({ ...f, platform: p }))}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border
                                ${qcForm.platform === p
                                  ? "bg-blue-500/15 border-blue-500 text-blue-400"
                                  : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                          Account Label
                        </label>
                        <input
                          type="text"
                          value={qcForm.label}
                          onChange={(e) => setQcForm((f) => ({ ...f, label: e.target.value }))}
                          placeholder="e.g. Main Live"
                          className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                     text-sm text-zinc-100 placeholder-zinc-600
                                     focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {connectError && (
                    <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                      {connectError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={connecting}
                    className="btn-gold w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connecting ? "Connecting…" : "Connect Account →"}
                  </button>
                </form>
              </>
            )}

            {/* 5b — CSV import prompt (after connecting) */}
            {connectedSig && !importResult && (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30
                                  flex items-center justify-center text-xl shrink-0">
                    ✓
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">Account connected!</p>
                    <p className="text-xs text-zinc-500">Your trades will sync automatically going forward.</p>
                  </div>
                </div>

                <p className="text-[11px] uppercase tracking-widest text-blue-500/70 font-medium mb-2">
                  Optional · Import History
                </p>
                <h2 className="text-lg font-bold mb-1">Import past trade history</h2>
                <p className="text-sm text-zinc-500 mb-5">
                  Upload your MT5 statement CSV to backfill your journal with past trades.
                </p>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4
                    ${importFile
                      ? "border-[var(--cj-gold-muted)] bg-[var(--cj-gold-glow)]"
                      : "border-zinc-700 hover:border-zinc-500 bg-[var(--cj-raised)]"
                    }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.xml,.htm,.html,.csv,.txt"
                    className="hidden"
                    onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportError(null); }}
                  />
                  {importFile ? (
                    <p className="text-sm text-[var(--cj-gold)] font-medium">{importFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-zinc-400 font-medium">Click to select export file</p>
                      <p className="text-xs text-zinc-600 mt-1">MT5 → History tab → right-click → Report → Open XML (MS Office Excel 2007)</p>
                    </>
                  )}
                </div>

                {importError && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    {importError}
                  </div>
                )}

                {importFile && (
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={importing}
                    className="btn-gold w-full py-3 rounded-xl text-sm font-bold mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? "Importing…" : "Import Trade History →"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={finish}
                  className="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                             hover:border-zinc-500 hover:text-zinc-200 transition-all"
                >
                  Do this later
                </button>
              </>
            )}

            {/* 5c — Import success */}
            {connectedSig && importResult && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30
                                flex items-center justify-center text-3xl mx-auto mb-5">
                  🎉
                </div>
                <h2 className="text-xl font-bold mb-2">All done!</h2>
                <p className="text-sm text-zinc-400 mb-2">
                  Imported <span className="text-emerald-400 font-semibold">{importResult.imported}</span> trades
                  {importResult.skipped > 0 && (
                    <> · <span className="text-zinc-500">{importResult.skipped} skipped</span></>
                  )}
                </p>
                <p className="text-sm text-zinc-500 mb-7">Your journal is ready to use.</p>
                <button
                  type="button"
                  onClick={finish}
                  className="btn-gold px-8 py-3 rounded-xl text-sm font-bold"
                >
                  Start Journalling →
                </button>
              </div>
            )}
          </>
        )}

        {/* Error (steps 1–4) */}
        {error && step < 5 && (
          <div className="mt-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30
                          text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Navigation (steps 1–4 only) */}
        {step < 5 && (
          <div className={`mt-7 flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => { setError(null); setStep((s) => s - 1); }}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                           hover:border-zinc-500 hover:text-zinc-200 transition-all"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={saving}
              className="btn-gold px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : step === 4 ? "Next →" : "Next →"}
            </button>
          </div>
        )}

        {/* Back button on step 5 (only before connecting) */}
        {step === 5 && !connectedSig && (
          <div className="mt-5 flex justify-start">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                         hover:border-zinc-500 hover:text-zinc-200 transition-all"
            >
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* Skip link */}
      {step < 4 && (
        <button
          type="button"
          onClick={skip}
          className="mt-5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Skip setup for now
        </button>
      )}

      {/* Skip for now on step 5 (before connecting) */}
      {step === 5 && !connectedSig && (
        <button
          type="button"
          onClick={finish}
          className="mt-5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
