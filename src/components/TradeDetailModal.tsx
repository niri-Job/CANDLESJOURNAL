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

// ── Seeded PRNG (LCG) for deterministic Brownian bridge ──────────────────────
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function brownianBridge(start: number, end: number, n: number, seed: number): number[] {
  const rand = makePrng(seed);
  const range = Math.abs(end - start) || Math.abs(start) * 0.005 || 0.001;
  const pts: number[] = [start];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const base = start + (end - start) * t;
    const damping = Math.sin(Math.PI * t);
    pts.push(base + (rand() - 0.5) * range * 0.5 * damping);
  }
  pts.push(end);
  return pts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sessionFromHour(h: number): string {
  if (h >= 0 && h < 6)  return "Asia";
  if (h >= 7 && h < 12) return "London";
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

// ── NIRI verdict rule engine ──────────────────────────────────────────────────
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
  trade,
  allDayTrades,
  onClose,
}: {
  trade: ReplayTrade;
  allDayTrades: ReplayTrade[];
  onClose: () => void;
}) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Behavioral context ────────────────────────────────────────────────────
  const ctx = useMemo(() => {
    // Sort day's trades by opened_at, fallback to mt5_deal_id integer order
    const sorted = [...allDayTrades].sort((a, b) => {
      if (a.opened_at && b.opened_at)
        return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
      return (parseInt(a.mt5_deal_id ?? "0") || 0) - (parseInt(b.mt5_deal_id ?? "0") || 0);
    });

    const idx = sorted.findIndex(t => t.id === trade.id);
    const prev = sorted.slice(0, idx);
    const runningPnl = prev.reduce((s, t) => s + t.pnl, 0);

    // Revenge: any prior losing trade closed within 10 min before this one opened
    let isRevenge = false;
    if (trade.opened_at) {
      const openMs = new Date(trade.opened_at).getTime();
      isRevenge = prev.some(p => {
        if (p.pnl >= 0 || !p.closed_at) return false;
        const closeMs = new Date(p.closed_at).getTime();
        const diff = (openMs - closeMs) / 60000;
        return diff >= 0 && diff <= 10;
      });
    } else {
      // Fallback: previous trade in sequence was a loss
      isRevenge = prev.length > 0 && prev[prev.length - 1].pnl < 0;
    }

    const isOvertrade = sorted.length >= 4;
    const avgLot = allDayTrades.reduce((s, t) => s + t.lot, 0) / allDayTrades.length;
    const riskRatio = avgLot > 0 ? trade.lot / avgLot : 1;

    const sessionLabel = trade.opened_at
      ? sessionFromHour(new Date(trade.opened_at).getUTCHours())
      : (trade.session || "London");

    return { idx, runningPnl, isRevenge, isOvertrade, riskRatio, sessionLabel, dayCount: sorted.length };
  }, [trade, allDayTrades]);

  // ── Price path ────────────────────────────────────────────────────────────
  const pricePoints = useMemo(() => {
    return brownianBridge(trade.entry, trade.exit_price, 40, hashStr(trade.id));
  }, [trade]);

  // ── SVG layout ────────────────────────────────────────────────────────────
  const VW = 560, VH = 170, PL = 14, PR = 14, PT = 22, PB = 18;
  const cW = VW - PL - PR, cH = VH - PT - PB;

  const allPrices = [...pricePoints];
  if (trade.sl) allPrices.push(trade.sl);
  if (trade.tp) allPrices.push(trade.tp);
  const pMin = Math.min(...allPrices);
  const pMax = Math.max(...allPrices);
  const pRange = pMax - pMin || Math.abs(trade.entry) * 0.005 || 0.001;
  const pad = pRange * 0.1;

  function px(i: number) { return PL + (i / (pricePoints.length - 1)) * cW; }
  function py(v: number) { return PT + cH - ((v - (pMin - pad)) / (pRange + 2 * pad)) * cH; }

  // Build cubic bezier path
  let pathD = `M ${px(0).toFixed(1)} ${py(pricePoints[0]).toFixed(1)}`;
  for (let i = 1; i < pricePoints.length; i++) {
    const mx = (px(i - 1) + px(i)) / 2;
    pathD += ` C ${mx} ${py(pricePoints[i - 1]).toFixed(1)} ${mx} ${py(pricePoints[i]).toFixed(1)} ${px(i).toFixed(1)} ${py(pricePoints[i]).toFixed(1)}`;
  }

  // SL breach detection (simulated path only)
  const slBreach = trade.sl != null && (
    trade.direction === "BUY"
      ? pricePoints.some(p => p < trade.sl!)
      : pricePoints.some(p => p > trade.sl!)
  );

  const GOLD = "#D4A017";
  const pnlColor = trade.pnl >= 0 ? "#1D9E75" : "#E24B4A";
  const pnlStr = (trade.pnl >= 0 ? "+" : "") + "$" + Math.abs(trade.pnl).toFixed(2);

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
          width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto",
          background: "#0D0B14",
          border: "1px solid rgba(212,160,23,0.2)",
          borderTop: "2px solid #D4A017",
          borderRadius: 20,
          boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
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
              <span style={{ fontSize: 28, fontWeight: 800, color: pnlColor, fontFamily: "sans-serif" }}>
                {pnlStr}
              </span>
              <button onClick={onClose} style={{
                width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#71717a", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>
          </div>

          {/* Timing row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 12 }}>
            {[
              { label: "Open",    value: fmtTime(trade.opened_at) },
              { label: "Close",   value: fmtTime(trade.closed_at) },
              { label: "Hold",    value: holdDuration(trade.opened_at, trade.closed_at) },
              { label: "Session", value: ctx.sessionLabel },
              { label: "Lot",     value: String(trade.lot) },
              { label: "Entry",   value: trade.entry.toFixed(5) },
              { label: "Exit",    value: trade.exit_price.toFixed(5) },
            ].map(({ label, value }) => (
              <span key={label} style={{ color: "#52525b" }}>
                {label}{" "}<span style={{ color: "#c4c4c7" }}>{value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Price path SVG ────────────────────────────────────────────── */}
        <div style={{ padding: "0 22px 14px" }}>
          <div style={{ background: "#1A1916", borderRadius: 12, padding: "10px 4px 6px", position: "relative" }}>
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              width="100%" height={VH}
              preserveAspectRatio="none"
              style={{ display: "block" }}
            >
              {/* SL hairline */}
              {trade.sl != null && (
                <>
                  <line x1={PL} y1={py(trade.sl)} x2={VW - PR} y2={py(trade.sl)}
                    stroke="#E24B4A" strokeWidth={1} strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke" />
                  <text x={VW - PR - 4} y={py(trade.sl) - 5} textAnchor="end"
                    fontSize={8} fill="#E24B4A" fontFamily="sans-serif">SL</text>
                </>
              )}

              {/* TP hairline */}
              {trade.tp != null && (
                <>
                  <line x1={PL} y1={py(trade.tp)} x2={VW - PR} y2={py(trade.tp)}
                    stroke="#1D9E75" strokeWidth={1} strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke" />
                  <text x={VW - PR - 4} y={py(trade.tp) - 5} textAnchor="end"
                    fontSize={8} fill="#1D9E75" fontFamily="sans-serif">TP</text>
                </>
              )}

              {/* Entry horizontal guide */}
              <line x1={PL} y1={py(trade.entry)} x2={VW - PR} y2={py(trade.entry)}
                stroke="rgba(212,160,23,0.15)" strokeWidth={1}
                vectorEffect="non-scaling-stroke" />

              {/* Animated price path */}
              <path d={pathD} fill="none" stroke={GOLD} strokeWidth={2.5}
                strokeLinecap="round"
                pathLength={1000} strokeDasharray={1000}
                strokeDashoffset={drawn ? 0 : 1000}
                vectorEffect="non-scaling-stroke"
                style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
              />

              {/* Entry dot + label */}
              <circle cx={px(0)} cy={py(pricePoints[0])} r={5} fill={GOLD} />
              <text x={px(0)} y={py(pricePoints[0]) - 9} textAnchor="middle"
                fontSize={8} fill={GOLD} fontFamily="sans-serif" fontWeight="700">IN</text>

              {/* Exit dot + label (visible only after path draws) */}
              {drawn && (
                <>
                  <circle cx={px(pricePoints.length - 1)} cy={py(pricePoints[pricePoints.length - 1])}
                    r={5} fill={pnlColor} />
                  <text x={px(pricePoints.length - 1)} y={py(pricePoints[pricePoints.length - 1]) - 9}
                    textAnchor="middle" fontSize={8} fill={pnlColor} fontFamily="sans-serif" fontWeight="700">
                    OUT
                  </text>
                </>
              )}
            </svg>

            {/* Legend row */}
            {(trade.sl != null || trade.tp != null) && (
              <div style={{ display: "flex", gap: 14, padding: "2px 8px 2px", justifyContent: "flex-end" }}>
                {trade.sl != null && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#71717a" }}>
                    <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#E24B4A" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                    SL {trade.sl.toFixed(4)}
                  </span>
                )}
                {trade.tp != null && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#71717a" }}>
                    <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                    TP {trade.tp.toFixed(4)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Behavioral context grid ───────────────────────────────────── */}
        <div style={{ padding: "0 22px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Revenge Trade",  value: ctx.isRevenge ? "Yes" : "No",                 warn: ctx.isRevenge },
              { label: "Overtrading",    value: ctx.isOvertrade ? `Yes (${ctx.dayCount}t)` : "No", warn: ctx.isOvertrade },
              { label: "Risk vs Avg",    value: `${(ctx.riskRatio * 100).toFixed(0)}%`,        warn: ctx.riskRatio > 1.5 },
              { label: "Running P&L",    value: `${ctx.runningPnl >= 0 ? "+" : ""}$${Math.abs(ctx.runningPnl).toFixed(2)}`, warn: ctx.runningPnl < -20 },
              { label: "Trade #",        value: `${ctx.idx + 1} of ${ctx.dayCount}`,           warn: false },
              { label: "Hold Time",      value: holdDuration(trade.opened_at, trade.closed_at), warn: false },
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
