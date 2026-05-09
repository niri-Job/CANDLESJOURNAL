"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Sidebar } from "@/components/Sidebar";
import { RiskDistribution } from "@/components/RiskDistribution";
import { TradeNoteModal } from "@/components/TradeNoteModal";
import { PerformanceBadge } from "@/components/PerformanceBadge";
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
  asset_class: string;
  session: string;
  setup: string;
  news_event?: string | null;
  mt5_deal_id?: string | null;
  account_signature?: string | null;
  account_label?: string | null;
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
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  pair: string;
  direction: "" | "BUY" | "SELL";
}

const ASSET_CLASSES = ["Forex", "Crypto", "Metals", "Indices", "Stocks"] as const;
const SESSIONS      = ["London", "New York", "Asian", "Overlap"] as const;

const EMPTY_FORM = {
  pair: "", lot: "",
  date: new Date().toISOString().split("T")[0],
  entry: "", exit_price: "", sl: "", tp: "", pnl: "",
  notes: "", asset_class: "Forex", session: "London",
  setup: "", news_event: "",
};
const EMPTY_FILTERS: Filters = { dateFrom: "", dateTo: "", pair: "", direction: "" };

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
      <p className={`font-mono font-semibold ${payload[0].value >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {fmt(payload[0].value)}
      </p>
    </div>
  );
}

function WinTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; payload: { total: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-300 font-mono font-semibold mb-1">{label}</p>
      <p className={`font-mono ${payload[0].value >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
        {payload[0].value}% win rate
      </p>
      <p className="text-zinc-500 mt-0.5">{payload[0].payload.total} trades</p>
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

// ─── Win Rate by Pair ─────────────────────────────────────────────────────────
function WinRateChart({ data }: { data: { pair: string; winRate: number; total: number }[] }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-zinc-600 text-sm">No pair data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }} barSize={22}>
        <XAxis dataKey="pair" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `${v}%`} width={40} />
        <Tooltip content={<WinTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="winRate" shape={(props: unknown) => {
          const p = props as { x: number; y: number; width: number; height: number; winRate: number };
          return <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={4}
            fill={p.winRate >= 50 ? "#34d399" : "#f87171"} fillOpacity={0.75} />;
        }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Calendar Heatmap ─────────────────────────────────────────────────────────
// Uses fixed h-8 cells so height is deterministic (no overflow into adjacent sections).
function CalendarHeatmap({ dailyData }: {
  dailyData: Record<string, { pnl: number; count: number }>;
}) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tip, setTip] = useState<{
    date: string; pnl: number; count: number; x: number; y: number;
  } | null>(null);

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

  // Max abs PnL this month for intensity scaling
  const monthValues = Object.entries(dailyData)
    .filter(([ds]) => {
      const [y, mo] = ds.split("-").map(Number);
      return y === viewYear && mo === viewMonth + 1;
    })
    .map(([, v]) => Math.abs(v.pnl));
  const maxAbs = monthValues.length > 0 ? Math.max(...monthValues) : 0.01;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr  = today.toISOString().split("T")[0];
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString("default", {
    month: "long", year: "numeric",
  });

  return (
    <div>
      {/* Navigation */}
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

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-[3px] mb-[3px]">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d, i) => (
          <div key={i} className="text-[13px] text-zinc-600 text-center">{d}</div>
        ))}
      </div>

      {/* Day cells — fixed h-8 so no overflow */}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="h-8" />;
          const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry   = dailyData[ds];
          const isToday = ds === todayStr;

          let bg = "rgba(39,39,42,0.5)";
          if (entry) {
            const intensity = 0.25 + (Math.abs(entry.pnl) / maxAbs) * 0.65;
            bg = entry.pnl > 0
              ? `rgba(52,211,153,${intensity.toFixed(2)})`
              : entry.pnl < 0
              ? `rgba(248,113,113,${intensity.toFixed(2)})`
              : "rgba(113,113,122,0.35)";
          }

          return (
            <div key={i}
              className={`h-8 rounded-[3px] flex items-end justify-end cursor-default
                          hover:opacity-75 transition-opacity
                          ${isToday ? "outline outline-2 outline-[var(--cj-gold)] outline-offset-[-2px]" : ""}`}
              style={{ background: bg }}
              onMouseEnter={(e) => entry && setTip({ date: ds, pnl: entry.pnl, count: entry.count, x: e.clientX, y: e.clientY })}
              onMouseMove={(e)  => entry && setTip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => setTip(null)}
            >
              <span className="text-[13px] text-white/40 leading-none pr-[3px] pb-[2px]">{day}</span>
            </div>
          );
        })}
      </div>

      {tip && (
        <div className="fixed z-50 bg-[var(--cj-raised)] border border-zinc-700 rounded-lg
                        px-3 py-2 text-xs shadow-xl pointer-events-none"
             style={{ left: tip.x + 14, top: tip.y - 42 }}>
          <p className="text-zinc-400 mb-0.5">{tip.date}</p>
          <p className={`font-mono font-semibold ${tip.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(tip.pnl)}
          </p>
          <p className="text-zinc-600 mt-0.5">{tip.count} trade{tip.count !== 1 ? "s" : ""}</p>
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
  const todayStr  = new Date().toISOString().split("T")[0];
  const accTrades = trades.filter((t) => t.account_signature === acc.account_signature);
  const todayPnl  = accTrades.filter((t) => t.date === todayStr).reduce((s, t) => s + t.pnl, 0);

  return (
    <div
      onClick={onClick}
      className={`bg-[var(--cj-surface)] border rounded-xl p-4 cursor-pointer transition-colors
                  ${selected ? "border-blue-500/60 bg-blue-500/5" : "border-zinc-800 hover:border-zinc-700"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-200 truncate">
            {acc.account_label || acc.broker_name || "MT5 Account"}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5 truncate">
            {acc.broker_name}{acc.account_login ? ` · #${acc.account_login}` : ""}
          </p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end shrink-0">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border
            ${acc.account_type === "demo"
              ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
              : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
            }`}>
            {acc.account_type === "demo" ? "DEMO" : "LIVE"}
          </span>
          {acc.is_cent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-blue-500/15 text-blue-400 border-blue-500/25">
              CENT
            </span>
          )}
          {acc.account_type !== "demo" && acc.verification_status !== "verified_ea" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-zinc-700/50 text-zinc-500 border-zinc-700">
              UNVERIFIED
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        {[
          { label: "Balance", value: acc.current_balance != null ? `$${acc.current_balance.toFixed(0)}` : "—", cls: "text-zinc-300" },
          { label: "Today",   value: fmt(todayPnl), cls: pnlColor(todayPnl) },
          { label: "Trades",  value: String(accTrades.length), cls: "text-zinc-300" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-1.5">
            <p className="text-[9px] text-zinc-600">{label}</p>
            <p className={`font-mono text-xs font-semibold mt-0.5 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TradingJournal() {
  const [trades,            setTrades]            = useState<Trade[]>([]);
  const [tradingAccounts,   setTradingAccounts]   = useState<TradingAccount[]>([]);
  // "__all_real__" = all live accounts combined (default)
  // "__all_demo__" = all demo accounts combined
  // any other string = specific account_signature
  const [selectedAccountSig, setSelectedAccountSig] = useState<string>("__all_real__");
  const [form,              setForm]              = useState(EMPTY_FORM);
  const [direction,         setDirection]         = useState<"BUY" | "SELL">("BUY");
  const [toast,             setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [currentUser,       setCurrentUser]       = useState<User | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [editingId,         setEditingId]         = useState<string | null>(null);
  const [filters,           setFilters]           = useState<Filters>(EMPTY_FILTERS);
  const [analysisLoading,   setAnalysisLoading]   = useState(false);
  const [currentAnalysis,   setCurrentAnalysis]   = useState<{
    analysis: string; period: string; created_at: string;
  } | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<{
    id: string; period: string; trade_count: number; analysis: string; created_at: string;
  }[]>([]);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [noteModalTrade,   setNoteModalTrade]   = useState<Trade | null>(null);
  const [aiCreditsUsed,    setAiCreditsUsed]    = useState<number>(0);
  const [aiCreditsLimit,   setAiCreditsLimit]   = useState<number>(3);
  const [trialDaysLeft,    setTrialDaysLeft]    = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  function showToast(msg: string, type: "ok" | "err") { setToast({ msg, type }); }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setCurrentUser(user);

      const [profileRes, tradesRes, accountsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_status, subscription_end, ai_credits_used, ai_credits_limit, created_at")
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
          .neq("sync_method", "ea")
          .order("created_at", { ascending: true }),
      ]);

      if (tradesRes.data) setTrades(tradesRes.data as Trade[]);
      if (accountsRes.data) {
        const accounts = accountsRes.data as TradingAccount[];
        setTradingAccounts(accounts);
        // If the user has only demo accounts, default the view to demo
        const hasReal = accounts.some((a) => a.account_type !== "demo");
        const hasDemo = accounts.some((a) => a.account_type === "demo");
        if (!hasReal && hasDemo) setSelectedAccountSig("__all_demo__");
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
            if (days === 0) setShowUpgradeModal(true);
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
              if (t.mt5_deal_id) showToast("New trade synced from MT5", "ok");
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
    const realAccts = tradingAccounts.filter((a) => a.account_type !== "demo");
    const demoAccts = tradingAccounts.filter((a) => a.account_type === "demo");

    if (selectedAccountSig === "__all_real__") {
      // No accounts connected yet — show all manually-entered trades
      if (tradingAccounts.length === 0) return trades;
      const realSigs = new Set(realAccts.map((a) => a.account_signature));
      // Include trades with no account_signature (manually entered) + real account trades
      return trades.filter((t) => !t.account_signature || realSigs.has(t.account_signature));
    }
    if (selectedAccountSig === "__all_demo__") {
      const demoSigs = new Set(demoAccts.map((a) => a.account_signature));
      return trades.filter((t) => Boolean(t.account_signature) && demoSigs.has(t.account_signature!));
    }
    // Specific account
    return trades.filter((t) => t.account_signature === selectedAccountSig);
  }, [trades, selectedAccountSig, tradingAccounts]);

  // ── View mode: live vs demo ───────────────────────────────────────────────
  const isViewingDemo = useMemo(() => {
    if (selectedAccountSig === "__all_demo__") return true;
    if (selectedAccountSig === "__all_real__") return false;
    return tradingAccounts.find((a) => a.account_signature === selectedAccountSig)
      ?.account_type === "demo";
  }, [selectedAccountSig, tradingAccounts]);

  // ── Computed stats (based on account-filtered trades) ─────────────────────
  const totalPnl = accountTrades.reduce((s, t) => s + t.pnl, 0);
  const wins     = accountTrades.filter((t) => (t.pnl || 0) > 0).length;
  const losses   = accountTrades.filter((t) => (t.pnl || 0) < 0).length;
  const winRate  = accountTrades.length > 0 ? ((wins / accountTrades.length) * 100).toFixed(1) : null;
  const avgPnl   = accountTrades.length > 0 ? (totalPnl / accountTrades.length).toFixed(2) : null;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const equityCurveData = useMemo(() => {
    const sorted = [...accountTrades].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.reduce<{ date: string; value: number }[]>((acc, t) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
      return [...acc, { date: t.date, value: parseFloat((prev + t.pnl).toFixed(2)) }];
    }, []);
  }, [accountTrades]);

  const pairWinRateData = useMemo(() => {
    const map: Record<string, { wins: number; total: number }> = {};
    for (const t of accountTrades) {
      if (!map[t.pair]) map[t.pair] = { wins: 0, total: 0 };
      map[t.pair].total++;
      if (t.pnl > 0) map[t.pair].wins++;
    }
    return Object.entries(map)
      .map(([pair, s]) => ({
        pair,
        winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
        total: s.total,
      }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [accountTrades]);

  const dailyData = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {};
    for (const t of accountTrades) {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 };
      map[t.date].pnl = parseFloat((map[t.date].pnl + t.pnl).toFixed(2));
      map[t.date].count++;
    }
    return map;
  }, [accountTrades]);

  // ── Filtered trades (account filter + table filters) ─────────────────────
  const filteredTrades = useMemo(() => {
    return accountTrades.filter((t) => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo   && t.date > filters.dateTo)   return false;
      if (filters.pair && !t.pair.toLowerCase().includes(filters.pair.toLowerCase())) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      return true;
    });
  }, [accountTrades, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

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

    let pnl: number;
    if (form.pnl !== "") {
      pnl = parseFloat(form.pnl);
    } else {
      const diff = direction === "BUY"
        ? parseFloat(form.exit_price) - parseFloat(form.entry)
        : parseFloat(form.entry) - parseFloat(form.exit_price);
      pnl = parseFloat((diff * parseFloat(form.lot) * 10000).toFixed(2));
    }

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
      pnl: "", notes: trade.notes,
      asset_class: trade.asset_class || "Forex", session: trade.session || "London",
      setup: trade.setup || "", news_event: trade.news_event || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit() {
    if (!currentUser) return;
    if (!form.pair.trim())              return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0)    return showToast("Enter a valid lot size", "err");
    if (!form.entry || !form.exit_price) return showToast("Enter entry and exit prices", "err");

    let pnl: number;
    if (form.pnl !== "") {
      pnl = parseFloat(form.pnl);
    } else {
      const diff = direction === "BUY"
        ? parseFloat(form.exit_price) - parseFloat(form.entry)
        : parseFloat(form.entry) - parseFloat(form.exit_price);
      pnl = parseFloat((diff * parseFloat(form.lot) * 10000).toFixed(2));
    }

    const updates = {
      pair: form.pair.toUpperCase(), direction, lot: parseFloat(form.lot), date: form.date,
      entry: parseFloat(form.entry), exit_price: parseFloat(form.exit_price),
      sl: form.sl ? parseFloat(form.sl) : null, tp: form.tp ? parseFloat(form.tp) : null,
      pnl, notes: form.notes, asset_class: form.asset_class, session: form.session,
      setup: form.setup, news_event: form.news_event.trim() || null,
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

  function handleNoteSave(notes: string, screenshotUrl: string | null, emotion: string | null) {
    if (!noteModalTrade) return;
    setTrades((prev) =>
      prev.map((t) => t.id === noteModalTrade.id ? { ...t, notes, screenshot_url: screenshotUrl, emotion } : t)
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
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Analysis failed", "err"); return; }
      setCurrentAnalysis({ analysis: data.analysis, period, created_at: data.created_at || new Date().toISOString() });
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

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 sm:py-7">

        {/* UPGRADE MODAL — shown when trial expires */}
        {showUpgradeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
               style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
            <div className="w-full max-w-md bg-[var(--cj-surface)] border rounded-2xl p-8 shadow-2xl text-center"
                 style={{ borderColor: "rgba(245,197,24,0.35)", boxShadow: "0 0 80px -10px rgba(245,197,24,0.2)" }}>
              <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                   style={{ background: "linear-gradient(135deg,rgba(245,197,24,0.15),rgba(201,162,39,0.08))", border: "1px solid rgba(245,197,24,0.3)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-2">Your trial has ended</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                Upgrade to Pro to continue tracking trades, syncing MT5, and getting AI coaching.
              </p>
              <div className="flex flex-col gap-3">
                <a href="/pricing"
                   className="block w-full py-3 rounded-xl font-bold text-sm"
                   style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                  Upgrade to Pro — ₦15,000/month →
                </a>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1">
                  Continue with limited access
                </button>
              </div>
            </div>
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

        {/* ACCOUNT SWITCHER ── only shown when MT5 accounts are connected */}
        {tradingAccounts.length > 0 && (() => {
          const realAccts = tradingAccounts.filter((a) => a.account_type !== "demo");
          const demoAccts = tradingAccounts.filter((a) => a.account_type === "demo");

          // Which account cards to show below the tabs
          const visibleCards = selectedAccountSig === "__all_real__" ? realAccts
            : selectedAccountSig === "__all_demo__" ? demoAccts
            : tradingAccounts.filter((a) => a.account_signature === selectedAccountSig);

          return (
            <div className="mb-5">
              {/* Tabs */}
              <div className="flex items-center gap-2 flex-wrap mb-4">

                {/* All Real Accounts (shown when any real accounts exist) */}
                {realAccts.length > 0 && (
                  <button
                    onClick={() => setSelectedAccountSig("__all_real__")}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all
                      ${selectedAccountSig === "__all_real__"
                        ? "text-[#0A0A0F] border-transparent"
                        : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
                    style={selectedAccountSig === "__all_real__"
                      ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" }
                      : undefined}
                  >
                    All Real Accounts
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      LIVE
                    </span>
                  </button>
                )}

                {/* All Demo Accounts (shown when any demo accounts exist) */}
                {demoAccts.length > 0 && (
                  <button
                    onClick={() => setSelectedAccountSig("__all_demo__")}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all
                      ${selectedAccountSig === "__all_demo__"
                        ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300"
                        : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    All Demo Accounts
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                      DEMO
                    </span>
                  </button>
                )}

                {/* Divider */}
                {tradingAccounts.length > 0 && (
                  <div className="w-px h-5 bg-zinc-800 shrink-0" />
                )}

                {/* Individual account tabs */}
                {tradingAccounts.map((acc) => {
                  const isDemo = acc.account_type === "demo";
                  const isSelected = selectedAccountSig === acc.account_signature;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setSelectedAccountSig(
                        isSelected
                          ? (isDemo ? "__all_demo__" : "__all_real__")
                          : acc.account_signature
                      )}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all
                        ${isSelected
                          ? isDemo
                            ? "bg-yellow-500/15 border-yellow-500/50 text-yellow-300"
                            : "bg-blue-600 border-blue-600 text-white"
                          : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
                    >
                      <span>{acc.account_label || acc.broker_name || acc.account_login || "MT5"}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                        ${isDemo
                          ? "bg-yellow-500/25 text-yellow-400"
                          : "bg-emerald-500/20 text-emerald-400"}`}>
                        {isDemo ? "DEMO" : "LIVE"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Account cards — filtered to current view */}
              {visibleCards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleCards.map((acc) => (
                    <AccountCard
                      key={acc.id}
                      acc={acc}
                      trades={trades}
                      selected={selectedAccountSig === acc.account_signature}
                      onClick={() => setSelectedAccountSig(
                        selectedAccountSig === acc.account_signature
                          ? (acc.account_type === "demo" ? "__all_demo__" : "__all_real__")
                          : acc.account_signature
                      )}
                    />
                  ))}
                </div>
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

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3.5 mb-6">
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
              <p className="text-sm uppercase tracking-widest text-zinc-500 font-semibold mb-2">{card.label}</p>
              <p className={`font-mono text-2xl font-semibold ${card.cls}`}>{card.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* EQUITY CURVE */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 mb-6">
          <p className="card-label mb-4">Equity Curve</p>
          <div style={{ height: 200 }}>
            <EquityCurveChart data={equityCurveData} />
          </div>
        </div>

        {/* WIN RATE + CALENDAR — side by side, each self-sizing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
            <p className="card-label mb-4">Win Rate by Pair</p>
            <div style={{ height: 200 }}>
              <WinRateChart data={pairWinRateData} />
            </div>
          </div>

          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
            <p className="card-label mb-4">Daily P&L Calendar</p>
            {/* No fixed height — CalendarHeatmap uses fixed h-8 cells, no overflow */}
            <CalendarHeatmap dailyData={dailyData} />
          </div>

        </div>

        {/* RISK & DISTRIBUTION — full width below calendar */}
        <div className="mb-6">
          <RiskDistribution trades={accountTrades} />
        </div>

        {/* PERFORMANCE BADGE — full width */}
        <div className="mb-6">
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
                    className={`flex-1 py-2.5 rounded-lg font-mono text-xs font-semibold tracking-widest
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
                {accountTrades.length > 0 && (
                  <button onClick={clearAllTrades}
                    className="text-[10px] text-rose-700 hover:text-rose-400 border border-rose-900/50
                               hover:border-rose-500/50 rounded-md px-2 py-1 transition-colors">
                    Clear all trades
                  </button>
                )}
                <span className="font-mono text-xs text-zinc-500">
                  {filteredTrades.length}
                  {filteredTrades.length !== accountTrades.length && `/${accountTrades.length}`} trade{accountTrades.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Filter bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5 pb-4 border-b border-zinc-800">
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
            </div>

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
              <div className="overflow-x-auto">
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
                    {filteredTrades.map((t) => (
                      <tr key={t.id}
                        className={`group transition-all border-l-2 ${editingId === t.id
                          ? "bg-[var(--cj-gold-glow)] border-l-[var(--cj-gold)]"
                          : "border-l-transparent hover:bg-[var(--cj-gold-glow)] hover:border-l-[var(--cj-gold-muted)]"}`}>

                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold bg-zinc-800 rounded-md px-2 py-1">{t.pair}</span>
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
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <span className={`font-mono text-[10px] font-bold rounded px-2 py-1
                            ${t.direction === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                            {t.direction}
                          </span>
                        </td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-zinc-500">{t.date}</td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">{t.lot}</td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">{t.entry.toFixed(5)}</td>
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">{t.exit_price.toFixed(5)}</td>
                        <td className={`px-2 py-3 border-b border-zinc-800/60 font-mono text-sm font-semibold text-right ${pnlColor(t.pnl)}`}>
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
            )}
          </div>
        </div>

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
