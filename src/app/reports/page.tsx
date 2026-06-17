"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { Sidebar } from "@/components/Sidebar";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { PremiumEquityCurve } from "@/components/EquityCurve";
import { PremiumWinRateChart } from "@/components/PremiumWinRateChart";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
interface Trade {
  id: string; pair: string; direction: "BUY" | "SELL";
  lot: number; date: string; entry: number;
  exit_price: number; sl: number | null; tp: number | null;
  pnl: number; notes: string; emotion?: string | null;
  entry_emotion?: string | null; exit_emotion?: string | null;
  mae?: number | null; mfe?: number | null;
  asset_class: string; session: string; setup: string;
  account_signature?: string | null; account_label?: string | null;
  opened_at?: string | null; closed_at?: string | null;
}

interface TradingAccount {
  id: string; account_signature: string; account_label: string | null;
  account_type: string; account_currency: string; current_balance: number | null;
  account_login: string | null; account_server: string | null;
}

const TABS = [
  "OVERVIEW", "PERFORMANCE", "TIME ANALYSIS", "RISK",
  "PSYCHOLOGY", "WINS VS LOSSES", "STREAKS", "COMPARE", "MAE/MFE",
] as const;
type Tab = typeof TABS[number];

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DN = ["Mon","Tue","Wed","Thu","Fri"];
const GOLD = "#F5C518";
const GRN  = "#34d399";
const RED  = "#f87171";

const EMOTION_LABEL: Record<string, string> = {
  revenge: "Revenge", fear: "Fearful", greedy: "Greedy",
  confident: "Confident", bored: "Bored", news: "News", neutral: "Neutral",
  untagged: "Untagged",
};

// ═══════════════════════════════════════════════════════════════
// PURE HELPERS
// ═══════════════════════════════════════════════════════════════
const f$ = (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(2);
const pCls = (v: number) => v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400";
const fmtDur = (m: number) =>
  m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${(m / 60).toFixed(1)}h` : `${(m / 1440).toFixed(1)}d`;

function rangeFor(p: string): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date();
  if (p === "7D")  { d.setDate(d.getDate() - 7);  return { from: d.toISOString().slice(0, 10), to: today }; }
  if (p === "30D") { d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to: today }; }
  if (p === "90D") { d.setDate(d.getDate() - 90); return { from: d.toISOString().slice(0, 10), to: today }; }
  return { from: "", to: "" };
}

function inRange(date: string, from: string, to: string) {
  if (from && date < from) return false;
  if (to   && date > to)   return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// CALCULATIONS
// ═══════════════════════════════════════════════════════════════

function coreStats(trades: Trade[]) {
  const n = trades.length;
  if (!n) return null;
  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const totalPnl   = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin   = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss  = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin     = wins.length   ? grossWin  / wins.length   : 0;
  const avgLoss    = losses.length ? grossLoss / losses.length : 0;
  const pf = grossLoss > 0 ? grossWin / grossLoss : wins.length ? 999 : 0;

  const rrTs = trades.filter(t => t.sl != null && t.tp != null);
  const avgRR = rrTs.length
    ? rrTs.reduce((s, t) => {
        const risk = Math.abs(t.entry - t.sl!);
        return risk > 0 ? s + Math.abs(t.tp! - t.entry) / risk : s;
      }, 0) / rrTs.length
    : avgLoss > 0 ? avgWin / avgLoss : 0;

  const durTs = trades.filter(t => t.opened_at && t.closed_at);
  const avgDurMins = durTs.length
    ? durTs.reduce((s, t) =>
        s + (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 60000, 0
      ) / durTs.length
    : null;

  const totalLots = trades.reduce((s, t) => s + t.lot, 0);
  const pnlArr    = trades.map(t => t.pnl);

  return {
    n, wins: wins.length, losses: losses.length,
    totalPnl, grossWin, grossLoss, winRate: wins.length / n * 100,
    pf, avgWin, avgLoss, avgRR, avgDurMins, totalLots,
    avgLots: totalLots / n,
    best:  Math.max(...pnlArr),
    worst: Math.min(...pnlArr),
    expectancy: (wins.length / n) * avgWin - (losses.length / n) * avgLoss,
  };
}

function equityCurve(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) =>
    (a.opened_at || a.date) < (b.opened_at || b.date) ? -1 : 1);
  let cum = 0;
  return sorted.map(t => { cum += t.pnl; return { label: (t.opened_at || t.date).slice(0, 10), value: +cum.toFixed(2) }; });
}

function monthlyPnl(trades: Trade[]) {
  const map: Record<string, number> = {};
  trades.forEach(t => { const k = t.date.slice(0, 7); map[k] = (map[k] || 0) + t.pnl; });
  return Object.entries(map).sort().map(([k, v]) => ({
    label: MN[+k.slice(5) - 1] + " '" + k.slice(2, 4),
    pnl: +v.toFixed(2),
  }));
}

function pairBreakdown(trades: Trade[]) {
  const map: Record<string, { pnl: number; wins: number; n: number; gw: number; gl: number; best: number; worst: number }> = {};
  trades.forEach(t => {
    if (!map[t.pair]) map[t.pair] = { pnl: 0, wins: 0, n: 0, gw: 0, gl: 0, best: -1e9, worst: 1e9 };
    const m = map[t.pair];
    m.pnl += t.pnl; m.n++;
    if (t.pnl > 0) { m.wins++; m.gw += t.pnl; } else m.gl += Math.abs(t.pnl);
    if (t.pnl > m.best) m.best = t.pnl;
    if (t.pnl < m.worst) m.worst = t.pnl;
  });
  return Object.entries(map).map(([pair, m]) => ({
    pair, trades: m.n,
    winRate:  +(m.wins / m.n * 100).toFixed(1),
    totalPnl: +m.pnl.toFixed(2),
    avgPnl:   +(m.pnl / m.n).toFixed(2),
    best:     +m.best.toFixed(2),
    worst:    +m.worst.toFixed(2),
    pf: m.gl > 0 ? +(m.gw / m.gl).toFixed(2) : m.gw > 0 ? 999 : 0,
  }));
}

function sessionBreakdown(trades: Trade[]) {
  return ["London", "New York", "Asian", "Overlap"].map(s => {
    const ts = trades.filter(t => t.session === s);
    const wins = ts.filter(t => t.pnl > 0).length;
    const pnl  = ts.reduce((a, t) => a + t.pnl, 0);
    return {
      session: s, trades: ts.length,
      winRate: ts.length ? +(wins / ts.length * 100).toFixed(1) : 0,
      pnl: +pnl.toFixed(2),
    };
  });
}

function dayBreakdown(trades: Trade[]) {
  return [1, 2, 3, 4, 5].map(d => {
    const ts = trades.filter(t => {
      const dow = new Date(t.date + "T12:00:00").getDay();
      return dow === d;
    });
    const wins = ts.filter(t => t.pnl > 0).length;
    const pnl  = ts.reduce((a, t) => a + t.pnl, 0);
    return {
      day: DN[d - 1], trades: ts.length,
      winRate: ts.length ? +(wins / ts.length * 100).toFixed(1) : 0,
      pnl: +pnl.toFixed(2),
    };
  });
}

function setupBreakdown(trades: Trade[]) {
  const map: Record<string, { pnl: number; wins: number; n: number }> = {};
  trades.forEach(t => {
    const k = t.setup?.trim() || "Untagged";
    if (!map[k]) map[k] = { pnl: 0, wins: 0, n: 0 };
    map[k].pnl += t.pnl; map[k].n++;
    if (t.pnl > 0) map[k].wins++;
  });
  return Object.entries(map).map(([setup, m]) => ({
    setup, trades: m.n, pnl: +m.pnl.toFixed(2),
    winRate: +(m.wins / m.n * 100).toFixed(1),
    avgPnl: +(m.pnl / m.n).toFixed(2),
  })).sort((a, b) => b.pnl - a.pnl);
}

// ── Setup × Session ──────────────────────────────────────────────
const SESSIONS_LIST = ["London", "New York", "Asian", "Overlap"] as const;

function setupSessionMatrix(trades: Trade[]) {
  const setupSet = new Set<string>();
  trades.forEach(t => setupSet.add(t.setup?.trim() || "Untagged"));
  const setups = [...setupSet].sort();
  const matrix: Record<string, Record<string, { wins: number; n: number }>> = {};
  setups.forEach(s => {
    matrix[s] = {};
    SESSIONS_LIST.forEach(sess => { matrix[s][sess] = { wins: 0, n: 0 }; });
  });
  trades.forEach(t => {
    const setup = t.setup?.trim() || "Untagged";
    if (t.session && matrix[setup]?.[t.session as typeof SESSIONS_LIST[number]]) {
      matrix[setup][t.session].n++;
      if (t.pnl > 0) matrix[setup][t.session].wins++;
    }
  });
  return { setups, matrix };
}

// ── P&L histogram ────────────────────────────────────────────────
const PNL_BUCKETS = [
  { label: "<-$500",      min: -Infinity, max: -500,     positive: false },
  { label: "-$200–-$500", min: -500,      max: -200,     positive: false },
  { label: "-$50–-$200",  min: -200,      max: -50,      positive: false },
  { label: "-$50–$0",     min: -50,       max: 0,        positive: false },
  { label: "$0–$50",      min: 0,         max: 50,       positive: true  },
  { label: "$50–$200",    min: 50,        max: 200,      positive: true  },
  { label: "$200–$500",   min: 200,       max: 500,      positive: true  },
  { label: ">$500",       min: 500,       max: Infinity,  positive: true  },
];

function pnlHistogram(trades: Trade[]) {
  return PNL_BUCKETS.map(b => ({
    label:    b.label,
    count:    trades.filter(t => t.pnl >= b.min && t.pnl < b.max).length,
    positive: b.positive,
  }));
}

const ASSET_CLASS_ORDER = ["Forex", "Metals", "Crypto", "Indices", "Other"];

function assetClassBreakdown(trades: Trade[]) {
  const map: Record<string, { pnl: number; wins: number; n: number; gw: number; gl: number; best: number; worst: number }> = {};
  trades.forEach(t => {
    const raw = t.asset_class?.trim();
    const k = raw && ASSET_CLASS_ORDER.includes(raw) ? raw : "Other";
    if (!map[k]) map[k] = { pnl: 0, wins: 0, n: 0, gw: 0, gl: 0, best: -1e9, worst: 1e9 };
    const m = map[k];
    m.pnl += t.pnl; m.n++;
    if (t.pnl > 0) { m.wins++; m.gw += t.pnl; } else m.gl += Math.abs(t.pnl);
    if (t.pnl > m.best) m.best = t.pnl;
    if (t.pnl < m.worst) m.worst = t.pnl;
  });
  return ASSET_CLASS_ORDER
    .filter(k => map[k])
    .map(k => {
      const m = map[k];
      return {
        assetClass: k, trades: m.n,
        winRate:   +(m.wins / m.n * 100).toFixed(1),
        totalPnl:  +m.pnl.toFixed(2),
        avgPnl:    +(m.pnl / m.n).toFixed(2),
        best:      +m.best.toFixed(2),
        worst:     +m.worst.toFixed(2),
        pf: m.gl > 0 ? +(m.gw / m.gl).toFixed(2) : m.gw > 0 ? 999 : 0,
      };
    });
}

function hourBreakdown(trades: Trade[]) {
  const map: Record<number, { pnl: number; wins: number; n: number }> = {};
  for (let h = 0; h < 24; h++) map[h] = { pnl: 0, wins: 0, n: 0 };
  trades.forEach(t => {
    const raw = t.opened_at || t.date + "T12:00:00";
    const h = new Date(raw).getHours();
    map[h].pnl += t.pnl; map[h].n++;
    if (t.pnl > 0) map[h].wins++;
  });
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h.toString().padStart(2, "0") + ":00", h,
    pnl: +map[h].pnl.toFixed(2),
    trades: map[h].n,
    winRate: map[h].n ? +(map[h].wins / map[h].n * 100).toFixed(1) : 0,
  }));
}

function drawdownCurve(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) => a.date < b.date ? -1 : 1);
  let peak = 0, cum = 0;
  return sorted.map(t => {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? -((peak - cum) / peak * 100) : 0;
    return { label: t.date.slice(0, 10), dd: +dd.toFixed(2), equity: +cum.toFixed(2) };
  });
}

function maxDrawdownCalc(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) => a.date < b.date ? -1 : 1);
  let peak = 0, cum = 0, maxDD = 0;
  sorted.forEach(t => { cum += t.pnl; if (cum > peak) peak = cum; maxDD = Math.max(maxDD, peak - cum); });
  return { maxDD, pct: peak > 0 ? maxDD / peak * 100 : 0 };
}

function lotDist(trades: Trade[]) {
  const buckets: Record<string, number> = {};
  trades.forEach(t => {
    const b = t.lot <= 0.01 ? "≤0.01"
            : t.lot <= 0.05 ? "0.02–0.05"
            : t.lot <= 0.10 ? "0.06–0.10"
            : t.lot <= 0.50 ? "0.11–0.50"
            : t.lot <= 1.00 ? "0.51–1.0"
            : ">1.0";
    buckets[b] = (buckets[b] || 0) + 1;
  });
  return ["≤0.01","0.02–0.05","0.06–0.10","0.11–0.50","0.51–1.0",">1.0"]
    .map(lot => ({ lot, count: buckets[lot] || 0 }));
}

function rrDist(trades: Trade[]) {
  const labels = ["<0","0–0.5","0.5–1","1–2","2–3",">3"];
  const counts: Record<string, number> = {};
  labels.forEach(l => { counts[l] = 0; });
  trades.filter(t => t.sl != null && t.tp != null).forEach(t => {
    const risk   = Math.abs(t.entry - t.sl!);
    const reward = Math.abs(t.tp!   - t.entry);
    if (risk === 0) return;
    const rr = reward / risk;
    const k  = rr < 0 ? "<0" : rr < 0.5 ? "0–0.5" : rr < 1 ? "0.5–1" : rr < 2 ? "1–2" : rr < 3 ? "2–3" : ">3";
    counts[k]++;
  });
  return labels.map(rr => ({ rr, count: counts[rr] }));
}

function streakData(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) =>
    (a.opened_at || a.date) < (b.opened_at || b.date) ? -1 : 1);
  let cur = 0, curType: "W" | "L" | null = null;
  let bestW = 0, worstL = 0;
  const history: { date: string; result: "W" | "L"; streak: number }[] = [];
  sorted.forEach(t => {
    const isW = t.pnl > 0;
    if (isW) {
      curType === "W" ? cur++ : (cur = 1, curType = "W");
      bestW = Math.max(bestW, cur);
    } else {
      curType === "L" ? cur++ : (cur = 1, curType = "L");
      worstL = Math.max(worstL, cur);
    }
    history.push({ date: t.date.slice(0, 10), result: isW ? "W" : "L", streak: cur });
  });
  return { current: cur, currentType: curType, bestWin: bestW, worstLoss: worstL, history };
}

function emotionBreakdown(trades: Trade[], field: "emotion" | "entry_emotion" | "exit_emotion" = "emotion") {
  const map: Record<string, { pnl: number; wins: number; n: number }> = {};
  trades.forEach(t => {
    const raw = field === "entry_emotion"
      ? (t.entry_emotion ?? t.emotion)   // backwards compat
      : field === "exit_emotion"
        ? t.exit_emotion
        : t.emotion;
    const k = raw || "untagged";
    if (!map[k]) map[k] = { pnl: 0, wins: 0, n: 0 };
    map[k].pnl += t.pnl; map[k].n++;
    if (t.pnl > 0) map[k].wins++;
  });
  return Object.entries(map).map(([k, m]) => ({
    emotion: EMOTION_LABEL[k] || k, key: k,
    trades: m.n, pnl: +m.pnl.toFixed(2),
    winRate: +(m.wins / m.n * 100).toFixed(1),
    avgPnl: +(m.pnl / m.n).toFixed(2),
  })).sort((a, b) => b.winRate - a.winRate);
}

function afterLossRate(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) =>
    (a.opened_at || a.date) < (b.opened_at || b.date) ? -1 : 1);
  let wins = 0, total = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].pnl < 0) { total++; if (sorted[i].pnl > 0) wins++; }
  }
  return total > 0 ? wins / total * 100 : null;
}

function disciplineScore(trades: Trade[]) {
  if (!trades.length) return { score: 0, factors: [] as { label: string; detail: string; impact: number }[] };
  let score = 100;
  const factors: { label: string; detail: string; impact: number }[] = [];
  const n = trades.length;

  const rev = trades.filter(t => t.emotion === "revenge").length;
  if (rev / n > 0.05) {
    const x = Math.min(20, Math.round(rev / n * 100));
    score -= x;
    factors.push({ label: "Revenge trading", detail: `${rev} trade${rev !== 1 ? "s" : ""} tagged revenge`, impact: x });
  }

  const noSl = trades.filter(t => !t.sl).length;
  if (noSl / n > 0.3) {
    const x = Math.min(15, Math.round(noSl / n * 50));
    score -= x;
    factors.push({ label: "Missing stop losses", detail: `${noSl} trades without SL`, impact: x });
  }

  const wr = trades.filter(t => t.pnl > 0).length / n * 100;
  if (wr < 35) {
    const x = Math.round((35 - wr) / 3);
    score -= x;
    factors.push({ label: "Low win rate", detail: `${wr.toFixed(1)}% win rate`, impact: x });
  }

  const dayMap: Record<string, number> = {};
  trades.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + 1; });
  const ovrDays = Object.values(dayMap).filter(c => c >= 6).length;
  if (ovrDays > 0) {
    const x = Math.min(10, ovrDays * 2);
    score -= x;
    factors.push({ label: "Overtrading days", detail: `${ovrDays} day(s) with 6+ trades`, impact: x });
  }

  const durTs = trades.filter(t => t.opened_at && t.closed_at);
  if (durTs.length > 5) {
    const winDur  = durTs.filter(t => t.pnl > 0);
    const lossDur = durTs.filter(t => t.pnl < 0);
    if (winDur.length && lossDur.length) {
      const avgW = winDur.reduce((s, t)  => s + (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()), 0) / winDur.length;
      const avgL = lossDur.reduce((s, t) => s + (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()), 0) / lossDur.length;
      if (avgL > avgW * 2) {
        score -= 8;
        factors.push({ label: "Holding losers too long", detail: `Losses held ${(avgL / avgW).toFixed(1)}× longer than wins`, impact: 8 });
      }
    }
  }

  return { score: Math.max(0, score), factors };
}

function winLossComparison(trades: Trade[]) {
  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const side = (ts: Trade[]) => {
    if (!ts.length) return null;
    const durTs = ts.filter(t => t.opened_at && t.closed_at);
    const avgDur = durTs.length
      ? durTs.reduce((s, t) => s + (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 60000, 0) / durTs.length
      : null;
    const top = (obj: Record<string, number>) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const sessions  = ts.reduce<Record<string, number>>((m, t) => { m[t.session]            = (m[t.session]            || 0) + 1; return m; }, {});
    const emotions  = ts.reduce<Record<string, number>>((m, t) => { const k = t.emotion||"—"; m[k] = (m[k]||0)+1; return m; }, {});
    const days      = ts.reduce<Record<string, number>>((m, t) => { const d = DN[new Date(t.date+"T12:00:00").getDay()-1]||"—"; m[d]=(m[d]||0)+1; return m; }, {});
    const pairs     = ts.reduce<Record<string, number>>((m, t) => { m[t.pair]               = (m[t.pair]               || 0) + 1; return m; }, {});
    return {
      count: ts.length,
      avgPnl:     +(ts.reduce((s, t) => s + t.pnl, 0) / ts.length).toFixed(2),
      avgLot:     +(ts.reduce((s, t) => s + t.lot, 0) / ts.length).toFixed(2),
      avgDur,
      topSession:  top(sessions),
      topPair:     top(pairs),
      topEmotion:  top(emotions),
      topDay:      top(days),
    };
  };
  return { wins: side(wins), losses: side(losses) };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════
function exportCsv(trades: Trade[]) {
  const hdr = "Date,Pair,Direction,Lot,Entry,Exit,P&L,Session,Emotion,Setup,Account\n";
  const rows = trades.map(t =>
    [t.date, t.pair, t.direction, t.lot, t.entry, t.exit_price,
     t.pnl.toFixed(2), t.session, t.emotion || "", t.setup,
     t.account_label || t.account_signature || ""]
    .map(v => `"${v}"`).join(",")
  ).join("\n");
  const blob = new Blob([hdr + rows], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "niri_trades.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 truncate">{label}</p>
      <p className={`text-base sm:text-lg font-sans font-bold leading-tight ${color ?? "text-zinc-100"}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3 font-semibold">{children}</h3>
  );
}

function InsightCard({ icon, text, highlight }: { icon: string; text: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border text-sm ${highlight
      ? "border-[var(--cj-gold-muted)] bg-[var(--cj-gold-glow)] text-zinc-200"
      : "border-[var(--cj-border)] bg-[var(--cj-raised)] text-zinc-300"}`}>
      <span className="mr-2 text-base">{icon}</span>{text}
    </div>
  );
}

function Empty({ msg = "No trades in this period" }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <p className="text-sm">{msg}</p>
    </div>
  );
}

function ChartBox({ title, height = 240, children }: { title?: string; height?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
      {title && <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">{title}</p>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// Recharts custom tooltips
function PnlTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className={`font-sans font-semibold ${(p.value ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {p.name && <span className="text-zinc-500 mr-1">{p.name}:</span>}
          {f$(p.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function WrTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { trades: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      <p className={`font-sans font-semibold ${payload[0].value >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
        {payload[0].value}% win rate
      </p>
      <p className="text-zinc-500 mt-0.5">{payload[0].payload.trades} trades</p>
    </div>
  );
}

function HourTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string; payload?: { trades: number; winRate: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      <p className={`font-sans font-semibold ${(payload[0].value ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{f$(payload[0].value ?? 0)}</p>
      {d && <p className="text-zinc-500 mt-0.5">{d.trades} trades · {d.winRate}% wr</p>}
    </div>
  );
}

// ── Discipline components for radar ─────────────────────────────
function computeDisciplineComponents(trades: Trade[]) {
  if (!trades.length) return null;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const byDay: Record<string, number> = {};
  for (const t of trades) byDay[t.date] = (byDay[t.date] || 0) + 1;
  const tradingDays = Object.keys(byDay).length;
  const overtradeDays = Object.values(byDay).filter(c => c > 3).length;
  const overtradeScore = Math.round(25 * Math.max(0, 1 - overtradeDays / Math.max(tradingDays, 1)));
  const dayPairHadLoss: Record<string, Set<string>> = {};
  let revengeCount = 0;
  for (const t of sorted) {
    if (!dayPairHadLoss[t.date]) dayPairHadLoss[t.date] = new Set();
    if (dayPairHadLoss[t.date].has(t.pair) && t.pnl < 0) revengeCount++;
    if (t.pnl < 0) dayPairHadLoss[t.date].add(t.pair);
  }
  const revengeScore = Math.round(25 * Math.max(0, 1 - Math.min(1, revengeCount / Math.max(trades.length * 0.15, 1))));
  const lots = trades.map(t => t.lot);
  const avg = lots.reduce((s, l) => s + l, 0) / lots.length;
  const stdDev = Math.sqrt(lots.reduce((s, l) => s + (l - avg) ** 2, 0) / lots.length);
  const cv = avg > 0 ? stdDev / avg : 0;
  const riskScore = Math.round(25 * Math.max(0, 1 - Math.min(cv * 1.5, 1)));
  const withTp = trades.filter(t => t.tp !== null && t.tp !== 0);
  let tpHit = 0;
  for (const t of withTp) {
    if (!t.tp) continue;
    const reached = t.direction === "BUY" ? t.exit_price >= t.tp * 0.998 : t.exit_price <= t.tp * 1.002;
    if (reached) tpHit++;
  }
  const tpScore = withTp.length >= 3 ? Math.round(25 * (tpHit / withTp.length)) : 18;
  return [
    { short: "OT",   label: "Overtrading", score: overtradeScore },
    { short: "Rev",  label: "Revenge",     score: revengeScore   },
    { short: "Risk", label: "Risk CV",     score: riskScore      },
    { short: "TP",   label: "TP Disc",     score: tpScore        },
  ];
}

function weeklyWaterfall(trades: Trade[]) {
  const now = new Date();
  const yr = now.getFullYear(), mo = now.getMonth();
  const ms = `${yr}-${String(mo + 1).padStart(2, "0")}-01`;
  const me = new Date(yr, mo + 1, 0).toISOString().slice(0, 10);
  const mt = trades.filter(t => t.date >= ms && t.date <= me);
  if (!mt.length) return [];
  const map: Record<number, number> = {};
  mt.forEach(t => { const w = Math.ceil(new Date(t.date + "T12:00:00").getDate() / 7); map[w] = (map[w] || 0) + t.pnl; });
  const currentWeek = Math.ceil(now.getDate() / 7);
  let cum = 0;
  const rows: { label: string; pnl: number; base: number; top: number; noTrades: boolean }[] = [];
  for (let w = 1; w <= Math.min(currentWeek, 5); w++) {
    if (w in map) {
      const pnl = +map[w].toFixed(2);
      rows.push({ label: `W${w}`, pnl, base: cum, top: cum + pnl, noTrades: false });
      cum += pnl;
    } else {
      rows.push({ label: `W${w}`, pnl: 0, base: cum, top: cum, noTrades: true });
    }
  }
  return rows;
}

function DivergingDayChart({ days }: { days: { day: string; pnl: number; trades: number }[] }) {
  const maxAbs = Math.max(...days.map(d => Math.abs(d.pnl)), 0.01);
  const ROW_H = 36, BAR_H = 16, VW = 400, LABEL_W = 38;
  const ZERO_X = LABEL_W + (VW - LABEL_W) / 2;
  const MAX_BAR = (VW - LABEL_W) / 2 - 50;
  const VH = days.length * ROW_H + 8;
  function fmtV(v: number) {
    const a = Math.abs(v), s = v >= 0 ? "+" : "−";
    return a >= 1000 ? `${s}$${(a / 1000).toFixed(1)}k` : `${s}$${a.toFixed(0)}`;
  }
  return (
    <div>
      <style>{`@keyframes cj-growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ height: "auto", display: "block" }}>
        <line x1={ZERO_X} y1={0} x2={ZERO_X} y2={VH - 4} stroke="#3f3f46" strokeWidth={1} />
        {days.map((d, i) => {
          const y = i * ROW_H + ROW_H / 2;
          const profit = d.pnl >= 0;
          const fill = profit ? "#5DCAA5" : "#F09595";
          const lc   = profit ? "#0F6E56" : "#A32D2D";
          const len  = (Math.abs(d.pnl) / maxAbs) * MAX_BAR;
          const bx   = profit ? ZERO_X : ZERO_X - len;
          return (
            <g key={d.day}>
              <text x={LABEL_W - 4} y={y} textAnchor="end" fontSize={10} fill="#71717a" dominantBaseline="middle">{d.day}</text>
              {d.pnl !== 0
                ? <rect x={bx} y={y - BAR_H / 2} width={Math.max(len, 1)} height={BAR_H} rx={BAR_H / 2} fill={fill}
                    style={{ transformOrigin: `${ZERO_X}px ${y}px`, animation: `cj-growX 0.9s cubic-bezier(0.16,1,0.3,1) ${i * 0.1}s both` }} />
                : <line x1={ZERO_X - 3} y1={y} x2={ZERO_X + 3} y2={y} stroke="#52525b" strokeWidth={1} />
              }
              {d.pnl !== 0 && (
                <text x={profit ? ZERO_X + len + 5 : ZERO_X - len - 5} y={y}
                      textAnchor={profit ? "start" : "end"} fontSize={9} fill={lc}
                      dominantBaseline="middle" fontWeight="600" fontFamily="sans-serif">
                  {fmtV(d.pnl)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WaterfallChart({ data }: { data: ReturnType<typeof weeklyWaterfall> }) {
  if (!data.length) return <div className="py-6 text-center text-zinc-600 text-sm">No trades this month</div>;
  const allV = data.flatMap(d => [d.base, d.top, 0]);
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const range = maxV - minV || 1;
  const VW = 400, VH = 170, PL = 8, PR = 8, PT = 18, PB = 22;
  const cW = VW - PL - PR, cH = VH - PT - PB;
  const bW = Math.min(56, cW / data.length - 10);
  function ty(v: number) { return PT + cH - ((v - minV) / range) * cH; }
  function fmtW(v: number) { const s = v >= 0 ? "+" : "−", a = Math.abs(v); return a >= 1000 ? `${s}${(a / 1000).toFixed(1)}k` : `${s}${a.toFixed(0)}`; }
  return (
    /* max-width 520px → height ≈ 520*(170/400) ≈ 221px */
    <div style={{ maxWidth: 520 }}>
      <style>{`@keyframes cj-fadeIn{from{opacity:0}to{opacity:1}}`}</style>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ height: "auto", display: "block" }}>
        <line x1={PL} y1={ty(0)} x2={VW - PR} y2={ty(0)} stroke="#3f3f46" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = PL + (i + 0.5) * cW / data.length;
          if (d.noTrades) {
            const flatY = ty(d.base);
            return (
              <g key={d.label} style={{ animation: `cj-fadeIn 0.6s ease ${i * 0.12}s both` }}>
                <line x1={cx - bW / 2} y1={flatY} x2={cx + bW / 2} y2={flatY}
                      stroke="#3f3f46" strokeWidth={2} strokeDasharray="4 3" />
                <text x={cx} y={VH - 5} textAnchor="middle" fontSize={10} fill="#3f3f46">{d.label}</text>
              </g>
            );
          }
          const profit = d.pnl >= 0;
          const fill = profit ? "#5DCAA5" : "#F09595";
          const bTop = Math.min(ty(d.base), ty(d.top));
          const bH   = Math.max(Math.abs(ty(d.base) - ty(d.top)), 2);
          return (
            <g key={d.label} style={{ animation: `cj-fadeIn 0.6s ease ${i * 0.12}s both` }}>
              <rect x={cx - bW / 2} y={bTop} width={bW} height={bH} rx={5} fill={fill} fillOpacity={0.85} />
              <text x={cx} y={profit ? bTop - 5 : bTop + bH + 11}
                    textAnchor="middle" fontSize={9} fill={profit ? "#0F6E56" : "#A32D2D"}
                    fontWeight="600" fontFamily="sans-serif">{fmtW(d.pnl)}</text>
              <text x={cx} y={VH - 5} textAnchor="middle" fontSize={10} fill="#52525b">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Trading Clock (24h radial dial) ────────────────────────────
function TradingClock({ hours }: { hours: { h: number; hour: string; trades: number; pnl: number; winRate: number }[] }) {
  const CX = 120, CY = 120, R = 86;

  // Gap-free session buckets covering all 24h — used for legend grouping only
  const sessions = [
    { name: "Asia",   h0: 0,  h1: 8  },
    { name: "London", h0: 8,  h1: 13 },
    { name: "NY",     h0: 13, h1: 24 },
  ];

  function hxy(h: number, r: number): [number, number] {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    return [+(CX + r * Math.cos(a)).toFixed(2), +(CY + r * Math.sin(a)).toFixed(2)];
  }

  // Arc for exactly one hour slot (1/24th of the dial)
  function hourArc(h: number, r: number): string {
    const [x1, y1] = hxy(h, r);
    const [x2, y2] = hxy(h + 1, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  }

  function arcColor(wr: number) {
    if (wr >= 60) return "#0F6E56";
    if (wr >= 45) return "#5DCAA5";
    return "#E8A0A0";
  }

  const activeHours = hours.filter(h => h.trades > 0);
  const maxTrades   = Math.max(...activeHours.map(h => h.trades), 1);

  // Best hour for center readout
  const bestHour = [...activeHours].sort((a, b) => b.winRate - a.winRate)[0];

  // Session stats for legend — gap-free ranges so every trade is counted
  const activeSessions = sessions.map(s => {
    const sh = activeHours.filter(h => h.h >= s.h0 && h.h < s.h1);
    const totalTrades = sh.reduce((a, h) => a + h.trades, 0);
    const wins = sh.reduce((a, h) => a + Math.round(h.trades * h.winRate / 100), 0);
    const wr = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
    return { ...s, totalTrades, wr };
  }).filter(s => s.totalTrades > 0);

  const ticks = Array.from({ length: 48 }, (_, i) => i);

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
      <svg viewBox="0 0 240 240" width={240} height={240} style={{ display: "block", flexShrink: 0 }}>
        {/* Base ring */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={18} />

        {/* Tick marks every 30 min */}
        {ticks.map(i => {
          const a = (i / 48) * 2 * Math.PI - Math.PI / 2;
          const isHour = i % 2 === 0;
          const r0 = isHour ? R - 11 : R - 7;
          const r1 = R + (isHour ? 3 : 1);
          const x0 = +(CX + r0 * Math.cos(a)).toFixed(2);
          const y0 = +(CY + r0 * Math.sin(a)).toFixed(2);
          const x1 = +(CX + r1 * Math.cos(a)).toFixed(2);
          const y1 = +(CY + r1 * Math.sin(a)).toFixed(2);
          return (
            <line key={i} x1={x0} y1={y0} x2={x1} y2={y1}
                  stroke={isHour ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.10)"}
                  strokeWidth={isHour ? 1.5 : 1} />
          );
        })}

        {/* One arc per active hour — sized by trade count, coloured by win rate */}
        {activeHours.map(h => {
          const sw = 10 + (h.trades / maxTrades) * 10;
          return (
            <path key={h.h} d={hourArc(h.h, R)}
                  fill="none" stroke={arcColor(h.winRate)} strokeWidth={sw}
                  strokeLinecap="butt" opacity={0.85} />
          );
        })}

        {/* Hour labels at 0, 6, 12, 18 */}
        {[0, 6, 12, 18].map(h => {
          const [x, y] = hxy(h, R + 16);
          return (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill="#71717a" fontFamily="sans-serif">{h.toString().padStart(2, "0")}</text>
          );
        })}

        {/* White center */}
        <circle cx={CX} cy={CY} r={58} fill="white" />

        {/* Center readout: best trading hour */}
        {bestHour ? (
          <>
            <text x={CX} y={CY - 16} textAnchor="middle" fontSize={10} fill="#9ca3af"
                  fontFamily="sans-serif" letterSpacing={1.5}>BEST HOUR</text>
            <text x={CX} y={CY + 4} textAnchor="middle" fontSize={19} fill="#111827"
                  fontWeight="600" fontFamily="sans-serif">{bestHour.hour}</text>
            <text x={CX} y={CY + 20} textAnchor="middle" fontSize={11}
                  fill={arcColor(bestHour.winRate)} fontFamily="sans-serif">{bestHour.winRate}% wr</text>
          </>
        ) : (
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={11} fill="#9ca3af"
                fontFamily="sans-serif">No data</text>
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-3 pt-1">
        {sessions.map(s => {
          const active = activeSessions.find(a => a.name === s.name);
          return (
            <div key={s.name} className="flex items-start gap-2">
              <span className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                    style={{ background: active ? arcColor(active.wr) : "#3f3f46", opacity: active ? 1 : 0.4 }} />
              <div>
                <p className="text-xs font-medium text-zinc-300">{s.name}</p>
                <p className="text-[10px] text-zinc-500">
                  {s.h0.toString().padStart(2,"0")}:00 – {(s.h1 % 24).toString().padStart(2,"0")}:00
                  {active ? ` · ${active.totalTrades}t · ${active.wr}% wr` : " · no trades"}
                </p>
              </div>
            </div>
          );
        })}
        <div className="mt-2 space-y-1">
          {[
            { col: "#0F6E56", label: "≥60% win rate" },
            { col: "#5DCAA5", label: "45–59%" },
            { col: "#E8A0A0", label: "<45%" },
          ].map(b => (
            <div key={b.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.col }} />
              <span className="text-[9px] text-zinc-600">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DisciplineRadar({ axes }: { axes: { short: string; label: string; score: number }[] }) {
  // Layout: viewBox 280×240, center (140,120), radius 80
  // i=0→top, i=1→right, i=2→bottom, i=3→left
  const CX = 140, CY = 120, R = 80, MAX = 25;
  function ap(i: number, r: number): [number, number] {
    const a = (i / axes.length) * 2 * Math.PI - Math.PI / 2;
    return [+(CX + r * Math.cos(a)).toFixed(2), +(CY + r * Math.sin(a)).toFixed(2)];
  }
  const rings = [MAX * 0.5, MAX];
  // Clamp to 1.5 minimum so zero-score axes still show a small visible vertex
  const dataPts = axes.map((ax, i) => ap(i, (Math.max(ax.score, 1.5) / MAX) * R).join(",")).join(" ");
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <style>{`@keyframes cj-radar{from{transform:scale(0)}to{transform:scale(1)}}`}</style>
      <svg viewBox="0 0 280 240" width={280} height={240} style={{ display: "block", maxWidth: "100%" }}>
        {rings.map(ring => (
          <polygon key={ring} points={axes.map((_, i) => ap(i, (ring / MAX) * R).join(",")).join(" ")}
                   fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = ap(i, R);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
        })}
        <polygon points={dataPts} fill="#AFA9EC" fillOpacity={0.55} stroke="#534AB7" strokeWidth={2}
                 style={{ transformOrigin: `${CX}px ${CY}px`, animation: "cj-radar 0.8s cubic-bezier(0.16,1,0.3,1) both" }} />
        {axes.map((ax, i) => {
          const [x, y] = ap(i, (Math.max(ax.score, 1.5) / MAX) * R);
          return <circle key={i} cx={x} cy={y} r={4} fill="#D4A017" />;
        })}
        {axes.map((ax, i) => {
          const [lx, ly] = ap(i, R + 20);
          // top: text hangs up (auto=alphabetic baseline at ly, cap extends above)
          // bottom: text hangs down (hanging = top of text at ly)
          // left/right: vertically centered
          const anchor   = i === 1 ? "start" : i === 3 ? "end" : "middle";
          const baseline = i === 2 ? "hanging" : i === 0 ? "auto" : "middle";
          return (
            <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline={baseline}
                  fontSize={11} fill="#71717a">
              {ax.short} {ax.score}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════════════
function TabOverview({ trades, onExportCsv }: { trades: Trade[]; onExportCsv: () => void }) {
  const st = useMemo(() => coreStats(trades), [trades]);
  const eq = useMemo(() => equityCurve(trades), [trades]);
  const mp = useMemo(() => monthlyPnl(trades), [trades]);

  if (!trades.length) return <Empty msg="No trades yet — start logging to see your overview" />;

  const pfDisplay = !st ? "0" : st.pf === 999 ? "∞" : st.pf.toFixed(2);
  const pfColor   = !st ? undefined : st.pf >= 1.5 ? "text-emerald-400" : st.pf >= 1 ? "text-yellow-400" : "text-rose-400";

  return (
    <div className="space-y-6">
      {/* Export row */}
      <div className="flex gap-2 justify-end">
        <button onClick={onExportCsv}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors">
          ⬇ Export CSV
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors">
          Print / PDF
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total P&L"    value={st ? f$(st.totalPnl) : "$0"}    color={st ? pCls(st.totalPnl) : undefined} />
        <StatCard label="Win Rate"     value={st ? st.winRate.toFixed(1) + "%" : "0%"} color={st && st.winRate >= 50 ? "text-emerald-400" : "text-rose-400"} sub={st ? `${st.wins}W / ${st.losses}L` : undefined} />
        <StatCard label="Profit Factor" value={pfDisplay} color={pfColor} />
        <StatCard label="Total Trades" value={st ? String(st.n) : "0"} />
        <StatCard label="Avg Win"  value={st ? f$(st.avgWin)  : "$0"} color="text-emerald-400" />
        <StatCard label="Avg Loss" value={st ? f$(-st.avgLoss) : "$0"} color="text-rose-400" />
        <StatCard label="Best Trade"  value={st ? f$(st.best)  : "$0"} color="text-emerald-400" />
        <StatCard label="Worst Trade" value={st ? f$(st.worst) : "$0"} color="text-rose-400" />
        <StatCard label="Avg RR Ratio"    value={st ? st.avgRR.toFixed(2) + "R"  : "—"} color="text-[var(--cj-gold)]" />
        <StatCard label="Avg Duration"    value={st?.avgDurMins != null ? fmtDur(st.avgDurMins) : "—"} />
        <StatCard label="Total Lots"      value={st ? st.totalLots.toFixed(2) : "0"} />
        <StatCard label="Avg Lots/Trade"  value={st ? st.avgLots.toFixed(2)   : "0"} />
      </div>

      {/* Equity curve */}
      <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">Equity Curve</p>
        <PremiumEquityCurve data={eq} />
      </div>

      {/* Monthly P&L */}
      <ChartBox title="Monthly P&L" height={200}>
        {mp.length === 0
          ? <div className="flex h-full items-center justify-center text-zinc-600 text-sm">No monthly data</div>
          : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mp} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={28}>
                <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={60} />
                <Tooltip content={<PnlTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={0} stroke="#3f3f46" />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {mp.map((row, i) => <Cell key={i} fill={row.pnl >= 0 ? GRN : RED} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </ChartBox>

      {/* Weekly P&L Waterfall */}
      {(() => {
        const wf = weeklyWaterfall(trades);
        return (
          <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">Weekly P&L Waterfall — This Month</p>
            <WaterfallChart data={wf} />
          </div>
        );
      })()}

      {/* P&L Distribution Histogram */}
      {(() => {
        const hist    = pnlHistogram(trades);
        const avgPnl  = st ? +(st.totalPnl / st.n).toFixed(2) : 0;
        const avgBucket = PNL_BUCKETS.find(b => avgPnl >= b.min && avgPnl < b.max);
        const winBucket  = [...hist].filter(b => b.positive).sort((a, b) => b.count - a.count)[0];
        const lossBucket = [...hist].filter(b => !b.positive).sort((a, b) => b.count - a.count)[0];
        const insight = [
          winBucket?.count  ? `Most of your wins are in the ${winBucket.label} range.`  : "",
          lossBucket?.count ? `Most of your losses are in the ${lossBucket.label} range.` : "",
        ].filter(Boolean).join(" ");
        return (
          <div>
            <SectionHead>P&L Distribution</SectionHead>
            <ChartBox height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hist} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={32}>
                  <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
                          <p className="text-zinc-400">{d.label}</p>
                          <p className="font-sans font-bold text-zinc-100">{d.count} trade{d.count !== 1 ? "s" : ""}</p>
                        </div>
                      );
                    }}
                  />
                  {avgBucket && (
                    <ReferenceLine x={avgBucket.label} stroke={GOLD} strokeDasharray="4 3"
                      label={{ value: `Avg ${f$(avgPnl)}`, position: "top", fill: GOLD, fontSize: 10 }} />
                  )}
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {hist.map((b, i) => <Cell key={i} fill={b.positive ? GRN : RED} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            {insight && <InsightCard icon="›" text={insight} highlight />}
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: PERFORMANCE
// ═══════════════════════════════════════════════════════════════
function TabPerformance({ trades }: { trades: Trade[] }) {
  const [sortKey, setSortKey] = useState<keyof ReturnType<typeof pairBreakdown>[0]>("totalPnl");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const pairs    = useMemo(() => pairBreakdown(trades), [trades]);
  const sessions = useMemo(() => sessionBreakdown(trades), [trades]);
  const days     = useMemo(() => dayBreakdown(trades), [trades]);
  const setups   = useMemo(() => setupBreakdown(trades), [trades]);
  const assets   = useMemo(() => assetClassBreakdown(trades), [trades]);

  if (!trades.length) return <Empty />;

  function sort(key: typeof sortKey) {
    if (key === sortKey) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(-1); }
  }

  const sortedPairs = [...pairs].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });

  const cols: { key: keyof typeof pairs[0]; label: string }[] = [
    { key: "pair",     label: "Pair" },
    { key: "trades",   label: "Trades" },
    { key: "winRate",  label: "Win %" },
    { key: "totalPnl", label: "P&L" },
    { key: "avgPnl",   label: "Avg P&L" },
    { key: "best",     label: "Best" },
    { key: "worst",    label: "Worst" },
    { key: "pf",       label: "P.Factor" },
  ];

  return (
    <div className="space-y-8">
      {/* Win Rate by Pair — premium bars */}
      <div>
        <SectionHead>Win Rate by Pair</SectionHead>
        <PremiumWinRateChart
          data={pairs
            .slice()
            .sort((a, b) => b.winRate - a.winRate)
            .map(p => ({ pair: p.pair, winRate: p.winRate, total: p.trades, pnl: p.totalPnl }))}
        />
      </div>

      {/* Pair breakdown table */}
      <div>
        <SectionHead>Performance by Pair</SectionHead>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
                {cols.map(c => (
                  <th key={c.key}
                    onClick={() => sort(c.key)}
                    className={`py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold cursor-pointer hover:text-zinc-300 select-none whitespace-nowrap ${sortKey === c.key ? "text-[var(--cj-gold)]" : ""}`}>
                    {c.label} {sortKey === c.key ? (sortDir === -1 ? "↓" : "↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPairs.map(row => (
                <tr key={row.pair}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid var(--cj-border)", background: row.totalPnl > 0 ? "rgba(52,211,153,0.04)" : row.totalPnl < 0 ? "rgba(248,113,113,0.04)" : undefined }}>
                  <td className="py-2 px-3 font-semibold text-zinc-200">{row.pair}</td>
                  <td className="py-2 px-3 text-zinc-400">{row.trades}</td>
                  <td className={`py-2 px-3 font-sans font-semibold ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                  <td className={`py-2 px-3 font-sans font-semibold ${pCls(row.totalPnl)}`}>{f$(row.totalPnl)}</td>
                  <td className={`py-2 px-3 font-sans ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                  <td className="py-2 px-3 font-sans text-emerald-400">{f$(row.best)}</td>
                  <td className="py-2 px-3 font-sans text-rose-400">{f$(row.worst)}</td>
                  <td className={`py-2 px-3 font-sans ${row.pf >= 1.5 ? "text-emerald-400" : row.pf >= 1 ? "text-yellow-400" : "text-rose-400"}`}>
                    {row.pf === 999 ? "∞" : row.pf.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session performance */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <SectionHead>Session P&L</SectionHead>
          <ChartBox height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessions} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={32}>
                <XAxis dataKey="session" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={60} />
                <Tooltip content={<PnlTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={0} stroke="#3f3f46" />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {sessions.map((s, i) => <Cell key={i} fill={s.pnl >= 0 ? GRN : RED} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>

        <div>
          <SectionHead>Session Win Rate %</SectionHead>
          <ChartBox height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessions} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={32}>
                <XAxis dataKey="session" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
                <Tooltip content={<WrTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {sessions.map((s, i) => <Cell key={i} fill={s.winRate >= 50 ? GRN : RED} fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      </div>

      {/* Day of week */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <SectionHead>Day of Week P&L</SectionHead>
          <ChartBox height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={36}>
                <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={60} />
                <Tooltip content={<PnlTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={0} stroke="#3f3f46" />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {days.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? GRN : RED} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>

        <div>
          <SectionHead>Day of Week Win Rate %</SectionHead>
          <ChartBox height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={36}>
                <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
                <Tooltip content={<WrTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {days.map((d, i) => <Cell key={i} fill={d.winRate >= 50 ? GRN : RED} fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      </div>

      {/* Setup performance */}
      {setups.length > 0 && (
        <div>
          <SectionHead>Setup / Strategy Performance</SectionHead>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
                  {["Setup", "Trades", "Win %", "Total P&L", "Avg P&L"].map(h => (
                    <th key={h} className="py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {setups.map(row => (
                  <tr key={row.setup} style={{ borderBottom: "1px solid var(--cj-border)", background: row.pnl > 0 ? "rgba(52,211,153,0.04)" : row.pnl < 0 ? "rgba(248,113,113,0.04)" : undefined }}>
                    <td className="py-2 px-3 font-semibold text-zinc-200">{row.setup || "—"}</td>
                    <td className="py-2 px-3 text-zinc-400">{row.trades}</td>
                    <td className={`py-2 px-3 font-sans ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                    <td className={`py-2 px-3 font-sans font-semibold ${pCls(row.pnl)}`}>{f$(row.pnl)}</td>
                    <td className={`py-2 px-3 font-sans ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Setup × Session correlation */}
      {(() => {
        const { setups, matrix } = setupSessionMatrix(trades);
        // only render if at least one cell has ≥ 3 trades
        const hasSufficient = setups.some(s =>
          SESSIONS_LIST.some(sess => matrix[s][sess].n >= 3)
        );
        if (!hasSufficient) return null;

        // find best and worst combos (≥3 trades)
        type Combo = { setup: string; session: string; wr: number };
        let bestCombo:  Combo | null = null;
        let worstCombo: Combo | null = null;
        setups.forEach(s => {
          SESSIONS_LIST.forEach(sess => {
            const cell = matrix[s][sess];
            if (cell.n < 3) return;
            const wr = +(cell.wins / cell.n * 100).toFixed(1);
            if (!bestCombo  || wr > bestCombo.wr)  bestCombo  = { setup: s, session: sess, wr };
            if (!worstCombo || wr < worstCombo.wr) worstCombo = { setup: s, session: sess, wr };
          });
        });
        const b = bestCombo  as Combo | null;
        const w = worstCombo as Combo | null;
        const insightMsg = b && w && (b.setup !== w.setup || b.session !== w.session)
          ? `Your ${b.setup} works best in ${b.session} with ${b.wr}% win rate. Avoid running ${w.setup} during ${w.session}.`
          : b ? `Your best setup-session combo is ${b.setup} in ${b.session} with ${b.wr}% win rate.` : "";

        return (
          <div>
            <SectionHead>Setup × Session</SectionHead>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
                    <th className="py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold">Setup</th>
                    {SESSIONS_LIST.map(sess => (
                      <th key={sess} className="py-2 px-3 text-center text-zinc-500 uppercase tracking-wide font-semibold whitespace-nowrap">{sess}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {setups.map(setup => (
                    <tr key={setup} style={{ borderBottom: "1px solid var(--cj-border)" }}>
                      <td className="py-2 px-3 font-semibold text-zinc-200 whitespace-nowrap">{setup || "—"}</td>
                      {SESSIONS_LIST.map(sess => {
                        const cell = matrix[setup][sess];
                        if (cell.n < 3) return (
                          <td key={sess} className="py-2 px-3 text-center text-zinc-600 font-sans">—</td>
                        );
                        const wr = +(cell.wins / cell.n * 100).toFixed(1);
                        const cls = wr > 60 ? "text-emerald-400" : wr >= 40 ? "text-yellow-400" : "text-rose-400";
                        const bg  = wr > 60 ? "rgba(52,211,153,0.08)" : wr >= 40 ? "rgba(234,179,8,0.08)" : "rgba(248,113,113,0.08)";
                        return (
                          <td key={sess} className={`py-2 px-3 text-center font-sans font-semibold ${cls}`}
                            style={{ background: bg }} title={`${cell.n} trades`}>
                            {wr}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {insightMsg && <div className="mt-3"><InsightCard icon="›" text={insightMsg} highlight /></div>}
          </div>
        );
      })()}

      {/* Asset class breakdown */}
      {assets.length > 0 && (() => {
        const best  = [...assets].sort((a, b) => b.winRate - a.winRate)[0];
        const worst = [...assets].sort((a, b) => a.totalPnl - b.totalPnl)[0];
        const insightMsg = best.assetClass === worst.assetClass
          ? `Your strongest asset class is ${best.assetClass} with ${best.winRate}% win rate.`
          : `Your best asset class is ${best.assetClass} with ${best.winRate}% win rate. You lose most on ${worst.assetClass} — consider reducing exposure.`;
        return (
          <div className="space-y-6">
            <div>
              <SectionHead>Asset Class Breakdown</SectionHead>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
                      {["Asset Class", "Trades", "Win %", "Total P&L", "Avg P&L", "Best", "Worst", "P.Factor"].map(h => (
                        <th key={h} className="py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(row => (
                      <tr key={row.assetClass}
                        style={{ borderBottom: "1px solid var(--cj-border)", background: row.totalPnl > 0 ? "rgba(52,211,153,0.04)" : row.totalPnl < 0 ? "rgba(248,113,113,0.04)" : undefined }}>
                        <td className="py-2 px-3 font-semibold text-zinc-200">{row.assetClass}</td>
                        <td className="py-2 px-3 text-zinc-400">{row.trades}</td>
                        <td className={`py-2 px-3 font-sans font-semibold ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                        <td className={`py-2 px-3 font-sans font-semibold ${pCls(row.totalPnl)}`}>{f$(row.totalPnl)}</td>
                        <td className={`py-2 px-3 font-sans ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                        <td className="py-2 px-3 font-sans text-emerald-400">{f$(row.best)}</td>
                        <td className="py-2 px-3 font-sans text-rose-400">{f$(row.worst)}</td>
                        <td className={`py-2 px-3 font-sans ${row.pf >= 1.5 ? "text-emerald-400" : row.pf >= 1 ? "text-yellow-400" : "text-rose-400"}`}>
                          {row.pf === 999 ? "∞" : row.pf.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <SectionHead>P&L by Asset Class</SectionHead>
                <ChartBox height={200}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={assets} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={36}>
                      <XAxis dataKey="assetClass" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={60} />
                      <Tooltip content={<PnlTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <ReferenceLine y={0} stroke="#3f3f46" />
                      <Bar dataKey="totalPnl" radius={[4, 4, 0, 0]}>
                        {assets.map((a, i) => <Cell key={i} fill={a.totalPnl >= 0 ? GRN : RED} fillOpacity={0.8} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBox>
              </div>

              <div>
                <SectionHead>Win Rate % by Asset Class</SectionHead>
                <ChartBox height={200}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={assets} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={36}>
                      <XAxis dataKey="assetClass" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
                      <Tooltip content={<WrTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
                      <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                        {assets.map((a, i) => <Cell key={i} fill={a.winRate >= 50 ? GRN : RED} fillOpacity={0.75} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBox>
              </div>
            </div>

            <InsightCard icon="›" text={insightMsg} highlight />
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DAY DRAWER (Time Analysis drill-down)
// ═══════════════════════════════════════════════════════════════
function DayDrawer({ date, trades, onClose }: { date: string; trades: Trade[]; onClose: () => void }) {
  const wins     = trades.filter(t => t.pnl > 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate  = trades.length ? wins.length / trades.length * 100 : 0;
  const best     = trades.length ? Math.max(...trades.map(t => t.pnl)) : 0;
  const worst    = trades.length ? Math.min(...trades.map(t => t.pnl)) : 0;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("niri:page-message", {
      detail: { message: "Let's look at what actually happened that day. No excuses, just data." },
    }));
  }, []);

  function fmtTime(iso?: string | null) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return "—"; }
  }

  const sorted = [...trades].sort((a, b) =>
    (a.opened_at || a.date) < (b.opened_at || b.date) ? -1 : 1
  );

  return (
    <>
      <style>{`@keyframes cj-slide-right{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      {/* backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: "min(440px, 100vw)",
          background: "var(--cj-bg)",
          borderLeft: "1px solid var(--cj-border)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.6)",
          animation: "cj-slide-right 0.22s cubic-bezier(0.16,1,0.3,1) forwards",
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--cj-border)" }}>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Day Review</p>
            <h2 className="text-lg font-bold text-zinc-100 mt-0.5">{date}</h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xl leading-none">
            ×
          </button>
        </div>

        {/* summary stats */}
        <div className="grid grid-cols-2 gap-2 px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--cj-border)" }}>
          <StatCard label="Total P&L"   value={f$(totalPnl)} color={pCls(totalPnl)} />
          <StatCard label="Trades"      value={String(trades.length)} />
          <StatCard label="Win Rate"    value={winRate.toFixed(1) + "%"}
            color={winRate >= 50 ? "text-emerald-400" : "text-rose-400"}
            sub={`${wins.length}W / ${trades.length - wins.length}L`} />
          <StatCard label="Best Trade"  value={f$(best)}  color="text-emerald-400" />
          <StatCard label="Worst Trade" value={f$(worst)} color="text-rose-400" />
        </div>

        {/* trade list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Trades That Day</p>
          <div className="space-y-2">
            {sorted.map(t => (
              <div key={t.id} className="rounded-xl px-3 py-2.5"
                style={{
                  background: t.pnl > 0 ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
                  border: `1px solid ${t.pnl > 0 ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
                }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-100">{t.pair}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      t.direction === "BUY"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/20 text-rose-400"
                    }`}>{t.direction}</span>
                    <span className="text-[10px] text-zinc-500">{t.lot}L</span>
                  </div>
                  <span className={`text-sm font-sans font-bold ${pCls(t.pnl)}`}>{f$(t.pnl)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500 flex-wrap">
                  {t.session  && <span>{t.session}</span>}
                  {t.emotion  && <span className="capitalize">{EMOTION_LABEL[t.emotion] || t.emotion}</span>}
                  <span className="font-sans">{fmtTime(t.opened_at)} → {fmtTime(t.closed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: TIME ANALYSIS
// ═══════════════════════════════════════════════════════════════
function TabTime({ trades }: { trades: Trade[] }) {
  const hours = useMemo(() => hourBreakdown(trades), [trades]);
  const days  = useMemo(() => dayBreakdown(trades),  [trades]);

  if (!trades.length) return <Empty />;

  const activeHours = hours.filter(h => h.trades > 0);
  const topHours    = [...activeHours].sort((a, b) => b.winRate - a.winRate).slice(0, 3);
  const maxTrades   = Math.max(...hours.map(h => h.trades), 1);

  // Calendar heatmap
  const dailyMap = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {};
    trades.forEach(t => {
      const k = t.date.slice(0, 10);
      if (!map[k]) map[k] = { pnl: 0, count: 0 };
      map[k].pnl += t.pnl; map[k].count++;
    });
    return map;
  }, [trades]);

  const today    = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const selectedDayTrades = useMemo(() =>
    selectedDay ? trades.filter(t => t.date.slice(0, 10) === selectedDay) : [],
    [trades, selectedDay]
  );

  const canNext = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
  function prevM() { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); }
  function nextM() { if (!canNext) return; if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay();
  const monthVals   = Object.entries(dailyMap)
    .filter(([d]) => d.startsWith(`${year}-${String(month+1).padStart(2,"0")}`))
    .map(([, v]) => Math.abs(v.pnl));
  const maxAbs = Math.max(...monthVals, 1);

  return (
    <div className="space-y-8">
      {/* Top hour insights */}
      {topHours.length > 0 && (
        <div>
          <SectionHead>Your Best Trading Hours</SectionHead>
          <div className="grid sm:grid-cols-3 gap-3">
            {topHours.map((h, i) => (
              <InsightCard key={h.hour} icon={i === 0 ? "›" : "·"} highlight={i === 0}
                text={`${h.hour} WAT — ${h.winRate}% win rate, avg ${f$(h.trades ? h.pnl / h.trades : 0)} per trade`} />
            ))}
          </div>
        </div>
      )}

      {/* Trading Clock — 24h radial dial */}
      <div>
        <SectionHead>Trading Clock</SectionHead>
        <div className="rounded-xl p-5" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
          <TradingClock hours={hours} />
        </div>
      </div>

      {/* Day performance */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">Day of Week — P&L</p>
          <DivergingDayChart days={days} />
        </div>

        <ChartBox title="Day of Week — Win Rate %" height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={36}>
              <XAxis dataKey="day" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
              <Tooltip content={<WrTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                {days.map((d, i) => <Cell key={i} fill={d.winRate >= 50 ? GRN : RED} fillOpacity={0.75} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* Calendar heatmap */}
      <div>
        <SectionHead>Monthly Calendar Heatmap</SectionHead>
        <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevM} className="text-zinc-500 hover:text-zinc-300 px-2 transition-colors text-sm">‹</button>
            <span className="text-sm font-semibold text-zinc-300">{MN[month]} {year}</span>
            <button onClick={nextM} disabled={!canNext} className={`px-2 text-sm transition-colors ${canNext ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-800 cursor-default"}`}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
              <span key={d} className="text-[10px] text-zinc-600">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ds  = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const entry = dailyMap[ds];
              const pnl   = entry?.pnl ?? 0;
              const intensity = entry ? Math.min(1, Math.abs(pnl) / maxAbs) : 0;
              const bg = !entry ? "rgba(63,63,70,0.3)"
                : pnl > 0 ? `rgba(52,211,153,${0.15 + intensity * 0.6})`
                : `rgba(248,113,113,${0.15 + intensity * 0.6})`;
              return (
                <div key={ds}
                  title={entry ? `${ds}: ${f$(pnl)} (${entry.count} trades) — click to drill down` : ds}
                  onClick={() => entry && setSelectedDay(ds)}
                  className={`rounded h-8 flex items-center justify-center text-[10px] font-medium transition-opacity hover:opacity-80 ${entry ? "cursor-pointer hover:ring-1 hover:ring-white/20" : "cursor-default"}`}
                  style={{ background: bg, color: entry ? (pnl > 0 ? GRN : RED) : "#52525b" }}>
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {selectedDay && (
        <DayDrawer
          date={selectedDay}
          trades={selectedDayTrades}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: RISK
// ═══════════════════════════════════════════════════════════════
function TabRisk({ trades }: { trades: Trade[] }) {
  const st  = useMemo(() => coreStats(trades),       [trades]);
  const dd  = useMemo(() => drawdownCurve(trades),   [trades]);
  const mdd = useMemo(() => maxDrawdownCalc(trades), [trades]);
  const ld  = useMemo(() => lotDist(trades),         [trades]);
  const rd  = useMemo(() => rrDist(trades),          [trades]);

  const maxCons = useMemo(() => {
    const sorted = [...trades].sort((a, b) => a.date < b.date ? -1 : 1);
    let maxW = 0, maxL = 0, curW = 0, curL = 0;
    sorted.forEach(t => {
      if (t.pnl > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
      else            { curL++; curW = 0; maxL = Math.max(maxL, curL); }
    });
    return { maxW, maxL };
  }, [trades]);

  if (!trades.length) return <Empty />;

  return (
    <div className="space-y-8">
      {/* Risk cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Max Drawdown $"  value={`$${mdd.maxDD.toFixed(2)}`}    color="text-rose-400" />
        <StatCard label="Max Drawdown %"  value={`${mdd.pct.toFixed(1)}%`}      color="text-rose-400" />
        <StatCard label="Max Consec Losses" value={String(maxCons.maxL)} color="text-rose-400" />
        <StatCard label="Max Consec Wins"   value={String(maxCons.maxW)} color="text-emerald-400" />
        <StatCard label="Largest Loss"   value={st ? f$(st.worst) : "$0"} color="text-rose-400" />
        <StatCard label="Largest Win"    value={st ? f$(st.best)  : "$0"} color="text-emerald-400" />
        <StatCard label="Avg RR Ratio"   value={st ? st.avgRR.toFixed(2) + "R" : "—"} color="text-[var(--cj-gold)]" />
        <StatCard label="Expectancy"     value={st ? f$(st.expectancy) : "$0"} color={st ? pCls(st.expectancy) : undefined}
          sub="per trade" />
      </div>

      {/* Drawdown chart */}
      <ChartBox title="Drawdown Curve" height={220}>
        {dd.length < 2
          ? <div className="flex h-full items-center justify-center text-zinc-600 text-sm">Not enough data</div>
          : <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dd} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={RED} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={RED} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={48} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={(props: any) => {
                    if (!props.active || !props.payload?.length) return null;
                    return (
                      <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <p className="text-zinc-400 mb-1">{props.label}</p>
                        <p className="font-sans text-rose-400">{(props.payload[0].value as number).toFixed(2)}%</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="#3f3f46" />
                <Area type="monotone" dataKey="dd" stroke={RED} strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
        }
      </ChartBox>

      {/* Lot + RR distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <ChartBox title="Lot Size Distribution" height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ld} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={28}>
              <XAxis dataKey="lot" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => {
                  if (!props.active || !props.payload?.length) return null;
                  return <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl"><p className="text-zinc-400">{props.label}</p><p className="text-zinc-200">{props.payload[0].value} trades</p></div>;
                }}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="count" fill={GOLD} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="R:R Distribution (planned)" height={200}>
          {rd.every(r => r.count === 0)
            ? <div className="flex h-full items-center justify-center text-zinc-600 text-sm">Set SL & TP to see RR distribution</div>
            : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rd} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={28}>
                  <XAxis dataKey="rr" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={(props: any) => {
                      if (!props.active || !props.payload?.length) return null;
                      return <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl"><p className="text-zinc-400">{props.label} R:R</p><p className="text-zinc-200">{props.payload[0].value} trades</p></div>;
                    }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="count" fill={GOLD} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </ChartBox>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: PSYCHOLOGY
// ═══════════════════════════════════════════════════════════════
function EmotionTable({ rows, title }: { rows: ReturnType<typeof emotionBreakdown>; title: string }) {
  const tagged = rows.filter(e => e.key !== "untagged");
  return (
    <div className="flex-1 min-w-0">
      <SectionHead>{title}</SectionHead>
      {tagged.length === 0
        ? <InsightCard icon="›" text="Tag emotions on trades to see this breakdown." />
        : (
          <div className="space-y-3">
            <ChartBox height={160}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tagged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={24}>
                  <XAxis dataKey="emotion" tick={{ fill: "#52525b", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={34} />
                  <Tooltip content={<WrTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
                  <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                    {tagged.map((e, i) => <Cell key={i} fill={e.winRate >= 50 ? GRN : RED} fillOpacity={0.75} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
                    {["Emotion", "Trades", "Win %", "P&L", "Avg"].map(h => (
                      <th key={h} className="py-2 px-2 text-left text-zinc-500 uppercase tracking-wide font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.key} style={{ borderBottom: "1px solid var(--cj-border)" }}>
                      <td className="py-2 px-2 text-zinc-200 whitespace-nowrap">{row.emotion}</td>
                      <td className="py-2 px-2 text-zinc-400">{row.trades}</td>
                      <td className={`py-2 px-2 font-sans ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                      <td className={`py-2 px-2 font-sans font-semibold ${pCls(row.pnl)}`}>{f$(row.pnl)}</td>
                      <td className={`py-2 px-2 font-sans ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </div>
  );
}

function TabPsychology({ trades }: { trades: Trade[] }) {
  const entryEmotions = useMemo(() => emotionBreakdown(trades, "entry_emotion"), [trades]);
  const exitEmotions  = useMemo(() => emotionBreakdown(trades, "exit_emotion"),  [trades]);
  const afterRate     = useMemo(() => afterLossRate(trades),                      [trades]);
  const disc          = useMemo(() => disciplineScore(trades),                    [trades]);
  const discComps     = useMemo(() => computeDisciplineComponents(trades),        [trades]);

  if (!trades.length) return <Empty />;

  const scoreColor = disc.score >= 80 ? "text-emerald-400" : disc.score >= 60 ? "text-yellow-400" : "text-rose-400";

  const bestEntry  = entryEmotions.filter(e => e.key !== "untagged")[0];
  const worstExit  = [...exitEmotions].filter(e => e.key !== "untagged").sort((a, b) => a.winRate - b.winRate)[0];

  const entryExitInsight = bestEntry && worstExit
    ? `You enter best when ${bestEntry.emotion} (${bestEntry.winRate}% win rate). You exit worst when ${worstExit.emotion} — watch your mindset at the close.`
    : bestEntry
      ? `Your best entry state is ${bestEntry.emotion} with ${bestEntry.winRate}% win rate.`
      : null;

  const tips: string[] = [];
  if (bestEntry) tips.push(`Trade most when ${bestEntry.emotion} — your win rate is ${bestEntry.winRate}% entering in that state.`);
  const worstEntry = [...entryEmotions].filter(e => e.key !== "untagged").sort((a, b) => a.winRate - b.winRate)[0];
  if (worstEntry && worstEntry.key !== bestEntry?.key) tips.push(`Avoid entering when ${worstEntry.emotion} — only ${worstEntry.winRate}% win rate.`);
  if (afterRate !== null) tips.push(`After a losing trade, you win ${afterRate.toFixed(1)}% of the time. ${afterRate < 45 ? "Consider a break before re-entering." : "Good recovery rate — keep it up."}`);
  disc.factors.forEach(f => tips.push(`${f.label}: ${f.detail}`));

  return (
    <div className="space-y-8">
      {/* Discipline score */}
      <div className="rounded-xl p-5" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
        <SectionHead>Trading Discipline Score</SectionHead>
        <div className="flex items-end gap-4 mb-4">
          <span className={`text-5xl font-sans font-bold ${scoreColor}`}>{disc.score}</span>
          <span className="text-zinc-500 text-lg mb-1">/ 100</span>
        </div>
        <div className="w-full h-2 rounded-full bg-zinc-800 mb-4 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${disc.score}%`, background: disc.score >= 80 ? GRN : disc.score >= 60 ? GOLD : RED }} />
        </div>
        {disc.factors.length > 0 && (
          <div className="space-y-2">
            {disc.factors.map(f => (
              <div key={f.label} className="flex items-center gap-2 text-xs">
                <span className="text-rose-400 font-sans w-8 text-right shrink-0">-{f.impact}</span>
                <span className="text-zinc-400">{f.label}</span>
                <span className="text-zinc-600">— {f.detail}</span>
              </div>
            ))}
          </div>
        )}
        {discComps && discComps.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--cj-border)]">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Discipline Shape</p>
            <DisciplineRadar axes={discComps} />
          </div>
        )}
      </div>

      {/* Entry vs Exit emotion side by side */}
      <div>
        <SectionHead>Performance by Emotion</SectionHead>
        <div className="flex flex-col md:flex-row gap-6">
          <EmotionTable rows={entryEmotions} title="Entry Emotion Performance" />
          <EmotionTable rows={exitEmotions}  title="Exit Emotion Performance" />
        </div>
        {entryExitInsight && (
          <div className="mt-4">
            <InsightCard icon="›" text={entryExitInsight} highlight />
          </div>
        )}
      </div>

      {/* Behavioral insights */}
      <div>
        <SectionHead>Behavioral Patterns & Coaching Tips</SectionHead>
        <div className="grid sm:grid-cols-2 gap-3">
          {tips.slice(0, 6).map((tip, i) => (
            <InsightCard key={i} icon={i === 0 ? "›" : "·"} text={tip} highlight={i === 0} />
          ))}
          {tips.length === 0 && (
            <InsightCard icon="›" text="Log more trades with emotion tags to generate personalized coaching tips." />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: WINS VS LOSSES
// ═══════════════════════════════════════════════════════════════
function TabWinsVsLosses({ trades }: { trades: Trade[] }) {
  const { wins, losses } = useMemo(() => winLossComparison(trades), [trades]);
  const st = useMemo(() => coreStats(trades), [trades]);

  if (!trades.length) return <Empty />;

  const buyTrades  = trades.filter(t => t.direction === "BUY");
  const sellTrades = trades.filter(t => t.direction === "SELL");
  const buyWr  = buyTrades.length  ? buyTrades.filter(t => t.pnl > 0).length  / buyTrades.length  * 100 : 0;
  const sellWr = sellTrades.length ? sellTrades.filter(t => t.pnl > 0).length / sellTrades.length * 100 : 0;

  function CompCol({ label, data, color }: { label: string; data: typeof wins; color: string }) {
    if (!data) return <div className="flex-1 text-center text-zinc-600 text-sm py-8">No data</div>;
    const rows: { k: string; v: string }[] = [
      { k: "Count",         v: String(data.count) },
      { k: "Avg P&L",       v: f$(data.avgPnl) },
      { k: "Avg Lot Size",  v: data.avgLot.toFixed(2) },
      { k: "Avg Duration",  v: data.avgDur != null ? fmtDur(data.avgDur) : "—" },
      { k: "Top Session",   v: data.topSession },
      { k: "Top Pair",      v: data.topPair },
      { k: "Top Emotion",   v: data.topEmotion === "untagged" ? "—" : data.topEmotion },
      { k: "Top Day",       v: data.topDay },
    ];
    return (
      <div className="flex-1 rounded-xl p-4" style={{ background: "var(--cj-raised)", border: `1px solid var(--cj-border)` }}>
        <p className="text-sm font-bold mb-4" style={{ color }}>{label}</p>
        {rows.map(r => (
          <div key={r.k} className="flex justify-between items-center py-1.5 text-xs" style={{ borderBottom: "1px solid var(--cj-border)" }}>
            <span className="text-zinc-500">{r.k}</span>
            <span className="text-zinc-200 font-sans">{r.v}</span>
          </div>
        ))}
      </div>
    );
  }

  const insights: string[] = [];
  if (wins && losses) {
    if (wins.avgDur != null && losses.avgDur != null && losses.avgDur > wins.avgDur * 1.3) {
      insights.push(`Your wins last avg ${fmtDur(wins.avgDur)}, losses last ${fmtDur(losses.avgDur)} → You hold losers too long.`);
    }
    if (wins.topSession !== losses.topSession) {
      insights.push(`You win most in ${wins.topSession} session, but lose most in ${losses.topSession}.`);
    }
    if (wins.topPair !== losses.topPair) {
      insights.push(`${wins.topPair} is your best pair (most wins). ${losses.topPair} drags you down the most.`);
    }
  }
  if (buyTrades.length && sellTrades.length) {
    insights.push(`You win ${buyWr.toFixed(1)}% on BUY trades and ${sellWr.toFixed(1)}% on SELL trades.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 flex-col sm:flex-row">
        <CompCol label="Winning Trades" data={wins}   color={GRN} />
        <CompCol label="Losing Trades"  data={losses} color={RED} />
      </div>

      {insights.length > 0 && (
        <div>
          <SectionHead>Insights</SectionHead>
          <div className="grid sm:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <InsightCard key={i} icon={i === 0 ? "›" : "·"} text={ins} highlight={i === 0} />
            ))}
          </div>
        </div>
      )}

      {/* Direction breakdown */}
      <div>
        <SectionHead>BUY vs SELL Performance</SectionHead>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">BUY Trades</p>
            <p className="text-xl font-sans font-bold text-emerald-400">{buyWr.toFixed(1)}%</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">{buyTrades.length} trades</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">SELL Trades</p>
            <p className="text-xl font-sans font-bold text-emerald-400">{sellWr.toFixed(1)}%</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">{sellTrades.length} trades</p>
          </div>
        </div>
      </div>

      {/* Overall stats */}
      {st && (
        <div>
          <SectionHead>Loss Analysis</SectionHead>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Avg Win"      value={f$(st.avgWin)}    color="text-emerald-400" sub={`${st.wins} trades`} />
            <StatCard label="Avg Loss"     value={f$(-st.avgLoss)}  color="text-rose-400"    sub={`${st.losses} trades`} />
            <StatCard label="Win / Loss Ratio" value={(st.avgLoss > 0 ? st.avgWin / st.avgLoss : 0).toFixed(2) + "R"} color="text-[var(--cj-gold)]" />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: STREAKS
// ═══════════════════════════════════════════════════════════════
function TabStreaks({ trades }: { trades: Trade[] }) {
  const st = useMemo(() => streakData(trades), [trades]);

  if (!trades.length) return <Empty />;

  const curLabel = st.currentType === "W"
    ? `▲ ${st.current} win${st.current !== 1 ? "s" : ""} in a row`
    : st.currentType === "L"
    ? `▼ ${st.current} loss${st.current !== 1 ? "es" : ""} in a row`
    : "No trades yet";

  // Build streak calendar (last 60 entries)
  const recent = st.history.slice(-60);

  const insights: string[] = [];
  if (st.bestWin >= 3)  insights.push(`Your best win streak is ${st.bestWin} trades. After ${st.bestWin}+ wins you may be tempted to overtrade — stay disciplined.`);
  if (st.worstLoss >= 3) insights.push(`Your worst loss streak is ${st.worstLoss} trades. Consider a 15-min break after 2 consecutive losses.`);

  return (
    <div className="space-y-8">
      {/* Current streak */}
      <div className="rounded-xl p-5 text-center" style={{ background: "var(--cj-raised)", border: `2px solid ${st.currentType === "W" ? "rgba(52,211,153,0.3)" : st.currentType === "L" ? "rgba(248,113,113,0.3)" : "var(--cj-border)"}` }}>
        <p className={`text-3xl font-bold ${st.currentType === "W" ? "text-emerald-400" : st.currentType === "L" ? "text-rose-400" : "text-zinc-400"}`}>
          {curLabel}
        </p>
        <p className="text-zinc-500 text-sm mt-1">Current streak</p>
      </div>

      {/* Streak records */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Best Win Streak"  value={String(st.bestWin)}   color="text-emerald-400" />
        <StatCard label="Worst Loss Streak" value={String(st.worstLoss)} color="text-rose-400" />
        <StatCard label="Current Streak"    value={st.current > 0 ? `${st.current} ${st.currentType === "W" ? "Wins" : "Losses"}` : "—"}
          color={st.currentType === "W" ? "text-emerald-400" : "text-rose-400"} />
        <StatCard label="Total Trades" value={String(trades.length)} />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <SectionHead>Streak Insights</SectionHead>
          <div className="grid sm:grid-cols-2 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} icon={i === 0 ? "›" : "·"} text={ins} highlight={i === 0} />)}
          </div>
        </div>
      )}

      {/* Trade history timeline */}
      {recent.length > 0 && (
        <div>
          <SectionHead>Recent Trade Results (last {recent.length})</SectionHead>
          <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
            <div className="flex flex-wrap gap-1">
              {recent.map((r, i) => (
                <div key={i} title={`${r.date} — ${r.result === "W" ? "Win" : "Loss"} (streak: ${r.streak})`}
                  className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold cursor-default
                    ${r.result === "W" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"}`}>
                  {r.result}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: MAE/MFE
// ═══════════════════════════════════════════════════════════════
function computeMaeMfe(t: Trade): { mae: number; mfe: number } | null {
  if (t.mae != null && t.mfe != null) return { mae: t.mae, mfe: t.mfe };
  // TP is required to compute MFE (the primary metric); SL is optional — MAE defaults to 0
  if (!t.tp) return null;
  const priceMove = t.exit_price - t.entry;
  if (priceMove === 0 || t.entry === 0) return null;
  const absRate = Math.abs(t.pnl / priceMove);
  const mfePrice = t.direction === "BUY" ? t.tp - t.entry : t.entry - t.tp;
  if (mfePrice <= 0) return null;
  const slValid  = t.sl && t.sl !== t.entry;
  const maePrice = slValid
    ? (t.direction === "BUY" ? t.entry - t.sl! : t.sl! - t.entry)
    : 0;
  return {
    mae: +(Math.max(0, maePrice) * absRate).toFixed(2),
    mfe: +(mfePrice * absRate).toFixed(2),
  };
}

function TabMAEMFE({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <Empty />;

  const plotData = useMemo(() => {
    const out: { mfe: number; pnl: number; pair: string; captured: number }[] = [];
    for (const t of trades) {
      const mm = computeMaeMfe(t);
      if (!mm || mm.mfe <= 0) continue;
      out.push({
        mfe:      mm.mfe,
        pnl:      +t.pnl.toFixed(2),
        pair:     t.pair,
        captured: +(t.pnl / mm.mfe * 100).toFixed(1),
      });
    }
    return out;
  }, [trades]);

  const summary = useMemo(() => {
    if (!plotData.length) return null;
    const avgMae  = +(plotData.reduce((s, d) => {
      const mm = computeMaeMfe(trades.find(t => t.pair === d.pair && +t.pnl.toFixed(2) === d.pnl)!);
      return s + (mm?.mae ?? 0);
    }, 0) / plotData.length).toFixed(2);

    // Recompute from trades directly for accuracy
    const rows = trades.map(t => ({ t, mm: computeMaeMfe(t) })).filter(r => r.mm && r.mm.mfe > 0);
    const avgMaeFinal  = +(rows.reduce((s, r) => s + r.mm!.mae, 0) / rows.length).toFixed(2);
    const avgMfeFinal  = +(rows.reduce((s, r) => s + r.mm!.mfe, 0) / rows.length).toFixed(2);
    const captures     = rows.map(r => r.t.pnl / r.mm!.mfe);
    const avgCapture   = +(captures.reduce((s, c) => s + c, 0) / captures.length * 100).toFixed(1);
    const bestCapture  = +(Math.max(...captures) * 100).toFixed(1);
    const hitTp = rows.filter(r => {
      const t = r.t;
      return t.direction === "BUY" ? t.exit_price >= (t.tp ?? -Infinity) : t.exit_price <= (t.tp ?? Infinity);
    }).length;
    const pctHitTp = +((hitTp / rows.length) * 100).toFixed(1);
    void avgMae;
    return { avgMae: avgMaeFinal, avgMfe: avgMfeFinal, avgCapture, bestCapture, pctHitTp, n: rows.length };
  }, [trades, plotData]);

  const wins   = plotData.filter(d => d.pnl > 0);
  const losses = plotData.filter(d => d.pnl <= 0);

  const insightMsg = summary
    ? `On average you capture ${summary.avgCapture}% of your available profit. Your best trades capture ${summary.bestCapture}%. There's ${Math.max(0, +(100 - summary.avgCapture).toFixed(1))}% more profit being left on the table.`
    : null;

  if (!plotData.length) return (
    <div className="space-y-4">
      <SectionHead>MAE / MFE Analysis</SectionHead>
      <InsightCard icon="›" text="No Take Profit data found on your trades. MT5 Direct Sync captures TP only when it was set on the platform before the trade closed. If you use CSV import, make sure your export includes the TP column." />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Summary stats */}
      {summary && (
        <div>
          <SectionHead>MAE / MFE Summary</SectionHead>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Avg MAE (risk)"    value={f$(summary.avgMae)}               color="text-rose-400"    sub="approx. from SL" />
            <StatCard label="Avg MFE (potential)" value={f$(summary.avgMfe)}             color="text-emerald-400" sub="approx. from TP" />
            <StatCard label="Avg Capture Ratio"  value={`${summary.avgCapture}%`}        color={summary.avgCapture >= 60 ? "text-emerald-400" : summary.avgCapture >= 40 ? "text-yellow-400" : "text-rose-400"} sub="actual P&L / MFE" />
            <StatCard label="% Hit Full TP"      value={`${summary.pctHitTp}%`}          color={summary.pctHitTp >= 50 ? "text-emerald-400" : "text-rose-400"} sub={`${summary.n} trades analysed`} />
          </div>
        </div>
      )}

      {/* Scatter: MFE vs Actual P&L */}
      <div>
        <SectionHead>MFE (Potential Profit) vs Actual P&L</SectionHead>
        <p className="text-[11px] text-zinc-500 -mt-2 mb-3">Green = winning trades · Red = losing trades · Dots higher up relative to the X-axis captured more of the move</p>
        <ChartBox height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <XAxis type="number" dataKey="mfe" name="MFE" tickFormatter={v => `$${v}`}
                tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                label={{ value: "MFE ($)", position: "insideBottom", offset: -4, fill: "#52525b", fontSize: 10 }} />
              <YAxis type="number" dataKey="pnl" name="P&L" tickFormatter={v => `$${v}`}
                tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} width={64} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { mfe: number; pnl: number; pair: string; captured: number };
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
                      <p className="font-bold text-zinc-100">{d.pair}</p>
                      <p className="text-zinc-400">MFE: <span className="font-sans text-emerald-400">{f$(d.mfe)}</span></p>
                      <p className="text-zinc-400">P&L: <span className={`font-sans ${pCls(d.pnl)}`}>{f$(d.pnl)}</span></p>
                      <p className="text-zinc-400">Captured: <span className="font-sans text-zinc-200">{d.captured}%</span></p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
              <Scatter name="Wins"   data={wins}   fill={GRN} fillOpacity={0.75} />
              <Scatter name="Losses" data={losses} fill={RED} fillOpacity={0.75} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* Auto-insight */}
      {insightMsg && <InsightCard icon="›" text={insightMsg} highlight />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: COMPARE
// ═══════════════════════════════════════════════════════════════
function TabCompare({ trades, accounts, selAccount }: { trades: Trade[]; accounts: TradingAccount[]; selAccount: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<"week" | "month" | "custom">("month");
  const [aFrom, setAFrom] = useState("");
  const [aTo,   setATo]   = useState("");
  const [bFrom, setBFrom] = useState("");
  const [bTo,   setBTo]   = useState("");

  // Respect the top-level account filter
  const baseTrades = useMemo(() =>
    selAccount ? trades.filter(t => t.account_signature === selAccount) : trades,
    [trades, selAccount]
  );

  const selectedAcctInfo = selAccount ? accounts.find(a => a.account_signature === selAccount) : null;
  const acctLabel = selectedAcctInfo
    ? `${selectedAcctInfo.account_login || selectedAcctInfo.account_signature}${selectedAcctInfo.account_label ? ` — ${selectedAcctInfo.account_label}` : ""}`
    : "All Accounts";

  const ranges = useMemo(() => {
    if (preset === "week") {
      const thisStart = new Date(); thisStart.setDate(thisStart.getDate() - thisStart.getDay() + 1);
      const lastStart = new Date(thisStart); lastStart.setDate(lastStart.getDate() - 7);
      const lastEnd   = new Date(thisStart); lastEnd.setDate(lastEnd.getDate()   - 1);
      return {
        aFrom: thisStart.toISOString().slice(0, 10), aTo: today,
        bFrom: lastStart.toISOString().slice(0, 10), bTo: lastEnd.toISOString().slice(0, 10),
        aLabel: "This Week", bLabel: "Last Week",
      };
    }
    if (preset === "month") {
      const now = new Date();
      const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      return { aFrom: thisStart, aTo: today, bFrom: lastStart, bTo: lastEnd, aLabel: "This Month", bLabel: "Last Month" };
    }
    return { aFrom, aTo, bFrom, bTo, aLabel: "Period A", bLabel: "Period B" };
  }, [preset, aFrom, aTo, bFrom, bTo, today]);

  const aTradesRaw = useMemo(() => baseTrades.filter(t => inRange(t.date, ranges.aFrom, ranges.aTo)), [baseTrades, ranges]);
  const bTradesRaw = useMemo(() => baseTrades.filter(t => inRange(t.date, ranges.bFrom, ranges.bTo)), [baseTrades, ranges]);
  const stA = useMemo(() => coreStats(aTradesRaw), [aTradesRaw]);
  const stB = useMemo(() => coreStats(bTradesRaw), [bTradesRaw]);

  if (!trades.length) return <Empty />;

  function Arrow({ a, b, higherBetter = true }: { a: number | null | undefined; b: number | null | undefined; higherBetter?: boolean }) {
    if (a == null || b == null) return <span className="text-zinc-600">—</span>;
    const better = higherBetter ? a > b : a < b;
    const same   = Math.abs(a - b) < 0.001;
    if (same) return <span className="text-zinc-500">→</span>;
    return <span className={better ? "text-emerald-400" : "text-rose-400"}>{better ? "↑" : "↓"}</span>;
  }

  const compRows: { label: string; aVal: string; bVal: string; a: number | null; b: number | null; higherBetter?: boolean }[] = [
    { label: "Trades",       aVal: String(aTradesRaw.length), bVal: String(bTradesRaw.length), a: aTradesRaw.length, b: bTradesRaw.length, higherBetter: false },
    { label: "Win Rate",     aVal: stA ? stA.winRate.toFixed(1)+"%" : "—", bVal: stB ? stB.winRate.toFixed(1)+"%" : "—", a: stA?.winRate ?? null, b: stB?.winRate ?? null },
    { label: "Total P&L",    aVal: stA ? f$(stA.totalPnl) : "—", bVal: stB ? f$(stB.totalPnl) : "—", a: stA?.totalPnl ?? null, b: stB?.totalPnl ?? null },
    { label: "Profit Factor",aVal: stA ? (stA.pf === 999 ? "∞" : stA.pf.toFixed(2)) : "—", bVal: stB ? (stB.pf === 999 ? "∞" : stB.pf.toFixed(2)) : "—", a: stA?.pf ?? null, b: stB?.pf ?? null },
    { label: "Avg Win",      aVal: stA ? f$(stA.avgWin) : "—", bVal: stB ? f$(stB.avgWin) : "—", a: stA?.avgWin ?? null, b: stB?.avgWin ?? null },
    { label: "Avg Loss",     aVal: stA ? f$(-stA.avgLoss) : "—", bVal: stB ? f$(-stB.avgLoss) : "—", a: stA?.avgLoss ?? null, b: stB?.avgLoss ?? null, higherBetter: false },
    { label: "Best Trade",   aVal: stA ? f$(stA.best) : "—", bVal: stB ? f$(stB.best) : "—", a: stA?.best ?? null, b: stB?.best ?? null },
    { label: "Avg RR",       aVal: stA ? stA.avgRR.toFixed(2)+"R" : "—", bVal: stB ? stB.avgRR.toFixed(2)+"R" : "—", a: stA?.avgRR ?? null, b: stB?.avgRR ?? null },
  ];

  const improvements: string[] = [];
  if (stA && stB) {
    if (stA.winRate > stB.winRate)   improvements.push(`Win rate improved by +${(stA.winRate - stB.winRate).toFixed(1)}% vs ${ranges.bLabel}.`);
    if (stA.totalPnl > stB.totalPnl) improvements.push(`P&L improved by ${f$(stA.totalPnl - stB.totalPnl)} vs ${ranges.bLabel}.`);
    if (stA.avgLoss < stB.avgLoss)   improvements.push(`Average loss decreased by $${(stB.avgLoss - stA.avgLoss).toFixed(2)} — great risk control.`);
    if (stA.pf > stB.pf && stA.pf !== 999) improvements.push(`Profit factor improved from ${stB.pf.toFixed(2)} to ${stA.pf.toFixed(2)}.`);
  }

  // Account comparison
  const realAccts = accounts.filter(a => a.account_type !== "demo");
  const demoAccts = accounts.filter(a => a.account_type === "demo");

  return (
    <div className="space-y-8">
      {/* Preset selector */}
      <div>
        <SectionHead>Compare Periods</SectionHead>
        <p className="text-[11px] text-zinc-500 -mt-2 mb-4">
          Comparing: <span className="text-zinc-300">{acctLabel}</span>
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {([["week","This Week vs Last Week"],["month","This Month vs Last Month"],["custom","Custom"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setPreset(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${preset === k
                ? "border-[var(--cj-gold)] text-[var(--cj-gold)] bg-[var(--cj-gold-glow)]"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}>
              {label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl p-3" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Period A</p>
              <div className="flex gap-2">
                <input type="date" value={aFrom} onChange={e => setAFrom(e.target.value)} max={today}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-[var(--cj-gold)] outline-none" />
                <input type="date" value={aTo}   onChange={e => setATo(e.target.value)}   max={today}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-[var(--cj-gold)] outline-none" />
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Period B</p>
              <div className="flex gap-2">
                <input type="date" value={bFrom} onChange={e => setBFrom(e.target.value)} max={today}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-[var(--cj-gold)] outline-none" />
                <input type="date" value={bTo}   onChange={e => setBTo(e.target.value)}   max={today}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-[var(--cj-gold)] outline-none" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
              <th className="py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold">Metric</th>
              <th className="py-2 px-3 text-left font-semibold" style={{ color: GOLD }}>{ranges.aLabel}</th>
              <th className="py-2 px-3 text-left font-semibold text-zinc-400">{ranges.bLabel}</th>
              <th className="py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody>
            {compRows.map(row => (
              <tr key={row.label} style={{ borderBottom: "1px solid var(--cj-border)" }}>
                <td className="py-2 px-3 text-zinc-400">{row.label}</td>
                <td className="py-2 px-3 font-sans font-semibold text-zinc-200">{row.aVal}</td>
                <td className="py-2 px-3 font-sans text-zinc-500">{row.bVal}</td>
                <td className="py-2 px-3 text-lg"><Arrow a={row.a} b={row.b} higherBetter={row.higherBetter !== false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Progress insights */}
      {improvements.length > 0 && (
        <div>
          <SectionHead>Progress Insights</SectionHead>
          <div className="grid sm:grid-cols-2 gap-3">
            {improvements.map((ins, i) => <InsightCard key={i} icon="›" text={ins} highlight={i === 0} />)}
          </div>
        </div>
      )}

      {/* Real vs Demo comparison */}
      {realAccts.length > 0 && demoAccts.length > 0 && (() => {
        const realSigs = new Set(realAccts.map(a => a.account_signature));
        const demoSigs = new Set(demoAccts.map(a => a.account_signature));
        const realTrades = trades.filter(t => t.account_signature && realSigs.has(t.account_signature));
        const demoTrades = trades.filter(t => t.account_signature && demoSigs.has(t.account_signature));
        const stReal = coreStats(realTrades);
        const stDemo = coreStats(demoTrades);
        if (!stReal && !stDemo) return null;
        return (
          <div>
            <SectionHead>Real vs Demo Account</SectionHead>
            <div className="grid grid-cols-2 gap-4">
              {[{ label: "Real Account", st: stReal, color: GRN }, { label: "Demo Account", st: stDemo, color: "#facc15" }].map(({ label, st: s, color }) => (
                <div key={label} className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
                  <p className="text-sm font-semibold mb-3" style={{ color }}>{label}</p>
                  {s ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-zinc-500">Win Rate</span><span className="text-zinc-200 font-sans">{s.winRate.toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Total P&L</span><span className={`font-sans font-semibold ${pCls(s.totalPnl)}`}>{f$(s.totalPnl)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Trades</span><span className="text-zinc-200 font-sans">{s.n}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Profit Factor</span><span className="text-zinc-200 font-sans">{s.pf === 999 ? "∞" : s.pf.toFixed(2)}</span></div>
                    </div>
                  ) : <p className="text-zinc-600 text-sm">No trades</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const [user,     setUser]     = useState<User | null>(null);
  const [trades,   setTrades]   = useState<Trade[]>([]);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<Tab>("OVERVIEW");

  // Account + date filters
  const [selAccount,  setSelAccount]  = useState<string>("");
  const [datePreset,  setDatePreset]  = useState<string>("ALL");
  const [customFrom,  setCustomFrom]  = useState<string>("");
  const [customTo,    setCustomTo]    = useState<string>("");
  const [showCustom,  setShowCustom]  = useState(false);

  // ── Load data ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { setLoading(false); return; }
      setUser(u);

      // Try with opened_at/closed_at; fall back without them if the columns don't exist yet
      const FULL_COLS     = "id,pair,direction,lot,date,entry,exit_price,sl,tp,pnl,notes,emotion,entry_emotion,exit_emotion,mae,mfe,asset_class,session,setup,account_signature,account_label,opened_at,closed_at";
      const FALLBACK_COLS = "id,pair,direction,lot,date,entry,exit_price,sl,tp,pnl,notes,emotion,asset_class,session,setup,account_signature,account_label";

      const [tradesRes, { data: aData }] = await Promise.all([
        supabase.from("trades").select(FULL_COLS).eq("user_id", u.id).order("date", { ascending: true }),
        supabase.from("trading_accounts").select("id,account_signature,account_label,account_type,account_currency,current_balance,account_login,account_server").eq("user_id", u.id),
      ]);

      let loadedTrades: Trade[] = [];

      if (tradesRes.error) {
        console.warn("[Reports] Full query failed, retrying without opened_at/closed_at:", tradesRes.error.message);
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from("trades").select(FALLBACK_COLS).eq("user_id", u.id).order("date", { ascending: true });
        if (fallbackErr) {
          console.error("[Reports] Fallback query also failed:", fallbackErr.message);
        } else {
          loadedTrades = (fallbackData as Trade[]) || [];
        }
      } else {
        loadedTrades = (tradesRes.data as Trade[]) || [];
      }

      console.log(`[Reports] Loaded ${loadedTrades.length} trades for user ${u.id}`);

      setTrades(loadedTrades);
      setAccounts((aData as TradingAccount[]) || []);

      // Default to first real account; fall back to first demo if no real accounts
      const allAccts = (aData as TradingAccount[]) || [];
      const real = allAccts.filter((a) => a.account_type !== "demo");
      const first = (real.length > 0 ? real : allAccts)[0];
      if (first) setSelAccount(first.account_signature);

      setLoading(false);
    })();
  }, []);

  // ── Filtered trades ────────────────────────────────────────────
  const filtered = useMemo(() => {
    // No accounts connected — show all manually-entered trades
    const base = accounts.length === 0
      ? trades
      : selAccount
        ? trades.filter(t => t.account_signature === selAccount)
        : [];

    const { from, to } = datePreset === "CUSTOM"
      ? { from: customFrom, to: customTo }
      : rangeFor(datePreset);

    return base.filter(t => inRange(t.date, from, to));
  }, [trades, accounts, selAccount, datePreset, customFrom, customTo]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading reports…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleLogout} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-7">

          {/* Page header */}
          <div className="mb-5">
            <h1 className="text-xl font-bold text-zinc-100">Trading Reports</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Deep analytics from your trade journal</p>
          </div>

          {/* Account switcher */}
          {accounts.length > 0 && (
            <AccountSwitcher
              accounts={accounts}
              selected={selAccount}
              onChange={setSelAccount}
            />
          )}

          {/* Date range filter */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {["7D","30D","90D","ALL"].map(p => (
              <button key={p} onClick={() => { setDatePreset(p); setShowCustom(false); }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${datePreset === p && !showCustom
                  ? "border-zinc-500 text-zinc-200 bg-zinc-800"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"}`}>
                {p === "ALL" ? "All Time" : `Last ${p}`}
              </button>
            ))}
            <button onClick={() => { setShowCustom(s => !s); setDatePreset("CUSTOM"); }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showCustom
                ? "border-zinc-500 text-zinc-200 bg-zinc-800"
                : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
              Custom
            </button>
            {showCustom && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  max={new Date().toISOString().slice(0,10)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-[var(--cj-gold)] outline-none" />
                <span className="text-zinc-600 text-xs">to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  max={new Date().toISOString().slice(0,10)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-[var(--cj-gold)] outline-none" />
              </div>
            )}
            <span className="text-zinc-600 text-xs ml-1">{filtered.length} trades</span>
          </div>

          {/* Tabs — scrollable on mobile */}
          <div className="flex gap-0 mb-6 overflow-x-auto" style={{ borderBottom: "1px solid var(--cj-border)" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`shrink-0 text-[11px] font-semibold px-4 py-2.5 transition-colors whitespace-nowrap
                  ${tab === t
                    ? "text-[var(--cj-gold)] border-b-2 border-[var(--cj-gold)] -mb-px"
                    : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {tab === "OVERVIEW"      && <TabOverview      trades={filtered} onExportCsv={() => exportCsv(filtered)} />}
            {tab === "PERFORMANCE"   && <TabPerformance   trades={filtered} />}
            {tab === "TIME ANALYSIS" && <TabTime          trades={filtered} />}
            {tab === "RISK"          && <TabRisk          trades={filtered} />}
            {tab === "PSYCHOLOGY"    && <TabPsychology    trades={filtered} />}
            {tab === "WINS VS LOSSES" && <TabWinsVsLosses trades={filtered} />}
            {tab === "STREAKS"       && <TabStreaks       trades={filtered} />}
            {tab === "COMPARE"       && <TabCompare       trades={trades}   accounts={accounts} selAccount={selAccount} />}
            {tab === "MAE/MFE"       && <TabMAEMFE        trades={filtered} />}
          </div>

        </main>
      </div>
    </div>
  );
}
