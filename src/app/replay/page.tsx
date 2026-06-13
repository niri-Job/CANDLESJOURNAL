"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { type ReplayTrade } from "@/components/TradeDetailModal";
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
  if (runningPnl < -50 && pnl < 0) return `Down $${Math.abs(runningPnl).toFixed(0)} before this — consider a daily loss limit.`;
  if (hitTP && !isRevenge && riskRatio <= 1.2) return `TP reached in ${session}. Clean entry, textbook execution.`;
  if (pnl > 0 && !isRevenge && !isOvertrade && riskRatio <= 1.2) return `Clean win in ${session}. No behavioral flags.`;
  if (pnl < 0 && !isRevenge && !isOvertrade) return `Standard loss in ${session}. No behavioral flags.`;
  return `Standard trade in ${session}. Review your entry trigger and risk context.`;
}

// Map broker symbols → TradingView symbols
function tvSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  const base = s.length > 5 && s.endsWith("M") ? s.slice(0, -1) : s;
  if (base === "XAUUSD") return "OANDA:XAUUSD";
  if (base === "XAGUSD") return "OANDA:XAGUSD";
  if (base === "BTCUSD"  || base === "BTCUSDT")  return "BINANCE:BTCUSDT";
  if (base === "ETHUSD"  || base === "ETHUSDT")  return "BINANCE:ETHUSDT";
  if (base === "BNBUSD"  || base === "BNBUSDT")  return "BINANCE:BNBUSDT";
  if (base === "XRPUSD"  || base === "XRPUSDT")  return "BINANCE:XRPUSDT";
  if (base === "US30"    || base === "DJ30")      return "FOREXCOM:US30";
  if (base.startsWith("NAS") || base === "US100") return "FOREXCOM:NAS100";
  if (base === "SPX500"  || base === "SP500" || base === "US500") return "FOREXCOM:SPX500";
  if (base.startsWith("DAX"))                     return "FOREXCOM:DEU30";
  if (base.startsWith("FTSE") || base === "UK100") return "FOREXCOM:UK100";
  if (base === "JPN225"  || base.includes("NIKKEI")) return "FOREXCOM:JPN225";
  if (base === "USOIL"   || base === "WTI")       return "NYMEX:CL1!";
  if (base === "UKOIL"   || base === "BRENT")     return "TVC:UKOIL";
  if (s.includes("/"))  return `FX:${s.replace("/", "")}`;
  if (base.length === 6) return `FX:${base}`;
  return base;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const GOLD        = "#D4A017";
const BG_PAGE     = "#0A0908";
const BG_PANEL    = "#111110";
const BORDER      = "1px solid rgba(255,255,255,0.06)";
const TV_ID       = "replay_tv_advanced";
const TV_SCRIPT   = "https://s3.tradingview.com/tv.js";

// ── Equity sparkline (Day tab) ────────────────────────────────────────────────
function EquityLine({ trades, w = 238, h = 60 }: { trades: ReplayTrade[]; w?: number; h?: number }) {
  if (trades.length === 0) return null;
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let cum = 0;
  trades.forEach((t, i) => { cum += t.pnl; pts.push({ x: i + 1, y: cum }); });
  const minY = Math.min(...pts.map(p => p.y));
  const maxY = Math.max(...pts.map(p => p.y));
  const rY   = Math.max(maxY - minY, 0.01);
  const rX   = pts.length - 1 || 1;
  const pad  = 4;
  const px   = (x: number) => pad + (x / rX) * (w - pad * 2);
  const py   = (y: number) => h - pad - ((y - minY) / rY) * (h - pad * 2);
  const d    = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");
  const color = cum >= 0 ? "#5DCAA5" : "#E24B4A";
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <line x1={pad} y1={py(0)} x2={w - pad} y2={py(0)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} strokeDasharray="3 3" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Stat row (right panel) ────────────────────────────────────────────────────
function StatRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: 11, color: "#71717a" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: warn ? "#f87171" : "#e4e4e7" }}>{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReplayPage() {
  const [user, setUser]                 = useState<User | null>(null);
  const [loading, setLoading]           = useState(true);
  const [trades, setTrades]             = useState<ReplayTrade[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [tradeIndex, setTradeIndex]     = useState(0);
  const [activeTab, setActiveTab]       = useState<"trade" | "day">("trade");
  const [tvInterval, setTvInterval]     = useState<"1" | "5" | "15" | "60">("5");

  const tvContainerRef = useRef<HTMLDivElement | null>(null);
  const tradeCountRef  = useRef(0);

  // ── Auth + fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user: u }, error }) => {
      if (error || !u) { window.location.href = "/login"; return; }
      setUser(u);
      const { data, error: dbErr } = await sb
        .from("trades").select("*")
        .eq("user_id", u.id).order("date", { ascending: false });
      if (dbErr) console.error("[replay]", dbErr.message);
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

  useEffect(() => { tradeCountRef.current = dayTrades.length; }, [dayTrades.length]);
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

  // ── TradingView Advanced Chart ────────────────────────────────────────────
  // Derive the trade date string (drives deps + from/to range)
  const tradeDateStr = selectedTrade?.date ?? selectedTrade?.opened_at?.slice(0, 10) ?? null;

  useEffect(() => {
    if (!selectedTrade || !tvContainerRef.current) return;
    const container = tvContainerRef.current;
    container.innerHTML = `<div id="${TV_ID}" style="height:100%;width:100%"></div>`;

    const symbol = tvSymbol(selectedTrade.pair);

    // Rewind chart to the trade date so history shows at the right time
    const dateTs = tradeDateStr
      ? Math.floor(new Date(tradeDateStr + "T00:00:00Z").getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 86400;
    const fromTs = dateTs - 3600;   // 1 h before day start
    const toTs   = dateTs + 86400;  // full trading day

    type TVWidgetInstance = {
      onChartReady: (cb: () => void) => void;
      chart: () => { setVisibleRange: (range: { from: number; to: number }) => void };
    };
    type TVLib = { widget: new (opts: object) => TVWidgetInstance };

    const init = () => {
      const TV = (window as unknown as { TradingView?: TVLib }).TradingView;
      if (!TV) return;
      const wgt = new TV.widget({
        autosize:          true,
        symbol,
        interval:          tvInterval,
        timezone:          "UTC",
        theme:             "dark",
        style:             "1",
        locale:            "en",
        toolbar_bg:        "#111110",
        enable_publishing: false,
        hide_top_toolbar:  false,
        hide_legend:       false,
        save_image:        false,
        container_id:      TV_ID,
        studies:           ["Volume@tv-basicstudies"],
        withdateranges:    true,
      });
      // Option A — navigate to trade date once chart is ready
      try {
        wgt.onChartReady(() => {
          try {
            wgt.chart().setVisibleRange({ from: fromTs, to: toTs });
          } catch { /* setVisibleRange not available on free embed */ }
        });
      } catch { /* onChartReady not available — free embed limitation */ }
    };

    if ((window as unknown as { TradingView?: TVLib }).TradingView) {
      init();
    } else {
      const existing = document.querySelector(`script[src="${TV_SCRIPT}"]`);
      if (!existing) {
        const s = document.createElement("script");
        s.src = TV_SCRIPT; s.async = true; s.onload = init;
        document.head.appendChild(s);
      } else {
        const poll = window.setInterval(() => {
          if ((window as unknown as { TradingView?: TVLib }).TradingView) { init(); window.clearInterval(poll); }
        }, 100);
        return () => window.clearInterval(poll);
      }
    }
  }, [selectedTrade?.pair, tradeDateStr, tvInterval]); // eslint-disable-line react-hooks/exhaustive-deps

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
      idx, runningPnl, isRevenge,
      isOvertrade:  dayTrades.length >= 4,
      riskRatio:    avgLot > 0 ? t.lot / avgLot : 1,
      sessionLabel: t.opened_at ? sessionFromHour(new Date(t.opened_at).getUTCHours()) : (t.session || "London"),
      dayCount:     dayTrades.length,
    };
  }, [selectedTrade, dayTrades]);

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

  // ── Execution timeline positions ──────────────────────────────────────────
  const execTimeline = useMemo(() => {
    const t = selectedTrade;
    if (!t?.opened_at) return null;
    const entryMs  = new Date(t.opened_at).getTime();
    const exitMs   = t.closed_at ? new Date(t.closed_at).getTime() : entryMs + 3600000;
    const spanMs   = Math.max(exitMs - entryMs, 600000); // min 10 min window
    const startMs  = entryMs - spanMs * 0.25;
    const totalMs  = (exitMs + spanMs * 0.25) - startMs;
    return {
      entryPct: ((entryMs - startMs) / totalMs) * 100,
      exitPct:  ((exitMs  - startMs) / totalMs) * 100,
    };
  }, [selectedTrade]);

  // ── NIRI Verdict ──────────────────────────────────────────────────────────
  const verdict = selectedTrade && behavCtx ? buildVerdict({
    isRevenge: behavCtx.isRevenge, isOvertrade: behavCtx.isOvertrade,
    session: behavCtx.sessionLabel, riskRatio: behavCtx.riskRatio,
    pnl: selectedTrade.pnl, runningPnl: behavCtx.runningPnl,
    tp: selectedTrade.tp, direction: selectedTrade.direction,
    exitPrice: selectedTrade.exit_price, dayCount: behavCtx.dayCount,
  }) : null;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height: "100dvh", background: BG_PAGE, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Sidebar user={null} onSignOut={() => {}} />
      <p style={{ color: "#52525b", fontSize: 13 }}>Loading…</p>
    </div>
  );

  function handleLogout() { createClient().auth.signOut().then(() => { window.location.href = "/login"; }); }

  const t = selectedTrade;
  const pnlColor = (n: number) => n >= 0 ? "#5DCAA5" : "#E24B4A";

  return (
    <div style={{ height: "100dvh", overflow: "hidden", background: BG_PAGE, display: "flex", flexDirection: "column" }}>
      <Sidebar user={user} onSignOut={handleLogout} />

      {/* ── 3-column flex container ──────────────────────────────────────── */}
      <div className="md:ml-[240px] pt-14 md:pt-0" style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ── LEFT PANEL (200px) ──────────────────────────────────────── */}
        <div style={{ width: 200, flexShrink: 0, borderRight: BORDER, background: BG_PANEL, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Date picker */}
          <div style={{ padding: "10px 10px 8px", borderBottom: BORDER, flexShrink: 0 }}>
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ width: "100%", background: "#1A1917", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, padding: "6px 8px", fontSize: 11, color: "#e4e4e7", outline: "none", cursor: "pointer" }}
            >
              {!tradeDays.length && <option value="">No trades</option>}
              {tradeDays.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Playback label */}
          <div style={{ padding: "7px 10px 3px", flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Playback</span>
          </div>

          {/* Trade list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {dayTrades.length === 0 ? (
              <div style={{ padding: "12px 10px", color: "#3f3f46", fontSize: 11 }}>No trades on this day.</div>
            ) : dayTrades.map((trade, idx) => {
              const isSel = tradeIndex === idx;
              const timeRange = trade.opened_at
                ? `${timeLabel(trade.opened_at)}${trade.closed_at ? ` – ${timeLabel(trade.closed_at)}` : ""}`
                : null;
              return (
                <div key={trade.id}>
                  {/* Trade row */}
                  <div
                    onClick={() => setTradeIndex(idx)}
                    style={{
                      padding: "9px 10px", cursor: "pointer",
                      background:  isSel ? "rgba(212,160,23,0.07)" : "transparent",
                      borderLeft: `2px solid ${isSel ? GOLD : "transparent"}`,
                      borderBottom: BORDER,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7" }}>{trade.pair}</span>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                          background: trade.direction === "BUY" ? "rgba(93,202,165,0.14)" : "rgba(240,149,149,0.14)",
                          color:      trade.direction === "BUY" ? "#5DCAA5" : "#F09595",
                        }}>{trade.direction}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pnlColor(trade.pnl) }}>{fmtPnl(trade.pnl)}</span>
                    </div>
                    {timeRange && <div style={{ fontSize: 9, color: "#52525b" }}>{timeRange}</div>}
                  </div>

                  {/* Execution rows (expanded when selected) */}
                  {isSel && (
                    <div style={{ background: "#0D0C0A", borderBottom: BORDER }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 4px 18px" }}>
                        <span style={{ fontSize: 8, color: GOLD, fontWeight: 700, width: 22, flexShrink: 0 }}>IN</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: "#e4e4e7", fontWeight: 600 }}>{fmtPrice(trade.entry)}</div>
                          {trade.opened_at && <div style={{ fontSize: 9, color: "#52525b" }}>{timeLabel(trade.opened_at)}</div>}
                        </div>
                        <span style={{ fontSize: 9, color: "#52525b", flexShrink: 0 }}>{trade.lot}L</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 6px 18px" }}>
                        <span style={{ fontSize: 8, fontWeight: 700, width: 22, flexShrink: 0, color: pnlColor(trade.pnl) }}>OUT</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: "#e4e4e7", fontWeight: 600 }}>{fmtPrice(trade.exit_price)}</div>
                          {trade.closed_at && <div style={{ fontSize: 9, color: "#52525b" }}>{timeLabel(trade.closed_at)}</div>}
                        </div>
                        <span style={{ fontSize: 9, color: "#52525b", flexShrink: 0 }}>{trade.lot}L</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CENTER PANEL (flex-1) ────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: BG_PAGE, overflow: "hidden" }}>

          {/* TradingView chart — fills all remaining height */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <div ref={tvContainerRef} style={{ width: "100%", height: "100%" }} />
            {!selectedTrade && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0C0A" }}>
                <span style={{ color: "#3f3f46", fontSize: 13 }}>Select a trade to load the chart</span>
              </div>
            )}
          </div>

          {/* ── Execution overlay (above timeframe bar) ───────────── */}
          {t && (
            <div style={{ flexShrink: 0, height: 32, borderTop: BORDER, background: BG_PANEL, position: "relative", overflow: "hidden" }}>
              {t.opened_at && execTimeline ? (
                <>
                  {/* Horizontal track */}
                  <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.05)", transform: "translateY(-50%)" }} />

                  {/* IN — vertical tick */}
                  <div style={{ position: "absolute", left: `${execTimeline.entryPct.toFixed(1)}%`, top: 0, height: "100%", width: 1, background: GOLD }} />
                  {/* IN — label to the right of tick */}
                  <div style={{ position: "absolute", left: `calc(${execTimeline.entryPct.toFixed(1)}% + 4px)`, top: 4, lineHeight: 1.3 }}>
                    <div style={{ fontSize: 8, color: GOLD, fontWeight: 700, whiteSpace: "nowrap" }}>IN {timeLabel(t.opened_at)}</div>
                    <div style={{ fontSize: 7, color: "#52525b", whiteSpace: "nowrap" }}>{fmtPrice(t.entry)}</div>
                  </div>

                  {/* OUT — vertical tick */}
                  {t.closed_at && (
                    <div style={{ position: "absolute", left: `${execTimeline.exitPct.toFixed(1)}%`, top: 0, height: "100%", width: 1, background: pnlColor(t.pnl) }} />
                  )}
                  {/* OUT — label to the left of tick */}
                  {t.closed_at && (
                    <div style={{ position: "absolute", right: `calc(${(100 - execTimeline.exitPct).toFixed(1)}% + 4px)`, top: 4, textAlign: "right", lineHeight: 1.3 }}>
                      <div style={{ fontSize: 8, color: pnlColor(t.pnl), fontWeight: 700, whiteSpace: "nowrap" }}>OUT {timeLabel(t.closed_at)}</div>
                      <div style={{ fontSize: 7, color: "#52525b", whiteSpace: "nowrap" }}>{fmtPrice(t.exit_price)}</div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", paddingLeft: 12 }}>
                  <span style={{ fontSize: 9, color: "#3f3f46", fontStyle: "italic" }}>CSV import — exact times unavailable</span>
                </div>
              )}
            </div>
          )}

          {/* ── Timeframe buttons ─────────────────────────────────────── */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderTop: BORDER, background: BG_PANEL }}>
            {(["1", "5", "15", "60"] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTvInterval(tf)}
                style={{
                  padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600,
                  background: tvInterval === tf ? GOLD : "transparent",
                  color:      tvInterval === tf ? BG_PAGE : "#52525b",
                  border:    `1px solid ${tvInterval === tf ? GOLD : "rgba(255,255,255,0.08)"}`,
                }}
              >
                {tf === "60" ? "1h" : `${tf}m`}
              </button>
            ))}
            {t?.pair && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#3f3f46" }}>
                {tvSymbol(t.pair)}
              </span>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL (280px) ─────────────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: BORDER, background: BG_PANEL, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header + tabs */}
          <div style={{ borderBottom: BORDER, padding: "10px 14px 0", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7", marginBottom: 8 }}>Journal</div>
            <div style={{ display: "flex" }}>
              {(["trade", "day"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: "transparent", border: "none",
                    borderBottom: activeTab === tab ? `2px solid ${GOLD}` : "2px solid transparent",
                    color: activeTab === tab ? GOLD : "#52525b",
                    textTransform: "capitalize",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>

            {/* ── TRADE TAB ──────────────────────────────────────────── */}
            {activeTab === "trade" && (
              <>
                {/* Navigation ◀ 1/3 ▶ */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <button
                    onClick={() => setTradeIndex(i => Math.max(0, i - 1))}
                    disabled={tradeIndex === 0}
                    style={{ padding: "3px 9px", background: "#1A1917", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: tradeIndex === 0 ? "#3f3f46" : "#e4e4e7", cursor: tradeIndex === 0 ? "not-allowed" : "pointer", fontSize: 12 }}
                  >◀</button>
                  <span style={{ fontSize: 11, color: "#52525b" }}>
                    {dayTrades.length ? `${tradeIndex + 1} / ${dayTrades.length}` : "—"}
                  </span>
                  <button
                    onClick={() => setTradeIndex(i => Math.min(tradeCountRef.current - 1, i + 1))}
                    disabled={tradeIndex >= dayTrades.length - 1}
                    style={{ padding: "3px 9px", background: "#1A1917", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: tradeIndex >= dayTrades.length - 1 ? "#3f3f46" : "#e4e4e7", cursor: tradeIndex >= dayTrades.length - 1 ? "not-allowed" : "pointer", fontSize: 12 }}
                  >▶</button>
                </div>

                {t ? (
                  <>
                    {/* Pair + P&L hero */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "#f4f4f5" }}>{t.pair}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: t.direction === "BUY" ? "rgba(93,202,165,0.15)" : "rgba(240,149,149,0.15)",
                          color:      t.direction === "BUY" ? "#5DCAA5" : "#F09595",
                        }}>{t.direction}</span>
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 800, color: pnlColor(t.pnl) }}>{fmtPnl(t.pnl)}</span>
                    </div>

                    {/* Stats sub-section */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 9, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Stats</div>
                      <StatRow label="Entry"       value={fmtPrice(t.entry)} />
                      <StatRow label="Exit"        value={fmtPrice(t.exit_price)} />
                      <StatRow label="Session"     value={behavCtx?.sessionLabel ?? t.session ?? "—"} />
                      <StatRow label="Hold Time"   value={holdDuration(t.opened_at, t.closed_at)} />
                      <StatRow label="Lot Size"    value={String(t.lot)} />
                      <StatRow label="Risk vs Avg" value={behavCtx ? `${(behavCtx.riskRatio * 100).toFixed(0)}%` : "—"} warn={(behavCtx?.riskRatio ?? 0) > 1.5} />
                      <StatRow label="Revenge"     value={behavCtx?.isRevenge ? "Yes" : "No"} warn={behavCtx?.isRevenge} />
                      <StatRow label="Overtrading" value={behavCtx?.isOvertrade ? `Yes (${behavCtx.dayCount}t)` : "No"} warn={behavCtx?.isOvertrade} />
                      <StatRow label="Running P&L" value={behavCtx ? `${behavCtx.runningPnl >= 0 ? "+" : ""}$${Math.abs(behavCtx.runningPnl).toFixed(2)}` : "—"} warn={(behavCtx?.runningPnl ?? 0) < -20} />
                    </div>

                    {/* NIRI Verdict */}
                    {verdict && (
                      <div style={{ padding: "10px 12px", background: "rgba(212,160,23,0.06)", border: "1px solid rgba(212,160,23,0.18)", borderRadius: 8 }}>
                        <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>NIRI Verdict</div>
                        <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.55 }}>{verdict}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", paddingTop: 24 }}>No trade selected</div>
                )}
              </>
            )}

            {/* ── DAY TAB ────────────────────────────────────────────── */}
            {activeTab === "day" && (
              <>
                {dayStats ? (
                  <>
                    {/* Day P&L hero */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 9, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Day P&L</div>
                      <span style={{ fontSize: 22, fontWeight: 800, color: pnlColor(dayStats.pnl) }}>{fmtPnl(dayStats.pnl)}</span>
                    </div>

                    <StatRow label="Trades"        value={String(dayStats.total)} />
                    <StatRow label="Win Rate"      value={`${dayStats.winRate.toFixed(0)}%`} />
                    <StatRow label="Sessions"      value={dayStats.sessions.join(", ")} />
                    <StatRow label="Overtrading"   value={dayStats.isOvertrade ? `Yes (${dayStats.total}t)` : "No"} warn={dayStats.isOvertrade} />
                    <StatRow label="Revenge Trades" value={dayStats.revengeCount > 0 ? String(dayStats.revengeCount) : "None"} warn={dayStats.revengeCount > 0} />

                    {/* Session equity sparkline */}
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 9, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Session Equity</div>
                      <EquityLine trades={dayTrades} w={238} h={60} />
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", paddingTop: 24 }}>No trades for this day</div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
