"use client";

import { useState, useEffect } from "react";
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

// ─── Constants ────────────────────────────────────────────────────────────────
const BROKERS = ["ICMarkets", "Exness", "HFM", "FBS", "OctaFX", "XM", "Deriv", "Other"];
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
  const [user,   setUser]   = useState<User | null>(null);
  const [step,   setStep]   = useState(1);
  const [data,   setData]   = useState<OnboardingData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── Auth check + resume partial progress ─────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const { data: raw } = await supabase
        .from("user_profiles")
        .select(
          "onboarding_completed, name, broker, account_size, preferred_pairs, " +
          "experience_level, trading_style, preferred_sessions, monthly_target"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      const profile = raw as ProfileRow | null;

      if (profile?.onboarding_completed) { window.location.href = "/"; return; }

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
        if (data.preferred_pairs.length === 0)  { setError("Select at least one pair.");           return; }
        if (!data.experience_level)             { setError("Select your experience level.");        return; }
        if (!data.trading_style)                { setError("Select your trading style.");           return; }
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
        await upsert({ onboarding_completed: true });
        window.location.href = "/";
        return;
      }

      setStep((s) => s + 1);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    await upsert({ onboarding_completed: true });
    window.location.href = "/";
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans
                    flex flex-col items-center justify-center px-4 py-10">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600
                        flex items-center justify-center text-base font-bold text-white">
          CJ
        </div>
        <span className="font-bold text-xl tracking-tight">CandlesJournal</span>
      </div>

      {/* Step dots */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
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
              Step 1 of 4 · Welcome
            </p>
            <h2 className="text-2xl font-bold mb-1">Welcome to CandlesJournal</h2>
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
              Step 3 of 4 · Sessions &amp; Goals
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
                  body: "Go to Settings to connect your MT5 EA and sync trades automatically.",
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

        {/* Error */}
        {error && (
          <div className="mt-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30
                          text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Navigation */}
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
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${step === 4
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-blue-600 hover:bg-blue-500 text-white"
                        }`}
          >
            {saving ? "Saving..." : step === 4 ? "Start Journalling →" : "Next →"}
          </button>
        </div>
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
    </div>
  );
}
