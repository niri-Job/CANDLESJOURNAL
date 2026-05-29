"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";

interface SubState { status: string; end: string | null; }

interface Mt5Connection {
  id: string;
  mt5_login: string;
  broker_server: string;
  status: string;
  last_synced_at: string | null;
  sync_error: string | null;
  account_name: string | null;
  account_currency: string | null;
  account_balance: number | null;
}

interface EaTokenRow {
  token: string;
  account_number: string;
  broker_server: string;
  last_used_at: string | null;
}

interface TradingAccountRow {
  id: string;
  account_signature: string;
  account_label: string | null;
  broker_name: string | null;
  account_login: string | null;
  account_server: string | null;
  account_currency: string | null;
  account_type: string | null;
  sync_method: string | null;
  is_verified: boolean | null;
  verification_status: string | null;
  current_balance: number | null;
  last_synced_at: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return "Just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
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

// ── Referral quick-view ───────────────────────────────────────────────────────
function ReferralQuickView() {
  const [data, setData] = useState<{
    referral_code: string | null;
    referral_enabled: boolean;
    subscription_status: string;
    active_referrals: number;
    this_month_earnings: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/referrals/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d));
  }, []);

  const isFree = !data || data.subscription_status !== "pro";

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Referrals</p>
        <Link href="/referrals" className="text-[11px] font-semibold transition-colors"
              style={{ color: "var(--cj-gold)" }}>
          View Dashboard →
        </Link>
      </div>

      {isFree ? (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-300 mb-1">Earn recurring commissions</p>
            <p className="text-xs text-zinc-500">
              Upgrade to Pro to unlock your referral link and start earning ₦1,000/month per referral.
            </p>
          </div>
          <Link href="#" className="btn-gold px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap">
            Upgrade
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--cj-raised)] rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Your Code</p>
            <p className="font-mono font-bold text-[var(--cj-gold)] text-sm">
              {data?.referral_code ?? "—"}
            </p>
          </div>
          <div className="bg-[var(--cj-raised)] rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Active</p>
            <p className="font-bold text-zinc-100 text-lg">{data?.active_referrals ?? 0}</p>
          </div>
          <div className="bg-[var(--cj-raised)] rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">This Month</p>
            <p className="font-bold text-zinc-100 text-lg">
              ₦{(data?.this_month_earnings ?? 0).toLocaleString("en-NG")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const [loading,         setLoading]         = useState(true);
  const [sub,             setSub]             = useState<SubState>({ status: "free", end: null });

  // MT5 Direct Connect state
  const [mt5Connections,  setMt5Connections]  = useState<Mt5Connection[]>([]);
  const [tradingAccounts, setTradingAccounts] = useState<TradingAccountRow[]>([]);
  const [mt5Login,        setMt5Login]        = useState("");
  const [mt5Password,     setMt5Password]     = useState("");
  const [mt5Server,       setMt5Server]       = useState("");
  const [mt5ConnectError, setMt5ConnectError] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [showPassword,    setShowPassword]    = useState(false);

  // EA Sync state
  const [eaTokens,      setEaTokens]      = useState<EaTokenRow[]>([]);
  const [eaAccountNum,  setEaAccountNum]  = useState("");
  const [eaBrokerSrv,   setEaBrokerSrv]   = useState("");
  const [generating,    setGenerating]    = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedToken,   setCopiedToken]   = useState<string | null>(null);

  // CSV Import state
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult,    setCsvResult]    = useState<{ inserted: number; duplicates: number } | null>(null);
  const [csvError,     setCsvError]     = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function copyToken(tok: string) {
    navigator.clipboard.writeText(tok).then(() => {
      setCopiedToken(tok);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const [subRes, connectionsRes, tokenRes, accountsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_status, subscription_end")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("mt5_connections")
          .select("*")
          .eq("user_id", user.id)
          .neq("status", "disconnected")
          .order("created_at", { ascending: false }),
        supabase
          .from("ea_tokens")
          .select("token, account_number, broker_server, last_used_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("trading_accounts")
          .select("id, account_signature, account_label, broker_name, account_login, account_server, account_currency, account_type, sync_method, is_verified, verification_status, current_balance, last_synced_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const subData = subRes.data as { subscription_status: string | null; subscription_end: string | null } | null;
      setSub({ status: subData?.subscription_status ?? "free", end: subData?.subscription_end ?? null });

      if (connectionsRes.data) setMt5Connections(connectionsRes.data as Mt5Connection[]);
      if (tokenRes.data)       setEaTokens(tokenRes.data as EaTokenRow[]);
      if (accountsRes.data)    setTradingAccounts(accountsRes.data as TradingAccountRow[]);

      setLoading(false);
    }
    init();
  }, []);

  async function refreshConnections() {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("mt5_connections")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "disconnected")
      .order("created_at", { ascending: false });
    if (data) setMt5Connections(data as Mt5Connection[]);
  }

  async function refreshEaTokens() {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("ea_tokens")
      .select("token, account_number, broker_server, last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setEaTokens(data as EaTokenRow[]);
  }

  async function refreshTradingAccounts() {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("trading_accounts")
      .select("id, account_signature, account_label, broker_name, account_login, account_server, account_currency, account_type, sync_method, is_verified, verification_status, current_balance, last_synced_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setTradingAccounts(data as TradingAccountRow[]);
  }

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    setMt5ConnectError("MT5 Direct Connect is coming soon. Use EA Sync or CSV Import for now.");
  }

  async function handleMt5Disconnect(conn: Mt5Connection) {
    setDisconnectingId(conn.id);
    try {
      const res = await fetch("/api/mt5/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conn.id, login: conn.mt5_login }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) {
        showToast(json.error ?? "Failed to disconnect.");
      } else {
        setMt5Connections((prev) => prev.filter((c) => c.id !== conn.id));
        showToast("Account disconnected.");
      }
    } catch {
      showToast("Network error — try again.");
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleDeleteTradingAccount(account: TradingAccountRow) {
    const label = account.account_label || [account.account_login, account.account_server].filter(Boolean).join(" - ") || account.account_signature;
    const ok = window.confirm(`Delete ${label}? This removes the account and its imported/synced trades from your journal.`);
    if (!ok) return;

    setDeletingAccount(account.account_signature);
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(account.account_signature)}`, {
        method: "DELETE",
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) {
        showToast(json.error ?? "Failed to delete account.");
      } else {
        setTradingAccounts((prev) => prev.filter((a) => a.account_signature !== account.account_signature));
        setMt5Connections((prev) => prev.filter((c) => {
          if (account.account_login && c.mt5_login !== account.account_login) return true;
          if (account.account_server && c.broker_server !== account.account_server) return true;
          return false;
        }));
        setEaTokens((prev) => prev.filter((tok) => {
          if (account.account_login && tok.account_number !== account.account_login) return true;
          if (account.account_server && tok.broker_server !== account.account_server) return true;
          return false;
        }));
        showToast("Account deleted.");
        await Promise.all([refreshTradingAccounts(), refreshConnections(), refreshEaTokens()]);
      }
    } catch {
      showToast("Network error - try again.");
    } finally {
      setDeletingAccount(null);
    }
  }

  async function handleGenerateEa(e: React.FormEvent) {
    e.preventDefault();
    if (!eaAccountNum.trim()) { setGenerateError("Enter your MT5 account number."); return; }
    if (!eaBrokerSrv.trim())  { setGenerateError("Enter your broker server name."); return; }
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/mt5/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number: eaAccountNum.trim(),
          broker_server:  eaBrokerSrv.trim(),
        }),
      });
      const json = await res.json() as {
        success?: boolean;
        token?: string;
        account_number?: string;
        broker_server?: string;
        error?: string;
      };
      if (!res.ok) {
        setGenerateError(json.error ?? "Failed to generate token.");
      } else {
        setEaTokens((prev) => [{
          token:          json.token ?? "",
          account_number: json.account_number ?? eaAccountNum.trim(),
          broker_server:  json.broker_server ?? eaBrokerSrv.trim(),
          last_used_at:   null,
        }, ...prev.filter((tok) => tok.account_number !== (json.account_number ?? eaAccountNum.trim()))]);
        setEaAccountNum("");
        setEaBrokerSrv("");
        await refreshEaTokens();
        showToast("EA token generated. Download your EA below.");
      }
    } catch {
      setGenerateError("Network error. Check your connection.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    setCsvError(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/trades/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_content: text }),
      });
      const json = await res.json() as {
        success?: boolean;
        inserted?: number;
        duplicates?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        setCsvError(json.error ?? "Import failed.");
      } else {
        setCsvResult({ inserted: json.inserted ?? 0, duplicates: json.duplicates ?? 0 });
        showToast(`${json.inserted ?? 0} trades imported successfully.`);
      }
    } catch {
      setCsvError("Failed to read file.");
    } finally {
      setCsvImporting(false);
      e.target.value = "";
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                        text-sm font-semibold shadow-xl"
             style={{ background: "var(--cj-surface)", border: "1px solid rgba(245,197,24,0.3)", color: "var(--cj-gold)" }}>
          {toast}
        </div>
      )}

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* -- SYNC METHOD OVERVIEW -- */}
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Sync Method</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* MT5 Direct Connect card */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                     style={{ background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cj-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <span className="text-xs font-bold text-zinc-200">MT5 Direct Connect</span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-card-border)", color: "var(--cj-gold-muted)" }}>
                  Coming Soon
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Credentials-based sync is not ready for production yet.
              </p>
              <div className="mt-auto">
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--cj-gold-muted)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cj-gold-muted)" }} />Coming Soon
                </span>
              </div>
            </div>

            {/* EA Sync card */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                     style={{ background: "rgba(139,53,255,0.1)", border: "1px solid rgba(139,53,255,0.2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                </div>
                <span className="text-xs font-bold text-zinc-200">EA Sync</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Token-based sync from the NIRI Expert Advisor.
              </p>
              <div className="mt-auto">
                {eaTokens.length > 0
                  ? <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Token ready</span>
                  : <span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />Not set up</span>}
              </div>
            </div>

            {/* CSV Import card */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                     style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </div>
                <span className="text-xs font-bold text-zinc-200">CSV Import</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Manual import from an MT5 history CSV file.
              </p>
              <div className="mt-auto">
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Available</span>
              </div>
            </div>

          </div>
        </div>

        {/* -- SYNCED ACCOUNTS -- */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Synced Accounts</p>

          {tradingAccounts.length > 0 ? (
            <div className="space-y-3">
              {tradingAccounts.map((account) => {
                const title = account.account_label ||
                  [account.account_login, account.account_server].filter(Boolean).join(" - ") ||
                  account.account_signature;
                const isDeleting = deletingAccount === account.account_signature;

                return (
                  <div key={account.id}
                       className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-zinc-100">{title}</p>
                          {account.account_type && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                             bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              {account.account_type}
                            </span>
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                           border border-zinc-700 text-zinc-500">
                            {account.is_verified ? "Verified" : "Unverified"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-mono">{account.account_signature}</p>
                        <p className="text-[11px] text-zinc-600 mt-1">
                          {account.sync_method ? `${account.sync_method.toUpperCase()} sync` : "Journal account"}
                          {" "}· Last sync: {timeAgo(account.last_synced_at)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteTradingAccount(account)}
                        disabled={isDeleting}
                        className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                                   border border-rose-500/20 text-rose-400 hover:bg-rose-500/10
                                   hover:border-rose-500/40 transition-all disabled:opacity-50">
                        {isDeleting ? (
                          <span className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
                          </svg>
                        )}
                        Delete
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-4">
                      {account.account_currency && (
                        <>
                          <span className="text-zinc-600">Currency</span>
                          <span className="text-zinc-300">{account.account_currency}</span>
                        </>
                      )}
                      {account.current_balance != null && (
                        <>
                          <span className="text-zinc-600">Balance</span>
                          <span className="text-zinc-300 font-mono">
                            {account.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
              <p className="text-sm font-semibold text-zinc-100 mb-1">No synced accounts yet</p>
              <p className="text-xs text-zinc-500">Generate an EA token or import CSV history to add an account.</p>
            </div>
          )}
        </div>

        {/* -- MT -- */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">A. MT5 Direct Connect</p>

          {/* Quick-action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <a
              href="https://youtube.com/@niritoday"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8z"/>
                <polygon fill="#0A0A0F" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
              </svg>
              Watch Setup Video
            </a>
            <a
              href="https://t.me/2349075040851"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", color: "#38bdf8" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.94 8.19-2 9.4c-.14.64-.53.8-.99.5l-2.75-2.03-1.33 1.28c-.15.14-.27.27-.55.27l.2-2.78 5.05-4.56c.22-.2-.05-.3-.34-.1L6.73 15.3l-2.7-.84c-.59-.19-.6-.59.12-.87l10.35-4c.49-.18.92.12.44 1.6z"/>
              </svg>
              Need help? Chat with us
            </a>
          </div>

          {/* Coming soon notice */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4"
               style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cj-gold-muted)" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: "var(--cj-text-muted)" }}>
              <span className="font-semibold" style={{ color: "var(--cj-gold-muted)" }}>Coming Soon:</span>{" "}
              MT5 Direct Connect is not ready for production. Use EA Sync or CSV Import for now.
            </p>
          </div>

          {/* Connected accounts */}
          {mt5Connections.length > 0 && (
            <div className="space-y-3 mb-4">
              {mt5Connections.map((conn) => (
                <div key={conn.id}
                     className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <SyncStatusDot status={conn.status} />
                        {conn.account_name && (
                          <span className="text-sm font-semibold text-zinc-100">{conn.account_name}</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 font-mono">
                        #{conn.mt5_login} · {conn.broker_server}
                      </p>
                    </div>
                    <button
                      onClick={() => handleMt5Disconnect(conn)}
                      disabled={disconnectingId === conn.id}
                      className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                                 border border-rose-500/20 text-rose-400 hover:bg-rose-500/10
                                 hover:border-rose-500/40 transition-all disabled:opacity-50">
                      {disconnectingId === conn.id ? (
                        <span className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      )}
                      Disconnect
                    </button>
                  </div>

                  {conn.sync_error && conn.status === "failed" && (
                    <div className="mb-3 rounded-lg px-3 py-2 bg-rose-500/8 border border-rose-500/20">
                      <p className="text-[11px] text-rose-400">{conn.sync_error}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {conn.account_currency && (
                      <>
                        <span className="text-zinc-600">Currency</span>
                        <span className="text-zinc-300">{conn.account_currency}</span>
                      </>
                    )}
                    {conn.account_balance != null && (
                      <>
                        <span className="text-zinc-600">Balance</span>
                        <span className="text-zinc-300 font-mono">
                          {conn.account_balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                          {conn.account_currency}
                        </span>
                      </>
                    )}
                    <span className="text-zinc-600">Last sync</span>
                    <span className="text-zinc-400">{timeAgo(conn.last_synced_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connect form */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-zinc-100">
                MT5 Direct Connect
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-card-border)", color: "var(--cj-gold-muted)" }}>
                Coming Soon
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-5">
              This connection method is disabled while we finish production hardening.
            </p>

            <form onSubmit={handleMt5Connect} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    MT5 Login Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mt5Login}
                    onChange={(e) => setMt5Login(e.target.value)}
                    disabled
                    placeholder="e.g. 12345678"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">Shown in MT5 top-left corner</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    Broker Server <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={mt5Server}
                    onChange={(e) => setMt5Server(e.target.value)}
                    disabled
                    placeholder="e.g. ICMarkets-MT5"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">MT5 → File → Open an Account</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                  MT5 Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={mt5Password}
                    onChange={(e) => setMt5Password(e.target.value)}
                    disabled
                    placeholder="Your MT5 investor or master password"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600 pr-10
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-600">Encrypted on connection — never stored in plain text</p>
              </div>

              {mt5ConnectError && (
                <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                  <p className="text-xs text-rose-400">{mt5ConnectError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "var(--cj-text-muted)" }}>
                Coming Soon
              </button>
            </form>
          </div>
        </div>

        {/* -- EA SYNC -- */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">B. EA Sync</p>

          {eaTokens.length > 0 && (
            <div className="space-y-3 mb-4">
              {eaTokens.map((tok) => (
                <div key={`${tok.account_number}-${tok.broker_server}`}
                     className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider
                                         px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          EA Registered
                        </span>
                        <span className="text-sm font-semibold text-zinc-100">Account #{tok.account_number}</span>
                      </div>
                      <p className="text-xs text-zinc-500">{tok.broker_server}</p>
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      Last sync: {timeAgo(tok.last_used_at)}
                    </span>
                  </div>

                  <a
                    href="/NIRI_EA.ex5"
                    download="NIRI_EA.ex5"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm
                               transition-all mb-3"
                    style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download NIRI_EA.ex5
                  </a>

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">
                      Sync Token
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={tok.token}
                        className="flex-1 min-w-0 bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-3 py-2
                                   text-xs font-mono text-zinc-400 focus:outline-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() => copyToken(tok.token)}
                        className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                        style={copiedToken === tok.token
                          ? { borderColor: "rgba(16,185,129,0.4)", color: "#34d399", background: "rgba(16,185,129,0.08)" }
                          : { borderColor: "#3f3f46", color: "#a1a1aa" }}>
                        {copiedToken === tok.token ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-600">
                      Paste this token into the NIRI EA Inputs tab in MT5.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-zinc-100">
                {eaTokens.length > 0 ? "Generate Another EA Token" : "Generate EA Token"}
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                               bg-violet-500/10 border border-violet-500/30 text-violet-300">
                Token sync
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-5">
              Use this option when you want MT5 to push closed trades through the NIRI EA instead of Direct Connect.
            </p>

            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5"
                 style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cj-gold-muted)" strokeWidth="1.5"
                   strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: "var(--cj-text-muted)" }}>
                NIRI EA requires MT5 on Windows or Mac. Mobile-only MT5 installations are not supported.
                MT5 must remain running for trades to sync.
              </p>
            </div>

            <div className="space-y-3 mb-5">
              {[
                { n: 1, title: "Generate EA Token", desc: "Enter your MT5 account number and broker server below." },
                { n: 2, title: "Download NIRI_EA.ex5", desc: "Download the EA file after generating your token." },
                { n: 3, title: "Install EA in MT5", desc: "Place NIRI_EA.ex5 in MT5's MQL5 Experts folder, then restart MT5." },
                { n: 4, title: "Paste Token", desc: "Drag NIRI_EA onto any chart and paste your token in Inputs." },
                { n: 5, title: "Enable Live Trading", desc: "Allow live trading for the EA, then click OK." },
                { n: 6, title: "Trades Sync Automatically", desc: "Keep MT5 running so closed trades can sync to NIRI." },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm font-bold"
                        style={{ background: "rgba(245,197,24,0.12)", color: "var(--cj-gold)", border: "1px solid rgba(245,197,24,0.25)" }}>
                    {n}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{title}</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleGenerateEa} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    MT5 Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={eaAccountNum}
                    onChange={(e) => setEaAccountNum(e.target.value)}
                    placeholder="e.g. 12345678"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">Shown in MT5 top-left corner</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                    Broker Server <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={eaBrokerSrv}
                    onChange={(e) => setEaBrokerSrv(e.target.value)}
                    placeholder="e.g. ICMarkets-MT5"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">Use the exact server name from MT5</p>
                </div>
              </div>

              {generateError && (
                <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                  <p className="text-xs text-rose-400">{generateError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={generating}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : "Generate EA Token"}
              </button>
            </form>
          </div>
        </div>

        {/* -- CSV IMPORT -- */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">C. CSV Import</p>
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <p className="text-sm font-semibold text-zinc-100 mb-1">Import MT5 History CSV</p>
            <p className="text-xs text-zinc-500 leading-relaxed mb-4">
              Upload an MT5 history CSV file. This uses the simple CSV import route and does not require Direct Connect or EA Sync.
            </p>

            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5"
                 style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5"
                   strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div className="text-xs text-emerald-300 leading-relaxed space-y-1">
                <p>In MT5: View {"->"} Terminal {"->"} Account History {"->"} right-click {"->"} Save as Report {"->"} choose CSV.</p>
                <p className="text-zinc-500">Expected columns include ticket, time, type, volume, symbol, price, close time, close price, commission, swap, and profit.</p>
              </div>
            </div>

            {csvError && (
              <div className="mb-4 rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                <p className="text-xs text-rose-400">{csvError}</p>
              </div>
            )}

            {csvResult && (
              <div className="mb-4 rounded-xl px-4 py-3"
                   style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <p className="text-xs text-emerald-400 font-semibold">
                  {csvResult.inserted} trade{csvResult.inserted !== 1 ? "s" : ""} imported
                  {csvResult.duplicates > 0 ? `, ${csvResult.duplicates} duplicate${csvResult.duplicates !== 1 ? "s" : ""} skipped` : ""}.
                </p>
              </div>
            )}

            <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm
                               transition-all cursor-pointer ${csvImporting ? "opacity-60 pointer-events-none" : "hover:opacity-90"}`}
                   style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff" }}>
              {csvImporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Select CSV File to Import
                </>
              )}
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleCsvImport}
                disabled={csvImporting}
              />
            </label>
          </div>
        </div>

        {/* -- REFERRALS QUICK -- */}
        <ReferralQuickView />

      </main>
      </div>
    </div>
  );
}
