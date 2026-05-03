"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

const PAIRS = [
  "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD",
  "AUDUSD","NZDUSD","EURGBP","EURJPY","GBPJPY",
  "XAUUSD","XAGUSD","US30","NAS100","SPX500","BTCUSD",
] as const;
type Pair = typeof PAIRS[number];

const CURRENCIES = ["USD","EUR","GBP","NGN"] as const;

const PIP_VALUES: Record<Pair, number> = {
  EURUSD: 10, GBPUSD: 10, AUDUSD: 10, NZDUSD: 10,
  EURGBP: 10, EURJPY: 10, GBPJPY: 10,
  USDJPY: 9.09,
  USDCHF: 10, USDCAD: 10,
  XAUUSD: 10,
  XAGUSD: 50,
  US30: 1, NAS100: 1, SPX500: 1,
  BTCUSD: 1,
};

// For indices/crypto, units = lots (no × 100k)
const IS_NON_FOREX: Record<Pair, boolean> = {
  EURUSD: false, GBPUSD: false, USDJPY: false, USDCHF: false, USDCAD: false,
  AUDUSD: false, NZDUSD: false, EURGBP: false, EURJPY: false, GBPJPY: false,
  XAUUSD: false,
  XAGUSD: false,
  US30: true, NAS100: true, SPX500: true, BTCUSD: true,
};

const DEFAULTS = {
  balance: 10000,
  riskPct: 1,
  slPips: 20,
  pair: "XAUUSD" as Pair,
  currency: "USD",
};

function inputCls() {
  return "w-full bg-[var(--cj-raised)] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors";
}

function labelCls() {
  return "text-[11px] uppercase tracking-widest text-zinc-500 font-medium block mb-1.5";
}

export default function CalculatorPage() {
  const [user, setUser] = useState<User | null>(null);

  const [balance,   setBalance]   = useState(DEFAULTS.balance);
  const [riskPct,   setRiskPct]   = useState(DEFAULTS.riskPct);
  const [slPips,    setSlPips]    = useState(DEFAULTS.slPips);
  const [pair,      setPair]      = useState<Pair>(DEFAULTS.pair);
  const [currency,  setCurrency]  = useState(DEFAULTS.currency);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);
    }
    init();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function resetToDefaults() {
    setBalance(DEFAULTS.balance);
    setRiskPct(DEFAULTS.riskPct);
    setSlPips(DEFAULTS.slPips);
    setPair(DEFAULTS.pair);
    setCurrency(DEFAULTS.currency);
  }

  // ── Calculations ──────────────────────────────────────────────
  const dollarRisk     = balance * (riskPct / 100);
  const pipValue       = PIP_VALUES[pair] ?? 10;
  const positionSize   = slPips > 0 ? dollarRisk / (slPips * pipValue) : 0;
  const units          = IS_NON_FOREX[pair] ? positionSize : positionSize * 100000;
  const requiredMargin = IS_NON_FOREX[pair]
    ? positionSize * 100
    : (positionSize * 100000 * 1.0) / 100;

  // ── Risk colour coding ─────────────────────────────────────────
  const riskColor =
    riskPct <= 1 ? "emerald" : riskPct <= 2 ? "gold" : "rose";

  const riskColorMap = {
    emerald: { bar: "#34d399", card: "border-emerald-500/30 bg-emerald-500/5", label: "text-emerald-400" },
    gold:    { bar: "#F5C518", card: "border-[var(--cj-gold)]/30 bg-[var(--cj-gold-glow)]", label: "text-[var(--cj-gold)]" },
    rose:    { bar: "#f87171", card: "border-rose-500/30 bg-rose-500/5", label: "text-rose-400" },
  };
  const rc = riskColorMap[riskColor];

  const riskLabel =
    riskPct <= 1 ? "Conservative (≤1%)" :
    riskPct <= 2 ? "Normal (1–2%)" :
    "Aggressive (>2%)";

  const riskBarPct = Math.min((riskPct / 5) * 100, 100);

  const fmt = (n: number, dp = 2) =>
    isFinite(n) ? n.toFixed(dp) : "—";

  const resultCards = [
    {
      label: "Position Size",
      value: fmt(positionSize, 2) + " lots",
      sub:   `${fmt(units, 0)} units`,
    },
    {
      label: "Dollar Risk",
      value: "$" + fmt(dollarRisk, 2),
      sub:   `${riskPct.toFixed(1)}% of balance`,
    },
    {
      label: "Pip Value",
      value: "$" + pipValue.toFixed(2) + " / pip",
      sub:   `${slPips} pip SL`,
    },
    {
      label: "Required Margin",
      value: "$" + fmt(requiredMargin, 2),
      sub:   "at 1:100 leverage",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleSignOut} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Position Calculator</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Calculate your lot size before entering a trade</p>
            </div>
            <button
              onClick={resetToDefaults}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-zinc-700
                         text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
              Reset
            </button>
          </div>

          {/* ── Inputs panel ───────────────────────────────────── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
            <p className={labelCls()}>Trade Parameters</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Account Balance */}
              <div>
                <label className={labelCls()}>Account Balance</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                    {currency === "NGN" ? "₦" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={balance}
                    onChange={(e) => setBalance(Math.max(1, Number(e.target.value)))}
                    className={inputCls() + " pl-8"}
                  />
                </div>
              </div>

              {/* Risk % */}
              <div>
                <label className={labelCls()}>Risk %</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={riskPct}
                    onChange={(e) => setRiskPct(Math.min(5, Math.max(0.1, Number(e.target.value))))}
                    className={inputCls() + " pr-8"}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                </div>
              </div>

              {/* Stop Loss Pips */}
              <div>
                <label className={labelCls()}>Stop Loss Pips</label>
                <input
                  type="number"
                  min={1}
                  value={slPips}
                  onChange={(e) => setSlPips(Math.max(1, Number(e.target.value)))}
                  className={inputCls()}
                />
              </div>

              {/* Account Currency */}
              <div>
                <label className={labelCls()}>Account Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={inputCls() + " cursor-pointer"}>
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Currency Pair */}
              <div className="sm:col-span-2">
                <label className={labelCls()}>Currency Pair / Instrument</label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value as Pair)}
                  className={inputCls() + " cursor-pointer"}>
                  {PAIRS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Risk bar ───────────────────────────────────────── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl px-6 py-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className={labelCls() + " mb-0"}>Risk Level</p>
              <span className={`text-[11px] font-semibold ${rc.label}`}>{riskLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${riskBarPct}%`, background: rc.bar }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-zinc-600">0%</span>
              <span className="text-[10px] text-zinc-600">5%</span>
            </div>
          </div>

          {/* ── Result cards 2×2 ───────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {resultCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl border p-4 sm:p-5 ${rc.card}`}>
                <p className={labelCls() + " mb-1"}>{card.label}</p>
                <p className={`text-xl font-bold font-mono ${rc.label}`}>{card.value}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Pip value reference ────────────────────────────── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
            <p className={labelCls()}>Pip Value Reference</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
              {PAIRS.map(p => (
                <div key={p} className="flex justify-between gap-2">
                  <span className={`font-mono ${p === pair ? "text-[var(--cj-gold)] font-bold" : "text-zinc-500"}`}>{p}</span>
                  <span className={p === pair ? "text-zinc-200" : "text-zinc-600"}>${PIP_VALUES[p]}/pip</span>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
