"use client";

import { useMemo } from "react";
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

  // 1 — No Overtrading (25 pts): penalise days with > 3 trades
  const byDay: Record<string, number> = {};
  for (const t of trades) byDay[t.date] = (byDay[t.date] || 0) + 1;
  const tradingDays  = Object.keys(byDay).length;
  const overtradeDays = Object.values(byDay).filter((c) => c > 3).length;
  const overtradeScore = Math.round(25 * Math.max(0, 1 - overtradeDays / Math.max(tradingDays, 1)));

  // 2 — No Revenge Trading (25 pts): loss on same pair same day as prior loss
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

  // 3 — Risk Consistency (25 pts): low coefficient of variation in lot sizes
  const lots  = trades.map((t) => t.lot);
  const avg   = lots.reduce((s, l) => s + l, 0) / lots.length;
  const stdDev = Math.sqrt(lots.reduce((s, l) => s + (l - avg) ** 2, 0) / lots.length);
  const cv    = avg > 0 ? stdDev / avg : 0;
  const riskScore = Math.round(25 * Math.max(0, 1 - Math.min(cv * 1.5, 1)));

  // 4 — TP Discipline (25 pts): of trades with TP set, what % actually reached it?
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
    : 18; // not enough data → neutral

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
function scoreLabel(n: number) {
  if (n >= 80) return "A";
  if (n >= 65) return "B";
  if (n >= 50) return "C";
  return "D";
}

function Gauge({ score }: { score: number }) {
  const r  = 48;
  const cx = 2 * Math.PI * r;
  const offset = cx * (1 - score / 100);
  const col = scoreColor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
      <svg width="128" height="128" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="#1e1e2e" strokeWidth="10" />
        <circle
          cx="64" cy="64" r={r} fill="none"
          stroke={col} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={cx} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-2xl font-bold font-mono leading-none" style={{ color: col }}>{score}</span>
        <span className="text-[10px] text-zinc-600 leading-none">/ 100</span>
        <span className="text-xs font-bold mt-0.5" style={{ color: col }}>{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

function WeekTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-500 mb-0.5">{label}</p>
      <p className="font-mono font-semibold" style={{ color: scoreColor(payload[0].value) }}>
        {payload[0].value}/100
      </p>
    </div>
  );
}

export function DisciplineScore({ trades }: { trades: Trade[] }) {
  const result = useMemo(() => {
    const main = computeComponents(trades);

    // Weekly trend — last 8 completed weeks
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

  const col = scoreColor(result.total);

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-5">
        Discipline Score
      </p>

      <div className="flex flex-col sm:flex-row gap-6 items-start">

        {/* Gauge */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <Gauge score={result.total} />
          <p className="text-[11px] text-zinc-600 text-center">
            {result.total >= 80
              ? "Excellent discipline"
              : result.total >= 50
              ? "Needs improvement"
              : "Poor discipline"}
          </p>
        </div>

        {/* Breakdown */}
        <div className="flex-1 space-y-3 w-full">
          {result.components.map((c) => (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-400 font-medium">{c.label}</span>
                <span className="text-xs font-mono font-semibold" style={{ color: scoreColor((c.score / c.max) * 100) }}>
                  {c.score}/{c.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(c.score / c.max) * 100}%`,
                    background: scoreColor((c.score / c.max) * 100),
                  }}
                />
              </div>
              {c.issue && (
                <p className="text-[10px] text-rose-400/80 mt-0.5">{c.issue}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly trend */}
      {result.weekly.length >= 2 && (
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
