"use client";

import { useState } from "react";
import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "./UpgradeModal";

interface ProGateProps {
  children:   React.ReactNode;
  /** Custom content to render when user is not Pro */
  fallback?:  React.ReactNode;
  /** Short label for what feature is being gated, e.g. "AI Analysis" */
  feature?:   string;
}

/** Wraps any feature that requires Pro. Shows an upgrade prompt for free users. */
export function ProGate({ children, fallback, feature }: ProGateProps) {
  const { isPro, loading } = useSubscription();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 rounded-full border-2 border-[var(--cj-gold)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isPro) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  // Default gate UI
  return (
    <>
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center text-2xl"
             style={{ background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.2)" }}>
          ⚡
        </div>
        <h3 className="text-base font-bold text-zinc-100 mb-1">
          {feature ? `${feature} requires Pro` : "Pro feature"}
        </h3>
        <p className="text-sm text-zinc-500 mb-5 max-w-xs">
          Upgrade to NIRI Pro to unlock this feature and everything else.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setModalOpen(true)}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-[#0A0A0F]"
            style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)" }}>
            Upgrade to Pro →
          </button>
          <Link href="/pricing"
            className="px-6 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm
                       hover:border-zinc-500 hover:text-zinc-200 transition-all text-center">
            See pricing
          </Link>
        </div>
      </div>
      <UpgradeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); window.location.reload(); }}
      />
    </>
  );
}

/** Inline "Upgrade" badge for use inside cards / tooltips */
export function UpgradeBadge({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide
                 px-2.5 py-1 rounded-full transition-all hover:opacity-80"
      style={{ background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.3)", color: "var(--cj-gold)" }}
    >
      ⚡ Pro
    </button>
  );
}
