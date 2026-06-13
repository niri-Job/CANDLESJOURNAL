"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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

function fmtChip(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (n >= 0 ? "+$" : "−$") + s;
}

function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1][0] + pts[i][0]) / 2;
    d += ` C ${mx} ${pts[i - 1][1]} ${mx} ${pts[i][1]} ${pts[i][0]} ${pts[i][1]}`;
  }
  return d;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReplayPage() {
  const [user, setUser]           = useState<User | null>(null);
  const [loading, setLoading]     = useState(true);
  const [trades, setTrades]       = useState<ReplayTrade[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [playIndex, setPlayIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed]         = useState<0.5 | 1 | 2>(1);
  const [drillTrade, setDrillTrade] = useState<ReplayTrade | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth + data fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user: u }, error: authErr }) => {
      if (authErr || !u) { window.location.href = "/login"; return; }
      setUser(u);

      const { data, error } = await sb
        .from("trades")
        .select("*")
        .eq("user_id", u.id)
        .order("date", { ascending: false });

      console.log("[replay] fetch — user:", u.id, "rows:", data?.length ?? 0, "error:", error);

      if (error) {
        console.error("[replay] Supabase error:", error.message, error.details, error.hint);
      }

      if (data && data.length > 0) {
        setTrades(data as ReplayTrade[]);
        // Pick the most-recent date that has at least one trade
        const firstDate = data[0].date as string;
        if (firstDate) setSelectedDate(firstDate);
      }
      setLoading(false);
    });
  }, []);

  // ── Available dates ────────────────────────────────────────────────────────
  const tradeDays = useMemo(() => {
    // t.date is "YYYY-MM-DD"; fall back to extracting from opened_at if absent
    const days = new Set(trades.map(t => {
      if (t.date) return t.date;
      if (t.opened_at) return t.opened_at.slice(0, 10);
      return null;
    }).filter(Boolean) as string[]);
    return Array.from(days).sort().reverse();
  }, [trades]);

  // ── Trades for selected day, sorted chronologically ────────────────────────
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
    if (dayTrades.length === 0) return null;
    const pnl      = dayTrades.reduce((s, t) => s + t.pnl, 0);
    const wins     = dayTrades.filter(t => t.pnl > 0).length;
    const sessions = [...new Set(dayTrades.map(t => {
      if (t.opened_at) return sessionFromHour(new Date(t.opened_at).getUTCHours());
      return t.session || "Unknown";
    }))];
    let revengeCount = 0;
    for (let i = 1; i < dayTrades.length; i++) {
      const prev = dayTrades[i - 1];
      const curr = dayTrades[i];
      if (prev.pnl < 0 && curr.opened_at && prev.closed_at) {
        const diff = (new Date(curr.opened_at).getTime() - new Date(prev.closed_at).getTime()) / 60000;
        if (diff >= 0 && diff <= 10) revengeCount++;
      } else if (prev.pnl < 0 && !curr.opened_at) {
        revengeCount++;
      }
    }
    return {
      pnl, wins, winRate: (wins / dayTrades.length) * 100,
      sessions, revengeCount,
      isOvertrade: dayTrades.length >= 4,
      total: dayTrades.length,
    };
  }, [dayTrades]);

  // ── Full equity series — N+1 cumulative P&L for all day trades ───────────
  const fullEquitySeries = useMemo(() => {
    const pts: number[] = [0];
    for (const t of dayTrades) pts.push(pts[pts.length - 1] + t.pnl);
    return pts;
  }, [dayTrades]);

  // ── Play/pause ─────────────────────────────────────────────────────────────
  function clearPlay() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  const advance = useCallback(() => {
    setPlayIndex(idx => {
      const next = idx + 1;
      if (next >= dayTrades.length) {
        setIsPlaying(false);
        clearPlay();
        return idx;
      }
      return next;
    });
  }, [dayTrades.length]);

  function startPlay() {
    if (isPlaying) { clearPlay(); setIsPlaying(false); return; }
    if (playIndex >= dayTrades.length - 1) setPlayIndex(-1);
    setIsPlaying(true);
    intervalRef.current = setInterval(advance, 1000 / speed);
  }

  function reset() {
    clearPlay();
    setIsPlaying(false);
    setPlayIndex(-1);
  }

  // Re-create interval when speed changes during play
  useEffect(() => {
    if (isPlaying) {
      clearPlay();
      intervalRef.current = setInterval(advance, 1000 / speed);
    }
  }, [speed, isPlaying, advance]);

  useEffect(() => () => clearPlay(), []);

  // When date changes, reset playback
  useEffect(() => { reset(); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timeline SVG ───────────────────────────────────────────────────────────
  const TL_W = 600, TL_H = 72, TL_PL = 12, TL_PR = 12, TL_PT = 8, TL_PB = 24;
  const tW = TL_W - TL_PL - TL_PR, tH = TL_H - TL_PT - TL_PB;
  const maxAbsPnl = Math.max(...dayTrades.map(t => Math.abs(t.pnl)), 1);

  // X position: if we have opened_at, use actual minute within day; else use index
  const hasTimestamps = dayTrades.length > 0 && !!dayTrades[0].opened_at;
  function tickX(t: ReplayTrade, i: number): number {
    if (hasTimestamps && t.opened_at) {
      const d = new Date(t.opened_at);
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes(); // 0..1439
      return TL_PL + (mins / 1439) * tW;
    }
    return dayTrades.length <= 1
      ? TL_PL + tW / 2
      : TL_PL + (i / (dayTrades.length - 1)) * tW;
  }
  function tickH(t: ReplayTrade): number {
    return TL_PT + tH - Math.max(4, (Math.abs(t.pnl) / maxAbsPnl) * tH);
  }

  // ── Shared playback values ────────────────────────────────────────────────
  const revealedCount = playIndex < 0
    ? fullEquitySeries.length - 1
    : Math.min(playIndex + 1, fullEquitySeries.length - 1);
  const currentEquity = fullEquitySeries[revealedCount] ?? 0;
  const eqLineColor   = currentEquity >= 0 ? "#5DCAA5" : "#F09595";

  const playTimeLabel = (() => {
    if (playIndex < 0) return "";
    const t = dayTrades[playIndex];
    if (!t?.opened_at) return "";
    const d = new Date(t.opened_at);
    const h = d.getUTCHours();
    return `${h.toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")} UTC · ${sessionFromHour(h)}`;
  })();

  // ── Waterfall chart layout ────────────────────────────────────────────────
  const WF_W = 640, WF_H = 160;
  const WF_PL = 48, WF_PR = 12, WF_PT = 20, WF_PB = 24;
  const wfChartW = WF_W - WF_PL - WF_PR;   // 580
  const wfChartH = WF_H - WF_PT - WF_PB;   // 116
  const wfN = dayTrades.length;
  const wfGap = 6;
  const wfColWNatural = wfN > 0
    ? Math.max(4, (wfChartW - Math.max(0, wfN - 1) * wfGap) / wfN)
    : wfChartW;
  // Cap column width at 80px for ≤ 5 trades so bars don't look flat
  const wfColW = wfN > 0 && wfN <= 5 ? Math.min(80, wfColWNatural) : wfColWNatural;
  const wfGroupW = wfN > 0 ? wfN * wfColW + Math.max(0, wfN - 1) * wfGap : wfChartW;
  const wfGroupOffset = wfN <= 5 ? (wfChartW - wfGroupW) / 2 : 0;
  const wfColX = (i: number) => WF_PL + wfGroupOffset + i * (wfColW + wfGap);

  const wfMin = fullEquitySeries.length > 0 ? Math.min(...fullEquitySeries, 0) : 0;
  const wfMax = fullEquitySeries.length > 0 ? Math.max(...fullEquitySeries, 0) : 0;
  const wfRange = wfMax - wfMin || 1;
  const wfPad = wfRange * 0.15;
  const wfY = (v: number) =>
    WF_PT + wfChartH - ((v - (wfMin - wfPad)) / (wfRange + 2 * wfPad)) * wfChartH;
  const wfZeroY = wfY(0);

  // Session bands: group consecutive same-session columns
  const SESSION_BAND_COLOR: Record<string, string> = {
    Asia: "rgba(83,74,183,0.04)",
    London: "rgba(212,160,23,0.04)",
    Overlap: "rgba(212,160,23,0.04)",
    "New York": "rgba(93,202,165,0.04)",
    "Off-Session": "rgba(255,255,255,0.01)",
  };
  const wfSessionGroups: { session: string; start: number; end: number }[] = [];
  for (let i = 0; i < wfN; i++) {
    const t = dayTrades[i];
    const sess = t.opened_at
      ? sessionFromHour(new Date(t.opened_at).getUTCHours())
      : (t.session ?? "Off-Session");
    const last = wfSessionGroups[wfSessionGroups.length - 1];
    if (!last || last.session !== sess) wfSessionGroups.push({ session: sess, start: i, end: i });
    else last.end = i;
  }

  const GOLD = "#D4A017";
  const currentTrade = playIndex >= 0 && playIndex < dayTrades.length ? dayTrades[playIndex] : null;
  const sessionTag = currentTrade?.opened_at
    ? sessionFromHour(new Date(currentTrade.opened_at).getUTCHours())
    : (currentTrade?.session ?? "");

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
        <Sidebar user={null} onSignOut={() => {}} />
        <div className="md:ml-[240px] pt-14 md:pt-0 flex items-center justify-center min-h-screen">
          <p className="text-zinc-500 text-sm">Loading trades…</p>
        </div>
      </div>
    );
  }

  function handleLogout() {
    createClient().auth.signOut().then(() => { window.location.href = "/login"; });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleLogout} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Session Replay</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Relive a trading day trade by trade — spot emotional patterns.
              </p>
            </div>

            {/* Date picker */}
            <div className="flex items-center gap-3">
              <select
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-[var(--cj-surface)] border border-zinc-700 rounded-xl px-3 py-2
                           text-sm text-zinc-200 focus:outline-none focus:border-[var(--cj-gold)]"
              >
                {tradeDays.length === 0 && <option value="">No trades yet</option>}
                {tradeDays.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <p className="text-base font-medium mb-1">No trades to replay</p>
              <p className="text-sm">Import your MT5 history or log trades to get started.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 mb-5">

                {/* ── Left panel: day stats ──────────────────────────────── */}
                <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">{selectedDate}</p>

                  {dayStats ? (
                    <>
                      {/* P&L */}
                      <div>
                        <div className="text-[11px] text-zinc-600 mb-1">Day P&L</div>
                        <div className={`text-2xl font-bold ${dayStats.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmtPnl(dayStats.pnl)}
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Trades",   value: String(dayStats.total) },
                          { label: "Win Rate", value: `${dayStats.winRate.toFixed(0)}%` },
                          { label: "Wins",     value: `${dayStats.wins}` },
                          { label: "Losses",   value: `${dayStats.total - dayStats.wins}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-[var(--cj-raised)] rounded-xl p-3">
                            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">{label}</div>
                            <div className="text-sm font-semibold text-zinc-200">{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Session tags */}
                      <div>
                        <div className="text-[11px] text-zinc-600 mb-2">Sessions</div>
                        <div className="flex flex-wrap gap-1.5">
                          {dayStats.sessions.map(s => (
                            <span key={s} className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                              style={{ background: "rgba(212,160,23,0.1)", color: GOLD, border: "1px solid rgba(212,160,23,0.2)" }}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Discipline flags */}
                      <div className="space-y-2">
                        <div className="text-[11px] text-zinc-600">Discipline Flags</div>
                        {[
                          {
                            label: "Overtrading",
                            active: dayStats.isOvertrade,
                            detail: dayStats.isOvertrade ? `${dayStats.total} trades` : "Clean",
                          },
                          {
                            label: "Revenge Trades",
                            active: dayStats.revengeCount > 0,
                            detail: dayStats.revengeCount > 0 ? `${dayStats.revengeCount} detected` : "None",
                          },
                        ].map(({ label, active, detail }) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">{label}</span>
                            <span className={`text-[11px] font-semibold ${active ? "text-rose-400" : "text-emerald-400"}`}>
                              {detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-600">No trades on this day.</p>
                  )}
                </div>

                {/* ── Right panel: timeline + controls ──────────────────── */}
                <div className="space-y-4">

                  {/* Timeline */}
                  <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Timeline</p>
                      <p className="text-[10px] text-zinc-600">
                        {hasTimestamps ? "Time (UTC)" : "Trade sequence"} · height = |P&L|
                      </p>
                    </div>

                    {dayTrades.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-zinc-600 text-sm">
                        No trades on {selectedDate}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <svg viewBox={`0 0 ${TL_W} ${TL_H}`} width="100%" height={TL_H} style={{ display: "block" }}>
                          {/* Baseline */}
                          <line x1={TL_PL} y1={TL_PT + tH} x2={TL_W - TL_PR} y2={TL_PT + tH}
                            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

                          {/* Hour labels (when timestamps available) */}
                          {hasTimestamps && [6, 9, 12, 15, 18, 21].map(h => {
                            const x = TL_PL + (h * 60 / 1439) * tW;
                            return (
                              <g key={h}>
                                <line x1={x} y1={TL_PT} x2={x} y2={TL_PT + tH}
                                  stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                                <text x={x} y={TL_H - 6} textAnchor="middle"
                                  fontSize={8} fill="#52525b" fontFamily="sans-serif">
                                  {h.toString().padStart(2, "0")}:00
                                </text>
                              </g>
                            );
                          })}

                          {/* Trade ticks */}
                          {dayTrades.map((t, i) => {
                            const x  = tickX(t, i);
                            const y0 = tickH(t);
                            const y1 = TL_PT + tH;
                            const active = i <= (playIndex < 0 ? dayTrades.length - 1 : playIndex);
                            const isHighlight = i === playIndex;
                            const color = t.pnl >= 0 ? "#1D9E75" : "#E24B4A";
                            return (
                              <g key={t.id}
                                onClick={() => setDrillTrade(t)}
                                style={{ cursor: "pointer" }}
                              >
                                <rect
                                  x={x - 3} y={y0} width={6} height={y1 - y0}
                                  rx={2}
                                  fill={color}
                                  opacity={active ? (isHighlight ? 1 : 0.75) : 0.2}
                                />
                                {isHighlight && (
                                  <circle cx={x} cy={y0 - 3} r={3}
                                    fill={color} opacity={0.9} />
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* ── Waterfall equity chart ─────────────────────────── */}
                  <div className="border border-zinc-800 rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-4 pb-3"
                         style={{ background: "var(--cj-surface)" }}>
                      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                        Running Equity
                      </p>
                      <p className="text-[11px] text-zinc-600 tabular-nums">
                        {playTimeLabel || selectedDate}
                      </p>
                    </div>

                    {/* Chart */}
                    <div style={{ position: "relative", background: "#0D0B14", borderRadius: "0 0 10px 10px" }}>
                      <style>{`
                        @keyframes wf-pulse {
                          0%, 100% { opacity: 0.9; }
                          50%       { opacity: 0.5; }
                        }
                      `}</style>

                      {dayTrades.length === 0 ? (
                        <div style={{ height: WF_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "#52525b", fontSize: 13 }}>No trades on {selectedDate}</span>
                        </div>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <svg viewBox={`0 0 ${WF_W} ${WF_H}`} width="100%" height={WF_H}
                            preserveAspectRatio="none" style={{ display: "block" }}>

                            {/* Session bands */}
                            {wfSessionGroups.map(g => (
                              <rect key={`band-${g.start}`}
                                x={wfColX(g.start)} y={WF_PT}
                                width={wfColX(g.end) + wfColW - wfColX(g.start)}
                                height={wfChartH}
                                fill={SESSION_BAND_COLOR[g.session] ?? "rgba(255,255,255,0.01)"} />
                            ))}

                            {/* Zero baseline */}
                            <line x1={WF_PL} y1={wfZeroY} x2={WF_W - WF_PR} y2={wfZeroY}
                              stroke="rgba(255,255,255,0.10)" strokeWidth={1}
                              vectorEffect="non-scaling-stroke" />

                            {/* Y-axis labels */}
                            {[wfMin, 0, wfMax]
                              .filter((v, i, a) => a.indexOf(v) === i)
                              .map(v => (
                                <text key={v} x={WF_PL - 5} y={wfY(v) + 4}
                                  textAnchor="end" fontSize={9} fill="#3f3f46"
                                  fontFamily="sans-serif">
                                  {`${v >= 0 ? "+" : "−"}$${Math.round(Math.abs(v))}`}
                                </text>
                              ))
                            }

                            {/* Connector dashes between columns */}
                            {dayTrades.slice(0, -1).map((_, i) => {
                              if (playIndex >= 0 && i >= playIndex) return null;
                              const cy = wfY(fullEquitySeries[i + 1]);
                              return (
                                <line key={`conn-${i}`}
                                  x1={wfColX(i) + wfColW} y1={cy}
                                  x2={wfColX(i + 1)}       y2={cy}
                                  stroke="rgba(255,255,255,0.20)" strokeWidth={1}
                                  strokeDasharray="2 2"
                                  vectorEffect="non-scaling-stroke" />
                              );
                            })}

                            {/* Columns */}
                            {dayTrades.map((t, i) => {
                              const isCurrent = playIndex >= 0 && i === playIndex;
                              const isFuture  = playIndex >= 0 && i > playIndex;
                              const cumPre  = fullEquitySeries[i];
                              const cumPost = fullEquitySeries[i + 1];
                              const yTop = wfY(Math.max(cumPre, cumPost));
                              const yBot = wfY(Math.min(cumPre, cumPost));
                              const colH = Math.max(4, yBot - yTop);
                              const cx   = wfColX(i);
                              const fill = t.pnl >= 0 ? "#5DCAA5" : "#F09595";
                              if (isFuture) {
                                return (
                                  <rect key={t.id}
                                    x={cx} y={yTop} width={wfColW} height={colH} rx={4}
                                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                                    vectorEffect="non-scaling-stroke" />
                                );
                              }
                              return (
                                <rect key={t.id}
                                  x={cx} y={yTop} width={wfColW} height={colH} rx={4}
                                  fill={fill}
                                  style={isCurrent
                                    ? { animation: "wf-pulse 0.8s ease-in-out infinite" }
                                    : { opacity: 0.9 }}
                                  onClick={() => setDrillTrade(t)}
                                  cursor="pointer"
                                />
                              );
                            })}

                            {/* P&L labels — only when ≤ 12 trades */}
                            {wfN <= 12 && dayTrades.map((t, i) => {
                              if (playIndex >= 0 && i > playIndex) return null;
                              const cumPre  = fullEquitySeries[i];
                              const cumPost = fullEquitySeries[i + 1];
                              const yTop = wfY(Math.max(cumPre, cumPost));
                              const yBot = wfY(Math.min(cumPre, cumPost));
                              const colH = Math.max(4, yBot - yTop);
                              const cx   = wfColX(i) + wfColW / 2;
                              const green = t.pnl >= 0;
                              return (
                                <text key={`lbl-${t.id}`}
                                  x={cx}
                                  y={green ? yTop - 3 : yTop + colH + 10}
                                  textAnchor="middle" fontSize={9}
                                  fill={green ? "#5DCAA5" : "#F09595"}
                                  fontFamily="sans-serif">
                                  {(green ? "+$" : "−$") + Math.round(Math.abs(t.pnl))}
                                </text>
                              );
                            })}

                            {/* Time axis */}
                            {dayTrades.map((t, i) => (
                              <text key={`time-${t.id}`}
                                x={wfColX(i) + wfColW / 2}
                                y={WF_H - 6}
                                textAnchor="middle" fontSize={9} fill="#555"
                                fontFamily="sans-serif">
                                {t.opened_at ? timeLabel(t.opened_at) : String(i + 1)}
                              </text>
                            ))}
                          </svg>

                          {/* Final equity chip — top right */}
                          <div style={{
                            position: "absolute",
                            top: 12, right: 12,
                            padding: "3px 8px",
                            borderRadius: 7,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "sans-serif",
                            whiteSpace: "nowrap",
                            background: currentEquity >= 0
                              ? "rgba(93,202,165,0.14)"
                              : "rgba(240,149,149,0.14)",
                            border: `1px solid ${currentEquity >= 0
                              ? "rgba(93,202,165,0.35)"
                              : "rgba(240,149,149,0.35)"}`,
                            color: eqLineColor,
                          }}>
                            {fmtChip(currentEquity)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Playback controls */}
                  <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-4
                                  flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      {/* Reset */}
                      <button onClick={reset}
                        className="w-8 h-8 rounded-lg flex items-center justify-center
                                   text-zinc-500 hover:text-zinc-200 transition-colors"
                        style={{ border: "1px solid var(--cj-border)" }}
                        title="Reset">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/>
                        </svg>
                      </button>

                      {/* Play / Pause */}
                      <button
                        onClick={startPlay}
                        disabled={dayTrades.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                                   disabled:opacity-40 transition-all"
                        style={{
                          background: isPlaying ? "rgba(212,160,23,0.15)" : "rgba(212,160,23,0.9)",
                          color: isPlaying ? GOLD : "#0d0f14",
                          border: `1px solid ${GOLD}`,
                        }}
                      >
                        {isPlaying ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        )}
                        {isPlaying ? "Pause" : playIndex >= 0 ? "Resume" : "Play"}
                      </button>

                      {/* Progress */}
                      <span className="text-xs text-zinc-500">
                        {playIndex < 0 ? `${dayTrades.length} trades` : `${playIndex + 1} / ${dayTrades.length}`}
                      </span>
                    </div>

                    {/* Speed selector */}
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-zinc-600 mr-1">Speed</span>
                      {([0.5, 1, 2] as const).map(s => (
                        <button key={s}
                          onClick={() => setSpeed(s)}
                          className="text-xs px-2.5 py-1 rounded-lg transition-all"
                          style={{
                            background: speed === s ? "rgba(212,160,23,0.15)" : "transparent",
                            color: speed === s ? GOLD : "#71717a",
                            border: `1px solid ${speed === s ? "rgba(212,160,23,0.4)" : "var(--cj-border)"}`,
                          }}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Trade card (slides in when playing or trade selected) ─ */}
              {currentTrade && (
                <div
                  style={{
                    transform: "translateY(0)",
                    transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease",
                    opacity: 1,
                  }}
                >
                  <div className="bg-[var(--cj-surface)] border rounded-2xl p-5"
                    style={{ borderColor: currentTrade.pnl >= 0 ? "rgba(29,158,117,0.3)" : "rgba(226,75,74,0.3)" }}>
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-lg font-bold text-zinc-100">{currentTrade.pair}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md
                          ${currentTrade.direction === "BUY"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"}`}>
                          {currentTrade.direction}
                        </span>
                        <span className="text-[11px] px-2 py-1 rounded-lg text-zinc-400"
                          style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
                          {sessionTag}
                        </span>
                        {currentTrade.opened_at && (
                          <span className="text-xs text-zinc-500">{timeLabel(currentTrade.opened_at)} UTC</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-xl font-bold ${currentTrade.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmtPnl(currentTrade.pnl)}
                        </span>
                        <button
                          onClick={() => setDrillTrade(currentTrade)}
                          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                          style={{
                            background: "rgba(212,160,23,0.08)",
                            border: "1px solid rgba(212,160,23,0.2)",
                            color: GOLD,
                          }}
                        >
                          Full Analysis →
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {[
                        { label: "Lot",   value: String(currentTrade.lot) },
                        { label: "Entry", value: currentTrade.entry.toFixed(5) },
                        { label: "Exit",  value: currentTrade.exit_price.toFixed(5) },
                        { label: "Running P&L", value: fmtPnl(fullEquitySeries[Math.max(0, playIndex + 1)] ?? 0) },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-[var(--cj-raised)] rounded-xl p-3">
                          <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-0.5">{label}</div>
                          <div className="text-sm font-semibold text-zinc-200">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Trade list — click any row to drill down */}
              {dayTrades.length > 0 && (
                <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 mt-5">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
                    All Trades — click to analyse
                  </p>
                  <div className="space-y-2">
                    {dayTrades.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => { setPlayIndex(i); setDrillTrade(t); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
                        style={{
                          background: i === playIndex ? "rgba(212,160,23,0.06)" : "var(--cj-raised)",
                          border: `1px solid ${i === playIndex ? "rgba(212,160,23,0.25)" : "transparent"}`,
                        }}
                      >
                        <span className="text-xs text-zinc-500 w-5">{i + 1}</span>
                        <span className="font-semibold text-sm text-zinc-200 w-20">{t.pair}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                          ${t.direction === "BUY" ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"}`}>
                          {t.direction}
                        </span>
                        {t.opened_at && (
                          <span className="text-xs text-zinc-500">{timeLabel(t.opened_at)}</span>
                        )}
                        <span className="flex-1" />
                        <span className={`text-sm font-bold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmtPnl(t.pnl)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Drill-down modal */}
      {drillTrade && (
        <TradeDetailModal
          trade={drillTrade}
          allDayTrades={dayTrades}
          onClose={() => setDrillTrade(null)}
        />
      )}
    </div>
  );
}
