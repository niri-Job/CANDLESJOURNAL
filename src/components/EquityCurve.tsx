"use client";
import { useState, useEffect, useMemo } from "react";

interface Point { label: string; value: number }

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

function fmt$(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(1)}k` : `${s}$${a.toFixed(0)}`;
}

export function PremiumEquityCurve({ data }: { data: Point[] }) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const VW = 560, VH = 190, PL = 8, PR = 8, PT = 20, PB = 20;
  const cW = VW - PL - PR;
  const cH = VH - PT - PB;

  const vals = data.map(d => d.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  function tx(i: number) { return PL + (i / (data.length - 1)) * cW; }
  function ty(v: number) { return PT + cH - ((v - minV) / range) * cH; }

  const pts = data.map((d, i): [number, number] => [tx(i), ty(d.value)]);
  const linePath = smoothPath(pts);

  // ATH tracking
  const { peakIdx, peakVal, maxDD, drawdownBands, nowVal, highVal } = useMemo(() => {
    let pk = data[0]?.value ?? 0;
    let pkIdx = 0;
    let maxDD = 0;
    const bands: { x0: number; x1: number; y: number }[] = [];
    let inDD = false;
    let ddStart = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i].value;
      if (v > pk) { pk = v; pkIdx = i; }
      const dd = pk > 0 ? (pk - v) / pk : 0;
      if (dd > maxDD) maxDD = dd;
      if (dd > 0.15) {
        if (!inDD) { inDD = true; ddStart = i; }
      } else {
        if (inDD) {
          bands.push({ x0: tx(ddStart), x1: tx(i), y: ty(pk) });
          inDD = false;
        }
      }
    }
    if (inDD) bands.push({ x0: tx(ddStart), x1: tx(data.length - 1), y: ty(pk) });

    return {
      peakIdx: pkIdx,
      peakVal: pk,
      maxDD,
      drawdownBands: bands,
      nowVal: data[data.length - 1]?.value ?? 0,
      highVal: pk,
    };
  }, [data]);

  if (data.length < 2) {
    return <div className="flex items-center justify-center h-full text-zinc-600 text-sm">Add at least 2 trades</div>;
  }

  const GOLD = "#D4A017";
  const px = tx(peakIdx), py = ty(peakVal);
  const lastX = tx(data.length - 1), lastY = ty(nowVal);
  const nowColor = nowVal >= 0 ? "#5DCAA5" : "#F09595";
  const maxDDPct = (maxDD * 100).toFixed(1);

  // Grid lines at 25% intervals
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => minV + f * range);

  const areaPath = linePath + ` L ${tx(data.length - 1)} ${ty(minV)} L ${tx(0)} ${ty(minV)} Z`;

  return (
    <div>
      {/* Stat strip */}
      <div className="flex justify-end gap-4 mb-2 text-[11px] tabular-nums font-sans">
        <span className="text-zinc-500">High <span className="text-[var(--cj-gold)]">{fmt$(highVal)}</span></span>
        <span className="text-zinc-500">Now <span style={{ color: nowColor }}>{fmt$(nowVal)}</span></span>
        <span className="text-zinc-500">Max DD <span className="text-rose-400">−{maxDDPct}%</span></span>
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ height: "auto", display: "block" }}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="28%"  stopColor={GOLD} stopOpacity={0.28} />
            <stop offset="85%"  stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
          <clipPath id="eqClip">
            <rect x={PL} y={PT} width={cW} height={cH} />
          </clipPath>
        </defs>

        {/* Grid hairlines */}
        {gridVals.map((v, i) => (
          <line key={i} x1={PL} y1={ty(v)} x2={VW - PR} y2={ty(v)}
                stroke="rgba(0,0,0,0.05)" strokeWidth={1} />
        ))}

        {/* Drawdown bands */}
        {drawdownBands.map((b, i) => (
          <g key={i} clipPath="url(#eqClip)">
            <rect x={b.x0} y={b.y} width={b.x1 - b.x0} height={ty(minV) - b.y}
                  fill="rgba(248,113,113,0.05)" />
            <line x1={b.x0} y1={b.y} x2={b.x1} y2={b.y}
                  stroke="#f87171" strokeWidth={3} />
          </g>
        ))}

        {/* ATH dotted line */}
        <line x1={PL} y1={ty(peakVal)} x2={VW - PR} y2={ty(peakVal)}
              stroke="rgba(0,0,0,0.18)" strokeWidth={1} strokeDasharray="2 5" />

        {/* Fill area */}
        <path d={areaPath} fill="url(#eqFill)" clipPath="url(#eqClip)" />

        {/* Main line with draw animation */}
        <path d={linePath} fill="none" stroke={GOLD} strokeWidth={2.5}
              strokeLinecap="round" pathLength={1000}
              strokeDasharray={1000} strokeDashoffset={live ? 0 : 1000}
              style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.16,1,0.3,1)" }}
              clipPath="url(#eqClip)" />

        {/* Peak marker */}
        {peakVal > nowVal * 1.01 && (
          <g>
            <circle cx={px} cy={py} r={6} fill={GOLD} fillOpacity={0.2} />
            <circle cx={px} cy={py} r={3} fill="white" />
            <rect x={px - 32} y={py - 26} width={64} height={18} rx={9} fill="#1a1a2e" />
            <text x={px} y={py - 13} textAnchor="middle" fontSize={9} fill={GOLD}
                  fontFamily="sans-serif" fontWeight="600">peak {fmt$(peakVal)}</text>
          </g>
        )}

        {/* Current value chip */}
        <g>
          <rect x={lastX - 28} y={lastY - 10} width={56} height={18} rx={9}
                fill={nowColor} fillOpacity={0.15} />
          <rect x={lastX - 28} y={lastY - 10} width={56} height={18} rx={9}
                fill="none" stroke={nowColor} strokeWidth={1} strokeOpacity={0.4} />
          <text x={lastX} y={lastY + 1} textAnchor="middle" fontSize={9} fill={nowColor}
                fontFamily="sans-serif" fontWeight="600">{fmt$(nowVal)}</text>
        </g>
      </svg>
    </div>
  );
}
