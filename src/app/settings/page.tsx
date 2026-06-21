"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";
import { parseTradeFile, type PreviewRow } from "@/lib/parseTradeFile";

interface SubState { status: string; end: string | null; }

interface TradingAccountRow {
  id: string;
  account_signature: string;
  account_label: string | null;
  account_login: string | null;
  account_server: string | null;
  account_currency: string | null;
  account_type: string | null;
  sync_method: string | null;
  sync_source: string | null;
  is_verified: boolean | null;
  verification_status: string | null;
  current_balance: number | null;
  last_synced_at: string | null;
  metaapi_account_id: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)    return "Just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// WAT = UTC+1 — mutate a copy forward 1 UTC hour, then read UTC-clock fields
// back out. Uses UTC methods throughout so the offset doesn't depend on the
// browser's own local timezone.
function formatWAT(date: Date): string {
  const wat = new Date(date);
  wat.setUTCHours(wat.getUTCHours() + 1);
  const hh = wat.getUTCHours().toString().padStart(2, "0");
  const mm = wat.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

// ── Referral quick-view ───────────────────────────────────────────────────────
function ReferralQuickView() {
  const [data, setData] = useState<{
    referral_code: string | null;
    total:         number;
    converted:     number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/referrals/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d));
  }, []);

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Referrals</p>
        <Link href="/referrals" className="text-[11px] font-semibold transition-colors"
              style={{ color: "var(--cj-gold)" }}>
          View Dashboard →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--cj-raised)] rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Your Code</p>
          <p className="font-mono font-bold text-sm" style={{ color: "var(--cj-gold)" }}>
            {data?.referral_code ?? "—"}
          </p>
        </div>
        <div className="bg-[var(--cj-raised)] rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Referred</p>
          <p className="font-bold text-zinc-100 text-lg">{data?.total ?? 0}</p>
        </div>
        <div className="bg-[var(--cj-raised)] rounded-xl p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Converted</p>
          <p className="font-bold text-zinc-100 text-lg">{data?.converted ?? 0}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [user,            setUser]            = useState<User | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [sub,             setSub]             = useState<SubState>({ status: "free", end: null });
  const [mt5TrialEndsAt,  setMt5TrialEndsAt]  = useState<string | null>(null);
  const [tradingAccounts, setTradingAccounts] = useState<TradingAccountRow[]>([]);

  // MT5 Direct Connect
  const [mt5Login,        setMt5Login]        = useState("");
  const [mt5Password,     setMt5Password]     = useState("");
  const [mt5Server,       setMt5Server]       = useState("");
  const [mt5Platform,     setMt5Platform]     = useState<"mt5" | "mt4">("mt5");
  const [mt5ConnectError, setMt5ConnectError] = useState<string | null>(null);
  const [mt5Connecting,   setMt5Connecting]   = useState(false);
  const [showPassword,    setShowPassword]    = useState(false);

  // Account actions
  const [syncingAccount,  setSyncingAccount]  = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);

  // CSV Import
  const [csvLogin,    setCsvLogin]    = useState("");
  const [csvBroker,   setCsvBroker]   = useState("");
  const [csvPreview,  setCsvPreview]  = useState<PreviewRow[] | null>(null);
  const [csvRaw,      setCsvRaw]      = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvTouched,  setCsvTouched]  = useState({ login: false, broker: false });
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult,    setCsvResult]    = useState<{ inserted: number; duplicates: number } | null>(null);
  const [csvError,     setCsvError]     = useState<string | null>(null);
  const [csvSuccess,   setCsvSuccess]   = useState<{ inserted: number; label: string } | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const autoSynced = useRef(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function refreshTradingAccounts() {
    if (!user) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trading_accounts")
      .select("id, account_signature, account_label, account_login, account_server, account_currency, account_type, sync_method, sync_source, is_verified, verification_status, current_balance, last_synced_at, metaapi_account_id")
      .eq("user_id", user.id)
      .order("last_synced_at", { ascending: false, nullsFirst: false });
    if (error) console.error("[settings] refreshTradingAccounts error:", JSON.stringify(error));
    if (data)  setTradingAccounts(data as TradingAccountRow[]);
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const [subRes, accountsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_status, subscription_end, mt5_trial_ends_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("trading_accounts")
          .select("id, account_signature, account_label, account_login, account_server, account_currency, account_type, sync_method, sync_source, is_verified, verification_status, current_balance, last_synced_at, metaapi_account_id")
          .eq("user_id", user.id)
          .order("last_synced_at", { ascending: false, nullsFirst: false }),
      ]);

      const subData = subRes.data as { subscription_status: string | null; subscription_end: string | null; mt5_trial_ends_at: string | null } | null;
      setSub({ status: subData?.subscription_status ?? "free", end: subData?.subscription_end ?? null });
      setMt5TrialEndsAt(subData?.mt5_trial_ends_at ?? null);
      if (accountsRes.data) setTradingAccounts(accountsRes.data as TradingAccountRow[]);
      setLoading(false);
    }
    init();
  }, []);

  // Auto-sync MetaAPI accounts on page load
  useEffect(() => {
    if (loading || autoSynced.current || !user) return;
    const metaapiAccs = tradingAccounts.filter(
      (a) => a.sync_method === "metaapi" && !!a.metaapi_account_id
    );
    if (!metaapiAccs.length) return;
    autoSynced.current = true;
    metaapiAccs.forEach((acc) => {
      fetch("/api/metaapi/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_signature: acc.account_signature }),
      })
        .then((res) => (res.ok ? refreshTradingAccounts() : undefined))
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    if (!mt5Login.trim() || !mt5Password.trim() || !mt5Server.trim()) {
      setMt5ConnectError("All fields are required.");
      return;
    }
    setMt5Connecting(true);
    setMt5ConnectError(null);

    const supabase = createClient();
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      setMt5ConnectError("Your session has expired. Please log out and log back in.");
      setMt5Connecting(false);
      return;
    }

    try {
      const res = await fetch("/api/metaapi/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login:    mt5Login.trim(),
          password: mt5Password.trim(),
          server:   mt5Server.trim(),
          platform: mt5Platform,
        }),
      });
      const json = await res.json() as { success?: boolean; account_label?: string; account_signature?: string; error?: string };
      if (!res.ok) {
        setMt5ConnectError(json.error ?? "Connection failed. Please try again.");
      } else {
        const newSig = json.account_signature;
        setMt5Login(""); setMt5Password(""); setMt5Server("");
        showToast("Connected! Syncing your trades in the background...");
        await refreshTradingAccounts();
        autoSynced.current = false;
        if (newSig) {
          fetch("/api/metaapi/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_signature: newSig }),
          }).catch(() => undefined);
        }
      }
    } catch {
      setMt5ConnectError("Network error. Check your connection and try again.");
    } finally {
      setMt5Connecting(false);
    }
  }

  async function handleMetaApiSync(accountSig: string) {
    setSyncingAccount(accountSig);
    try {
      const res = await fetch("/api/metaapi/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_signature: accountSig }),
      });
      const json = await res.json() as { success?: boolean; inserted?: number; error?: string; alreadySynced?: boolean; message?: string; historyNotReady?: boolean; trialExpired?: boolean };
      if (res.status === 202) {
        showToast(json.error ?? "Your account is still connecting to your broker. Please try syncing again in 2 minutes.");
        return;
      }
      if (!res.ok) {
        if (json.trialExpired) setMt5TrialEndsAt(new Date(0).toISOString());
        showToast(json.error ?? "Sync failed.");
      } else if (json.historyNotReady) {
        showToast(json.message ?? "No trade history yet. Your broker may still be loading — try again in a few minutes.");
        await refreshTradingAccounts();
      } else if (json.alreadySynced) {
        showToast(json.message ?? "Already synced today. Try again tomorrow.");
        await refreshTradingAccounts();
      } else {
        const n = json.inserted ?? 0;
        showToast(`Synced ${n} new trade${n !== 1 ? "s" : ""}.`);
        await refreshTradingAccounts();
      }
    } catch {
      showToast("Network error — sync failed.");
    } finally {
      setSyncingAccount(null);
    }
  }

  async function handleDeleteTradingAccount(account: TradingAccountRow) {
    const label = account.account_label ||
      [account.account_login, account.account_server].filter(Boolean).join(" — ") ||
      account.account_signature;
    if (!window.confirm(`Delete ${label}? This removes the account and all its trades from your journal.`)) return;

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
        showToast("Account deleted.");
      }
    } catch {
      showToast("Network error — try again.");
    } finally {
      setDeletingAccount(null);
    }
  }

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!csvLogin.trim() || !csvBroker.trim()) {
      setCsvTouched({ login: true, broker: true });
      setCsvError("Fill in your MT5 Login Number and Broker first.");
      return;
    }
    setCsvFileName(file.name);
    setCsvError(null);
    setCsvPreview(null);
    const result = await parseTradeFile(file);
    if (result.error) {
      setCsvError(result.error);
      setCsvPreview(null);
      setCsvRaw("");
    } else {
      setCsvRaw(result.csvRaw);
      setCsvPreview(result.preview);
    }
    e.target.value = "";
  };

  async function handleCsvConfirm() {
    setCsvTouched({ login: true, broker: true });
    if (!csvLogin.trim()) { setCsvError("MT5 Login Number is required."); return; }
    if (!csvBroker.trim()) { setCsvError("Broker name is required."); return; }
    if (!csvRaw) { setCsvError("Please select a CSV file first."); return; }
    setCsvImporting(true);
    setCsvError(null);
    try {
      const res = await fetch("/api/trades/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_content:    csvRaw,
          account_login:  csvLogin.trim(),
          account_broker: csvBroker.trim(),
        }),
      });
      const json = await res.json() as {
        success?: boolean; inserted?: number; duplicates?: number;
        account_label?: string; error?: string;
      };
      if (!res.ok) {
        setCsvError(json.error ?? "Import failed. Please try again.");
      } else {
        const label    = json.account_label ?? `${csvLogin.trim()} — ${csvBroker.trim()}`;
        const inserted = json.inserted  ?? 0;
        const duplicates = json.duplicates ?? 0;
        setCsvSuccess({ inserted, label });
        setCsvResult({ inserted, duplicates });
        showToast(`${inserted} trade${inserted !== 1 ? "s" : ""} imported for ${label}.`);
        setCsvLogin(""); setCsvBroker(""); setCsvPreview(null);
        setCsvRaw(""); setCsvFileName(""); setCsvTouched({ login: false, broker: false });
        await refreshTradingAccounts();
      }
    } catch {
      setCsvError("Network error. Check your connection and try again.");
    } finally {
      setCsvImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  const metaapiAccounts = tradingAccounts.filter(
    (a) => a.sync_source === "metaapi" || a.sync_method === "metaapi"
  );

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
        <main className="max-w-[860px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

          {/* ── SECTION 1: DATA SOURCES ── */}
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">Data Sources</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Left: MT5 Direct Connect */}
              <div>
                <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-zinc-100">MT5 Direct Connect</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                     bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                    Enter your MT5 credentials. NIRI connects via MetaAPI and fetches your trade history
                    automatically. Your password is encrypted in transit and never stored by NIRI.
                  </p>

                  {/* MT5 trial status banner */}
                  {mt5TrialEndsAt && (() => {
                    const now      = new Date();
                    const trialEnd = new Date(mt5TrialEndsAt);
                    if (now >= trialEnd) {
                      return (
                        <div className="mb-4 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                             style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)" }}>
                          <p className="text-xs leading-relaxed" style={{ color: "#fbbf24" }}>
                            Your free trial has ended. Upgrade to continue syncing.
                          </p>
                          <a href="/pricing"
                             className="text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0"
                             style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                            Upgrade
                          </a>
                        </div>
                      );
                    }
                    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    const urgent   = daysLeft <= 3;
                    return (
                      <div className="mb-4 px-3 py-2.5 rounded-xl"
                           style={{
                             background: urgent ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.06)",
                             border:     `1px solid ${urgent ? "rgba(251,191,36,0.3)" : "rgba(52,211,153,0.2)"}`,
                           }}>
                        <p className="text-xs font-semibold"
                           style={{ color: urgent ? "#fbbf24" : "#34d399" }}>
                          MT5 Free Trial &mdash; {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                        </p>
                      </div>
                    );
                  })()}

                  {/* Connected MetaAPI accounts */}
                  {metaapiAccounts.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {metaapiAccounts.map((account) => {
                        const label = account.account_label ||
                          [account.account_login, account.account_server].filter(Boolean).join(" — ") ||
                          account.account_signature;
                        const isSyncing = syncingAccount === account.account_signature;
                        const msSinceSync = account.last_synced_at ? Date.now() - new Date(account.last_synced_at).getTime() : Infinity;
                        const isThrottled = msSinceSync < 86400000;
                        const nextSyncAt = isThrottled ? new Date(new Date(account.last_synced_at!).getTime() + 86400000) : null;
                        return (
                          <div key={account.id}
                               className="flex items-center justify-between gap-2 bg-[var(--cj-raised)] border border-emerald-500/20 rounded-xl px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                <p className="text-xs font-semibold text-zinc-200 truncate">{label}</p>
                              </div>
                              <p className="text-[10px] text-zinc-600 mt-0.5">
                                Last synced: {timeAgo(account.last_synced_at)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleMetaApiSync(account.account_signature)}
                                disabled={isSyncing || isThrottled}
                                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg
                                           border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10
                                           transition-all disabled:opacity-50">
                                {isSyncing
                                  ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                    </svg>
                                }
                                {isSyncing ? "Syncing…" : "Sync"}
                              </button>
                              {nextSyncAt && (
                                <p className="text-[9px] text-amber-400">
                                  Next sync {formatWAT(nextSyncAt)} WAT
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Connect form */}
                  <form onSubmit={handleMt5Connect} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                          MT5 Login Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text" inputMode="numeric"
                          autoComplete="off"
                          value={mt5Login}
                          onChange={(e) => { setMt5Login(e.target.value); setMt5ConnectError(null); }}
                          disabled={mt5Connecting}
                          placeholder="e.g. 12345678"
                          className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                     text-sm text-zinc-100 placeholder-zinc-600
                                     focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <p className="mt-1 text-[10px] text-zinc-600">Shown in MT5 top-left corner</p>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                          Broker Server <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          value={mt5Server}
                          onChange={(e) => { setMt5Server(e.target.value); setMt5ConnectError(null); }}
                          disabled={mt5Connecting}
                          placeholder="e.g. Exness-MT5Trial9"
                          className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                     text-sm text-zinc-100 placeholder-zinc-600
                                     focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <p className="mt-1 text-[10px] text-zinc-600">MT5 → File → Open an Account</p>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                        MT5 Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={mt5Password}
                          onChange={(e) => { setMt5Password(e.target.value); setMt5ConnectError(null); }}
                          disabled={mt5Connecting}
                          placeholder="Investor or master password"
                          className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                                     text-sm text-zinc-100 placeholder-zinc-600 pr-10
                                     focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
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
                      <p className="mt-1 text-[10px] text-zinc-600">Encrypted in transit — never stored by NIRI</p>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">Platform</label>
                      <div className="flex gap-3">
                        {(["mt5", "mt4"] as const).map((p) => (
                          <button key={p} type="button" onClick={() => setMt5Platform(p)} disabled={mt5Connecting}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                            style={mt5Platform === p
                              ? { background: "rgba(245,197,24,0.15)", border: "1px solid rgba(245,197,24,0.4)", color: "var(--cj-gold)" }
                              : { background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "var(--cj-text-muted)" }}>
                            {p.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {mt5ConnectError && (
                      <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                        <p className="text-xs text-rose-400">{mt5ConnectError}</p>
                      </div>
                    )}

                    <button type="submit" disabled={mt5Connecting}
                      className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                                 disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                      {mt5Connecting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin" />
                          Connecting… (may take up to 60s)
                        </span>
                      ) : (metaapiAccounts.length > 0 ? "Connect Another Account" : "Connect MT5 Account")}
                    </button>
                  </form>
                </div>
              </div>

              {/* Right: CSV Import */}
              <div>
                <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
                  <p className="text-sm font-semibold text-zinc-100 mb-1">CSV Import</p>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-5">
                    Export your history from MT5 and import it manually.
                  </p>

                  {/* How-to hint */}
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5 text-xs leading-relaxed"
                       style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", color: "#86efac" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                         strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>
                      In MT5: <strong>View → Terminal → Account History</strong> → right-click →{" "}
                      <strong>Save as Report</strong>. Supports CSV, Excel (.xlsx), and HTML.
                    </span>
                  </div>

                  {csvSuccess ? (
                    <div className="flex flex-col items-center text-center gap-4 py-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center"
                           style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-100 mb-1">
                          {csvSuccess.inserted} trade{csvSuccess.inserted !== 1 ? "s" : ""} imported
                        </p>
                        <p className="text-xs text-zinc-500">
                          Account: <span className="text-zinc-300 font-medium">{csvSuccess.label}</span>
                        </p>
                        {csvResult && csvResult.duplicates > 0 && (
                          <p className="text-xs text-zinc-600 mt-1">
                            {csvResult.duplicates} duplicate{csvResult.duplicates !== 1 ? "s" : ""} skipped
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => { setCsvSuccess(null); setCsvResult(null); }}
                        className="text-xs font-semibold px-4 py-2 rounded-xl border border-zinc-700 text-zinc-400
                                   hover:text-zinc-200 hover:border-zinc-500 transition-colors">
                        Import another account
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                                 style={{ color: "var(--cj-gold-muted)" }}>
                            MT5 Login Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number" inputMode="numeric"
                            value={csvLogin}
                            onChange={(e) => { setCsvLogin(e.target.value); setCsvError(null); }}
                            onBlur={() => setCsvTouched((t) => ({ ...t, login: true }))}
                            placeholder="e.g. 12345678"
                            className="w-full bg-[var(--cj-raised)] border rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors"
                            style={{ borderColor: csvTouched.login && !csvLogin.trim() ? "rgba(239,68,68,0.5)" : "var(--cj-border)" }}
                          />
                          <p className="text-[10px] text-zinc-600 mt-1">Shown in MT5 top-left corner</p>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                                 style={{ color: "var(--cj-gold-muted)" }}>
                            Broker <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={csvBroker}
                            onChange={(e) => { setCsvBroker(e.target.value); setCsvError(null); }}
                            onBlur={() => setCsvTouched((t) => ({ ...t, broker: true }))}
                            placeholder="e.g. Exness, FXTM"
                            className="w-full bg-[var(--cj-raised)] border rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors"
                            style={{ borderColor: csvTouched.broker && !csvBroker.trim() ? "rgba(239,68,68,0.5)" : "var(--cj-border)" }}
                          />
                          {csvLogin && csvBroker && (
                            <p className="text-[10px] text-zinc-600 mt-1">{csvLogin} — {csvBroker}</p>
                          )}
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
                          Trade History File
                        </label>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls,.htm,.html,.txt"
                          onChange={handleCsvFile}
                          style={{
                            display: "block", width: "100%", padding: "8px 12px",
                            borderRadius: "10px", border: "1px solid #3f3f46",
                            background: "var(--cj-raised)", color: "#d4d4d8",
                            cursor: "pointer", fontSize: "13px",
                          }}
                        />
                        {csvFileName && (
                          <p className="text-xs text-emerald-400 mt-1.5">Selected: {csvFileName}</p>
                        )}
                      </div>

                      {csvError && (
                        <div className="mb-4 px-4 py-3 rounded-xl text-xs"
                             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                          {csvError}
                        </div>
                      )}

                      {csvPreview && csvPreview.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                            Preview — {csvPreview.length} trade{csvPreview.length !== 1 ? "s" : ""} detected
                          </p>
                          <div className="overflow-x-auto rounded-xl border border-zinc-800">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-zinc-800" style={{ background: "var(--cj-raised)" }}>
                                  {["Pair","Dir","Lot","Entry","Exit","P&L","Date"].map((h) => (
                                    <th key={h} className="px-3 py-2 text-left text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {csvPreview.slice(0, 8).map((row, i) => (
                                  <tr key={i} className="border-b border-zinc-800/60 last:border-0">
                                    <td className="px-3 py-2 font-sans font-semibold text-zinc-200">{row.pair}</td>
                                    <td className="px-3 py-2">
                                      <span className={`font-sans font-bold text-[10px] ${row.direction === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
                                        {row.direction}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-zinc-400 font-sans">{row.lot}</td>
                                    <td className="px-3 py-2 text-zinc-400 font-sans">{row.entry}</td>
                                    <td className="px-3 py-2 text-zinc-400 font-sans">{row.exit}</td>
                                    <td className="px-3 py-2 font-sans font-semibold"
                                        style={{ color: row.pnl >= 0 ? "#34d399" : "#f87171" }}>
                                      {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 text-zinc-500">{row.date}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {csvPreview.length > 8 && (
                              <p className="px-3 py-2 text-[10px] text-zinc-600 border-t border-zinc-800">
                                … and {csvPreview.length - 8} more
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {csvPreview && (
                        <button
                          onClick={handleCsvConfirm}
                          disabled={csvImporting || !csvLogin.trim() || !csvBroker.trim()}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                          {csvImporting ? (
                            <>
                              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              Importing…
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                              </svg>
                              Confirm Import — {csvPreview.length} trades
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* ── SECTION 2: CONNECTED ACCOUNTS ── */}
          {tradingAccounts.length > 0 && (
            <div className="mb-8">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4">Connected Accounts</p>

              <div className="space-y-3">
                {tradingAccounts.map((account) => {
                  const isMetaApi  = account.sync_source === "metaapi" || account.sync_method === "metaapi";
                  const title      = account.account_label ||
                    [account.account_login, account.account_server].filter(Boolean).join(" — ") ||
                    account.account_signature;
                  const isDeleting  = deletingAccount === account.account_signature;
                  const isSyncing   = syncingAccount  === account.account_signature;
                  const msSinceSync = isMetaApi && account.last_synced_at ? Date.now() - new Date(account.last_synced_at).getTime() : Infinity;
                  const isThrottled = msSinceSync < 86400000;
                  const nextSyncAt  = isThrottled ? new Date(new Date(account.last_synced_at!).getTime() + 86400000) : null;

                  return (
                    <div key={account.id}
                         className="bg-[var(--cj-surface)] border border-zinc-800 rounded-xl px-5 py-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            {isMetaApi && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                            )}
                            <p className="text-sm font-semibold text-zinc-200 truncate">{title}</p>
                            {isMetaApi ? (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                               bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
                                LIVE
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                               bg-zinc-700/40 text-zinc-500 border border-zinc-700 shrink-0">
                                CSV
                              </span>
                            )}
                            {account.account_type && account.account_type !== "real" && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                               bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 shrink-0">
                                {account.account_type}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-600">
                            {account.account_currency && `${account.account_currency} · `}
                            Last sync: {timeAgo(account.last_synced_at)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isMetaApi && account.metaapi_account_id && (
                            <div className="flex flex-col items-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleMetaApiSync(account.account_signature)}
                                disabled={isSyncing || isThrottled}
                                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                                           border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10
                                           hover:border-emerald-500/50 transition-all disabled:opacity-50">
                                {isSyncing
                                  ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                    </svg>
                                }
                                {isSyncing ? "Syncing…" : "Sync Now"}
                              </button>
                              {nextSyncAt && (
                                <p className="text-[9px] text-amber-400">
                                  Next sync {formatWAT(nextSyncAt)} WAT
                                </p>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteTradingAccount(account)}
                            disabled={isDeleting}
                            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                                       border border-rose-500/20 text-rose-400 hover:bg-rose-500/10
                                       hover:border-rose-500/40 transition-all disabled:opacity-50">
                            {isDeleting
                              ? <span className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
                                </svg>
                            }
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SECTION 3: REFERRALS ── */}
          <ReferralQuickView />

        </main>
      </div>
    </div>
  );
}
