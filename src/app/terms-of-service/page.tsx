import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "NIRI Terms of Service — please read before using the platform.",
};

export default function TermsOfServicePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0F",
        color: "#F0E6D3",
        fontFamily: "var(--font-dm-sans, sans-serif)",
      }}
    >
      {/* Nav */}
      <header
        style={{
          borderBottom: "1px solid rgba(245,197,24,0.12)",
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <Link
          href="/"
          style={{
            color: "#F5C518",
            fontWeight: 800,
            fontSize: "1.125rem",
            textDecoration: "none",
            letterSpacing: "-0.02em",
          }}
        >
          NIRI
        </Link>
        <Link
          href="/login"
          style={{
            color: "#888888",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          Back to app
        </Link>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.5rem 6rem" }}>

        {/* ── Important Disclaimer ──────────────────────────────── */}
        <div
          style={{
            background: "rgba(245,197,24,0.06)",
            border: "1.5px solid rgba(245,197,24,0.35)",
            borderRadius: "1rem",
            padding: "2rem 2rem 1.75rem",
            marginBottom: "3rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#F5C518",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Important Disclaimer
            </h2>
          </div>

          <p style={{ color: "#DDDDDD", fontSize: "0.9375rem", lineHeight: 1.65, marginBottom: "1.25rem" }}>
            NIRI is a trade journaling and performance analytics tool.
            It is <strong style={{ color: "#FFFFFF" }}>NOT</strong> a financial advisor, broker, or investment service.
          </p>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
            }}
          >
            {[
              "NIRI does not provide financial advice",
              "Market Intelligence setups are for educational purposes only and should not be taken as trading signals",
              "Past performance shown in your journal does not guarantee future results",
              "Trading forex and financial instruments involves significant risk of loss",
              "Never trade with money you cannot afford to lose",
              "Always do your own research before making any trading decision",
              "NIRI is not responsible for any trading losses incurred while using the platform",
            ].map((item) => (
              <li key={item} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
                <span style={{ color: "#F5C518", marginTop: "0.2em", flexShrink: 0, fontSize: "0.75rem" }}>▸</span>
                <span style={{ color: "#CCCCCC", fontSize: "0.9rem", lineHeight: 1.55 }}>{item}</span>
              </li>
            ))}
          </ul>

          <p
            style={{
              color: "#AAAAAA",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              borderTop: "1px solid rgba(245,197,24,0.15)",
              paddingTop: "1rem",
              margin: 0,
            }}
          >
            By using NIRI, you acknowledge that you understand these risks and take full responsibility
            for your own trading decisions.
          </p>
        </div>

        {/* ── Page heading ─────────────────────────────────────── */}
        <h1
          style={{
            fontSize: "clamp(1.75rem,4vw,2.5rem)",
            fontWeight: 900,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
            marginBottom: "0.5rem",
          }}
        >
          Terms of Service
        </h1>
        <p style={{ color: "#666666", fontSize: "0.875rem", marginBottom: "3rem" }}>
          Last updated: May 2025
        </p>

        {/* ── Sections ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>

          <Section title="1. Acceptance of Terms">
            By accessing or using NIRI (&quot;the platform&quot;, &quot;the service&quot;), you agree to be bound
            by these Terms of Service and our Privacy Policy. If you do not agree, do not use the platform.
          </Section>

          <Section title="2. Description of Service">
            NIRI is a trade journaling and analytics platform designed to help traders track, review,
            and analyse their trading performance. The platform connects with MetaTrader 5 (MT5) to sync
            trade data automatically. All analytics, AI insights, and Market Intelligence content are
            provided strictly for informational and educational purposes.
          </Section>

          <Section title="3. No Financial Advice">
            Nothing on NIRI constitutes financial advice, investment advice, trading advice, or any other
            form of advice. Market Intelligence setups, AI coaching reports, and all other content are for
            educational and journaling purposes only. You should not act upon any information provided by
            NIRI without seeking independent professional financial advice. NIRI expressly disclaims all
            liability for any trading decisions made based on information or analysis provided by the platform.
          </Section>

          <Section title="4. Trading Risk Acknowledgement">
            Trading forex, commodities, and other financial instruments carries a high level of risk and
            may not be suitable for all investors. The high degree of leverage available in forex trading
            can work against you as well as for you. You must be aware of the risks and be willing to
            accept them in order to invest in these markets. Never trade with money you cannot afford to lose.
            Past performance — whether your own journal data or any example data shown on the platform —
            does not guarantee or predict future results.
          </Section>

          <Section title="5. Account Responsibilities">
            You are responsible for maintaining the confidentiality of your account credentials and for all
            activity that occurs under your account. You agree to notify NIRI immediately of any unauthorised
            use of your account. You must be at least 18 years old to use the platform.
          </Section>

          <Section title="6. Subscription and Billing">
            NIRI offers free trial access and paid subscription plans. Subscription fees are billed in
            advance and are non-refundable except as required by applicable law. NIRI reserves the right
            to modify pricing at any time with reasonable notice to subscribers.
          </Section>

          <Section title="7. Acceptable Use">
            You agree not to use NIRI to: (a) violate any applicable laws or regulations; (b) transmit
            any malicious code or interfere with the platform&apos;s infrastructure; (c) attempt to gain
            unauthorised access to any portion of the service; (d) use the platform to provide financial
            services to third parties without appropriate authorisation.
          </Section>

          <Section title="8. Intellectual Property">
            All content, features, and functionality of NIRI — including but not limited to text, graphics,
            logos, and software — are the exclusive property of NIRI and are protected by applicable
            intellectual property laws. You may not reproduce or distribute any part of the platform
            without express written permission.
          </Section>

          <Section title="9. Limitation of Liability">
            To the maximum extent permitted by law, NIRI and its affiliates shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, including but not limited
            to loss of profits or trading losses, arising from your use of — or inability to use — the
            platform. NIRI&apos;s total liability to you for any claim shall not exceed the amount you paid
            NIRI in the 12 months preceding the claim.
          </Section>

          <Section title="10. Indemnification">
            You agree to indemnify and hold harmless NIRI, its officers, directors, employees, and agents
            from any claims, damages, or expenses (including legal fees) arising from your use of the
            platform, your trading decisions, or your violation of these Terms.
          </Section>

          <Section title="11. Modifications to Terms">
            NIRI reserves the right to modify these Terms at any time. We will notify users of material
            changes via email or an in-app notice. Continued use of the platform after such changes
            constitutes your acceptance of the revised Terms.
          </Section>

          <Section title="12. Governing Law">
            These Terms are governed by and construed in accordance with applicable law. Any disputes
            arising from these Terms or your use of NIRI shall be resolved through good-faith negotiation
            before any formal legal proceedings.
          </Section>

          <Section title="13. Contact">
            If you have any questions about these Terms, please contact us at{" "}
            <a
              href="mailto:support@niri.live"
              style={{ color: "#F5C518", textDecoration: "underline" }}
            >
              support@niri.live
            </a>
            .
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "2rem 1.5rem",
          textAlign: "center",
        }}
      >
        <p style={{ color: "#444444", fontSize: "0.8125rem" }}>
          &copy; {new Date().getFullYear()} NIRI. All rights reserved. &nbsp;·&nbsp;{" "}
          <Link href="/" style={{ color: "#555555", textDecoration: "none" }}>
            Home
          </Link>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2
        style={{
          fontSize: "1.0625rem",
          fontWeight: 700,
          color: "#FFFFFF",
          marginBottom: "0.625rem",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <p style={{ color: "#AAAAAA", fontSize: "0.9rem", lineHeight: 1.7, margin: 0 }}>
        {children}
      </p>
    </div>
  );
}
