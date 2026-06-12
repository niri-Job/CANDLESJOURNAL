"use client";

import { useMemo, useState, useEffect } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

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
}

interface Component {
  label: string;
  score: number;
  max: number;
  issue: string | null;
}

function computeComponents(trades: Trade[]): { total: number; components: Component[] } {
  if (trades.length === 0) return { total: 0, components: [] };

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  const byDay: Record<string, number> = {};
  for (const t of trades) byDay[t.date] = (byDay[t.date] || 0) + 1;
  const tradingDays   = Object.keys(byDay).length;
  const overtradeDays = Object.values(byDay).filter((c) => c > 3).length;
  const overtradeScore = Math.round(25 * Math.max(0, 1 - overtradeDays / Math.max(tradingDays, 1)));

  const dayPairHadLoss: Record<string, Set<string>> = {};
  let revengeCount = 0;
  for (const t of sorted) {
    if (!dayPairHadLoss[t.date]) dayPairHadLoss[t.date] = new Set();
    if (dayPairHadLoss[t.date].has(t.pair) && t.pnl < 0) revengeCount++;
    if (t.pnl < 0) dayPairHadLoss[t.date].add(t.pair);
  }
  const revengeScore = Math.round(
    25 * Math.max(0, 1 - Math.min(1, revengeCount / Math.max(trades.length * 0.15, 1)))
  );

  const lots   = trades.map((t) => t.lot);
  const avg    = lots.reduce((s, l) => s + l, 0) / lots.length;
  const stdDev = Math.sqrt(lots.reduce((s, l) => s + (l - avg) ** 2, 0) / lots.length);
  const cv     = avg > 0 ? stdDev / avg : 0;
  const riskScore = Math.round(25 * Math.max(0, 1 - Math.min(cv * 1.5, 1)));

  const withTp = trades.filter((t) => t.tp !== null && t.tp !== 0);
  let tpHit = 0;
  for (const t of withTp) {
    if (!t.tp) continue;
    const reached = t.direction === "BUY"
      ? t.exit_price >= t.tp * 0.998
      : t.exit_price <= t.tp * 1.002;
    if (reached) tpHit++;
  }
  const tpScore = withTp.length >= 3
    ? Math.round(25 * (tpHit / withTp.length))
    : 18;

  const total = Math.min(100, overtradeScore + revengeScore + riskScore + tpScore);

  return {
    total,
    components: [
      {
        label: "No Overtrading",
        score: overtradeScore,
        max: 25,
        issue: overtradeDays > 0
          ? `${overtradeDays} day${overtradeDays > 1 ? "s" : ""} with 4+ trades`
          : null,
      },
      {
        label: "No Revenge Trading",
        score: revengeScore,
        max: 25,
        issue: revengeCount > 0
          ? `${revengeCount} likely revenge trade${revengeCount > 1 ? "s" : ""} detected`
          : null,
      },
      {
        label: "Risk Consistency",
        score: riskScore,
        max: 25,
        issue: cv > 0.3 ? `Lot size variance: ${(cv * 100).toFixed(0)}% CV` : null,
      },
      {
        label: "TP Discipline",
        score: tpScore,
        max: 25,
        issue:
          withTp.length >= 3 && tpScore < 18
            ? `Only ${tpHit}/${withTp.length} trades reached TP`
            : null,
      },
    ],
  };
}

function scoreColor(n: number) {
  if (n >= 80) return "#34d399";
  if (n >= 50) return "#F5C518";
  return "#f87171";
}

function Speedometer({ score }: { score: number }) {
  const [live, setLive] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLive(score));
    return () => cancelAnimationFrame(id);
  }, [score]);

  // Needle shortened to 65% of arc radius (r=70 → nLen=46)
  // viewBox taller (130) to give room for score below the pivot
  const cx = 90, cy = 82, r = 70, sw = 12, nLen = 46;

  function pt(s: number): [number, number] {
    const a = Math.PI * (1 - s / 100);
    return [+(cx + r * Math.cos(a)).toFixed(2), +(cy - r * Math.sin(a)).toFixed(2)];
  }

  function arc(s1: number, s2: number): string {
    const [x1, y1] = pt(s1);
    const [x2, y2] = pt(s2);
    if (Math.abs(s1 - s2) >= 100) {
      const [xm, ym] = pt(50);
      return `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${xm} ${ym} A ${r} ${r} 0 0 0 ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`;
  }

  const deg = live * 1.8;
  const col = scoreColor(score);
  const [lx, ly] = pt(0);
  const [rx, ry] = pt(100);

  return (
    // viewBox extended to 130 so the score label below the pivot is fully visible
    <svg viewBox="0 0 180 130" width={180} height={130} style={{ display: "block", overflow: "visible" }}>
      <path d={arc(100, 0)}  fill="none" stroke="#1a1a2e" strokeWidth={sw} strokeLinecap="butt" />
      <path d={arc(100, 67)} fill="none" stroke="#5DCAA5" strokeWidth={sw} strokeLinecap="butt" />
      <path d={arc(67, 33)}  fill="none" stroke="#FAC775" strokeWidth={sw} strokeLinecap="butt" />
      <path d={arc(33,  0)}  fill="none" stroke="#E24B4A" strokeWidth={sw} strokeLinecap="butt" />
      <g style={{
        transform: `rotate(${deg}deg)`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: "transform 1.2s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <line x1={cx} y1={cy} x2={cx - nLen} y2={cy}
              stroke="#C8C2B8" strokeWidth={2.5} strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r={5} fill="#1A1916" />
      {/* Scale labels */}
      <text x={lx - 2} y={ly + 14} textAnchor="middle" fontSize={8} fill="#52525b">0</text>
      <text x={rx + 2} y={ry + 14} textAnchor="middle" fontSize={8} fill="#52525b">100</text>
      {/* Score number — well below the pivot so the needle never sweeps over it */}
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize={26} fontWeight="700"
            fontFamily="sans-serif" fill={col}>{score}</text>
    </svg>
  );
}

function WeekTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-500 mb-0.5">{label}</p>
      <p className="font-sans font-semibold" style={{ color: scoreColor(payload[0].value) }}>
        {payload[0].value}/100
      </p>
    </div>
  );
}

export function DisciplineScore({ trades, hideTrend }: { trades: Trade[]; hideTrend?: boolean }) {
  const result = useMemo(() => {
    const main = computeComponents(trades);

    const now = new Date();
    const weekly: { week: string; score: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const wStart = new Date(now);
      wStart.setDate(now.getDate() - (w + 1) * 7);
      wStart.setHours(0, 0, 0, 0);
      const wEnd = new Date(now);
      wEnd.setDate(now.getDate() - w * 7);
      wEnd.setHours(23, 59, 59, 999);
      const wStartStr = wStart.toISOString().slice(0, 10);
      const wEndStr   = wEnd.toISOString().slice(0, 10);
      const wt = trades.filter((t) => t.date >= wStartStr && t.date <= wEndStr);
      if (wt.length === 0) continue;
      const { total } = computeComponents(wt);
      weekly.push({
        week: wStart.toLocaleString("default", { month: "short", day: "numeric" }),
        score: total,
      });
    }

    return { ...main, weekly };
  }, [trades]);

  if (trades.length < 3) {
    return (
      <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
          Discipline Score
        </p>
        <p className="text-sm text-zinc-600">Add at least 3 trades to see your discipline score.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-5">
        Discipline Score
      </p>

      <div className="flex flex-col items-center gap-4">

        {/* Speedometer centered */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <Speedometer score={result.total} />
          <p className="text-[11px] text-zinc-600 text-center -mt-1">
            {result.total >= 80
              ? "Excellent discipline"
              : result.total >= 50
              ? "Needs improvement"
              : "Poor discipline"}
          </p>
        </div>

        {/* Battery bars — label left (140px), 5 cells right */}
        <div className="w-full space-y-3">
          {result.components.map((c) => {
            const pct    = (c.score / c.max) * 100;
            const fill   = pct >= 72 ? "#34d399" : pct >= 36 ? "#F5C518" : "#f87171";
            const filled = Math.round((c.score / c.max) * 5);
            return (
              <div key={c.label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#a1a1aa" }}>{c.label}</span>
                    {c.issue && (
                      <p style={{ fontSize: 11, color: "rgba(251,113,133,0.85)", marginTop: 2, lineHeight: 1.3 }}>
                        {c.issue}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{
                        width: 14, height: 10, borderRadius: 3, flexShrink: 0,
                        background: i < filled ? fill : "rgba(255,255,255,0.06)",
                        transition: `background 0.3s ease ${i * 0.08}s`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly trend — hidden on dashboard via hideTrend prop */}
      {!hideTrend && result.weekly.length >= 2 && (
        <div className="mt-6 pt-5 border-t border-zinc-800">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">Weekly Trend</p>
          <div style={{ height: 72 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={result.weekly} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barSize={18}>
                <XAxis
                  dataKey="week"
                  tick={{ fill: "#52525b", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<WeekTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                  {result.weekly.map((entry, i) => (
                    <Cell key={i} fill={scoreColor(entry.score)} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 mt-3">
            {[
              { range: "80–100", label: "Excellent", col: "#34d399" },
              { range: "50–79",  label: "Fair",      col: "#F5C518" },
              { range: "0–49",   label: "Poor",      col: "#f87171" },
            ].map((b) => (
              <div key={b.range} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.col }} />
                <span className="text-[9px] text-zinc-600">{b.range} — {b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
