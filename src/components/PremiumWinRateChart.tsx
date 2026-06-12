"use client";
import { useState, useEffect } from "react";

export interface WinRateRow {
  pair: string;
  winRate: number;
  total: number;
  pnl?: number;
}

function fmt$(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "+";
  return `${s}$${a >= 1000 ? (a / 1000).toFixed(1) + "k" : a.toFixed(0)}`;
}

export function PremiumWinRateChart({ data }: { data: WinRateRow[] }) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (data.length === 0) {
    return <div className="py-8 text-center text-zinc-600 text-sm">No pair data yet</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => {
        const green = d.winRate >= 55;
        const barGrad = green
          ? "linear-gradient(90deg, #1D9E75, #5DCAA5)"
          : "linear-gradient(90deg, #E24B4A, #F09595)";
        const textColor = green ? "#5DCAA5" : "#F09595";
        return (
          <div key={d.pair} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 74, flexShrink: 0,
              fontSize: 13, fontWeight: 500,
              color: "#1A1916",
              fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {d.pair.replace(/M$/, "")}
            </span>
            <div style={{
              flex: 1, height: 10, borderRadius: 5,
              background: "rgba(255,255,255,0.06)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: animated ? `${d.winRate}%` : "0%",
                borderRadius: 5,
                background: barGrad,
                transition: `width 0.9s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`,
              }} />
            </div>
            <span style={{
              width: 38, flexShrink: 0, textAlign: "right",
              fontSize: 13, fontWeight: 700, color: textColor,
            }}>
              {d.winRate.toFixed(0)}%
            </span>
            <span style={{
              width: 28, flexShrink: 0, textAlign: "right",
              fontSize: 11, color: "#71717a",
            }}>
              {d.total}t
            </span>
            {d.pnl != null && (
              <div style={{
                flexShrink: 0, padding: "2px 7px", borderRadius: 100,
                fontSize: 11, fontWeight: 600,
                background: d.pnl >= 0 ? "rgba(29,158,117,0.15)" : "rgba(226,75,74,0.15)",
                color: d.pnl >= 0 ? "#1D9E75" : "#E24B4A",
              }}>
                {fmt$(d.pnl)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
