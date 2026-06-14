"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Sidebar } from "@/components/Sidebar";
import { RiskDistribution } from "@/components/RiskDistribution";
import { TradeNoteModal } from "@/components/TradeNoteModal";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import { DisciplineScore } from "@/components/DisciplineScore";
import { TradeReflectionModal } from "@/components/TradeReflectionModal";
import { SharePerformanceCard } from "@/components/SharePerformanceCard";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { PremiumEquityCurve } from "@/components/EquityCurve";
import { PremiumWinRateChart } from "@/components/PremiumWinRateChart";
import CsvImportModal from "@/components/CsvImportModal";
import { TradeDetailModal, type ReplayTrade } from "@/components/TradeDetailModal";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Trade {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  lot: number;
  date: string;
  entry: number;
  exit_price: number;
  sl: number | null;
  tp: number | null;
  pnl: number;
  notes: string;
  screenshot_url?: string | null;
  emotion?: string | null;
  entry_emotion?: string | null;
  exit_emotion?: string | null;
  asset_class: string;
  session: string;
  setup: string;
  strategy_id?: string | null;
  news_event?: string | null;
  mt5_deal_id?: string | null;
  account_signature?: string | null;
  account_label?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
}

interface Strategy {
  id: string;
  name: string;
}

interface TradingAccount {
  id: string;
  account_signature: string;
  account_label: string | null;
  broker_name: string | null;
  account_login: string | null;
  account_server: string | null;
  account_currency: string;
  account_type: string;
  is_cent: boolean;
  current_balance: number | null;
  last_synced_at: string | null;
  verification_status?: string | null;
  is_verified?: boolean;
  import_status?: string | null;
  sync_source?: "csv" | "metaapi" | null;
  balance?: number | null;
  equity?: number | null;
  floating_pnl?: number | null;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  pair: string;
  direction: "" | "BUY" | "SELL";
  strategyId: string;
}

const ASSET_CLASSES = ["Forex", "Crypto", "Metals", "Indices", "Stocks"] as const;
const SESSIONS      = ["London", "New York", "Asian", "Overlap"] as const;

const EMPTY_FORM = {
  pair: "", lot: "",
  date: new Date().toISOString().split("T")[0],
  entry: "", exit_price: "", sl: "", tp: "", pnl: "",
  notes: "", asset_class: "Forex", session: "London",
  setup: "", strategy_id: "", news_event: "",
};
const EMPTY_FILTERS: Filters = { dateFrom: "", dateTo: "", pair: "", direction: "", strategyId: "" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const EMOTION_EMOJI: Record<string, string> = {
  revenge: "↺", fear: "↓", greedy: "↑",
  confident: "→", bored: "–", news: "◆",
};

const pnlColor = (v: number) =>
  v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-300";

const fmt = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);

// ─── Tooltip components ───────────────────────────────────────────────────────
function EquityTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className={`font-sans font-semibold ${payload[0].value >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {fmt(payload[0].value)}
      </p>
    </div>
  );
}

// ─── Analysis Report ──────────────────────────────────────────────────────────
function AnalysisReport({ text }: { text: string }) {
  const sections = text.split(/^## /m).filter(Boolean);
  return (
    <div className="space-y-4">
      {sections.map((section, i) => {
        const nl = section.indexOf("\n");
        const heading = nl > -1 ? section.slice(0, nl).trim() : section.trim();
        const body    = nl > -1 ? section.slice(nl + 1).trim() : "";
        return (
          <div key={i}>
            <h3 className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold mb-1.5">{heading}</h3>
            <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-xs">{body}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Equity Curve ─────────────────────────────────────────────────────────────
function EquityCurveChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Add at least 2 trades to see your equity curve
      </div>
    );
  }
  const stroke = data[data.length - 1].value >= 0 ? "#F5C518" : "#f87171";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={stroke} stopOpacity={0.18} />
            <stop offset="95%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={58} />
        <Tooltip content={<EquityTooltip />} />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill="url(#eqGrad)" dot={false}
          activeDot={{ r: 4, fill: stroke, stroke: "#0d0f14", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}


// ─── Calendar Heatmap ─────────────────────────────────────────────────────────
function CalendarHeatmap({ dailyData, trades, compact }: {
  dailyData: Record<string, { pnl: number; count: number }>;
  trades: Trade[];
  compact?: boolean;
}) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected,  setSelected]  = useState<string | null>(null);

  const canGoNext =
    viewYear < today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth < today.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();

  const monthEntries = Object.entries(dailyData).filter(([ds]) => {
    const [y, mo] = ds.split("-").map(Number);
    return y === viewYear && mo === viewMonth + 1;
  });

  const maxAbs       = monthEntries.length > 0 ? Math.max(...monthEntries.map(([, v]) => Math.abs(v.pnl))) : 0.01;
  const totalMonthPnl = parseFloat(monthEntries.reduce((s, [, v]) => s + v.pnl, 0).toFixed(2));
  const greenDays    = monthEntries.filter(([, v]) => v.pnl > 0).length;
  const redDays      = monthEntries.filter(([, v]) => v.pnl < 0).length;
  const bestDay      = monthEntries.length > 0 ? monthEntries.reduce((a, b) => a[1].pnl > b[1].pnl ? a : b) : null;
  const worstDay     = monthEntries.length > 0 ? monthEntries.reduce((a, b) => a[1].pnl < b[1].pnl ? a : b) : null;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr   = today.toISOString().split("T")[0];
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString("default", {
    month: "long", year: "numeric",
  });

  // Selected day data
  const selTrades  = selected ? trades.filter((t) => t.date === selected) : [];
  const selEntry   = selected ? dailyData[selected] : null;
  const selWins    = selTrades.filter((t) => t.pnl > 0).length;
  const selWinRate = selTrades.length > 0 ? Math.round((selWins / selTrades.length) * 100) : 0;
  const selBest    = selTrades.length > 0 ? selTrades.reduce((a, b) => a.pnl > b.pnl ? a : b) : null;
  const selWorst   = selTrades.length > 0 ? selTrades.reduce((a, b) => a.pnl < b.pnl ? a : b) : null;

  return (
    <div>
      {/* ── Monthly summary — hidden in compact mode ─────────────── */}
      {!compact && (
        <div className="mb-4 space-y-1.5">
          <div className="bg-[var(--cj-raised)] rounded-lg px-4 py-2.5 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Total P&L</p>
            <p className={`text-sm font-sans font-bold ${totalMonthPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {monthEntries.length > 0 ? fmt(totalMonthPnl) : "—"}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "Green Days", value: monthEntries.length > 0 ? String(greenDays)  : "—", color: "text-emerald-400" },
              { label: "Red Days",   value: monthEntries.length > 0 ? String(redDays)    : "—", color: "text-rose-400"    },
              { label: "Best Day",   value: bestDay  ? fmt(parseFloat(bestDay[1].pnl.toFixed(2)))  : "—", color: "text-emerald-400" },
              { label: "Worst Day",  value: worstDay ? fmt(parseFloat(worstDay[1].pnl.toFixed(2))) : "—", color: "text-rose-400"    },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-2 text-center">
                <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">{label}</p>
                <p className={`text-xs font-sans font-semibold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center text-lg text-zinc-500
                     hover:text-zinc-200 transition-colors rounded hover:bg-zinc-800">
          ‹
        </button>
        <span className="text-sm text-zinc-400 font-medium">{monthLabel}</span>
        <button onClick={nextMonth} disabled={!canGoNext}
          className="w-7 h-7 flex items-center justify-center text-lg text-zinc-500
                     hover:text-zinc-200 transition-colors rounded hover:bg-zinc-800
                     disabled:opacity-25 disabled:cursor-default">
          ›
        </button>
      </div>

      {/* ── Weekday headers ─────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-[3px] mb-[3px]">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d, i) => (
          <div key={i} className="text-[10px] text-zinc-600 text-center">{d}</div>
        ))}
      </div>

      {/* ── Day cells ───────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="h-[76px]" />;
          const ds      = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry   = dailyData[ds];
          const isToday = ds === todayStr;
          const isSel   = ds === selected;

          // Solid, opaque backgrounds — clearly readable on any theme
          let bg: string;
          let border: string;
          if (entry && entry.pnl > 0) {
            const intensity = 0.28 + (Math.abs(entry.pnl) / maxAbs) * 0.52;
            bg     = `rgba(16,185,129,${intensity.toFixed(2)})`;   // emerald-500
            border = "1px solid rgba(16,185,129,0.6)";
          } else if (entry && entry.pnl < 0) {
            const intensity = 0.28 + (Math.abs(entry.pnl) / maxAbs) * 0.52;
            bg     = `rgba(239,68,68,${intensity.toFixed(2)})`;    // red-500
            border = "1px solid rgba(239,68,68,0.6)";
          } else if (entry) {
            bg     = "rgba(113,113,122,0.35)";
            border = "1px solid rgba(113,113,122,0.3)";
          } else {
            bg     = "rgba(113,113,122,0.12)";
            border = "1px solid rgba(113,113,122,0.15)";
          }

          const cellH = compact ? "h-[44px]" : "h-[76px]";
          return (
            <div key={i}
              className={`${cellH} rounded-lg flex flex-col p-1 select-none overflow-hidden
                          ${entry ? "cursor-pointer" : "cursor-default"}
                          ${isToday ? "outline outline-2 outline-[var(--cj-gold)] outline-offset-[-2px]" : ""}
                          ${isSel ? "ring-2 ring-[var(--cj-text)] ring-offset-1 ring-offset-transparent" : ""}`}
              style={{ background: bg, border }}
              onClick={() => entry ? setSelected(isSel ? null : ds) : undefined}
            >
              <span className={`text-[10px] font-semibold leading-none
                                ${entry ? "text-[var(--cj-text)]" : "text-[var(--cj-text-muted)]"}`}>
                {day}
              </span>
              {entry && !compact && (
                <div className="mt-auto flex flex-col gap-[2px] overflow-hidden">
                  <span className="text-[10px] font-sans font-extrabold leading-none whitespace-nowrap overflow-hidden"
                        style={{ color: "var(--cj-text)" }}>
                    {fmt(parseFloat(entry.pnl.toFixed(2)))}
                  </span>
                  <span className="text-[9px] font-medium leading-none whitespace-nowrap"
                        style={{ color: "var(--cj-text-muted)" }}>
                    {entry.count} trade{entry.count !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {entry && compact && (
                <div className="mt-auto overflow-hidden">
                  <span className="text-[9px] font-sans font-bold leading-none whitespace-nowrap overflow-hidden"
                        style={{ color: "var(--cj-text)" }}>
                    {fmt(parseFloat(entry.pnl.toFixed(2)))}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Day detail modal ────────────────────────────────────── */}
      {selected && selEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-sm mx-4 bg-[var(--cj-surface)] border border-zinc-700
                        rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] text-zinc-500 mb-0.5">{selected}</p>
                <p className={`text-xl font-sans font-bold
                               ${selEntry.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {fmt(parseFloat(selEntry.pnl.toFixed(2)))}
                </p>
              </div>
              <button onClick={() => setSelected(null)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 -mr-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "Trades",   value: String(selTrades.length), color: "text-zinc-300" },
                { label: "Win Rate", value: `${selWinRate}%`,          color: selWinRate >= 50 ? "text-emerald-400" : "text-rose-400" },
                { label: "Best",     value: selBest  ? fmt(selBest.pnl)  : "—", color: "text-emerald-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-2 text-center">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
                  <p className={`text-xs font-sans font-semibold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Best / Worst callout */}
            {selBest && selWorst && selTrades.length > 1 && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-emerald-700 uppercase mb-0.5">Best trade</p>
                  <p className="text-xs font-sans font-semibold text-emerald-400">
                    {selBest.pair} · {fmt(selBest.pnl)}
                  </p>
                </div>
                <div className="bg-rose-500/8 border border-rose-500/15 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-rose-700 uppercase mb-0.5">Worst trade</p>
                  <p className="text-xs font-sans font-semibold text-rose-400">
                    {selWorst.pair} · {fmt(selWorst.pnl)}
                  </p>
                </div>
              </div>
            )}

            {/* Trade list */}
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">All trades</p>
            <ul className="space-y-1.5">
              {selTrades.map((t) => (
                <li key={t.id}
                  className="flex items-center justify-between bg-[var(--cj-raised)]
                             rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-sans font-semibold text-zinc-200">{t.pair}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                                      ${t.direction === "BUY"
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-rose-500/10 text-rose-400"}`}>
                      {t.direction}
                    </span>
                    {t.lot > 0 && (
                      <span className="text-[10px] text-zinc-600">{t.lot}L</span>
                    )}
                  </div>
                  <span className={`text-xs font-sans font-semibold
                                    ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmt(t.pnl)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({
  acc, trades, selected, onClick,
}: {
  acc: TradingAccount;
  trades: Trade[];
  selected: boolean;
  onClick: () => void;
}) {
  const isMetaApi = acc.sync_source === "metaapi";
  const todayStr  = new Date().toISOString().split("T")[0];
  const accTrades = trades.filter((t) => t.account_signature === acc.account_signature);
  const todayPnl  = accTrades.filter((t) => t.date === todayStr).reduce((s, t) => s + t.pnl, 0);

  return (
    <div
      onClick={onClick}
      className={`bg-[var(--cj-surface)] border rounded-xl p-4 cursor-pointer transition-colors
                  ${selected
                    ? isMetaApi ? "border-emerald-500/50 bg-emerald-500/5" : "border-blue-500/60 bg-blue-500/5"
                    : "border-zinc-800 hover:border-zinc-700"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isMetaApi && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
            <p className="text-sm font-semibold text-zinc-200 truncate">
              {acc.account_label || acc.broker_name || "MT5 Account"}
            </p>
          </div>
          <p className="text-[10px] text-zinc-600 truncate">
            {acc.broker_name}{acc.account_login ? ` · #${acc.account_login}` : ""}
          </p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end shrink-0">
          {isMetaApi ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
              LIVE
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-zinc-700/40 text-zinc-500 border-zinc-700">
              CSV
            </span>
          )}
          {acc.account_type === "demo" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-yellow-500/15 text-yellow-400 border-yellow-500/25">
              DEMO
            </span>
          )}
          {acc.is_cent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-blue-500/15 text-blue-400 border-blue-500/25">
              CENT
            </span>
          )}
        </div>
      </div>
      {isMetaApi ? (
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: "Balance",  value: acc.balance      != null ? `$${acc.balance.toFixed(2)}`      : "—", cls: "text-zinc-300" },
            { label: "Equity",   value: acc.equity       != null ? `$${acc.equity.toFixed(2)}`       : "—", cls: "text-zinc-300" },
            { label: "Floating", value: acc.floating_pnl != null ? fmt(acc.floating_pnl)             : "—", cls: acc.floating_pnl != null ? pnlColor(acc.floating_pnl) : "text-zinc-400" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-1.5">
              <p className="text-[9px] text-zinc-600">{label}</p>
              <p className={`font-sans text-xs font-semibold mt-0.5 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: "Balance", value: "—",                         cls: "text-zinc-500" },
            { label: "Today",   value: fmt(todayPnl),               cls: pnlColor(todayPnl) },
            { label: "Trades",  value: String(accTrades.length),    cls: "text-zinc-300" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-1.5">
              <p className="text-[9px] text-zinc-600">{label}</p>
              <p className={`font-sans text-xs font-semibold mt-0.5 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TradingJournal() {
  const [trades,            setTrades]            = useState<Trade[]>([]);
  const [tradingAccounts,   setTradingAccounts]   = useState<TradingAccount[]>([]);
  // "" = before init; any other string = specific account_signature
  const [selectedAccountSig, setSelectedAccountSig] = useState<string>("");
  const [form,              setForm]              = useState(EMPTY_FORM);
  const [direction,         setDirection]         = useState<"BUY" | "SELL">("BUY");
  const [toast,             setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [currentUser,       setCurrentUser]       = useState<User | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [editingId,         setEditingId]         = useState<string | null>(null);
  const [filters,           setFilters]           = useState<Filters>(EMPTY_FILTERS);
  const [tablePage,         setTablePage]         = useState(1);
  const [analysisLoading,   setAnalysisLoading]   = useState(false);
  const [currentAnalysis,   setCurrentAnalysis]   = useState<{
    analysis: string; period: string; created_at: string;
  } | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<{
    id: string; period: string; trade_count: number; analysis: string; created_at: string;
  }[]>([]);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [noteModalTrade,       setNoteModalTrade]       = useState<Trade | null>(null);
  const [reflectionTrade,      setReflectionTrade]      = useState<Trade | null>(null);
  const [drilldownTrade,       setDrilldownTrade]       = useState<ReplayTrade | null>(null);
  const [aiCreditsUsed,    setAiCreditsUsed]    = useState<number>(0);
  const [aiCreditsLimit,   setAiCreditsLimit]   = useState<number>(3);
  const [trialDaysLeft,    setTrialDaysLeft]    = useState<number | null>(null);
  const [isSyncing,        setIsSyncing]        = useState(false);
  const [sourceFilter,     setSourceFilter]     = useState<"csv" | "metaapi">("csv");
  const [strategies,       setStrategies]       = useState<Strategy[]>([]);
  const [shareOpen,        setShareOpen]        = useState(false);
  const [showCsvImport,    setShowCsvImport]    = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: "ok" | "err") { setToast({ msg, type }); }

  function markSyncing() {
    setIsSyncing(true);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => setIsSyncing(false), 5000);
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setCurrentUser(user);

      const [profileRes, tradesRes, accountsRes, strategiesRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_status, subscription_end, ai_credits_used, ai_credits_limit, created_at, onboarding_completed")
          .eq("user_id", user.id).maybeSingle(),
        supabase
          .from("trades")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("trading_accounts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("strategies")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name"),
      ]);

      if (tradesRes.data) setTrades(tradesRes.data as Trade[]);
      if (strategiesRes.data) setStrategies(strategiesRes.data as Strategy[]);
      if (accountsRes.data) {
        const accounts = accountsRes.data as TradingAccount[];
        setTradingAccounts(accounts);
        // Choose default source: prefer metaapi if available
        const metaAccs = accounts.filter((a) => a.sync_source === "metaapi");
        const csvAccs  = accounts.filter((a) => !a.sync_source || a.sync_source === "csv");
        const defaultSrc: "csv" | "metaapi" = metaAccs.length > 0 ? "metaapi" : "csv";
        setSourceFilter(defaultSrc);
        const srcAccounts = defaultSrc === "metaapi" ? metaAccs : csvAccs;
        const real  = srcAccounts.filter((a) => a.account_type !== "demo");
        const first = (real.length > 0 ? real : srcAccounts)[0];
        if (first) setSelectedAccountSig(first.account_signature);
      }

      // Onboarding gate: redirect new users who haven't completed setup and have no trades
      const hasTrades = (tradesRes.data?.length ?? 0) > 0;
      const profileData = profileRes.data as { onboarding_completed?: boolean } | null;
      if (!profileData?.onboarding_completed && !hasTrades) {
        window.location.href = "/onboarding";
        return;
      }

      if (tradesRes.error) showToast("Failed to load trades", "err");
      setLoading(false);

      if (profileRes.data) {
        const p = profileRes.data as {
          ai_credits_used?: number;
          ai_credits_limit?: number;
          subscription_status?: string;
          subscription_end?: string;
          created_at?: string;
        } | null;
        if (p) {
          setAiCreditsUsed(p.ai_credits_used ?? 0);
          setAiCreditsLimit(p.ai_credits_limit ?? 3);

          const isPaid = p.subscription_status === "pro" &&
            !!p.subscription_end && new Date(p.subscription_end) > new Date();
          if (!isPaid && p.created_at) {
            const trialEnd = new Date(new Date(p.created_at).getTime() + 3 * 86_400_000);
            const days = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000));
            setTrialDaysLeft(days);
          } else if (isPaid) {
            setTrialDaysLeft(null);
          }
        }
      }

      const { data: analyses } = await supabase
        .from("journal_analyses")
        .select("id, period, trade_count, analysis, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (analyses) setPastAnalyses(analyses);

      // Realtime: INSERT, UPDATE, DELETE for instant dashboard updates
      channel = supabase
        .channel(`trades-rt-${user.id}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "trades", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const t = payload.new as Trade;
            setTrades((prev) => {
              if (prev.some((e) => e.id === t.id)) return prev;
              if (t.mt5_deal_id) {
                showToast("Trade synced from MT5", "ok");
                markSyncing();
              }
              return [t, ...prev];
            });
          }
        )
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "trades", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const t = payload.new as Trade;
            setTrades((prev) => prev.map((e) => (e.id === t.id ? { ...e, ...t } : e)));
          }
        )
        .on("postgres_changes",
          { event: "DELETE", schema: "public", table: "trades", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const old = payload.old as { id: string };
            setTrades((prev) => prev.filter((e) => e.id !== old.id));
          }
        )
        // Realtime for trading_accounts (new account connected via MT5)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "trading_accounts", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const a = payload.new as TradingAccount;
            setTradingAccounts((prev) => prev.some((e) => e.id === a.id) ? prev : [...prev, a]);
          }
        )
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "trading_accounts", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const a = payload.new as TradingAccount;
            setTradingAccounts((prev) => prev.map((e) => (e.id === a.id ? { ...e, ...a } : e)));
          }
        )
        .subscribe();
    }

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);


  // ── Account-filtered trade set (used for all stats and charts) ─────────────
  const accountTrades = useMemo(() => {
    // No accounts connected — show all manually-entered trades
    if (tradingAccounts.length === 0) return trades;
    if (!selectedAccountSig) return [];
    return trades.filter((t) => t.account_signature === selectedAccountSig);
  }, [trades, selectedAccountSig, tradingAccounts]);

  // ── View mode: live vs demo ───────────────────────────────────────────────
  const isViewingDemo = useMemo(
    () => tradingAccounts.find((a) => a.account_signature === selectedAccountSig)?.account_type === "demo",
    [selectedAccountSig, tradingAccounts]
  );

  // ── Source grouping ────────────────────────────────────────────────────────
  const csvAccounts     = useMemo(() => tradingAccounts.filter((a) => !a.sync_source || a.sync_source === "csv"),     [tradingAccounts]);
  const metaapiAccounts = useMemo(() => tradingAccounts.filter((a) => a.sync_source === "metaapi"),                   [tradingAccounts]);
  const hasMultipleSources = csvAccounts.length > 0 && metaapiAccounts.length > 0;
  const visibleAccounts = hasMultipleSources
    ? (sourceFilter === "metaapi" ? metaapiAccounts : csvAccounts)
    : tradingAccounts;

  // ── Computed stats (based on account-filtered trades) ─────────────────────
  const totalPnl = accountTrades.reduce((s, t) => s + t.pnl, 0);
  const wins     = accountTrades.filter((t) => (t.pnl || 0) > 0).length;
  const losses   = accountTrades.filter((t) => (t.pnl || 0) < 0).length;
  const winRate  = accountTrades.length > 0 ? ((wins / accountTrades.length) * 100).toFixed(1) : null;
  const avgPnl   = accountTrades.length > 0 ? (totalPnl / accountTrades.length).toFixed(2) : null;

  const profitFactor = useMemo(() => {
    const grossWin  = accountTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(accountTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    return grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 3 : 0;
  }, [accountTrades]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const equityCurveData = useMemo(() => {
    const sorted = [...accountTrades].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.reduce<{ label: string; value: number }[]>((acc, t) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
      return [...acc, { label: t.date, value: parseFloat((prev + t.pnl).toFixed(2)) }];
    }, []);
  }, [accountTrades]);

  const pairWinRateData = useMemo(() => {
    const map: Record<string, { wins: number; total: number; pnl: number }> = {};
    for (const t of accountTrades) {
      if (!map[t.pair]) map[t.pair] = { wins: 0, total: 0, pnl: 0 };
      map[t.pair].total++;
      map[t.pair].pnl = parseFloat((map[t.pair].pnl + t.pnl).toFixed(2));
      if (t.pnl > 0) map[t.pair].wins++;
    }
    return Object.entries(map)
      .map(([pair, s]) => ({
        pair,
        winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
        total: s.total,
        pnl: s.pnl,
      }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [accountTrades]);

  const bestPair  = pairWinRateData.length > 0 ? pairWinRateData[0].pair : "—";
  const worstPair = pairWinRateData.length > 1 ? pairWinRateData[pairWinRateData.length - 1].pair : "—";

  const badgeInfo = useMemo(() => {
    if (accountTrades.length === 0) return { icon: "🥉", name: "Bronze Trader" };
    const wr = (wins / accountTrades.length) * 100;
    const gw = accountTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const gl = Math.abs(accountTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const pf = gl > 0 ? gw / gl : gw > 0 ? 3 : 1;
    const score = Math.min(100, Math.round(
      Math.min(30, (wr / 60) * 30) +
      Math.min(25, Math.max(0, (pf - 1) * 25)) +
      Math.min(10, (accountTrades.length / 50) * 10)
    ));
    if (score >= 86) return { icon: "👑", name: "Legend" };
    if (score >= 71) return { icon: "💎", name: "Diamond Trader" };
    if (score >= 51) return { icon: "🥇", name: "Gold Trader" };
    if (score >= 31) return { icon: "🥈", name: "Silver Trader" };
    return { icon: "🥉", name: "Bronze Trader" };
  }, [accountTrades, wins]);

  const dailyData = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {};
    for (const t of accountTrades) {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 };
      map[t.date].pnl = parseFloat((map[t.date].pnl + t.pnl).toFixed(2));
      map[t.date].count++;
    }
    return map;
  }, [accountTrades]);

  const niriInsight = useMemo(() => {
    if (accountTrades.length < 5) return null;
    const sorted = [...accountTrades].sort((a, b) => a.date.localeCompare(b.date));

    // Revenge trades — most behaviorally severe
    const dayPairHadLoss: Record<string, Set<string>> = {};
    const revengeTrades: typeof accountTrades = [];
    for (const t of sorted) {
      if (!dayPairHadLoss[t.date]) dayPairHadLoss[t.date] = new Set();
      if (dayPairHadLoss[t.date].has(t.pair) && t.pnl < 0) revengeTrades.push(t);
      if (t.pnl < 0) dayPairHadLoss[t.date].add(t.pair);
    }
    if (revengeTrades.length > 0) {
      const impact = revengeTrades.reduce((s, t) => s + t.pnl, 0);
      const a = Math.abs(impact);
      const impactStr = impact < 0
        ? `−$${a >= 1000 ? (a / 1000).toFixed(1) + "k" : a.toFixed(0)}`
        : `+$${a.toFixed(0)}`;
      return `⚡ ${revengeTrades.length} likely revenge trade${revengeTrades.length > 1 ? "s" : ""} detected — they account for ${impactStr} of your P&L.`;
    }

    // Overtrading
    const byDay: Record<string, number> = {};
    for (const t of accountTrades) byDay[t.date] = (byDay[t.date] || 0) + 1;
    const overtradeDays = Object.values(byDay).filter(c => c > 3).length;
    if (overtradeDays > 0) {
      return `📈 ${overtradeDays} day${overtradeDays > 1 ? "s" : ""} with 4+ trades this period — overtrading can erode your edge over time.`;
    }

    // Risk variance
    const lots = accountTrades.map(t => t.lot);
    const avg = lots.reduce((s, l) => s + l, 0) / lots.length;
    const stdDev = Math.sqrt(lots.reduce((s, l) => s + (l - avg) ** 2, 0) / lots.length);
    const cv = avg > 0 ? stdDev / avg : 0;
    if (cv > 0.3) {
      return `⚖️ High lot-size variance (${(cv * 100).toFixed(0)}% CV) — inconsistent risk sizing makes your edge hard to measure.`;
    }

    return null;
  }, [accountTrades]);

  // ── Filtered trades (account filter + table filters) ─────────────────────
  const strategyMap = useMemo(() =>
    new Map(strategies.map((s) => [s.id, s.name])),
  [strategies]);

  const filteredTrades = useMemo(() => {
    return accountTrades.filter((t) => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo   && t.date > filters.dateTo)   return false;
      if (filters.pair && !t.pair.toLowerCase().includes(filters.pair.toLowerCase())) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      if (filters.strategyId && t.strategy_id !== filters.strategyId) return false;
      return true;
    });
  }, [accountTrades, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const PAGE_SIZE = 10;
  const sortedFilteredTrades = useMemo(() =>
    [...filteredTrades].sort((a, b) => b.date.localeCompare(a.date)),
  [filteredTrades]);
  const totalPages  = Math.max(1, Math.ceil(sortedFilteredTrades.length / PAGE_SIZE));
  const pagedTrades = sortedFilteredTrades.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);

  // Reset to page 1 whenever filters change
  useEffect(() => { setTablePage(1); }, [filters]);

  // Win rate grouped by strategy (all account trades, not filtered)
  const strategyStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; wins: number }>();
    for (const t of accountTrades) {
      if (!t.strategy_id) continue;
      const name = strategyMap.get(t.strategy_id) ?? "Unknown";
      const entry = map.get(t.strategy_id) ?? { name, total: 0, wins: 0 };
      entry.total++;
      if (t.pnl > 0) entry.wins++;
      map.set(t.strategy_id, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [accountTrades, strategyMap]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function addTrade() {
    if (!form.pair.trim())              return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0)    return showToast("Enter a valid lot size", "err");
    if (!form.entry || !form.exit_price) return showToast("Enter entry and exit prices", "err");
    if (!currentUser)                   return;

    if (form.pnl === "") return showToast("Enter the P&L (profit/loss in USD)", "err");
    const pnl = parseFloat(form.pnl);
    if (isNaN(pnl)) return showToast("P&L must be a number", "err");

    const payload = {
      user_id: currentUser.id,
      pair: form.pair.toUpperCase(),
      direction,
      lot: parseFloat(form.lot),
      date: form.date,
      entry: parseFloat(form.entry),
      exit_price: parseFloat(form.exit_price),
      sl: form.sl ? parseFloat(form.sl) : null,
      tp: form.tp ? parseFloat(form.tp) : null,
      pnl,
      notes: form.notes,
      asset_class: form.asset_class,
      session: form.session,
      setup: form.setup,
      strategy_id: form.strategy_id || null,
      news_event: form.news_event.trim() || null,
    };

    const supabase = createClient();
    const { data, error } = await supabase.from("trades").insert(payload).select().single();
    if (error) { showToast("Failed to save trade", "err"); return; }

    setTrades((prev) => {
      if (prev.some((e) => e.id === (data as Trade).id)) return prev;
      return [data as Trade, ...prev];
    });
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
    showToast(`${payload.pair} added — ${fmt(pnl)}`, "ok");
  }

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setDirection(trade.direction);
    setForm({
      pair: trade.pair, lot: String(trade.lot), date: trade.date,
      entry: String(trade.entry), exit_price: String(trade.exit_price),
      sl: trade.sl ? String(trade.sl) : "", tp: trade.tp ? String(trade.tp) : "",
      pnl: trade.pnl != null ? String(trade.pnl) : "", notes: trade.notes,
      asset_class: trade.asset_class || "Forex", session: trade.session || "London",
      setup: trade.setup || "", strategy_id: trade.strategy_id || "", news_event: trade.news_event || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit() {
    if (!currentUser) return;
    if (!form.pair.trim())              return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0)    return showToast("Enter a valid lot size", "err");
    if (!form.entry || !form.exit_price) return showToast("Enter entry and exit prices", "err");

    if (form.pnl === "") return showToast("Enter the P&L (profit/loss in USD)", "err");
    const pnl = parseFloat(form.pnl);
    if (isNaN(pnl)) return showToast("P&L must be a number", "err");

    const updates = {
      pair: form.pair.toUpperCase(), direction, lot: parseFloat(form.lot), date: form.date,
      entry: parseFloat(form.entry), exit_price: parseFloat(form.exit_price),
      sl: form.sl ? parseFloat(form.sl) : null, tp: form.tp ? parseFloat(form.tp) : null,
      pnl, notes: form.notes, asset_class: form.asset_class, session: form.session,
      setup: form.setup, strategy_id: form.strategy_id || null,
      news_event: form.news_event.trim() || null,
    };

    const supabase = createClient();
    const { error } = await supabase.from("trades").update(updates)
      .eq("id", editingId!).eq("user_id", currentUser.id);
    if (error) { showToast("Failed to update trade", "err"); return; }

    setTrades((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...updates } : t)));
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
    showToast("Trade updated", "ok");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
  }

  function handleNoteSave(notes: string, screenshotUrl: string | null, emotion: string | null, entryEmotion: string | null, exitEmotion: string | null) {
    if (!noteModalTrade) return;
    setTrades((prev) =>
      prev.map((t) => t.id === noteModalTrade.id
        ? { ...t, notes, screenshot_url: screenshotUrl, emotion, entry_emotion: entryEmotion, exit_emotion: exitEmotion }
        : t)
    );
  }

  async function loadPastAnalyses() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("journal_analyses")
      .select("id, period, trade_count, analysis, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
    if (data) setPastAnalyses(data);
  }

  async function runAnalysis(period: "daily" | "weekly" | "monthly") {
    setAnalysisLoading(true);
    setCurrentAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json() as { analysis?: string; error?: string; trial_reason?: string; created_at?: string };
      if (!res.ok) {
        showToast(data.error || "Analysis failed", "err");
        return;
      }
      setCurrentAnalysis({ analysis: data.analysis!, period, created_at: data.created_at || new Date().toISOString() });
      await loadPastAnalyses();
      // Refresh credit counter from DB after analysis is saved
      const supabase = createClient();
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("ai_credits_used, ai_credits_limit")
        .eq("user_id", currentUser!.id)
        .maybeSingle();
      if (prof) {
        const p = prof as { ai_credits_used?: number; ai_credits_limit?: number };
        setAiCreditsUsed(p.ai_credits_used ?? 0);
        setAiCreditsLimit(p.ai_credits_limit ?? 3);
      }
    } catch {
      showToast("Analysis failed", "err");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function deleteTrade(id: string) {
    if (!currentUser) return;
    const supabase = createClient();
    const { error } = await supabase.from("trades").delete().eq("id", id).eq("user_id", currentUser.id);
    if (error) { showToast("Failed to delete trade", "err"); return; }
    setTrades((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) cancelEdit();
    showToast("Trade deleted", "err");
  }

  async function clearAllTrades() {
    if (!currentUser) return;
    const tradeIds = accountTrades.map((t) => t.id);
    if (tradeIds.length === 0) { showToast("No trades to clear", "err"); return; }
    if (!confirm(`Delete ALL ${tradeIds.length} trade${tradeIds.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("trades").delete()
      .eq("user_id", currentUser.id).in("id", tradeIds);
    if (error) { showToast("Failed to clear trades", "err"); return; }
    const deleted = new Set(tradeIds);
    setTrades((prev) => prev.filter((t) => !deleted.has(t.id)));
    cancelEdit();
    showToast(`Cleared ${tradeIds.length} trade${tradeIds.length !== 1 ? "s" : ""}`, "err");
  }

  const isEditing = editingId !== null;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">

      <Sidebar user={currentUser} onSignOut={handleLogout} />

      {shareOpen && (
        <SharePerformanceCard
          winRate={winRate}
          totalTrades={accountTrades.length}
          totalPnl={totalPnl}
          profitFactor={profitFactor}
          bestPair={bestPair}
          worstPair={worstPair}
          badgeName={badgeInfo.name}
          badgeIcon={badgeInfo.icon}
          onClose={() => setShareOpen(false)}
        />
      )}

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 sm:py-7">

        {/* MT5 SYNC INDICATOR */}
        {isSyncing && (
          <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium"
               style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-emerald-400">Syncing trades from MT5...</span>
          </div>
        )}

        {/* TRIAL BANNER — shown while trial is active */}
        {trialDaysLeft !== null && trialDaysLeft > 0 && (
          <div className="mb-5 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border"
               style={{ background: "rgba(245,197,24,0.06)", borderColor: "rgba(245,197,24,0.2)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                   style={{ background: "rgba(245,197,24,0.12)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <p className="text-xs" style={{ color: "#C4B89A" }}>
                <span className="font-semibold" style={{ color: "var(--cj-gold)" }}>Free trial</span>
                {" "}— {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining. All Pro features are unlocked.
              </p>
            </div>
            <a href="/pricing"
               className="text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0"
               style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
              Upgrade →
            </a>
          </div>
        )}

        {/* MT5 connection reminder — shown until the user connects an account */}
        {!loading && tradingAccounts.length === 0 && (
          <div className="mb-5 flex items-center justify-between gap-4 px-4 py-3 rounded-xl"
               style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.2)" }}>
            <div className="flex items-center gap-3">
              <span className="text-lg shrink-0">📡</span>
              <p className="text-xs leading-relaxed" style={{ color: "#C4B89A" }}>
                <span className="font-semibold" style={{ color: "var(--cj-gold)" }}>Connect your MT5</span>
                {" "}to start syncing trades automatically — no manual entry needed.
              </p>
            </div>
            <a href="/settings"
               className="text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0"
               style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
              Connect →
            </a>
          </div>
        )}

        {/* ACCOUNT SWITCHER ── shown when accounts are connected */}
        {tradingAccounts.length > 0 && (() => {
          const selectedAcc = tradingAccounts.find((a) => a.account_signature === selectedAccountSig);
          return (
            <div className="mb-5">
              {/* Source tabs — only shown when user has both CSV and MetaAPI accounts */}
              {hasMultipleSources && (
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      setSourceFilter("csv");
                      const first = csvAccounts[0];
                      if (first) setSelectedAccountSig(first.account_signature);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                      ${sourceFilter === "csv"
                        ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"}`}
                  >
                    📁 CSV History
                  </button>
                  <button
                    onClick={() => {
                      setSourceFilter("metaapi");
                      const first = metaapiAccounts[0];
                      if (first) setSelectedAccountSig(first.account_signature);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                      ${sourceFilter === "metaapi"
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sourceFilter === "metaapi" ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
                    LIVE: MetaAPI
                  </button>
                </div>
              )}
              <AccountSwitcher
                accounts={visibleAccounts}
                selected={selectedAccountSig}
                onChange={setSelectedAccountSig}
              />
              {selectedAcc && (
                <AccountCard
                  acc={selectedAcc}
                  trades={trades}
                  selected={true}
                  onClick={() => {}}
                />
              )}
            </div>
          );
        })()}


        {/* DEMO disclaimer */}
        {isViewingDemo && tradingAccounts.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-xl text-xs text-yellow-400 font-medium"
               style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)" }}>
            Demo performance does not reflect real trading results.
          </div>
        )}

        {/* ── ROW 1: Stat strip ── */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest">Overview</p>
          {accountTrades.length > 0 && (
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700
                         text-zinc-400 hover:border-[var(--cj-gold)] hover:text-[var(--cj-gold)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: tradingAccounts.length > 0
                ? (isViewingDemo ? "Demo P&L" : "Live P&L")
                : "Total P&L",
              value: fmt(totalPnl),
              cls: pnlColor(totalPnl),
              sub: `${accountTrades.length} trade${accountTrades.length !== 1 ? "s" : ""}`,
            },
            {
              label: "Win Rate",
              value: winRate ? `${winRate}%` : "—",
              cls: winRate ? pnlColor(parseFloat(winRate) - 50) : "text-zinc-400",
              sub: winRate ? `${wins}W / ${losses}L` : "No trades yet",
            },
            {
              label: "Total Trades",
              value: String(accountTrades.length),
              cls: "text-zinc-100",
              sub: `${wins} wins · ${losses} losses`,
            },
            {
              label: "Avg P&L / Trade",
              value: avgPnl ? fmt(parseFloat(avgPnl)) : "—",
              cls: avgPnl ? pnlColor(parseFloat(avgPnl)) : "text-zinc-400",
              sub: "Per closed trade",
            },
          ].map((card) => (
            <div key={card.label}
              className="bg-[var(--cj-surface)] border border-zinc-800 rounded-xl px-5 py-4
                         hover:border-zinc-700 transition-colors">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">{card.label}</p>
              <p className={`font-sans text-2xl font-semibold ${card.cls}`}>{card.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── ROW 2: Equity curve — full-width hero ── */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 mb-6">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Equity Curve</p>
          {equityCurveData.length < 2
            ? <div className="flex items-center justify-center py-16 text-zinc-600 text-sm">Add at least 2 trades to see your equity curve</div>
            : <PremiumEquityCurve data={equityCurveData} />
          }
        </div>

        {/* ── ROW 3: Discipline | Calendar | Win Rate — 3 equal-height columns ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 items-start">
          <DisciplineScore trades={accountTrades} hideTrend />

          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Daily P&L Calendar</p>
            <CalendarHeatmap dailyData={dailyData} trades={accountTrades} compact />
          </div>

          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">Win Rate by Pair</p>
            <PremiumWinRateChart data={pairWinRateData} />
          </div>
        </div>

        {/* ── ROW 4: NIRI Insight strip ── */}
        {niriInsight && (
          <div className="mb-6 px-4 py-3.5 rounded-xl flex items-start gap-3"
               style={{ background: "#FBF4E4", border: "1px dashed #C9A227" }}>
            <p className="text-sm leading-relaxed" style={{ color: "#7A5C1E" }}>{niriInsight}</p>
          </div>
        )}

        {/* RISK & DISTRIBUTION + PERFORMANCE BADGE — side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
          <RiskDistribution trades={accountTrades} />
          <PerformanceBadge trades={accountTrades} />
        </div>

        {/* AI JOURNAL ANALYSIS — full width, no Pro gate */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <p className="card-label">AI Journal Analysis</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border
                ${aiCreditsUsed >= aiCreditsLimit
                  ? "bg-rose-500/10 border-rose-500/25 text-rose-400"
                  : "bg-[var(--cj-gold-glow)] border-[var(--cj-gold)]/25 text-[var(--cj-gold)]"
                }`}>
                {aiCreditsUsed}/{aiCreditsLimit} credits
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => runAnalysis("daily")} disabled={analysisLoading}
                className="text-xs px-4 py-2 rounded-lg bg-[var(--cj-raised)] border border-zinc-700
                           hover:border-emerald-500/50 text-zinc-300 hover:text-zinc-100
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                Analyse Today
              </button>
              <button onClick={() => runAnalysis("weekly")} disabled={analysisLoading}
                className="text-xs px-4 py-2 rounded-lg bg-[var(--cj-raised)] border border-zinc-700
                           hover:border-blue-500/50 text-zinc-300 hover:text-zinc-100
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                Last 7 Days
              </button>
              <button onClick={() => runAnalysis("monthly")} disabled={analysisLoading}
                className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                Last 30 Days
              </button>
            </div>
          </div>

          {analysisLoading && (
            <div className="flex items-center justify-center gap-3 py-10 text-zinc-500">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Analysing your trades with Claude...</span>
            </div>
          )}

          {!analysisLoading && currentAnalysis && (
            <div className="border border-zinc-800 rounded-xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-widest text-blue-500/70
                                 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                  {currentAnalysis.period === "daily" ? "Today" : currentAnalysis.period === "weekly" ? "Last 7 days" : "Last 30 days"}
                </span>
                <span className="text-[10px] text-zinc-700">
                  {new Date(currentAnalysis.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              <AnalysisReport text={currentAnalysis.analysis} />
            </div>
          )}

          {!analysisLoading && !currentAnalysis && pastAnalyses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <div className="w-10 h-10 rounded-xl bg-[var(--cj-raised)] border border-zinc-800
                              flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                  <path d="M5 14v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>
                  <circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>
                </svg>
              </div>
              <p className="text-sm text-zinc-500 font-semibold mb-1">No analyses yet</p>
              <p className="text-xs">Click a button above to get your first AI coaching report</p>
            </div>
          )}

          {pastAnalyses.length > 0 && (
            <div className={currentAnalysis ? "border-t border-zinc-800 pt-4" : ""}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-3">Past Analyses</p>
              <div className="space-y-2">
                {pastAnalyses.map((a) => (
                  <div key={a.id} className="border border-zinc-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedAnalysis(expandedAnalysis === a.id ? null : a.id)}
                      className="w-full flex items-center justify-between px-4 py-3
                                 hover:bg-zinc-800/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                          {a.period === "daily" ? "Today" : a.period === "weekly" ? "7 days" : "30 days"}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <span className="text-[10px] text-zinc-700">{a.trade_count} trades</span>
                      </div>
                      <span className="text-zinc-600 text-[10px]">{expandedAnalysis === a.id ? "▲" : "▼"}</span>
                    </button>
                    {expandedAnalysis === a.id && (
                      <div className="px-4 pb-4 border-t border-zinc-800 pt-4">
                        <AnalysisReport text={a.analysis} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MAIN GRID — trade form + history table */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

          {/* ── FORM PANEL ── */}
          <div className={`bg-[var(--cj-surface)] border rounded-2xl p-6 transition-colors
                           ${isEditing ? "border-blue-500/50" : "border-zinc-800"}`}>
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-zinc-800">
              <p className="card-label">
                {isEditing ? "Edit Trade" : "New Trade"}
              </p>
              {isEditing && (
                <button onClick={cancelEdit}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-700
                             rounded-lg px-2.5 py-1 transition-colors">Cancel</button>
              )}
            </div>

            <label className="block mb-4">
              <span className="label">Currency Pair</span>
              <input className="inp" placeholder="e.g. EURUSD" value={form.pair}
                onChange={(e) => setForm({ ...form, pair: e.target.value })} />
            </label>

            <div className="mb-4">
              <span className="label">Direction</span>
              <div className="flex gap-2 mt-1.5">
                {(["BUY", "SELL"] as const).map((d) => (
                  <button key={d} onClick={() => setDirection(d)}
                    style={direction === d && d === "BUY"
                      ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" }
                      : undefined}
                    className={`flex-1 py-2.5 rounded-lg font-sans text-xs font-semibold tracking-widest
                                border transition-all
                                ${direction === d
                      ? d === "BUY"
                        ? "border-[var(--cj-gold)] text-[#0A0A0F]"
                        : "bg-rose-500/15 border-rose-500 text-rose-400"
                      : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                    {d === "BUY" ? "▲ " : "▼ "}{d}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Asset Class</span>
                <select className="inp" value={form.asset_class}
                  onChange={(e) => setForm({ ...form, asset_class: e.target.value })}>
                  {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Session</span>
                <select className="inp" value={form.session}
                  onChange={(e) => setForm({ ...form, session: e.target.value })}>
                  {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <label className="block mb-4">
              <span className="label">Setup Type</span>
              <input className="inp" placeholder="e.g. Break & Retest, OB, Liquidity Sweep"
                value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} />
            </label>

            {strategies.length > 0 && (
              <label className="block mb-4">
                <span className="label">Playbook Strategy</span>
                <select className="inp" value={form.strategy_id}
                  onChange={(e) => setForm({ ...form, strategy_id: e.target.value })}>
                  <option value="">No strategy</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Lot Size</span>
                <input className="inp" type="number" step="0.01" placeholder="0.10"
                  value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} />
              </label>
              <label>
                <span className="label">Date</span>
                <input className="inp" type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Entry Price</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.08500"
                  value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} />
              </label>
              <label>
                <span className="label">Exit Price</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.09200"
                  value={form.exit_price} onChange={(e) => setForm({ ...form, exit_price: e.target.value })} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Stop Loss</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.08100"
                  value={form.sl} onChange={(e) => setForm({ ...form, sl: e.target.value })} />
              </label>
              <label>
                <span className="label">Take Profit</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.09500"
                  value={form.tp} onChange={(e) => setForm({ ...form, tp: e.target.value })} />
              </label>
            </div>

            <label className="block mb-4">
              <span className="label">P&L Override ($)</span>
              <input className="inp" type="number" step="0.01" placeholder="Override auto-calculation"
                value={form.pnl} onChange={(e) => setForm({ ...form, pnl: e.target.value })} />
            </label>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="label">News Event Trade?</span>
                <button type="button"
                  onClick={() => setForm({ ...form, news_event: form.news_event ? "" : " " })}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-all
                              ${form.news_event ? "bg-orange-500/20 border-orange-500" : "bg-zinc-800 border-zinc-700"}`}>
                  <span className={`inline-block h-3 w-3 rounded-full transition-transform
                                    ${form.news_event ? "translate-x-4 bg-orange-400" : "translate-x-0.5 bg-zinc-600"}`} />
                </button>
              </div>
              {form.news_event !== "" && (
                <input className="inp" placeholder="e.g. NFP, CPI, FOMC Rate Decision"
                  value={form.news_event.trim()}
                  onChange={(e) => setForm({ ...form, news_event: e.target.value })} autoFocus />
              )}
            </div>

            <label className="block mb-5">
              <span className="label">Notes</span>
              <textarea className="inp resize-none h-16" placeholder="Setup, reason, lessons..."
                value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>

            <button onClick={isEditing ? saveEdit : addTrade}
              className="btn-gold w-full py-2.5 rounded-xl text-sm tracking-wide
                         transition-all active:scale-[0.98]">
              {isEditing ? "Save Changes" : "+ Add Trade"}
            </button>
          </div>

          {/* ── TABLE PANEL ── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 min-w-0">

            <div className="flex items-center justify-between mb-4">
              <p className="card-label">Trade History</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCsvImport(true)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all"
                  style={{ borderColor: "rgba(245,197,24,0.25)", color: "var(--cj-gold-muted)", background: "rgba(245,197,24,0.05)" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Import CSV
                </button>
                {accountTrades.length > 0 && (
                  <button onClick={clearAllTrades}
                    className="text-[10px] text-rose-700 hover:text-rose-400 border border-rose-900/50
                               hover:border-rose-500/50 rounded-md px-2 py-1 transition-colors">
                    Clear all trades
                  </button>
                )}
                <span className="font-sans text-xs text-zinc-500">
                  {filteredTrades.length}
                  {filteredTrades.length !== accountTrades.length && `/${accountTrades.length}`} trade{accountTrades.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Filter bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5 pb-4 border-b border-zinc-800">
              <div>
                <span className="label">From</span>
                <input type="date" className="inp text-xs py-1.5" value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
              </div>
              <div>
                <span className="label">To</span>
                <input type="date" className="inp text-xs py-1.5" value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
              </div>
              <div>
                <span className="label">Pair</span>
                <input className="inp text-xs py-1.5" placeholder="EURUSD..."
                  value={filters.pair} onChange={(e) => setFilters({ ...filters, pair: e.target.value })} />
              </div>
              <div>
                <span className="label">Direction</span>
                <select className="inp text-xs py-1.5" value={filters.direction}
                  onChange={(e) => setFilters({ ...filters, direction: e.target.value as Filters["direction"] })}>
                  <option value="">All</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <span className="label">Strategy</span>
                <select className="inp text-xs py-1.5" value={filters.strategyId}
                  onChange={(e) => setFilters({ ...filters, strategyId: e.target.value })}>
                  <option value="">All strategies</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Strategy performance stats — shown when trades are tagged */}
            {strategyStats.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {strategyStats.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => {
                      const id = strategies.find((x) => x.name === s.name)?.id ?? "";
                      setFilters((f) => ({ ...f, strategyId: f.strategyId === id ? "" : id }));
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] transition-all"
                    style={{
                      background: "rgba(245,197,24,0.05)",
                      borderColor: "rgba(245,197,24,0.15)",
                    }}
                  >
                    <span className="font-semibold text-zinc-300">{s.name}</span>
                    <span className="text-zinc-500">{s.total} trades</span>
                    <span style={{ color: s.wins / s.total >= 0.5 ? "#34d399" : "#f87171" }}>
                      {Math.round((s.wins / s.total) * 100)}% WR
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeFilterCount > 0 && (
              <div className="mb-3 -mt-2">
                <button onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  ✕ Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                </button>
              </div>
            )}

            {filteredTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                <div className="w-12 h-12 rounded-xl bg-[var(--cj-raised)] border border-zinc-800
                                flex items-center justify-center mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <p className="font-semibold text-zinc-400 mb-1">
                  {accountTrades.length === 0 ? "No trades yet" : "No trades match filters"}
                </p>
                <p className="text-sm">
                  {accountTrades.length === 0 ? "Add your first trade using the form" : "Try adjusting the filters above"}
                </p>
              </div>
            ) : (
              <>
                {/* Showing X–Y of Z */}
                <p className="text-[11px] text-zinc-600 mb-2">
                  Showing {(tablePage - 1) * PAGE_SIZE + 1}–{Math.min(tablePage * PAGE_SIZE, filteredTrades.length)} of {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
                </p>

              <div className="overflow-x-auto" style={{ minHeight: 420 }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Pair", "Dir", "Date", "Lot", "Entry", "Exit", "P&L", "Notes & Media", "Emotion", "Actions"].map((h) => (
                        <th key={h} className="text-[13px] uppercase tracking-[0.08em] text-zinc-500 font-medium
                                               text-left pb-3 px-2 last:text-right"
                            style={{ borderBottom: "1px solid var(--cj-gold-muted)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTrades.map((t) => (
                      <tr key={t.id}
                        className={`group transition-all border-l-2 ${editingId === t.id
                          ? "bg-[var(--cj-gold-glow)] border-l-[var(--cj-gold)]"
                          : "border-l-transparent hover:bg-[var(--cj-gold-glow)] hover:border-l-[var(--cj-gold-muted)]"}`}>

                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-sans text-xs font-semibold bg-zinc-800 rounded-md px-2 py-1">{t.pair}</span>
                            {t.asset_class && <span className="text-[10px] text-zinc-600">{t.asset_class}</span>}
                            {t.news_event && (
                              <span className="text-[10px] font-semibold bg-orange-500/10 border border-orange-500/25
                                               text-orange-400 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                {t.news_event}
                              </span>
                            )}
                          </div>
                          {(t.session || t.setup) && (
                            <div className="mt-1 text-[10px] text-zinc-700 leading-tight">
                              {[t.session, t.setup].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {t.strategy_id && strategyMap.get(t.strategy_id) && (
                            <div className="mt-1">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(245,197,24,0.08)", color: "var(--cj-gold-muted)", border: "1px solid rgba(245,197,24,0.15)" }}>
                                {strategyMap.get(t.strategy_id)}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <span className={`font-sans text-[10px] font-bold rounded px-2 py-1
                            ${t.direction === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                            {t.direction}
                          </span>
                        </td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-sans text-xs text-zinc-500">{t.date}</td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-sans text-xs text-right">{t.lot}</td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-sans text-xs text-right">{t.entry.toFixed(5)}</td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-sans text-xs text-right">{t.exit_price.toFixed(5)}</td>
                        <td className={`px-2 py-3 border-b border-zinc-800/60 font-sans text-sm font-semibold text-right ${pnlColor(t.pnl)}`}>
                          {fmt(t.pnl)}
                        </td>

                        {/* Notes & Media column */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 text-center">
                          {t.notes?.trim() || t.screenshot_url ? (
                            <button
                              onClick={() => setNoteModalTrade(t)}
                              title="View / edit journal entry"
                              className="inline-flex items-center gap-1 hover:scale-110 transition-transform"
                            >
                              {t.notes?.trim() && (
                                <span className="text-emerald-400" title="Has notes">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                                </span>
                              )}
                              {t.screenshot_url && (
                                <span className="text-blue-400" title="Has screenshot">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                </span>
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => setNoteModalTrade(t)}
                              className="text-[10px] font-semibold rounded-md px-2 py-1 transition-all whitespace-nowrap"
                              style={{
                                color: "var(--cj-gold)",
                                border: "1px solid var(--cj-gold-muted)",
                                background: "transparent",
                              }}
                            >
                              + Add
                            </button>
                          )}
                        </td>

                        {/* Emotion column */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 text-center">
                          {t.emotion && EMOTION_EMOJI[t.emotion] ? (
                            <span className="text-base" title={t.emotion}>
                              {EMOTION_EMOJI[t.emotion]}
                            </span>
                          ) : (
                            <span className="text-zinc-800 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60 text-right">
                          <div className="flex items-center justify-end gap-1
                                          opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {t.pnl < 0 && (
                              <button onClick={() => setReflectionTrade(t)}
                                className="text-zinc-500 hover:text-purple-400 border border-zinc-800
                                           hover:border-purple-500/50 rounded-md px-2 py-1 text-xs transition-all"
                                title="Reflect on this loss">
                                Reflect
                              </button>
                            )}
                            <button onClick={() => setDrilldownTrade(t as unknown as ReplayTrade)}
                              className="text-zinc-500 hover:text-[#D4A017] border border-zinc-800
                                         hover:border-yellow-500/50 rounded-md px-2 py-1 text-xs transition-all"
                              title="Analyse this trade">▷</button>
                            <button onClick={() => startEdit(t)}
                              className="text-zinc-500 hover:text-blue-400 border border-zinc-800
                                         hover:border-blue-500/50 rounded-md px-2 py-1 text-xs transition-all">Edit</button>
                            <button onClick={() => deleteTrade(t.id)}
                              className="text-zinc-600 hover:text-rose-400 border border-zinc-800
                                         hover:border-rose-500/50 rounded-md px-2 py-1 text-xs transition-all">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                    disabled={tablePage === 1}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400
                               hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-30
                               disabled:cursor-not-allowed transition-colors">
                    ← Previous
                  </button>
                  <span className="text-xs text-zinc-500">
                    Page {tablePage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                    disabled={tablePage === totalPages}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400
                               hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-30
                               disabled:cursor-not-allowed transition-colors">
                    Next →
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>

        {/* Test NIRI — developer only, bottom of page content */}
        {currentUser?.email === process.env.NEXT_PUBLIC_DEVELOPER_EMAIL && (
          <div className="flex justify-center pt-4 pb-8">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("niri:test"))}
              className="text-[10px] font-sans text-zinc-700 hover:text-zinc-500 transition-colors px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-700"
            >
              · test niri orb ·
            </button>
          </div>
        )}
      </main>

      {/* TRADE NOTE MODAL */}
      {noteModalTrade && currentUser && (
        <TradeNoteModal
          trade={noteModalTrade}
          userId={currentUser.id}
          onClose={() => setNoteModalTrade(null)}
          onSave={handleNoteSave}
        />
      )}

      {/* TRADE REFLECTION MODAL */}
      {reflectionTrade && (
        <TradeReflectionModal
          trade={reflectionTrade}
          onClose={() => setReflectionTrade(null)}
        />
      )}

      {/* TRADE DETAIL MODAL */}
      {drilldownTrade && (
        <TradeDetailModal
          trade={drilldownTrade}
          allDayTrades={accountTrades
            .filter(t => t.date === drilldownTrade.date)
            .map(t => t as unknown as ReplayTrade)}
          onClose={() => setDrilldownTrade(null)}
        />
      )}

      {/* CSV IMPORT MODAL */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onSuccess={(inserted, duplicates) => {
            setShowCsvImport(false);
            showToast(
              `${inserted} trade${inserted !== 1 ? "s" : ""} imported${duplicates > 0 ? `, ${duplicates} duplicate${duplicates !== 1 ? "s" : ""} skipped` : ""}`,
              "ok"
            );
          }}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl border text-sm
                         bg-[var(--cj-raised)] text-zinc-100 shadow-xl z-50
                         ${toast.type === "ok"
            ? "border-l-2 border-l-emerald-500 border-zinc-700"
            : "border-l-2 border-l-rose-500 border-zinc-700"}`}>
          {toast.msg}
        </div>
      )}

      </div>
    </div>
  );
}
