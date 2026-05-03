"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { User } from "@supabase/supabase-js";

// ─── Paystack global type ─────────────────────────────────────────────────────
declare global {
  interface Window {
    PaystackPop: {
      setup(config: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        metadata: Record<string, unknown>;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }): { openIframe(): void };
    };
  }
}

// ─── Plan content ─────────────────────────────────────────────────────────────
const FREE_FEATURES = [
  "Unlimited trades",
  "Manual trade entry",
  "Quick Connect (investor password)",
  "Basic dashboard & equity curve",
  "1 trading account",
];
const FREE_MISSING = [
  "No AI analysis",
  "No advanced charts",
];
const STARTER_FEATURES = [
  "Everything in Free",
  "Quick Connect for live accounts",
  "Up to 3 trading accounts",
  "30 AI analyses per month",
  "Full reports suite",
];
const PRO_FEATURES = [
  "Everything in Starter",
  "Up to 10 trading accounts",
  "90 AI analyses per month",
  "Market Intelligence (AI setups)",
  "Priority support",
];

// Monthly amounts in kobo (NGN)
const STARTER_MONTHLY_KOBO = 800_000;   // ₦8,000
const PRO_MONTHLY_KOBO     = 1_300_000; // ₦13,000
// Yearly = monthly × 12 × 0.9 (10% discount)
const STARTER_YEARLY_KOBO  = 864_000_0; // ₦86,400
const PRO_YEARLY_KOBO      = 1_404_000_0; // ₦140,400

interface SubProfile {
  subscription_status: string | null;
  subscription_end: string | null;
}

export default function PricingPage() {
  const [user, setUser]               = useState<User | null>(null);
  const [isPro, setIsPro]             = useState(false);
  const [isStarter, setIsStarter]     = useState(false);
  const [subEnd, setSubEnd]           = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [paying, setPaying]           = useState(false);
  const [payError, setPayError]       = useState<string | null>(null);
  const [paySuccess, setPaySuccess]   = useState(false);
  const [billing, setBilling]         = useState<"monthly" | "yearly">("monthly");
  const [payingPlan, setPayingPlan]   = useState<"starter" | "pro" | null>(null);

  // ── Load user + subscription ──────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const { data: raw } = await supabase
        .from("user_profiles")
        .select("subscription_status, subscription_end")
        .eq("user_id", user.id)
        .maybeSingle();
      const p = raw as SubProfile | null;

      const active = !!p?.subscription_end && new Date(p.subscription_end) > new Date();
      const pro = p?.subscription_status === "pro" && active;
      const starter = p?.subscription_status === "starter" && active;
      setIsPro(pro);
      setIsStarter(starter);
      setSubEnd(p?.subscription_end ?? null);
      setLoading(false);
    }
    init();
  }, []);

  // ── Inject Paystack script ────────────────────────────────────────────────
  useEffect(() => {
    const SCRIPT_ID = "paystack-inline-js";
    if (document.getElementById(SCRIPT_ID)) {
      if ((window as Window & { PaystackPop?: unknown }).PaystackPop) setScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => console.error("Failed to load Paystack script");
    document.head.appendChild(script);
  }, []);

  // ── Payment handlers ──────────────────────────────────────────────────────
  async function verifyAndActivate(reference: string) {
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json() as { success?: boolean; error?: string; subscription_end?: string };
      if (!res.ok || !data.success) {
        setPayError(data.error ?? "Payment verification failed. Please contact support.");
        return;
      }
      setIsPro(true);
      setSubEnd(data.subscription_end ?? null);
      setPaySuccess(true);
    } catch {
      setPayError(
        "Network error while verifying. Contact support with your Paystack reference: " + reference
      );
    } finally {
      setPaying(false);
    }
  }

  function openPaystack(plan: "starter" | "pro") {
    if (!user || !scriptReady || !process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) return;
    const isYearly = billing === "yearly";
    const amount = plan === "starter"
      ? (isYearly ? STARTER_YEARLY_KOBO : STARTER_MONTHLY_KOBO)
      : (isYearly ? PRO_YEARLY_KOBO     : PRO_MONTHLY_KOBO);
    const ref = `cj_${plan}_${isYearly ? "yr" : "mo"}_${Date.now()}_${user.id.slice(0, 8)}`;
    setPayingPlan(plan);
    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email: user.email!,
      amount,
      currency: "NGN",
      ref,
      metadata: { user_id: user.id, plan, billing_type: isYearly ? "yearly" : "monthly" },
      callback: (response) => verifyAndActivate(response.reference),
      onClose: () => setPayingPlan(null),
    });
    handler.openIframe();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
  }
  function daysLeft(iso: string) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">

      {/* HEADER */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-7 h-16
                         bg-[var(--cj-surface)] border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600
                            flex items-center justify-center text-sm font-bold text-white shrink-0">
              NI
            </div>
            <span className="font-semibold text-base tracking-tight hidden sm:block">
              NIRI
            </span>
          </Link>
          <span className="text-zinc-700 mx-1 hidden sm:block">·</span>
          <span className="text-sm text-zinc-400 hidden sm:block">Pricing</span>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-[11px] text-zinc-500 hidden sm:block">{user.email}</span>}
          <ThemeToggle />
          <Link href="/"
            className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-700
                       hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-12">

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Simple, affordable pricing</h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-md mx-auto">
            Built for African forex traders. Pay in Naira. No hidden fees.
          </p>
        </div>

        {/* Current plan banner */}
        {isPro && subEnd && (
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/30
                            rounded-xl px-5 py-3 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-emerald-400 font-semibold">Pro plan active</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">Expires {fmtDate(subEnd)} ({daysLeft(subEnd)} days)</span>
            </div>
          </div>
        )}

        {/* Success banner */}
        {paySuccess && (
          <div className="mb-8 px-5 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30
                          text-emerald-400 text-sm text-center">
            Payment confirmed — you now have Pro access.{" "}
            <Link href="/" className="underline hover:no-underline font-semibold">
              Go to dashboard →
            </Link>
          </div>
        )}

        {/* Error banner */}
        {payError && (
          <div className="mb-8 px-5 py-4 rounded-xl bg-rose-500/10 border border-rose-500/30
                          text-rose-400 text-sm">
            {payError}
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex justify-center mb-8">
          <div className="flex gap-0 bg-[var(--cj-surface)] border border-zinc-800 rounded-xl p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
                ${billing === "monthly" ? "text-[#0A0A0F]" : "text-zinc-500 hover:text-zinc-300"}`}
              style={billing === "monthly" ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" } : undefined}>
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
                ${billing === "yearly" ? "text-[#0A0A0F]" : "text-zinc-500 hover:text-zinc-300"}`}
              style={billing === "yearly" ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" } : undefined}>
              Yearly — Save 10%
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">

          {/* FREE */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7 flex flex-col">
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Free Plan</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold">₦0</span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              <p className="text-zinc-600 text-xs mt-1.5">No credit card required</p>
            </div>
            <ul className="space-y-3 flex-1 mb-7">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>{f}
                </li>
              ))}
              {FREE_MISSING.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-600">
                  <span className="shrink-0 mt-0.5">✕</span>{f}
                </li>
              ))}
            </ul>
            <div className="text-center py-2.5 rounded-xl border border-zinc-800 text-zinc-600 text-sm font-semibold">
              {!isPro && !isStarter ? "Current plan" : "Basic plan"}
            </div>
          </div>

          {/* STARTER */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7 flex flex-col">
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Starter Plan</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold">
                  {billing === "yearly" ? "₦7,200" : "₦8,000"}
                </span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              {billing === "yearly" ? (
                <p className="text-emerald-400 text-xs mt-1.5 font-semibold">₦86,400/year · Save ₦9,600</p>
              ) : (
                <p className="text-zinc-600 text-xs mt-1.5">Billed monthly · Paystack</p>
              )}
            </div>
            <ul className="space-y-3 flex-1 mb-7">
              {STARTER_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-200">
                  <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => openPaystack("starter")}
              disabled={paying || payingPlan !== null || !scriptReady || !user}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#3a3220,#2a2410)", border: "1px solid #5a4a30", color: "#d0b060" }}>
              {payingPlan === "starter" ? "Processing..." : isStarter ? "Renew Starter →" : "Get Starter →"}
            </button>
          </div>

          {/* PRO */}
          <div className="relative bg-[var(--cj-surface)] border-2 rounded-2xl p-7 flex flex-col"
               style={{ borderColor: "rgba(245,197,24,0.4)", boxShadow: "0 0 60px -10px rgba(245,197,24,0.15)" }}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="text-[11px] font-bold uppercase tracking-widest px-4 py-1 rounded-full whitespace-nowrap"
                    style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                Most Popular
              </span>
            </div>
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-widest font-medium mb-3" style={{ color: "var(--cj-gold)" }}>Pro Plan</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold">
                  {billing === "yearly" ? "₦11,700" : "₦13,000"}
                </span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              {billing === "yearly" ? (
                <p className="text-emerald-400 text-xs mt-1.5 font-semibold">₦140,400/year · Save ₦15,600</p>
              ) : (
                <p className="text-zinc-600 text-xs mt-1.5">Billed monthly · Paystack</p>
              )}
            </div>
            <ul className="space-y-3 flex-1 mb-7">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-200">
                  <span className="shrink-0 mt-0.5" style={{ color: "var(--cj-gold)" }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => openPaystack("pro")}
              disabled={paying || payingPlan !== null || !scriptReady || !user}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
              {payingPlan === "pro" ? "Processing..." : isPro ? "Renew Pro →" : "Upgrade to Pro →"}
            </button>
            <p className="text-center text-[11px] text-zinc-600 mt-3">Secured by Paystack</p>
          </div>
        </div>

        {/* Trust / FAQ row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              title: "Monthly, not annual",
              body: "Pay each month to keep Pro active. Your trades and history are never deleted if you don't renew.",
            },
            {
              title: "Secured by Paystack",
              body: "Nigeria's most trusted payment gateway. Supports cards, bank transfer, and USSD.",
            },
            {
              title: "Cancel anytime",
              body: "Just don't renew. No cancellation form, no drama. Your data stays in your account forever.",
            },
          ].map((item) => (
            <div key={item.title}
              className="bg-[var(--cj-surface)] border border-zinc-800 rounded-xl p-5">
              <p className="text-sm font-semibold text-zinc-200 mb-1.5">{item.title}</p>
              <p className="text-xs text-zinc-500 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
