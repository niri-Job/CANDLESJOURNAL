"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";
import { parseTradeFile, type PreviewRow } from "@/lib/parseTradeFile";

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
  account_login: string | null;
  account_server: string | null;
  account_currency: string | null;
  account_type: string | null;
  sync_method: string | null;
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
            <p className="font-sans font-bold text-[var(--cj-gold)] text-sm">
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
  const isDeveloper = user?.email === process.env.NEXT_PUBLIC_DEVELOPER_EMAIL;

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
  const [mt5Platform,     setMt5Platform]     = useState<"mt5" | "mt4">("mt5");
  const [mt5ConnectError, setMt5ConnectError] = useState<string | null>(null);
  const [mt5Connecting,   setMt5Connecting]   = useState(false);
  const [syncingAccount,  setSyncingAccount]  = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [showPassword,    setShowPassword]    = useState(false);
  const autoSynced = useRef(false);

  // EA Sync state
  const [eaTokens,      setEaTokens]      = useState<EaTokenRow[]>([]);
  const [eaAccountNum,  setEaAccountNum]  = useState("");
  const [eaBrokerSrv,   setEaBrokerSrv]   = useState("");
  const [generating,    setGenerating]    = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedToken,   setCopiedToken]   = useState<string | null>(null);

  // CSV Import state — inline form
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
          .select("id, account_signature, account_label, account_login, account_server, account_currency, account_type, sync_method, is_verified, verification_status, current_balance, last_synced_at, metaapi_account_id")
          .eq("user_id", user.id)
          .order("last_synced_at", { ascending: false, nullsFirst: false }),
      ]);

      const subData = subRes.data as { subscription_status: string | null; subscription_end: string | null } | null;
      setSub({ status: subData?.subscription_status ?? "free", end: subData?.subscription_end ?? null });
      // isPro is derived from sub state after this line via the computed value below

      if (connectionsRes.data) setMt5Connections(connectionsRes.data as Mt5Connection[]);
      if (tokenRes.data)       setEaTokens(tokenRes.data as EaTokenRow[]);
      if (accountsRes.error) {
        console.error("[settings] tradingAccounts query error:", JSON.stringify(accountsRes.error));
      }
      if (accountsRes.data)    setTradingAccounts(accountsRes.data as TradingAccountRow[]);

      setLoading(false);
    }
    init();
  }, []);

  // Fire one background sync per page load for every connected MetaAPI account
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
    const { data, error } = await supabase
      .from("trading_accounts")
      .select("id, account_signature, account_label, account_login, account_server, account_currency, account_type, sync_method, is_verified, verification_status, current_balance, last_synced_at, metaapi_account_id")
      .eq("user_id", user.id)
      .order("last_synced_at", { ascending: false, nullsFirst: false });
    if (error) console.error("[settings] refreshTradingAccounts error:", JSON.stringify(error));
    if (data)  setTradingAccounts(data as TradingAccountRow[]);
  }

  const isPro = sub.status === "pro" && !!sub.end && new Date(sub.end) > new Date();

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    if (!mt5Login.trim() || !mt5Password.trim() || !mt5Server.trim()) {
      setMt5ConnectError("All fields are required.");
      return;
    }
    setMt5Connecting(true);
    setMt5ConnectError(null);
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
      const json = await res.json() as { success?: boolean; account_label?: string; error?: string };
      if (!res.ok) {
        setMt5ConnectError(json.error ?? "Connection failed. Please try again.");
      } else {
        setMt5Login(""); setMt5Password(""); setMt5Server("");
        showToast(`Connected: ${json.account_label ?? mt5Login.trim()}`);
        await refreshTradingAccounts();
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
      const json = await res.json() as { success?: boolean; inserted?: number; duplicates?: number; error?: string };
      if (!res.ok) {
        showToast(json.error ?? "Sync failed.");
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

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("=== SETTINGS CSV HANDLER FIRED ===");
    const file = e.target.files?.[0];
    if (!file) return;
    console.log("File:", file.name, file.size);
    if (!csvLogin.trim() || !csvBroker.trim()) {
      setCsvTouched({ login: true, broker: true });
      setCsvError("Fill in your MT5 Login Number and Broker first.");
      return;
    }
    setCsvFileName(file.name);
    setCsvError(null);
    setCsvPreview(null);
    const result = await parseTradeFile(file);
    console.log("parseTradeFile result:", result);
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
        setCsvError(json.error === "FREE_LIMIT_REACHED"
          ? "Upgrade to Pro to import more trades. Your free trial import has been used."
          : json.error ?? "Import failed. Please try again.");
      } else {
        const label = json.account_label ?? `${csvLogin.trim()} — ${csvBroker.trim()}`;
        const inserted = json.inserted ?? 0;
        const duplicates = json.duplicates ?? 0;
        setCsvSuccess({ inserted, label });
        setCsvResult({ inserted, duplicates });
        showToast(`${inserted} trade${inserted !== 1 ? "s" : ""} imported for ${label}.`);
        // Reset form fields
        setCsvLogin(""); setCsvBroker(""); setCsvPreview(null);
        setCsvRaw(""); setCsvFileName(""); setCsvTouched({ login: false, broker: false });
        // Immediately refresh Synced Accounts without page reload
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
          <div className={`grid grid-cols-1 gap-3 ${isDeveloper ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
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
                {isPro ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                   bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    Available
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--cj-gold-glow)", border: "1px solid var(--cj-card-border)", color: "var(--cj-gold-muted)" }}>
                    Pro
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {isPro ? "Connect your MT5 account directly using credentials." : "Upgrade to Pro to connect MT5 directly."}
              </p>
              <div className="mt-auto">
                {isPro ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Available
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--cj-gold-muted)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cj-gold-muted)" }} />Pro only
                  </span>
                )}
              </div>
            </div>

            {/* EA Sync card — developer only */}
            {isDeveloper && (
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
            )}

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
                        <p className="text-xs text-zinc-500 font-sans">{account.account_signature}</p>
                        <p className="text-[11px] text-zinc-600 mt-1">
                          {account.sync_method ? `${account.sync_method.toUpperCase()} sync` : "Journal account"}
                          {" "}· Last sync: {timeAgo(account.last_synced_at)}
                        </p>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                          {account.sync_method === "metaapi" && account.metaapi_account_id && (
                            <button
                              type="button"
                              onClick={() => handleMetaApiSync(account.account_signature)}
                              disabled={syncingAccount === account.account_signature}
                              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                                         border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10
                                         hover:border-emerald-500/50 transition-all disabled:opacity-50">
                              {syncingAccount === account.account_signature ? (
                                <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                </svg>
                              )}
                              Sync Now
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteTradingAccount(account)}
                            disabled={isDeleting}
                            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
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
                        {account.sync_method === "metaapi" && account.metaapi_account_id && (
                          <span className="text-[10px] text-zinc-600">
                            Last synced: {timeAgo(account.last_synced_at)}
                          </span>
                        )}
                      </div>
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
                          <span className="text-zinc-300 font-sans">
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

        {/* Notice banner for users who had EA tokens but are not the developer */}
        {!isDeveloper && eaTokens.length > 0 && (
          <div className="mb-5 flex items-start gap-3 px-4 py-4 rounded-xl"
               style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.2)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: "#C4B89A" }}>
              MT5 auto-sync via EA is being replaced with a simpler CSV import method.{" "}
              <span className="font-semibold text-zinc-200">Your existing trades are safe.</span>{" "}
              To add new trades, use the CSV import on your dashboard.
            </p>
          </div>
        )}

        {/* -- MT5 Direct Connect: visible to Pro users and developer -- */}
        {(isPro || isDeveloper) && (
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">MT5 Direct Connect</p>

          {/* Existing MetaAPI-connected accounts — persistent after connect and on every reload */}
          {tradingAccounts.filter((a) => a.sync_method === "metaapi" && a.metaapi_account_id).map((account) => {
            const label = account.account_label ||
              [account.account_login, account.account_server].filter(Boolean).join(" — ") ||
              account.account_signature;
            const isSyncing = syncingAccount === account.account_signature;
            return (
              <div key={account.id}
                   className="bg-[var(--cj-surface)] border border-emerald-500/20 rounded-2xl p-4 mb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <p className="text-sm font-semibold text-zinc-100">{label}</p>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      MetaAPI connected · Last synced: {timeAgo(account.last_synced_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMetaApiSync(account.account_signature)}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg
                               border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10
                               hover:border-emerald-500/50 transition-all disabled:opacity-50">
                    {isSyncing ? (
                      <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                      </svg>
                    )}
                    {isSyncing ? "Syncing…" : "Sync Now"}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Connect form */}
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-zinc-100">Connect MT5 Account</p>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                               bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Live
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-5">
              Enter your MT5 credentials. NIRI connects via MetaAPI and fetches your trade history automatically.
              Your password is encrypted in transit and never stored by NIRI.
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
                    onChange={(e) => { setMt5Login(e.target.value); setMt5ConnectError(null); }}
                    disabled={mt5Connecting}
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
                    onChange={(e) => { setMt5Server(e.target.value); setMt5ConnectError(null); }}
                    disabled={mt5Connecting}
                    placeholder="e.g. Exness-MT5Trial9"
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
                    onChange={(e) => { setMt5Password(e.target.value); setMt5ConnectError(null); }}
                    disabled={mt5Connecting}
                    placeholder="Your MT5 investor or master password"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600 pr-10
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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
                <p className="mt-1.5 text-[11px] text-zinc-600">Encrypted in transit — never stored by NIRI</p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                  Platform
                </label>
                <div className="flex gap-3">
                  {(["mt5", "mt4"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMt5Platform(p)}
                      disabled={mt5Connecting}
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

              <button
                type="submit"
                disabled={mt5Connecting}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                {mt5Connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin" />
                    Connecting… (may take up to 60s)
                  </span>
                ) : "Connect MT5 Account"}
              </button>
            </form>
          </div>
        </div>
        )}

        {/* -- EA + legacy MT connections: developer only -- */}
        {isDeveloper && (
        <>

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
                                   text-xs font-sans text-zinc-400 focus:outline-none select-all"
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

        </> /* end isDeveloper */
        )}

        {/* -- CSV IMPORT (inline form) -- */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">CSV Import</p>
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">

            {/* ── Success state ── */}
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
                    {csvSuccess.inserted} trade{csvSuccess.inserted !== 1 ? "s" : ""} imported successfully
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
                  className="text-xs font-semibold px-4 py-2 rounded-xl border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
                  Import another account
                </button>
              </div>
            ) : (
              <>
                {/* How to export hint */}
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5 text-xs leading-relaxed"
                     style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", color: "#86efac" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                       strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>
                    In MT5: <strong>View → Terminal → Account History</strong> → right-click → <strong>Save as Report</strong>.
                    Supports CSV, Excel (.xlsx), and HTML. Free accounts: 1 import. Pro: unlimited.
                  </span>
                </div>

                {/* Account fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                           style={{ color: "var(--cj-gold-muted)" }}>
                      MT5 Login Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
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
                      <p className="text-[10px] text-zinc-600 mt-1">
                        Account: {csvLogin} — {csvBroker}
                      </p>
                    )}
                  </div>
                </div>

                {/* File upload — plain visible input, no wrappers */}
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

                {/* Error */}
                {csvError && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-xs"
                       style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                    {csvError}
                    {csvError.includes("Upgrade to Pro") && (
                      <a href="/pricing" className="ml-2 font-bold underline" style={{ color: "#F5C518" }}>Upgrade →</a>
                    )}
                  </div>
                )}

                {/* Preview table */}
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

                {/* Confirm button — shown once file is parsed */}
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

        {/* -- REFERRALS QUICK -- */}
        <ReferralQuickView />

      </main>
      </div>
    </div>
  );
}
