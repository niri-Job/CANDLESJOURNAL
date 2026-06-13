"use client";

import { useState, useEffect, useMemo, useRef } from "react";

export interface ReplayTrade {
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
  session: string;
  opened_at?: string | null;
  closed_at?: string | null;
  mt5_deal_id?: string | null;
}

interface Candle {
  datetime: string; // "YYYY-MM-DD HH:MM:SS" UTC from TwelveData
  open: number; high: number; low: number; close: number;
}

type ChartState =
  | { status: "loading" }
  | { status: "ok";        candles: Candle[] }
  | { status: "error";     reason: string }
  | { status: "simulated" };

// ── Minimal LW Charts v4 types (loaded via CDN, no npm types needed) ──────────
interface LWCMarker {
  time: number; position: string; color: string; shape: string; text: string; size?: number;
}
interface LWCSeries {
  setData(data: { time: number; open: number; high: number; low: number; close: number }[]): void;
  setMarkers(markers: LWCMarker[]): void;
  createPriceLine(opts: {
    price: number; color: string; lineWidth: number;
    lineStyle: number; axisLabelVisible: boolean; title: string;
  }): void;
}
interface LWCChart {
  addCandlestickSeries(opts: object): LWCSeries;
  timeScale(): { fitContent(): void; setVisibleRange(range: { from: number; to: number }): void };
  remove(): void;
}
interface LWCLib {
  createChart(container: HTMLElement, opts: object): LWCChart;
}

const LW_CDN =
  "https://cdn.jsdelivr.net/npm/lightweight-charts@4/dist/lightweight-charts.standalone.production.js";

// ── Seeded Brownian bridge (fallback) ─────────────────────────────────────────
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}
function brownianBridge(start: number, end: number, n: number, seed: number): number[] {
  const rand = makePrng(seed);
  const range = Math.abs(end - start) || Math.abs(start) * 0.005 || 0.001;
  const pts: number[] = [start];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push(start + (end - start) * t + (rand() - 0.5) * range * 0.5 * Math.sin(Math.PI * t));
  }
  pts.push(end);
  return pts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sessionFromHour(h: number): string {
  if (h >= 0 && h < 6)   return "Asia";
  if (h >= 7 && h < 12)  return "London";
  if (h >= 12 && h < 13) return "Overlap";
  if (h >= 13 && h < 17) return "New York";
  return "Off-Session";
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")} UTC`;
  } catch { return "—"; }
}
function holdDuration(openedAt: string | null | undefined, closedAt: string | null | undefined): string {
  if (!openedAt || !closedAt) return "—";
  const diff = (new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60000;
  if (diff < 0) return "—";
  if (diff < 1)  return "<1m";
  if (diff < 60) return `${Math.round(diff)}m`;
  const h = Math.floor(diff / 60), m = Math.round(diff % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function fmtPrice(p: number): string {
  if (p >= 100) return p.toFixed(2);
  if (p >= 10)  return p.toFixed(3);
  return p.toFixed(5);
}
function toTDDate(isoStr: string, offsetMin: number = 0): string {
  const d = new Date(new Date(isoStr).getTime() + offsetMin * 60000);
  const z = (n: number) => n.toString().padStart(2, "0");
  // Format: "YYYY-MM-DD HH:MM:SS" — TwelveData requires space, not T
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:00`;
}
function closestIdx(candles: Candle[], isoTime: string): number {
  const t = new Date(isoTime).getTime();
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const diff = Math.abs(new Date(candles[i].datetime.replace(" ", "T") + "Z").getTime() - t);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

// ── NIRI verdict ──────────────────────────────────────────────────────────────
function verdict(opts: {
  isRevenge: boolean; isOvertrade: boolean; session: string; riskRatio: number;
  pnl: number; runningPnl: number; tp: number | null; direction: string;
  exitPrice: number; dayTradesCount: number;
}): string {
  const { isRevenge, isOvertrade, session, riskRatio, pnl, runningPnl, tp, direction, exitPrice } = opts;
  const hitTP = tp != null && (direction === "BUY" ? exitPrice >= tp * 0.998 : exitPrice <= tp * 1.002);
  if (isRevenge && pnl < 0)
    return `Opened shortly after a loss during ${session} — likely reactive. Exit confirms the pattern.`;
  if (isRevenge && pnl > 0)
    return `Revenge entry in ${session} that worked out — but the process was reactive, not systematic.`;
  if (isOvertrade && pnl < 0)
    return `${opts.dayTradesCount}-trade day with another loss — overtrading erodes edge and discipline.`;
  if (riskRatio > 1.5 && pnl < 0)
    return `Lot size was ${Math.round(riskRatio * 100 - 100)}% above average on a losing trade — size down when in drawdown.`;
  if (runningPnl < -50 && pnl < 0)
    return `Taken while already down $${Math.abs(runningPnl).toFixed(0)} on the session. Consider a daily loss limit.`;
  if (hitTP && !isRevenge && riskRatio <= 1.2)
    return `TP reached in ${session}. Clean entry, held through volatility — textbook execution.`;
  if (pnl > 0 && !isRevenge && !isOvertrade && riskRatio <= 1.2)
    return `Clean win in ${session}. No behavioral flags detected. Well sized and executed.`;
  if (pnl < 0 && !isRevenge && !isOvertrade)
    return `Standard loss in ${session}. No behavioral flags — losses are part of trading.`;
  return `Standard trade in ${session}. Review your entry trigger and risk context.`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TradeDetailModal({
  trade, allDayTrades, onClose,
}: {
  trade: ReplayTrade; allDayTrades: ReplayTrade[]; onClose: () => void;
}) {
  const [drawn,       setDrawn]       = useState(false);
  const [chartData,   setChartData]   = useState<ChartState>({ status: "loading" });
  const [scriptReady, setScriptReady] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef  = useRef<LWCChart | null>(null);

  // Draw Brownian path on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // ESC closes
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  // ── Load LW Charts script once ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as { LightweightCharts?: unknown }).LightweightCharts) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${LW_CDN}"]`);
    if (existing) {
      // Script tag exists but may still be loading — poll
      const poll = setInterval(() => {
        if ((window as unknown as { LightweightCharts?: unknown }).LightweightCharts) {
          setScriptReady(true);
          clearInterval(poll);
        }
      }, 100);
      return () => clearInterval(poll);
    }
    const script = document.createElement("script");
    script.src = LW_CDN;
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => console.warn("[lwc] failed to load LW Charts CDN");
    document.head.appendChild(script);
  }, []);

  // ── Fetch real candles ────────────────────────────────────────────────────
  useEffect(() => {
    // Always log the trade fields we rely on — helps debug missing timestamps
    console.log("[modal] trade:", {
      id:        trade.id,
      pair:      trade.pair,
      date:      trade.date,
      opened_at: trade.opened_at,
      closed_at: trade.closed_at,
    });

    let startDate: string;
    let endDate:   string;

    if (trade.opened_at) {
      // Exact timestamps available — fetch ±30 min around the trade
      const closeRef = trade.closed_at ?? trade.opened_at;
      startDate = toTDDate(trade.opened_at, -30);
      endDate   = toTDDate(closeRef, 30);
    } else if (trade.date) {
      // Only a date is stored (CSV / old EA trades) — fetch the main trading session
      // 06:00–18:00 UTC covers Asia close, London, and NY sessions (144 candles)
      startDate = `${trade.date} 06:00:00`;
      endDate   = `${trade.date} 18:00:00`;
      console.log("[modal] no opened_at — using date-window fallback for", trade.date);
    } else {
      setChartData({ status: "simulated" });
      return;
    }

    setChartData({ status: "loading" });
    const params = new URLSearchParams({
      symbol:     trade.pair,
      interval:   "5min",
      start_date: startDate,
      end_date:   endDate,
    });
    console.log("[modal] fetching candles — symbol:", trade.pair, "start:", startDate, "end:", endDate);

    fetch(`/api/twelvedata/candles?${params}`)
      .then(r => r.json())
      .then((json: { candles?: Candle[]; error?: string }) => {
        console.log("[modal] candles response — error:", json.error,
          "count:", json.candles?.length ?? 0);
        if (json.error === "no_api_key") {
          setChartData({ status: "simulated" });
        } else if (json.error || !json.candles?.length) {
          setChartData({ status: "error", reason: json.error ?? "empty" });
        } else {
          setChartData({ status: "ok", candles: json.candles });
        }
      })
      .catch(err => {
        console.error("[modal] fetch failed:", err);
        setChartData({ status: "error", reason: "fetch_failed" });
      });
  }, [trade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create / update LW chart ──────────────────────────────────────────────
  useEffect(() => {
    if (!scriptReady) return;
    if (chartData.status !== "ok") return;
    if (!chartContainerRef.current) return;

    const candles = chartData.candles;
    if (candles.length === 0) return;

    const LW = (window as unknown as { LightweightCharts: LWCLib }).LightweightCharts;
    if (!LW) return;

    // Clean up any previous chart
    if (chartInstanceRef.current) {
      try { chartInstanceRef.current.remove(); } catch { /* already removed */ }
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = LW.createChart(container, {
      width:  container.clientWidth || 540,
      height: 230,
      layout: {
        background: { type: "solid", color: "#0D0B14" },
        textColor:  "#52525b",
        fontSize:   10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        textColor:   "#52525b",
      },
      timeScale: {
        borderColor:    "rgba(255,255,255,0.08)",
        timeVisible:    true,
        secondsVisible: false,
        textColor:      "#52525b",
      },
      handleScroll: false,
      handleScale:  false,
    });

    chartInstanceRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor:        "#5DCAA5",
      downColor:      "#F09595",
      borderUpColor:  "#5DCAA5",
      borderDownColor:"#F09595",
      wickUpColor:    "#5DCAA5",
      wickDownColor:  "#F09595",
    });

    // Convert candles: TwelveData datetime "YYYY-MM-DD HH:MM:SS" → Unix seconds
    const seriesData = candles.map(c => ({
      time:  Math.floor(new Date(c.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));
    series.setData(seriesData);

    // Entry price line — thin gold dashed horizontal
    series.createPriceLine({
      price:            trade.entry,
      color:            "#D4A017",
      lineWidth:        1,
      lineStyle:        2,
      axisLabelVisible: true,
      title:            "Entry",
    });

    // SL price line — dashed red
    if (trade.sl != null && trade.sl !== 0) {
      series.createPriceLine({
        price:            trade.sl,
        color:            "#E24B4A",
        lineWidth:        1,
        lineStyle:        2,
        axisLabelVisible: true,
        title:            "SL",
      });
    }

    // TP price line — dashed green
    if (trade.tp != null && trade.tp !== 0) {
      series.createPriceLine({
        price:            trade.tp,
        color:            "#5DCAA5",
        lineWidth:        1,
        lineStyle:        2,
        axisLabelVisible: true,
        title:            "TP",
      });
    }

    // Entry / exit markers (only when exact timestamps are known)
    const markers: LWCMarker[] = [];
    if (trade.opened_at) {
      markers.push({
        time:     Math.floor(new Date(trade.opened_at).getTime() / 1000),
        position: "belowBar",
        color:    "#D4A017",
        shape:    "arrowUp",
        text:     `IN ${fmtPrice(trade.entry)}`,
        size:     2,
      });
    }
    if (trade.closed_at) {
      markers.push({
        time:     Math.floor(new Date(trade.closed_at).getTime() / 1000),
        position: "aboveBar",
        color:    trade.pnl >= 0 ? "#5DCAA5" : "#E24B4A",
        shape:    "arrowDown",
        text:     `OUT ${fmtPrice(trade.exit_price)}`,
        size:     2,
      });
    }
    if (markers.length > 0) {
      markers.sort((a, b) => a.time - b.time);
      try { series.setMarkers(markers); } catch (e) {
        console.warn("[lwc] setMarkers failed:", e);
      }
    }

    // Fit visible range: 30 min before entry → 30 min after exit
    // When exact timestamps are known, use setVisibleRange; else fitContent
    if (trade.opened_at) {
      const entryUnix = Math.floor(new Date(trade.opened_at).getTime() / 1000);
      const exitUnix  = trade.closed_at
        ? Math.floor(new Date(trade.closed_at).getTime() / 1000)
        : entryUnix + 3600;
      const pad = 30 * 60; // 30 minutes in seconds
      const first = seriesData[0].time;
      const last  = seriesData[seriesData.length - 1].time;
      try {
        chart.timeScale().setVisibleRange({
          from: Math.max(first, entryUnix - pad),
          to:   Math.min(last,  exitUnix  + pad),
        });
      } catch {
        chart.timeScale().fitContent();
      }
    } else {
      chart.timeScale().fitContent();
    }

    return () => {
      try { chart.remove(); } catch { /* already removed */ }
      chartInstanceRef.current = null;
    };
  }, [scriptReady, chartData, trade]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Behavioral context ────────────────────────────────────────────────────
  const ctx = useMemo(() => {
    const sorted = [...allDayTrades].sort((a, b) => {
      if (a.opened_at && b.opened_at)
        return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
      return (parseInt(a.mt5_deal_id ?? "0") || 0) - (parseInt(b.mt5_deal_id ?? "0") || 0);
    });
    const idx        = sorted.findIndex(t => t.id === trade.id);
    const prev       = sorted.slice(0, idx);
    const runningPnl = prev.reduce((s, t) => s + t.pnl, 0);
    let isRevenge = false;
    if (trade.opened_at) {
      const openMs = new Date(trade.opened_at).getTime();
      isRevenge = prev.some(p => {
        if (p.pnl >= 0 || !p.closed_at) return false;
        const diff = (openMs - new Date(p.closed_at).getTime()) / 60000;
        return diff >= 0 && diff <= 10;
      });
    } else {
      isRevenge = prev.length > 0 && prev[prev.length - 1].pnl < 0;
    }
    const isOvertrade  = sorted.length >= 4;
    const avgLot       = allDayTrades.reduce((s, t) => s + t.lot, 0) / allDayTrades.length;
    const riskRatio    = avgLot > 0 ? trade.lot / avgLot : 1;
    const sessionLabel = trade.opened_at
      ? sessionFromHour(new Date(trade.opened_at).getUTCHours())
      : (trade.session || "London");
    return { idx, runningPnl, isRevenge, isOvertrade, riskRatio, sessionLabel, dayCount: sorted.length };
  }, [trade, allDayTrades]);

  // ── SVG constants (Brownian fallback only) ────────────────────────────────
  const VW = 560, VH = 170, PL = 14, PR = 14, PT = 22, PB = 18;
  const cW = VW - PL - PR, cH = VH - PT - PB;

  const GOLD     = "#D4A017";
  const pnlColor = trade.pnl >= 0 ? "#1D9E75" : "#E24B4A";
  const pnlStr   = (trade.pnl >= 0 ? "+" : "") + "$" + Math.abs(trade.pnl).toFixed(2);

  // Brownian path (always computed — used as fallback)
  const pricePoints = useMemo(
    () => brownianBridge(trade.entry, trade.exit_price, 40, hashStr(trade.id)),
    [trade],
  );
  const browPrices = [...pricePoints];
  if (trade.sl) browPrices.push(trade.sl);
  if (trade.tp) browPrices.push(trade.tp);
  const bMin = Math.min(...browPrices), bMax = Math.max(...browPrices);
  const bRange = bMax - bMin || Math.abs(trade.entry) * 0.005 || 0.001;
  const bPad   = bRange * 0.1;
  function pxB(i: number) { return PL + (i / (pricePoints.length - 1)) * cW; }
  function pyB(v: number) { return PT + cH - ((v - (bMin - bPad)) / (bRange + 2 * bPad)) * cH; }
  let pathD = `M ${pxB(0).toFixed(1)} ${pyB(pricePoints[0]).toFixed(1)}`;
  for (let i = 1; i < pricePoints.length; i++) {
    const mx = (pxB(i - 1) + pxB(i)) / 2;
    pathD += ` C ${mx} ${pyB(pricePoints[i - 1]).toFixed(1)} ${mx} ${pyB(pricePoints[i]).toFixed(1)} ${pxB(i).toFixed(1)} ${pyB(pricePoints[i]).toFixed(1)}`;
  }
  const slBreachBrown = trade.sl != null && (
    trade.direction === "BUY"
      ? pricePoints.some(p => p < trade.sl!)
      : pricePoints.some(p => p > trade.sl!)
  );

  // SL breach from real candles
  const candles   = chartData.status === "ok" ? chartData.candles : [];
  const n         = candles.length;
  const entryIdx  = n > 0 && trade.opened_at ? closestIdx(candles, trade.opened_at) : 0;
  const exitIdx   = n > 0 && trade.closed_at  ? closestIdx(candles, trade.closed_at)  : Math.max(0, n - 1);
  const slBreachCandles = trade.sl != null && n > 0 &&
    candles.slice(entryIdx, exitIdx + 1).some(c =>
      trade.direction === "BUY" ? c.low < trade.sl! : c.high > trade.sl!
    );
  const slBreach = chartData.status === "ok" ? slBreachCandles : slBreachBrown;

  const isSimulated = chartData.status === "simulated" || chartData.status === "error";

  const nlVerdict = verdict({
    isRevenge: ctx.isRevenge, isOvertrade: ctx.isOvertrade,
    session: ctx.sessionLabel, riskRatio: ctx.riskRatio,
    pnl: trade.pnl, runningPnl: ctx.runningPnl,
    tp: trade.tp, direction: trade.direction,
    exitPrice: trade.exit_price, dayTradesCount: ctx.dayCount,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto",
          background: "#0D0B14",
          border: "1px solid rgba(212,160,23,0.2)",
          borderTop: "2px solid #D4A017",
          borderRadius: 20,
          boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 22px 14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#f4f4f5" }}>{trade.pair}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: trade.direction === "BUY" ? "rgba(29,158,117,0.18)" : "rgba(226,75,74,0.18)",
                color: trade.direction === "BUY" ? "#1D9E75" : "#E24B4A",
                border: `1px solid ${trade.direction === "BUY" ? "rgba(29,158,117,0.35)" : "rgba(226,75,74,0.35)"}`,
              }}>{trade.direction}</span>
              {slBreach && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: "rgba(239,68,68,0.12)", color: "#f87171",
                  border: "1px solid rgba(239,68,68,0.25)",
                }}>⚠ SL BREACH</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: pnlColor, fontFamily: "sans-serif" }}>{pnlStr}</span>
              <button onClick={onClose} style={{
                width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#71717a", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 12 }}>
            {[
              { label: "Open",    value: fmtTime(trade.opened_at) },
              { label: "Close",   value: fmtTime(trade.closed_at) },
              { label: "Hold",    value: holdDuration(trade.opened_at, trade.closed_at) },
              { label: "Session", value: ctx.sessionLabel },
              { label: "Lot",     value: String(trade.lot) },
              { label: "Entry",   value: fmtPrice(trade.entry) },
              { label: "Exit",    value: fmtPrice(trade.exit_price) },
            ].map(({ label, value }) => (
              <span key={label} style={{ color: "#52525b" }}>
                {label}{" "}<span style={{ color: "#c4c4c7" }}>{value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Chart area ─────────────────────────────────────────────────── */}
        <div style={{ padding: "0 22px 14px" }}>
          <div style={{ background: "#1A1916", borderRadius: 12, padding: "10px 4px 6px", position: "relative" }}>

            {/* Loading skeleton */}
            {chartData.status === "loading" && (
              <div style={{
                height: 230, display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", overflow: "hidden", borderRadius: 8,
              }}>
                <style>{`@keyframes tdm-shim{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)",
                  animation: "tdm-shim 1.8s ease-in-out infinite",
                }} />
                <span style={{ color: "#3f3f46", fontSize: 11, position: "relative", zIndex: 1 }}>
                  Fetching market data…
                </span>
              </div>
            )}

            {/* ── TradingView Lightweight Charts (real candles) ─────────── */}
            {chartData.status === "ok" && n > 0 && (
              <div
                ref={chartContainerRef}
                style={{
                  width: "100%",
                  height: 230,
                  background: "#0D0B14",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              />
            )}

            {/* No candle data despite "ok" status */}
            {chartData.status === "ok" && n === 0 && (
              <div style={{
                height: 140, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "#3f3f46", fontSize: 12 }}>No candle data for this time window</span>
              </div>
            )}

            {/* ── Brownian fallback ─────────────────────────────────────── */}
            {isSimulated && (
              <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH}
                preserveAspectRatio="none" style={{ display: "block" }}>

                {trade.sl != null && (
                  <>
                    <line x1={PL} y1={pyB(trade.sl)} x2={VW - PR} y2={pyB(trade.sl)}
                      stroke="#E24B4A" strokeWidth={1} strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke" />
                    <text x={VW - PR - 4} y={pyB(trade.sl) - 4}
                      textAnchor="end" fontSize={8} fill="#E24B4A" fontFamily="sans-serif">
                      SL {fmtPrice(trade.sl)}
                    </text>
                  </>
                )}
                {trade.tp != null && (
                  <>
                    <line x1={PL} y1={pyB(trade.tp)} x2={VW - PR} y2={pyB(trade.tp)}
                      stroke="#1D9E75" strokeWidth={1} strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke" />
                    <text x={VW - PR - 4} y={pyB(trade.tp) - 4}
                      textAnchor="end" fontSize={8} fill="#1D9E75" fontFamily="sans-serif">
                      TP {fmtPrice(trade.tp)}
                    </text>
                  </>
                )}

                <line x1={PL} y1={pyB(trade.entry)} x2={VW - PR} y2={pyB(trade.entry)}
                  stroke="rgba(212,160,23,0.12)" strokeWidth={1}
                  vectorEffect="non-scaling-stroke" />

                <path d={pathD} fill="none" stroke={GOLD} strokeWidth={2.5}
                  strokeLinecap="round"
                  pathLength={1000} strokeDasharray={1000}
                  strokeDashoffset={drawn ? 0 : 1000}
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
                />

                <circle cx={pxB(0)} cy={pyB(pricePoints[0])} r={5} fill={GOLD} />
                <text x={pxB(0)} y={pyB(pricePoints[0]) - 9}
                  textAnchor="start" fontSize={8} fill={GOLD}
                  fontFamily="sans-serif" fontWeight="700">IN</text>

                {drawn && (
                  <>
                    <circle cx={pxB(pricePoints.length - 1)} cy={pyB(pricePoints[pricePoints.length - 1])}
                      r={5} fill={pnlColor} />
                    <text x={pxB(pricePoints.length - 1)} y={pyB(pricePoints[pricePoints.length - 1]) - 9}
                      textAnchor="end" fontSize={8} fill={pnlColor}
                      fontFamily="sans-serif" fontWeight="700">OUT</text>
                  </>
                )}
              </svg>
            )}

            {/* Badge: full-day-view (date fallback) */}
            {chartData.status === "ok" && n > 0 && !trade.opened_at && (
              <div style={{
                position: "absolute", top: 8, right: 10,
                fontSize: 9, padding: "2px 7px", borderRadius: 100,
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#71717a", letterSpacing: "0.04em",
              }}>
                full day · no exact time
              </div>
            )}

            {/* Badge: simulated or error state */}
            {isSimulated && (
              <div style={{
                position: "absolute", top: 8, right: 10,
                fontSize: 9, padding: "2px 7px", borderRadius: 100,
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#52525b", letterSpacing: "0.04em",
              }}>
                simulated · no market data
              </div>
            )}

            {/* SL/TP legend — shown for simulated chart */}
            {isSimulated && (trade.sl != null || trade.tp != null) && (
              <div style={{ display: "flex", gap: 14, padding: "2px 8px 2px", justifyContent: "flex-end" }}>
                {trade.sl != null && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#71717a" }}>
                    <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#E24B4A" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                    SL {fmtPrice(trade.sl)}
                  </span>
                )}
                {trade.tp != null && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#71717a" }}>
                    <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                    TP {fmtPrice(trade.tp)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Behavioral context grid ─────────────────────────────────────── */}
        <div style={{ padding: "0 22px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Revenge Trade", value: ctx.isRevenge ? "Yes" : "No",                      warn: ctx.isRevenge },
              { label: "Overtrading",   value: ctx.isOvertrade ? `Yes (${ctx.dayCount}t)` : "No", warn: ctx.isOvertrade },
              { label: "Risk vs Avg",   value: `${(ctx.riskRatio * 100).toFixed(0)}%`,             warn: ctx.riskRatio > 1.5 },
              { label: "Running P&L",   value: `${ctx.runningPnl >= 0 ? "+" : ""}$${Math.abs(ctx.runningPnl).toFixed(2)}`, warn: ctx.runningPnl < -20 },
              { label: "Trade #",       value: `${ctx.idx + 1} of ${ctx.dayCount}`,                warn: false },
              { label: "Hold Time",     value: holdDuration(trade.opened_at, trade.closed_at),     warn: false },
            ].map(({ label, value, warn }) => (
              <div key={label} style={{
                background: "#1A1916",
                border: `1px solid ${warn ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.05)"}`,
                borderRadius: 10, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 10, color: "#52525b", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: warn ? "#f87171" : "#e4e4e7", fontFamily: "sans-serif" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* NIRI verdict */}
          <div style={{
            padding: "12px 16px",
            background: "rgba(212,160,23,0.05)",
            border: "1px dashed rgba(212,160,23,0.25)",
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 5 }}>
              NIRI VERDICT
            </div>
            <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.55 }}>{nlVerdict}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
