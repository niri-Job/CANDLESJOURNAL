"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Setup {
  pair: string;
  direction: "BUY" | "SELL";
  setup_type: string;
  entry_zone: string;
  stop_loss: string;
  take_profit: string;
  confluence: string[];
  confidence: number;
  expected_move: string;
  risk_warning: string | null;
}

interface MarketOverview {
  bias: string;
  events: string[];
  pairs_to_watch: string[];
  pairs_to_avoid: string[];
}

// live_prices is now a flat { pair: price } map from the server
type LivePrices = Record<string, number>;

interface IntelligenceData {
  setups: Setup[];
  overview: MarketOverview;
  generated_at: string;
  live_prices?: LivePrices;
  price_changes?: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceColor(n: number): string {
  if (n >= 8) return "#34d399"; // emerald
  if (n >= 5) return "#F5C518"; // gold
  return "#f87171";             // rose
}

function confidenceBg(n: number): string {
  if (n >= 8) return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
  if (n >= 5) return "bg-[var(--cj-gold-glow)] border-[var(--cj-gold)]/30 text-[var(--cj-gold)]";
  return "bg-rose-500/10 border-rose-500/30 text-rose-400";
}

function Spinner() {
  return (
    <span
      className="w-5 h-5 border-2 border-zinc-700 border-t-[var(--cj-gold)] rounded-full animate-spin inline-block"
      aria-hidden
    />
  );
}

// ── Setup Card ────────────────────────────────────────────────────────────────

function SetupCard({ s }: { s: Setup }) {
  const isBuy = s.direction === "BUY";
  const confColor = confidenceColor(s.confidence);
  const confBadge = confidenceBg(s.confidence);

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold font-mono text-zinc-100">{s.pair}</p>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mt-0.5">
            {s.setup_type}
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border shrink-0 ${
          isBuy
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-rose-500/10 border-rose-500/30 text-rose-400"
        }`}>
          {s.direction}
        </span>
      </div>

      {/* Entry / SL / TP grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Entry Zone", value: s.entry_zone },
          { label: "Stop Loss",  value: s.stop_loss  },
          { label: "Take Profit",value: s.take_profit },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--cj-raised)] rounded-xl p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">{label}</p>
            <p className="text-xs font-semibold font-mono text-zinc-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Confluence */}
      {s.confluence.length > 0 && (
        <ul className="space-y-1">
          {s.confluence.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
              <span className="shrink-0 mt-0.5 w-1 h-1 rounded-full bg-zinc-600 translate-y-1" />
              {c}
            </li>
          ))}
        </ul>
      )}

      {/* Confidence bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Confidence</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${confBadge}`}>
            {s.confidence}/10
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(s.confidence / 10) * 100}%`, background: confColor }}
          />
        </div>
      </div>

      {/* Expected move */}
      <p className="text-xs text-zinc-400">{s.expected_move}</p>

      {/* Risk warning */}
      {s.risk_warning && (
        <div className="rounded-xl px-3 py-2 bg-amber-500/8 border border-amber-500/20">
          <p className="text-xs text-amber-400">{s.risk_warning}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [user,         setUser]         = useState<User | null>(null);
  const [analysis,     setAnalysis]     = useState<IntelligenceData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [trialBlock,   setTrialBlock]   = useState<{ reason: "expired" | "limit_reached"; message: string } | null>(null);

  async function fetchAnalysis(bust = false) {
    setLoading(true);
    setError(null);
    try {
      const url = bust ? `/api/intelligence?t=${Date.now()}` : "/api/intelligence";
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; trial_reason?: string };
        if (res.status === 403 && (body.trial_reason === "expired" || body.trial_reason === "limit_reached")) {
          setTrialBlock({ reason: body.trial_reason, message: body.error ?? "Trial limit reached." });
          return;
        }
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json() as IntelligenceData;
      setAnalysis(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);
      await fetchAnalysis(false);
    }
    init();

    const analysisInterval = setInterval(() => fetchAnalysis(false), 15 * 60 * 1000);
    return () => clearInterval(analysisInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ── Render helpers ─────────────────────────────────────────────
  function fmtTs(d: Date) {
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleSignOut} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

          {/* ── Header ───────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Market Intelligence</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                AI-powered analysis for 10 pairs, auto-refreshed every 15 minutes
              </p>
              {lastUpdated && !loading && (
                <p className="text-[11px] text-zinc-600 mt-1">
                  Last updated: {fmtTs(lastUpdated)}
                </p>
              )}
              {analysis?.live_prices && !loading && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    Live
                  </span>

                  {/* GOLD / USD — highlighted tile */}
                  {(() => {
                    const price  = analysis.live_prices?.["XAUUSD"];
                    const change = analysis.price_changes?.["XAUUSD"];
                    if (!price) return null;
                    const isUp = change !== undefined ? change >= 0 : null;
                    return (
                      <span
                        key="XAUUSD"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold"
                        style={{
                          background: "rgba(245,197,24,0.08)",
                          border: "1px solid rgba(245,197,24,0.22)",
                        }}
                      >
                        <span style={{ color: "var(--cj-gold)" }}>GOLD / USD</span>
                        <span style={{ color: "var(--cj-gold)" }}>{price.toFixed(2)}</span>
                        {change !== undefined && isUp !== null && (
                          <span style={{ color: isUp ? "#34d399" : "#f87171", fontSize: "0.625rem" }}>
                            {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                          </span>
                        )}
                      </span>
                    );
                  })()}

                  {/* Other pairs — compact inline */}
                  {["EURUSD","GBPUSD","BTCUSD"].map((key) => {
                    const val = analysis.live_prices?.[key];
                    if (!val) return null;
                    const dp = key === "BTCUSD" ? 0 : 5;
                    const change = analysis.price_changes?.[key];
                    const isUp = change !== undefined ? change >= 0 : null;
                    const label = key === "BTCUSD" ? "BTC" : key.replace("USD", "");
                    return (
                      <span key={key} className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                        <span className="text-zinc-700">·</span>
                        <span className="text-zinc-500">{label}</span>
                        <span className="text-zinc-400">
                          {dp === 0
                            ? val.toLocaleString("en-US", { maximumFractionDigits: 0 })
                            : val.toFixed(dp)}
                        </span>
                        {change !== undefined && isUp !== null && (
                          <span style={{ color: isUp ? "#34d399" : "#f87171", fontSize: "0.5rem" }}>
                            {isUp ? "▲" : "▼"}{Math.abs(change).toFixed(2)}%
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => fetchAnalysis(true)}
              disabled={loading}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                         disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
              {loading ? <Spinner /> : null}
              {loading ? "Analysing…" : "Refresh Analysis"}
            </button>
          </div>

          {/* ── Trial block (non-dismissable) ───────────────────── */}
          {trialBlock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="relative mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-[var(--cj-surface)] p-8 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h2 className="mb-2 text-lg font-bold text-zinc-100">
                  {trialBlock.reason === "expired" ? "Your free trial has ended" : "Trial limit reached"}
                </h2>
                <p className="mb-6 text-sm text-zinc-400">{trialBlock.message}</p>
                <div className="mb-4 grid grid-cols-2 gap-2 text-left">
                  {[
                    "AI Trade Analysis",
                    "Market Intelligence",
                    "Psychology Reports",
                    "Unlimited MT5 Accounts",
                    "Full Trade History",
                    "Priority Support",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className="text-[var(--cj-gold)]">✓</span> {f}
                    </div>
                  ))}
                </div>
                <a
                  href="/pricing"
                  className="block w-full rounded-xl py-3 text-sm font-bold text-[#0A0A0F] transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                  Upgrade to Pro — ₦15,000/month
                </a>
              </div>
            </div>
          )}

          {/* ── Loading ──────────────────────────────────────────── */}
          {loading && !analysis && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Spinner />
              <p className="text-sm text-zinc-500">Analysing market conditions…</p>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────── */}
          {error && !loading && (
            <div className="bg-[var(--cj-surface)] border border-rose-500/20 rounded-2xl p-8 text-center">
              <p className="text-sm text-rose-400 mb-4">{error}</p>
              <button
                onClick={() => fetchAnalysis(true)}
                className="text-xs font-semibold px-4 py-2 rounded-lg border border-zinc-700
                           text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors">
                Retry
              </button>
            </div>
          )}

          {/* ── Data ─────────────────────────────────────────────── */}
          {analysis && !loading && (
            <>
              {/* Setup cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                {analysis.setups.map((s, i) => (
                  <SetupCard key={`${s.pair}-${i}`} s={s} />
                ))}
              </div>

              {/* Market Overview */}
              <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                    Market Overview
                  </p>
                  <span className="text-[11px] font-bold px-3 py-0.5 rounded-full border
                                   bg-[var(--cj-gold-glow)] border-[var(--cj-gold)]/30 text-[var(--cj-gold)]">
                    {analysis.overview.bias}
                  </span>
                </div>

                {/* Events */}
                {analysis.overview.events.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Events Today</p>
                    <ul className="space-y-1.5">
                      {analysis.overview.events.map((ev, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                          <span className="shrink-0 w-1 h-1 rounded-full bg-amber-500 translate-y-1.5" />
                          {ev}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Pairs to watch / avoid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Pairs to Watch</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.overview.pairs_to_watch.map((p) => (
                        <span key={p} className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg
                                                  bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Pairs to Avoid</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.overview.pairs_to_avoid.map((p) => (
                        <span key={p} className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg
                                                  bg-rose-500/10 border border-rose-500/20 text-rose-400">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Disclaimer footer ────────────────────────────────── */}
          <div
            className="mt-10 rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{
              background: "rgba(245,197,24,0.04)",
              border: "1px solid rgba(245,197,24,0.15)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F5C518"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-xs text-zinc-500 leading-relaxed">
              These setups are for educational purposes only and do not constitute financial advice.
              Trade at your own risk.{" "}
              <a href="/terms-of-service" className="text-zinc-400 underline hover:text-zinc-300 transition-colors">
                Terms of Service
              </a>
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
