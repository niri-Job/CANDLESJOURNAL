"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { User } from "@supabase/supabase-js";

const ALL_FEATURES = [
  "Unlimited trades",
  "Manual trade entry",
  "Full dashboard with all charts",
  "CSV Import from MT5",
  "Trade journal (notes, screenshots, emotions)",
  "3 AI analyses per week",
  "Position size calculator",
  "Strategy Playbook",
  "Economic calendar",
  "Referral rewards program",
];

export default function PricingPage() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);
      setLoading(false);
    }
    init();
  }, []);

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
            <span className="font-semibold text-base tracking-tight hidden sm:block">NIRI</span>
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

      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-12">

        {/* Beta banner */}
        <div className="flex items-center justify-center gap-3 px-5 py-4 rounded-2xl mb-10 text-center"
             style={{ background: "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.30)" }}>
          <div>
            <p className="font-bold text-sm mb-0.5" style={{ color: "var(--cj-gold)" }}>
              NIRI is free for everyone until July 1, 2026
            </p>
            <p className="text-zinc-400 text-xs">No card required. Full access during the beta period.</p>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Simple, transparent pricing</h1>
          <p className="text-zinc-400 text-base max-w-md mx-auto">
            Full access during beta. After July 1, advanced features unlock on paid plans.
          </p>
        </div>

        {/* Free card */}
        <div className="bg-[var(--cj-surface)] border-2 rounded-2xl p-7 flex flex-col mx-auto max-w-sm"
             style={{ borderColor: "rgba(245,197,24,0.4)", boxShadow: "0 0 60px -10px rgba(245,197,24,0.15)" }}>
          <div className="-mt-10 flex justify-center mb-5">
            <span className="text-[11px] font-bold uppercase tracking-widest px-4 py-1 rounded-full whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
              Free — Beta Access
            </span>
          </div>
          <div className="mb-6">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold">₦0</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
            <p className="text-zinc-600 text-xs mt-1.5">Until July 1, 2026 · No credit card needed</p>
          </div>
          <ul className="space-y-3 flex-1 mb-7">
            {ALL_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-200">
                <span className="shrink-0 mt-0.5" style={{ color: "var(--cj-gold)" }}>✓</span>{f}
              </li>
            ))}
          </ul>
          <div className="text-center py-2.5 rounded-xl font-semibold text-sm"
               style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
            Current plan — Active
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              title: "Beta period",
              body: "All features are available free until July 1, 2026 while we build and improve. No credit card needed.",
            },
            {
              title: "After July 1",
              body: "Paid plans will unlock advanced features like MT5 Direct Connect. Your trades and history are never deleted.",
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
