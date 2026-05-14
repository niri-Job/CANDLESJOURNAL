"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  winRate: string | null;
  totalTrades: number;
  totalPnl: number;
  profitFactor: number;
  bestPair: string;
  worstPair: string;
  badgeName: string;
  badgeIcon: string;
  onClose: () => void;
}

const W = 1200, H = 628;

function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  { winRate, totalTrades, totalPnl, profitFactor, bestPair, worstPair, badgeName, badgeIcon }: Props,
) {
  // Background
  ctx.fillStyle = "#0A0A0F";
  ctx.fillRect(0, 0, W, H);

  // Gold radial glow — top-left
  const glow = ctx.createRadialGradient(300, 0, 0, 300, 0, 700);
  glow.addColorStop(0, "rgba(245,197,24,0.07)");
  glow.addColorStop(1, "rgba(10,10,15,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Left gold accent bar
  const barGrad = ctx.createLinearGradient(0, 0, 0, H);
  barGrad.addColorStop(0, "#F5C518");
  barGrad.addColorStop(1, "#C9A227");
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, 8, H);

  // ─── Header ──────────────────────────────────────────────────────────────────

  // NIRI logo badge
  const logoGrad = ctx.createLinearGradient(60, 52, 116, 108);
  logoGrad.addColorStop(0, "#F5C518");
  logoGrad.addColorStop(1, "#C9A227");
  ctx.fillStyle = logoGrad;
  rr(ctx, 60, 52, 56, 56, 12);
  ctx.fill();
  ctx.shadowColor = "rgba(245,197,24,0.4)";
  ctx.shadowBlur = 20;
  ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#0A0A0F";
  ctx.textAlign = "center";
  ctx.fillText("NI", 88, 88);
  ctx.shadowBlur = 0;

  // NIRI wordmark
  ctx.font = "bold 26px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#F0E6D3";
  ctx.textAlign = "left";
  ctx.fillText("NIRI", 130, 76);

  ctx.font = "15px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#4A3E2A";
  ctx.fillText("AI Trading Journal", 131, 98);

  // Title
  ctx.font = "bold 44px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#F0E6D3";
  ctx.fillText("Trading Performance", 60, 178);

  // Date
  const dateStr = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  ctx.font = "17px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#5A4A32";
  ctx.fillText(dateStr, 60, 207);

  // Divider
  ctx.strokeStyle = "#1E1812";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 228);
  ctx.lineTo(W - 60, 228);
  ctx.stroke();

  // ─── Stats grid ──────────────────────────────────────────────────────────────
  // 3 columns × 2 rows
  const PAD = 60;
  const GAP = 16;
  const cols = 3;
  const rows = 2;
  const gridW = W - PAD * 2;
  const cellW = (gridW - GAP * (cols - 1)) / cols;
  const cellH = 104;
  const gridStartY = 248;

  const fmt = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);

  const pf = profitFactor;
  const stats: { label: string; value: string; valueColor: string }[] = [
    {
      label: "Win Rate",
      value: winRate ? `${winRate}%` : "—",
      valueColor: winRate ? (parseFloat(winRate) >= 50 ? "#34d399" : "#f87171") : "#9A8A72",
    },
    {
      label: "Total P&L",
      value: fmt(totalPnl),
      valueColor: totalPnl >= 0 ? "#34d399" : "#f87171",
    },
    {
      label: "Total Trades",
      value: String(totalTrades),
      valueColor: "#F0E6D3",
    },
    {
      label: "Profit Factor",
      value: pf > 0 ? pf.toFixed(2) : "—",
      valueColor: pf >= 1 ? "#F5C518" : "#f87171",
    },
    {
      label: "Best Pair",
      value: bestPair || "—",
      valueColor: "#34d399",
    },
    {
      label: "Worst Pair",
      value: worstPair || "—",
      valueColor: "#f87171",
    },
  ];

  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (cellW + GAP);
    const y = gridStartY + row * (cellH + GAP);

    // Cell background
    ctx.fillStyle = "#111018";
    rr(ctx, x, y, cellW, cellH, 14);
    ctx.fill();

    // Cell border
    ctx.strokeStyle = "#1E1A12";
    ctx.lineWidth = 1;
    rr(ctx, x, y, cellW, cellH, 14);
    ctx.stroke();

    // Label
    ctx.font = "13px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#4A3E2A";
    ctx.textAlign = "left";
    ctx.fillText(s.label.toUpperCase(), x + 20, y + 28);

    // Value
    ctx.font = "bold 32px 'Segoe UI Semibold', 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = s.valueColor;
    ctx.fillText(s.value, x + 20, y + 76);
  });

  // ─── Footer ──────────────────────────────────────────────────────────────────
  const footerY = gridStartY + rows * (cellH + GAP) + 20;

  // Divider
  ctx.strokeStyle = "#1E1812";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, footerY);
  ctx.lineTo(W - 60, footerY);
  ctx.stroke();

  // Badge emoji + name
  ctx.font = "28px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
  ctx.fillStyle = "#F0E6D3";
  ctx.textAlign = "left";
  ctx.fillText(badgeIcon, 60, footerY + 44);

  ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#F5C518";
  ctx.fillText(badgeName, 96, footerY + 44);

  // Watermark
  ctx.font = "14px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.textAlign = "right";
  ctx.fillText("niri.live", W - 60, footerY + 44);
}

export function SharePerformanceCard(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copying,  setCopying]  = useState(false);
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCard(ctx, props);
  }, [props]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `niri-performance-${new Date().toISOString().split("T")[0]}.png`;
    a.click();
  }

  async function shareToX() {
    const canvas = canvasRef.current;
    const text = encodeURIComponent(
      `My trading stats this month on NIRI 📊 niri.live #forex #trading`
    );
    // Try to copy image to clipboard so user can paste in tweet
    if (canvas) {
      try {
        setCopying(true);
        const blob = await new Promise<Blob>((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png")
        );
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 4000);
      } catch {
        // Clipboard write not supported — just open Twitter
      } finally {
        setCopying(false);
      }
    }
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--cj-gold)]">Share Performance Card</p>
          <button
            onClick={props.onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Canvas preview */}
        <div className="rounded-xl overflow-hidden border border-zinc-800" style={{ aspectRatio: "1200/628" }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={download}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Card
          </button>

          <button
            onClick={shareToX}
            disabled={copying}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-zinc-700 hover:border-zinc-500 text-zinc-200 disabled:opacity-60"
            style={{ background: "var(--cj-surface)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            {copying ? "Copying…" : "Share to X"}
          </button>
        </div>

        {copied && (
          <p className="text-xs text-emerald-400 text-center">
            Image copied to clipboard — paste it in the tweet window!
          </p>
        )}
        <p className="text-xs text-zinc-600 text-center">1200 × 628px · Optimised for Twitter / X and Instagram</p>
      </div>
    </div>
  );
}
