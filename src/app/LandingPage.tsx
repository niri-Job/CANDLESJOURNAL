"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

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
        color: "#f0e6c8", fontSize: "1rem", fontWeight: 600, gap: "1rem",
      }}>
        <span>{q}</span>
        <span style={{ color: "#F5C518", fontSize: "1.375rem", flexShrink: 0, transition: "transform 0.25s", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      <div style={{
        maxHeight: open ? "24rem" : "0", overflow: "hidden",
        transition: "max-height 0.35s ease", paddingBottom: open ? "1.375rem" : 0,
        color: "#8a7a5a", lineHeight: 1.75, fontSize: "0.9375rem",
      }}>{a}</div>
    </div>
  );
}

// ─── Comparison row ───────────────────────────────────────────────────────────
function CmpRow({ label, niri, other, highlight }: { label: string; niri: string; other: string; highlight?: boolean }) {
  return (
    <tr style={{ background: highlight ? "rgba(245,197,24,0.05)" : "transparent" }}>
      <td style={{ padding: "0.875rem 1rem", color: "#8a7a5a", fontSize: "0.9rem", borderBottom: "1px solid rgba(245,197,24,0.07)" }}>{label}</td>
      <td style={{ padding: "0.875rem 1rem", textAlign: "center", borderBottom: "1px solid rgba(245,197,24,0.07)", borderLeft: "2px solid rgba(245,197,24,0.3)" }}>
        <span style={{ color: "#F5C518", fontWeight: 700, fontSize: "0.9rem" }}>{niri}</span>
      </td>
      <td style={{ padding: "0.875rem 1rem", textAlign: "center", borderBottom: "1px solid rgba(245,197,24,0.07)" }}>
        <span style={{ color: "#4a3a1a", fontSize: "0.9rem" }}>{other}</span>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroCard, setHeroCard] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Rotate hero AI cards
  useEffect(() => {
    const id = setInterval(() => setHeroCard(c => (c + 1) % 3), 3600);
    return () => clearInterval(id);
  }, []);

  // Section refs
  const heroRef      = useFadeUp(0.05);
  const painRef      = useFadeUp();
  const howRef       = useFadeUp();
  const aiRef        = useFadeUp();
  const featRef      = useFadeUp();
  const cmpRef       = useFadeUp();
  const previewRef   = useFadeUp();
  const pricingRef   = useFadeUp();
  const testRef      = useFadeUp();
  const ctaRef       = useFadeUp();

  // Count-up stats
  const stat1 = useCountUp(10000, "+");
  const stat2 = useCountUp(500, "+");
  const stat3 = useCountUp(8, "");
  const stat4 = useCountUp(8, "");

  const heroCards = [
    {
      accent: "#e05555", bgAccent: "rgba(224,85,85,0.08)",
      icon: "⚠️", label: "Pattern Detected",
      text: "You lose 73% of trades placed after 2 consecutive losses. Revenge trading costs you $340/month on average.",
    },
    {
      accent: "#F5C518", bgAccent: "rgba(245,197,24,0.08)",
      icon: "💡", label: "Behavioral Insight",
      text: "You close winning trades 40% too early. If you held to your TP, your monthly profit would be $890 higher.",
    },
    {
      accent: "#4a9e4a", bgAccent: "rgba(74,158,74,0.08)",
      icon: "✅", label: "Strength Found",
      text: "Your XAUUSD SELL trades win 78% of the time during London session. This is your edge.",
    },
  ];

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #080600; color: #f0e6c8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        .fade-up { opacity: 0; transform: translateY(32px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .fade-up.in-view { opacity: 1; transform: translateY(0); }

        @keyframes cardRotate {
          0%   { opacity: 0; transform: translateY(12px) scale(0.97); }
          8%   { opacity: 1; transform: translateY(0)   scale(1); }
          88%  { opacity: 1; transform: translateY(0)   scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(0.97); }
        }
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
        .nav-a { color: #9a8a6a; font-size: 0.9375rem; text-decoration: none; transition: color 0.2s; font-weight: 500; }
        .nav-a:hover { color: #F5C518; }
        .card-hover { transition: transform 0.3s, box-shadow 0.3s; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(245,197,24,0.12); }

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
      `}</style>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: scrolled ? "56px" : "72px",
        padding: "0 1.5rem",
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
          <span style={{ fontWeight: 800, fontSize: "1.125rem", color: "#f0e6c8", letterSpacing: "-0.01em" }}>NIRI</span>
        </Link>

        <div className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: "2.25rem" }}>
          <a href="#why" className="nav-a">Why NIRI</a>
          <a href="#features" className="nav-a">Features</a>
          <a href="#pricing" className="nav-a">Pricing</a>
          <a href="#faq" className="nav-a">FAQ</a>
          <Link href="/login" className="nav-a">Log in</Link>
          <Link href="/login">
            <button className="gold-btn" style={{ padding: "0.5rem 1.25rem", fontSize: "0.875rem" }}>
              Start Free — No Card Needed
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
      <div style={{
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
            Start Free — No Card Needed
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
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.2)",
                borderRadius: "2rem", padding: "0.375rem 1rem",
                color: "#F5C518", fontSize: "0.8125rem", fontWeight: 600,
                marginBottom: "1.75rem", letterSpacing: "0.05em",
              }}>
                🤖 AI-Powered Trading Intelligence
              </div>

              <h1 style={{ fontSize: "clamp(2.25rem,5.5vw,3.75rem)", fontWeight: 900, lineHeight: 1.08, marginBottom: "1.375rem", letterSpacing: "-0.02em" }}>
                <span style={{ color: "#f0e6c8" }}>You&rsquo;re Not Losing</span>
                <br />
                <span style={{ color: "#f0e6c8" }}>Because of the</span>
                <br />
                <span className="shimmer-text">Market.</span>
              </h1>

              <p style={{ color: "#7a6a4a", fontSize: "1.125rem", lineHeight: 1.75, marginBottom: "0.75rem", maxWidth: 500, fontWeight: 500 }}>
                You&rsquo;re losing because of <strong style={{ color: "#c0a060" }}>YOU.</strong>
              </p>
              <p style={{ color: "#6a5a3a", fontSize: "1rem", lineHeight: 1.8, marginBottom: "2.25rem", maxWidth: 480 }}>
                NIRI connects to your MT5, studies every trade you take, and tells you exactly what behavioral patterns are costing you money — then coaches you on how to fix them.
              </p>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <Link href="/login">
                  <button className="gold-btn" style={{ padding: "0.9375rem 2rem", fontSize: "1.0625rem", animation: "pulseGold 2.5s ease infinite" }}>
                    Discover Your Trading Blindspots →
                  </button>
                </Link>
                <a href="#ai-showcase">
                  <button className="outline-btn" style={{ padding: "0.9375rem 1.75rem", fontSize: "1rem" }}>
                    See a Sample AI Report
                  </button>
                </a>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                {["No credit card required", "MT5 sync in under 5 minutes", "Cancel anytime"].map(t => (
                  <span key={t} style={{ color: "#4a3a1a", fontSize: "0.875rem" }}>• {t}</span>
                ))}
              </div>
            </div>

            {/* Right — rotating AI insight cards */}
            <div style={{ flex: "0 0 360px", position: "relative", height: 280 }}>
              {heroCards.map((card, i) => (
                <div key={i} style={{
                  position: "absolute", inset: 0,
                  opacity: heroCard === i ? 1 : 0,
                  transform: heroCard === i ? "translateY(0) scale(1)" : "translateY(14px) scale(0.97)",
                  transition: "opacity 0.7s ease, transform 0.7s ease",
                  animation: heroCard === i ? "float 4s ease-in-out infinite" : "none",
                }}>
                  <div style={{
                    background: `linear-gradient(145deg, #1a1508, #0f0c04)`,
                    border: `1px solid ${card.accent}40`,
                    borderLeft: `3px solid ${card.accent}`,
                    borderRadius: "1.25rem", padding: "2rem",
                    boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 30px ${card.accent}10`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
                      <span style={{ fontSize: "1.125rem" }}>{card.icon}</span>
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

      {/* ── PAIN — "Sound Familiar?" ─────────────────────────────────────────── */}
      <section id="why" style={{ padding: "7rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div ref={painRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Sound <span className="shimmer-text">Familiar?</span>
            </h2>
            <p style={{ color: "#4a3a1a", fontSize: "1rem" }}>Most traders already know these problems exist. NIRI proves them with data.</p>
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {[
              { icon: "😤", title: "You keep making the same mistakes", text: "You know you revenge trade. You know you overtrade on Fridays. But knowing isn't enough — you need data to prove it to yourself.", accent: "#e05555" },
              { icon: "📉", title: "You have no idea why you're losing", text: "Some weeks are great. Some are disasters. You can't figure out the pattern because you have no systematic way to review your trades.", accent: "#C9A227" },
              { icon: "⏰", title: "You don't review your trades consistently", text: "Spreadsheets are tedious. Screenshots get lost. You want to improve but the process is too painful, so you skip it.", accent: "#e05555" },
              { icon: "🤔", title: "You're not sure which setups actually work", text: "You have 3 strategies but no data on which one actually makes you money. You're trading on gut feel instead of evidence.", accent: "#C9A227" },
            ].map((p, i) => {
              const ref = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={p.title} ref={ref} className="fade-up card-hover" style={{ transitionDelay: `${i * 80}ms`,
                  background: "linear-gradient(145deg,#120f04,#0a0800)",
                  border: "1px solid rgba(245,197,24,0.08)",
                  borderLeft: `3px solid ${p.accent}60`,
                  borderRadius: "1rem", padding: "1.75rem",
                }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.875rem" }}>{p.icon}</div>
                  <h3 style={{ color: "#f0e6c8", fontWeight: 700, fontSize: "1.0625rem", marginBottom: "0.625rem" }}>{p.title}</h3>
                  <p style={{ color: "#5a4a2a", lineHeight: 1.75, fontSize: "0.9375rem" }}>{p.text}</p>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: "3rem" }}>
            <p style={{ color: "#F5C518", fontWeight: 800, fontSize: "1.375rem" }}>NIRI fixes all of this. Automatically.</p>
          </div>
        </div>
      </section>

      {/* ── HOW NIRI WORKS ───────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div ref={howRef} className="fade-up" style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Up and Running in <span className="shimmer-text">3 Steps</span>
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { n: "01", title: "Connect your MT5 in 5 minutes", desc: "Download the free NIRI EA, paste your sync token, and attach it to any chart. Done. Every trade you close syncs to your journal automatically — no manual entry ever." },
              { n: "02", title: "NIRI studies your trading behavior", desc: "Our AI analyses your entries, exits, timing, pairs, emotions and patterns. It builds a complete picture of how YOU trade — not how you think you trade." },
              { n: "03", title: "Get your personal coaching report", desc: "After every session, NIRI tells you your biggest mistakes, your hidden strengths, and exactly what to focus on to become more consistent." },
            ].map((step, i) => {
              const sRef = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={step.n} ref={sRef} className="fade-up" style={{ transitionDelay: `${i * 120}ms`, display: "flex", gap: "2rem", position: "relative", paddingBottom: i < 2 ? "2.75rem" : 0 }}>
                  {i < 2 && <div style={{ position: "absolute", left: 23, top: 56, width: 2, bottom: 0, background: "linear-gradient(180deg, rgba(245,197,24,0.35) 0%, rgba(245,197,24,0.04) 100%)" }} />}
                  <div style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#F5C518,#C9A227)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0800", fontSize: "0.875rem", zIndex: 1 }}>{step.n}</div>
                  <div>
                    <h3 style={{ color: "#f0e6c8", fontWeight: 700, fontSize: "1.1875rem", marginBottom: "0.5rem" }}>{step.title}</h3>
                    <p style={{ color: "#5a4a2a", lineHeight: 1.8, fontSize: "0.9375rem" }}>{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── AI SHOWCASE ──────────────────────────────────────────────────────── */}
      <section id="ai-showcase" style={{ padding: "7rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div ref={aiRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.875rem" }}>
              NIRI Doesn&rsquo;t Just <span className="shimmer-text">Track Trades.</span>
            </h2>
            <p style={{ color: "#5a4a2a", fontSize: "1rem", maxWidth: 480, margin: "0 auto" }}>
              It tells you the truth about your trading.
            </p>
          </div>

          {/* Mock AI Report Card */}
          <div style={{
            background: "linear-gradient(145deg,#1a1508,#0f0c04)",
            border: "1px solid rgba(245,197,24,0.25)",
            borderRadius: "1.5rem", overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 40px rgba(245,197,24,0.06)",
          }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", padding: "1rem 1.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: "#0a0800", fontSize: "0.9375rem", letterSpacing: "0.06em" }}>AI COACHING REPORT</span>
              <span style={{ color: "#0a0800", fontSize: "0.8125rem", opacity: 0.7 }}>Week of April 28, 2026</span>
            </div>
            {/* Body */}
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {[
                { icon: "🏆", label: "BEST TRADE", color: "#4a9e4a", text: "XAUUSD SELL — +$1,208 — Perfect execution. You waited for London open confirmation before entering. Do more of this." },
                { icon: "💀", label: "WORST TRADE", color: "#e05555", text: "GBPUSD BUY — -$5,409 — Entered against the trend during high-impact news. No setup. Pure impulse." },
                { icon: "🛑", label: "STOP DOING", color: "#e05555", text: "Trading after 2 consecutive losses. Your win rate drops from 67% to 18% when you do this." },
                { icon: "✅", label: "START DOING", color: "#4a9e4a", text: "Taking XAUUSD trades during London open. 78% win rate vs your overall 34%." },
              ].map((row) => (
                <div key={row.label} style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid rgba(245,197,24,0.07)", borderRight: "1px solid rgba(245,197,24,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
                    <span style={{ fontSize: "1rem" }}>{row.icon}</span>
                    <span style={{ color: row.color, fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em" }}>{row.label}</span>
                  </div>
                  <p style={{ color: "#9a8a6a", lineHeight: 1.7, fontSize: "0.9rem" }}>{row.text}</p>
                </div>
              ))}
            </div>
            {/* Focus */}
            <div style={{ padding: "1.5rem 1.75rem", background: "rgba(245,197,24,0.04)", borderTop: "1px solid rgba(245,197,24,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" }}>
                <span>💪</span>
                <span style={{ color: "#F5C518", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em" }}>THIS WEEK&rsquo;S FOCUS</span>
              </div>
              <p style={{ color: "#c0a060", fontWeight: 600, fontSize: "1rem" }}>One setup. One session. XAUUSD sells during London open only.</p>
            </div>
          </div>

          <p style={{ textAlign: "center", color: "#4a3a1a", fontSize: "0.875rem", margin: "1.5rem 0 2rem" }}>
            This report is generated automatically after every trading session.
          </p>
          <div style={{ textAlign: "center" }}>
            <Link href="/login">
              <button className="gold-btn" style={{ padding: "0.875rem 2.25rem", fontSize: "1rem" }}>
                Get Your First Report Free →
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
            <p style={{ color: "#5a4a2a", fontSize: "1rem", maxWidth: 520, margin: "0 auto" }}>
              Everything you need to understand your trading behavior and make deliberate improvements every week.
            </p>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }}>
            {[
              { icon: "⚡", title: "Your trades sync the moment they close", desc: "MT5 auto-sync via free EA. No spreadsheets, no screenshots, no manual entry. Ever." },
              { icon: "🤖", title: "Know exactly what to fix after every session", desc: "AI coaching reports — daily, weekly, monthly. Specific. Actionable. Personalized to YOUR data." },
              { icon: "📍", title: "See every trade on the actual chart", desc: "Click any trade → see your entry, exit, SL and TP drawn on the live chart. Understand what really happened." },
              { icon: "🧠", title: "Discover which emotion is costing you most", desc: "Tag trades with your emotion. NIRI shows you whether fear, greed or revenge trading is your biggest leak." },
              { icon: "📊", title: "See your real performance — not your imagined performance", desc: "Equity curve, win rate by pair, session performance, streak analysis — the full picture." },
              { icon: "📋", title: "8 types of reports that expose your patterns", desc: "Overview, Performance, Time, Risk, Psychology, Wins vs Losses, Streaks, Compare. More than any other journal." },
              { icon: "🔬", title: "Know which setups actually make you money", desc: "NIRI detects your winning patterns and tells you: focus here, avoid this, trade this session." },
              { icon: "🌍", title: "Works with any MT5 broker, anywhere", desc: "Exness, ICMarkets, HFM, Deriv, XM and hundreds more. Any country, any timezone." },
            ].map((f, i) => {
              const fRef = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={f.title} ref={fRef} className="fade-up card-hover" style={{ transitionDelay: `${i * 60}ms`,
                  background: "linear-gradient(145deg,#141108,#0c0a02)",
                  border: "1px solid rgba(245,197,24,0.12)",
                  borderRadius: "1rem", padding: "1.75rem",
                }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.875rem" }}>{f.icon}</div>
                  <h3 style={{ color: "#F5C518", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem", lineHeight: 1.4 }}>{f.title}</h3>
                  <p style={{ color: "#5a4a2a", lineHeight: 1.75, margin: 0, fontSize: "0.9rem" }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div ref={cmpRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.875rem" }}>
              Why Serious MT5 Traders <span className="shimmer-text">Choose NIRI</span>
            </h2>
          </div>
          <div style={{ background: "linear-gradient(145deg,#141108,#0c0a02)", border: "1px solid rgba(245,197,24,0.15)", borderRadius: "1.25rem", overflow: "hidden" }}>
            <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(245,197,24,0.06)" }}>
                  <th style={{ padding: "1rem 1rem", textAlign: "left", color: "#6a5a3a", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em" }}>FEATURE</th>
                  <th style={{ padding: "1rem 1rem", textAlign: "center", color: "#F5C518", fontSize: "0.9375rem", fontWeight: 800, borderLeft: "2px solid rgba(245,197,24,0.3)" }}>NIRI</th>
                  <th style={{ padding: "1rem 1rem", textAlign: "center", color: "#4a3a1a", fontSize: "0.8125rem", fontWeight: 600 }}>TradeZella</th>
                </tr>
              </thead>
              <tbody>
                <CmpRow label="MT5 direct auto-sync" niri="✅" other="✅" />
                <CmpRow label="AI coaching reports" niri="✅ Deeper" other="✅ Basic" highlight />
                <CmpRow label="Emotion tracking per trade" niri="✅" other="❌" />
                <CmpRow label="Trade visualized on live chart" niri="✅" other="❌" highlight />
                <CmpRow label="Psychology tab with insights" niri="✅" other="❌" />
                <CmpRow label="8 full report types" niri="✅" other="Limited" highlight />
                <CmpRow label="Referral earnings program" niri="✅" other="❌" />
                <CmpRow label="African broker support" niri="✅ Optimized" other="Partial" highlight />
                <CmpRow label="Monthly price" niri="$8 – $13" other="$29 – $49" />
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: "center", color: "#F5C518", fontWeight: 800, fontSize: "1.25rem", marginTop: "2rem" }}>
            Same power. A fraction of the price.
          </p>
        </div>
      </section>

      {/* ── APP PREVIEW ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div ref={previewRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Built for Traders Who Are <span className="shimmer-text">Serious About Improving</span>
            </h2>
          </div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>
            {/* Card 1 — Dashboard */}
            <div className="card-hover" style={{ background: "linear-gradient(145deg,#1a1508,#0f0c04)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: "1.25rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1rem 0.5rem", background: "rgba(245,197,24,0.04)", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
                <span style={{ color: "#6a5a3a", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em" }}>DASHBOARD</span>
              </div>
              <div style={{ padding: "1.25rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.625rem", marginBottom: "1rem" }}>
                  {[["P&L","$2,840","+18%","#4a9e4a"],["Win Rate","67%","↑4%","#F5C518"],["Badge","Gold","🏆","#C9A227"]].map(([l,v,s,c]) => (
                    <div key={l} style={{ background: "rgba(245,197,24,0.04)", borderRadius: "0.625rem", padding: "0.625rem 0.5rem", textAlign: "center" }}>
                      <div style={{ color: c as string, fontWeight: 700, fontSize: "1rem" }}>{v}</div>
                      <div style={{ color: "#3a2a0a", fontSize: "0.625rem", marginTop: 2 }}>{l}</div>
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

            {/* Card 2 — Chart trade review */}
            <div className="card-hover" style={{ background: "linear-gradient(145deg,#1a1508,#0f0c04)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: "1.25rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1rem 0.5rem", background: "rgba(245,197,24,0.04)", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
                <span style={{ color: "#6a5a3a", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em" }}>CHART REVIEW</span>
              </div>
              <div style={{ padding: "1.25rem" }}>
                <div style={{ background: "#0a0800", borderRadius: "0.75rem", height: 90, marginBottom: "0.875rem", position: "relative", overflow: "hidden" }}>
                  <svg viewBox="0 0 260 90" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    {/* Mock candles */}
                    {[10,30,20,40,28,50,38,55,45,60,50,65,42,58,48].map((y,i) => (
                      <rect key={i} x={i*18+4} y={y} width={10} height={90-y-4}
                        fill={i%3===0?"rgba(224,85,85,0.5)":"rgba(74,158,74,0.5)"} rx="1"/>
                    ))}
                    {/* Entry line */}
                    <line x1="0" y1="55" x2="260" y2="55" stroke="#4a9e4a" strokeWidth="1.5" strokeDasharray="5,3"/>
                    {/* Exit line */}
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

            {/* Card 3 — Psychology */}
            <div className="card-hover" style={{ background: "linear-gradient(145deg,#1a1508,#0f0c04)", border: "1px solid rgba(245,197,24,0.18)", borderRadius: "1.25rem", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1rem 0.5rem", background: "rgba(245,197,24,0.04)", borderBottom: "1px solid rgba(245,197,24,0.1)" }}>
                <span style={{ color: "#6a5a3a", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em" }}>PSYCHOLOGY</span>
              </div>
              <div style={{ padding: "1.25rem" }}>
                {[["😊 CONFIDENT","68%","#4a9e4a",68],["😤 REVENGE","22%","#e05555",22],["😨 FEARFUL","48%","#C9A227",48]].map(([em,pct,col,w]) => (
                  <div key={em as string} style={{ marginBottom: "0.875rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <span style={{ color: "#8a7a5a", fontSize: "0.75rem" }}>{em} trades</span>
                      <span style={{ color: col as string, fontWeight: 700, fontSize: "0.75rem" }}>{pct} win rate</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${w}%`, background: col as string, borderRadius: 3, transition: "width 1s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem", background: "#080600", borderTop: "1px solid rgba(245,197,24,0.08)", borderBottom: "1px solid rgba(245,197,24,0.08)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1.5rem" }}>
            <div ref={stat1.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem", fontVariantNumeric: "tabular-nums" }}>{stat1.val}</div>
              <div style={{ color: "#3a2a0a", fontSize: "0.875rem", marginTop: "0.375rem" }}>Trades Analysed</div>
            </div>
            <div ref={stat2.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem", fontVariantNumeric: "tabular-nums" }}>{stat2.val}</div>
              <div style={{ color: "#3a2a0a", fontSize: "0.875rem", marginTop: "0.375rem" }}>Active Traders</div>
            </div>
            <div ref={stat3.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem" }}>{stat3.val}</div>
              <div style={{ color: "#3a2a0a", fontSize: "0.875rem", marginTop: "0.375rem" }}>Report Types</div>
            </div>
            <div ref={stat4.ref} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 900, fontSize: "2.5rem" }}>${stat4.val}</div>
              <div style={{ color: "#3a2a0a", fontSize: "0.875rem", marginTop: "0.375rem" }}>Starting Price / mo</div>
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
            <p style={{ color: "#5a4a2a", fontSize: "1rem", maxWidth: 560, margin: "0 auto" }}>
              The average trader loses $200–500/month to behavioral mistakes. NIRI costs less than $15. The math is simple.
            </p>
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: 800, margin: "3rem auto 0" }}>

            {/* Starter */}
            <div style={{ background: "linear-gradient(145deg,#141108,#0c0a02)", border: "1px solid rgba(245,197,24,0.15)", borderRadius: "1.375rem", padding: "2.25rem" }}>
              <p style={{ color: "#6a5a3a", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "0.5rem", textTransform: "uppercase" }}>Starter</p>
              <p style={{ color: "#5a4a2a", fontSize: "0.875rem", marginBottom: "1.5rem" }}>For traders who want to start tracking properly</p>
              <div style={{ marginBottom: "1.75rem" }}>
                <span style={{ color: "#f0e6c8", fontWeight: 900, fontSize: "2.75rem", letterSpacing: "-0.03em" }}>$8</span>
                <span style={{ color: "#3a2a0a", fontSize: "0.875rem" }}> / month</span>
              </div>
              {[
                "Unlimited trade sync from MT5",
                "Smart dashboard + equity curve",
                "Trade journal with notes & emotions",
                "Live chart with entry/exit visualization",
                "Market news + economic calendar",
                "10 AI coaching reports per month",
                "Referral earnings program",
              ].map(f => (
                <div key={f} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <span style={{ color: "#F5C518", flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ color: "#7a6a4a", fontSize: "0.9375rem", lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
              <Link href="/login">
                <button className="outline-btn" style={{ width: "100%", padding: "0.9375rem", fontSize: "0.9375rem", marginTop: "1.75rem" }}>
                  Start Tracking Free
                </button>
              </Link>
            </div>

            {/* Pro */}
            <div style={{ background: "linear-gradient(145deg,#1e1a06,#131000)", border: "2px solid #F5C518", borderRadius: "1.375rem", padding: "2.25rem", position: "relative", boxShadow: "0 0 50px rgba(245,197,24,0.1)" }}>
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0a0800", fontWeight: 800, fontSize: "0.75rem", padding: "0.3rem 1.25rem", borderRadius: "2rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                MOST POPULAR
              </div>
              <p style={{ color: "#F5C518", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "0.5rem", textTransform: "uppercase" }}>Pro</p>
              <p style={{ color: "#7a6a4a", fontSize: "0.875rem", marginBottom: "1.5rem" }}>For traders serious about behavioral improvement</p>
              <div style={{ marginBottom: "1.75rem" }}>
                <span style={{ color: "#f0e6c8", fontWeight: 900, fontSize: "2.75rem", letterSpacing: "-0.03em" }}>$13</span>
                <span style={{ color: "#4a3a1a", fontSize: "0.875rem" }}> / month</span>
              </div>
              {[
                "Everything in Starter",
                "Unlimited AI coaching reports",
                "Full 8-tab performance reports",
                "Psychology insights + emotion analysis",
                "Strategy backtesting insights",
                "Priority support",
              ].map(f => (
                <div key={f} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <span style={{ color: "#F5C518", flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ color: "#c0b080", fontSize: "0.9375rem", lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
              <Link href="/login">
                <button className="gold-btn" style={{ width: "100%", padding: "0.9375rem", fontSize: "0.9375rem", marginTop: "1.75rem" }}>
                  Get Pro — Start Free
                </button>
              </Link>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: "2rem" }}>
            <p style={{ color: "#4a3a1a", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Both plans start FREE. Upgrade when ready.</p>
            <p style={{ color: "#3a2a0a", fontSize: "0.875rem" }}>💳 Secured by Paystack — cards, bank transfer, USSD</p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div ref={testRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.875rem,4vw,2.75rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Traders Who Stopped <span className="shimmer-text">Guessing</span>
            </h2>
          </div>
          {/* Placeholder testimonials — replace with real ones when available */}
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>
            {[
              { name: "Emeka O.", location: "Lagos, Nigeria", flag: "🇳🇬", badge: "Gold Trader Badge",
                text: "I knew I was revenge trading but I couldn't stop. NIRI showed me I lose 80% of trades placed after 2 losses. Seeing the data made me finally respect the rule." },
              { name: "Kwame A.", location: "Accra, Ghana", flag: "🇬🇭", badge: "Diamond Trader Badge",
                text: "The chart trade review is incredible. I can click any losing trade and see exactly where I went wrong on the actual candle. No other journal does this." },
              { name: "Fatima M.", location: "Nairobi, Kenya", flag: "🇰🇪", badge: "Gold Trader Badge",
                text: "NIRI costs me $13/month. It helped me fix a behavioral leak that was costing me $400/month. Best investment I've made in my trading." },
            ].map((t, i) => {
              const tRef = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={t.name} ref={tRef} className="fade-up card-hover" style={{ transitionDelay: `${i * 100}ms`,
                  background: "linear-gradient(145deg,#141108,#0c0a02)",
                  border: "1px solid rgba(245,197,24,0.12)",
                  borderRadius: "1.25rem", padding: "2rem",
                }}>
                  <div style={{ color: "#F5C518", fontSize: "1.125rem", marginBottom: "1rem" }}>★★★★★</div>
                  <p style={{ color: "#9a8a6a", lineHeight: 1.8, fontStyle: "italic", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>&ldquo;{t.text}&rdquo;</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#F5C518,#C9A227)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0800", fontSize: "1rem", flexShrink: 0 }}>{t.name[0]}</div>
                    <div>
                      <div style={{ color: "#f0e6c8", fontWeight: 700, fontSize: "0.875rem" }}>{t.name}</div>
                      <div style={{ color: "#3a2a0a", fontSize: "0.8125rem" }}>{t.flag} {t.location}</div>
                      <div style={{ color: "#C9A227", fontSize: "0.75rem", marginTop: 2 }}>🏆 {t.badge}</div>
                    </div>
                  </div>
                </div>
              );
            })}
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
          <div style={{ background: "linear-gradient(145deg,#0f0c04,#080600)", border: "1px solid rgba(245,197,24,0.1)", borderRadius: "1.25rem", padding: "0.5rem 2rem" }}>
            <FaqItem q="How is NIRI different from TradeZella?"
              a="NIRI is built specifically for MT5 traders and costs 60–70% less ($8–13/mo vs $29–49/mo). We also offer features TradeZella doesn't have — emotion tracking per trade, trade visualization on live charts, a dedicated Psychology report tab, and a referral earnings program." />
            <FaqItem q="Do I need to manually import my trades?"
              a="No. Download the free NIRI EA, add it to your MT5 chart, and trades sync automatically the moment they close. Zero manual work, zero copy-pasting." />
            <FaqItem q="How does the AI coaching work?"
              a="After each session, NIRI's AI analyses your trades and generates a coaching report with your best trade, worst trade, behavioral patterns (revenge trading, overtrading, early exits), and specific actions to take." />
            <FaqItem q="Is it free to start?"
              a="Yes — completely free to start. No credit card required. Upgrade to Starter ($8/mo) or Pro ($13/mo) when you're ready for advanced features." />
            <FaqItem q="Which brokers does NIRI support?"
              a="Any broker that supports MT5. This includes Exness, ICMarkets, HFM, FBS, OctaFX, XM, Deriv and hundreds more worldwide." />
            <FaqItem q="Is my trading data secure?"
              a="Yes. All data is encrypted with bank-grade security. Your trading data is private and never shared with anyone. You own your data and can export or delete it anytime." />
            <FaqItem q="What if I trade on MT4?"
              a="NIRI is currently optimized for MT5. MT4 support is on the roadmap. You can manually log MT4 trades in the meantime." />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "8rem 1.5rem", background: "#080600" }}>
        <div ref={ctaRef} className="fade-up" style={{ maxWidth: 660, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(2rem,5.5vw,3.25rem)", fontWeight: 900, color: "#f0e6c8", lineHeight: 1.1, marginBottom: "1.25rem", letterSpacing: "-0.02em" }}>
            Stop Repeating the<br />Same Mistakes.
          </h2>
          <p style={{ color: "#5a4a2a", fontSize: "1.0625rem", lineHeight: 1.8, marginBottom: "2.5rem", maxWidth: 500, margin: "0 auto 2.5rem" }}>
            Start your free account today. Connect your MT5. Get your first AI coaching report after your next session.
          </p>
          <Link href="/login">
            <button className="gold-btn" style={{ padding: "1.0625rem 2.75rem", fontSize: "1.125rem", marginBottom: "1rem", animation: "pulseGold 2.5s ease infinite" }}>
              Start Free — No Card Needed →
            </button>
          </Link>
          <div style={{ marginTop: "0.75rem" }}>
            <a href="#pricing" style={{ color: "#4a3a1a", fontSize: "0.9375rem", textDecoration: "underline", cursor: "pointer" }}>See Pricing</a>
          </div>
          <p style={{ color: "#2a1a04", fontSize: "0.875rem", marginTop: "1.5rem" }}>
            Join 500+ traders already using NIRI to trade smarter.
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#040300", borderTop: "1px solid rgba(245,197,24,0.07)", padding: "3.5rem 1.5rem 2rem" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "2.5rem", marginBottom: "3rem" }}>
            {/* Brand */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.75rem" }}>
                {/* Logo placeholder — swap with <img src="/logo.png"> when brand assets arrive */}
                <div style={{ width: 28, height: 28, borderRadius: "7px", background: "linear-gradient(135deg,#F5C518,#C9A227)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0800", fontSize: "0.75rem" }}>NI</div>
                <span style={{ fontWeight: 800, color: "#f0e6c8", fontSize: "1rem", letterSpacing: "-0.01em" }}>NIRI</span>
              </div>
              <p style={{ color: "#2a1a04", fontSize: "0.875rem", lineHeight: 1.65, maxWidth: 220 }}>
                AI-Powered Trading Intelligence for MT5 traders worldwide.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                {[["𝕏", "#"], ["✈️", "#"], ["💬", "#"]].map(([icon, href]) => (
                  <a key={icon as string} href={href as string} style={{ width: 32, height: 32, borderRadius: "8px", background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5C518", fontSize: "0.875rem", textDecoration: "none", transition: "background 0.2s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,197,24,0.15)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,197,24,0.08)")}
                  >{icon}</a>
                ))}
              </div>
            </div>
            {/* Product */}
            <div>
              <h4 style={{ color: "#4a3a1a", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Product</h4>
              {[["Features","#features"],["Pricing","#pricing"],["FAQ","#faq"]].map(([l,h]) => (
                <a key={l as string} href={h as string} style={{ display: "block", color: "#2a1a04", fontSize: "0.875rem", textDecoration: "none", marginBottom: "0.625rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F5C518")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#2a1a04")}>{l}</a>
              ))}
            </div>
            {/* Company */}
            <div>
              <h4 style={{ color: "#4a3a1a", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Company</h4>
              {[["About","/"],["Contact","/"],["Privacy Policy","/"],["Terms of Service","/"]].map(([l,h]) => (
                <Link key={l as string} href={h as string} style={{ display: "block", color: "#2a1a04", fontSize: "0.875rem", textDecoration: "none", marginBottom: "0.625rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F5C518")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#2a1a04")}>{l}</Link>
              ))}
            </div>
            {/* Get started */}
            <div>
              <h4 style={{ color: "#4a3a1a", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Get Started</h4>
              <Link href="/login">
                <button className="gold-btn" style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem", marginBottom: "0.75rem", width: "100%" }}>Create Account</button>
              </Link>
              <Link href="/login">
                <button className="outline-btn" style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem", width: "100%" }}>Log In</button>
              </Link>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(245,197,24,0.06)", paddingTop: "1.5rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <span style={{ color: "#1a0e02", fontSize: "0.8125rem" }}>© 2026 NIRI. All rights reserved.</span>
            <span style={{ color: "#1a0e02", fontSize: "0.8125rem" }}>Made with ♥ for African traders</span>
          </div>
        </div>
      </footer>
    </>
  );
}
