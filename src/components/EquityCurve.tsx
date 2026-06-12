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

// Module-level counter keeps gradient/clip IDs unique when two instances coexist
let _uid = 0;

export function PremiumEquityCurve({ data }: { data: Point[] }) {
  const [live, setLive] = useState(false);
  const [uid] = useState(() => ++_uid);

  useEffect(() => {
    const id = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // VW/VH are SVG user-unit dimensions.
  // PR=72 keeps the last data point 72 units from the right edge — enough room
  // for the current-value chip (60 units wide) without clipping.
  const VW = 560, VH = 190, PL = 8, PR = 72, PT = 16, PB = 24;
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

  const { peakIdx, peakVal, maxDDDollar, drawdownBands, nowVal, highVal } = useMemo(() => {
    let pk = data[0]?.value ?? 0;
    let pkIdx = 0;
    let maxDDDollar = 0;
    const bands: { x0: number; x1: number }[] = [];
    let inDD = false;
    let ddStart = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i].value;
      if (v > pk) { pk = v; pkIdx = i; }
      const ddDollar = Math.max(0, pk - v);
      if (ddDollar > maxDDDollar) maxDDDollar = ddDollar;
      const ddPct = pk > 0 ? ddDollar / pk : 0;
      if (ddPct > 0.15) {
        if (!inDD) { inDD = true; ddStart = i; }
      } else {
        if (inDD) { bands.push({ x0: tx(ddStart), x1: tx(i) }); inDD = false; }
      }
    }
    if (inDD) bands.push({ x0: tx(ddStart), x1: tx(data.length - 1) });

    return {
      peakIdx: pkIdx,
      peakVal: pk,
      maxDDDollar,
      drawdownBands: bands,
      nowVal: data[data.length - 1]?.value ?? 0,
      highVal: pk,
    };
  }, [data]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-[240px] sm:h-[320px] text-zinc-600 text-sm">
        Add at least 2 trades
      </div>
    );
  }

  const GOLD = "#D4A017";
  const px = tx(peakIdx), py = ty(peakVal);
  const lastX = tx(data.length - 1), lastY = ty(nowVal);
  const nowColor = nowVal >= 0 ? "#5DCAA5" : "#F09595";
  const maxDDStr = fmt$(maxDDDollar === 0 ? 0 : -maxDDDollar);

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => minV + f * range);
  const areaPath = linePath + ` L ${lastX} ${PT + cH} L ${tx(0)} ${PT + cH} Z`;

  // Clamp peak pill so it never renders above the viewBox
  const pillH = 16, pillW = 68;
  const pillY = Math.max(PT + 2, py - pillH - 6);
  const pillX = Math.min(Math.max(px - pillW / 2, PL), VW - PR - pillW);

  const gradId  = `eqFill-${uid}`;
  const clipId  = `eqClip-${uid}`;

  return (
    <div>
      {/* Stat strip — outside SVG, no scaling issues */}
      <div className="flex justify-end gap-4 mb-2 text-[11px] tabular-nums font-sans">
        <span className="text-zinc-500">High <span className="text-[var(--cj-gold)]">{fmt$(highVal)}</span></span>
        <span className="text-zinc-500">Now <span style={{ color: nowColor }}>{fmt$(nowVal)}</span></span>
        <span className="text-zinc-500">Max DD <span className="text-rose-400">{maxDDStr}</span></span>
      </div>

      {/*
        Fixed-height wrapper controls the rendered size on screen.
        SVG fills it exactly with preserveAspectRatio="none".
        vectorEffect="non-scaling-stroke" on stroked elements keeps
        stroke widths at the specified px regardless of the x/y scale.
      */}
      <div className="h-[240px] sm:h-[320px]">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%" height="100%"
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="28%"  stopColor={GOLD} stopOpacity={0.28} />
              <stop offset="85%"  stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={PL} y={PT} width={cW} height={cH} />
            </clipPath>
          </defs>

          {/* Grid hairlines */}
          {gridVals.map((v, i) => (
            <line key={i} x1={PL} y1={ty(v)} x2={VW - PR} y2={ty(v)}
                  stroke="rgba(0,0,0,0.05)" strokeWidth={1}
                  vectorEffect="non-scaling-stroke" />
          ))}

          {/* Drawdown bands — full plot height, uniform soft red */}
          {drawdownBands.map((b, i) => (
            <rect key={i}
                  x={b.x0} y={PT} width={b.x1 - b.x0} height={cH}
                  fill="rgba(248,113,113,0.05)"
                  clipPath={`url(#${clipId})`} />
          ))}

          {/* ATH dotted hairline */}
          <line x1={PL} y1={ty(peakVal)} x2={VW - PR} y2={ty(peakVal)}
                stroke="rgba(0,0,0,0.18)" strokeWidth={1} strokeDasharray="2 5"
                vectorEffect="non-scaling-stroke" />

          {/* Gradient fill */}
          <path d={areaPath} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />

          {/* Main curve — draws in on mount via dashoffset animation */}
          <path d={linePath} fill="none" stroke={GOLD} strokeWidth={2.5}
                strokeLinecap="round" pathLength={1000}
                strokeDasharray={1000} strokeDashoffset={live ? 0 : 1000}
                vectorEffect="non-scaling-stroke"
                style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.16,1,0.3,1)" }}
                clipPath={`url(#${clipId})`} />

          {/* Peak marker + compact pill */}
          {peakVal > nowVal * 1.01 && (
            <g>
              <circle cx={px} cy={py} r={5} fill={GOLD} fillOpacity={0.25} />
              <circle cx={px} cy={py} r={2.5} fill="white" />
              <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={8} fill="#15151f" />
              <text x={pillX + pillW / 2} y={pillY + pillH - 4}
                    textAnchor="middle" fontSize={8} fill={GOLD}
                    fontFamily="sans-serif" fontWeight="600">
                peak {fmt$(peakVal)}
              </text>
            </g>
          )}

          {/* Current value chip — anchored to line end, fully inside plot */}
          <g>
            <rect x={lastX - 30} y={lastY - 10} width={60} height={18} rx={9}
                  fill={nowColor} fillOpacity={0.15} />
            <rect x={lastX - 30} y={lastY - 10} width={60} height={18} rx={9}
                  fill="none" stroke={nowColor} strokeWidth={1} strokeOpacity={0.4}
                  vectorEffect="non-scaling-stroke" />
            <text x={lastX} y={lastY + 1} textAnchor="middle" fontSize={9}
                  fill={nowColor} fontFamily="sans-serif" fontWeight="600">
              {fmt$(nowVal)}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
