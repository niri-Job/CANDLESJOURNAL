"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const PRO_MONTHLY_KOBO = 1_500_000; // ₦15,000
const PRO_YEARLY_KOBO  = 16_200_000; // ₦13,500 × 12 = ₦162,000

const PRO_FEATURES = [
  "Unlimited trades",
  "MT5 EA Sync",
  "Full dashboard with all charts",
  "Trade journal (notes, screenshots, emotions)",
  "Market Intelligence (AI setups)",
  "90 AI analyses per month",
  "10 trading accounts",
  "Referral earnings program",
  "Priority support",
];

interface Props {
  isOpen:  boolean;
  onClose: () => void;
  /** Pre-fetched user email — avoids an extra DB call inside the modal */
  email?:  string;
  userId?: string;
  /** Called after payment is successfully verified */
  onSuccess?: () => void;
}

export function UpgradeModal({ isOpen, onClose, email, userId, onSuccess }: Props) {
  const [billing,     setBilling]     = useState<"monthly" | "yearly">("monthly");
  const [scriptReady, setScriptReady] = useState(false);
  const [paying,      setPaying]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);
  const [subEnd,      setSubEnd]      = useState<string | null>(null);

  // Load Paystack inline script once
  useEffect(() => {
    if (!isOpen) return;
    const SCRIPT_ID = "paystack-inline-js";
    if (document.getElementById(SCRIPT_ID)) {
      if (window.PaystackPop) setScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id    = SCRIPT_ID;
    script.src   = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => console.error("UpgradeModal: failed to load Paystack script");
    document.head.appendChild(script);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const verifyAndActivate = useCallback(async (reference: string) => {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/paystack/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reference }),
      });
      const data = await res.json() as { success?: boolean; error?: string; subscription_end?: string };
      if (data.success) {
        setSubEnd(data.subscription_end ?? null);
        setSuccess(true);
        onSuccess?.();
      } else {
        setError(data.error ?? "Payment verification failed. Contact support@niri.live with ref: " + reference);
      }
    } catch {
      setError("Network error. Contact support@niri.live with ref: " + reference);
    } finally {
      setPaying(false);
    }
  }, [onSuccess]);

  function openInlinePaystack() {
    if (!email || !userId || !scriptReady || !window.PaystackPop) return;
    const pubKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!pubKey) { setError("Paystack public key not configured."); return; }

    const amount = billing === "yearly" ? PRO_YEARLY_KOBO : PRO_MONTHLY_KOBO;
    const ref    = `niri_pro_${billing === "yearly" ? "yr" : "mo"}_${Date.now()}_${userId.slice(0, 8)}`;

    window.PaystackPop.setup({
      key:      pubKey,
      email,
      amount,
      currency: "NGN",
      ref,
      metadata: { user_id: userId, plan_type: "pro", billing_type: billing },
      callback: (response) => verifyAndActivate(response.reference),
      onClose:  () => setPaying(false),
    }).openIframe();
  }

  async function handlePay() {
    setError(null);
    // Prefer inline popup; fall back to server-side redirect
    if (scriptReady && window.PaystackPop && email && userId) {
      openInlinePaystack();
      return;
    }
    // Redirect flow (works when popup is blocked / script fails)
    setPaying(true);
    try {
      const res  = await fetch("/api/payments/initialize", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: "pro", billing }),
      });
      const data = await res.json() as { authorization_url?: string; error?: string };
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        setError(data.error ?? "Could not start payment. Try again.");
        setPaying(false);
      }
    } catch {
      setError("Network error. Try again or go to the pricing page.");
      setPaying(false);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md bg-[var(--cj-surface)] rounded-2xl overflow-hidden shadow-2xl"
        style={{ border: "1px solid rgba(245,197,24,0.25)", boxShadow: "0 0 80px -10px rgba(245,197,24,0.20)" }}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5"
             style={{ background: "linear-gradient(135deg, rgba(245,197,24,0.06) 0%, transparent 60%)" }}>
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg
                       text-zinc-500 hover:text-zinc-200 transition-colors"
            style={{ border: "1px solid var(--cj-border)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: "rgba(245,197,24,0.12)", border: "1px solid rgba(245,197,24,0.3)", color: "var(--cj-gold)" }}>
              Pro
            </span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">Upgrade to NIRI Pro</h2>
          <p className="text-sm text-zinc-500 mt-1">Everything you need to become a consistently profitable trader.</p>
        </div>

        {/* Success state */}
        {success ? (
          <div className="px-6 pb-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30
                            flex items-center justify-center text-2xl mx-auto mb-4">✓</div>
            <h3 className="text-lg font-bold text-zinc-100 mb-1">You&apos;re on Pro!</h3>
            <p className="text-sm text-zinc-400 mb-1">All Pro features are now unlocked.</p>
            {subEnd && <p className="text-xs text-zinc-600 mb-5">Active until {fmtDate(subEnd)}</p>}
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-bold text-[#0A0A0F]"
              style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
              Start Using Pro →
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6">

            {/* Billing toggle */}
            <div className="flex gap-0 bg-[var(--cj-raised)] rounded-xl p-1 mb-5">
              {(["monthly", "yearly"] as const).map((b) => (
                <button key={b} onClick={() => setBilling(b)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all
                    ${billing === b ? "text-[#0A0A0F]" : "text-zinc-500 hover:text-zinc-300"}`}
                  style={billing === b ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" } : undefined}>
                  {b === "monthly" ? "Monthly" : "Yearly — Save 10%"}
                </button>
              ))}
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-3xl font-bold text-zinc-100">
                {billing === "yearly" ? "₦13,500" : "₦15,000"}
              </span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            {billing === "yearly" ? (
              <p className="text-xs text-emerald-400 font-semibold mb-5">₦162,000 billed yearly · Save ₦18,000</p>
            ) : (
              <p className="text-xs text-zinc-600 mb-5">Billed monthly in NGN · Cancel anytime</p>
            )}

            {/* Feature list */}
            <ul className="space-y-2 mb-5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-300">
                  <span className="shrink-0 text-[var(--cj-gold)]">✓</span>{f}
                </li>
              ))}
            </ul>

            {/* Error */}
            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs leading-relaxed">
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-[#0A0A0F] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
              {paying ? "Processing…" : `Upgrade to Pro · ${billing === "yearly" ? "₦162,000/yr" : "₦15,000/mo"} →`}
            </button>

            <p className="text-center text-[11px] text-zinc-600 mt-3">
              Secured by Paystack ·{" "}
              <Link href="/pricing" onClick={onClose} className="hover:text-zinc-400 underline">
                View full pricing
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
