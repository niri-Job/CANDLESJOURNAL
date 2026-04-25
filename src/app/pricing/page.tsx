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
  "Up to 20 trades per month",
  "Manual trade entry only",
  "Basic dashboard & equity curve",
];
const FREE_MISSING = [
  "No AI analysis",
  "No MT5 auto-sync",
  "No advanced charts",
];
const PRO_FEATURES = [
  "Unlimited trades",
  "MT5 auto-sync (EA integration)",
  "AI analysis — daily, weekly, monthly",
  "Full charts: win rate, calendar heatmap",
  "Priority support",
];

const PRO_AMOUNT_KOBO = 500_000; // ₦5,000

interface SubProfile {
  subscription_status: string | null;
  subscription_end: string | null;
}

export default function PricingPage() {
  const [user, setUser]               = useState<User | null>(null);
  const [isPro, setIsPro]             = useState(false);
  const [subEnd, setSubEnd]           = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [paying, setPaying]           = useState(false);
  const [payError, setPayError]       = useState<string | null>(null);
  const [paySuccess, setPaySuccess]   = useState(false);

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

      const pro = p?.subscription_status === "pro" &&
                  !!p?.subscription_end &&
                  new Date(p.subscription_end) > new Date();
      setIsPro(pro);
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

  function openPaystack() {
    if (!user || !scriptReady || !process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) return;
    const ref = `cj_pro_${Date.now()}_${user.id.slice(0, 8)}`;
    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email: user.email!,
      amount: PRO_AMOUNT_KOBO,
      currency: "NGN",
      ref,
      metadata: { user_id: user.id },
      callback: (response) => verifyAndActivate(response.reference),
      onClose: () => {},
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
              CJ
            </div>
            <span className="font-semibold text-base tracking-tight hidden sm:block">
              CandlesJournal
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

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-12">

          {/* FREE */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-7 flex flex-col">
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">
                Free Plan
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold">₦0</span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              <p className="text-zinc-600 text-xs mt-1.5">No credit card required</p>
            </div>

            <ul className="space-y-3 flex-1 mb-7">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
              {FREE_MISSING.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-600">
                  <span className="shrink-0 mt-0.5">✕</span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="text-center py-2.5 rounded-xl border border-zinc-800 text-zinc-600 text-sm font-semibold">
              {!isPro ? "Current plan" : "Basic plan"}
            </div>
          </div>

          {/* PRO */}
          <div className="relative bg-[var(--cj-surface)] border-2 border-blue-500/50 rounded-2xl p-7
                          flex flex-col shadow-[0_0_60px_-10px_rgba(59,130,246,0.25)]">

            {/* Badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest
                               px-4 py-1 rounded-full whitespace-nowrap">
                Most Popular
              </span>
            </div>

            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-widest text-blue-400/70 font-medium mb-3">
                Pro Plan
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold">₦5,000</span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              <p className="text-zinc-600 text-xs mt-1.5">~$3 USD · Secured by Paystack</p>
            </div>

            <ul className="space-y-3 flex-1 mb-7">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-200">
                  <span className="text-blue-400 shrink-0 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={openPaystack}
              disabled={paying || !scriptReady || !user}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white
                         font-semibold text-sm transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {paying
                ? "Processing..."
                : !scriptReady
                ? "Loading..."
                : isPro
                ? "Renew Pro →"
                : "Upgrade to Pro →"}
            </button>

            <p className="text-center text-[11px] text-zinc-600 mt-3">
              Supports NGN · Paystack secure checkout
            </p>
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
