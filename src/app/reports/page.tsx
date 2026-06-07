"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { Sidebar } from "@/components/Sidebar";
import { AccountSwitcher } from "@/components/AccountSwitcher";
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
  "PSYCHOLOGY", "WINS VS LOSSES", "STREAKS", "COMPARE",
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
  revenge: "Revenge", fear: "Fear", greedy: "Greedy",
  confident: "Confident", bored: "Bored", news: "News",
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

function emotionBreakdown(trades: Trade[]) {
  const map: Record<string, { pnl: number; wins: number; n: number }> = {};
  trades.forEach(t => {
    const k = t.emotion || "untagged";
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
      <p className={`text-base sm:text-lg font-mono font-bold leading-tight ${color ?? "text-zinc-100"}`}>{value}</p>
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
        <p key={i} className={`font-mono font-semibold ${(p.value ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
      <p className={`font-mono font-semibold ${payload[0].value >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
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
      <p className={`font-mono font-semibold ${(payload[0].value ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{f$(payload[0].value ?? 0)}</p>
      {d && <p className="text-zinc-500 mt-0.5">{d.trades} trades · {d.winRate}% wr</p>}
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
      <ChartBox title="Equity Curve" height={220}>
        {eq.length < 2
          ? <div className="flex h-full items-center justify-center text-zinc-600 text-sm">Add at least 2 trades</div>
          : (() => {
              const last  = eq[eq.length - 1].value;
              const color = last >= 0 ? GOLD : RED;
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={eq} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={color} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={60} />
                    <Tooltip content={<PnlTooltip />} />
                    <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#eqGrad)" dot={false}
                      activeDot={{ r: 4, fill: color, stroke: "#0d0f14", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              );
            })()
        }
      </ChartBox>

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
                  <td className={`py-2 px-3 font-mono font-semibold ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                  <td className={`py-2 px-3 font-mono font-semibold ${pCls(row.totalPnl)}`}>{f$(row.totalPnl)}</td>
                  <td className={`py-2 px-3 font-mono ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                  <td className="py-2 px-3 font-mono text-emerald-400">{f$(row.best)}</td>
                  <td className="py-2 px-3 font-mono text-rose-400">{f$(row.worst)}</td>
                  <td className={`py-2 px-3 font-mono ${row.pf >= 1.5 ? "text-emerald-400" : row.pf >= 1 ? "text-yellow-400" : "text-rose-400"}`}>
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
                    <td className={`py-2 px-3 font-mono ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                    <td className={`py-2 px-3 font-mono font-semibold ${pCls(row.pnl)}`}>{f$(row.pnl)}</td>
                    <td className={`py-2 px-3 font-mono ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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

      {/* Hour distribution — horizontal bars */}
      <div>
        <SectionHead>Trade Distribution by Hour (0:00 – 23:00)</SectionHead>
        <div className="rounded-xl p-4 space-y-1" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
          {hours.map(h => (
            <div key={h.hour} className="flex items-center gap-2 text-[10px]">
              <span className="w-12 text-right text-zinc-500 shrink-0">{h.hour}</span>
              <div className="flex-1 h-4 rounded overflow-hidden bg-zinc-800/40 relative">
                {h.trades > 0 && (
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${(h.trades / maxTrades) * 100}%`,
                      background: h.pnl > 0 ? GRN : h.pnl < 0 ? RED : "#52525b",
                      opacity: 0.7 + (h.trades / maxTrades) * 0.3,
                    }}
                  />
                )}
              </div>
              <span className={`w-16 text-right font-mono shrink-0 ${pCls(h.pnl)}`}>
                {h.trades > 0 ? f$(h.pnl) : ""}
              </span>
              <span className="w-12 text-right text-zinc-600 shrink-0">
                {h.trades > 0 ? `${h.trades}t` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Day performance */}
      <div className="grid md:grid-cols-2 gap-6">
        <ChartBox title="Day of Week — P&L" height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={36}>
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
                <div key={ds} title={entry ? `${ds}: ${f$(pnl)} (${entry.count} trades)` : ds}
                  className="rounded h-8 flex items-center justify-center text-[10px] font-medium cursor-default transition-opacity hover:opacity-80"
                  style={{ background: bg, color: entry ? (pnl > 0 ? GRN : RED) : "#52525b" }}>
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
                        <p className="font-mono text-rose-400">{(props.payload[0].value as number).toFixed(2)}%</p>
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
function TabPsychology({ trades }: { trades: Trade[] }) {
  const emotions  = useMemo(() => emotionBreakdown(trades), [trades]);
  const afterRate = useMemo(() => afterLossRate(trades),    [trades]);
  const disc      = useMemo(() => disciplineScore(trades),  [trades]);

  if (!trades.length) return <Empty />;

  const bestEmotion  = emotions.filter(e => e.key !== "untagged")[0];
  const worstEmotion = [...emotions].filter(e => e.key !== "untagged").sort((a, b) => a.winRate - b.winRate)[0];
  const scoreColor   = disc.score >= 80 ? "text-emerald-400" : disc.score >= 60 ? "text-yellow-400" : "text-rose-400";

  const tips: string[] = [];
  if (bestEmotion)  tips.push(`Trade most when ${bestEmotion.emotion} — your win rate is ${bestEmotion.winRate}% in that state.`);
  if (worstEmotion && worstEmotion.key !== bestEmotion?.key) tips.push(`Avoid trading when ${worstEmotion.emotion} — only ${worstEmotion.winRate}% win rate.`);
  if (afterRate !== null) tips.push(`After a losing trade, you win ${afterRate.toFixed(1)}% of the time. ${afterRate < 45 ? "Consider a break before re-entering." : "Good recovery rate — keep it up."}`);
  disc.factors.forEach(f => tips.push(`${f.label}: ${f.detail}`));

  return (
    <div className="space-y-8">
      {/* Discipline score */}
      <div className="rounded-xl p-5" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
        <SectionHead>Trading Discipline Score</SectionHead>
        <div className="flex items-end gap-4 mb-4">
          <span className={`text-5xl font-mono font-bold ${scoreColor}`}>{disc.score}</span>
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
                <span className="text-rose-400 font-mono w-8 text-right shrink-0">-{f.impact}</span>
                <span className="text-zinc-400">{f.label}</span>
                <span className="text-zinc-600">— {f.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emotion performance */}
      <div>
        <SectionHead>Performance by Emotion</SectionHead>
        {emotions.length === 0 || emotions.every(e => e.key === "untagged")
          ? <InsightCard icon="›" text="Tag your emotions on each trade to unlock psychology analysis." />
          : (
            <div className="space-y-4">
              <ChartBox title="Win Rate by Emotion" height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={emotions} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barSize={32}>
                    <XAxis dataKey="emotion" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
                    <Tooltip content={<WrTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="3 3" />
                    <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                      {emotions.map((e, i) => <Cell key={i} fill={e.winRate >= 50 ? GRN : RED} fillOpacity={0.75} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--cj-border)" }}>
                      {["Emotion", "Trades", "Win %", "Total P&L", "Avg P&L"].map(h => (
                        <th key={h} className="py-2 px-3 text-left text-zinc-500 uppercase tracking-wide font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emotions.map(row => (
                      <tr key={row.key} style={{ borderBottom: "1px solid var(--cj-border)" }}>
                        <td className="py-2 px-3 text-zinc-200">{row.emotion}</td>
                        <td className="py-2 px-3 text-zinc-400">{row.trades}</td>
                        <td className={`py-2 px-3 font-mono ${row.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{row.winRate}%</td>
                        <td className={`py-2 px-3 font-mono font-semibold ${pCls(row.pnl)}`}>{f$(row.pnl)}</td>
                        <td className={`py-2 px-3 font-mono ${pCls(row.avgPnl)}`}>{f$(row.avgPnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
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
            <span className="text-zinc-200 font-mono">{r.v}</span>
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
            <p className="text-xl font-mono font-bold text-emerald-400">{buyWr.toFixed(1)}%</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">{buyTrades.length} trades</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">SELL Trades</p>
            <p className="text-xl font-mono font-bold text-emerald-400">{sellWr.toFixed(1)}%</p>
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
// TAB: COMPARE
// ═══════════════════════════════════════════════════════════════
function TabCompare({ trades, accounts }: { trades: Trade[]; accounts: TradingAccount[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<"week" | "month" | "custom">("month");
  const [aFrom, setAFrom] = useState("");
  const [aTo,   setATo]   = useState("");
  const [bFrom, setBFrom] = useState("");
  const [bTo,   setBTo]   = useState("");

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

  const aTradesRaw = useMemo(() => trades.filter(t => inRange(t.date, ranges.aFrom, ranges.aTo)), [trades, ranges]);
  const bTradesRaw = useMemo(() => trades.filter(t => inRange(t.date, ranges.bFrom, ranges.bTo)), [trades, ranges]);
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
                <td className="py-2 px-3 font-mono font-semibold text-zinc-200">{row.aVal}</td>
                <td className="py-2 px-3 font-mono text-zinc-500">{row.bVal}</td>
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
                      <div className="flex justify-between"><span className="text-zinc-500">Win Rate</span><span className="text-zinc-200 font-mono">{s.winRate.toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Total P&L</span><span className={`font-mono font-semibold ${pCls(s.totalPnl)}`}>{f$(s.totalPnl)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Trades</span><span className="text-zinc-200 font-mono">{s.n}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Profit Factor</span><span className="text-zinc-200 font-mono">{s.pf === 999 ? "∞" : s.pf.toFixed(2)}</span></div>
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
      const FULL_COLS     = "id,pair,direction,lot,date,entry,exit_price,sl,tp,pnl,notes,emotion,asset_class,session,setup,account_signature,account_label,opened_at,closed_at";
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
            {tab === "COMPARE"       && <TabCompare       trades={trades}   accounts={accounts} />}
          </div>

        </main>
      </div>
    </div>
  );
}
