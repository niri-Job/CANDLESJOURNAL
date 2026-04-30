"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";

// ─── TradingView global type ──────────────────────────────────────────────────
declare global {
  interface Window {
    TradingView: { widget: new (config: object) => unknown };
  }
}

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
  emotion: string | null;
  session: string;
  setup: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TV_SYMBOL_MAP: Record<string, string> = {
  EURUSD: "FX:EURUSD", GBPUSD: "FX:GBPUSD", USDJPY: "FX:USDJPY",
  USDCHF: "FX:USDCHF", USDCAD: "FX:USDCAD", AUDUSD: "FX:AUDUSD",
  NZDUSD: "FX:NZDUSD", EURGBP: "FX:EURGBP", EURJPY: "FX:EURJPY",
  XAUUSD: "TVC:GOLD",  XAGUSD: "TVC:SILVER",
  BTCUSD: "BITSTAMP:BTCUSD", BTCUSDM: "BITSTAMP:BTCUSD",
  US30: "DJ:DJI", NAS100: "NASDAQ:NDX", SPX500: "SP:SPX",
};

const DEFAULT_PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSD", "XAGUSD", "US30"];

const INTERVALS = [
  { label: "1m",  val: "1"   },
  { label: "5m",  val: "5"   },
  { label: "15m", val: "15"  },
  { label: "1H",  val: "60"  },
  { label: "4H",  val: "240" },
  { label: "1D",  val: "D"   },
];

const EMOTION_EMOJI: Record<string, string> = {
  revenge: "😤", fear: "😰", greedy: "🤑",
  confident: "😎", bored: "😴", news: "📰",
};

function tvSym(pair: string): string {
  return TV_SYMBOL_MAP[pair.toUpperCase()] ?? pair.toUpperCase();
}

const fmt = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);
const pnlCls = (v: number) => v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400";

// ─── TradingView Widget ───────────────────────────────────────────────────────
function TradingViewWidget({ symbol, interval }: { symbol: string; interval: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const id = `tv_${Math.random().toString(36).slice(2)}`;
    ref.current.innerHTML = `<div id="${id}" style="height:100%;width:100%"></div>`;
    let dead = false;

    function init() {
      if (dead || !ref.current || !window.TradingView) return;
      new window.TradingView.widget({
        autosize: true,
        symbol: tvSym(symbol),
        interval,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0A0A0F",
        enable_publishing: false,
        allow_symbol_change: true,
        container_id: id,
        hide_side_toolbar: false,
        withdateranges: true,
        details: false,
        hotlist: false,
        calendar: false,
      });
    }

    if (window.TradingView) {
      init();
    } else {
      let script = document.getElementById("tv-script") as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
    }

    return () => {
      dead = true;
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [symbol, interval]);

  return (
    <div ref={ref}
         className="w-full h-full"
         style={{ minHeight: 320 }} />
  );
}

// ─── Stat mini-card ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "text-zinc-100" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-[var(--cj-raised)] rounded-xl p-3 border border-zinc-800">
      <p className="text-[11px] uppercase tracking-widest text-zinc-600 mb-1">{label}</p>
      <p className={`font-mono text-base font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Win-rate bar row ─────────────────────────────────────────────────────────
function WinBar({ label, winRate, total }: { label: string; winRate: number; total: number }) {
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400">{winRate.toFixed(0)}% · {total}t</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${winRate}%`,
            background: winRate >= 55 ? "linear-gradient(90deg,#34d399,#10b981)"
              : winRate >= 45 ? "linear-gradient(90deg,#F5C518,#C9A227)"
              : "linear-gradient(90deg,#f87171,#ef4444)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChartPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [trades,       setTrades]       = useState<Trade[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<"chart" | "insights">("chart");
  const [symbol,       setSymbol]       = useState("XAUUSD");
  const [interval,     setIntervalVal]  = useState("60");
  const [selected,     setSelected]     = useState<Trade | null>(null);
  const [insights,     setInsights]     = useState<Record<string, string>>({});
  const [loadingAI,    setLoadingAI]    = useState<string | null>(null);

  // ── Auth + data load ────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setCurrentUser(user);
      const { data } = await supabase
        .from("trades").select("*").eq("user_id", user.id)
        .order("date", { ascending: false });
      if (data) setTrades(data as Trade[]);
      setLoading(false);
    })();
  }, []);

  // ── Quick pair list (user's top pairs first, then defaults) ──────────────────
  const quickPairs = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const t of trades) cnt[t.pair] = (cnt[t.pair] || 0) + 1;
    const top = Object.entries(cnt).sort(([, a], [, b]) => b - a).slice(0, 8).map(([p]) => p);
    const result = [...top];
    for (const p of DEFAULT_PAIRS) if (!result.includes(p) && result.length < 8) result.push(p);
    return result;
  }, [trades]);

  // ── Trades for selected symbol ───────────────────────────────────────────────
  const symbolTrades = useMemo(
    () => trades.filter((t) => t.pair.toUpperCase() === symbol.toUpperCase()),
    [trades, symbol]
  );

  // ── Pattern stats (Insights tab) ─────────────────────────────────────────────
  const stats = useMemo(() => {
    if (trades.length < 3) return null;

    // Session win rates
    const sessMap: Record<string, { w: number; n: number }> = {};
    for (const t of trades) {
      const s = t.session || "Unknown";
      if (!sessMap[s]) sessMap[s] = { w: 0, n: 0 };
      sessMap[s].n++;
      if (t.pnl > 0) sessMap[s].w++;
    }
    const sessionStats = Object.entries(sessMap)
      .filter(([, v]) => v.n >= 2)
      .map(([session, v]) => ({ session, wr: (v.w / v.n) * 100, n: v.n }))
      .sort((a, b) => b.wr - a.wr);

    // Day-of-week win rates
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayMap: Record<number, { w: number; n: number }> = {};
    for (const t of trades) {
      const d = new Date(t.date + "T12:00:00").getDay();
      if (!dayMap[d]) dayMap[d] = { w: 0, n: 0 };
      dayMap[d].n++;
      if (t.pnl > 0) dayMap[d].w++;
    }
    const dayStats = (Object.entries(dayMap) as [string, { w: number; n: number }][])
      .filter(([, v]) => v.n >= 2)
      .map(([d, v]) => ({ day: DOW[+d], num: +d, wr: (v.w / v.n) * 100, n: v.n }))
      .sort((a, b) => a.num - b.num);

    // Pair win rates
    const pairMap: Record<string, { w: number; n: number; pnl: number }> = {};
    for (const t of trades) {
      if (!pairMap[t.pair]) pairMap[t.pair] = { w: 0, n: 0, pnl: 0 };
      pairMap[t.pair].n++;
      pairMap[t.pair].pnl += t.pnl;
      if (t.pnl > 0) pairMap[t.pair].w++;
    }
    const pairStats = Object.entries(pairMap)
      .map(([pair, v]) => ({ pair, wr: (v.w / v.n) * 100, n: v.n, pnl: v.pnl }))
      .sort((a, b) => b.wr - a.wr);

    // Average R:R
    const rrTrades = trades.filter(
      (t) => t.sl != null && t.tp != null && t.entry !== t.sl
    );
    const avgRR = rrTrades.length > 0
      ? rrTrades.reduce((s, t) => s + Math.abs((t.tp! - t.entry) / (t.entry - t.sl!)), 0) / rrTrades.length
      : null;

    // Max consecutive losses
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    let maxConsec = 0, runConsec = 0;
    for (const t of sorted) {
      if (t.pnl < 0) { runConsec++; maxConsec = Math.max(maxConsec, runConsec); }
      else runConsec = 0;
    }

    // Simulate "stop after 2 consecutive losses per day"
    const byDate: Record<string, Trade[]> = {};
    for (const t of sorted) {
      if (!byDate[t.date]) byDate[t.date] = [];
      byDate[t.date].push(t);
    }
    let simPnl = 0;
    for (const dayTrades of Object.values(byDate)) {
      let consec = 0;
      for (const t of dayTrades) {
        if (consec >= 2) break;
        simPnl += t.pnl;
        if (t.pnl < 0) consec++; else consec = 0;
      }
    }
    const actualPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const consecDelta = simPnl - actualPnl;

    // Derived insights
    const overallWR = (trades.filter((t) => t.pnl > 0).length / trades.length) * 100;
    const bestSession  = sessionStats[0] ?? null;
    const worstSession = sessionStats.at(-1) ?? null;
    const qualPairs    = pairStats.filter((p) => p.n >= 3);
    const bestPair     = qualPairs[0]     ?? null;
    const worstPair    = qualPairs.at(-1) ?? null;
    const bestDay      = [...dayStats].sort((a, b) => b.wr - a.wr)[0]  ?? null;
    const worstDay     = [...dayStats].sort((a, b) => a.wr - b.wr)[0]  ?? null;

    // Strengths
    const strengths: string[] = [];
    if (overallWR >= 55)                strengths.push(`${overallWR.toFixed(0)}% overall win rate`);
    if (bestSession && bestSession.wr >= 60) strengths.push(`Strong ${bestSession.session} session (${bestSession.wr.toFixed(0)}%)`);
    if (bestPair    && bestPair.wr >= 65)    strengths.push(`High win rate on ${bestPair.pair} (${bestPair.wr.toFixed(0)}%)`);
    if (avgRR && avgRR >= 1.5)          strengths.push(`Good R:R ratio (${avgRR.toFixed(2)}:1 avg)`);
    if (strengths.length === 0)         strengths.push("Building consistency — keep journaling");

    // Weaknesses
    const weaknesses: string[] = [];
    if (worstDay && worstDay.wr < 40 && worstDay.n >= 3)
      weaknesses.push(`Poor ${worstDay.day} performance (${worstDay.wr.toFixed(0)}%)`);
    if (maxConsec >= 3)
      weaknesses.push(`Streak losses — max ${maxConsec} in a row`);
    if (worstPair && worstPair.wr < 40 && worstPair !== bestPair)
      weaknesses.push(`${worstPair.pair} draining account (${worstPair.wr.toFixed(0)}% win rate)`);
    if (consecDelta > 5)
      weaknesses.push("Overtrading after losses — continuing past 2 losses daily");
    if (weaknesses.length === 0 && overallWR < 50)
      weaknesses.push("Win rate below 50% — review entry criteria");

    // Top recommendation
    let topRec = "";
    if (consecDelta > 10)
      topRec = `Stop trading after 2 consecutive losses per day — this alone could improve your P&L by ${fmt(consecDelta)}`;
    else if (worstPair && worstPair.wr < 35 && worstPair.n >= 4)
      topRec = `Cut ${worstPair.pair} from your watchlist — it has a ${worstPair.wr.toFixed(0)}% win rate across ${worstPair.n} trades`;
    else if (bestSession && worstSession && bestSession.wr - worstSession.wr > 20)
      topRec = `Focus on ${bestSession.session} session (${bestSession.wr.toFixed(0)}%) and reduce ${worstSession.session} trades (${worstSession.wr.toFixed(0)}%)`;
    else if (bestPair && bestPair.wr >= 60)
      topRec = `Double down on ${bestPair.pair} — your best pair at ${bestPair.wr.toFixed(0)}% win rate`;
    else
      topRec = "Add SL/TP to every trade and journal your setup — consistency builds edge";

    return {
      sessionStats, dayStats, pairStats,
      avgRR, maxConsec, consecDelta, simPnl, actualPnl,
      overallWR, strengths, weaknesses, topRec,
      bestSession, worstSession, bestPair, worstPair, bestDay, worstDay,
    };
  }, [trades]);

  // ── AI insight for a trade ───────────────────────────────────────────────────
  async function getInsight(trade: Trade) {
    if (insights[trade.id] || loadingAI) return;
    setLoadingAI(trade.id);
    try {
      const res = await fetch("/api/trade-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade }),
      });
      const data = (await res.json()) as { insight?: string; error?: string };
      setInsights((prev) => ({
        ...prev,
        [trade.id]: data.insight ?? (data.error || "Unable to generate insight."),
      }));
    } catch {
      setInsights((prev) => ({ ...prev, [trade.id]: "Network error — try again." }));
    } finally {
      setLoadingAI(null);
    }
  }

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading chart...</div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[var(--cj-bg)] text-zinc-100 font-sans flex flex-col"
         style={{ height: "100vh" }}>

      <Sidebar user={currentUser} onSignOut={handleLogout} />

      {/* Main content — offset for sidebar/mobile-topbar */}
      <div className="md:ml-[240px] pt-14 md:pt-0 flex flex-col flex-1 min-h-0">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3"
             style={{ borderBottom: "1px solid var(--cj-border)", background: "var(--cj-bg)" }}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🕯️</span>
            <span className="font-semibold text-base text-zinc-100">Live Chart</span>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-[var(--cj-raised)] rounded-xl p-1"
               style={{ border: "1px solid var(--cj-border)" }}>
            {(["chart", "insights"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                            ${tab === t
                              ? "text-[#0A0A0F]"
                              : "text-zinc-500 hover:text-zinc-300"
                            }`}
                style={tab === t
                  ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" }
                  : undefined}
              >
                {t === "chart" ? "📊 Chart" : "💡 Insights"}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════ CHART TAB ════════════════════════════════ */}
        {tab === "chart" && (
          <div className="flex-1 flex flex-col min-h-0">

            {/* Asset + interval bar */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 overflow-x-auto"
                 style={{ borderBottom: "1px solid var(--cj-border)", background: "var(--cj-surface)" }}>

              {/* Pair buttons */}
              <div className="flex gap-1.5 shrink-0">
                {quickPairs.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setSymbol(p); setSelected(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap`}
                    style={symbol === p
                      ? { background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F", border: "none" }
                      : { background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "#9B8B75" }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-zinc-700 shrink-0" />

              {/* Interval buttons */}
              <div className="flex gap-1 shrink-0">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv.val}
                    onClick={() => setIntervalVal(iv.val)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-all
                                ${interval === iv.val
                                  ? "bg-zinc-700 text-zinc-100"
                                  : "text-zinc-600 hover:text-zinc-400"
                                }`}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart + Trade panel */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

              {/* TradingView chart */}
              <div className="flex-1 min-h-[55vw] md:min-h-0">
                <TradingViewWidget
                  key={`${symbol}-${interval}`}
                  symbol={symbol}
                  interval={interval}
                />
              </div>

              {/* Trade panel */}
              <div className="w-full md:w-[300px] md:shrink-0 flex flex-col overflow-hidden"
                   style={{ background: "var(--cj-surface)", borderLeft: "1px solid var(--cj-border)" }}>

                {/* Panel header */}
                <div className="shrink-0 px-4 py-3"
                     style={{ borderBottom: "1px solid var(--cj-border)" }}>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm font-semibold text-zinc-300">{symbol}</p>
                    {symbolTrades.length > 0 && (
                      <span className={`text-xs font-mono font-semibold ${pnlCls(symbolTrades.reduce((s, t) => s + t.pnl, 0))}`}>
                        {fmt(symbolTrades.reduce((s, t) => s + t.pnl, 0))}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-zinc-600 mt-0.5">
                    {symbolTrades.length} trade{symbolTrades.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Trade list */}
                <div className="flex-1 overflow-y-auto">
                  {symbolTrades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600 px-4">
                      <div className="text-3xl mb-3">📭</div>
                      <p className="text-sm text-center">No {symbol} trades yet</p>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-zinc-800/40">
                        {symbolTrades.slice(0, 30).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setSelected(selected?.id === t.id ? null : t)}
                            className={`w-full text-left px-4 py-3 transition-all
                                        ${selected?.id === t.id
                                          ? "bg-[var(--cj-gold-glow)] border-l-2 border-l-[var(--cj-gold)]"
                                          : "hover:bg-[var(--cj-gold-glow)] border-l-2 border-l-transparent"
                                        }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono
                                                  ${t.direction === "BUY"
                                                    ? "bg-emerald-500/15 text-emerald-400"
                                                    : "bg-rose-500/15 text-rose-400"}`}>
                                  {t.direction}
                                </span>
                                <span className="text-[12px] text-zinc-500">{t.date}</span>
                                {t.emotion && (
                                  <span className="text-xs">{EMOTION_EMOJI[t.emotion] ?? ""}</span>
                                )}
                              </div>
                              <span className={`text-xs font-mono font-semibold ${pnlCls(t.pnl)}`}>
                                {fmt(t.pnl)}
                              </span>
                            </div>
                            <div className="text-[12px] text-zinc-600 font-mono">
                              {t.entry} → {t.exit_price} · {t.lot}L
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Selected trade detail */}
                      {selected && (
                        <div className="px-4 py-4" style={{ borderTop: "1px solid var(--cj-border)" }}>
                          <p className="text-[12px] uppercase tracking-widest text-zinc-500 font-semibold mb-3">
                            Trade Detail
                          </p>

                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                              { l: "Entry",  v: String(selected.entry) },
                              { l: "Exit",   v: String(selected.exit_price) },
                              { l: "SL",     v: selected.sl != null ? String(selected.sl) : "—" },
                              { l: "TP",     v: selected.tp != null ? String(selected.tp) : "—" },
                            ].map(({ l, v }) => (
                              <div key={l} className="bg-[var(--cj-raised)] rounded-lg p-2.5">
                                <p className="text-[10px] text-zinc-600 uppercase">{l}</p>
                                <p className="font-mono text-xs text-zinc-300 mt-0.5">{v}</p>
                              </div>
                            ))}
                          </div>

                          {selected.sl != null && selected.tp != null && selected.entry !== selected.sl && (
                            <p className="text-[12px] text-zinc-500 mb-2">
                              R:R planned:{" "}
                              <span className="font-mono text-zinc-300">
                                {Math.abs((selected.tp - selected.entry) / (selected.entry - selected.sl)).toFixed(2)}:1
                              </span>
                            </p>
                          )}

                          {selected.setup && (
                            <p className="text-[12px] text-zinc-400 mb-1">
                              <span className="text-zinc-600">Setup: </span>{selected.setup}
                            </p>
                          )}
                          {selected.notes && (
                            <p className="text-[12px] text-zinc-400 mb-3 leading-relaxed">
                              <span className="text-zinc-600">Notes: </span>{selected.notes}
                            </p>
                          )}

                          {/* AI Insight */}
                          <div className="mt-3">
                            <p className="text-[12px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
                              AI Insight
                            </p>
                            {insights[selected.id] ? (
                              <div className="bg-[var(--cj-raised)] rounded-xl p-3"
                                   style={{ border: "1px solid var(--cj-border)" }}>
                                <p className="text-[12px] text-zinc-300 leading-relaxed">
                                  {insights[selected.id]}
                                </p>
                              </div>
                            ) : (
                              <button
                                onClick={() => getInsight(selected)}
                                disabled={loadingAI === selected.id}
                                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all
                                           border border-zinc-700 text-zinc-400
                                           hover:border-[var(--cj-gold-muted)] hover:text-[var(--cj-gold)]
                                           disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {loadingAI === selected.id ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <span className="w-3 h-3 border border-[var(--cj-gold)] border-t-transparent rounded-full animate-spin" />
                                    Analysing...
                                  </span>
                                ) : "🤖 Analyse this trade"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ INSIGHTS TAB ═════════════════════════════ */}
        {tab === "insights" && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">

            {trades.length < 3 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-base text-zinc-400 font-semibold mb-1">Not enough data yet</p>
                <p className="text-sm">Log at least 3 trades to unlock insights</p>
              </div>
            ) : stats && (
              <div className="max-w-4xl mx-auto space-y-6">

                {/* ── Overview stat row ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Win Rate" value={`${stats.overallWR.toFixed(1)}%`}
                    color={stats.overallWR >= 50 ? "text-emerald-400" : "text-rose-400"}
                    sub={`${trades.filter((t) => t.pnl > 0).length}W / ${trades.filter((t) => t.pnl < 0).length}L`} />
                  <StatCard label="Total P&L" value={fmt(stats.actualPnl)}
                    color={pnlCls(stats.actualPnl)} sub={`${trades.length} trades`} />
                  <StatCard label="Avg R:R" value={stats.avgRR ? `${stats.avgRR.toFixed(2)}:1` : "N/A"}
                    color={stats.avgRR && stats.avgRR >= 1.5 ? "text-emerald-400" : "text-zinc-300"} />
                  <StatCard label="Max Consec. Losses" value={String(stats.maxConsec)}
                    color={stats.maxConsec >= 4 ? "text-rose-400" : "text-zinc-300"} />
                </div>

                {/* ── Simulated improvements ── */}
                <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                     style={{ border: "1px solid var(--cj-border)" }}>
                  <p className="card-label mb-4">Simulated Improvements</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                    {/* Consecutive loss rule */}
                    {stats.consecDelta !== 0 && (
                      <div className={`rounded-xl p-4 ${stats.consecDelta > 0
                        ? "bg-emerald-500/8 border border-emerald-500/20"
                        : "bg-zinc-800/40 border border-zinc-700"}`}>
                        <p className="text-lg mb-2">🛑</p>
                        <p className="text-sm text-zinc-200 leading-snug mb-1">
                          {stats.consecDelta > 0
                            ? `Stop after 2 consecutive losses per day and your P&L improves by `
                            : `Your daily loss-limit rule is already saving you.`}
                          {stats.consecDelta > 0 && (
                            <span className="font-mono font-semibold text-emerald-400">
                              {fmt(stats.consecDelta)}
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-zinc-600">
                          Simulated: {fmt(stats.simPnl)} vs actual: {fmt(stats.actualPnl)}
                        </p>
                      </div>
                    )}

                    {/* Best vs worst pair */}
                    {stats.bestPair && stats.worstPair && stats.bestPair !== stats.worstPair && (
                      <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4">
                        <p className="text-lg mb-2">🎯</p>
                        <p className="text-sm text-zinc-200 leading-snug mb-1">
                          Your win rate on{" "}
                          <span className="font-mono font-semibold text-[var(--cj-gold)]">
                            {stats.bestPair.pair}
                          </span>
                          {" "}({stats.bestPair.wr.toFixed(0)}%) is higher than{" "}
                          <span className="font-mono font-semibold text-rose-400">
                            {stats.worstPair.pair}
                          </span>
                          {" "}({stats.worstPair.wr.toFixed(0)}%)
                        </p>
                        <p className="text-[12px] text-zinc-600">Consider focusing on {stats.bestPair.pair}</p>
                      </div>
                    )}

                    {/* Session comparison */}
                    {stats.bestSession && stats.worstSession && stats.bestSession !== stats.worstSession && (
                      <div className="bg-[var(--cj-gold-glow)] border border-[var(--cj-gold-muted)]/30 rounded-xl p-4">
                        <p className="text-lg mb-2">⏰</p>
                        <p className="text-sm text-zinc-200 leading-snug mb-1">
                          You win{" "}
                          <span className="font-mono font-semibold text-[var(--cj-gold)]">
                            {(stats.bestSession.wr - stats.worstSession.wr).toFixed(0)}%
                          </span>
                          {" "}more in{" "}
                          <span className="font-semibold text-[var(--cj-gold)]">
                            {stats.bestSession.session}
                          </span>
                          {" "}session than {stats.worstSession.session}
                        </p>
                        <p className="text-[12px] text-zinc-600">
                          {stats.bestSession.session}: {stats.bestSession.wr.toFixed(0)}% ·{" "}
                          {stats.worstSession.session}: {stats.worstSession.wr.toFixed(0)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Win rate breakdown ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                  {/* Session win rates */}
                  {stats.sessionStats.length > 0 && (
                    <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                         style={{ border: "1px solid var(--cj-border)" }}>
                      <p className="card-label mb-4">By Session</p>
                      <div className="space-y-3">
                        {stats.sessionStats.map((s) => (
                          <WinBar key={s.session} label={s.session} winRate={s.wr} total={s.n} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Day of week win rates */}
                  {stats.dayStats.length > 0 && (
                    <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                         style={{ border: "1px solid var(--cj-border)" }}>
                      <p className="card-label mb-4">By Day</p>
                      <div className="space-y-3">
                        {stats.dayStats.map((d) => (
                          <WinBar key={d.day} label={d.day} winRate={d.wr} total={d.n} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pair win rates */}
                  {stats.pairStats.length > 0 && (
                    <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                         style={{ border: "1px solid var(--cj-border)" }}>
                      <p className="card-label mb-4">By Pair</p>
                      <div className="space-y-3">
                        {stats.pairStats.slice(0, 6).map((p) => (
                          <WinBar key={p.pair} label={p.pair} winRate={p.wr} total={p.n} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Strengths / Weaknesses / Top recommendation ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

                  {/* Strengths */}
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-3">
                      💪 Strengths
                    </p>
                    <ul className="space-y-2">
                      {stats.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex gap-2">
                          <span className="text-emerald-500 shrink-0">✓</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Weaknesses */}
                  <div className="bg-rose-500/8 border border-rose-500/20 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-rose-400 uppercase tracking-widest mb-3">
                      ⚠️ Weaknesses
                    </p>
                    <ul className="space-y-2">
                      {stats.weaknesses.map((w, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex gap-2">
                          <span className="text-rose-500 shrink-0">✗</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Top recommendation */}
                  <div className="rounded-2xl p-5"
                       style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-gold-muted)" }}>
                    <p className="text-sm font-semibold uppercase tracking-widest mb-3"
                       style={{ color: "var(--cj-gold)" }}>
                      🎯 Top Recommendation
                    </p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{stats.topRec}</p>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
