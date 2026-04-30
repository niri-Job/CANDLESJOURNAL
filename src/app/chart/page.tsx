"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
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
  emotion: string | null;
  session: string;
  setup: string;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
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

const fmt    = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);
const pnlCls = (v: number) => v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-400";

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function calcPips(pair: string, entry: number, exit: number): string {
  const diff = Math.abs(entry - exit);
  const p = pair.toUpperCase();
  if (p.includes("BTC") || p.includes("ETH")) return "—";
  if (p.includes("JPY")) return (diff * 100).toFixed(1);
  if (p === "XAUUSD") return (diff * 10).toFixed(1);
  if (p === "XAGUSD") return (diff * 100).toFixed(1);
  if (p.includes("US30") || p.includes("NAS") || p.includes("SPX")) return diff.toFixed(1);
  return (diff * 10000).toFixed(1);
}

function calcRR(entry: number, sl: number | null, tp: number | null): string | null {
  if (sl == null || tp == null || entry === sl) return null;
  return Math.abs((tp - entry) / (entry - sl)).toFixed(2);
}

// ─── Lightweight Chart Widget ─────────────────────────────────────────────────
function LightweightChartWidget({
  symbol, interval, selectedTrade,
}: {
  symbol: string;
  interval: string;
  selectedTrade: Trade | null;
}) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<any>(null);        // IChartApi
  const candleRef     = useRef<any>(null);        // ISeriesApi<Candlestick>
  const shadeRef      = useRef<any>(null);        // ISeriesApi<Histogram>
  const priceLinesRef = useRef<any[]>([]);        // IPriceLine[]
  const markersRef    = useRef<any>(null);        // ISeriesMarkersPluginApi
  const dataRef       = useRef<CandleData[]>([]); // loaded OHLCV
  const fetchIdRef    = useRef(0);                // stale-fetch guard

  // Stable refs so async callbacks always see current values
  const symRef   = useRef(symbol);
  const ivlRef   = useRef(interval);
  const tradeRef = useRef(selectedTrade);
  symRef.current   = symbol;
  ivlRef.current   = interval;
  tradeRef.current = selectedTrade;

  const [chartStatus, setChartStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg,      setErrMsg]      = useState("");

  // ── Clear all trade overlays ──────────────────────────────────────────────
  function clearOverlays() {
    const s = candleRef.current;
    const c = chartRef.current;
    priceLinesRef.current.forEach((pl) => { try { s?.removePriceLine(pl); } catch {} });
    priceLinesRef.current = [];
    try { markersRef.current?.detach(); } catch {}
    markersRef.current = null;
    if (shadeRef.current && c) {
      try { c.removeSeries(shadeRef.current); } catch {}
      shadeRef.current = null;
    }
  }

  // ── Draw trade overlays (price lines, markers, shade) ────────────────────
  function drawOverlays(trade: Trade | null) {
    clearOverlays();
    const data = dataRef.current;
    if (!trade || !candleRef.current || !chartRef.current || !data.length) return;

    import("lightweight-charts").then(({ LineStyle, HistogramSeries, createSeriesMarkers }) => {
      const s = candleRef.current;
      const c = chartRef.current;
      const d = dataRef.current;
      if (!s || !c || !d.length) return;

      // ── Price lines ─────────────────────────────────────────────────────
      const lines: any[] = [
        s.createPriceLine({ price: trade.entry,      color: "#34d399", lineWidth: 2, lineStyle: LineStyle.Solid,  axisLabelVisible: true, title: "Entry" }),
        s.createPriceLine({ price: trade.exit_price, color: "#f97316", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Exit"  }),
      ];
      if (trade.sl != null) lines.push(s.createPriceLine({ price: trade.sl, color: "#f87171", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "SL" }));
      if (trade.tp != null) lines.push(s.createPriceLine({ price: trade.tp, color: "#93c5fd", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "TP" }));
      priceLinesRef.current = lines;

      // ── Find closest candle to trade date ────────────────────────────────
      const dayStart    = Math.floor(new Date(trade.date + "T00:00:00Z").getTime() / 1000);
      const dayEnd      = dayStart + 86400;
      const tradeCandle: CandleData =
        d.find((pt) => pt.time >= dayStart && pt.time < dayEnd) ??
        d.reduce((a, b) => Math.abs(a.time - dayStart) < Math.abs(b.time - dayStart) ? a : b);

      // ── Arrow markers ────────────────────────────────────────────────────
      markersRef.current = createSeriesMarkers(s, [
        { time: tradeCandle.time, position: "belowBar", color: "#34d399", shape: "arrowUp",   text: "Entry" },
        { time: tradeCandle.time, position: "aboveBar", color: "#f97316", shape: "arrowDown", text: "Exit"  },
      ]);

      // ── Shade band between entry and exit price levels ───────────────────
      const shadeHigh  = Math.max(trade.entry, trade.exit_price);
      const shadeLow   = Math.min(trade.entry, trade.exit_price);
      const shadeColor = trade.pnl >= 0 ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.18)";
      const shade = c.addSeries(HistogramSeries, {
        base: shadeLow,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      shade.setData(d.map((pt) => ({ time: pt.time, value: shadeHigh, color: shadeColor })));
      shadeRef.current = shade;

      // ── Navigate chart to trade date ─────────────────────────────────────
      const buffer = 20 * 3600; // ±20h visible window
      c.timeScale().setVisibleRange({
        from: tradeCandle.time - buffer,
        to:   tradeCandle.time + buffer,
      });
    });
  }

  // ── Fetch OHLCV from /api/ohlcv ───────────────────────────────────────────
  async function fetchData(sym: string, ivl: string, trade: Trade | null) {
    if (!candleRef.current) return;
    const fid = ++fetchIdRef.current;
    setChartStatus("loading");
    setErrMsg("");
    try {
      const res  = await fetch(`/api/ohlcv?symbol=${sym}&interval=${ivl}`);
      const body = await res.json() as unknown;
      if (fid !== fetchIdRef.current) return; // superseded by newer fetch
      if (!Array.isArray(body)) {
        const errObj = body as Record<string, string>;
        setErrMsg(errObj?.error ?? "Failed to load chart data");
        setChartStatus("error");
        return;
      }
      candleRef.current?.setData(body);
      dataRef.current = body as CandleData[];
      chartRef.current?.timeScale().fitContent();
      setChartStatus("ready");
      drawOverlays(trade);
    } catch {
      if (fid !== fetchIdRef.current) return;
      setErrMsg("Network error — check your connection");
      setChartStatus("error");
    }
  }

  // ── Mount: init chart once ────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    import("lightweight-charts").then(({ createChart, CandlestickSeries }) => {
      if (dead || !containerRef.current) return;
      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { color: "#0A0A0F" },
          textColor: "#6b7280",
        },
        grid: {
          vertLines: { color: "#18181b" },
          horzLines: { color: "#18181b" },
        },
        crosshair: { mode: 0 }, // CrosshairMode.Normal = 0
        rightPriceScale: { borderColor: "#27272a" },
        timeScale: { borderColor: "#27272a", timeVisible: true, secondsVisible: false },
      });
      const candle = chart.addSeries(CandlestickSeries, {
        upColor: "#34d399", downColor: "#f87171",
        borderVisible: false,
        wickUpColor: "#34d399", wickDownColor: "#f87171",
      });
      chartRef.current  = chart;
      candleRef.current = candle;
      fetchData(symRef.current, ivlRef.current, tradeRef.current);
    });
    return () => {
      dead = true;
      chartRef.current?.remove();
      chartRef.current  = null;
      candleRef.current = null;
      shadeRef.current  = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-fetch when symbol or interval changes ──────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return; // not yet initialized — init handles first fetch
    clearOverlays();
    fetchData(symbol, interval, tradeRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  // ── Redraw overlays when selected trade changes ───────────────────────────
  useEffect(() => {
    if (!candleRef.current || !dataRef.current.length) return;
    drawOverlays(selectedTrade);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrade]);

  return (
    <div className="relative w-full h-full" style={{ minHeight: 320 }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {chartStatus === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0F]/70 z-10">
          <div className="w-5 h-5 border-2 border-[var(--cj-gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {chartStatus === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A0F]/85 z-10 gap-3 px-6 text-center">
          <span className="text-2xl">📡</span>
          <p className="text-sm text-rose-400 font-mono">{errMsg}</p>
          <button
            onClick={() => fetchData(symbol, interval, tradeRef.current)}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────
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

function WinBar({ label, winRate, total }: { label: string; winRate: number; total: number }) {
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-400">{winRate.toFixed(0)}% · {total}t</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{
          width: `${winRate}%`,
          background: winRate >= 55
            ? "linear-gradient(90deg,#34d399,#10b981)"
            : winRate >= 45
            ? "linear-gradient(90deg,#F5C518,#C9A227)"
            : "linear-gradient(90deg,#f87171,#ef4444)",
        }} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChartPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [trades,      setTrades]      = useState<Trade[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<"chart" | "insights">("chart");
  const [symbol,      setSymbol]      = useState("XAUUSD");
  const [interval,    setIntervalVal] = useState("60");
  const [selected,    setSelected]    = useState<Trade | null>(null);
  const [insights,    setInsights]    = useState<Record<string, string>>({});
  const [loadingAI,   setLoadingAI]   = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);

  // ── Auth + data load ──────────────────────────────────────────────────────
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

  // ── Quick pair list ───────────────────────────────────────────────────────
  const quickPairs = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const t of trades) cnt[t.pair] = (cnt[t.pair] || 0) + 1;
    const top = Object.entries(cnt).sort(([, a], [, b]) => b - a).slice(0, 8).map(([p]) => p);
    const result = [...top];
    for (const p of DEFAULT_PAIRS) if (!result.includes(p) && result.length < 8) result.push(p);
    return result;
  }, [trades]);

  const symbolTrades = useMemo(
    () => trades.filter((t) => t.pair.toUpperCase() === symbol.toUpperCase()),
    [trades, symbol]
  );

  // ── Click a trade: switch symbol, set 1H, let chart navigate ─────────────
  function handleTradeClick(t: Trade) {
    if (selected?.id === t.id) { setSelected(null); return; }
    setSelected(t);
    if (t.pair.toUpperCase() !== symbol.toUpperCase()) setSymbol(t.pair.toUpperCase());
    setIntervalVal("60");
  }

  // ── Copy trade details ────────────────────────────────────────────────────
  function copyTrade(t: Trade) {
    const rr   = calcRR(t.entry, t.sl, t.tp);
    const pips = calcPips(t.pair, t.entry, t.exit_price);
    const text =
`${t.pair} ${t.direction} | ${t.date}
Entry: ${t.entry} | Exit: ${t.exit_price}
SL: ${t.sl ?? "—"} | TP: ${t.tp ?? "—"}
P&L: ${fmt(t.pnl)} | Pips: ${pips} | Lot: ${t.lot} | R:R: ${rr ?? "N/A"}
Session: ${t.session} | Setup: ${t.setup || "—"}
Notes: ${t.notes || "—"}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // ── AI insight ────────────────────────────────────────────────────────────
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

  // ── Insights-tab stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (trades.length < 3) return null;

    const sessMap: Record<string, { w: number; n: number }> = {};
    for (const t of trades) {
      const s = t.session || "Unknown";
      if (!sessMap[s]) sessMap[s] = { w: 0, n: 0 };
      sessMap[s].n++; if (t.pnl > 0) sessMap[s].w++;
    }
    const sessionStats = Object.entries(sessMap).filter(([, v]) => v.n >= 2)
      .map(([session, v]) => ({ session, wr: (v.w / v.n) * 100, n: v.n }))
      .sort((a, b) => b.wr - a.wr);

    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayMap: Record<number, { w: number; n: number }> = {};
    for (const t of trades) {
      const d = new Date(t.date + "T12:00:00").getDay();
      if (!dayMap[d]) dayMap[d] = { w: 0, n: 0 };
      dayMap[d].n++; if (t.pnl > 0) dayMap[d].w++;
    }
    const dayStats = (Object.entries(dayMap) as [string, { w: number; n: number }][])
      .filter(([, v]) => v.n >= 2)
      .map(([d, v]) => ({ day: DOW[+d], num: +d, wr: (v.w / v.n) * 100, n: v.n }))
      .sort((a, b) => a.num - b.num);

    const pairMap: Record<string, { w: number; n: number; pnl: number }> = {};
    for (const t of trades) {
      if (!pairMap[t.pair]) pairMap[t.pair] = { w: 0, n: 0, pnl: 0 };
      pairMap[t.pair].n++; pairMap[t.pair].pnl += t.pnl;
      if (t.pnl > 0) pairMap[t.pair].w++;
    }
    const pairStats = Object.entries(pairMap)
      .map(([pair, v]) => ({ pair, wr: (v.w / v.n) * 100, n: v.n, pnl: v.pnl }))
      .sort((a, b) => b.wr - a.wr);

    const rrTrades = trades.filter((t) => t.sl != null && t.tp != null && t.entry !== t.sl);
    const avgRR = rrTrades.length > 0
      ? rrTrades.reduce((s, t) => s + Math.abs((t.tp! - t.entry) / (t.entry - t.sl!)), 0) / rrTrades.length
      : null;

    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    let maxConsec = 0, run = 0;
    for (const t of sorted) { if (t.pnl < 0) { run++; maxConsec = Math.max(maxConsec, run); } else run = 0; }

    const byDate: Record<string, Trade[]> = {};
    for (const t of sorted) { if (!byDate[t.date]) byDate[t.date] = []; byDate[t.date].push(t); }
    let simPnl = 0;
    for (const dt of Object.values(byDate)) {
      let c = 0;
      for (const t of dt) { if (c >= 2) break; simPnl += t.pnl; if (t.pnl < 0) c++; else c = 0; }
    }
    const actualPnl  = trades.reduce((s, t) => s + t.pnl, 0);
    const consecDelta = simPnl - actualPnl;
    const overallWR  = (trades.filter((t) => t.pnl > 0).length / trades.length) * 100;

    const bestSession  = sessionStats[0]      ?? null;
    const worstSession = sessionStats.at(-1)  ?? null;
    const qualPairs    = pairStats.filter((p) => p.n >= 3);
    const bestPair     = qualPairs[0]         ?? null;
    const worstPair    = qualPairs.at(-1)     ?? null;
    const bestDay      = [...dayStats].sort((a, b) => b.wr - a.wr)[0] ?? null;
    const worstDay     = [...dayStats].sort((a, b) => a.wr - b.wr)[0] ?? null;

    const strengths: string[] = [];
    if (overallWR >= 55) strengths.push(`${overallWR.toFixed(0)}% overall win rate`);
    if (bestSession?.wr >= 60) strengths.push(`Strong ${bestSession.session} session (${bestSession.wr.toFixed(0)}%)`);
    if (bestPair?.wr >= 65)   strengths.push(`High win rate on ${bestPair.pair} (${bestPair.wr.toFixed(0)}%)`);
    if (avgRR && avgRR >= 1.5) strengths.push(`Good R:R ratio (${avgRR.toFixed(2)}:1 avg)`);
    if (!strengths.length) strengths.push("Building consistency — keep journaling");

    const weaknesses: string[] = [];
    if (worstDay?.wr < 40 && worstDay.n >= 3) weaknesses.push(`Poor ${worstDay.day} performance (${worstDay.wr.toFixed(0)}%)`);
    if (maxConsec >= 3) weaknesses.push(`Streak losses — max ${maxConsec} in a row`);
    if (worstPair != null && worstPair.wr < 40 && worstPair !== bestPair) weaknesses.push(`${worstPair.pair} draining account (${worstPair.wr.toFixed(0)}%)`);
    if (consecDelta > 5) weaknesses.push("Overtrading after losses past 2 daily");
    if (!weaknesses.length && overallWR < 50) weaknesses.push("Win rate below 50% — review entry criteria");

    let topRec = "";
    if (consecDelta > 10) topRec = `Stop after 2 consecutive losses per day — could improve P&L by ${fmt(consecDelta)}`;
    else if (worstPair != null && worstPair.wr < 35 && worstPair.n >= 4) topRec = `Cut ${worstPair.pair} — ${worstPair.wr.toFixed(0)}% win rate across ${worstPair.n} trades`;
    else if (bestSession && worstSession && bestSession.wr - worstSession.wr > 20)
      topRec = `Focus on ${bestSession.session} (${bestSession.wr.toFixed(0)}%), reduce ${worstSession.session} trades`;
    else if (bestPair?.wr >= 60) topRec = `Double down on ${bestPair.pair} — your best pair at ${bestPair.wr.toFixed(0)}%`;
    else topRec = "Add SL/TP to every trade and journal your setup — consistency builds edge";

    return { sessionStats, dayStats, pairStats, avgRR, maxConsec, consecDelta, simPnl, actualPnl, overallWR, strengths, weaknesses, topRec, bestSession, worstSession, bestPair, worstPair, bestDay, worstDay };
  }, [trades]);

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading chart...</div>
      </div>
    );
  }

  // ── Selected trade computed values ────────────────────────────────────────
  const selPips = selected ? calcPips(selected.pair, selected.entry, selected.exit_price) : null;
  const selRR   = selected ? calcRR(selected.entry, selected.sl, selected.tp) : null;

  return (
    <div className="bg-[var(--cj-bg)] text-zinc-100 font-sans flex flex-col" style={{ height: "100vh" }}>
      <Sidebar user={currentUser} onSignOut={handleLogout} />

      <div className="md:ml-[240px] pt-14 md:pt-0 flex flex-col flex-1 min-h-0">

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3"
             style={{ borderBottom: "1px solid var(--cj-border)", background: "var(--cj-bg)" }}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🕯️</span>
            <span className="font-semibold text-base text-zinc-100">Live Chart</span>
          </div>
          <div className="flex gap-1 bg-[var(--cj-raised)] rounded-xl p-1" style={{ border: "1px solid var(--cj-border)" }}>
            {(["chart", "insights"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize
                            ${tab === t ? "text-[#0A0A0F]" : "text-zinc-500 hover:text-zinc-300"}`}
                style={tab === t ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" } : undefined}>
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
              <div className="flex gap-1.5 shrink-0">
                {quickPairs.map((p) => (
                  <button key={p}
                    onClick={() => { setSymbol(p); setSelected(null); }}
                    className="px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap"
                    style={symbol === p
                      ? { background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F", border: "none" }
                      : { background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "#9B8B75" }}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-zinc-700 shrink-0" />
              <div className="flex gap-1 shrink-0">
                {INTERVALS.map((iv) => (
                  <button key={iv.val} onClick={() => setIntervalVal(iv.val)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-all
                                ${interval === iv.val ? "bg-zinc-700 text-zinc-100" : "text-zinc-600 hover:text-zinc-400"}`}>
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade-focus banner */}
            {selected && (
              <div className="shrink-0 flex items-center gap-2 px-4 py-2 text-[13px] overflow-x-auto"
                   style={{ background: "var(--cj-gold-glow)", borderBottom: "1px solid var(--cj-gold-muted)" }}>
                <span style={{ color: "var(--cj-gold)" }} className="shrink-0">📍</span>
                <span className="text-zinc-300 whitespace-nowrap">
                  Viewing:{" "}
                  <span className="font-mono font-semibold text-zinc-100">{selected.pair}</span> trade from{" "}
                  <span className="font-semibold text-zinc-100">{fmtDate(selected.date)}</span>
                  {"  —  "}
                  <span className="text-zinc-400">Entry: <span className="font-mono text-zinc-200">{selected.entry}</span></span>
                  {"  ·  "}
                  <span className="text-zinc-400">Exit: <span className="font-mono text-zinc-200">{selected.exit_price}</span></span>
                  {"  ·  "}
                  <span className={`font-mono font-semibold ${pnlCls(selected.pnl)}`}>{fmt(selected.pnl)}</span>
                </span>
                <button onClick={() => setSelected(null)}
                        className="ml-auto shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors text-sm">✕</button>
              </div>
            )}

            {/* Chart + Trade panel */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

              {/* Lightweight Charts */}
              <div className="flex-1 min-h-[55vw] md:min-h-0">
                <LightweightChartWidget
                  symbol={symbol}
                  interval={interval}
                  selectedTrade={selected}
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

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto">
                  {symbolTrades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600 px-4">
                      <div className="text-3xl mb-3">📭</div>
                      <p className="text-sm text-center">No {symbol} trades yet</p>
                    </div>
                  ) : (
                    <>
                      {/* Trade list */}
                      <div className="divide-y divide-zinc-800/40">
                        {symbolTrades.slice(0, 30).map((t) => (
                          <button key={t.id}
                            onClick={() => handleTradeClick(t)}
                            className={`w-full text-left px-4 py-3 transition-all border-l-2
                                        ${selected?.id === t.id
                                          ? "bg-[var(--cj-gold-glow)] border-l-[var(--cj-gold)]"
                                          : "border-l-transparent hover:bg-[var(--cj-gold-glow)] hover:border-l-[var(--cj-gold-muted)]"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono
                                                  ${t.direction === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                                  {t.direction}
                                </span>
                                <span className="text-[12px] text-zinc-500">{t.date}</span>
                                {t.emotion && <span className="text-xs">{EMOTION_EMOJI[t.emotion] ?? ""}</span>}
                              </div>
                              <span className={`text-xs font-mono font-semibold ${pnlCls(t.pnl)}`}>{fmt(t.pnl)}</span>
                            </div>
                            <div className="text-[12px] text-zinc-600 font-mono">
                              {t.entry} → {t.exit_price} · {t.lot}L
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* ── Selected trade detail card ── */}
                      {selected && (
                        <div className="px-4 py-4" style={{ borderTop: "1px solid var(--cj-border)" }}>

                          {/* Header row */}
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[12px] uppercase tracking-widest text-zinc-500 font-semibold">
                              Trade Detail
                            </p>
                            <button
                              onClick={() => copyTrade(selected)}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all font-medium
                                          ${copied
                                            ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                                            : "border-zinc-700 text-zinc-500 hover:border-[var(--cj-gold-muted)] hover:text-[var(--cj-gold)]"}`}>
                              {copied ? "Copied ✓" : "Copy"}
                            </button>
                          </div>

                          {/* Colour-coded price grid */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="rounded-xl p-3" style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)" }}>
                              <p className="text-[10px] font-semibold uppercase text-emerald-400">Entry</p>
                              <p className="font-mono text-sm text-zinc-100 mt-0.5">{selected.entry}</p>
                            </div>
                            <div className="rounded-xl p-3" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.30)" }}>
                              <p className="text-[10px] font-semibold uppercase text-orange-400">Exit</p>
                              <p className="font-mono text-sm text-zinc-100 mt-0.5">{selected.exit_price}</p>
                            </div>
                            {selected.sl != null && (
                              <div className="rounded-xl p-3" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
                                <p className="text-[10px] font-semibold uppercase text-rose-400">Stop Loss</p>
                                <p className="font-mono text-sm text-zinc-100 mt-0.5">{selected.sl}</p>
                              </div>
                            )}
                            {selected.tp != null && (
                              <div className="rounded-xl p-3" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)" }}>
                                <p className="text-[10px] font-semibold uppercase" style={{ color: "#93c5fd" }}>Take Profit</p>
                                <p className="font-mono text-sm text-zinc-100 mt-0.5">{selected.tp}</p>
                              </div>
                            )}
                          </div>

                          {/* Stats strip */}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] mb-3 pb-3"
                               style={{ borderBottom: "1px solid var(--cj-border)" }}>
                            <span className={`font-mono font-semibold ${pnlCls(selected.pnl)}`}>{fmt(selected.pnl)}</span>
                            {selPips && selPips !== "—" && (
                              <span className="text-zinc-500">{selPips} pips</span>
                            )}
                            <span className="text-zinc-600">{selected.lot} lot</span>
                            {selRR && <span className="text-zinc-500">R:R {selRR}:1</span>}
                            {selected.session && <span className="text-zinc-600">{selected.session}</span>}
                          </div>

                          {/* Setup / Notes */}
                          {selected.setup && (
                            <p className="text-[12px] text-zinc-400 mb-1.5">
                              <span className="text-zinc-600">Setup: </span>{selected.setup}
                            </p>
                          )}
                          {selected.notes && (
                            <p className="text-[12px] text-zinc-400 mb-3 leading-relaxed">
                              <span className="text-zinc-600">Notes: </span>{selected.notes}
                            </p>
                          )}

                          {/* AI Insight */}
                          <div>
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
                                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all border border-zinc-700 text-zinc-400 hover:border-[var(--cj-gold-muted)] hover:text-[var(--cj-gold)] disabled:opacity-50">
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

                {/* Market Replay notice — panel footer */}
                <div className="shrink-0 px-4 py-3 text-[11px] leading-relaxed"
                     style={{ borderTop: "1px solid var(--cj-border)", color: "var(--cj-text-muted)" }}>
                  📋 <strong className="text-zinc-400">Market Replay coming soon</strong> — review
                  your trades bar-by-bar to identify exactly where you entered and exited.
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

                {/* Overview */}
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

                {/* Simulated improvements */}
                <div className="bg-[var(--cj-surface)] rounded-2xl p-5" style={{ border: "1px solid var(--cj-border)" }}>
                  <p className="card-label mb-4">Simulated Improvements</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stats.consecDelta !== 0 && (
                      <div className={`rounded-xl p-4 ${stats.consecDelta > 0 ? "bg-emerald-500/8 border border-emerald-500/20" : "bg-zinc-800/40 border border-zinc-700"}`}>
                        <p className="text-lg mb-2">🛑</p>
                        <p className="text-sm text-zinc-200 leading-snug mb-1">
                          {stats.consecDelta > 0
                            ? <>Stop after 2 consecutive losses/day — P&L improves by <span className="font-mono font-semibold text-emerald-400">{fmt(stats.consecDelta)}</span></>
                            : "Your daily loss-limit is already saving you."}
                        </p>
                        <p className="text-[12px] text-zinc-600">Simulated: {fmt(stats.simPnl)} vs actual: {fmt(stats.actualPnl)}</p>
                      </div>
                    )}
                    {stats.bestPair && stats.worstPair && stats.bestPair !== stats.worstPair && (
                      <div className="rounded-xl p-4" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.20)" }}>
                        <p className="text-lg mb-2">🎯</p>
                        <p className="text-sm text-zinc-200 leading-snug mb-1">
                          Win rate on <span className="font-mono font-semibold" style={{ color: "var(--cj-gold)" }}>{stats.bestPair.pair}</span> ({stats.bestPair.wr.toFixed(0)}%) beats <span className="font-mono font-semibold text-rose-400">{stats.worstPair.pair}</span> ({stats.worstPair.wr.toFixed(0)}%)
                        </p>
                        <p className="text-[12px] text-zinc-600">Consider focusing on {stats.bestPair.pair}</p>
                      </div>
                    )}
                    {stats.bestSession && stats.worstSession && stats.bestSession !== stats.worstSession && (
                      <div className="rounded-xl p-4" style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-gold-muted)" }}>
                        <p className="text-lg mb-2">⏰</p>
                        <p className="text-sm text-zinc-200 leading-snug mb-1">
                          You win <span className="font-mono font-semibold" style={{ color: "var(--cj-gold)" }}>{(stats.bestSession.wr - stats.worstSession.wr).toFixed(0)}%</span> more in <span className="font-semibold" style={{ color: "var(--cj-gold)" }}>{stats.bestSession.session}</span> than {stats.worstSession.session}
                        </p>
                        <p className="text-[12px] text-zinc-600">{stats.bestSession.session}: {stats.bestSession.wr.toFixed(0)}% · {stats.worstSession.session}: {stats.worstSession.wr.toFixed(0)}%</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Win rate breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {stats.sessionStats.length > 0 && (
                    <div className="bg-[var(--cj-surface)] rounded-2xl p-5" style={{ border: "1px solid var(--cj-border)" }}>
                      <p className="card-label mb-4">By Session</p>
                      <div className="space-y-3">{stats.sessionStats.map((s) => <WinBar key={s.session} label={s.session} winRate={s.wr} total={s.n} />)}</div>
                    </div>
                  )}
                  {stats.dayStats.length > 0 && (
                    <div className="bg-[var(--cj-surface)] rounded-2xl p-5" style={{ border: "1px solid var(--cj-border)" }}>
                      <p className="card-label mb-4">By Day</p>
                      <div className="space-y-3">{stats.dayStats.map((d) => <WinBar key={d.day} label={d.day} winRate={d.wr} total={d.n} />)}</div>
                    </div>
                  )}
                  {stats.pairStats.length > 0 && (
                    <div className="bg-[var(--cj-surface)] rounded-2xl p-5" style={{ border: "1px solid var(--cj-border)" }}>
                      <p className="card-label mb-4">By Pair</p>
                      <div className="space-y-3">{stats.pairStats.slice(0, 6).map((p) => <WinBar key={p.pair} label={p.pair} winRate={p.wr} total={p.n} />)}</div>
                    </div>
                  )}
                </div>

                {/* Strengths / Weaknesses / Recommendation */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-3">💪 Strengths</p>
                    <ul className="space-y-2">{stats.strengths.map((s, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>{s}</li>)}</ul>
                  </div>
                  <div className="bg-rose-500/8 border border-rose-500/20 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-rose-400 uppercase tracking-widest mb-3">⚠️ Weaknesses</p>
                    <ul className="space-y-2">{stats.weaknesses.map((w, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-rose-500 shrink-0">✗</span>{w}</li>)}</ul>
                  </div>
                  <div className="rounded-2xl p-5" style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-gold-muted)" }}>
                    <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--cj-gold)" }}>🎯 Top Recommendation</p>
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
