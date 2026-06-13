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
function toTDDate(isoStr: string, offsetMin = 0): string {
  const d = new Date(new Date(isoStr).getTime() + offsetMin * 60000);
  const z = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth()+1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:00`;
}
function buildVerdict(opts: {
  isRevenge: boolean; isOvertrade: boolean; session: string; riskRatio: number;
  pnl: number; runningPnl: number; tp: number | null; direction: string;
  exitPrice: number; dayCount: number;
}): string {
  const { isRevenge, isOvertrade, session, riskRatio, pnl, runningPnl, tp, direction, exitPrice, dayCount } = opts;
  const hitTP = tp != null && (direction === "BUY" ? exitPrice >= tp * 0.998 : exitPrice <= tp * 1.002);
  if (isRevenge && pnl < 0)   return `Revenge entry in ${session} after a loss — reactive and confirmed by the exit.`;
  if (isRevenge && pnl > 0)   return `Revenge entry in ${session} that worked — process was reactive, not systematic.`;
  if (isOvertrade && pnl < 0) return `${dayCount}-trade session with another loss. Overtrading erodes edge.`;
  if (riskRatio > 1.5 && pnl < 0) return `Lot size ${Math.round(riskRatio * 100 - 100)}% above average on a losing trade.`;
  if (runningPnl < -50 && pnl < 0) return `Taken while $${Math.abs(runningPnl).toFixed(0)} down. Consider a daily loss limit.`;
  if (hitTP && !isRevenge && riskRatio <= 1.2) return `TP reached in ${session}. Clean entry, textbook execution.`;
  if (pnl > 0 && !isRevenge && !isOvertrade && riskRatio <= 1.2) return `Clean win in ${session}. No behavioral flags.`;
  if (pnl < 0 && !isRevenge && !isOvertrade) return `Standard loss in ${session}. No behavioral flags.`;
  return `Standard trade in ${session}. Review your entry trigger and risk context.`;
}

// ── LW Charts types ──────────────────────────────────────────────────────────
interface LWCMarker { time: number; position: string; color: string; shape: string; text: string; size?: number; }
interface LWCSeries {
  setData(d: { time: number; open: number; high: number; low: number; close: number }[]): void;
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReplayPage() {
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);
  const [trades, setTrades]           = useState<ReplayTrade[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [tradeIndex, setTradeIndex]   = useState(0);
  const [drillTrade, setDrillTrade]   = useState<ReplayTrade | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [chartData, setChartData]     = useState<ChartState>({ status: "idle" });

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef  = useRef<LWCChart | null>(null);
  const tradeCountRef     = useRef(0);

  // ── Auth + fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user: u }, error }) => {
      if (error || !u) { window.location.href = "/login"; return; }
      setUser(u);
      const { data, error: dbErr } = await sb
        .from("trades").select("*")
        .eq("user_id", u.id).order("date", { ascending: false });
      if (dbErr) console.error("[replay] fetch:", dbErr.message);
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

  // Keep ref in sync for keyboard handler
  useEffect(() => { tradeCountRef.current = dayTrades.length; }, [dayTrades.length]);

  // Reset to first trade when date changes
  useEffect(() => { setTradeIndex(0); }, [selectedDate]);

  const selectedTrade = dayTrades[tradeIndex] ?? null;

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft")  setTradeIndex(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setTradeIndex(i => Math.min(tradeCountRef.current - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Load LW Charts script ─────────────────────────────────────────────────
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
    const p = new URLSearchParams({ symbol: selectedTrade.pair, interval: "5min", start_date: start, end_date: end });
    fetch(`/api/twelvedata/candles?${p}`)
      .then(r => r.json())
      .then((json: { candles?: Candle[]; error?: string }) => {
        if (json.error === "no_api_key") setChartData({ status: "simulated" });
        else if (json.error || !json.candles?.length) setChartData({ status: "error", reason: json.error ?? "empty" });
        else setChartData({ status: "ok", candles: json.candles, forId: tradeId });
      })
      .catch(() => setChartData({ status: "error", reason: "fetch_failed" }));
  }, [selectedTrade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart creation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scriptReady || chartData.status !== "ok") return;
    if (!selectedTrade || chartData.forId !== selectedTrade.id) return;
    if (!chartContainerRef.current) return;
    const candles = chartData.candles;
    if (!candles.length) return;

    const LW = (window as unknown as { LightweightCharts: LWCLib }).LightweightCharts;
    if (!LW) return;

    if (chartInstanceRef.current) {
      try { chartInstanceRef.current.remove(); } catch { /**/ }
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = LW.createChart(container, {
      width:  container.clientWidth  || 700,
      height: container.clientHeight || 360,
      layout: {
        background: { type: "solid", color: "#0D0B14" },
        textColor: "#52525b", fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
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

    // Entry price line — gold dashed
    series.createPriceLine({ price: selectedTrade.entry, color: GOLD, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Entry" });
    // Exit price line — green/red dashed
    const exitColor = selectedTrade.pnl >= 0 ? "#5DCAA5" : "#E24B4A";
    series.createPriceLine({ price: selectedTrade.exit_price, color: exitColor, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Exit" });
    // SL / TP lines
    if (selectedTrade.sl != null && selectedTrade.sl !== 0)
      series.createPriceLine({ price: selectedTrade.sl, color: "#E24B4A", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SL" });
    if (selectedTrade.tp != null && selectedTrade.tp !== 0)
      series.createPriceLine({ price: selectedTrade.tp, color: "#5DCAA5", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "TP" });

    chart.priceScale("right").applyOptions({ autoScale: true });

    // Markers ONLY for trades with exact timestamps — no approximation for CSV trades
    if (selectedTrade.opened_at) {
      const markers: LWCMarker[] = [];
      markers.push({
        time: Math.floor(new Date(selectedTrade.opened_at).getTime() / 1000),
        position: "belowBar", color: GOLD, shape: "arrowUp",
        text: `IN ${fmtPrice(selectedTrade.entry)}`, size: 2,
      });
      if (selectedTrade.closed_at) {
        markers.push({
          time: Math.floor(new Date(selectedTrade.closed_at).getTime() / 1000),
          position: "aboveBar", color: exitColor, shape: "arrowDown",
          text: `OUT ${fmtPrice(selectedTrade.exit_price)}`, size: 2,
        });
      }
      markers.sort((a, b) => a.time - b.time);
      try { series.setMarkers(markers); } catch { /**/ }
    }

    // Visible range
    if (selectedTrade.opened_at) {
      const eU = Math.floor(new Date(selectedTrade.opened_at).getTime() / 1000);
      const xU = selectedTrade.closed_at ? Math.floor(new Date(selectedTrade.closed_at).getTime() / 1000) : eU + 3600;
      const pad = 30 * 60;
      try {
        chart.timeScale().setVisibleRange({
          from: Math.max(seriesData[0].time, eU - pad),
          to:   Math.min(seriesData[seriesData.length - 1].time, xU + pad),
        });
      } catch { chart.timeScale().fitContent(); }
    } else {
      chart.timeScale().fitContent();
    }

    return () => {
      try { chart.remove(); } catch { /**/ }
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
    <div style={{ minHeight: "100vh", background: "#F8F7F4" }}>
      <Sidebar user={null} onSignOut={() => {}} />
      <div className="md:ml-[240px] pt-14 md:pt-0" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ color: "#A9A39A", fontSize: 13 }}>Loading trades…</p>
      </div>
    </div>
  );

  function handleLogout() { createClient().auth.signOut().then(() => { window.location.href = "/login"; }); }

  const t = selectedTrade;
  const pnlColor = t ? (t.pnl >= 0 ? "#0F6E56" : "#C0392B") : "#A9A39A";
  const exitColor = t ? (t.pnl >= 0 ? "#5DCAA5" : "#E24B4A") : "#E24B4A";

  const verdict = t && behavCtx ? buildVerdict({
    isRevenge: behavCtx.isRevenge, isOvertrade: behavCtx.isOvertrade,
    session: behavCtx.sessionLabel, riskRatio: behavCtx.riskRatio,
    pnl: t.pnl, runningPnl: behavCtx.runningPnl,
    tp: t.tp, direction: t.direction,
    exitPrice: t.exit_price, dayCount: behavCtx.dayCount,
  }) : null;

  // ── Shared card style ─────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#FFFFFF",
    borderRadius: 10,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    padding: "10px 14px",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "inherit" }}>
      <Sidebar user={user} onSignOut={handleLogout} />
      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px" }}>

          {/* ── Header row ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>

            {/* Left: trade identity + navigation */}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              {/* Pair */}
              <span style={{ fontSize: 18, fontWeight: 600, color: "#1A1916", letterSpacing: "-0.01em" }}>
                {t?.pair ?? "—"}
              </span>

              {/* Direction badge */}
              {t && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                  background: t.direction === "BUY" ? "#E8F4EE" : "#FDE8E8",
                  color:      t.direction === "BUY" ? "#0F6E56"  : "#C0392B",
                }}>{t.direction}</span>
              )}

              {/* P&L */}
              {t && (
                <span style={{ fontSize: 14, fontWeight: 600, color: pnlColor }}>
                  {fmtPnl(t.pnl)}
                </span>
              )}

              {/* Trade X of Y */}
              {dayTrades.length > 0 && (
                <span style={{ fontSize: 12, color: "#A9A39A" }}>
                  Trade {tradeIndex + 1} of {dayTrades.length}
                </span>
              )}

              {/* Nav arrows */}
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setTradeIndex(i => Math.max(0, i - 1))}
                  disabled={tradeIndex === 0}
                  style={{
                    background: "#FFFFFF", border: "1px solid #E5E5E5",
                    borderRadius: 8, padding: "4px 10px", cursor: tradeIndex === 0 ? "not-allowed" : "pointer",
                    opacity: tradeIndex === 0 ? 0.35 : 1,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1,
                    color: "#1A1916",
                  }}
                  aria-label="Previous trade"
                >◀</button>
                <button
                  onClick={() => setTradeIndex(i => Math.min(dayTrades.length - 1, i + 1))}
                  disabled={tradeIndex >= dayTrades.length - 1}
                  style={{
                    background: "#FFFFFF", border: "1px solid #E5E5E5",
                    borderRadius: 8, padding: "4px 10px",
                    cursor: tradeIndex >= dayTrades.length - 1 ? "not-allowed" : "pointer",
                    opacity: tradeIndex >= dayTrades.length - 1 ? 0.35 : 1,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1,
                    color: "#1A1916",
                  }}
                  aria-label="Next trade"
                >▶</button>
              </div>

              {/* Full Analysis */}
              {t && (
                <button
                  onClick={() => setDrillTrade(t)}
                  style={{
                    fontSize: 11, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                    background: "transparent", border: `1px solid ${GOLD}`, color: GOLD,
                    fontWeight: 600,
                  }}
                >Full Analysis →</button>
              )}
            </div>

            {/* Right: date picker */}
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                background: "#FFFFFF", border: "1px solid #E5E5E5",
                borderRadius: 8, padding: "6px 10px",
                fontSize: 11, color: "#1A1916", outline: "none", cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              {!tradeDays.length && <option value="">No trades yet</option>}
              {tradeDays.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* ── Chart ─────────────────────────────────────────────────── */}
          <div
            className="h-[240px] md:h-[360px]"
            style={{ background: "#0D0B14", borderRadius: 12, overflow: "hidden", position: "relative" }}
          >
            <style>{`@keyframes rp-shim{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>

            {/* Loading shimmer */}
            {chartData.status === "loading" && (
              <>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)", animation: "rp-shim 1.8s ease-in-out infinite" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#3f3f46", fontSize: 12 }}>Fetching market data…</span>
                </div>
              </>
            )}

            {/* LW Chart */}
            {chartData.status === "ok" && chartData.candles.length > 0 && chartData.forId === selectedTrade?.id && (
              <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }} />
            )}

            {/* No candles */}
            {chartData.status === "ok" && chartData.candles.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                <span style={{ color: "#3f3f46", fontSize: 13 }}>No candle data for this window</span>
              </div>
            )}

            {/* No data / simulated */}
            {(chartData.status === "simulated" || chartData.status === "error") && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                <span style={{ color: "#3f3f46", fontSize: 13 }}>No market data available</span>
                <span style={{ fontSize: 11, color: "#27272a" }}>
                  {chartData.status === "error" ? chartData.reason : "Add TWELVEDATA_API_KEY to enable live charts"}
                </span>
              </div>
            )}

            {/* Idle / no trade */}
            {(chartData.status === "idle" || !selectedTrade) && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#3f3f46", fontSize: 13 }}>
                  {!trades.length ? "No trades yet — import MT5 history to get started" : "Select a date to view trades"}
                </span>
              </div>
            )}

            {/* Date-fallback badge */}
            {chartData.status === "ok" && t && !t.opened_at && (
              <div style={{
                position: "absolute", top: 10, right: 12,
                fontSize: 9, padding: "2px 8px", borderRadius: 100,
                background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.07)",
                color: "#71717a", letterSpacing: "0.04em",
              }}>full day · no exact time</div>
            )}
          </div>

          {/* ── Bottom strip (5 columns) ─────────────────────────────── */}
          {t && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 8 }}>

              {/* Col 1 — ENTRY */}
              <div style={card}>
                <div style={{ fontSize: 9, color: "#A9A39A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Entry</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmtPrice(t.entry)}</div>
              </div>

              {/* Col 2 — EXIT */}
              <div style={card}>
                <div style={{ fontSize: 9, color: "#A9A39A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Exit</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: exitColor }}>{fmtPrice(t.exit_price)}</div>
              </div>

              {/* Col 3 — SESSION */}
              <div style={card}>
                <div style={{ fontSize: 9, color: "#A9A39A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Session</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>
                  {behavCtx?.sessionLabel ?? (t.session || "—")}
                </div>
              </div>

              {/* Col 4 — REVENGE */}
              <div style={card}>
                <div style={{ fontSize: 9, color: "#A9A39A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Revenge</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: behavCtx?.isRevenge ? "#C0392B" : "#0F6E56" }}>
                  {behavCtx?.isRevenge ? "Yes" : "No"}
                </div>
              </div>

              {/* Col 5 — VERDICT */}
              <div style={{
                ...card,
                background: "#FBF4E4",
                borderLeft: `2px solid ${GOLD}`,
                paddingLeft: 12,
              }}>
                <div style={{ fontSize: 9, color: GOLD, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>Verdict</div>
                <div style={{
                  fontSize: 11, color: "#854F0B", lineHeight: 1.45,
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {verdict ?? "—"}
                </div>
              </div>
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
