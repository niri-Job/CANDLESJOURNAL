"use client";

import { useMemo, useEffect, useState } from "react";

interface Trade {
  pnl: number;
  date: string;
}

interface BadgeInfo {
  min: number;
  max: number;
  icon: string;
  name: string;
  color: string;
  tagline: string;
}

const BADGES: BadgeInfo[] = [
  { min: 0,  max: 30,  icon: "🥉", name: "Bronze Trader",  color: "text-amber-500",  tagline: "Keep pushing"        },
  { min: 31, max: 50,  icon: "🥈", name: "Silver Trader",  color: "text-zinc-300",   tagline: "Getting consistent"  },
  { min: 51, max: 70,  icon: "🥇", name: "Gold Trader",    color: "text-[#F5C518]",  tagline: "Strong performance"  },
  { min: 71, max: 85,  icon: "💎", name: "Diamond Trader", color: "text-[#F5C518]",  tagline: "Elite level"         },
  { min: 86, max: 100, icon: "👑", name: "Legend",          color: "text-[#F5C518]",  tagline: "Top 1% trader"       },
];

function getBadge(score: number): BadgeInfo {
  return BADGES.find((b) => score >= b.min && score <= b.max) ?? BADGES[0];
}

function getNextBadge(score: number): BadgeInfo | null {
  const idx = BADGES.findIndex((b) => score >= b.min && score <= b.max);
  return idx >= 0 && idx < BADGES.length - 1 ? BADGES[idx + 1] : null;
}

export function PerformanceBadge({ trades }: { trades: Trade[] }) {
  const [animatedScore, setAnimatedScore] = useState(0);

  const { score, breakdown } = useMemo(() => {
    if (trades.length === 0) {
      return {
        score: 0,
        breakdown: { winRate: 0, profitFactor: 0, consistency: 0, riskManagement: 0, tradeCount: 0 },
      };
    }

    const wins = trades.filter((t) => t.pnl > 0).length;
    const winRatePct = (wins / trades.length) * 100;
    const winRateScore = Math.min(30, (winRatePct / 60) * 30);

    const grossWin = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3 : 1;
    const pfScore = Math.min(25, Math.max(0, (pf - 1.0) * 25));

    const now = new Date();
    const weeksWithTrades = new Set<string>();
    for (const t of trades) {
      const d = new Date(t.date);
      const msAgo = now.getTime() - d.getTime();
      const weeksAgo = msAgo / (7 * 24 * 60 * 60 * 1000);
      if (weeksAgo >= 0 && weeksAgo < 12) {
        const monday = new Date(d);
        monday.setDate(monday.getDate() - monday.getDay());
        weeksWithTrades.add(monday.toISOString().split("T")[0]);
      }
    }
    const consistencyScore = Math.min(20, (weeksWithTrades.size / 12) * 20);

    const winTrades = trades.filter((t) => t.pnl > 0);
    const lossTrades = trades.filter((t) => t.pnl < 0);
    let rrScore = 0;
    if (winTrades.length > 0 && lossTrades.length > 0) {
      const avgWin = winTrades.reduce((s, t) => s + t.pnl, 0) / winTrades.length;
      const avgLoss = Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0) / lossTrades.length);
      const rr = avgLoss > 0 ? avgWin / avgLoss : 1;
      rrScore = Math.min(15, (rr / 2.0) * 15);
    }

    const tradeCountScore = Math.min(10, (trades.length / 50) * 10);
    const total = Math.round(winRateScore + pfScore + consistencyScore + rrScore + tradeCountScore);
    return {
      score: total,
      breakdown: {
        winRate: Math.round(winRateScore),
        profitFactor: Math.round(pfScore),
        consistency: Math.round(consistencyScore),
        riskManagement: Math.round(rrScore),
        tradeCount: Math.round(tradeCountScore),
      },
    };
  }, [trades]);

  useEffect(() => {
    const t = setTimeout(() => setAnimatedScore(score), 150);
    return () => clearTimeout(t);
  }, [score]);

  const badge    = getBadge(score);
  const nextBadge = getNextBadge(score);

  const RADIUS      = 44;
  const STROKE      = 6;
  const SIZE        = (RADIUS + STROKE) * 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset  = CIRCUMFERENCE - (animatedScore / 100) * CIRCUMFERENCE;

  const breakdownItems = [
    { label: "Win Rate",      pts: breakdown.winRate,        max: 30 },
    { label: "Profit Factor", pts: breakdown.profitFactor,   max: 25 },
    { label: "Consistency",   pts: breakdown.consistency,    max: 20 },
    { label: "Risk Mgmt",     pts: breakdown.riskManagement, max: 15 },
    { label: "Trade Count",   pts: breakdown.tradeCount,     max: 10 },
  ];

  return (
    <div className="bg-[var(--cj-surface)] rounded-2xl p-6 mb-5"
         style={{ border: "1px solid var(--cj-border)" }}>
      <p className="card-label mb-5">Performance Badge</p>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

        {/* Progress ring — gold gradient */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
              <defs>
                <linearGradient id="goldRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%"   stopColor="#F5C518" />
                  <stop offset="100%" stopColor="#C9A227" />
                </linearGradient>
              </defs>
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                fill="none" stroke="var(--cj-border)" strokeWidth={STROKE}
              />
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                fill="none"
                stroke="url(#goldRingGrad)"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                style={{
                  transition: "stroke-dashoffset 1.2s ease-out",
                  filter: "drop-shadow(0 0 6px rgba(245,197,24,0.45))",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl leading-none">{badge.icon}</span>
              <span className="font-mono text-xl font-bold leading-none mt-0.5"
                    style={{ color: "var(--cj-gold)" }}>
                {score}
              </span>
            </div>
          </div>

          <div className="text-center">
            <p className={`font-semibold text-xl ${badge.color}`}>{badge.name}</p>
            <p className="text-sm text-zinc-600 mt-0.5">{badge.tagline}</p>
          </div>

          {nextBadge && (
            <p className="text-[13px] text-zinc-600 text-center">
              {nextBadge.min - score} pts to {nextBadge.icon} {nextBadge.name}
            </p>
          )}
          {!nextBadge && score >= 86 && (
            <p className="text-[13px] text-center" style={{ color: "var(--cj-gold-muted)" }}>
              Maximum rank achieved
            </p>
          )}
        </div>

        {/* Score breakdown bars */}
        <div className="flex-1 w-full space-y-3">
          {breakdownItems.map(({ label, pts, max }) => (
            <div key={label}>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-zinc-500">{label}</span>
                <span className="font-mono text-zinc-400">{pts}/{max}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden"
                   style={{ background: "var(--cj-border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(pts / max) * 100}%`,
                    background: "linear-gradient(90deg, #F5C518, #C9A227)",
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
