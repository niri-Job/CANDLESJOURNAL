"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Phase = "verifying" | "success" | "error";

export default function PaymentVerifyPage() {
  const [phase,    setPhase]    = useState<Phase>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [subEnd,   setSubEnd]   = useState<string | null>(null);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference") ||
                      new URLSearchParams(window.location.search).get("trxref");

    if (!reference) {
      setErrorMsg("No payment reference found in the URL.");
      setPhase("error");
      return;
    }

    fetch("/api/paystack/verify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ reference }),
    })
      .then((r) => r.json())
      .then((data: { success?: boolean; error?: string; subscription_end?: string }) => {
        if (data.success) {
          setSubEnd(data.subscription_end ?? null);
          setPhase("success");
          // Auto-redirect to dashboard after 3 s
          setTimeout(() => { window.location.href = "/dashboard"; }, 3000);
        } else {
          setErrorMsg(data.error ?? "Payment verification failed.");
          setPhase("error");
        }
      })
      .catch(() => {
        setErrorMsg("Network error while verifying. Your payment may still have gone through — check your email or contact support@niri.live.");
        setPhase("error");
      });
  }, []);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5C518] to-[#C9A227]
                          flex items-center justify-center text-base font-bold text-[#0A0A0F]"
               style={{ boxShadow: "0 0 20px rgba(245,197,24,0.28)" }}>
            NI
          </div>
          <span className="font-bold text-xl tracking-tight text-zinc-100">NIRI</span>
        </div>

        {/* Verifying */}
        {phase === "verifying" && (
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-8">
            <div className="w-12 h-12 rounded-full border-2 border-[var(--cj-gold)] border-t-transparent
                            animate-spin mx-auto mb-5" />
            <h2 className="text-lg font-bold text-zinc-100 mb-2">Verifying payment…</h2>
            <p className="text-sm text-zinc-500">Please wait while we confirm your transaction.</p>
          </div>
        )}

        {/* Success */}
        {phase === "success" && (
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30
                            flex items-center justify-center text-3xl mx-auto mb-5">
              ✓
            </div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2">Payment confirmed!</h2>
            <p className="text-sm text-zinc-400 mb-1">
              You now have <span className="text-[var(--cj-gold)] font-semibold">Pro access</span>.
            </p>
            {subEnd && (
              <p className="text-xs text-zinc-600 mb-6">Active until {fmtDate(subEnd)}</p>
            )}
            <p className="text-xs text-zinc-600 mb-5">Redirecting to dashboard in 3 seconds…</p>
            <Link href="/dashboard"
              className="inline-block w-full py-3 rounded-xl text-sm font-bold text-[#0A0A0F]"
              style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
              Go to Dashboard →
            </Link>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-8">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20
                            flex items-center justify-center text-3xl mx-auto mb-5">
              ✕
            </div>
            <h2 className="text-xl font-bold text-zinc-100 mb-3">Verification failed</h2>
            <p className="text-sm text-rose-400 mb-6 leading-relaxed">{errorMsg}</p>
            <div className="flex flex-col gap-3">
              <Link href="/pricing"
                className="w-full py-3 rounded-xl text-sm font-bold text-[#0A0A0F] text-center"
                style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
                Try Again →
              </Link>
              <a href="mailto:support@niri.live"
                className="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                           hover:border-zinc-500 hover:text-zinc-200 transition-all text-center">
                Contact Support
              </a>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-700 mt-6">Secured by Paystack</p>
      </div>
    </div>
  );
}
