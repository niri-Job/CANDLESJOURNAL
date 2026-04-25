"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
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
  asset_class: string;
  session: string;
  setup: string;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  pair: string;
  direction: "" | "BUY" | "SELL";
}

const ASSET_CLASSES = ["Forex", "Crypto", "Metals", "Indices", "Stocks"] as const;
const SESSIONS = ["London", "New York", "Asian", "Overlap"] as const;

const EMPTY_FORM = {
  pair: "",
  lot: "",
  date: new Date().toISOString().split("T")[0],
  entry: "",
  exit_price: "",
  sl: "",
  tp: "",
  pnl: "",
  notes: "",
  asset_class: "Forex",
  session: "London",
  setup: "",
};

const EMPTY_FILTERS: Filters = { dateFrom: "", dateTo: "", pair: "", direction: "" };

// ─── Module-level helpers ─────────────────────────────────────────────────────
const pnlColor = (v: number) =>
  v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-300";

const fmt = (v: number) =>
  (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);

// ─── Tooltip components (module-level — must not be defined inside render) ────
function EquityTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1e29] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className={`font-mono font-semibold ${payload[0].value >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {fmt(payload[0].value)}
      </p>
    </div>
  );
}

function WinTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; payload: { total: number } }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1e29] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
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
        const body = nl > -1 ? section.slice(nl + 1).trim() : "";
        return (
          <div key={i}>
            <h3 className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold mb-1.5">
              {heading}
            </h3>
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
  const isUp = data[data.length - 1].value >= 0;
  const stroke = isUp ? "#34d399" : "#f87171";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={stroke} stopOpacity={0.18} />
            <stop offset="95%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
          width={58}
        />
        <Tooltip content={<EquityTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#eqGrad)"
          dot={false}
          activeDot={{ r: 4, fill: stroke, stroke: "#0d0f14", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Win Rate by Pair ─────────────────────────────────────────────────────────
function WinRateChart({ data }: {
  data: { pair: string; winRate: number; total: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        No pair data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }} barSize={22}>
        <XAxis
          dataKey="pair"
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <Tooltip content={<WinTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar
          dataKey="winRate"
          shape={(props: unknown) => {
            const p = props as { x: number; y: number; width: number; height: number; winRate: number };
            return (
              <rect
                x={p.x} y={p.y} width={p.width} height={p.height}
                rx={4}
                fill={p.winRate >= 50 ? "#34d399" : "#f87171"}
                fillOpacity={0.75}
              />
            );
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Calendar Heatmap ─────────────────────────────────────────────────────────
function CalendarHeatmap({ dailyPnl }: { dailyPnl: Record<string, number> }) {
  const [tip, setTip] = useState<{ date: string; pnl: number; x: number; y: number } | null>(null);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  return (
    <div className="flex gap-3 h-full items-start">
      {months.map(({ year, month }) => {
        const label = new Date(year, month, 1).toLocaleString("default", {
          month: "short", year: "2-digit",
        });
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const cells: (number | null)[] = [
          ...Array(firstDay).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={`${year}-${month}`} className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2 font-medium">
              {label}
            </p>
            <div className="grid grid-cols-7 gap-px mb-px">
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} className="text-[9px] text-zinc-700 text-center pb-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} className="aspect-square" />;
                const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const pnl = dailyPnl[ds];
                const bg = pnl === undefined
                  ? "bg-zinc-800/40"
                  : pnl > 0
                  ? "bg-emerald-500/55"
                  : pnl < 0
                  ? "bg-rose-500/55"
                  : "bg-zinc-500/50";
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-[2px] ${bg} transition-opacity hover:opacity-75 cursor-default`}
                    onMouseEnter={(e) => pnl !== undefined && setTip({ date: ds, pnl, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {tip && (
        <div
          className="fixed z-50 bg-[#1a1e29] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none"
          style={{ left: tip.x + 14, top: tip.y - 36 }}
        >
          <p className="text-zinc-400 mb-0.5">{tip.date}</p>
          <p className={`font-mono font-semibold ${tip.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(tip.pnl)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TradingJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<{
    analysis: string; period: string; created_at: string;
  } | null>(null);
  const [pastAnalyses, setPastAnalyses] = useState<{
    id: string; period: string; trade_count: number; analysis: string; created_at: string;
  }[]>([]);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
  }

  // Load user and trades on mount
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setCurrentUser(user);

      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) showToast("Failed to load trades", "err");
      else if (data) setTrades(data as Trade[]);
      setLoading(false);

      const { data: analyses } = await supabase
        .from("journal_analyses")
        .select("id, period, trade_count, analysis, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (analyses) setPastAnalyses(analyses);
    }
    init();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Computed stats ─────────────────────────────────────────────────────────
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : null;
  const avgPnl = trades.length > 0 ? (totalPnl / trades.length).toFixed(2) : null;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const equityCurveData = useMemo(() => {
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.reduce<{ date: string; value: number }[]>((acc, t) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
      return [...acc, { date: t.date, value: parseFloat((prev + t.pnl).toFixed(2)) }];
    }, []);
  }, [trades]);

  const pairWinRateData = useMemo(() => {
    const map: Record<string, { wins: number; total: number }> = {};
    for (const t of trades) {
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
  }, [trades]);

  const dailyPnlMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trades) {
      map[t.date] = parseFloat(((map[t.date] || 0) + t.pnl).toFixed(2));
    }
    return map;
  }, [trades]);

  // ── Filtered trades ────────────────────────────────────────────────────────
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo && t.date > filters.dateTo) return false;
      if (filters.pair && !t.pair.toLowerCase().includes(filters.pair.toLowerCase())) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      return true;
    });
  }, [trades, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function addTrade() {
    if (!form.pair.trim()) return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0) return showToast("Enter a valid lot size", "err");
    if (!form.entry || !form.exit_price) return showToast("Enter entry and exit prices", "err");
    if (!currentUser) return;

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
    };

    const supabase = createClient();
    const { data, error } = await supabase.from("trades").insert(payload).select().single();
    if (error) { showToast("Failed to save trade", "err"); return; }

    setTrades((prev) => [data as Trade, ...prev]);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
    showToast(`${payload.pair} added — ${fmt(pnl)}`, "ok");
  }

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setDirection(trade.direction);
    setForm({
      pair: trade.pair,
      lot: String(trade.lot),
      date: trade.date,
      entry: String(trade.entry),
      exit_price: String(trade.exit_price),
      sl: trade.sl ? String(trade.sl) : "",
      tp: trade.tp ? String(trade.tp) : "",
      pnl: "",
      notes: trade.notes,
      asset_class: trade.asset_class || "Forex",
      session: trade.session || "London",
      setup: trade.setup || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit() {
    if (!form.pair.trim()) return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0) return showToast("Enter a valid lot size", "err");
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
    };

    const supabase = createClient();
    const { error } = await supabase.from("trades").update(updates).eq("id", editingId!);
    if (error) { showToast("Failed to update trade", "err"); return; }

    setTrades((prev) => prev.map((t) => t.id === editingId ? { ...t, ...updates } : t));
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

  async function loadPastAnalyses() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("journal_analyses")
      .select("id, period, trade_count, analysis, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);
    if (data) setPastAnalyses(data);
  }

  async function runAnalysis(period: "weekly" | "monthly") {
    setAnalysisLoading(true);
    setCurrentAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Analysis failed", "err");
        return;
      }
      setCurrentAnalysis({
        analysis: data.analysis,
        period,
        created_at: data.created_at || new Date().toISOString(),
      });
      await loadPastAnalyses();
    } catch {
      showToast("Analysis failed", "err");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function deleteTrade(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) { showToast("Failed to delete trade", "err"); return; }
    setTrades((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) cancelEdit();
    showToast("Trade deleted", "err");
  }

  const isEditing = editingId !== null;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f14] text-zinc-100 font-sans">

      {/* HEADER */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-7 h-16
                         bg-[#13161e] border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600
                          flex items-center justify-center text-sm font-bold text-white">
            TJ
          </div>
          <span className="font-semibold text-base tracking-tight">My Trading Journal</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-[#1a1e29] border border-zinc-800
                          rounded-xl px-4 py-2">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500">Total P&L</span>
            <span className={`font-mono text-lg font-semibold ${pnlColor(totalPnl)}`}>
              {fmt(totalPnl)}
            </span>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 hidden sm:block">{currentUser.email}</span>
              <Link
                href="/settings"
                className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-700
                           hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors"
              >
                Settings
              </Link>
              <button
                onClick={handleLogout}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-700
                           hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-7">

        {/* STAT CARDS */}
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          {[
            {
              label: "Total P&L",
              value: fmt(totalPnl),
              cls: pnlColor(totalPnl),
              sub: `${trades.length} trade${trades.length !== 1 ? "s" : ""}`,
            },
            {
              label: "Win Rate",
              value: winRate ? `${winRate}%` : "—",
              cls: winRate ? pnlColor(parseFloat(winRate) - 50) : "text-zinc-400",
              sub: winRate ? `${wins}W / ${losses}L` : "No trades yet",
            },
            {
              label: "Total Trades",
              value: String(trades.length),
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
              className="bg-[#13161e] border border-zinc-800 rounded-xl px-5 py-4
                         hover:border-zinc-700 transition-colors">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">{card.label}</p>
              <p className={`font-mono text-2xl font-semibold ${card.cls}`}>{card.value}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* EQUITY CURVE */}
        <div className="bg-[#13161e] border border-zinc-800 rounded-2xl p-5 mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
            Equity Curve
          </p>
          <div style={{ height: 200 }}>
            <EquityCurveChart data={equityCurveData} />
          </div>
        </div>

        {/* WIN RATE + CALENDAR */}
        <div className="grid grid-cols-2 gap-5 mb-6">

          {/* Win Rate by Pair */}
          <div className="bg-[#13161e] border border-zinc-800 rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
              Win Rate by Pair
            </p>
            <div style={{ height: 200 }}>
              <WinRateChart data={pairWinRateData} />
            </div>
          </div>

          {/* Calendar Heatmap */}
          <div className="bg-[#13161e] border border-zinc-800 rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
              Daily P&L Calendar
            </p>
            <div style={{ height: 200 }}>
              <CalendarHeatmap dailyPnl={dailyPnlMap} />
            </div>
          </div>
        </div>

        {/* AI JOURNAL ANALYSIS */}
        <div className="bg-[#13161e] border border-zinc-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                AI Journal Analysis
              </p>
              <p className="text-[10px] text-zinc-700 mt-0.5">Powered by Claude</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => runAnalysis("weekly")}
                disabled={analysisLoading}
                className="text-xs px-4 py-2 rounded-lg bg-[#1a1e29] border border-zinc-700
                           hover:border-blue-500/50 text-zinc-300 hover:text-zinc-100
                           disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Analyse Last 7 Days
              </button>
              <button
                onClick={() => runAnalysis("monthly")}
                disabled={analysisLoading}
                className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white
                           font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Analyse Last 30 Days
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
                  {currentAnalysis.period === "weekly" ? "Last 7 days" : "Last 30 days"}
                </span>
                <span className="text-[10px] text-zinc-700">
                  {new Date(currentAnalysis.created_at).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              </div>
              <AnalysisReport text={currentAnalysis.analysis} />
            </div>
          )}

          {!analysisLoading && !currentAnalysis && pastAnalyses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <div className="w-10 h-10 rounded-xl bg-[#1a1e29] border border-zinc-800
                              flex items-center justify-center text-lg mb-3">
                🤖
              </div>
              <p className="text-sm text-zinc-500 font-semibold mb-1">No analyses yet</p>
              <p className="text-xs">Click a button above to get your first AI coaching report</p>
            </div>
          )}

          {pastAnalyses.length > 0 && (
            <div className={currentAnalysis ? "border-t border-zinc-800 pt-4" : ""}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-3">
                Past Analyses
              </p>
              <div className="space-y-2">
                {pastAnalyses.map((a) => (
                  <div key={a.id} className="border border-zinc-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedAnalysis(expandedAnalysis === a.id ? null : a.id)}
                      className="w-full flex items-center justify-between px-4 py-3
                                 hover:bg-zinc-800/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500
                                         bg-zinc-800 px-2 py-0.5 rounded">
                          {a.period === "weekly" ? "7 days" : "30 days"}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {new Date(a.created_at).toLocaleDateString("en-GB", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </span>
                        <span className="text-[10px] text-zinc-700">{a.trade_count} trades</span>
                      </div>
                      <span className="text-zinc-600 text-[10px]">
                        {expandedAnalysis === a.id ? "▲" : "▼"}
                      </span>
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

        {/* MAIN GRID */}
        <div className="grid gap-5" style={{ gridTemplateColumns: "380px 1fr" }}>

          {/* ── FORM PANEL ── */}
          <div className={`bg-[#13161e] border rounded-2xl p-6 transition-colors
                           ${isEditing ? "border-blue-500/50" : "border-zinc-800"}`}>

            <div className="flex items-center justify-between mb-5 pb-4 border-b border-zinc-800">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                {isEditing ? "Edit Trade" : "New Trade"}
              </p>
              {isEditing && (
                <button onClick={cancelEdit}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-700
                             rounded-lg px-2.5 py-1 transition-colors">
                  Cancel
                </button>
              )}
            </div>

            {/* Pair */}
            <label className="block mb-4">
              <span className="label">Currency Pair</span>
              <input className="inp" placeholder="e.g. EURUSD" value={form.pair}
                onChange={(e) => setForm({ ...form, pair: e.target.value })} />
            </label>

            {/* Direction */}
            <div className="mb-4">
              <span className="label">Direction</span>
              <div className="flex gap-2 mt-1.5">
                {(["BUY", "SELL"] as const).map((d) => (
                  <button key={d} onClick={() => setDirection(d)}
                    className={`flex-1 py-2.5 rounded-lg font-mono text-xs font-semibold
                                tracking-widest border transition-all
                                ${direction === d
                        ? d === "BUY"
                          ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
                          : "bg-rose-500/15 border-rose-500 text-rose-400"
                        : "bg-[#1a1e29] border-zinc-700 text-zinc-500 hover:border-zinc-600"
                      }`}>
                    {d === "BUY" ? "▲ " : "▼ "}{d}
                  </button>
                ))}
              </div>
            </div>

            {/* Asset Class + Session */}
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

            {/* Setup */}
            <label className="block mb-4">
              <span className="label">Setup Type</span>
              <input className="inp" placeholder="e.g. Break & Retest, OB, Liquidity Sweep"
                value={form.setup}
                onChange={(e) => setForm({ ...form, setup: e.target.value })} />
            </label>

            {/* Lot + Date */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Lot Size</span>
                <input className="inp" type="number" step="0.01" placeholder="0.10"
                  value={form.lot}
                  onChange={(e) => setForm({ ...form, lot: e.target.value })} />
              </label>
              <label>
                <span className="label">Date</span>
                <input className="inp" type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
            </div>

            {/* Entry + Exit */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Entry Price</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.08500"
                  value={form.entry}
                  onChange={(e) => setForm({ ...form, entry: e.target.value })} />
              </label>
              <label>
                <span className="label">Exit Price</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.09200"
                  value={form.exit_price}
                  onChange={(e) => setForm({ ...form, exit_price: e.target.value })} />
              </label>
            </div>

            {/* SL + TP */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Stop Loss</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.08100"
                  value={form.sl}
                  onChange={(e) => setForm({ ...form, sl: e.target.value })} />
              </label>
              <label>
                <span className="label">Take Profit</span>
                <input className="inp" type="number" step="0.00001" placeholder="1.09500"
                  value={form.tp}
                  onChange={(e) => setForm({ ...form, tp: e.target.value })} />
              </label>
            </div>

            {/* P&L Override */}
            <label className="block mb-4">
              <span className="label">P&L Override ($)</span>
              <input className="inp" type="number" step="0.01"
                placeholder="Override auto-calculation" value={form.pnl}
                onChange={(e) => setForm({ ...form, pnl: e.target.value })} />
            </label>

            {/* Notes */}
            <label className="block mb-5">
              <span className="label">Notes</span>
              <textarea className="inp resize-none h-16"
                placeholder="Setup, reason, lessons..." value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>

            <button onClick={isEditing ? saveEdit : addTrade}
              className="w-full py-2.5 rounded-xl text-white font-semibold text-sm
                         tracking-wide transition-all active:scale-[0.98] bg-blue-600 hover:bg-blue-500">
              {isEditing ? "💾 Save Changes" : "+ Add Trade"}
            </button>
          </div>

          {/* ── TABLE PANEL ── */}
          <div className="bg-[#13161e] border border-zinc-800 rounded-2xl p-6">

            {/* Table header + filter count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                Trade History
              </p>
              <span className="font-mono text-xs text-zinc-500">
                {filteredTrades.length}{filteredTrades.length !== trades.length && `/${trades.length}`} trade{trades.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* FILTER BAR */}
            <div className="grid grid-cols-4 gap-2 mb-5 pb-4 border-b border-zinc-800">
              <div>
                <span className="label">From</span>
                <input type="date" className="inp text-xs py-1.5"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
              </div>
              <div>
                <span className="label">To</span>
                <input type="date" className="inp text-xs py-1.5"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
              </div>
              <div>
                <span className="label">Pair</span>
                <input className="inp text-xs py-1.5" placeholder="EURUSD..."
                  value={filters.pair}
                  onChange={(e) => setFilters({ ...filters, pair: e.target.value })} />
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

            {/* Clear filters */}
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
                <div className="w-12 h-12 rounded-xl bg-[#1a1e29] border border-zinc-800
                                flex items-center justify-center text-xl mb-4">📋</div>
                <p className="font-semibold text-zinc-400 mb-1">
                  {trades.length === 0 ? "No trades yet" : "No trades match filters"}
                </p>
                <p className="text-sm">
                  {trades.length === 0 ? "Add your first trade using the form" : "Try adjusting the filters above"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Pair", "Dir", "Date", "Lot", "Entry", "Exit", "P&L", "Actions"].map((h) => (
                        <th key={h}
                          className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium
                                     text-left pb-3 border-b border-zinc-800 px-2 last:text-right">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.map((t) => (
                      <tr key={t.id}
                        className={`group transition-colors
                                    ${editingId === t.id
                            ? "bg-blue-500/5 border-l-2 border-l-blue-500"
                            : "hover:bg-[#1a1e29]"}`}>

                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <div>
                            <span className="font-mono text-xs font-semibold bg-zinc-800
                                             rounded-md px-2 py-1">
                              {t.pair}
                            </span>
                            {t.asset_class && (
                              <span className="ml-1.5 text-[10px] text-zinc-600">{t.asset_class}</span>
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
                            ${t.direction === "BUY"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400"}`}>
                            {t.direction}
                          </span>
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-zinc-500">
                          {t.date}
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">
                          {t.lot}
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">
                          {t.entry.toFixed(5)}
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">
                          {t.exit_price.toFixed(5)}
                        </td>

                        <td className={`px-2 py-3 border-b border-zinc-800/60 font-mono text-sm
                                        font-semibold text-right ${pnlColor(t.pnl)}`}>
                          {fmt(t.pnl)}
                        </td>

                        <td className="px-2 py-3 border-b border-zinc-800/60 text-right">
                          <div className="flex items-center justify-end gap-1
                                          opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(t)}
                              className="text-zinc-500 hover:text-blue-400 border border-zinc-800
                                         hover:border-blue-500/50 rounded-md px-2 py-1 text-xs
                                         transition-all">
                              ✏️
                            </button>
                            <button onClick={() => deleteTrade(t.id)}
                              className="text-zinc-600 hover:text-rose-400 border border-zinc-800
                                         hover:border-rose-500/50 rounded-md px-2 py-1 text-xs
                                         transition-all">
                              ✕
                            </button>
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

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl border text-sm
                         bg-[#1a1e29] text-zinc-100 shadow-xl z-50
                         ${toast.type === "ok"
            ? "border-l-2 border-l-emerald-500 border-zinc-700"
            : "border-l-2 border-l-rose-500 border-zinc-700"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
