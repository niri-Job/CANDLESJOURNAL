"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";

interface SubState { status: string; end: string | null; }

interface SyncToken {
  id: string;
  token: string;
  label: string;
  last_sync_at: string | null;
  created_at: string;
}

interface TradingAccount {
  id: string;
  account_signature: string;
  account_label: string | null;
  broker_name: string | null;
  account_login: string | null;
  account_server: string | null;
  account_currency: string;
  account_type: string;
  is_cent: boolean;
  current_balance: number | null;
  last_synced_at: string | null;
  sync_method: string | null;
  sync_status: string | null;
  sync_error: string | null;
  platform: string | null;
}

interface QuickConnectForm {
  server: string;
  login: string;
  password: string;
  platform: "MT4" | "MT5";
  label: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SyncStatusDot({ status }: { status: string | null }) {
  if (status === "connected" || status === "success") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        Connected
      </span>
    );
  }
  if (status === "syncing") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        Syncing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-rose-400">
        <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
        Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
      <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
      Pending
    </span>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const [syncToken,         setSyncToken]         = useState<SyncToken | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [generating,        setGenerating]        = useState(false);
  const [genError,          setGenError]          = useState<string | null>(null);
  const [copiedToken,       setCopiedToken]       = useState(false);
  const [copiedUrl,         setCopiedUrl]         = useState(false);
  const [sub,               setSub]               = useState<SubState>({ status: "free", end: null });
  const [tradingAccounts,   setTradingAccounts]   = useState<TradingAccount[]>([]);
  const [editingAccountId,  setEditingAccountId]  = useState<string | null>(null);
  const [editLabel,         setEditLabel]         = useState("");
  const [syncUrl] = useState(() =>
    typeof window !== "undefined" ? window.location.origin + "/api/mt5/sync" : ""
  );

  // Quick Connect state
  const [qcForm, setQcForm] = useState<QuickConnectForm>({
    server: "", login: "", password: "", platform: "MT5", label: "",
  });
  const [connecting,    setConnecting]    = useState(false);
  const [connectError,  setConnectError]  = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<{ account_signature: string; ea_warning: string | null } | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const { data } = await supabase
        .from("mt5_sync_tokens")
        .select("id, token, label, last_sync_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setSyncToken(data as SyncToken);

      const { data: subRaw } = await supabase
        .from("user_profiles")
        .select("subscription_status, subscription_end")
        .eq("user_id", user.id)
        .maybeSingle();
      const subData = subRaw as { subscription_status: string | null; subscription_end: string | null } | null;
      setSub({ status: subData?.subscription_status ?? "free", end: subData?.subscription_end ?? null });

      const { data: accounts } = await supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (accounts) setTradingAccounts(accounts as TradingAccount[]);

      setLoading(false);
    }
    init();
  }, []);

  async function saveLabel(accountId: string) {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("trading_accounts")
      .update({ account_label: editLabel.trim() || null })
      .eq("id", accountId)
      .eq("user_id", user.id);
    if (!error) {
      setTradingAccounts((prev) =>
        prev.map((a) => a.id === accountId ? { ...a, account_label: editLabel.trim() || null } : a)
      );
    }
    setEditingAccountId(null);
  }

  async function deleteAccount(accountId: string) {
    if (!user) return;
    if (!confirm("Disconnect this account? Its trade history will remain, but the account card will be removed.")) return;
    const supabase = createClient();
    await supabase
      .from("trading_accounts")
      .delete()
      .eq("id", accountId)
      .eq("user_id", user.id);
    setTradingAccounts((prev) => prev.filter((a) => a.id !== accountId));
  }

  async function generateToken() {
    if (!user) return;
    setGenerating(true);
    setGenError(null);
    const supabase = createClient();
    if (syncToken) {
      await supabase.from("mt5_sync_tokens").delete().eq("id", syncToken.id).eq("user_id", user.id);
    }
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await supabase
      .from("mt5_sync_tokens")
      .insert({ user_id: user.id, token: newToken, label: "My MT5 Account" })
      .select()
      .single();
    if (error) setGenError("Failed to save token: " + error.message);
    else if (data) setSyncToken(data as SyncToken);
    setGenerating(false);
  }

  async function copyToken() {
    if (!syncToken) return;
    await navigator.clipboard.writeText(syncToken.token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(syncUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  async function handleQuickConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setConnectError(null);
    setConnectSuccess(null);

    if (!qcForm.server.trim() || !qcForm.login.trim() || !qcForm.password.trim()) {
      setConnectError("Please fill in all required fields.");
      setConnecting(false);
      return;
    }

    try {
      const res = await fetch("/api/accounts/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_login:      qcForm.login.trim(),
          account_server:     qcForm.server.trim(),
          investor_password:  qcForm.password,
          platform:           qcForm.platform,
          account_label:      qcForm.label.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; account_signature?: string; ea_warning?: string | null };

      if (!res.ok) {
        setConnectError(data.error ?? "Connection failed");
      } else {
        setConnectSuccess({ account_signature: data.account_signature!, ea_warning: data.ea_warning ?? null });
        setQcForm({ server: "", login: "", password: "", platform: "MT5", label: "" });
        // Refresh accounts list
        const supabase = createClient();
        const { data: accounts } = await supabase
          .from("trading_accounts")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false });
        if (accounts) setTradingAccounts(accounts as TradingAccount[]);
      }
    } catch {
      setConnectError("Network error — check your connection.");
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleLogout} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── SUBSCRIPTION ─────────────────────────────────────────────────── */}
        {(() => {
          const isPro = sub.status === "pro" && !!sub.end && new Date(sub.end) > new Date();
          const daysLeft = sub.end
            ? Math.max(0, Math.ceil((new Date(sub.end).getTime() - Date.now()) / 86_400_000))
            : 0;
          return (
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Subscription</p>
                <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full
                  ${isPro
                    ? "bg-blue-500/15 border border-blue-500/30 text-blue-400"
                    : "bg-zinc-800 text-zinc-500"
                  }`}>
                  {isPro ? "Pro" : "Free"}
                </span>
              </div>
              {isPro ? (
                <div>
                  <p className="text-sm text-zinc-300 mb-1">Pro plan active</p>
                  <p className="text-xs text-zinc-500 mb-4">
                    Expires {new Date(sub.end!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    {" · "}{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                  </p>
                  <Link href="/pricing" className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors">
                    Renew Pro →
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-zinc-500 mb-4">
                    You are on the Free plan — up to 20 trades/month, no AI analysis. Upgrade to unlock everything.
                  </p>
                  <Link href="/pricing"
                    className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                               text-white font-semibold text-sm transition-all">
                    Upgrade to Pro — ₦5,000/month →
                  </Link>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CONNECT ACCOUNT ───────────────────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Connect Account</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">

            {/* ── CARD 1: EA Sync ──────────────────────────────────────────── */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                  bg-[var(--cj-gold-glow)] border border-[var(--cj-gold-muted)]"
                      style={{ color: "var(--cj-gold)" }}>
                  ⚡ Recommended
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-0.5
                                  rounded-full bg-zinc-800 border border-zinc-700">
                  Real-time
                </span>
              </div>
              <p className="text-sm font-semibold text-zinc-100 mb-1.5">EA Sync</p>
              <p className="text-xs text-zinc-500 leading-relaxed mb-4 flex-1">
                Install our Expert Advisor in MT5 for instant trade sync. Most accurate — trades appear the second you close them.
              </p>
              <div className="space-y-2">
                {syncToken?.last_sync_at && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    EA active · last sync {new Date(syncToken.last_sync_at).toLocaleString()}
                  </div>
                )}
                <a href="/downloads/CandlesJournalEA.ex5"
                   download="CandlesJournalEA.ex5"
                   className="block text-center text-xs px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                              text-white font-semibold transition-all">
                  Download EA (.ex5)
                </a>
              </div>
            </div>

            {/* ── CARD 2: Quick Connect overview ───────────────────────────── */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                  bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  🔗 Easy Setup
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-0.5
                                  rounded-full bg-zinc-800 border border-zinc-700">
                  30s sync
                </span>
              </div>
              <p className="text-sm font-semibold text-zinc-100 mb-1.5">Quick Connect</p>
              <p className="text-xs text-zinc-500 leading-relaxed flex-1">
                Connect using your investor (read-only) password. No installation needed. Syncs every 30 seconds.
                Investor passwords can only read — they cannot place trades.
              </p>
            </div>
          </div>

          {/* ── QUICK CONNECT FORM ─────────────────────────────────────────── */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">
              Quick Connect — New Account
            </p>

            {connectSuccess && (
              <div className="mb-4 rounded-xl p-4 bg-emerald-500/8 border border-emerald-500/20">
                <p className="text-sm text-emerald-400 font-semibold mb-1">Account connected!</p>
                <p className="text-xs text-zinc-400">
                  Signature: <span className="font-mono text-zinc-200">{connectSuccess.account_signature}</span>
                  <br />The sync service will begin fetching your trades within 30 seconds.
                </p>
                {connectSuccess.ea_warning && (
                  <p className="mt-2 text-xs text-amber-400">
                    ⚠ {connectSuccess.ea_warning}
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleQuickConnect} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    Broker / Server <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={qcForm.server}
                    onChange={(e) => setQcForm((f) => ({ ...f, server: e.target.value }))}
                    placeholder="Exness-MT5Real8"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    Account Login <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={qcForm.login}
                    onChange={(e) => setQcForm((f) => ({ ...f, login: e.target.value }))}
                    placeholder="12345678"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                               [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                               [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                  Investor Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={qcForm.password}
                  onChange={(e) => setQcForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Your read-only investor password"
                  autoComplete="new-password"
                  className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                             text-sm text-zinc-100 placeholder-zinc-600
                             focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                />
                <p className="mt-1.5 text-[11px] text-zinc-600">
                  🔒 Encrypted before storage. Investor passwords are read-only — we cannot place trades.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Platform toggle */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    Platform
                  </label>
                  <div className="flex gap-1.5">
                    {(["MT5", "MT4"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setQcForm((f) => ({ ...f, platform: p }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border
                          ${qcForm.platform === p
                            ? "text-[#0A0A0F] border-transparent"
                            : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:text-zinc-200"
                          }`}
                        style={qcForm.platform === p
                          ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" }
                          : undefined}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {qcForm.platform === "MT4" && (
                    <p className="mt-1.5 text-[11px] text-amber-500">
                      ⚠ MT4 support is limited. EA Sync is recommended for MT4 accounts.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    Account Label
                  </label>
                  <input
                    type="text"
                    value={qcForm.label}
                    onChange={(e) => setQcForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="My Exness Real"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                  />
                </div>
              </div>

              {connectError && (
                <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                  <p className="text-xs text-rose-400">{connectError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={connecting}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#F5C518,#C9A227)",
                  color: "#0A0A0F",
                }}>
                {connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin" />
                    Connecting to broker server…
                  </span>
                ) : "Connect Account"}
              </button>
            </form>
          </div>
        </div>

        {/* ── EA SYNC TOKEN (hidden under collapsible) ───────────────────── */}
        <details className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl mb-5 group">
          <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none list-none">
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">MT5 Sync Token</p>
              {syncToken?.last_sync_at && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              )}
            </div>
            <span className="text-zinc-600 text-xs group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <div className="px-6 pb-6 pt-2">
            <p className="text-xs text-zinc-600 mb-5">
              Your MT5 Expert Advisor uses this token to securely push trades to your journal.
            </p>

            {syncToken ? (
              <>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Sync Token</p>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-4 py-3
                                  font-mono text-sm text-zinc-300 break-all select-all">
                    {syncToken.token}
                  </div>
                  <button
                    onClick={copyToken}
                    className={`px-4 py-3 rounded-lg border text-xs font-semibold transition-all shrink-0
                      ${copiedToken
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
                        : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-300 hover:border-blue-500/50 hover:text-blue-400"
                      }`}>
                    {copiedToken ? "Copied!" : "Copy"}
                  </button>
                </div>

                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Sync URL</p>
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex-1 bg-[var(--cj-raised)] border border-zinc-700 rounded-lg px-4 py-3
                                  font-mono text-xs text-zinc-500 break-all">
                    {syncUrl}
                  </div>
                  <button
                    onClick={copyUrl}
                    className={`px-4 py-3 rounded-lg border text-xs font-semibold transition-all shrink-0
                      ${copiedUrl
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
                        : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-300 hover:border-blue-500/50 hover:text-blue-400"
                      }`}>
                    {copiedUrl ? "Copied!" : "Copy"}
                  </button>
                </div>

                <button
                  onClick={generateToken}
                  disabled={generating}
                  className="text-xs text-zinc-600 hover:text-rose-400 transition-colors disabled:opacity-50">
                  {generating ? "Regenerating..." : "⚠ Regenerate token (invalidates current EA connection)"}
                </button>
                {genError && <p className="mt-3 text-xs text-rose-400">{genError}</p>}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-10 h-10 rounded-xl bg-[var(--cj-raised)] border border-zinc-800
                                flex items-center justify-center text-lg mb-3">🔑</div>
                <p className="text-sm text-zinc-500 mb-4">No sync token generated yet</p>
                <button
                  onClick={generateToken}
                  disabled={generating}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white
                             font-semibold text-sm transition-all disabled:opacity-50">
                  {generating ? "Generating..." : "Generate Token"}
                </button>
                {genError && <p className="mt-3 text-xs text-rose-400">{genError}</p>}
              </div>
            )}
          </div>
        </details>

        {/* ── CONNECTED ACCOUNTS ────────────────────────────────────────────── */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-5">
            Connected Accounts
          </p>

          {tradingAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--cj-raised)] border border-zinc-800
                              flex items-center justify-center text-lg mb-3">📊</div>
              <p className="text-sm text-zinc-500 mb-1">No accounts connected yet</p>
              <p className="text-xs text-zinc-600">
                Use Quick Connect above, or install the EA and push your first trade.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tradingAccounts.map((acct) => {
                const isQC = acct.sync_method === "investor";
                return (
                  <div key={acct.id} className="bg-[var(--cj-raised)] border border-zinc-800 rounded-xl p-4">

                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        {editingAccountId === acct.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveLabel(acct.id);
                                if (e.key === "Escape") setEditingAccountId(null);
                              }}
                              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5
                                         text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                              placeholder="Account label"
                              autoFocus
                            />
                            <button onClick={() => saveLabel(acct.id)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500
                                         text-white font-semibold transition-all">
                              Save
                            </button>
                            <button onClick={() => setEditingAccountId(null)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700
                                         text-zinc-400 hover:text-zinc-200 transition-all">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-zinc-100 truncate">
                              {acct.account_label || acct.broker_name || acct.account_login || "Unknown Account"}
                            </p>
                            <button
                              onClick={() => { setEditingAccountId(acct.id); setEditLabel(acct.account_label || ""); }}
                              className="text-[10px] text-zinc-600 hover:text-blue-400 transition-colors">
                              Rename
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {/* Sync method badge */}
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full
                          ${isQC
                            ? "bg-blue-500/15 border border-blue-500/30 text-blue-400"
                            : "bg-zinc-800 border border-zinc-700 text-zinc-500"
                          }`}>
                          {isQC ? "🔗 Quick Connect" : "⚡ EA Sync"}
                        </span>
                        {/* Account type badge */}
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full
                          ${acct.account_type === "demo"
                            ? "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400"
                            : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                          }`}>
                          {acct.account_type}
                        </span>
                        {acct.is_cent && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full
                            bg-orange-500/15 border border-orange-500/30 text-orange-400">
                            Cent
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status row (Quick Connect only) */}
                    {isQC && (
                      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-zinc-800">
                        <SyncStatusDot status={acct.sync_status} />
                        <span className="text-[11px] text-zinc-600">
                          Last sync: {timeAgo(acct.last_synced_at)}
                        </span>
                        {acct.platform && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded
                                           bg-zinc-800 text-zinc-500">
                            {acct.platform}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Error message */}
                    {isQC && acct.sync_status === "failed" && acct.sync_error && (
                      <div className="mb-3 rounded-lg px-3 py-2 bg-rose-500/8 border border-rose-500/20">
                        <p className="text-[11px] text-rose-400">{acct.sync_error}</p>
                      </div>
                    )}

                    {/* Detail grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs mb-3">
                      {acct.broker_name && (
                        <>
                          <span className="text-zinc-600">Broker</span>
                          <span className="text-zinc-300 truncate">{acct.broker_name}</span>
                        </>
                      )}
                      {acct.account_login && (
                        <>
                          <span className="text-zinc-600">Login</span>
                          <span className="font-mono text-zinc-300">{acct.account_login}</span>
                        </>
                      )}
                      {acct.account_server && (
                        <>
                          <span className="text-zinc-600">Server</span>
                          <span className="text-zinc-300 truncate">{acct.account_server}</span>
                        </>
                      )}
                      <span className="text-zinc-600">Currency</span>
                      <span className="text-zinc-300">{acct.account_currency}</span>
                      {acct.current_balance != null && (
                        <>
                          <span className="text-zinc-600">Balance</span>
                          <span className="text-zinc-300 font-mono">
                            {acct.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                            {acct.account_currency}
                          </span>
                        </>
                      )}
                      {!isQC && acct.last_synced_at && (
                        <>
                          <span className="text-zinc-600">Last sync</span>
                          <span className="text-zinc-400">{timeAgo(acct.last_synced_at)}</span>
                        </>
                      )}
                    </div>

                    {/* Disconnect */}
                    <div className="border-t border-zinc-800 pt-3">
                      <button
                        onClick={() => deleteAccount(acct.id)}
                        className="text-[11px] text-zinc-700 hover:text-rose-400 transition-colors">
                        Disconnect account
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SETUP GUIDE ───────────────────────────────────────────────────── */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">MT5 EA Setup Guide</p>
            <a
              href="/downloads/CandlesJournalEA.ex5"
              download="CandlesJournalEA.ex5"
              className="text-center text-xs px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white
                         font-semibold transition-all sm:w-auto w-full">
              Download EA (.ex5)
            </a>
          </div>

          <ol className="space-y-6">
            {[
              {
                n: "1",
                title: "Download the Expert Advisor",
                body: 'Click "Download EA" above to get CandlesJournalEA.ex5. This is a pre-compiled file — no MetaEditor or compilation needed.',
              },
              {
                n: "2",
                title: "Copy the EA into MetaTrader 5",
                body: "In MT5: File → Open Data Folder → MQL5 → Experts. Copy CandlesJournalEA.ex5 into that folder. Then in the Navigator panel, right-click Experts → Refresh.",
              },
              {
                n: "3",
                title: "Allow WebRequest in MT5",
                body: `Tools → Options → Expert Advisors → check "Allow WebRequest for listed URL". Add your Sync URL: ${syncUrl || "(shown in MT5 Sync Token section above)"}`,
              },
              {
                n: "4",
                title: "Attach the EA to a chart",
                body: 'Drag CandlesJournalEA onto any chart (e.g. EURUSD H1). In the Inputs tab, paste your Sync Token and Sync URL. Enable "Allow algo trading" in the Common tab.',
              },
              {
                n: "5",
                title: "Trades sync automatically",
                body: 'Every time you close a trade in MT5, the EA sends it to your journal instantly. The "Last sync" timestamp on the account card will update.',
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-4">
                <div className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30
                                flex items-center justify-center text-[11px] font-bold text-blue-400 shrink-0 mt-0.5">
                  {step.n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200 mb-1">{step.title}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

      </main>
      </div>
    </div>
  );
}
