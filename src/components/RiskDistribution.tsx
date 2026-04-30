"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PAIR_COLORS = [
  "#F5C518","#C9A227","#E8A020","#F0B030","#D4960A",
  "#A87820","#F7CE40","#BF8E18","#E8B840","#CB9C22",
];

interface Trade {
  pair: string;
  direction: string;
  lot: number;
  pnl: number;
  sl: number | null;
  entry: number;
}

export function RiskDistribution({ trades }: { trades: Trade[] }) {
  const stats = useMemo(() => {
    if (trades.length === 0) return null;

    // Pair distribution
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

    const risked = trades
      .filter((t) => t.sl != null)
      .map((t) => Math.abs(t.entry - t.sl!) * 10000);
    const avgPipsRisked = risked.length > 0
      ? risked.reduce((a, b) => a + b) / risked.length
      : null;

    return { pairData, buys, sells, avgLot, minLot, maxLot, bestPair, worstPair, avgPipsRisked };
  }, [trades]);

  if (!stats) {
    return (
      <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Risk & Distribution</p>
        <div className="text-center py-8 text-zinc-600 text-sm">No trades yet</div>
      </div>
    );
  }

  const fmt = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-5">Risk & Distribution</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── Pair distribution donut ── */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">Pair Distribution</p>
          <div className="flex items-center gap-4">
            <div style={{ width: 96, height: 96, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pairData}
                    dataKey="count"
                    nameKey="pair"
                    cx="50%" cy="50%"
                    innerRadius={26} outerRadius={44}
                    paddingAngle={2}
                  >
                    {stats.pairData.map((_, i) => (
                      <Cell key={i} fill={PAIR_COLORS[i % PAIR_COLORS.length]} fillOpacity={0.85} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
                          <p className="font-mono font-semibold text-zinc-200">{payload[0].payload.pair}</p>
                          <p className="text-zinc-400">{payload[0].payload.count} trades · {payload[0].payload.pct}%</p>
                        </div>
                      ) : null
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 min-w-0">
              {stats.pairData.slice(0, 5).map((p, i) => (
                <div key={p.pair} className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PAIR_COLORS[i % PAIR_COLORS.length] }} />
                  <span className="font-mono text-zinc-300 truncate">{p.pair}</span>
                  <span className="text-zinc-600 ml-auto shrink-0">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Direction + lot size ── */}
        <div className="space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Direction Split</p>
            <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-emerald-500/70 transition-all"
                style={{ width: `${(stats.buys / trades.length) * 100}%` }}
              />
              <div className="flex-1 bg-rose-500/70" />
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-emerald-400">▲ {stats.buys} BUY ({Math.round((stats.buys / trades.length) * 100)}%)</span>
              <span className="text-rose-400">▼ {stats.sells} SELL ({Math.round((stats.sells / trades.length) * 100)}%)</span>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Lot Size</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Avg", value: stats.avgLot.toFixed(2) },
                { label: "Min", value: stats.minLot.toFixed(2) },
                { label: "Max", value: stats.maxLot.toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[var(--cj-raised)] rounded-lg p-2.5 text-center">
                  <p className="text-[9px] text-zinc-600">{label}</p>
                  <p className="font-mono text-xs font-semibold text-zinc-300 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {stats.avgPipsRisked !== null && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Avg Pips Risked</p>
              <p className="font-mono text-sm font-semibold text-zinc-300">{stats.avgPipsRisked.toFixed(1)} pips</p>
            </div>
          )}
        </div>

        {/* ── Best / worst pair ── */}
        <div className="space-y-3">
          {stats.bestPair && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Best Pair</p>
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                <p className="font-mono text-sm font-semibold text-zinc-100">{stats.bestPair[0]}</p>
                <p className="text-xs font-mono text-emerald-400 mt-0.5">{fmt(stats.bestPair[1])}</p>
              </div>
            </div>
          )}
          {stats.worstPair && stats.bestPair && stats.worstPair[0] !== stats.bestPair[0] && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Worst Pair</p>
              <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-3">
                <p className="font-mono text-sm font-semibold text-zinc-100">{stats.worstPair[0]}</p>
                <p className="text-xs font-mono text-rose-400 mt-0.5">{fmt(stats.worstPair[1])}</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
