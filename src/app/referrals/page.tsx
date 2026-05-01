"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import type { User } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  referral_code: string | null;
  referral_enabled: boolean;
  subscription_status: string;
  total_referrals: number;
  active_referrals: number;
  inactive_referrals: number;
  pending_referrals: number;
  conversion_rate: number;
  this_month_earnings: number;
  lifetime_earnings: number;
  pending_earnings: number;
  paid_earnings: number;
  available_for_payout: number;
}

interface Referral {
  id: string;
  referred_anon: string;
  status: string;
  plan_type: string;
  commission_rate: number;
  joined_at: string | null;
  activated_at: string | null;
  last_payment_at: string | null;
  earnings: number;
}

interface EarningMonth {
  month: string;
  month_key: string;
  confirmed: number;
  pending: number;
  total: number;
}

interface Payout {
  id: string;
  amount: number;
  status: string;
  payout_method: string;
  requested_at: string | null;
  paid_at: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `$${n.toFixed(2)}`; }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active:   { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", label: "Active"   },
    inactive: { bg: "bg-zinc-700/40 border-zinc-700",          text: "text-zinc-500",    label: "Inactive" },
    pending:  { bg: "bg-amber-500/15 border-amber-500/30",     text: "text-amber-400",   label: "Pending"  },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-block text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
      style={{
        background: copied ? "rgba(52,211,153,0.15)" : "var(--cj-raised)",
        border: `1px solid ${copied ? "rgba(52,211,153,0.35)" : "var(--cj-border)"}`,
        color: copied ? "#34d399" : "var(--cj-text-muted)",
      }}
    >
      {copied ? "✓ Copied!" : label}
    </button>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      className="bg-[var(--cj-surface)] rounded-2xl p-4 flex flex-col gap-1"
      style={{
        border: `1px solid ${accent ? "rgba(245,197,24,0.35)" : "var(--cj-border)"}`,
        background: accent ? "rgba(245,197,24,0.05)" : undefined,
      }}
    >
      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${accent ? "text-[var(--cj-gold)]" : "text-zinc-100"}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}

// ── Payout modal ─────────────────────────────────────────────────────────────

function PayoutModal({
  available,
  onClose,
  onSuccess,
}: { available: number; onClose: () => void; onSuccess: () => void }) {
  const [method, setMethod]     = useState("bank_transfer");
  const [details, setDetails]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState("");

  async function submit() {
    setError("");
    if (!details.trim()) { setError("Please enter your account details"); return; }
    setLoading(true);
    const res = await fetch("/api/referrals/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, account_details: { info: details } }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error || "Request failed"); return; }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
         onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--cj-surface)] rounded-2xl p-6"
           style={{ border: "1px solid var(--cj-border)", borderTop: "2px solid var(--cj-gold-muted)" }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-zinc-100 text-lg">Request Payout</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="bg-[var(--cj-raised)] rounded-xl p-3 mb-5 flex items-center justify-between">
          <span className="text-xs text-zinc-500">Available balance</span>
          <span className="font-bold text-[var(--cj-gold)]">{fmt(available)}</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] font-medium mb-2"
                   style={{ color: "var(--cj-gold-muted)" }}>Payout Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="inp"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="crypto">Crypto (USDT / BTC)</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] font-medium mb-2"
                   style={{ color: "var(--cj-gold-muted)" }}>Account Details</label>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={3}
              placeholder={
                method === "bank_transfer" ? "Bank name, account number, routing/sort code..." :
                method === "paypal"        ? "Your PayPal email address" :
                method === "crypto"        ? "Wallet address (network: TRC20 / ERC20 / BTC)" :
                "Describe your preferred payment method..."
              }
              className="inp resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
            style={{ border: "1px solid var(--cj-border)" }}>
            Cancel
          </button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 btn-gold">
            {loading ? "Submitting…" : `Request ${fmt(available)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const [user,         setUser]         = useState<User | null>(null);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [referrals,    setReferrals]    = useState<Referral[]>([]);
  const [earnings,     setEarnings]     = useState<EarningMonth[]>([]);
  const [payouts,      setPayouts]      = useState<Payout[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showPayout,   setShowPayout]   = useState(false);
  const [payoutDone,   setPayoutDone]   = useState(false);
  const [enabling,     setEnabling]     = useState(false);
  const [showQr,       setShowQr]       = useState(false);

  const referralLink = stats?.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${stats.referral_code}`
    : "";

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    setUser(u);

    const nc = { cache: "no-store" } as RequestInit;
    const [statsRes, listRes, earningsRes, payoutsRes] = await Promise.all([
      fetch("/api/referrals/stats",    nc),
      fetch("/api/referrals/list",     nc),
      fetch("/api/referrals/earnings", nc),
      fetch("/api/referrals/payout",   nc),
    ]);

    if (statsRes.ok) {
      const s = (await statsRes.json()) as Stats;
      console.log("[Referrals] stats loaded:", {
        subscription_status: s.subscription_status,
        referral_enabled: s.referral_enabled,
        referral_code: s.referral_code,
      });
      setStats(s);
    }
    if (listRes.ok)     setReferrals(((await listRes.json()) as { referrals: Referral[] }).referrals);
    if (earningsRes.ok) setEarnings(((await earningsRes.json()) as { earnings: EarningMonth[] }).earnings);
    if (payoutsRes.ok)  setPayouts(((await payoutsRes.json()) as { payouts: Payout[] }).payouts);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function enableReferrals() {
    setEnabling(true);
    const res = await fetch("/api/referrals/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enable: true }),
    });
    setEnabling(false);
    if (res.ok) load();
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <p className="text-zinc-500 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  // Unlock for paid plans OR if referral_enabled was manually set (e.g. dev bypass)
  const isPro  = stats?.subscription_status === "pro"
              || stats?.subscription_status === "starter"
              || stats?.referral_enabled === true;
  const isFree = !isPro;

  // ── Locked (free tier) — single overlay over all content ────────────────

  const LockedOverlay = () => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6 text-center"
         style={{ background: "rgba(10,10,15,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-14 h-14 rounded-2xl bg-[var(--cj-surface)] border border-zinc-700
                      flex items-center justify-center text-3xl">🔒</div>
      <p className="font-bold text-zinc-100 text-lg">Upgrade to unlock Referrals</p>
      <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
        Earn recurring commissions by inviting traders to CandlesJournal.<br/>
        Available on Starter and Pro plans.
      </p>
      <Link href="/settings" className="btn-gold px-6 py-3 rounded-xl text-sm font-bold">
        Upgrade Now
      </Link>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--cj-bg)]">
      <Sidebar user={user} onSignOut={handleSignOut} />

      <main className="flex-1 md:ml-[240px] overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-20 px-6 h-14 flex items-center justify-between"
             style={{ background: "var(--cj-bg)", borderBottom: "1px solid var(--cj-border)" }}>
          <h1 className="font-bold text-zinc-100 text-base">Referrals & Earnings</h1>
          {stats?.referral_enabled && (
            <CopyBtn text={referralLink} label="Copy Link" />
          )}
        </div>

        <div className="px-4 sm:px-6 py-6 space-y-6 max-w-5xl mx-auto">

          {/* Commission info banner */}
          <div className="rounded-2xl p-5"
               style={{
                 background: "linear-gradient(135deg, rgba(245,197,24,0.1) 0%, rgba(201,162,39,0.05) 100%)",
                 border: "1px solid rgba(245,197,24,0.25)",
               }}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="text-3xl">🎁</div>
              <div className="flex-1">
                <p className="font-bold text-zinc-100 mb-1">Earn recurring commissions every month</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Share your referral link and earn <span className="text-[var(--cj-gold)] font-semibold">$0.50/month</span> for
                  every Starter subscriber you refer, and <span className="text-[var(--cj-gold)] font-semibold">$1.00/month</span> for
                  Pro subscribers — for as long as they stay subscribed. Minimum payout is $5.
                </p>
              </div>
              {isFree && (
                <Link href="/settings"
                  className="btn-gold px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap">
                  Upgrade to Earn
                </Link>
              )}
            </div>
          </div>

          {/* ── All sections below — single overlay for free users ── */}
          <div className="relative">
            {isFree && <LockedOverlay />}
            <div className={`space-y-6${isFree ? " pointer-events-none select-none" : ""}`}>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Referrals"  value={String(stats?.total_referrals ?? 0)} />
                <StatCard label="Active"           value={String(stats?.active_referrals ?? 0)}
                          sub={`${stats?.conversion_rate ?? 0}% converted`} />
                <StatCard label="This Month"       value={fmt(stats?.this_month_earnings ?? 0)} accent />
                <StatCard label="Available Payout" value={fmt(stats?.available_for_payout ?? 0)} accent />
                <StatCard label="Lifetime Earned"  value={fmt(stats?.lifetime_earnings ?? 0)} />
                <StatCard label="Pending"          value={fmt(stats?.pending_earnings ?? 0)}
                          sub="Confirms after 7 days" />
                <StatCard label="Paid Out"         value={fmt(stats?.paid_earnings ?? 0)} />
                <StatCard label="Inactive"         value={String(stats?.inactive_referrals ?? 0)}
                          sub="Cancelled/downgraded" />
              </div>

              {/* Referral link & sharing */}
              <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                   style={{ border: "1px solid var(--cj-border)" }}>
                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
                  Your Referral Link
                </p>

                {!stats?.referral_enabled ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-sm text-zinc-400">Activate your referral link to start earning</p>
                    <button
                      onClick={enableReferrals}
                      disabled={enabling}
                      className="btn-gold px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
                      {enabling ? "Activating…" : "Activate Referral Link"}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Link box */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex-1 bg-[var(--cj-raised)] rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-300 truncate"
                           style={{ border: "1px solid var(--cj-border)" }}>
                        {referralLink}
                      </div>
                      <CopyBtn text={referralLink} />
                    </div>

                    {/* Code badge */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-[var(--cj-raised)] rounded-xl px-4 py-2 flex items-center gap-3"
                           style={{ border: "1px solid var(--cj-border)" }}>
                        <span className="text-xs text-zinc-500">Code:</span>
                        <span className="font-mono font-bold text-[var(--cj-gold)] tracking-widest text-sm">
                          {stats?.referral_code}
                        </span>
                        <CopyBtn text={stats?.referral_code ?? ""} label="Copy Code" />
                      </div>
                    </div>

                    {/* Share buttons */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <a href={`https://wa.me/?text=${encodeURIComponent(`Join me on CandlesJournal — the best trading journal for serious traders! Use my link: ${referralLink}`)}`}
                         target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                         style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)", color: "#25d366" }}>
                        <span>💬</span> WhatsApp
                      </a>
                      <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Track your trades with CandlesJournal. Join using my referral link!")}`}
                         target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                         style={{ background: "rgba(36,161,222,0.15)", border: "1px solid rgba(36,161,222,0.3)", color: "#24a1de" }}>
                        <span>✈️</span> Telegram
                      </a>
                      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Level up your trading with CandlesJournal! Use my referral link: ${referralLink}`)}`}
                         target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                         style={{ background: "rgba(29,161,242,0.15)", border: "1px solid rgba(29,161,242,0.3)", color: "#1da1f2" }}>
                        <span>🐦</span> Twitter / X
                      </a>
                      <button
                        onClick={() => setShowQr(q => !q)}
                        className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                        style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "var(--cj-text-muted)" }}>
                        📱 {showQr ? "Hide QR" : "QR Code"}
                      </button>
                    </div>

                    {showQr && (
                      <div className="flex justify-center p-4 bg-white rounded-2xl w-fit">
                        <QRCodeSVG value={referralLink} size={160} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Earnings chart */}
              <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                   style={{ border: "1px solid var(--cj-border)" }}>
                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
                  Earnings — Last 6 Months
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={earnings} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false}
                           tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)", borderRadius: 12 }}
                      labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any, name: any) => [`$${Number(v).toFixed(2)}`, name === "confirmed" ? "Confirmed" : "Pending"]}
                    />
                    <Legend
                      formatter={(v: string) => v === "confirmed" ? "Confirmed" : "Pending"}
                      wrapperStyle={{ fontSize: 11, color: "#71717a" }}
                    />
                    <Bar dataKey="confirmed" stackId="a" fill="#F5C518" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="pending"   stackId="a" fill="rgba(245,197,24,0.25)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Referred users table */}
              <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                   style={{ border: "1px solid var(--cj-border)" }}>
                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
                  Referred Users ({referrals.length})
                </p>
                {referrals.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <p className="text-2xl">🤝</p>
                    <p className="text-sm text-zinc-500">No referrals yet</p>
                    <p className="text-xs text-zinc-600">Share your link to start earning</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="text-left text-zinc-600 border-b border-zinc-800">
                          <th className="pb-2 font-medium pr-4">User ID</th>
                          <th className="pb-2 font-medium pr-4">Status</th>
                          <th className="pb-2 font-medium pr-4">Plan</th>
                          <th className="pb-2 font-medium pr-4">Rate/mo</th>
                          <th className="pb-2 font-medium pr-4">Joined</th>
                          <th className="pb-2 font-medium text-right">Total Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {referrals.map(r => (
                          <tr key={r.id} className="hover:bg-[var(--cj-raised)] transition-colors">
                            <td className="py-2.5 pr-4 font-mono text-zinc-400">{r.referred_anon}…</td>
                            <td className="py-2.5 pr-4"><StatusBadge status={r.status} /></td>
                            <td className="py-2.5 pr-4 capitalize text-zinc-400">{r.plan_type}</td>
                            <td className="py-2.5 pr-4 text-zinc-400">
                              {r.commission_rate > 0 ? `$${r.commission_rate.toFixed(2)}` : "—"}
                            </td>
                            <td className="py-2.5 pr-4 text-zinc-500">{fmtDate(r.joined_at)}</td>
                            <td className="py-2.5 text-right font-semibold text-zinc-300">{fmt(r.earnings)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payout section */}
              <div className="bg-[var(--cj-surface)] rounded-2xl p-5"
                   style={{ border: "1px solid var(--cj-border)" }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Payout</p>
                  {(stats?.available_for_payout ?? 0) >= 5 && (
                    <button
                      onClick={() => { setPayoutDone(false); setShowPayout(true); }}
                      className="btn-gold px-4 py-2 rounded-xl text-xs font-bold">
                      Request Payout
                    </button>
                  )}
                </div>

                {payoutDone && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                    ✓ Payout request submitted! We'll process it within 3–5 business days.
                  </div>
                )}

                {(stats?.available_for_payout ?? 0) < 5 && (
                  <p className="text-xs text-zinc-600 mb-4">
                    Minimum payout is $5.00. You have {fmt(stats?.available_for_payout ?? 0)} available.
                  </p>
                )}

                {payouts.length === 0 ? (
                  <p className="text-xs text-zinc-600 py-4 text-center">No payouts yet</p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs min-w-[440px]">
                      <thead>
                        <tr className="text-left text-zinc-600 border-b border-zinc-800">
                          <th className="pb-2 font-medium pr-4">Date</th>
                          <th className="pb-2 font-medium pr-4">Method</th>
                          <th className="pb-2 font-medium pr-4">Status</th>
                          <th className="pb-2 font-medium pr-4">Paid At</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {payouts.map(p => (
                          <tr key={p.id}>
                            <td className="py-2.5 pr-4 text-zinc-500">{fmtDate(p.requested_at)}</td>
                            <td className="py-2.5 pr-4 capitalize text-zinc-400">
                              {p.payout_method.replace(/_/g, " ")}
                            </td>
                            <td className="py-2.5 pr-4">
                              <StatusBadge status={p.status === "paid" ? "active" : p.status === "rejected" ? "inactive" : "pending"} />
                            </td>
                            <td className="py-2.5 pr-4 text-zinc-500">{fmtDate(p.paid_at)}</td>
                            <td className="py-2.5 text-right font-semibold text-zinc-300">{fmt(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>{/* end space-y-6 */}
          </div>{/* end relative overlay wrapper */}

        </div>
      </main>

      {showPayout && stats && (
        <PayoutModal
          available={stats.available_for_payout}
          onClose={() => setShowPayout(false)}
          onSuccess={() => { setShowPayout(false); setPayoutDone(true); load(); }}
        />
      )}
    </div>
  );
}
