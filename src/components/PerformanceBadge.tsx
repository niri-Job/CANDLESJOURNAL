"use client";

import { useMemo, useEffect, useState } from "react";

interface Trade {
  pnl: number;
  date: string;
}

const TIERS = [
  { min: 0,  max: 25,  name: "BRONZE",  label: "Bronze Trader",  tagline: "Keep pushing",       tier: 1, gFrom: "#CD7F32", gTo: "#8B4513", color: "#CD7F32" },
  { min: 26, max: 45,  name: "SILVER",  label: "Silver Trader",  tagline: "Getting consistent", tier: 2, gFrom: "#C8C8C8", gTo: "#808080", color: "#C0C0C0" },
  { min: 46, max: 70,  name: "GOLD",    label: "Gold Trader",    tagline: "Strong performance", tier: 3, gFrom: "#EF9F27", gTo: "#B07908", color: "#D4A017" },
  { min: 71, max: 100, name: "DIAMOND", label: "Diamond Trader", tagline: "Elite level",        tier: 4, gFrom: "#89D4FF", gTo: "#4096CC", color: "#89D4FF" },
];

function getTier(score: number) {
  return TIERS.find(t => score >= t.min && score <= t.max) ?? TIERS[0];
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

export function PerformanceBadge({ trades }: { trades: Trade[] }) {
  const [animated, setAnimated] = useState(false);

  const { score } = useMemo(() => {
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
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [score]);

  const tier = getTier(score);
  const isDiamond = tier.name === "DIAMOND";
  const xpCurrent = isDiamond ? tier.max - tier.min : score - tier.min;
  const xpTotal = tier.max - tier.min;
  const xpPct = xpTotal > 0 ? Math.round((xpCurrent / xpTotal) * 100) : 100;
  const toDiamond = Math.max(0, 71 - score);

  const CX = 60, CY = 65;
  const gradId = `hexGrad-${tier.name}`;

  return (
    <div className="bg-[var(--cj-surface)] rounded-2xl p-6 mb-5"
         style={{ border: "1px solid var(--cj-border)" }}>
      <p className="card-label mb-5">Performance Badge</p>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

        {/* Hex emblem */}
        <div style={{ flexShrink: 0 }}>
          <svg width={120} height={130} viewBox="0 0 120 130" style={{ display: "block", overflow: "visible" }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={tier.gFrom} />
                <stop offset="100%" stopColor={tier.gTo} />
              </linearGradient>
            </defs>
            {/* Outer hex — gradient fill */}
            <polygon
              points={hexPoints(CX, CY, 54)}
              fill={`url(#${gradId})`}
              style={{ filter: `drop-shadow(0 0 8px ${tier.color}55)` }}
            />
            {/* Inner hex — dark fill */}
            <polygon
              points={hexPoints(CX, CY, 44)}
              fill="#0d0f14"
            />
            {/* Score */}
            <text x={CX} y={CY - 6} textAnchor="middle" fontSize={24}
              fontWeight="700" fontFamily="sans-serif" fill={tier.color}>
              {score}
            </text>
            {/* Tier label */}
            <text x={CX} y={CY + 13} textAnchor="middle" fontSize={8}
              fontFamily="sans-serif" fontWeight="600" letterSpacing="1.5"
              fill={tier.color} fillOpacity={0.8}>
              {tier.name}
            </text>
          </svg>
        </div>

        {/* Right: tier info + XP bar */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: tier.color, lineHeight: 1.2 }}>
            {tier.label}
          </p>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 2, marginBottom: 16 }}>
            {tier.tagline} · Tier {tier.tier} of 4
          </p>

          {/* XP bar label */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#71717a" }}>
              {isDiamond ? "XP" : `${tier.name} progress`}
            </span>
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>
              {xpCurrent}/{xpTotal} XP
            </span>
          </div>

          {/* XP bar */}
          <div style={{
            width: 140, height: 8, borderRadius: 4,
            background: "rgba(255,255,255,0.06)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: animated ? `${xpPct}%` : "0%",
              borderRadius: 4,
              background: `linear-gradient(90deg, ${tier.gFrom}, ${tier.gTo})`,
              transition: "width 1s cubic-bezier(0.16,1,0.3,1)",
            }} />
          </div>

          {/* To Diamond / max rank */}
          <p style={{ fontSize: 11, color: "#71717a", marginTop: 8 }}>
            {isDiamond
              ? "🏆 Maximum rank achieved"
              : `${toDiamond} pts to ◆ Diamond`}
          </p>
        </div>
      </div>
    </div>
  );
}
