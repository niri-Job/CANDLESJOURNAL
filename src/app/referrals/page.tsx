"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";

const REWARDS_UNLOCK = new Date("2026-07-01T00:00:00Z");
const BASE_URL       = "https://niri.live";

interface Stats {
  referral_code: string | null;
  total:         number;
  pending:       number;
  converted:     number;
  total_earned:  number;
}

interface Referral {
  id:        string;
  email:     string;
  status:    "pending" | "converted" | "paid";
  joined_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: "rgba(113,113,122,0.25)", color: "#a1a1aa", label: "Pending"   },
    converted: { bg: "rgba(52,211,153,0.15)",  color: "#34d399", label: "Converted" },
    paid:      { bg: "rgba(245,197,24,0.15)",  color: "#F5C518", label: "Paid"      },
  };
  const s = cfg[status] ?? cfg.pending;
  return (
    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function ReferralsPage() {
  const [user,      setUser]      = useState<User | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [copied,    setCopied]    = useState(false);

  const rewardsLocked = new Date() < REWARDS_UNLOCK;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const load = useCallback(async () => {
    const [statsRes, listRes] = await Promise.all([
      fetch("/api/referrals/stats"),
      fetch("/api/referrals/list"),
    ]);
    if (statsRes.ok) setStats(await statsRes.json() as Stats);
    if (listRes.ok) {
      const d = await listRes.json() as { referrals: Referral[] };
      setReferrals(d.referrals ?? []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);
      await load();
      setLoading(false);
    }
    init();
  }, [load]);

  const referralLink = stats?.referral_code
    ? `${BASE_URL}/login?ref=${stats.referral_code}`
    : null;

  const waText = referralLink
    ? `I've been using NIRI to track my trading behaviour and it's actually really eye-opening. You can see exactly where you're going wrong — revenge trades, overtrading, all of it. Beta access is free right now. Join here: ${referralLink}`
    : "";

  const tweetText = referralLink
    ? `Been tracking my trades with NIRI — it flags revenge trades, overtrading, all your patterns. Beta is free. ${referralLink}`
    : "";

  function copy() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleLogout} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

          {/* Header */}
          <div className="mb-7">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-1">Referrals</p>
            <h1 className="text-2xl font-bold text-zinc-100">Earn ₦3,000 per subscriber</h1>
          </div>

          {/* ── LOCKED BANNER ── */}
          {rewardsLocked && (
            <div className="mb-6 flex items-start gap-3 px-4 py-3.5 rounded-xl"
                 style={{ background: "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.25)" }}>
              <span className="text-base shrink-0 mt-0.5">🔒</span>
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--cj-gold)" }}>
                  Referral rewards activate July 1, 2026 when subscriptions go live.
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Share your link now to build your referral list early.
                  Every referred subscriber earns you <strong className="text-zinc-300">₦3,000</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ── YOUR REFERRAL LINK ── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
              Your Referral Link
            </p>

            {referralLink ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 min-w-0 bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-3.5 py-2.5">
                    <p className="text-xs font-mono text-zinc-300 truncate">{referralLink}</p>
                  </div>
                  <button
                    onClick={copy}
                    className="shrink-0 text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all"
                    style={{
                      background: copied ? "rgba(52,211,153,0.15)" : "rgba(245,197,24,0.12)",
                      border:     `1px solid ${copied ? "rgba(52,211,153,0.4)" : "rgba(245,197,24,0.3)"}`,
                      color:      copied ? "#34d399" : "var(--cj-gold)",
                    }}>
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors"
                    style={{ borderColor: "rgba(52,211,153,0.3)", color: "#34d399" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>

                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    X (Twitter)
                  </a>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600">Your code:</span>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                        style={{ background: "rgba(245,197,24,0.10)", color: "var(--cj-gold)" }}>
                    {stats!.referral_code}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Generating your referral link…</p>
            )}
          </div>

          {/* ── STATS ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total Referrals", value: String(stats?.total     ?? 0) },
              { label: "Pending",         value: String(stats?.pending   ?? 0) },
              { label: "Converted",       value: String(stats?.converted ?? 0) },
              {
                label: "Total Earned",
                value: rewardsLocked
                  ? "₦0 🔒"
                  : `₦${(stats?.total_earned ?? 0).toLocaleString("en-NG")}`,
              },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--cj-surface)] border border-zinc-800 rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
                <p className="text-2xl font-bold text-zinc-100">{value}</p>
              </div>
            ))}
          </div>

          {/* ── REFERRAL LIST ── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
              Your Referrals
            </p>

            {referrals.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-4xl mb-3">🤝</p>
                <p className="text-sm font-semibold text-zinc-300 mb-1">No referrals yet</p>
                <p className="text-xs text-zinc-500">
                  Share your link to start earning ₦3,000 per subscriber
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left pb-3 text-[10px] uppercase tracking-widest text-zinc-500 font-medium pr-4">Email</th>
                      <th className="text-left pb-3 text-[10px] uppercase tracking-widest text-zinc-500 font-medium pr-4">Date Joined</th>
                      <th className="text-right pb-3 text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {referrals.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 pr-4 text-xs font-mono text-zinc-300">{r.email}</td>
                        <td className="py-3 pr-4 text-xs text-zinc-500">
                          {new Date(r.joined_at).toLocaleDateString("en-GB", {
                            day: "2-digit", month: "short", year: "2-digit",
                          })}
                        </td>
                        <td className="py-3 text-right">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── HOW IT WORKS ── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-5">
              How It Works
            </p>
            <div className="space-y-5">
              {[
                {
                  step:  "1",
                  title: "Share your unique NIRI link",
                  desc:  "Copy your referral link and share it in WhatsApp groups, Twitter, trading communities — anywhere.",
                },
                {
                  step:  "2",
                  title: "Friend signs up and connects their MT5",
                  desc:  "They create a free account and connect their MT5 account to start tracking their trades with NIRI.",
                },
                {
                  step:  "3",
                  title: "When they subscribe, you earn ₦3,000",
                  desc:  "As soon as they take out a paid subscription, ₦3,000 is automatically credited to your referral balance.",
                },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4">
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                       style={{ background: "rgba(245,197,24,0.12)", color: "var(--cj-gold)", border: "1px solid rgba(245,197,24,0.25)" }}>
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200 mb-0.5">{title}</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}

              <p className="text-[11px] text-zinc-600 pt-3 border-t border-zinc-800">
                Payouts activate July 1, 2026 when subscriptions go live.
                Referrals tracked now will be credited on launch day.
              </p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
