"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ─── Scroll-triggered fade-up hook ───────────────────────────────────────────
function useFadeUp(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("in-view"); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(245,197,24,0.15)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", textAlign: "left", padding: "1.25rem 0",
          background: "none", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          color: "#f0e6c8", fontSize: "1rem", fontWeight: 600, gap: "1rem",
        }}
      >
        <span>{q}</span>
        <span style={{ color: "#F5C518", fontSize: "1.25rem", flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "rotate(0deg)" }}>+</span>
      </button>
      <div style={{
        maxHeight: open ? "20rem" : "0", overflow: "hidden",
        transition: "max-height 0.35s ease", paddingBottom: open ? "1.25rem" : 0,
        color: "#b0a080", lineHeight: 1.7, fontSize: "0.9375rem",
      }}>
        {a}
      </div>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay }: { icon: string; title: string; desc: string; delay: number }) {
  const ref = useFadeUp();
  return (
    <div ref={ref} className="fade-up" style={{ transitionDelay: `${delay}ms` }}>
      <div style={{
        background: "linear-gradient(145deg, #1a1508, #0f0c04)",
        border: "1px solid rgba(245,197,24,0.2)",
        borderRadius: "1rem", padding: "2rem",
        transition: "transform 0.3s, box-shadow 0.3s",
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 16px 40px rgba(245,197,24,0.15)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
      >
        <div style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>{icon}</div>
        <h3 style={{ color: "#F5C518", fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>{title}</h3>
        <p style={{ color: "#8a7a5a", lineHeight: 1.7, margin: 0, fontSize: "0.9375rem" }}>{desc}</p>
      </div>
    </div>
  );
}

// ─── Testimonial card ─────────────────────────────────────────────────────────
function TestimonialCard({ name, country, flag, text, delay }: { name: string; country: string; flag: string; text: string; delay: number }) {
  const ref = useFadeUp();
  return (
    <div ref={ref} className="fade-up" style={{ transitionDelay: `${delay}ms` }}>
      <div style={{
        background: "linear-gradient(145deg, #1a1508, #0f0c04)",
        border: "1px solid rgba(245,197,24,0.15)",
        borderRadius: "1rem", padding: "2rem",
      }}>
        <div style={{ color: "#F5C518", fontSize: "1.25rem", marginBottom: "1rem" }}>★★★★★</div>
        <p style={{ color: "#c0b080", lineHeight: 1.7, marginBottom: "1.5rem", fontStyle: "italic", fontSize: "0.9375rem" }}>&ldquo;{text}&rdquo;</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, #F5C518, #C9A227)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "#0a0800", fontSize: "1rem",
          }}>{name[0]}</div>
          <div>
            <div style={{ color: "#f0e6c8", fontWeight: 600, fontSize: "0.875rem" }}>{name}</div>
            <div style={{ color: "#6a5a3a", fontSize: "0.8125rem" }}>{flag} {country}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const heroRef = useFadeUp(0.05);
  const socialRef = useFadeUp();
  const howRef = useFadeUp();
  const pricingRef = useFadeUp();
  const ctaRef = useFadeUp();

  const features = [
    { icon: "📊", title: "Automatic Trade Import", desc: "Connect your MT5 account once and every trade syncs instantly. No manual entry, no spreadsheets." },
    { icon: "🤖", title: "AI Trade Coach", desc: "Get personalised feedback after every session. Identify patterns, emotional biases, and setup weaknesses." },
    { icon: "📈", title: "Performance Analytics", desc: "Equity curves, win rate by pair, session analysis, and risk distribution — all in one clean dashboard." },
    { icon: "📅", title: "Economic Calendar", desc: "See high-impact news events alongside your trades. Understand how macro data moves the pairs you trade." },
    { icon: "🌍", title: "Built for Africa", desc: "Supports popular African brokers, local time zones, and currency pairs active during African trading hours." },
    { icon: "🏆", title: "Performance Badges", desc: "Earn milestone badges as you improve. Track your journey from novice to consistent profitable trader." },
  ];

  const faqs = [
    { q: "Which MT5 brokers are supported?", a: "CandlesJournal works with any MT5 broker — HFM, Exness, XM, FBS, Deriv, FTMO, and more. If your broker provides an MT5 platform, you can connect it." },
    { q: "Is my trading data secure?", a: "Yes. Your data is encrypted at rest and in transit. We never share your trade data with third parties. You own your data and can export or delete it at any time." },
    { q: "What is the difference between Starter and Pro?", a: "Starter gives you the core journal with trade import and basic analytics. Pro unlocks the AI trade coach, advanced analytics, economic calendar integration, and priority support." },
    { q: "Can I try it for free?", a: "Yes — create a free account and journal your first 30 trades at no cost. No credit card required to get started." },
    { q: "How does the AI coach work?", a: "After each trading session, our AI reviews your trades, identifies recurring mistakes, and gives you a written coaching note with specific improvement tips." },
    { q: "Do you support prop firm accounts?", a: "Yes. You can connect funded accounts from FTMO, The Funded Trader, MyForexFunds, and other prop firms just like a regular MT5 account." },
    { q: "What currencies can I pay in?", a: "We accept payments in USD, NGN, KES, GHS, ZAR, and most other African currencies via Paystack and card payments." },
    { q: "Can I cancel my subscription anytime?", a: "Yes. Cancel with one click from your settings page. You keep access until the end of your billing period with no cancellation fees." },
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #080600; color: #f0e6c8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        .fade-up { opacity: 0; transform: translateY(28px); transition: opacity 0.65s ease, transform 0.65s ease; }
        .fade-up.in-view { opacity: 1; transform: translateY(0); }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(245,197,24,0.4); }
          70% { box-shadow: 0 0 0 16px rgba(245,197,24,0); }
          100% { box-shadow: 0 0 0 0 rgba(245,197,24,0); }
        }

        .hero-card { animation: float 4s ease-in-out infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, #F5C518 0%, #fffde7 40%, #F5C518 60%, #C9A227 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
        .gold-btn {
          background: linear-gradient(135deg, #F5C518, #C9A227);
          color: #0a0800;
          border: none;
          border-radius: 0.5rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .gold-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(245,197,24,0.35); }
        .outline-btn {
          background: transparent;
          color: #F5C518;
          border: 1.5px solid #F5C518;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .outline-btn:hover { background: rgba(245,197,24,0.12); }
        .nav-link { color: #b0a080; font-size: 0.9375rem; text-decoration: none; transition: color 0.2s; }
        .nav-link:hover { color: #F5C518; }
        .step-line { background: linear-gradient(180deg, #F5C518 0%, transparent 100%); }

        @media (max-width: 768px) {
          .features-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .hero-cols { flex-direction: column !important; }
          .footer-cols { flex-direction: column !important; gap: 2rem !important; }
        }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 1.5rem",
        height: scrolled ? "56px" : "72px",
        background: scrolled ? "rgba(8,6,0,0.96)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(245,197,24,0.12)" : "none",
        transition: "all 0.3s ease",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Logo — replace "CJ" text with <img src="/logo.png" alt="CandlesJournal" /> when brand assets arrive */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "8px",
            background: "linear-gradient(135deg, #F5C518, #C9A227)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, color: "#0a0800", fontSize: "0.875rem",
          }}>CJ</div>
          <span style={{ fontWeight: 700, fontSize: "1.0625rem", color: "#f0e6c8" }}>CandlesJournal</span>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }} className="desktop-nav">
          <a href="#features" className="nav-link">Features</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <a href="#faq" className="nav-link">FAQ</a>
          <Link href="/login" className="nav-link">Log in</Link>
          <Link href="/login">
            <button className="gold-btn" style={{ padding: "0.5rem 1.25rem", fontSize: "0.875rem" }}>Start Free</button>
          </Link>
        </div>

        {/* Hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0.5rem", display: "none" }}
          className="hamburger"
          aria-label="Toggle menu"
        >
          <div style={{ width: 22, height: 2, background: "#F5C518", marginBottom: 5, borderRadius: 2, transition: "all 0.2s", transform: menuOpen ? "rotate(45deg) translate(5px,5px)" : "none" }} />
          <div style={{ width: 22, height: 2, background: "#F5C518", marginBottom: 5, borderRadius: 2, opacity: menuOpen ? 0 : 1, transition: "opacity 0.2s" }} />
          <div style={{ width: 22, height: 2, background: "#F5C518", borderRadius: 2, transition: "all 0.2s", transform: menuOpen ? "rotate(-45deg) translate(5px,-5px)" : "none" }} />
        </button>
      </nav>

      {/* Mobile menu */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
        background: "rgba(8,6,0,0.98)", padding: "5rem 2rem 2rem",
        display: "flex", flexDirection: "column", gap: "1.5rem",
        transform: menuOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
      }}>
        <a href="#features" className="nav-link" style={{ fontSize: "1.25rem" }} onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#pricing" className="nav-link" style={{ fontSize: "1.25rem" }} onClick={() => setMenuOpen(false)}>Pricing</a>
        <a href="#faq" className="nav-link" style={{ fontSize: "1.25rem" }} onClick={() => setMenuOpen(false)}>FAQ</a>
        <Link href="/login" className="nav-link" style={{ fontSize: "1.25rem" }} onClick={() => setMenuOpen(false)}>Log in</Link>
        <Link href="/login" onClick={() => setMenuOpen(false)}>
          <button className="gold-btn" style={{ padding: "0.875rem 2rem", fontSize: "1rem", width: "100%", marginTop: "1rem" }}>Start Free</button>
        </Link>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: block !important; }
        }
      `}</style>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh", paddingTop: "80px",
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,197,24,0.08) 0%, transparent 70%), linear-gradient(180deg, #0a0800 0%, #080600 100%)",
        display: "flex", alignItems: "center",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem 1.5rem", width: "100%" }}>
          <div ref={heroRef} className="fade-up hero-cols" style={{ display: "flex", alignItems: "center", gap: "4rem", justifyContent: "space-between" }}>
            {/* Left */}
            <div style={{ flex: "1 1 480px", maxWidth: 560 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.25)",
                borderRadius: "2rem", padding: "0.375rem 1rem",
                color: "#F5C518", fontSize: "0.8125rem", fontWeight: 600,
                marginBottom: "1.5rem", letterSpacing: "0.04em",
              }}>
                <span>🌍</span> Built for African Forex Traders
              </div>
              <h1 style={{ fontSize: "clamp(2.25rem,5vw,3.5rem)", fontWeight: 800, lineHeight: 1.1, marginBottom: "1.25rem" }}>
                <span className="shimmer-text">Stop Guessing.</span>
                <br />
                <span style={{ color: "#f0e6c8" }}>Start Growing</span>
                <br />
                <span style={{ color: "#f0e6c8" }}>Your Trading.</span>
              </h1>
              <p style={{ color: "#8a7a5a", fontSize: "1.0625rem", lineHeight: 1.75, marginBottom: "2rem", maxWidth: 440 }}>
                The professional trading journal built for MT5 traders in Africa. Auto-import trades, get AI coaching, and turn losing habits into winning patterns.
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                <Link href="/login">
                  <button className="gold-btn" style={{ padding: "0.875rem 2rem", fontSize: "1rem", animation: "pulse-ring 2.5s ease infinite" }}>
                    Start Journaling Free →
                  </button>
                </Link>
                <a href="#features">
                  <button className="outline-btn" style={{ padding: "0.875rem 1.75rem", fontSize: "1rem" }}>
                    See How It Works
                  </button>
                </a>
              </div>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                {["✓ Free to start", "✓ No credit card", "✓ MT5 sync in 60s"].map(t => (
                  <span key={t} style={{ color: "#6a5a3a", fontSize: "0.875rem" }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Right — mock dashboard card */}
            <div style={{ flex: "1 1 380px", display: "flex", justifyContent: "center" }}>
              <div className="hero-card" style={{
                width: "100%", maxWidth: 380,
                background: "linear-gradient(145deg, #1a1508, #0f0c04)",
                border: "1px solid rgba(245,197,24,0.25)",
                borderRadius: "1.25rem", padding: "1.5rem",
                boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 40px rgba(245,197,24,0.06)",
              }}>
                {/* Mock header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                  <span style={{ color: "#f0e6c8", fontWeight: 700, fontSize: "0.9375rem" }}>This Month</span>
                  <span style={{ color: "#4a9e4a", fontSize: "0.8125rem", fontWeight: 600, background: "rgba(74,158,74,0.12)", padding: "0.25rem 0.625rem", borderRadius: "1rem" }}>+12.4%</span>
                </div>
                {/* Mock equity curve */}
                <div style={{ background: "rgba(245,197,24,0.04)", borderRadius: "0.75rem", height: 80, marginBottom: "1.25rem", overflow: "hidden", position: "relative" }}>
                  <svg viewBox="0 0 300 80" style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F5C518" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#F5C518" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,60 L30,55 L60,50 L90,45 L120,40 L150,35 L180,42 L210,30 L240,22 L270,18 L300,12" fill="none" stroke="#F5C518" strokeWidth="2" />
                    <path d="M0,60 L30,55 L60,50 L90,45 L120,40 L150,35 L180,42 L210,30 L240,22 L270,18 L300,12 L300,80 L0,80Z" fill="url(#eq)" />
                  </svg>
                </div>
                {/* Mock stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                  {[["Win Rate", "68%", "#4a9e4a"], ["Trades", "47", "#F5C518"], ["R:R", "1.8", "#F5C518"]].map(([label, val, color]) => (
                    <div key={label} style={{ background: "rgba(245,197,24,0.04)", borderRadius: "0.625rem", padding: "0.75rem 0.5rem", textAlign: "center" }}>
                      <div style={{ color: color as string, fontWeight: 700, fontSize: "1.0625rem" }}>{val}</div>
                      <div style={{ color: "#4a3a1a", fontSize: "0.6875rem", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {/* Mock recent trades */}
                {[["EUR/USD", "BUY", "+$24.50", "#4a9e4a"], ["GBP/JPY", "SELL", "-$8.20", "#e05555"], ["XAUUSD", "BUY", "+$61.00", "#4a9e4a"]].map(([pair, dir, pnl, col]) => (
                  <div key={pair} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid rgba(245,197,24,0.06)" }}>
                    <span style={{ color: "#c0b080", fontSize: "0.8125rem", fontWeight: 600 }}>{pair}</span>
                    <span style={{ fontSize: "0.6875rem", color: dir === "BUY" ? "#4a9e4a" : "#e05555", background: dir === "BUY" ? "rgba(74,158,74,0.1)" : "rgba(224,85,85,0.1)", padding: "0.1875rem 0.5rem", borderRadius: "1rem" }}>{dir}</span>
                    <span style={{ color: col as string, fontSize: "0.8125rem", fontWeight: 700 }}>{pnl}</span>
                  </div>
                ))}
                <div style={{ marginTop: "1rem", textAlign: "center" }}>
                  <span style={{ color: "#3a2a0a", fontSize: "0.75rem" }}>AI Coach: &ldquo;Reduce lot size on news events&rdquo;</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof Bar ───────────────────────────────────────────────── */}
      <section ref={socialRef} className="fade-up" style={{
        background: "rgba(245,197,24,0.04)", borderTop: "1px solid rgba(245,197,24,0.1)", borderBottom: "1px solid rgba(245,197,24,0.1)",
        padding: "1.5rem 1.5rem",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2rem 3rem", alignItems: "center" }}>
          {[
            ["🇳🇬 🇰🇪 🇬🇭 🇿🇦 🇪🇹", "Traders across Africa"],
            ["3,200+", "Trades journaled"],
            ["MT5", "Native integration"],
            ["AI", "Powered coaching"],
          ].map(([val, label]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ color: "#F5C518", fontWeight: 800, fontSize: "1.25rem" }}>{val}</div>
              <div style={{ color: "#4a3a1a", fontSize: "0.8125rem", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "6rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "1rem" }}>
              Everything You Need to Trade <span className="shimmer-text">Consistently</span>
            </h2>
            <p style={{ color: "#6a5a3a", fontSize: "1rem", maxWidth: 500, margin: "0 auto" }}>
              Stop trading blind. CandlesJournal gives you the data and coaching to make deliberate improvements every week.
            </p>
          </div>
          <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section style={{ padding: "6rem 1.5rem", background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,197,24,0.04) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div ref={howRef} className="fade-up" style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "1rem" }}>
              Up and Running in <span className="shimmer-text">3 Steps</span>
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { n: "01", title: "Connect your MT5 account", desc: "Enter your broker credentials once. CandlesJournal automatically imports your trade history and syncs new trades in real time." },
              { n: "02", title: "Review your journal", desc: "See every trade with full context — P&L, session, setup, screenshots, and notes. Filter, search, and annotate your history." },
              { n: "03", title: "Act on AI coaching", desc: "After each session the AI reviews your trades and delivers personalised coaching notes with specific actions to take next week." },
            ].map((step, i) => {
              const ref = useFadeUp(); // eslint-disable-line react-hooks/rules-of-hooks
              return (
                <div key={step.n} ref={ref} className="fade-up" style={{ transitionDelay: `${i * 120}ms`, display: "flex", gap: "2rem", position: "relative", paddingBottom: i < 2 ? "2.5rem" : 0 }}>
                  {/* Connecting line */}
                  {i < 2 && <div style={{ position: "absolute", left: 23, top: 56, width: 2, height: "calc(100% - 32px)", background: "linear-gradient(180deg, rgba(245,197,24,0.4) 0%, rgba(245,197,24,0.05) 100%)" }} />}
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #F5C518, #C9A227)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, color: "#0a0800", fontSize: "0.875rem", zIndex: 1,
                  }}>{step.n}</div>
                  <div>
                    <h3 style={{ color: "#f0e6c8", fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>{step.title}</h3>
                    <p style={{ color: "#6a5a3a", lineHeight: 1.7, fontSize: "0.9375rem" }}>{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: "6rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div ref={pricingRef} className="fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "1rem" }}>
              Simple, Transparent <span className="shimmer-text">Pricing</span>
            </h2>
            <p style={{ color: "#6a5a3a", fontSize: "1rem" }}>Start free. Upgrade when you&rsquo;re ready to go deeper.</p>
          </div>
          <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: 760, margin: "0 auto" }}>
            {/* Starter */}
            <div style={{
              background: "linear-gradient(145deg, #1a1508, #0f0c04)",
              border: "1px solid rgba(245,197,24,0.15)",
              borderRadius: "1.25rem", padding: "2rem",
            }}>
              <h3 style={{ color: "#c0a050", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>Starter</h3>
              <div style={{ marginBottom: "1.5rem" }}>
                <span style={{ color: "#f0e6c8", fontWeight: 800, fontSize: "2.5rem" }}>$8</span>
                <span style={{ color: "#4a3a1a", fontSize: "0.875rem" }}> / month</span>
              </div>
              {["MT5 auto-import", "Trade journal", "Basic analytics", "Up to 3 accounts", "Community access"].map(f => (
                <div key={f} style={{ display: "flex", gap: "0.625rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ color: "#F5C518", fontWeight: 700 }}>✓</span>
                  <span style={{ color: "#8a7a5a", fontSize: "0.9375rem" }}>{f}</span>
                </div>
              ))}
              <Link href="/login">
                <button className="outline-btn" style={{ width: "100%", padding: "0.875rem", fontSize: "0.9375rem", marginTop: "1.5rem" }}>Get Started</button>
              </Link>
            </div>

            {/* Pro */}
            <div style={{
              background: "linear-gradient(145deg, #1e1a06, #131000)",
              border: "2px solid #F5C518",
              borderRadius: "1.25rem", padding: "2rem", position: "relative",
              boxShadow: "0 0 40px rgba(245,197,24,0.1)",
            }}>
              <div style={{
                position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                background: "linear-gradient(135deg, #F5C518, #C9A227)",
                color: "#0a0800", fontWeight: 800, fontSize: "0.75rem",
                padding: "0.25rem 1rem", borderRadius: "1rem", letterSpacing: "0.05em",
                whiteSpace: "nowrap",
              }}>MOST POPULAR</div>
              <h3 style={{ color: "#F5C518", fontWeight: 700, fontSize: "1rem", marginBottom: "0.5rem" }}>Pro</h3>
              <div style={{ marginBottom: "1.5rem" }}>
                <span style={{ color: "#f0e6c8", fontWeight: 800, fontSize: "2.5rem" }}>$13</span>
                <span style={{ color: "#4a3a1a", fontSize: "0.875rem" }}> / month</span>
              </div>
              {["Everything in Starter", "AI trade coach", "Advanced analytics", "Economic calendar", "Unlimited accounts", "Priority support"].map(f => (
                <div key={f} style={{ display: "flex", gap: "0.625rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ color: "#F5C518", fontWeight: 700 }}>✓</span>
                  <span style={{ color: "#c0b080", fontSize: "0.9375rem" }}>{f}</span>
                </div>
              ))}
              <Link href="/login">
                <button className="gold-btn" style={{ width: "100%", padding: "0.875rem", fontSize: "0.9375rem", marginTop: "1.5rem" }}>Get Pro</button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section style={{ padding: "6rem 1.5rem", background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,197,24,0.03) 0%, transparent 70%)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Traders Across Africa <span className="shimmer-text">Love It</span>
            </h2>
          </div>
          <div className="testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
            <TestimonialCard name="Chukwuemeka A." country="Nigeria" flag="🇳🇬" delay={0}
              text="I was losing money every month and couldn't figure out why. Three weeks into using CandlesJournal the AI told me I was over-trading the London open. Fixed that one habit and I'm now profitable." />
            <TestimonialCard name="Amara K." country="Kenya" flag="🇰🇪" delay={100}
              text="The MT5 sync works perfectly with my Exness account. No more copy-pasting trades into spreadsheets. The analytics dashboard alone is worth the subscription." />
            <TestimonialCard name="Sipho M." country="South Africa" flag="🇿🇦" delay={200}
              text="As a prop firm trader I need detailed records for my review. CandlesJournal handles my FTMO account beautifully. The session analysis helped me pass my challenge." />
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: "6rem 1.5rem", background: "#080600" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 800, color: "#f0e6c8", marginBottom: "0.75rem" }}>
              Frequently Asked <span className="shimmer-text">Questions</span>
            </h2>
          </div>
          <div style={{ border: "1px solid rgba(245,197,24,0.1)", borderRadius: "1rem", padding: "0.5rem 2rem", background: "linear-gradient(145deg, #0f0c04, #080600)" }}>
            {faqs.map(faq => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "7rem 1.5rem", background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(245,197,24,0.07) 0%, transparent 70%)" }}>
        <div ref={ctaRef} className="fade-up" style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 800, color: "#f0e6c8", lineHeight: 1.15, marginBottom: "1.25rem" }}>
            Your Next Winning Trade <br /> Starts with a <span className="shimmer-text">Better Journal</span>
          </h2>
          <p style={{ color: "#6a5a3a", fontSize: "1.0625rem", lineHeight: 1.7, marginBottom: "2.5rem", maxWidth: 480, margin: "0 auto 2.5rem" }}>
            Join traders across Africa who use CandlesJournal to build the discipline, data, and habits that make a consistent trader.
          </p>
          <Link href="/login">
            <button className="gold-btn" style={{ padding: "1rem 2.5rem", fontSize: "1.0625rem", marginBottom: "1.25rem" }}>
              Create Your Free Account →
            </button>
          </Link>
          <div style={{ color: "#3a2a0a", fontSize: "0.875rem", marginTop: "1rem" }}>No credit card required · Cancel anytime</div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#040300", borderTop: "1px solid rgba(245,197,24,0.08)", padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="footer-cols" style={{ display: "flex", gap: "3rem", justifyContent: "space-between", marginBottom: "2.5rem" }}>
            {/* Brand */}
            <div style={{ flex: "0 0 auto", maxWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.875rem" }}>
                {/* Logo placeholder — swap with <img src="/logo.png"> when brand assets arrive */}
                <div style={{ width: 28, height: 28, borderRadius: "7px", background: "linear-gradient(135deg, #F5C518, #C9A227)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0800", fontSize: "0.75rem" }}>CJ</div>
                <span style={{ fontWeight: 700, color: "#f0e6c8", fontSize: "0.9375rem" }}>CandlesJournal</span>
              </div>
              <p style={{ color: "#3a2a0a", fontSize: "0.875rem", lineHeight: 1.6 }}>
                The professional trading journal for African MT5 traders.
              </p>
            </div>
            {/* Product */}
            <div>
              <h4 style={{ color: "#6a5a3a", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Product</h4>
              {["Features", "Pricing", "FAQ"].map(l => (
                <a key={l} href={`#${l.toLowerCase()}`} style={{ display: "block", color: "#3a2a0a", fontSize: "0.875rem", textDecoration: "none", marginBottom: "0.625rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F5C518")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#3a2a0a")}>{l}</a>
              ))}
            </div>
            {/* Company */}
            <div>
              <h4 style={{ color: "#6a5a3a", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Company</h4>
              {[["About", "/"], ["Contact", "/"], ["Privacy Policy", "/"], ["Terms of Service", "/"]].map(([l, h]) => (
                <Link key={l} href={h} style={{ display: "block", color: "#3a2a0a", fontSize: "0.875rem", textDecoration: "none", marginBottom: "0.625rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F5C518")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#3a2a0a")}>{l}</Link>
              ))}
            </div>
            {/* Get started */}
            <div>
              <h4 style={{ color: "#6a5a3a", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "1rem", textTransform: "uppercase" }}>Get Started</h4>
              <Link href="/login">
                <button className="gold-btn" style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem", marginBottom: "0.75rem", width: "100%" }}>Create Account</button>
              </Link>
              <Link href="/login">
                <button className="outline-btn" style={{ padding: "0.625rem 1.5rem", fontSize: "0.875rem", width: "100%" }}>Log In</button>
              </Link>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(245,197,24,0.06)", paddingTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <span style={{ color: "#2a1a04", fontSize: "0.8125rem" }}>© 2026 CandlesJournal. All rights reserved.</span>
            <span style={{ color: "#2a1a04", fontSize: "0.8125rem" }}>Made with ♥ for African traders</span>
          </div>
        </div>
      </footer>
    </>
  );
}
