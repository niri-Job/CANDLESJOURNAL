"use client";

import { useState, useEffect, useMemo } from "react";

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
  | { status: "simulated" };               // no timestamps or no API key

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
  const [drawn,     setDrawn]     = useState(false);
  const [chartData, setChartData] = useState<ChartState>({ status: "loading" });

  // Animate Brownian path draw-on
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

  // ── Fetch real candles ────────────────────────────────────────────────────
  useEffect(() => {
    if (!trade.opened_at) {
      setChartData({ status: "simulated" });
      return;
    }
    setChartData({ status: "loading" });
    const closeRef = trade.closed_at ?? trade.opened_at;
    const params = new URLSearchParams({
      symbol:     trade.pair,
      interval:   "5min",
      start_date: toTDDate(trade.opened_at, -30),
      end_date:   toTDDate(closeRef, 30),
    });
    fetch(`/api/twelvedata/candles?${params}`)
      .then(r => r.json())
      .then((json: { candles?: Candle[]; error?: string }) => {
        if (json.error === "no_api_key") {
          setChartData({ status: "simulated" });
        } else if (json.error || !json.candles?.length) {
          setChartData({ status: "error", reason: json.error ?? "empty" });
        } else {
          setChartData({ status: "ok", candles: json.candles });
        }
      })
      .catch(() => setChartData({ status: "error", reason: "fetch_failed" }));
  }, [trade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Behavioral context ────────────────────────────────────────────────────
  const ctx = useMemo(() => {
    const sorted = [...allDayTrades].sort((a, b) => {
      if (a.opened_at && b.opened_at)
        return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
      return (parseInt(a.mt5_deal_id ?? "0") || 0) - (parseInt(b.mt5_deal_id ?? "0") || 0);
    });
    const idx     = sorted.findIndex(t => t.id === trade.id);
    const prev    = sorted.slice(0, idx);
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

  // ── SVG constants (shared) ────────────────────────────────────────────────
  const VW = 560, VH = 170, PL = 14, PR = 14, PT = 22, PB = 18;
  const cW = VW - PL - PR, cH = VH - PT - PB;

  const GOLD      = "#D4A017";
  const pnlColor  = trade.pnl >= 0 ? "#1D9E75" : "#E24B4A";
  const pnlStr    = (trade.pnl >= 0 ? "+" : "") + "$" + Math.abs(trade.pnl).toFixed(2);

  // ── Brownian path (always computed — used as fallback) ────────────────────
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
    trade.direction === "BUY" ? pricePoints.some(p => p < trade.sl!) : pricePoints.some(p => p > trade.sl!)
  );

  // ── Candlestick layout ────────────────────────────────────────────────────
  const candles  = chartData.status === "ok" ? chartData.candles : [];
  const n        = candles.length;
  const spacing  = n > 0 ? cW / n : cW;
  const bodyW    = n > 0 ? Math.max(1, spacing * 0.6) : 6;
  function cxC(i: number) { return PL + (i + 0.5) * spacing; }

  const entryIdx = n > 0 && trade.opened_at ? closestIdx(candles, trade.opened_at) : 0;
  const exitIdx  = n > 0 && trade.closed_at  ? closestIdx(candles, trade.closed_at)  : Math.max(0, n - 1);

  const cPrices = candles.flatMap(c => [c.high, c.low]);
  if (trade.sl) cPrices.push(trade.sl);
  if (trade.tp) cPrices.push(trade.tp);
  cPrices.push(trade.entry, trade.exit_price);
  const cPriceMin = cPrices.length ? Math.min(...cPrices) : trade.entry * 0.999;
  const cPriceMax = cPrices.length ? Math.max(...cPrices) : trade.entry * 1.001;
  const cRange    = cPriceMax - cPriceMin || Math.abs(trade.entry) * 0.005 || 0.001;
  const cPad      = cRange * 0.08;
  function pyC(v: number) { return PT + cH - ((v - (cPriceMin - cPad)) / (cRange + 2 * cPad)) * cH; }

  const slBreachCandles = trade.sl != null && n > 0 && candles.slice(entryIdx, exitIdx + 1).some(c =>
    trade.direction === "BUY" ? c.low < trade.sl! : c.high > trade.sl!
  );
  const slBreach = chartData.status === "ok" ? slBreachCandles : slBreachBrown;

  // Label anchor: keep IN/OUT text inside the SVG viewport
  function labelAnchor(xPos: number): "start" | "middle" | "end" {
    if (xPos < PL + 50) return "start";
    if (xPos > VW - PR - 50) return "end";
    return "middle";
  }
  function labelY(yPos: number, above = true): number {
    return above ? (yPos < PT + 14 ? yPos + 14 : yPos - 8) : yPos + 14;
  }

  const nlVerdict = verdict({
    isRevenge: ctx.isRevenge, isOvertrade: ctx.isOvertrade,
    session: ctx.sessionLabel, riskRatio: ctx.riskRatio,
    pnl: trade.pnl, runningPnl: ctx.runningPnl,
    tp: trade.tp, direction: trade.direction,
    exitPrice: trade.exit_price, dayTradesCount: ctx.dayCount,
  });

  const isSimulated = chartData.status === "simulated" || chartData.status === "error";

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

            {/* ── Loading skeleton ───────────────────────────────────────── */}
            {chartData.status === "loading" && (
              <div style={{
                height: VH,
                display: "flex", alignItems: "center", justifyContent: "center",
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

            {/* ── Real candlestick chart ─────────────────────────────────── */}
            {chartData.status === "ok" && n > 0 && (() => {
              const entX = cxC(entryIdx);
              const extX = cxC(exitIdx);
              const entY = pyC(trade.entry);
              const extY = pyC(trade.exit_price);
              const bandX1 = cxC(Math.min(entryIdx, exitIdx)) - spacing / 2;
              const bandX2 = cxC(Math.max(entryIdx, exitIdx)) + spacing / 2;

              return (
                <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH}
                  preserveAspectRatio="none" style={{ display: "block" }}>

                  {/* Gold band over trade duration */}
                  <rect x={bandX1} y={PT} width={bandX2 - bandX1} height={cH}
                    fill="rgba(212,160,23,0.05)" />

                  {/* SL hairline */}
                  {trade.sl != null && (
                    <>
                      <line x1={PL} y1={pyC(trade.sl)} x2={VW - PR} y2={pyC(trade.sl)}
                        stroke="#E24B4A" strokeWidth={1} strokeDasharray="4 4"
                        vectorEffect="non-scaling-stroke" />
                      <text x={VW - PR - 4} y={pyC(trade.sl) - 4}
                        textAnchor="end" fontSize={8} fill="#E24B4A" fontFamily="sans-serif">
                        SL {fmtPrice(trade.sl)}
                      </text>
                    </>
                  )}

                  {/* TP hairline */}
                  {trade.tp != null && (
                    <>
                      <line x1={PL} y1={pyC(trade.tp)} x2={VW - PR} y2={pyC(trade.tp)}
                        stroke="#1D9E75" strokeWidth={1} strokeDasharray="4 4"
                        vectorEffect="non-scaling-stroke" />
                      <text x={VW - PR - 4} y={pyC(trade.tp) - 4}
                        textAnchor="end" fontSize={8} fill="#1D9E75" fontFamily="sans-serif">
                        TP {fmtPrice(trade.tp)}
                      </text>
                    </>
                  )}

                  {/* Candle bodies + wicks */}
                  {candles.map((c, i) => {
                    const x       = cxC(i);
                    const isGreen = c.close >= c.open;
                    const color   = isGreen ? "#5DCAA5" : "#F09595";
                    const bodyTop = pyC(Math.max(c.open, c.close));
                    const bodyBot = pyC(Math.min(c.open, c.close));
                    const bodyH   = Math.max(1, bodyBot - bodyTop);
                    return (
                      <g key={c.datetime}>
                        <line x1={x} y1={pyC(c.high)} x2={x} y2={pyC(c.low)}
                          stroke={color} strokeWidth={1}
                          vectorEffect="non-scaling-stroke" />
                        <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
                          fill={color} />
                      </g>
                    );
                  })}

                  {/* Entry vertical marker */}
                  <line x1={entX} y1={PT} x2={entX} y2={PT + cH}
                    stroke="rgba(212,160,23,0.55)" strokeWidth={1} strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke" />

                  {/* Exit vertical marker */}
                  <line x1={extX} y1={PT} x2={extX} y2={PT + cH}
                    stroke={trade.pnl >= 0 ? "rgba(29,158,117,0.55)" : "rgba(226,75,74,0.55)"}
                    strokeWidth={1} strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke" />

                  {/* IN dot + label */}
                  <circle cx={entX} cy={entY} r={4.5} fill={GOLD} />
                  <text x={entX} y={labelY(entY)}
                    textAnchor={labelAnchor(entX)}
                    fontSize={8} fill={GOLD} fontFamily="sans-serif" fontWeight="700">
                    IN {fmtPrice(trade.entry)}
                  </text>

                  {/* OUT dot + label */}
                  <circle cx={extX} cy={extY} r={4.5} fill={pnlColor} />
                  <text x={extX} y={labelY(extY)}
                    textAnchor={labelAnchor(extX)}
                    fontSize={8} fill={pnlColor} fontFamily="sans-serif" fontWeight="700">
                    OUT {fmtPrice(trade.exit_price)}
                  </text>
                </svg>
              );
            })()}

            {/* ── Brownian fallback (simulated / error / no timestamps) ──── */}
            {(chartData.status === "simulated" || chartData.status === "error") && (
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

            {/* Simulated badge */}
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

            {/* SL/TP legend row */}
            {(trade.sl != null || trade.tp != null) && chartData.status !== "loading" && (
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
