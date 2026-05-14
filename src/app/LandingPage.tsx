"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ─── SVG icon wrapper ─────────────────────────────────────────────────────────
function Ico({ children, size = 24, color = "#C9A227", style }: {
  children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      {children}
    </svg>
  );
}

// ─── Named icons ──────────────────────────────────────────────────────────────
const IcoSync = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <path d="M4 4v5h5M20 20v-5h-5"/>
    <path d="M4 9a8 8 0 0 1 14.93-2M20 15a8 8 0 0 1-14.93 2"/>
  </Ico>
);
const IcoCoach = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v4l3 3"/>
  </Ico>
);
const IcoChart = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </Ico>
);
const IcoEmotion = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="12" cy="12" r="9"/>
    <path d="M9 9h.01M15 9h.01M9.5 15a4 4 0 0 0 5 0"/>
  </Ico>
);
const IcoBar = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </Ico>
);
const IcoFile = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </Ico>
);
const IcoSearch = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </Ico>
);
const IcoGlobe = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="12" cy="12" r="9"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </Ico>
);
const IcoAlert = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </Ico>
);
const IcoLightbulb = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <line x1="9" y1="18" x2="15" y2="18"/>
    <line x1="10" y1="22" x2="14" y2="22"/>
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
  </Ico>
);
const IcoAward = ({ color, size }: { color?: string; size?: number }) => (
  <Ico color={color} size={size}>
    <circle cx="12" cy="8" r="6"/>
    <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
  </Ico>
);
const IcoTarget = ({ color, size }: { color?: string; size?: number }) => (
  <Ico color={color} size={size}>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </Ico>
);
const IcoXCircle = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </Ico>
);
const IcoCheckCircle = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </Ico>
);
const IcoStopOctagon = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </Ico>
);
const IcoRepeat = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <path d="M17 2l4 4-4 4"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <path d="M7 22l-4-4 4-4"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </Ico>
);
const IcoTrendDown = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
    <polyline points="17 18 23 18 23 12"/>
  </Ico>
);
const IcoClock = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </Ico>
);
const IcoHelpCircle = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </Ico>
);
const IcoStar = ({ color }: { color?: string }) => (
  <Ico color={color}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </Ico>
);
// Social SVGs
const IcoTwitterX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="1.5" strokeLinecap="round">
    <path d="M4 4l16 16M20 4 4 20"/>
  </svg>
);
const IcoTelegram = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IcoWhatsapp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IcoLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

// ─── Scroll fade-up ───────────────────────────────────────────────────────────
function useFadeUp(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("in-view"); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, suffix = "", duration = 1800) {
  const [val, setVal] = useState("0");
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setVal(Math.floor(eased * target).toLocaleString() + suffix);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.unobserve(el);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, suffix, duration]);
  return { ref, val };
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", textAlign: "left", padding: "1.375rem 0",
        background: "none", border: "none", cursor: "pointer",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        color: "var(--cj-text)", fontSize: "1rem", fontWeight: 600, gap: "1rem",
      }}>
        <span>{q}</span>
        <span style={{ color: "#F5C518", fontSize: "1.375rem", flexShrink: 0, transition: "transform 0.25s", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      <div style={{
        maxHeight: open ? "24rem" : "0", overflow: "hidden",
        transition: "max-height 0.35s ease", paddingBottom: open ? "1.375rem" : 0,
        color: "#AAAAAA", lineHeight: 1.75, fontSize: "0.9375rem",
      }}>{a}</div>
    </div>
  );
}

// ─── Comparison row ───────────────────────────────────────────────────────────
function CmpRow({ label, niri, other, highlight }: { label: string; niri: string; other: string; highlight?: boolean }) {
  return (
    <tr style={{ background: highlight ? "rgba(245,197,24,0.05)" : "transparent" }}>
      <td style={{ padding: "0.875rem 1rem", color: "#AAAAAA", fontSize: "0.9rem", borderBottom: "1px solid rgba(245,197,24,0.07)" }}>{label}</td>
      <td style={{ padding: "0.875rem 1rem", textAlign: "center", borderBottom: "1px solid rgba(245,197,24,0.07)", borderLeft: "2px solid rgba(245,197,24,0.3)" }}>
        <span style={{ color: "var(--cj-gold)", fontWeight: 700, fontSize: "0.9rem" }}>{niri}</span>
      </td>
      <td style={{ padding: "0.875rem 1rem", textAlign: "center", borderBottom: "1px solid rgba(245,197,24,0.07)" }}>
        <span style={{ color: "#888888", fontSize: "0.9rem" }}>{other}</span>
      </td>
    </tr>
  );
}

// ─── Check list item (pricing) ────────────────────────────────────────────────
function CheckItem({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span style={{ color: dim ? "#AAAAAA" : "var(--cj-text)", fontSize: "0.9375rem", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroCard, setHeroCard] = useState(0);
  const [howStep, setHowStep] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setHeroCard(c => (c + 1) % 3), 3600);
    return () => clearInterval(id);
  }, []);

  const heroRef    = useFadeUp(0.05);
  const painRef    = useFadeUp();
  const howRef     = useFadeUp();
  const aiRef      = useFadeUp();
  const featRef    = useFadeUp();
  const cmpRef     = useFadeUp();
  const previewRef = useFadeUp();
  const pricingRef = useFadeUp();
  const testRef    = useFadeUp();
  const ctaRef     = useFadeUp();

  const stat1 = useCountUp(10000, "+");
  const stat2 = useCountUp(500, "+");
  const stat3 = useCountUp(8, "");
  const stat4 = useCountUp(8, "");

  const heroCards = [
    {
      accent: "#e05555",
      icon: <IcoAlert color="#e05555" />,
      label: "Pattern Detected",
      text: "You lose 73% of trades placed after 2 consecutive losses. Revenge trading costs you $340 per month on average.",
    },
    {
      accent: "#F5C518",
      icon: <IcoLightbulb color="#F5C518" />,
      label: "Behavioral Insight",
      text: "You close winning trades 40% too early. Holding to your take profit would add $890 to your monthly result.",
    },
    {
      accent: "#4a9e4a",
      icon: <IcoAward color="#4a9e4a" />,
      label: "Strength Found",
      text: "Your XAUUSD SELL trades win 78% of the time during the London session. This is your edge.",
    },
  ];

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const features = [
    { ico: <IcoSync />, title: "Sync your MT5 account in seconds",
      desc: "Download the NIRI EA, drop it into MetaTrader 5, paste your sync token, and every closed trade appears in your journal automatically — no manual entry ever." },
    { ico: <IcoCoach />, title: "Know exactly what to fix after every session",
      desc: "After each session, NIRI analyses your entry timing, exit behavior, pair performance and session patterns, then generates a coaching report with specific observations." },
    { ico: <IcoChart />, title: "See every trade on the actual chart",
      desc: "Select any closed trade to load it on a live chart. Entry, exit, stop loss and take profit levels are drawn as price lines on the relevant candles." },
    { ico: <IcoEmotion />, title: "Discover which emotion is costing you most",
      desc: "Tag each trade with an emotion at the time of entry. NIRI calculates win rate and average PnL per emotion category across your full trade history." },
    { ico: <IcoBar />, title: "See your real performance, not your imagined performance",
      desc: "The dashboard shows equity curve, win rate segmented by pair and session, drawdown periods, and streak history across your connected accounts." },
    { ico: <IcoFile />, title: "8 types of reports that expose your patterns",
      desc: "The Reports section contains eight analysis views: Overview, Performance, Time Analysis, Risk Management, Psychology, Wins vs Losses, Streaks, and Period Comparison." },
    { ico: <IcoSearch />, title: "Know which setups actually make you money",
      desc: "NIRI segments your results by setup type and session so you can see exactly which approaches generate positive expectancy." },
    { ico: <IcoGlobe />, title: "Works with any MT5 broker worldwide",
      desc: "Compatible with Deriv, Exness, ICMarkets, HFM, XM, FBS, OctaFX and hundreds more. Including Deriv synthetic indices. Any country, any timezone." },
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: var(--cj-bg); color: var(--cj-text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        .fade-up { opacity: 0; transform: translateY(32px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .fade-up.in-view { opacity: 1; transform: translateY(0); }

        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes pulseGold {
          0%   { box-shadow: 0 0 0 0 rgba(245,197,24,0.5); }
          70%  { box-shadow: 0 0 0 14px rgba(245,197,24,0); }
          100% { box-shadow: 0 0 0 0 rgba(245,197,24,0); }
        }
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-10px); }
        }

        .shimmer-text {
          background: linear-gradient(90deg,#F5C518 0%,#fffde7 40%,#F5C518 60%,#C9A227 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
        [data-theme="light"] .shimmer-text {
          background: linear-gradient(90deg,#8A6A00 0%,#B8920A 40%,#8A6A00 60%,#6A5000 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
        .gold-btn {
          background: linear-gradient(135deg,#F5C518,#C9A227);
          color: #0a0800; border: none; border-radius: 0.5rem;
          font-weight: 700; cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .gold-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(245,197,24,0.35); }
        .outline-btn {
          background: transparent; color: #F5C518;
          border: 1.5px solid rgba(245,197,24,0.6);
          border-radius: 0.5rem; font-weight: 600; cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .outline-btn:hover { background: rgba(245,197,24,0.1); border-color: #F5C518; }
        [data-theme="light"] .outline-btn { color: #8A6A00 !important; border-color: rgba(138,106,0,0.5) !important; }
        [data-theme="light"] .outline-btn:hover { background: rgba(138,106,0,0.08) !important; border-color: #8A6A00 !important; }
        .nav-a { color: #9a8a6a; font-size: 0.9375rem; text-decoration: none; transition: color 0.2s; font-weight: 500; }
        .nav-a:hover { color: #F5C518; }
        [data-theme="light"] .nav-a { color: #3A2C18; }
        [data-theme="light"] .nav-a:hover { color: #8A6A00; }
        .card-hover { transition: transform 0.3s, box-shadow 0.3s; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(245,197,24,0.12); }
        [data-theme="light"] .card-hover:hover { box-shadow: 0 12px 36px rgba(138,106,0,0.14); }

        /* ── Light theme section / card overrides ── */
        [data-theme="light"] h1 { color: #1A1410 !important; }
        [data-theme="light"] h2 { color: #1A1410 !important; }
        [data-theme="light"] h3 { color: #1A1410 !important; }

        /* Scrolled nav */
        [data-theme="light"] .lp-nav-scrolled {
          background: rgba(232,224,208,0.97) !important;
          border-bottom-color: rgba(138,106,0,0.15) !important;
          box-shadow: 0 2px 12px rgba(138,106,0,0.08) !important;
        }
        /* Mobile drawer */
        [data-theme="light"] .lp-mobile-menu {
          background: rgba(232,224,208,0.99) !important;
        }
        /* Dark gradient cards → light cream cards */
        [data-theme="light"] .lp-card {
          background: linear-gradient(145deg, #FEFCF8, #F0E8D8) !important;
          border-color: rgba(138,106,0,0.2) !important;
          box-shadow: 0 2px 12px rgba(138,106,0,0.06) !important;
        }
        /* FAQ / table wrapper */
        [data-theme="light"] .lp-surface {
          background: #FEFCF8 !important;
          border-color: rgba(138,106,0,0.18) !important;
        }
        /* Social icon links */
        [data-theme="light"] .lp-social-link {
          background: rgba(74,63,47,0.08) !important;
          border-color: rgba(74,63,47,0.18) !important;
        }
        [data-theme="light"] .lp-social-link svg { stroke: #4A3F2F !important; }

        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger   { display: flex !important; }
          .hero-cols   { flex-direction: column !important; }
          .grid-3      { grid-template-columns: 1fr !important; }
          .grid-2      { grid-template-columns: 1fr !important; }
          .grid-4      { grid-template-columns: 1fr 1fr !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
          .cmp-table   { font-size: 0.8rem !important; }
          .cmp-table td{ padding: 0.625rem 0.5rem !important; }
        }

        /* ── Glitch animation ── */
        @keyframes glitchAnim {
          0%,89%,100% { transform: none; text-shadow: none; filter: none; }
          90%  { transform: translateX(-3px); text-shadow: 3px 0 #ff4444; filter: blur(0.3px); }
          91%  { transform: translateX(3px);  text-shadow: -3px 0 #00ccff; }
          92%  { transform: translateX(-2px) skewX(-3deg); text-shadow: 2px 0 #ff4444, -2px 0 #00ccff; }
          93%  { transform: none; text-shadow: none; filter: none; }
        }
        @keyframes glitchBefore {
          0%,89%,100% { transform: none; opacity: 0; }
          90%  { transform: translateX(3px);  opacity: 0.7; color: #ff4444; clip-path: inset(15% 0 65% 0); }
          91%  { transform: translateX(-3px); opacity: 0.7; color: #00ccff; clip-path: inset(65% 0 10% 0); }
          92%  { transform: none; opacity: 0; }
        }
        @keyframes glitchAfter {
          0%,90%,100% { transform: none; opacity: 0; }
          91%  { transform: translateX(-2px); opacity: 0.5; color: #00ccff; clip-path: inset(40% 0 40% 0); }
          92%  { transform: translateX(2px);  opacity: 0; }
        }
        .glitch-hero {
          position: relative; display: inline-block;
          animation: glitchAnim 8s ease infinite;
        }
        .glitch-hero::before, .glitch-hero::after {
          content: attr(data-text); position: absolute; inset: 0;
          pointer-events: none;
        }
        .glitch-hero::before { animation: glitchBefore 8s ease infinite; }
        .glitch-hero::after  { animation: glitchAfter  8s ease infinite; }

        /* ── Live dashboard preview ── */
        @keyframes drawPath {
          from { stroke-dashoffset: 600; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes fadeRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
        .equity-line {
          stroke-dasharray: 600;
          stroke-dashoffset: 600;
          animation: drawPath 2.4s ease forwards;
        }
        .pnl-counter { animation: countUp 0.6s 0.4s ease both; }
        .trade-row-1 { animation: fadeRow 0.5s 1.2s ease both; opacity: 0; }
        .trade-row-2 { animation: fadeRow 0.5s 1.6s ease both; opacity: 0; }
        .trade-row-3 { animation: fadeRow 0.5s 2.0s ease both; opacity: 0; }
      `}</style>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav className={scrolled ? "lp-nav-scrolled" : ""} style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: scrolled ? "56px" : "72px", padding: "0 1.5rem",
        background: scrolled ? "rgba(8,6,0,0.97)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(245,197,24,0.1)" : "none",
        transition: "all 0.3s ease",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.625rem" }}>
          {/* Logo — swap "NI" div with <img src="/logo.png" alt="NIRI" height={32} /> when brand assets arrive */}
          <div style={{
            width: 32, height: 32, borderRadius: "8px",
            background: "linear-gradient(135deg,#F5C518,#C9A227)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, color: "#0a0800", fontSize: "0.875rem",
          }}>NI</div>
          <span style={{ fontWeight: 800, fontSize: "1.125rem", color: "var(--cj-text)", letterSpacing: "-0.01em" }}>NIRI</span>
        </Link>

        <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: "2.25rem" }}>
          <a href="#why" className="nav-a">Why NIRI</a>
          <a href="#features" className="nav-a">Features</a>
          <a href="#pricing" className="nav-a">Pricing</a>
          <a href="#faq" className="nav-a">FAQ</a>
          <Link href="/login" className="nav-a">Log in</Link>
          <Link href="/login">
            <button className="gold-btn" style={{ padding: "0.5rem 1.25rem", fontSize: "0.875rem" }}>
              Start Free, No Card Needed
            </button>
          </Link>
        </div>

        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: "none", border: "none", cursor: "pointer", display: "none", flexDirection: "column", gap: 5, padding: "0.5rem" }}
          aria-label="Toggle menu">
          <div style={{ width: 22, height: 2, background: "#F5C518", borderRadius: 2, transition: "transform 0.2s", transform: menuOpen ? "rotate(45deg) translate(5px,5px)" : "none" }} />
          <div style={{ width: 22, height: 2, background: "#F5C518", borderRadius: 2, opacity: menuOpen ? 0 : 1, transition: "opacity 0.2s" }} />
          <div style={{ width: 22, height: 2, background: "#F5C518", borderRadius: 2, transition: "transform 0.2s", transform: menuOpen ? "rotate(-45deg) translate(5px,-5px)" : "none" }} />
        </button>
      </nav>

      {/* Mobile drawer */}
      <div className="lp-mobile-menu" style={{
        position: "fixed", inset: 0, zIndex: 99,
        background: "rgba(8,6,0,0.99)", padding: "5.5rem 2rem 2rem",
        display: "flex", flexDirection: "column", gap: "1.75rem",
        transform: menuOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
      }}>
        {[["#why","Why NIRI"],["#features","Features"],["#pricing","Pricing"],["#faq","FAQ"]].map(([href,label]) => (
          <a key={href} href={href} className="nav-a" style={{ fontSize: "1.25rem" }} onClick={closeMenu}>{label}</a>
        ))}
        <Link href="/login" className="nav-a" style={{ fontSize: "1.25rem" }} onClick={closeMenu}>Log in</Link>
        <Link href="/login" onClick={closeMenu}>
          <button className="gold-btn" style={{ padding: "1rem 2rem", fontSize: "1rem", width: "100%", marginTop: "0.5rem" }}>
            Start Free, No Card Needed
          </button>
        </Link>
      </div>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh", paddingTop: "80px",
        background: "radial-gradient(ellipse 90% 70% at 50% -10%, rgba(245,197,24,0.07) 0%, transparent 65%)",
        display: "flex", alignItems: "center",
      }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", padding: "5rem 1.5rem 4rem", width: "100%" }}>
          <div ref={heroRef} className="fade-up hero-cols" style={{ display: "flex", alignItems: "center", gap: "4rem", justifyContent: "space-between" }}>

            {/* Left copy */}
            <div style={{ flex: "1 1 500px", maxWidth: 580 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.625rem",
                background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.2)",
                borderRadius: "2rem", padding: "0.375rem 1rem",
                color: "var(--cj-gold)", fontSize: "0.8125rem", fontWeight: 600,
                marginBottom: "1.75rem", letterSpacing: "0.05em",
              }}>
                <IcoTarget color="var(--cj-gold)" size={14} />
                <span>Behavioral Trading Intelligence</span>
              </div>

              <h1 style={{ fontSize: "clamp(2.5rem,5.5vw,3.5rem)", fontWeight: 900, lineHeight: 1.08, marginBottom: "1.375rem", letterSpacing: "-0.02em" }}>
                <span style={{ color: "var(--cj-text)" }}>You&rsquo;re Not Losing</span>
                <br />
                <span style={{ color: "var(--cj-text)" }}>Because of the</span>
                <br />
                <span className="shimmer-text glitch-hero" data-text="Market.">Market.</span>
              </h1>

              <p style={{ color: "#CCCCCC", fontSize: "1.125rem", lineHeight: 1.75, marginBottom: "0.75rem", maxWidth: 500, fontWeight: 500 }}>
                You&rsquo;re losing because of you.
              </p>
              <p style={{ color: "#CCCCCC", fontSize: "1rem", lineHeight: 1.8, marginBottom: "2.25rem", maxWidth: 480 }}>
                NIRI syncs with MT5, analyses your trade history, and identifies the behavioral patterns behind your losses. Each session ends with a specific coaching report.
              </p>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <Link href="/login">
                  <button className="gold-btn" style={{ padding: "0.9375rem 2rem", fontSize: "1.0625rem", animation: "pulseGold 2.5s ease infinite" }}>
                    Discover Your Trading Blindspots
                  </button>
                </Link>
                <a href="#ai-showcase">
                  <button className="outline-btn" style={{ padding: "0.9375rem 1.75rem", fontSize: "1rem" }}>
                    View a Sample Report
                  </button>
                </a>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                {["No credit card required", "MT5 sync in under 5 minutes", "Cancel anytime"].map(t => (
                  <span key={t} style={{ color: "#888888", fontSize: "0.875rem" }}>• {t}</span>
                ))}
              </div>
            </div>

            {/* Rotating insight cards */}
            <div style={{ flex: "0 0 360px", position: "relative", height: 280 }}>
              {heroCards.map((card, i) => (
                <div key={i} style={{
                  position: "absolute", inset: 0,
                  opacity: heroCard === i ? 1 : 0,
                  transform: heroCard === i ? "translateY(0) scale(1)" : "translateY(14px) scale(0.97)",
                  transition: "opacity 0.7s ease, transform 0.7s ease",
                  animation: heroCard === i ? "float 4s ease-in-out infinite" : "none",
                }}>
                  <div className="lp-card" style={{
                    background: "linear-gradient(145deg,#1a1508,#0f0c04)",
                    border: `1px solid ${card.accent}40`,
                    borderLeft: `3px solid ${card.accent}`,
                    borderRadius: "1.25rem", padding: "2rem",
                    boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 30px ${card.accent}10`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
                      {card.icon}
                      <span style={{ color: card.accent, fontWeight: 700, fontSize: "0.8125rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>{card.label}</span>
                    </div>
                    <p style={{ color: "#d0c090", lineHeight: 1.75, fontSize: "1rem" }}>{card.text}</p>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
                      {heroCards.map((_, j) => (
                        <div key={j} style={{ height: 3, flex: heroCard === j ? 2 : 1, borderRadius: 2, background: heroCard === j ? card.accent : "rgba(255,255,255,0.08)", transition: "all 0.4s" }} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOMO SOCIAL PROOF STRIP ─────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(90deg,rgba(245,197,24,0.06) 0%,rgba(245,197,24,0.03) 50%,rgba(245,197,24,0.06) 100%)", borderTop: "1px solid rgba(245,197,24,0.08)", borderBottom: "1px solid rgba(245,197,24,0.08)", padding: "1.25rem 1.5rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "2rem" }}>
          {[
            { val: "87%", label: "of retail traders lose money — most don't know why" },
            { val: "2 min", label: "to sync your first trade — one file, one token" },
            { val: "5 min", label: "to connect your MT5 and see your first report" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <span style={{ color: "#F5C518", fontWeight: 900, fontSize: "1.5rem", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{s.val}</span>
              <span style={{ color: "#888888", fontSize: "0.875rem", lineHeight: 1.4, maxWidth: 200 }}>{s.label}</span>
              {i < 2 && <span style={{ color: "rgba(245,197,24,0.2)", fontSize: "1.5rem", display: "block" }}>|</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── DASHBOARD PREVIEW ───────────────────────────────────────────────── */}
      <section style={{ background: "#0A0A0F", padding: "5rem 1.5rem 6rem" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", gap: "4rem", flexWrap: "wrap" }}>

          {/* Left copy */}
          <div style={{ flex: "1 1 320px", maxWidth: 460 }}>
            <p style={{ color: "#9B7E2E", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
              Your dashboard, automated
            </p>
            <h2 style={{ fontSize: "clamp(1.75rem,3.5vw,2.5rem)", fontWeight: 800, color: "#F0E6D3", lineHeight: 1.15, marginBottom: "1.25rem", letterSpacing: "-0.02em" }}>
              Everything you need<br />to improve, <span className="shimmer-text">in one place.</span>
            </h2>
            <p style={{ color: "#8A7D65", fontSize: "1rem", lineHeight: 1.75, marginBottom: "2rem" }}>
              Trade journal, equity curve, AI analysis and discipline score — all synced automatically from MT5 in minutes.
            </p>
            {[
              "Auto-syncs every trade from MT5 via your EA file",
              "AI coaching highlights patterns and your real edge",
              "Discipline Score tracks behavioral consistency week by week",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.875rem" }}>
                <span style={{ color: "#F5C518", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>→</span>
                <p style={{ color: "#C4B89A", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>{f}</p>
              </div>
            ))}
            <div style={{ marginTop: "2.25rem" }}>
              <Link href="/login">
                <button className="gold-btn" style={{ padding: "0.9rem 2rem", fontSize: "0.9375rem" }}>
                  See Your Dashboard →
                </button>
              </Link>
              <p style={{ color: "#888888", fontSize: "0.8125rem", marginTop: "0.875rem" }}>
                Connect MT5 in under 5 minutes. No card required.
              </p>
            </div>
          </div>

          {/* Right: dashboard screenshot */}
          <div style={{ flex: "1 1 460px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dashboard-preview.png"
              alt="NIRI Dashboard"
              style={{
                width: "100%",
                borderRadius: 14,
                display: "block",
                boxShadow: "0 0 0 1px rgba(245,197,24,0.18), 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(245,197,24,0.15)",
                transform: "perspective(1100px) rotateY(-4deg) rotateX(1deg)",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── PAIN ────────────────────────────────────────────────────────────── */}
      <section id="why" style={{ padding: "7rem 1.5rem", background: "var(--cj-bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* Brutal truth callout */}
          <div className="fade-up" ref={painRef} style={{
            background: "linear-gradient(135deg,rgba(224,85,85,0.06) 0%,rgba(245,197,24,0.04) 100%)",
            border: "1px solid rgba(224,85,85,0.2)", borderRadius: "1.25rem",
            padding: "2.25rem 2.5rem", marginBottom: "4rem",
            textAlign: "center",
          }}>
            <p style={{ color: "#e05555", fontWeight: 800, fontSize: "clamp(1.25rem,2.5vw,1.625rem)", marginBottom: "0.75rem", lineHeight: 1.3 }}>
              The brutal truth most traders ignore:
            </p>
            <p style={{ color: "#CCCCCC", fontSize: "1rem", lineHeight: 1.8, maxWidth: 640, margin: "0 auto 1rem" }}>
              You don&rsquo;t have a strategy problem. You have a <strong style={{ color: "#f0e6c8" }}>behavior problem</strong>.
              Your setups work. Your discipline doesn&rsquo;t.
              NIRI shows you exactly where your behavior costs you money — with numbers, not hunches.
            </p>
            <p style={{ color: "#888888", fontSize: "0.9rem", fontStyle: "italic" }}>
              Most traders read this and think &ldquo;not me.&rdquo; The data says otherwise.
            </p>
          </div>

          <div className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Sound <span className="shimmer-text">Familiar?</span>
            </h2>
            <p style={{ color: "#888888", fontSize: "1rem" }}>Most traders know these problems exist. NIRI quantifies them.</p>
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {[
              { ico: <IcoRepeat color="#e05555" />, title: "You repeat the same mistakes",
                text: "Most traders know their problem areas but lack the data to confirm them. NIRI tracks every behavioral pattern across your full trade history.", accent: "#e05555" },
              { ico: <IcoTrendDown color="#C9A227" />, title: "Your results are inconsistent",
                text: "Profitable weeks followed by losing weeks with no clear explanation. NIRI finds the variables, whether session, pair, emotion or timing, that explain the difference.", accent: "#C9A227" },
              { ico: <IcoClock color="#e05555" />, title: "Trade review takes too long",
                text: "Manually reviewing trades in spreadsheets or screenshots is slow and inconsistent. NIRI automates the process and structures the data for you.", accent: "#e05555" },
              { ico: <IcoHelpCircle color="#C9A227" />, title: "You do not know which setups work",
                text: "Trading multiple strategies without performance data for each one. NIRI segments results by setup type so you can see which approaches are profitable.", accent: "#C9A227" },
            ].map((p, i) => {
              const ref = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={p.title} ref={ref} className="fade-up card-hover lp-card" style={{ transitionDelay: `${i * 80}ms`,
                  background: "linear-gradient(145deg,#120f04,#0a0800)",
                  border: "1px solid rgba(245,197,24,0.08)",
                  borderLeft: `3px solid ${p.accent}60`,
                  borderRadius: "1rem", padding: "1.75rem",
                }}>
                  <div style={{ marginBottom: "0.875rem" }}>{p.ico}</div>
                  <h3 style={{ color: "#f0e6c8", fontWeight: 700, fontSize: "1.0625rem", marginBottom: "0.625rem" }}>{p.title}</h3>
                  <p style={{ color: "#AAAAAA", lineHeight: 1.75, fontSize: "0.9375rem" }}>{p.text}</p>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: "3rem" }}>
            <p style={{ color: "var(--cj-gold)", fontWeight: 800, fontSize: "1.375rem" }}>NIRI addresses all of this with data.</p>
          </div>
        </div>
      </section>

      {/* ── HOW NIRI WORKS — Interactive ────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div ref={howRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Up and Running in <span className="shimmer-text">3 Steps</span>
            </h2>
            <p style={{ color: "#888888", fontSize: "1rem" }}>Click each step to see what to expect</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3.5rem", alignItems: "start" }} className="grid-2">
            {/* Step selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {[
                { n: "01", title: "Install the NIRI EA in MT5",
                  desc: "Download NIRI_EA.ex5, copy it into your Experts folder, allow WebRequest, then drag onto any chart and paste your sync token. Under 2 minutes." },
                { n: "02", title: "NIRI analyses your behavior",
                  desc: "Every closed trade is processed automatically. NIRI maps your entries, exits, timing, pairs, emotions and patterns into measurable data." },
                { n: "03", title: "Get your coaching report",
                  desc: "After each session, NIRI identifies your biggest mistakes, your strongest edges, and gives you one specific focus area for the next session." },
              ].map((step, i) => (
                <div
                  key={step.n}
                  onClick={() => setHowStep(i)}
                  style={{
                    display: "flex", gap: "1.25rem", padding: "1.375rem 1.5rem",
                    borderRadius: "1rem", cursor: "pointer", transition: "all 0.25s ease",
                    background: howStep === i ? "linear-gradient(145deg,#1e1a06,#131000)" : "transparent",
                    border: howStep === i ? "1px solid rgba(245,197,24,0.35)" : "1px solid transparent",
                    boxShadow: howStep === i ? "0 8px 30px rgba(245,197,24,0.08)" : "none",
                  }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                    background: howStep === i ? "linear-gradient(135deg,#F5C518,#C9A227)" : "rgba(245,197,24,0.08)",
                    border: howStep === i ? "none" : "1px solid rgba(245,197,24,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, color: howStep === i ? "#0a0800" : "#AAAAAA",
                    fontSize: "0.875rem", transition: "all 0.25s ease",
                  }}>{step.n}</div>
                  <div>
                    <h3 style={{ color: howStep === i ? "#f0e6c8" : "#AAAAAA", fontWeight: 700, fontSize: "1rem", marginBottom: "0.375rem", transition: "color 0.25s" }}>{step.title}</h3>
                    <p style={{ color: howStep === i ? "#AAAAAA" : "#888888", lineHeight: 1.7, fontSize: "0.875rem", transition: "color 0.25s" }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Step mockup */}
            <div className="lp-card" style={{
              background: "linear-gradient(145deg,#1a1508,#0f0c04)",
              border: "1px solid rgba(245,197,24,0.2)", borderRadius: "1.25rem",
              overflow: "hidden", transition: "all 0.3s ease",
            }}>
              {howStep === 0 && (
                <div style={{ padding: "1.75rem" }}>
                  <p style={{ color: "#AAAAAA", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>MT5 Expert Advisor</p>
                  <div style={{ background: "#0a0800", borderRadius: "0.75rem", padding: "1.25rem", fontFamily: "monospace", fontSize: "0.8125rem", color: "#8a7050", lineHeight: 2, border: "1px solid rgba(245,197,24,0.08)" }}>
                    <div style={{ color: "#4a9e4a" }}>NIRI EA v1.0 — Active on account #12345678</div>
                    <div>Scanning full history from 2000.01.01...</div>
                    <div style={{ color: "#F5C518" }}>Synced #1029482 XAUUSD BUY 0.50 lots | P&L: +$184.20</div>
                    <div style={{ color: "#F5C518" }}>Synced #1029481 EURUSD SELL 0.20 lots | P&L: -$32.00</div>
                    <div style={{ color: "#4a9e4a" }}>Synced 247 trades. Up to date.</div>
                  </div>
                  <p style={{ color: "#888888", fontSize: "0.8125rem", marginTop: "1rem", textAlign: "center" }}>Every trade syncs within seconds of closing</p>
                </div>
              )}
              {howStep === 1 && (
                <div style={{ padding: "1.75rem" }}>
                  <p style={{ color: "#AAAAAA", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>Behavioral Analysis</p>
                  {[
                    { label: "Revenge Trade Detection", pct: 78, col: "#e05555" },
                    { label: "Session Win Rate: London", pct: 68, col: "#4a9e4a" },
                    { label: "XAUUSD Edge Score", pct: 82, col: "#F5C518" },
                    { label: "TP Discipline", pct: 45, col: "#C9A227" },
                  ].map((item) => (
                    <div key={item.label} style={{ marginBottom: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                        <span style={{ color: "#8a7050", fontSize: "0.8125rem" }}>{item.label}</span>
                        <span style={{ color: item.col, fontWeight: 700, fontSize: "0.8125rem" }}>{item.pct}%</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${item.pct}%`, background: item.col, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {howStep === 2 && (
                <div>
                  <div style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", padding: "0.875rem 1.5rem", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 800, color: "#0a0800", fontSize: "0.8125rem", letterSpacing: "0.06em" }}>THIS SESSION&rsquo;S REPORT</span>
                    <span style={{ color: "#0a0800", fontSize: "0.75rem", opacity: 0.7 }}>May 13, 2026</span>
                  </div>
                  <div style={{ padding: "1.5rem" }}>
                    {[
                      { ico: "✓", col: "#4a9e4a", label: "BEST TRADE", text: "XAUUSD SELL during London. +$184. Waited for confirmation." },
                      { ico: "✕", col: "#e05555", label: "STOP DOING", text: "Trading GBPUSD after 2 consecutive losses. Win rate drops to 12%." },
                      { ico: "→", col: "#F5C518", label: "FOCUS NEXT", text: "XAUUSD London session only. Your 78% win rate edge is here." },
                    ].map((row) => (
                      <div key={row.label} style={{ display: "flex", gap: "0.875rem", marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(245,197,24,0.06)" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${row.col}20`, border: `1px solid ${row.col}40`, display: "flex", alignItems: "center", justifyContent: "center", color: row.col, fontWeight: 700, fontSize: "0.75rem", flexShrink: 0 }}>{row.ico}</div>
                        <div>
                          <div style={{ color: row.col, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.08em", marginBottom: "0.2rem" }}>{row.label}</div>
                          <div style={{ color: "#8a7050", fontSize: "0.8125rem", lineHeight: 1.5 }}>{row.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── COACHING REPORT SHOWCASE ──────────────────────────────────────────── */}
      <section id="ai-showcase" style={{ padding: "7rem 1.5rem", background: "var(--cj-bg)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div ref={aiRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.875rem" }}>
              NIRI Doesn&rsquo;t Just <span className="shimmer-text">Track Trades.</span>
            </h2>
            <p style={{ color: "#AAAAAA", fontSize: "1rem", maxWidth: 480, margin: "0 auto" }}>
              It gives you a structured analysis of what happened and what to change.
            </p>
          </div>

          <div className="lp-card" style={{
            background: "linear-gradient(145deg,#1a1508,#0f0c04)",
            border: "1px solid rgba(245,197,24,0.25)",
            borderRadius: "1.5rem", overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 40px rgba(245,197,24,0.06)",
          }}>
            <div style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", padding: "1rem 1.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: "#0a0800", fontSize: "0.9375rem", letterSpacing: "0.06em" }}>COACHING REPORT</span>
              <span style={{ color: "#0a0800", fontSize: "0.8125rem", opacity: 0.7 }}>Week of April 28, 2026</span>
            </div>
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {[
                { ico: <IcoAward color="#4a9e4a" />, label: "BEST TRADE",  color: "#4a9e4a", text: "XAUUSD SELL. +$1,208. You waited for London open confirmation before entering. Replicate this process." },
                { ico: <IcoXCircle color="#e05555" />, label: "WORST TRADE", color: "#e05555", text: "GBPUSD BUY. -$5,409. Entered against the trend during high-impact news with no setup." },
                { ico: <IcoStopOctagon color="#e05555" />, label: "STOP DOING",  color: "#e05555", text: "Trading after 2 consecutive losses. Win rate drops from 67% to 18% in this state." },
                { ico: <IcoCheckCircle color="#4a9e4a" />, label: "START DOING", color: "#4a9e4a", text: "XAUUSD trades during the London session. 78% win rate against your overall 34%." },
              ].map((row) => (
                <div key={row.label} style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid rgba(245,197,24,0.07)", borderRight: "1px solid rgba(245,197,24,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
                    {row.ico}
                    <span style={{ color: row.color, fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em" }}>{row.label}</span>
                  </div>
                  <p style={{ color: "#CCCCCC", lineHeight: 1.7, fontSize: "0.9rem" }}>{row.text}</p>
                </div>
              ))}
            </div>
            <div style={{ padding: "1.5rem 1.75rem", background: "rgba(245,197,24,0.04)", borderTop: "1px solid rgba(245,197,24,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
                <IcoTarget color="#F5C518" size={18} />
                <span style={{ color: "#F5C518", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em" }}>THIS WEEK&rsquo;S FOCUS</span>
              </div>
              <p style={{ color: "#c0a060", fontWeight: 600, fontSize: "1rem" }}>One setup. One session. XAUUSD sells during the London open only.</p>
            </div>
          </div>

          <p style={{ textAlign: "center", color: "#888888", fontSize: "0.875rem", margin: "1.5rem 0 2rem" }}>
            This report is generated automatically after every trading session.
          </p>
          <div style={{ textAlign: "center" }}>
            <Link href="/login">
              <button className="gold-btn" style={{ padding: "0.875rem 2.25rem", fontSize: "1rem" }}>
                Get Your First Report Free
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div ref={featRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.875rem" }}>
              Stop Guessing. <span className="shimmer-text">Start Growing.</span>
            </h2>
            <p style={{ color: "#AAAAAA", fontSize: "1rem", maxWidth: 520, margin: "0 auto" }}>
              Every feature is designed to turn raw trade data into specific, actionable improvements.
            </p>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }}>
            {features.map((f, i) => {
              const fRef = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={f.title} ref={fRef} className="fade-up card-hover lp-card" style={{ transitionDelay: `${i * 60}ms`,
                  background: "linear-gradient(145deg,#141108,#0c0a02)",
                  border: "1px solid rgba(245,197,24,0.12)",
                  borderRadius: "1rem", padding: "1.75rem",
                }}>
                  <div style={{ marginBottom: "0.875rem" }}>{f.ico}</div>
                  <h3 style={{ color: "#F5C518", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem", lineHeight: 1.4 }}>{f.title}</h3>
                  <p style={{ color: "#AAAAAA", lineHeight: 1.75, margin: 0, fontSize: "0.9rem" }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "var(--cj-bg)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div ref={cmpRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.875rem" }}>
              Why Serious MT5 Traders <span className="shimmer-text">Choose NIRI</span>
            </h2>
          </div>
          <div className="lp-card lp-surface" style={{ background: "linear-gradient(145deg,#141108,#0c0a02)", border: "1px solid rgba(245,197,24,0.15)", borderRadius: "1.25rem", overflow: "hidden" }}>
            <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(245,197,24,0.06)" }}>
                  <th style={{ padding: "1rem 1rem", textAlign: "left", color: "#AAAAAA", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em" }}>FEATURE</th>
                  <th style={{ padding: "1rem 1rem", textAlign: "center", color: "#F5C518", fontSize: "0.9375rem", fontWeight: 800, borderLeft: "2px solid rgba(245,197,24,0.3)" }}>NIRI</th>
                  <th style={{ padding: "1rem 1rem", textAlign: "center", color: "#888888", fontSize: "0.8125rem", fontWeight: 600 }}>TradeZella</th>
                </tr>
              </thead>
              <tbody>
                <CmpRow label="MT5 direct auto-sync" niri="Yes" other="Yes" />
                <CmpRow label="Coaching reports" niri="Behavior-based pattern analysis" other="Session summary only" highlight />
                <CmpRow label="Emotion tracking per trade" niri="Yes" other="No" />
                <CmpRow label="Trade visualized on live chart" niri="Yes" other="No" highlight />
                <CmpRow label="Psychology report tab" niri="Yes" other="No" />
                <CmpRow label="Report types" niri="8 full report types" other="Overview and basic metrics only" highlight />
                <CmpRow label="Referral earnings program" niri="Yes" other="No" />
                <CmpRow label="African broker support" niri="WAT timezone, African broker support" other="No regional optimization" highlight />
                <CmpRow label="Monthly price" niri="₦15,000/month" other="$29 to $49" />
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: "center", color: "#F5C518", fontWeight: 800, fontSize: "1.25rem", marginTop: "2rem" }}>
            Same capability. A fraction of the price.
          </p>
        </div>
      </section>

      {/* ── APP PREVIEW ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div ref={previewRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Built for Traders Serious About <span className="shimmer-text">Improvement</span>
            </h2>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>

            {/* Dashboard */}
            <div className="card-hover lp-card" style={{ background: "linear-gradient(145deg,#1a1508,#0f0c04)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: "1.25rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1rem 0.5rem", background: "rgba(245,197,24,0.04)", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
                <span style={{ color: "#AAAAAA", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em" }}>DASHBOARD</span>
              </div>
              <div style={{ padding: "1.25rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.625rem", marginBottom: "1rem" }}>
                  {[["P&L","$2,840","+18%","#4a9e4a"],["Win Rate","67%","up 4%","#F5C518"],["Rank","Gold","Top 12%","#C9A227"]].map(([l,v,s,c]) => (
                    <div key={l} style={{ background: "rgba(245,197,24,0.04)", borderRadius: "0.625rem", padding: "0.625rem 0.5rem", textAlign: "center" }}>
                      <div style={{ color: c as string, fontWeight: 700, fontSize: "1rem" }}>{v}</div>
                      <div style={{ color: "#888888", fontSize: "0.625rem", marginTop: 2 }}>{l}</div>
                      <div style={{ color: c as string, fontSize: "0.625rem" }}>{s}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "rgba(245,197,24,0.04)", borderRadius: "0.75rem", height: 64, overflow: "hidden" }}>
                  <svg viewBox="0 0 260 64" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F5C518" stopOpacity="0.25"/><stop offset="100%" stopColor="#F5C518" stopOpacity="0"/></linearGradient></defs>
                    <path d="M0,52 L40,46 L80,38 L120,32 L160,24 L200,18 L260,8" fill="none" stroke="#F5C518" strokeWidth="2"/>
                    <path d="M0,52 L40,46 L80,38 L120,32 L160,24 L200,18 L260,8 L260,64 L0,64Z" fill="url(#g1)"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Chart review */}
            <div className="card-hover lp-card" style={{ background: "linear-gradient(145deg,#1a1508,#0f0c04)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: "1.25rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1rem 0.5rem", background: "rgba(245,197,24,0.04)", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
                <span style={{ color: "#AAAAAA", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em" }}>CHART REVIEW</span>
              </div>
              <div style={{ padding: "1.25rem" }}>
                <div style={{ background: "#0a0800", borderRadius: "0.75rem", height: 90, marginBottom: "0.875rem", position: "relative", overflow: "hidden" }}>
                  <svg viewBox="0 0 260 90" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    {[10,30,20,40,28,50,38,55,45,60,50,65,42,58,48].map((y,i) => (
                      <rect key={i} x={i*18+4} y={y} width={10} height={90-y-4}
                        fill={i%3===0?"rgba(224,85,85,0.5)":"rgba(74,158,74,0.5)"} rx="1"/>
                    ))}
                    <line x1="0" y1="55" x2="260" y2="55" stroke="#4a9e4a" strokeWidth="1.5" strokeDasharray="5,3"/>
                    <line x1="0" y1="30" x2="260" y2="30" stroke="#F5C518" strokeWidth="1.5" strokeDasharray="5,3"/>
                  </svg>
                  <div style={{ position: "absolute", top: 4, right: 8, fontSize: "0.625rem", color: "#4a9e4a" }}>ENTRY</div>
                  <div style={{ position: "absolute", top: 22, right: 8, fontSize: "0.625rem", color: "#F5C518" }}>EXIT</div>
                </div>
                <div style={{ background: "rgba(74,158,74,0.08)", border: "1px solid rgba(74,158,74,0.2)", borderRadius: "0.625rem", padding: "0.625rem 0.875rem" }}>
                  <span style={{ color: "#4a9e4a", fontWeight: 700, fontSize: "0.875rem" }}>XAUUSD SELL  +$96.12</span>
                </div>
              </div>
            </div>

            {/* Psychology */}
            <div className="card-hover lp-card" style={{ background: "linear-gradient(145deg,#1a1508,#0f0c04)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: "1.25rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1rem 0.5rem", background: "rgba(245,197,24,0.04)", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
                <span style={{ color: "#AAAAAA", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em" }}>PSYCHOLOGY</span>
              </div>
              <div style={{ padding: "1.25rem" }}>
                {[["CONFIDENT","68%","#4a9e4a",68],["REVENGE","22%","#e05555",22],["FEARFUL","48%","#C9A227",48]].map(([em,pct,col,w]) => (
                  <div key={em as string} style={{ marginBottom: "0.875rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <span style={{ color: "#AAAAAA", fontSize: "0.75rem" }}>{em} trades</span>
                      <span style={{ color: col as string, fontWeight: 700, fontSize: "0.75rem" }}>{pct} win rate</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${w}%`, background: col as string, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem", background: "var(--cj-bg)", borderTop: "1px solid rgba(245,197,24,0.08)", borderBottom: "1px solid rgba(245,197,24,0.08)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1.5rem" }}>
            <div ref={stat1.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem", fontVariantNumeric: "tabular-nums" }}>{stat1.val}</div>
              <div style={{ color: "#888888", fontSize: "0.875rem", marginTop: "0.375rem" }}>Trades Analysed</div>
            </div>
            <div ref={stat2.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem", fontVariantNumeric: "tabular-nums" }}>{stat2.val}</div>
              <div style={{ color: "#888888", fontSize: "0.875rem", marginTop: "0.375rem" }}>Active Traders</div>
            </div>
            <div ref={stat3.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem" }}>{stat3.val}</div>
              <div style={{ color: "#888888", fontSize: "0.875rem", marginTop: "0.375rem" }}>Report Types</div>
            </div>
            <div ref={stat4.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem" }}>${stat4.val}</div>
              <div style={{ color: "#888888", fontSize: "0.875rem", marginTop: "0.375rem" }}>Starting Price / mo</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div ref={pricingRef} className="fade-up" style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.875rem" }}>
              Invest in Your <span className="shimmer-text">Trading Education</span>
            </h2>
            <p style={{ color: "#AAAAAA", fontSize: "1rem", maxWidth: 560, margin: "0 auto" }}>
              Behavioral mistakes cost the average trader $200 to $500 per month. NIRI costs ₦15,000/month. The math is straightforward.
            </p>
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: 800, margin: "3rem auto 0" }}>

            <div className="lp-card" style={{ background: "linear-gradient(145deg,#141108,#0c0a02)", border: "1px solid rgba(245,197,24,0.15)", borderRadius: "1.375rem", padding: "2.25rem" }}>
              <p style={{ color: "#AAAAAA", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "0.5rem", textTransform: "uppercase" }}>Free</p>
              <p style={{ color: "#AAAAAA", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Start tracking with no credit card</p>
              <div style={{ marginBottom: "1.75rem" }}>
                <span style={{ color: "var(--cj-text)", fontWeight: 900, fontSize: "2.75rem", letterSpacing: "-0.03em" }}>₦0</span>
                <span style={{ color: "#888888", fontSize: "0.875rem" }}> / month</span>
              </div>
              <CheckItem text="Up to 20 trades per month" dim />
              <CheckItem text="Manual trade entry" dim />
              <CheckItem text="Basic dashboard" dim />
              <CheckItem text="3 AI analyses per month" dim />
              <CheckItem text="1 trading account" dim />
              <Link href="/login">
                <button className="outline-btn" style={{ width: "100%", padding: "0.9375rem", fontSize: "0.9375rem", marginTop: "1.75rem" }}>
                  Start Free
                </button>
              </Link>
            </div>

            <div className="lp-card" style={{ background: "linear-gradient(145deg,#1e1a06,#131000)", border: "2px solid #F5C518", borderRadius: "1.375rem", padding: "2.25rem", position: "relative", boxShadow: "0 0 50px rgba(245,197,24,0.1)" }}>
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0a0800", fontWeight: 800, fontSize: "0.75rem", padding: "0.3rem 1.25rem", borderRadius: "2rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                ALL FEATURES
              </div>
              <p style={{ color: "#F5C518", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "0.5rem", textTransform: "uppercase" }}>Pro</p>
              <p style={{ color: "#AAAAAA", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Everything you need to improve as a trader</p>
              <div style={{ marginBottom: "1.75rem" }}>
                <span style={{ color: "var(--cj-text)", fontWeight: 900, fontSize: "2.75rem", letterSpacing: "-0.03em" }}>₦15,000</span>
                <span style={{ color: "#888888", fontSize: "0.875rem" }}> / month</span>
              </div>
              <CheckItem text="Unlimited trades + MT5 EA Sync" />
              <CheckItem text="Full dashboard, reports, chart review" />
              <CheckItem text="Trade journal with emotions" />
              <CheckItem text="Market Intelligence (AI setups)" />
              <CheckItem text="90 AI analyses per month" />
              <CheckItem text="Strategy Library + 10 accounts" />
              <CheckItem text="Referral earnings + priority support" />
              <Link href="/login">
                <button className="gold-btn" style={{ width: "100%", padding: "0.9375rem", fontSize: "0.9375rem", marginTop: "1.75rem" }}>
                  Get Pro, Start Free
                </button>
              </Link>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: "2rem" }}>
            <p style={{ color: "#888888", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Start free, upgrade when ready.</p>
            <p style={{ color: "#888888", fontSize: "0.875rem" }}>
              <IcoLock />Secured by Paystack. Cards, bank transfer and USSD accepted.
            </p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "var(--cj-bg)" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div ref={testRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Traders Who Stopped <span className="shimmer-text">Guessing</span>
            </h2>
          </div>
          {/* Placeholder testimonials — replace with real quotes when available */}
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>
            {[
              { name: "Emeka O.", location: "Lagos, Nigeria", badge: "Gold Trader",
                text: "I knew I was revenge trading but I could not stop. NIRI showed me I lose 80% of trades placed after 2 losses. Seeing the data made me respect the rule." },
              { name: "Kwame A.", location: "Accra, Ghana", badge: "Diamond Trader",
                text: "The chart trade review is the feature I use most. I can click any losing trade and see exactly where I went wrong on the actual candle." },
              { name: "Fatima M.", location: "Nairobi, Kenya", badge: "Gold Trader",
                text: "NIRI costs ₦15,000 per month. It helped me fix a behavioral pattern that was costing me $400 per month. It paid for itself in the first week." },
            ].map((t, i) => {
              const tRef = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={t.name} ref={tRef} className="fade-up card-hover lp-card" style={{ transitionDelay: `${i * 100}ms`,
                  background: "linear-gradient(145deg,#141108,#0c0a02)",
                  border: "1px solid rgba(245,197,24,0.12)",
                  borderRadius: "1.25rem", padding: "2rem",
                }}>
                  <div style={{ display: "flex", gap: 2, marginBottom: "1rem" }}>
                    {[1,2,3,4,5].map(s => <IcoStar key={s} color="#F5C518" />)}
                  </div>
                  <p style={{ color: "#CCCCCC", lineHeight: 1.8, fontStyle: "italic", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>&ldquo;{t.text}&rdquo;</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#F5C518,#C9A227)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0800", fontSize: "1rem", flexShrink: 0 }}>{t.name[0]}</div>
                    <div>
                      <div style={{ color: "var(--cj-text)", fontWeight: 700, fontSize: "0.875rem" }}>{t.name}</div>
                      <div style={{ color: "#888888", fontSize: "0.8125rem" }}>{t.location}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: 2 }}>
                        <IcoAward color="#C9A227" size={12} />
                        <span style={{ color: "#C9A227", fontSize: "0.75rem" }}>{t.badge}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── DERIV TRADERS ────────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem", background: "var(--cj-bg)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", alignItems: "center" }} className="grid-2">
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.2)",
                borderRadius: "2rem", padding: "0.3rem 0.875rem",
                color: "#F5C518", fontSize: "0.75rem", fontWeight: 700,
                marginBottom: "1.5rem", letterSpacing: "0.05em",
              }}>
                <IcoGlobe color="#F5C518" />
                <span>Deriv MT5 Traders</span>
              </div>
              <h2 style={{ fontSize: "clamp(1.625rem,3.5vw,2.375rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "1rem", lineHeight: 1.2 }}>
                Trade Synthetic Indices on <span className="shimmer-text">Deriv?</span>
              </h2>
              <p style={{ color: "#CCCCCC", fontSize: "1rem", lineHeight: 1.8, marginBottom: "1.5rem" }}>
                NIRI fully supports Deriv MT5 accounts including Volatility indices, Boom and Crash,
                Step Index and all synthetic instruments. Connect your Deriv MT5 account and finally
                understand your performance with clarity.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2rem" }}>
                {["Volatility 10/25/50/75/100", "Boom 500 & 1000", "Crash 500 & 1000", "Step Index", "Jump Indices"].map(t => (
                  <span key={t} style={{
                    background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.15)",
                    borderRadius: "0.375rem", padding: "0.25rem 0.625rem",
                    color: "#9a8050", fontSize: "0.8125rem",
                  }}>{t}</span>
                ))}
              </div>
              <Link href="/login">
                <button className="gold-btn" style={{ padding: "0.875rem 1.75rem", fontSize: "0.9375rem" }}>
                  Connect Deriv MT5 Account
                </button>
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {[
                { label: "Win rate by instrument", value: "Volatility 75: 61% · Crash 500: 48%" },
                { label: "Session analysis", value: "London open best for Boom 1000 (+78%)" },
                { label: "Risk exposure", value: "$2.40 average risk per synthetic trade" },
                { label: "Pattern detection", value: "Revenge trading after Crash 500 losses" },
              ].map(item => (
                <div key={item.label} className="lp-card" style={{
                  background: "linear-gradient(145deg,#1a1508,#0f0c04)",
                  border: "1px solid rgba(245,197,24,0.1)",
                  borderRadius: "0.875rem", padding: "1rem 1.25rem",
                }}>
                  <p style={{ color: "#AAAAAA", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{item.label}</p>
                  <p style={{ color: "#c0a040", fontSize: "0.9rem", fontWeight: 600 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,197,24,0.03) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Frequently Asked <span className="shimmer-text">Questions</span>
            </h2>
          </div>
          <div className="lp-card lp-surface" style={{ background: "linear-gradient(145deg,#0f0c04,#080600)", border: "1px solid rgba(245,197,24,0.1)", borderRadius: "1.25rem", padding: "0.5rem 2rem" }}>
            <FaqItem q="How is NIRI different from TradeZella?"
              a="NIRI is built specifically for MT5 traders and costs 70% less (₦15,000/month compared to $29–$49/month). NIRI also includes features TradeZella does not: emotion tracking per trade, trade visualization on a live chart, a dedicated Psychology report tab, and a referral earnings program." />
            <FaqItem q="Do I need to manually import my trades?"
              a="No. Download the free NiriEA, attach it to any chart in MT5, and trades sync automatically the moment they close. No manual work is required." />
            <FaqItem q="How does the coaching report work?"
              a="After each session, NIRI analyses your trade history and generates a report covering your best and worst trades, behavioral patterns such as revenge trading or early exits, and specific observations for the next session." />
            <FaqItem q="Is it free to start?"
              a="Yes. No credit card is required to create an account. Upgrade to Pro (₦15,000/month) when you want access to all features." />
            <FaqItem q="Which brokers does NIRI support?"
              a="NIRI works with any broker that provides an MT5 platform. This includes Exness, ICMarkets, HFM, FBS, OctaFX, XM, Deriv and hundreds more." />
            <FaqItem q="Is my trading data secure?"
              a="Yes. All data is encrypted at rest and in transit. Your trading data is private and is never shared with third parties. You can export or delete your data at any time." />
            <FaqItem q="What if I trade on MT4?"
              a="NIRI is optimized for MT5. MT4 support is planned for a future release. MT4 trades can be logged manually in the meantime." />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "8rem 1.5rem", background: "var(--cj-bg)" }}>
        <div ref={ctaRef} className="fade-up" style={{ maxWidth: 660, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(2rem,5.5vw,3.25rem)", fontWeight: 900, color: "#f0e6c8", lineHeight: 1.1, marginBottom: "1.25rem", letterSpacing: "-0.02em" }}>
            Stop Repeating the<br />Same Mistakes.
          </h2>
          <p style={{ color: "#CCCCCC", fontSize: "1.0625rem", lineHeight: 1.8, marginBottom: "2.5rem", maxWidth: 500, margin: "0 auto 2.5rem" }}>
            Create a free account, connect your MT5, and receive your first coaching report after your next session.
          </p>
          <Link href="/login">
            <button className="gold-btn" style={{ padding: "1.0625rem 2.75rem", fontSize: "1.125rem", marginBottom: "1rem", animation: "pulseGold 2.5s ease infinite" }}>
              Start Free, No Card Needed
            </button>
          </Link>
          <div style={{ marginTop: "0.75rem" }}>
            <a href="#pricing" style={{ color: "#888888", fontSize: "0.9375rem", textDecoration: "underline", cursor: "pointer" }}>See Pricing</a>
          </div>
          <p style={{ color: "#AAAAAA", fontSize: "0.875rem", marginTop: "1.5rem" }}>
            Join 500+ traders already using NIRI.
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ background: "var(--cj-surface)", borderTop: "1px solid rgba(245,197,24,0.07)", padding: "3.5rem 1.5rem 2rem" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "2.5rem", marginBottom: "3rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.75rem" }}>
                {/* Logo placeholder — swap with <img src="/logo.png"> when brand assets arrive */}
                <div style={{ width: 28, height: 28, borderRadius: "7px", background: "linear-gradient(135deg,#F5C518,#C9A227)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0800", fontSize: "0.75rem" }}>NI</div>
                <span style={{ fontWeight: 800, color: "var(--cj-text)", fontSize: "1rem", letterSpacing: "-0.01em" }}>NIRI</span>
              </div>
              <p style={{ color: "#AAAAAA", fontSize: "0.875rem", lineHeight: 1.65, maxWidth: 220 }}>
                Behavioral trading intelligence for MT5 traders worldwide.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                {[
                  { ico: <IcoTwitterX />, label: "Twitter" },
                  { ico: <IcoTelegram />, label: "Telegram" },
                  { ico: <IcoWhatsapp />, label: "WhatsApp" },
                ].map(({ ico, label }) => (
                  <a key={label} href="#" aria-label={label} className="lp-social-link" style={{ width: 32, height: 32, borderRadius: "8px", background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.1)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "background 0.2s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,197,24,0.15)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,197,24,0.08)")}
                  >{ico}</a>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ color: "#888888", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Product</h4>
              {[["Features","#features"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l,h]) => (
                <a key={l as string} href={h as string} style={{ display: "block", color: "#AAAAAA", fontSize: "0.875rem", textDecoration: "none", marginBottom: "0.625rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F5C518")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#AAAAAA")}>{l}</a>
              ))}
            </div>
            <div>
              <h4 style={{ color: "#888888", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Company</h4>
              {[["About","/"],["Contact","/"],["Privacy Policy","/"],["Terms of Service","/"]].map(([l,h]) => (
                <Link key={l as string} href={h as string} style={{ display: "block", color: "#AAAAAA", fontSize: "0.875rem", textDecoration: "none", marginBottom: "0.625rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F5C518")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#AAAAAA")}>{l}</Link>
              ))}
            </div>
            <div>
              <h4 style={{ color: "#888888", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Get Started</h4>
              <Link href="/login">
                <button className="gold-btn" style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem", marginBottom: "0.75rem", width: "100%" }}>Create Account</button>
              </Link>
              <Link href="/login">
                <button className="outline-btn" style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem", width: "100%" }}>Log In</button>
              </Link>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(245,197,24,0.06)", paddingTop: "1.5rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <span style={{ color: "#888888", fontSize: "0.8125rem" }}>© 2026 NIRI. All rights reserved.</span>
            <span style={{ color: "#888888", fontSize: "0.8125rem" }}>Built for African traders</span>
          </div>
        </div>
      </footer>
    </>
  );
}
