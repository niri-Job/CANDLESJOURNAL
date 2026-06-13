"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TradeDetailModal, type ReplayTrade } from "@/components/TradeDetailModal";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function sessionFromHour(h: number): string {
  if (h >= 0 && h < 6)   return "Asia";
  if (h >= 7 && h < 12)  return "London";
  if (h >= 12 && h < 13) return "Overlap";
  if (h >= 13 && h < 17) return "New York";
  return "Off-Session";
}
function fmtPnl(n: number): string {
  return (n >= 0 ? "+$" : "-$") + Math.abs(n).toFixed(2);
}
function fmtPrice(p: number): string {
  if (p >= 100) return p.toFixed(2);
  if (p >= 10)  return p.toFixed(3);
  return p.toFixed(5);
}
function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}
function holdDuration(a: string | null | undefined, b: string | null | undefined): string {
  if (!a || !b) return "—";
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  if (diff < 0) return "—";
  if (diff < 1)  return "<1m";
  if (diff < 60) return `${Math.round(diff)}m`;
  const h = Math.floor(diff / 60), m = Math.round(diff % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function toTDDate(isoStr: string, offsetMin = 0): string {
  const d = new Date(new Date(isoStr).getTime() + offsetMin * 60000);
  const z = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth()+1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:00`;
}
function nlVerdict(opts: {
  isRevenge: boolean; isOvertrade: boolean; session: string; riskRatio: number;
  pnl: number; runningPnl: number; tp: number | null; direction: string;
  exitPrice: number; dayCount: number;
}): string {
  const { isRevenge, isOvertrade, session, riskRatio, pnl, runningPnl, tp, direction, exitPrice, dayCount } = opts;
  const hitTP = tp != null && (direction === "BUY" ? exitPrice >= tp * 0.998 : exitPrice <= tp * 1.002);
  if (isRevenge && pnl < 0)   return `Opened shortly after a loss during ${session} — likely reactive. Exit confirms the pattern.`;
  if (isRevenge && pnl > 0)   return `Revenge entry in ${session} that worked out — but the process was reactive, not systematic.`;
  if (isOvertrade && pnl < 0) return `${dayCount}-trade day with another loss — overtrading erodes edge and discipline.`;
  if (riskRatio > 1.5 && pnl < 0) return `Lot size was ${Math.round(riskRatio * 100 - 100)}% above average on a losing trade — size down when in drawdown.`;
  if (runningPnl < -50 && pnl < 0) return `Taken while already down $${Math.abs(runningPnl).toFixed(0)} on the session. Consider a daily loss limit.`;
  if (hitTP && !isRevenge && riskRatio <= 1.2) return `TP reached in ${session}. Clean entry, held through volatility — textbook execution.`;
  if (pnl > 0 && !isRevenge && !isOvertrade && riskRatio <= 1.2) return `Clean win in ${session}. No behavioral flags detected. Well sized and executed.`;
  if (pnl < 0 && !isRevenge && !isOvertrade) return `Standard loss in ${session}. No behavioral flags — losses are part of trading.`;
  return `Standard trade in ${session}. Review your entry trigger and risk context.`;
}

// ── LW Charts types (CDN-loaded, no npm types needed) ────────────────────────
interface LWCMarker { time: number; position: string; color: string; shape: string; text: string; size?: number; }
interface LWCSeries {
  setData(data: { time: number; open: number; high: number; low: number; close: number }[]): void;
  setMarkers(m: LWCMarker[]): void;
  createPriceLine(o: { price: number; color: string; lineWidth: number; lineStyle: number; axisLabelVisible: boolean; title: string }): void;
}
interface LWCChart {
  addCandlestickSeries(o: object): LWCSeries;
  timeScale(): { fitContent(): void; setVisibleRange(r: { from: number; to: number }): void };
  priceScale(id: string): { applyOptions(o: object): void };
  remove(): void;
}
interface LWCLib { createChart(el: HTMLElement, o: object): LWCChart; }

const LW_CDN = "https://cdn.jsdelivr.net/npm/lightweight-charts@4/dist/lightweight-charts.standalone.production.js";
const GOLD = "#D4A017";

interface Candle { datetime: string; open: number; high: number; low: number; close: number; }
type ChartState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; candles: Candle[]; forId: string }
  | { status: "error"; reason: string }
  | { status: "simulated" };

// ── Stat chip ─────────────────────────────────────────────────────────────────
function Chip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      padding: "5px 12px", borderRadius: 10, display: "flex", alignItems: "center", gap: 6,
      background: warn ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${warn ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`,
    }}>
      <span style={{ fontSize: 10, color: warn ? "#f87171" : "#71717a" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: warn ? "#f87171" : "#c4c4c7" }}>{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReplayPage() {
  const [user, setUser]                   = useState<User | null>(null);
  const [loading, setLoading]             = useState(true);
  const [trades, setTrades]               = useState<ReplayTrade[]>([]);
  const [selectedDate, setSelectedDate]   = useState<string>("");
  const [selectedTrade, setSelectedTrade] = useState<ReplayTrade | null>(null);
  const [drillTrade, setDrillTrade]       = useState<ReplayTrade | null>(null);
  const [scriptReady, setScriptReady]     = useState(false);
  const [chartData, setChartData]         = useState<ChartState>({ status: "idle" });

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef  = useRef<LWCChart | null>(null);

  // ── Auth + data fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user: u }, error }) => {
      if (error || !u) { window.location.href = "/login"; return; }
      setUser(u);
      const { data, error: dbErr } = await sb
        .from("trades").select("*")
        .eq("user_id", u.id).order("date", { ascending: false });
      if (dbErr) console.error("[replay] fetch error:", dbErr.message);
      if (data?.length) {
        setTrades(data as ReplayTrade[]);
        if (data[0].date) setSelectedDate(data[0].date as string);
      }
      setLoading(false);
    });
  }, []);

  // ── Dates + day trades ─────────────────────────────────────────────────────
  const tradeDays = useMemo(() => {
    const days = new Set(trades.map(t => t.date ?? t.opened_at?.slice(0, 10)).filter(Boolean) as string[]);
    return Array.from(days).sort().reverse();
  }, [trades]);

  const dayTrades = useMemo((): ReplayTrade[] => {
    if (!selectedDate) return [];
    return trades
      .filter(t => (t.date ?? t.opened_at?.slice(0, 10)) === selectedDate)
      .sort((a, b) => {
        if (a.opened_at && b.opened_at)
          return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
        return (parseInt(a.mt5_deal_id ?? "0") || 0) - (parseInt(b.mt5_deal_id ?? "0") || 0);
      });
  }, [trades, selectedDate]);

  // ── Day stats ──────────────────────────────────────────────────────────────
  const dayStats = useMemo(() => {
    if (!dayTrades.length) return null;
    const pnl  = dayTrades.reduce((s, t) => s + t.pnl, 0);
    const wins = dayTrades.filter(t => t.pnl > 0).length;
    const sessions = [...new Set(dayTrades.map(t =>
      t.opened_at ? sessionFromHour(new Date(t.opened_at).getUTCHours()) : t.session || "Unknown"
    ))];
    let revengeCount = 0;
    for (let i = 1; i < dayTrades.length; i++) {
      const prev = dayTrades[i - 1], curr = dayTrades[i];
      if (prev.pnl < 0 && curr.opened_at && prev.closed_at) {
        const diff = (new Date(curr.opened_at).getTime() - new Date(prev.closed_at).getTime()) / 60000;
        if (diff >= 0 && diff <= 10) revengeCount++;
      } else if (prev.pnl < 0 && !curr.opened_at) revengeCount++;
    }
    return { pnl, wins, winRate: (wins / dayTrades.length) * 100, sessions, revengeCount, isOvertrade: dayTrades.length >= 4, total: dayTrades.length };
  }, [dayTrades]);

  // ── Auto-select first trade when day changes ───────────────────────────────
  useEffect(() => {
    if (dayTrades.length > 0) setSelectedTrade(dayTrades[0]);
    else { setSelectedTrade(null); setChartData({ status: "idle" }); }
  }, [dayTrades]);

  // ── Load LW Charts script once ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as { LightweightCharts?: unknown }).LightweightCharts) { setScriptReady(true); return; }
    const existing = document.querySelector(`script[src="${LW_CDN}"]`);
    if (existing) {
      const poll = setInterval(() => {
        if ((window as unknown as { LightweightCharts?: unknown }).LightweightCharts) { setScriptReady(true); clearInterval(poll); }
      }, 100);
      return () => clearInterval(poll);
    }
    const s = document.createElement("script");
    s.src = LW_CDN; s.async = true; s.onload = () => setScriptReady(true);
    document.head.appendChild(s);
  }, []);

  // ── Candle fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedTrade) return;
    const tradeId = selectedTrade.id;
    let start: string, end: string;
    if (selectedTrade.opened_at) {
      const closeRef = selectedTrade.closed_at ?? selectedTrade.opened_at;
      start = toTDDate(selectedTrade.opened_at, -30);
      end   = toTDDate(closeRef, 30);
    } else if (selectedTrade.date) {
      start = `${selectedTrade.date} 06:00:00`;
      end   = `${selectedTrade.date} 18:00:00`;
    } else {
      setChartData({ status: "simulated" });
      return;
    }
    setChartData({ status: "loading" });
    const params = new URLSearchParams({ symbol: selectedTrade.pair, interval: "5min", start_date: start, end_date: end });
    fetch(`/api/twelvedata/candles?${params}`)
      .then(r => r.json())
      .then((json: { candles?: Candle[]; error?: string }) => {
        if (json.error === "no_api_key") setChartData({ status: "simulated" });
        else if (json.error || !json.candles?.length) setChartData({ status: "error", reason: json.error ?? "empty" });
        else setChartData({ status: "ok", candles: json.candles, forId: tradeId });
      })
      .catch(() => setChartData({ status: "error", reason: "fetch_failed" }));
  }, [selectedTrade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── LW Chart creation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!scriptReady || chartData.status !== "ok") return;
    // Guard stale data — don't render A's candles while B is selected
    if (!selectedTrade || chartData.forId !== selectedTrade.id) return;
    if (!chartContainerRef.current) return;
    const candles = chartData.candles;
    if (!candles.length) return;

    const LW = (window as unknown as { LightweightCharts: LWCLib }).LightweightCharts;
    if (!LW) return;

    if (chartInstanceRef.current) {
      try { chartInstanceRef.current.remove(); } catch { /* ok */ }
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = LW.createChart(container, {
      width:  container.clientWidth  || 600,
      height: container.clientHeight || 500,
      layout: { background: { type: "solid", color: "#0D0B14" }, textColor: "#52525b", fontSize: 10 },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", textColor: "#52525b" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false, textColor: "#52525b" },
      handleScroll: true,
      handleScale:  true,
    });
    chartInstanceRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: "#5DCAA5", downColor: "#F09595",
      borderUpColor: "#5DCAA5", borderDownColor: "#F09595",
      wickUpColor: "#5DCAA5", wickDownColor: "#F09595",
    });

    const seriesData = candles.map(c => ({
      time:  Math.floor(new Date(c.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    series.setData(seriesData);

    // Price lines
    series.createPriceLine({ price: selectedTrade.entry, color: GOLD, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Entry" });
    if (selectedTrade.sl != null && selectedTrade.sl !== 0)
      series.createPriceLine({ price: selectedTrade.sl, color: "#E24B4A", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SL" });
    if (selectedTrade.tp != null && selectedTrade.tp !== 0)
      series.createPriceLine({ price: selectedTrade.tp, color: "#5DCAA5", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "TP" });
    chart.priceScale("right").applyOptions({ autoScale: true });

    // Markers
    const markers: LWCMarker[] = [];
    if (selectedTrade.opened_at) {
      markers.push({ time: Math.floor(new Date(selectedTrade.opened_at).getTime() / 1000), position: "belowBar", color: GOLD, shape: "arrowUp", text: `IN ${fmtPrice(selectedTrade.entry)}`, size: 2 });
      if (selectedTrade.closed_at)
        markers.push({ time: Math.floor(new Date(selectedTrade.closed_at).getTime() / 1000), position: "aboveBar", color: selectedTrade.pnl >= 0 ? "#5DCAA5" : "#E24B4A", shape: "arrowDown", text: `OUT ${fmtPrice(selectedTrade.exit_price)}`, size: 2 });
    } else {
      const mid = Math.floor(seriesData.length / 2);
      let inIdx = 0, inDiff = Infinity;
      for (let i = 0; i <= mid; i++) { const d = Math.abs(candles[i].open - selectedTrade.entry); if (d < inDiff) { inDiff = d; inIdx = i; } }
      let outIdx = seriesData.length - 1, outDiff = Infinity;
      for (let i = mid; i < seriesData.length; i++) { const d = Math.abs(candles[i].close - selectedTrade.exit_price); if (d < outDiff) { outDiff = d; outIdx = i; } }
      markers.push({ time: seriesData[inIdx].time, position: "belowBar", color: GOLD, shape: "arrowUp", text: `~IN ${fmtPrice(selectedTrade.entry)}`, size: 2 });
      markers.push({ time: seriesData[outIdx].time, position: "aboveBar", color: selectedTrade.pnl >= 0 ? "#5DCAA5" : "#E24B4A", shape: "arrowDown", text: `~OUT ${fmtPrice(selectedTrade.exit_price)}`, size: 2 });
    }
    if (markers.length > 0) {
      markers.sort((a, b) => a.time - b.time);
      try { series.setMarkers(markers); } catch { /* ok */ }
    }

    // Visible range
    if (selectedTrade.opened_at) {
      const eU = Math.floor(new Date(selectedTrade.opened_at).getTime() / 1000);
      const xU = selectedTrade.closed_at ? Math.floor(new Date(selectedTrade.closed_at).getTime() / 1000) : eU + 3600;
      const pad = 30 * 60;
      try {
        chart.timeScale().setVisibleRange({ from: Math.max(seriesData[0].time, eU - pad), to: Math.min(seriesData[seriesData.length - 1].time, xU + pad) });
      } catch { chart.timeScale().fitContent(); }
    } else {
      chart.timeScale().fitContent();
    }

    return () => {
      try { chart.remove(); } catch { /* ok */ }
      chartInstanceRef.current = null;
    };
  }, [scriptReady, chartData, selectedTrade]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Behavioral context ────────────────────────────────────────────────────
  const behavCtx = useMemo(() => {
    if (!selectedTrade || !dayTrades.length) return null;
    const t   = selectedTrade;
    const idx = dayTrades.findIndex(x => x.id === t.id);
    const prev = dayTrades.slice(0, idx);
    const runningPnl = prev.reduce((s, x) => s + x.pnl, 0);
    let isRevenge = false;
    if (t.opened_at) {
      const openMs = new Date(t.opened_at).getTime();
      isRevenge = prev.some(p => {
        if (p.pnl >= 0 || !p.closed_at) return false;
        return (openMs - new Date(p.closed_at).getTime()) / 60000 <= 10;
      });
    } else isRevenge = prev.length > 0 && prev[prev.length - 1].pnl < 0;
    const avgLot = dayTrades.reduce((s, x) => s + x.lot, 0) / dayTrades.length;
    return {
      idx,
      runningPnl,
      isRevenge,
      isOvertrade: dayTrades.length >= 4,
      riskRatio:   avgLot > 0 ? t.lot / avgLot : 1,
      sessionLabel: t.opened_at ? sessionFromHour(new Date(t.opened_at).getUTCHours()) : (t.session || "London"),
      dayCount: dayTrades.length,
    };
  }, [selectedTrade, dayTrades]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={null} onSignOut={() => {}} />
      <div className="md:ml-[240px] pt-14 md:pt-0 flex items-center justify-center min-h-screen">
        <p className="text-zinc-500 text-sm">Loading trades…</p>
      </div>
    </div>
  );

  function handleLogout() { createClient().auth.signOut().then(() => { window.location.href = "/login"; }); }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleLogout} />
      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 20px" }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f4f4f5", margin: 0 }}>Session Replay</h1>
              <p style={{ fontSize: 13, color: "#52525b", marginTop: 3 }}>Pick a date · click a trade · see the chart</p>
            </div>
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#e4e4e7", outline: "none", cursor: "pointer" }}
            >
              {!tradeDays.length && <option value="">No trades yet</option>}
              {tradeDays.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* ── Day summary strip ────────────────────────────────────────── */}
          {dayStats && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {/* P&L */}
              <div style={{
                padding: "5px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8,
                background: dayStats.pnl >= 0 ? "rgba(29,158,117,0.1)" : "rgba(226,75,74,0.1)",
                border: `1px solid ${dayStats.pnl >= 0 ? "rgba(29,158,117,0.28)" : "rgba(226,75,74,0.28)"}`,
              }}>
                <span style={{ fontSize: 10, color: "#71717a" }}>Day P&L</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: dayStats.pnl >= 0 ? "#1D9E75" : "#E24B4A" }}>
                  {fmtPnl(dayStats.pnl)}
                </span>
              </div>
              <Chip label="Trades"   value={String(dayStats.total)} />
              <Chip label="Win Rate" value={`${dayStats.winRate.toFixed(0)}%`} />
              <Chip label="Sessions" value={dayStats.sessions.join(" · ")} />
              {dayStats.isOvertrade && (
                <Chip label="⚠ Overtrading" value={`${dayStats.total}t`} warn />
              )}
              {dayStats.revengeCount > 0 && (
                <Chip label="⚠ Revenge" value={`${dayStats.revengeCount} trade${dayStats.revengeCount > 1 ? "s" : ""}`} warn />
              )}
            </div>
          )}

          {!trades.length ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", color: "#52525b" }}>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No trades to replay</p>
              <p style={{ fontSize: 13 }}>Import your MT5 history or log trades to get started.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 38%) 1fr", gap: 14, alignItems: "start" }}>

              {/* ── LEFT: trade list ────────────────────────────────────── */}
              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 14, overflow: "hidden", position: "sticky", top: 20 }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f1f23" }}>
                  <span style={{ fontSize: 11, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                    {dayTrades.length} Trade{dayTrades.length !== 1 ? "s" : ""} — {selectedDate}
                  </span>
                </div>
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
                  {!dayTrades.length ? (
                    <div style={{ padding: "20px 16px", color: "#52525b", fontSize: 13 }}>No trades on this day.</div>
                  ) : dayTrades.map(t => {
                    const isSelected = selectedTrade?.id === t.id;
                    const color = t.pnl >= 0 ? "#1D9E75" : "#E24B4A";
                    const sess  = t.opened_at ? sessionFromHour(new Date(t.opened_at).getUTCHours()) : t.session || "";
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTrade(t)}
                        style={{
                          padding: "11px 16px",
                          cursor: "pointer",
                          background: isSelected ? "rgba(212,160,23,0.06)" : "transparent",
                          borderLeft: `3px solid ${isSelected ? GOLD : "transparent"}`,
                          borderBottom: "1px solid #1f1f23",
                          transition: "background 0.12s",
                        }}
                      >
                        {/* Row 1: pair · direction · time · P&L */}
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7", minWidth: 68 }}>{t.pair}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                            background: t.direction === "BUY" ? "rgba(29,158,117,0.14)" : "rgba(226,75,74,0.14)",
                            color: t.direction === "BUY" ? "#1D9E75" : "#E24B4A",
                          }}>{t.direction}</span>
                          {t.opened_at && <span style={{ fontSize: 10, color: "#71717a" }}>{timeLabel(t.opened_at)}</span>}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmtPnl(t.pnl)}</span>
                        </div>
                        {/* Row 2: details + Full Analysis */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#71717a" }}>
                          <span>{t.lot}L</span>
                          <span>{fmtPrice(t.entry)}</span>
                          <span style={{ color: "#3f3f46" }}>→</span>
                          <span>{fmtPrice(t.exit_price)}</span>
                          {sess && <span style={{ color: "#3f3f46" }}>{sess}</span>}
                          <span style={{ flex: 1 }} />
                          <button
                            onClick={e => { e.stopPropagation(); setDrillTrade(t); }}
                            style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                              background: "rgba(212,160,23,0.07)", border: "1px solid rgba(212,160,23,0.2)", color: GOLD,
                              whiteSpace: "nowrap",
                            }}
                          >Full Analysis</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── RIGHT: chart + behavioral ────────────────────────────── */}
              {selectedTrade ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Trade header */}
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ fontSize: 19, fontWeight: 800, color: "#f4f4f5" }}>{selectedTrade.pair}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                      background: selectedTrade.direction === "BUY" ? "rgba(29,158,117,0.15)" : "rgba(226,75,74,0.15)",
                      color: selectedTrade.direction === "BUY" ? "#1D9E75" : "#E24B4A",
                    }}>{selectedTrade.direction}</span>
                    <span style={{ fontSize: 11, color: "#71717a" }}>
                      {selectedTrade.lot}L · {fmtPrice(selectedTrade.entry)} → {fmtPrice(selectedTrade.exit_price)}
                      {selectedTrade.opened_at && ` · ${timeLabel(selectedTrade.opened_at)} UTC`}
                      {selectedTrade.sl  != null && ` · SL ${fmtPrice(selectedTrade.sl)}`}
                      {selectedTrade.tp  != null && ` · TP ${fmtPrice(selectedTrade.tp)}`}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 18, fontWeight: 800, color: selectedTrade.pnl >= 0 ? "#1D9E75" : "#E24B4A" }}>
                      {fmtPnl(selectedTrade.pnl)}
                    </span>
                  </div>

                  {/* Chart */}
                  <div style={{ height: 500, background: "#0D0B14", borderRadius: 12, overflow: "hidden", position: "relative", border: "1px solid #27272a" }}>
                    <style>{`@keyframes rp-shim{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>

                    {chartData.status === "loading" && (
                      <>
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)", animation: "rp-shim 1.8s ease-in-out infinite" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "#3f3f46", fontSize: 12 }}>Fetching market data…</span>
                        </div>
                      </>
                    )}

                    {chartData.status === "ok" && chartData.candles.length > 0 && chartData.forId === selectedTrade.id && (
                      <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }} />
                    )}

                    {chartData.status === "ok" && chartData.candles.length === 0 && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                        <span style={{ color: "#3f3f46", fontSize: 13 }}>No candle data for this window</span>
                        <span style={{ color: "#27272a", fontSize: 11 }}>{selectedTrade.pair} · {selectedTrade.date}</span>
                      </div>
                    )}

                    {(chartData.status === "simulated" || chartData.status === "error") && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                        <span style={{ color: "#3f3f46", fontSize: 13 }}>No market data</span>
                        <span style={{ fontSize: 11, color: "#27272a" }}>
                          {chartData.status === "error" ? chartData.reason : "Add TWELVEDATA_API_KEY to enable live charts"}
                        </span>
                      </div>
                    )}

                    {chartData.status === "ok" && !selectedTrade.opened_at && (
                      <div style={{ position: "absolute", top: 8, right: 10, fontSize: 9, padding: "2px 7px", borderRadius: 100, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.06)", color: "#71717a", letterSpacing: "0.04em" }}>
                        full day · no exact time
                      </div>
                    )}
                  </div>

                  {/* Behavioral grid */}
                  {behavCtx && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                        {[
                          { label: "Revenge Trade", value: behavCtx.isRevenge   ? "Yes" : "No",                          warn: behavCtx.isRevenge },
                          { label: "Overtrading",   value: behavCtx.isOvertrade ? `Yes (${behavCtx.dayCount}t)` : "No",   warn: behavCtx.isOvertrade },
                          { label: "Risk vs Avg",   value: `${(behavCtx.riskRatio * 100).toFixed(0)}%`,                   warn: behavCtx.riskRatio > 1.5 },
                          { label: "Running P&L",   value: `${behavCtx.runningPnl >= 0 ? "+" : ""}$${Math.abs(behavCtx.runningPnl).toFixed(2)}`, warn: behavCtx.runningPnl < -20 },
                          { label: "Trade #",       value: `${behavCtx.idx + 1} of ${behavCtx.dayCount}`,                 warn: false },
                          { label: "Hold Time",     value: holdDuration(selectedTrade.opened_at, selectedTrade.closed_at), warn: false },
                        ].map(({ label, value, warn }) => (
                          <div key={label} style={{
                            background: "#1A1916",
                            border: `1px solid ${warn ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.05)"}`,
                            borderRadius: 10, padding: "10px 12px",
                          }}>
                            <div style={{ fontSize: 10, color: "#52525b", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: warn ? "#f87171" : "#e4e4e7" }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* NIRI verdict */}
                      <div style={{ padding: "12px 16px", background: "rgba(212,160,23,0.05)", border: "1px dashed rgba(212,160,23,0.25)", borderRadius: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 5 }}>NIRI VERDICT</div>
                        <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.55 }}>
                          {nlVerdict({
                            isRevenge: behavCtx.isRevenge, isOvertrade: behavCtx.isOvertrade,
                            session: behavCtx.sessionLabel, riskRatio: behavCtx.riskRatio,
                            pnl: selectedTrade.pnl, runningPnl: behavCtx.runningPnl,
                            tp: selectedTrade.tp, direction: selectedTrade.direction,
                            exitPrice: selectedTrade.exit_price, dayCount: behavCtx.dayCount,
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ height: 500, display: "flex", alignItems: "center", justifyContent: "center", color: "#52525b" }}>
                  <span style={{ fontSize: 13 }}>Select a trade to see the chart</span>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Full Analysis modal */}
      {drillTrade && (
        <TradeDetailModal trade={drillTrade} allDayTrades={dayTrades} onClose={() => setDrillTrade(null)} />
      )}
    </div>
  );
}
