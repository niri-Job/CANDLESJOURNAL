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

interface EaForm {
  accountNumber: string;
  brokerServer:  string;
  label:         string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BROKERS        = ["ICMarkets", "HFM", "FBS", "OctaFX", "XM", "Deriv", "Other"];
const ACCOUNT_SIZES  = ["Under $100", "$100–$500", "$500–$2,000", "$2,000+"];
const PAIRS          = [
  "EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "GBPJPY", "USDCHF",
  "USDCAD", "AUDUSD", "NZDUSD", "EURCAD", "EURGBP", "USDNOK",
  "US30", "NAS100", "BTCUSD",
];
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"];
const TRADING_STYLES    = ["Scalping", "Day Trading", "Swing Trading"];
const SESSIONS          = ["London", "New York", "Asian", "Overlap (London/NY)"];

const EMPTY: OnboardingData = {
  name: "", broker: "", account_size: "", preferred_pairs: [],
  experience_level: "", trading_style: "", preferred_sessions: [], monthly_target: "",
};
const EMPTY_EA: EaForm = { accountNumber: "", brokerServer: "", label: "" };

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

// ─── Small components ─────────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all
        ${active
          ? "bg-blue-500/15 border-blue-500 text-blue-400"
          : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}>
      {label}
    </button>
  );
}

// ─── Field input style shared ─────────────────────────────────────────────────
const fieldCls =
  "w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5 " +
  "text-sm text-zinc-100 placeholder-zinc-600 " +
  "focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors";

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [user,   setUser]   = useState<User | null>(null);
  const [step,   setStep]   = useState(1);
  const [data,   setData]   = useState<OnboardingData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Step 3 — EA setup
  const [eaForm,        setEaForm]        = useState<EaForm>(EMPTY_EA);
  const [generating,    setGenerating]    = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [eaToken,       setEaToken]       = useState<{ token: string; account_number: string; broker_server: string } | null>(null);
  // "setup" → show form; "download" → show download + instructions; "import" → csv sub-step
  const [s3Phase, setS3Phase] = useState<"setup" | "download" | "import">("setup");

  // Step 3 import sub-step
  const [importFile,   setImportFile]   = useState<File | null>(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connectedSig, setConnectedSig] = useState<string | null>(null);

  // ── Auth check + redirect existing users ──────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const [profileRes, countRes] = await Promise.all([
        supabase.from("user_profiles")
          .select(
            "onboarding_completed, name, broker, account_size, preferred_pairs, " +
            "experience_level, trading_style, preferred_sessions, monthly_target"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      const profile   = profileRes.data as ProfileRow | null;
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

  // ── Helpers ───────────────────────────────────────────────────────────────
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
    window.location.href = "/dashboard";
  }

  // ── Step navigation (steps 1–2 only) ─────────────────────────────────────
  async function next() {
    setError(null);
    setSaving(true);
    try {
      if (step === 1) {
        if (!data.name.trim())   { setError("Please enter your name.");          return; }
        if (!data.broker)        { setError("Please select your broker.");       return; }
        if (!data.account_size)  { setError("Please select your account size."); return; }
        await upsert({ name: data.name.trim(), broker: data.broker, account_size: data.account_size });
      } else if (step === 2) {
        if (data.preferred_pairs.length === 0) { setError("Select at least one pair.");     return; }
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

  // ── EA Token Generation ──────────────────────────────────────────────────
  async function handleGenerateEa(e: React.FormEvent) {
    e.preventDefault();
    setGenerateError(null);
    if (!eaForm.accountNumber.trim() || !eaForm.brokerServer.trim()) {
      setGenerateError("Please enter your MT5 account number and broker server.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/mt5/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number: eaForm.accountNumber.trim(),
          broker_server:  eaForm.brokerServer.trim(),
          label:          eaForm.label.trim() || undefined,
        }),
      });
      const json = await res.json() as {
        success?: boolean; error?: string;
        token?: string; account_number?: string; broker_server?: string; account_signature?: string;
      };
      if (!res.ok) {
        setGenerateError(json.error ?? "Failed to generate EA. Please try again.");
      } else {
        setEaToken({ token: json.token!, account_number: json.account_number!, broker_server: json.broker_server! });
        setConnectedSig(json.account_signature ?? null);
        setS3Phase("download");
      }
    } catch {
      setGenerateError("Network error — check your connection.");
    } finally {
      setGenerating(false);
    }
  }

  // ── CSV import ────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!importFile || !connectedSig) return;
    setImporting(true);
    setImportError(null);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("account_signature", connectedSig);
    try {
      const res = await fetch("/api/accounts/import-history", { method: "POST", body: fd });
      const json = await res.json() as { imported?: number; skipped?: number; error?: string };
      if (!res.ok) {
        setImportError(json.error ?? "Import failed. Please try again.");
      } else {
        setImportResult({ imported: json.imported ?? 0, skipped: json.skipped ?? 0 });
      }
    } catch {
      setImportError("Network error — check your connection.");
    } finally {
      setImporting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans
                    flex flex-col items-center justify-center px-4 py-10">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5C518] to-[#C9A227]
                        flex items-center justify-center text-base font-bold text-[#0A0A0F]"
             style={{ boxShadow: "0 0 20px rgba(245,197,24,0.28)" }}>
          NI
        </div>
        <span className="font-bold text-xl tracking-tight text-zinc-100">NIRI</span>
      </div>

      {/* Step dots — 4 steps */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 rounded-full transition-all duration-300
            ${s === step       ? "w-8 bg-[var(--cj-gold)]"
            : s < step         ? "w-4 bg-[var(--cj-gold)]/40"
            :                    "w-4 bg-zinc-700"}`}
          />
        ))}
      </div>

      {/* ── Card ── */}
      <div className="w-full max-w-md bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7">

        {/* ════════════════════════════════ STEP 1 ═══════════════════════════════ */}
        {step === 1 && (
          <>
            <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
              Step 1 of 4 · Welcome
            </p>
            <h2 className="text-2xl font-bold mb-1">Welcome to NIRI</h2>
            <p className="text-sm text-zinc-500 mb-7">
              Your AI-powered trading journal. Let&apos;s set up your profile — takes 2 minutes.
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

        {/* ════════════════════════════════ STEP 2 ═══════════════════════════════ */}
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

        {/* ════════════════════════════════ STEP 3 ═══════════════════════════════ */}
        {step === 3 && (
          <>
            {/* ── 3a: EA Setup form ── */}
            {s3Phase === "setup" && (
              <>
                <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
                  Step 3 of 4 · Connect MT5
                </p>
                <h2 className="text-xl font-bold mb-1">Connect Your MT5</h2>
                <p className="text-sm text-zinc-500 mb-6">
                  We&apos;ll generate a personalised EA file — install it in MT5 and trades sync automatically.
                </p>

                <form onSubmit={handleGenerateEa} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5 font-medium">
                      MT5 Account Number
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={eaForm.accountNumber}
                      onChange={(e) => setEaForm((f) => ({ ...f, accountNumber: e.target.value }))}
                      placeholder="e.g. 12345678"
                      className={fieldCls}
                      autoFocus
                    />
                    <p className="mt-1 text-[11px] text-zinc-600">
                      Shown in MT5 top-left corner next to your broker name
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5 font-medium">
                      Broker Server
                    </label>
                    <input
                      type="text"
                      value={eaForm.brokerServer}
                      onChange={(e) => setEaForm((f) => ({ ...f, brokerServer: e.target.value }))}
                      placeholder="e.g. ICMarkets-Live, Exness-MT5Real9"
                      className={fieldCls}
                    />
                    <p className="mt-1 text-[11px] text-zinc-600">
                      Find in MT5 → File → Open an Account → your broker&apos;s server list
                    </p>
                  </div>

                  {generateError && (
                    <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                      {generateError}
                    </div>
                  )}

                  <button type="submit" disabled={generating}
                    className="btn-gold w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                    {generating ? "Generating your EA…" : "Generate My EA →"}
                  </button>
                </form>
              </>
            )}

            {/* ── 3b: Download + instructions ── */}
            {s3Phase === "download" && eaToken && (
              <>
                <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
                  Step 3 of 4 · Install EA
                </p>
                <h2 className="text-xl font-bold mb-1">Your EA is ready</h2>
                <p className="text-sm text-zinc-500 mb-5">
                  Download both files and follow the steps below to start syncing.
                </p>

                {/* Download buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <a href="/NIRI_EA.ex5" download="NIRI_EA.ex5"
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--cj-gold-muted)]/40
                               bg-[var(--cj-gold-glow)] hover:bg-[var(--cj-gold)]/10 transition-all text-center">
                    <span className="text-2xl">📦</span>
                    <span className="text-xs font-bold text-[var(--cj-gold)]">NIRI_EA.ex5</span>
                    <span className="text-[10px] text-zinc-500">Compiled EA — ready to use</span>
                  </a>
                  <a href="/api/mt5/download/settings" download="NIRI_settings.set"
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-700
                               bg-[var(--cj-raised)] hover:border-zinc-500 transition-all text-center">
                    <span className="text-2xl">⚙️</span>
                    <span className="text-xs font-bold text-zinc-200">NIRI_settings.set</span>
                    <span className="text-[10px] text-zinc-500">Your personal settings</span>
                  </a>
                </div>

                {/* Installation steps */}
                <div className="space-y-3 mb-6">
                  {[
                    { n: 1, text: "Download NIRI_EA.ex5 and your Settings file using the buttons above" },
                    { n: 2, text: "Open MT5 → File → Open Data Folder → MQL5 → Experts → paste NIRI_EA.ex5 there" },
                    { n: 3, text: "Tools → Options → Expert Advisors → tick \"Allow WebRequest for listed URL\" → add https://niri.live" },
                    { n: 4, text: "Restart MT5, then find NIRI_EA in the Navigator panel (Ctrl+N)" },
                    { n: 5, text: "Drag NIRI_EA onto any chart → Inputs tab → Load → select your downloaded settings file → OK" },
                    { n: 6, text: "Make sure \"Allow live trading\" is checked → OK. Trades sync within 60 seconds." },
                  ].map(({ n, text }) => (
                    <div key={n} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                            style={{ background: "rgba(245,197,24,0.12)", color: "var(--cj-gold)", border: "1px solid rgba(245,197,24,0.2)" }}>
                        {n}
                      </span>
                      <p className="text-xs text-zinc-400 leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-3 rounded-xl border mb-5"
                     style={{ background: "rgba(16,185,129,0.07)", borderColor: "rgba(16,185,129,0.2)" }}>
                  <p className="text-xs text-emerald-400 font-semibold mb-0.5">
                    Your trades will sync automatically within 60 seconds of closing
                  </p>
                  <p className="text-[11px] text-emerald-400/60">
                    The EA checks for closed trades every 5 seconds and pushes them to your journal instantly.
                  </p>
                </div>

                <button type="button" onClick={() => setS3Phase("import")}
                  className="btn-gold w-full py-3 rounded-xl text-sm font-bold mb-2">
                  Continue →
                </button>
                <button type="button" onClick={() => setStep(4)}
                  className="w-full py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Skip history import
                </button>
              </>
            )}

            {/* ── 3c: Import sub-step (optional) ── */}
            {s3Phase === "import" && !importResult && (
              <>
                <p className="text-[11px] uppercase tracking-widest text-[var(--cj-gold-muted)] font-medium mb-2">
                  Optional · Import History
                </p>
                <h2 className="text-lg font-bold mb-1">Import your full trade history</h2>
                <p className="text-sm text-zinc-500 mb-5">
                  Upload your MT5 history export to populate your stats from day one.
                </p>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4
                    ${importFile
                      ? "border-[var(--cj-gold-muted)] bg-[var(--cj-gold-glow)]"
                      : "border-zinc-700 hover:border-zinc-500 bg-[var(--cj-raised)]"
                    }`}
                >
                  <input ref={fileInputRef} type="file"
                    accept=".xlsx,.xls,.xml,.htm,.html,.csv,.txt"
                    className="hidden"
                    onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportError(null); }}
                  />
                  {importFile ? (
                    <p className="text-sm text-[var(--cj-gold)] font-medium">{importFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-zinc-400 font-medium">Click to select your MT5 history export</p>
                      <p className="text-xs text-zinc-600 mt-1">
                        MT5 → History tab → right-click → Report → Open XML (MS Office Excel 2007)
                      </p>
                    </>
                  )}
                </div>

                {importError && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    {importError}
                  </div>
                )}

                {connectedSig && importFile && (
                  <button type="button" onClick={handleImport} disabled={importing}
                    className="btn-gold w-full py-3 rounded-xl text-sm font-bold mb-3 disabled:opacity-50 disabled:cursor-not-allowed">
                    {importing ? "Importing…" : "Import Trade History →"}
                  </button>
                )}

                <button type="button" onClick={() => setStep(4)}
                  className="w-full py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Skip — I&apos;ll import later
                </button>
              </>
            )}

            {/* ── 3d: Import success ── */}
            {s3Phase === "import" && importResult && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30
                                flex items-center justify-center text-3xl mx-auto mb-5">
                  🎉
                </div>
                <h2 className="text-xl font-bold mb-2">History imported!</h2>
                <p className="text-sm text-zinc-400 mb-2">
                  <span className="text-emerald-400 font-semibold">{importResult.imported}</span> trades imported
                  {importResult.skipped > 0 && (
                    <> · <span className="text-zinc-500">{importResult.skipped} skipped</span></>
                  )}
                </p>
                <p className="text-sm text-zinc-500 mb-7">Your full trade history is ready.</p>
                <button type="button" onClick={() => setStep(4)}
                  className="btn-gold px-8 py-3 rounded-xl text-sm font-bold">
                  Continue →
                </button>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════ STEP 4 ═══════════════════════════════ */}
        {step === 4 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5C518]/20 to-[#C9A227]/10
                            border border-[var(--cj-gold-muted)]/30 flex items-center justify-center
                            text-3xl mx-auto mb-5">
              🎯
            </div>
            <h2 className="text-2xl font-bold mb-2">
              You&apos;re all set{data.name ? `, ${data.name}` : ""}!
            </h2>
            <p className="text-sm text-zinc-500 mb-7">
              Your journal is configured and ready to use.
            </p>

            <div className="space-y-3 text-left mb-7">
              {[
                { icon: "📈", title: "View your dashboard", body: "See your equity curve, win rate, and performance stats at a glance." },
                { icon: "📝", title: "Log a trade", body: "Add trades manually or let NIRI sync them automatically from MT5." },
                { icon: "🤖", title: "Get AI coaching", body: "After a few trades, get personalised feedback from your AI coach." },
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

            {/* Profile tags */}
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
              Start Journalling →
            </button>
          </div>
        )}

        {/* ── Validation errors (steps 1–2) ── */}
        {error && step <= 2 && (
          <div className="mt-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Navigation (steps 1–2 only) ── */}
        {step <= 2 && (
          <div className={`mt-7 flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
            {step > 1 && (
              <button type="button" onClick={() => { setError(null); setStep((s) => s - 1); }}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                           hover:border-zinc-500 hover:text-zinc-200 transition-all">
                ← Back
              </button>
            )}
            <button type="button" onClick={next} disabled={saving}
              className="btn-gold px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Saving…" : "Next →"}
            </button>
          </div>
        )}

        {/* ── Back button on step 3 setup phase ── */}
        {step === 3 && s3Phase === "setup" && (
          <div className="mt-5">
            <button type="button" onClick={() => setStep(2)}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                         hover:border-zinc-500 hover:text-zinc-200 transition-all">
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* ── Skip links ── */}
      {/* Steps 1–2: skip entire setup */}
      {step <= 2 && (
        <button type="button" onClick={finish}
          className="mt-5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          Skip setup for now
        </button>
      )}

    </div>
  );
}
