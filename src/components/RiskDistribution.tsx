"use client";

import { useMemo, useState, useEffect } from "react";

interface Trade {
  pair: string;
  direction: string;
  lot: number;
  pnl: number;
  sl: number | null;
  entry: number;
}

const ROSE_COLORS = ["#D4A017", "#534AB7", "#AFA9EC", "#CDC9F2"];

function petalPath(
  cx: number, cy: number,
  r_inner: number, r_outer: number,
  a1: number, a2: number,
): string {
  const spanDeg = (a2 - a1) * 180 / Math.PI;
  const la = spanDeg > 180 ? 1 : 0;
  const ox1 = cx + r_outer * Math.cos(a1), oy1 = cy + r_outer * Math.sin(a1);
  const ox2 = cx + r_outer * Math.cos(a2), oy2 = cy + r_outer * Math.sin(a2);
  const ix1 = cx + r_inner * Math.cos(a1), iy1 = cy + r_inner * Math.sin(a1);
  const ix2 = cx + r_inner * Math.cos(a2), iy2 = cy + r_inner * Math.sin(a2);
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${r_outer.toFixed(2)} ${r_outer.toFixed(2)} 0 ${la} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    `A ${r_inner} ${r_inner} 0 ${la} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function NightingaleRose({
  data,
}: {
  data: { pair: string; count: number; pct: number; pnl: number }[];
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (data.length === 0) return null;

  const CX = 130, CY = 130, R_HUB = 36, R_MAX = 92;
  const total = data.reduce((s, d) => s + d.count, 0);
  const maxCount = data[0].count;

  let accDeg = -90;
  const petals = data.map((d, i) => {
    const spanDeg = Math.max(4, (d.count / total) * 360 - 2.5);
    const r_outer = Math.max(42, Math.sqrt(d.count / maxCount) * R_MAX);
    const a1 = (accDeg * Math.PI) / 180;
    const a2 = ((accDeg + spanDeg) * Math.PI) / 180;
    const midRad = ((accDeg + spanDeg / 2) * Math.PI) / 180;
    accDeg += spanDeg + 2.5;
    const labelR = r_outer + 13;
    return {
      path: petalPath(CX, CY, R_HUB, r_outer, a1, a2),
      labelX: CX + labelR * Math.cos(midRad),
      labelY: CY + labelR * Math.sin(midRad),
      pct: d.pct,
      color: ROSE_COLORS[Math.min(i, ROSE_COLORS.length - 1)],
      spanDeg,
    };
  });

  return (
    <div style={{ maxWidth: "100%" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
      <svg viewBox="0 0 260 260" width={176} height={176} style={{ display: "block" }}>
        {[52, 72, 92].map(r => (
          <circle key={r} cx={CX} cy={CY} r={r}
            fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        ))}

        {petals.map((p, i) => (
          <g key={i} style={{
            transformOrigin: `${CX}px ${CY}px`,
            transformBox: "view-box",
            transform: animated ? "scale(1)" : "scale(0)",
            transition: `transform 0.9s cubic-bezier(0.16,1,0.3,1) ${i * 120}ms`,
          } as React.CSSProperties}>
            <path d={p.path} fill={p.color} fillOpacity={0.85} />
          </g>
        ))}

        {petals.filter(p => p.spanDeg > 18).map((p, i) => (
          <text key={i}
            x={p.labelX.toFixed(1)} y={p.labelY.toFixed(1)}
            textAnchor="middle" dominantBaseline="central"
            fontSize={9} fill="#a1a1aa" fontFamily="sans-serif">
            {p.pct}%
          </text>
        ))}

        <circle cx={CX} cy={CY} r={R_HUB}
          fill="#0d0f14" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <text x={CX} y={CY - 5} textAnchor="middle" fontSize={20}
          fill="#e4e4e7" fontFamily="sans-serif" fontWeight="700">
          {total}
        </text>
        <text x={CX} y={CY + 11} textAnchor="middle" fontSize={8}
          fill="#71717a" fontFamily="sans-serif" letterSpacing="1">
          TRADES
        </text>
      </svg>
      </div>

      {/* Legend — stacked below the rose, full column width */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
        {data.slice(0, 6).map((d, i) => {
          const color = ROSE_COLORS[Math.min(i, ROSE_COLORS.length - 1)];
          const pnlPos = d.pnl >= 0;
          return (
            <div key={d.pair} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{
                display: "inline-block", width: 10, height: 10, flexShrink: 0,
                borderRadius: 3, background: color,
              }} />
              <span style={{
                fontSize: 13, fontWeight: 500, color: "#1A1916",
                fontFamily: "monospace",
                width: 58, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {d.pair}
              </span>
              <span style={{ fontSize: 12, color: "#5F5E5A", flexShrink: 0, minWidth: 28 }}>
                {d.pct}%
              </span>
              <div style={{
                padding: "1px 6px", borderRadius: 100, fontSize: 10, fontWeight: 600, flexShrink: 0,
                background: pnlPos ? "#E8F4EE" : "#FCEBE8",
                color: pnlPos ? "#0F6E56" : "#A32D2D",
              }}>
                {pnlPos ? "+$" : "-$"}{Math.abs(d.pnl).toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RiskDistribution({ trades }: { trades: Trade[] }) {
  const stats = useMemo(() => {
    if (trades.length === 0) return null;

    const pairCount: Record<string, number> = {};
    const pairPnl: Record<string, number>   = {};
    for (const t of trades) {
      pairCount[t.pair] = (pairCount[t.pair] || 0) + 1;
      pairPnl[t.pair]   = parseFloat(((pairPnl[t.pair] || 0) + t.pnl).toFixed(2));
    }
    const pairData = Object.entries(pairCount)
      .sort(([, a], [, b]) => b - a)
      .map(([pair, count]) => ({
        pair, count,
        pct: Math.round((count / trades.length) * 100),
        pnl: pairPnl[pair],
      }));

    const buys  = trades.filter((t) => t.direction === "BUY").length;
    const sells = trades.length - buys;

    const lots   = trades.map((t) => t.lot);
    const avgLot = lots.reduce((a, b) => a + b, 0) / lots.length;
    const minLot = Math.min(...lots);
    const maxLot = Math.max(...lots);

    const pairsSorted = Object.entries(pairPnl).sort(([, a], [, b]) => b - a);
    const bestPair  = pairsSorted[0]  ?? null;
    const worstPair = pairsSorted[pairsSorted.length - 1] ?? null;

    const forexWithSl = trades.filter((t) => {
      if (t.sl == null) return false;
      const s = t.pair.toUpperCase();
      const isNonForex = ["XAU","XAG","BTC","ETH","XRP","LTC","US30","NAS","SPX","DAX","OIL","BRENT"].some((k) => s.includes(k));
      return !isNonForex;
    });
    const risked = forexWithSl.map((t) => Math.abs(t.entry - t.sl!) * 10000);
    const avgPipsRisked = risked.length > 0
      ? risked.reduce((a, b) => a + b) / risked.length
      : null;

    return { pairData, buys, sells, avgLot, minLot, maxLot, bestPair, worstPair, avgPipsRisked };
  }, [trades]);

  if (!stats) {
    return (
      <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
        <p className="card-label mb-3">Risk & Distribution</p>
        <div className="text-center py-8 text-zinc-600 text-sm">No trades yet</div>
      </div>
    );
  }

  const fmt = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
      <p className="card-label mb-5">Risk & Distribution</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── Pair distribution — Nightingale Rose ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
              Pair Distribution
            </p>
            <p className="text-[11px] text-zinc-600">last 30 days</p>
          </div>
          <NightingaleRose data={stats.pairData} />
        </div>

        {/* ── Direction + lot size ── */}
        <div className="space-y-5">
          <div>
            <p className="text-[13px] uppercase tracking-widest text-zinc-600 mb-2">Direction Split</p>
            <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-emerald-500/70 transition-all"
                style={{ width: `${(stats.buys / trades.length) * 100}%` }}
              />
              <div className="flex-1 bg-rose-500/70" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-emerald-400">▲ {stats.buys} BUY ({Math.round((stats.buys / trades.length) * 100)}%)</span>
              <span className="text-rose-400">▼ {stats.sells} SELL ({Math.round((stats.sells / trades.length) * 100)}%)</span>
            </div>
          </div>

          <div>
            <p className="text-[13px] uppercase tracking-widest text-zinc-600 mb-2">Lot Size</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Avg", value: stats.avgLot.toFixed(2) },
                { label: "Min", value: stats.minLot.toFixed(2) },
                { label: "Max", value: stats.maxLot.toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-2.5 text-center">
                  <p className="text-[13px] text-zinc-600">{label}</p>
                  <p className="font-sans text-sm font-semibold text-zinc-300 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {stats.avgPipsRisked !== null && (
            <div>
              <p className="text-[13px] uppercase tracking-widest text-zinc-600 mb-1">Avg Pips Risked</p>
              <p className="font-sans text-sm font-semibold text-zinc-300">{stats.avgPipsRisked.toFixed(1)} pips</p>
            </div>
          )}
        </div>

        {/* ── Best / worst pair ── */}
        <div className="space-y-3">
          {stats.bestPair && (
            <div>
              <p className="text-[13px] uppercase tracking-widest text-zinc-600 mb-2">Best Pair</p>
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                <p className="font-sans text-sm font-semibold text-zinc-100">{stats.bestPair[0]}</p>
                <p className="text-sm font-sans text-emerald-400 mt-0.5">{fmt(stats.bestPair[1])}</p>
              </div>
            </div>
          )}
          {stats.worstPair && stats.bestPair && stats.worstPair[0] !== stats.bestPair[0] && (
            <div>
              <p className="text-[13px] uppercase tracking-widest text-zinc-600 mb-2">Worst Pair</p>
              <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-3">
                <p className="font-sans text-sm font-semibold text-zinc-100">{stats.worstPair[0]}</p>
                <p className="text-sm font-sans text-rose-400 mt-0.5">{fmt(stats.worstPair[1])}</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
