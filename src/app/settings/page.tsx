"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";

interface SubState { status: string; end: string | null; }

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
  verification_status: string | null;
  is_verified: boolean;
}

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

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteModal({
  account,
  onConfirm,
  onCancel,
  deleting,
}: {
  account: TradingAccount;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md bg-[var(--cj-surface)] border border-zinc-700 rounded-2xl p-7 shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mb-5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </div>
        <h3 className="text-base font-bold text-zinc-100 mb-2">Delete this account?</h3>
        <p className="text-sm text-zinc-400 leading-relaxed mb-1">
          This will permanently remove{" "}
          <span className="font-semibold text-zinc-200">
            {account.account_label || account.broker_name || account.account_login || "this account"}
          </span>{" "}
          and <span className="font-semibold text-rose-400">ALL its trade history</span> from NIRI.
        </p>
        <p className="text-xs text-zinc-600 mb-6">This action cannot be undone.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-zinc-700
                       text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors
                       disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all
                       disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff" }}>
            {deleting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting…
              </span>
            ) : "Delete Account"}
          </button>
        </div>
      </div>
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

  const [loading,          setLoading]          = useState(true);
  const [sub,              setSub]              = useState<SubState>({ status: "free", end: null });
  const [tradingAccounts,  setTradingAccounts]  = useState<TradingAccount[]>([]);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editLabel,        setEditLabel]        = useState("");

  // MT5 Direct Connect state
  const [mt5Connections,   setMt5Connections]   = useState<Mt5Connection[]>([]);
  const [mt5Login,         setMt5Login]         = useState("");
  const [mt5Password,      setMt5Password]      = useState("");
  const [mt5Server,        setMt5Server]        = useState("");
  const [mt5Connecting,    setMt5Connecting]    = useState(false);
  const [mt5ConnectError,  setMt5ConnectError]  = useState<string | null>(null);
  const [disconnectingId,  setDisconnectingId]  = useState<string | null>(null);
  const [showPassword,     setShowPassword]     = useState(false);

  // CSV state
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult,    setCsvResult]    = useState<{ inserted: number; duplicates: number } | null>(null);
  const [csvError,     setCsvError]     = useState<string | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<TradingAccount | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const [subRes, accountsRes, connectionsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_status, subscription_end")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("trading_accounts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("mt5_connections")
          .select("*")
          .eq("user_id", user.id)
          .neq("status", "disconnected")
          .order("created_at", { ascending: false }),
      ]);

      const subData = subRes.data as { subscription_status: string | null; subscription_end: string | null } | null;
      setSub({ status: subData?.subscription_status ?? "free", end: subData?.subscription_end ?? null });

      if (accountsRes.data) setTradingAccounts(accountsRes.data as TradingAccount[]);
      if (connectionsRes.data) setMt5Connections(connectionsRes.data as Mt5Connection[]);

      setLoading(false);
    }
    init();
  }, []);

  async function refreshAccounts() {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("trading_accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setTradingAccounts(data as TradingAccount[]);
  }

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(deleteTarget.account_signature)}`, {
        method: "DELETE",
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Failed to delete account");
      } else {
        setTradingAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
        showToast("Account deleted successfully");
      }
    } catch {
      showToast("Network error — try again.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    if (!mt5Login.trim())    { setMt5ConnectError("Enter your MT5 account number."); return; }
    if (!mt5Password.trim()) { setMt5ConnectError("Enter your MT5 password."); return; }
    if (!mt5Server.trim())   { setMt5ConnectError("Enter your broker server name."); return; }
    setMt5Connecting(true);
    setMt5ConnectError(null);
    try {
      const res = await fetch("/api/mt5/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login:    mt5Login.trim(),
          password: mt5Password,
          server:   mt5Server.trim(),
        }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) {
        setMt5ConnectError(json.error ?? "Connection failed.");
      } else {
        setMt5Login("");
        setMt5Password("");
        setMt5Server("");
        await refreshConnections();
        await refreshAccounts();
        showToast("MT5 account connected — syncing trades now.");
      }
    } catch {
      setMt5ConnectError("Network error — check your connection.");
    } finally {
      setMt5Connecting(false);
    }
  }

  async function handleMt5Disconnect(conn: Mt5Connection) {
    setDisconnectingId(conn.id);
    try {
      const res = await fetch("/api/mt5/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: conn.mt5_login }),
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

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    setCsvError(null);
    try {
      const text = await file.text();
      const res  = await fetch("/api/trades/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_content: text }),
      });
      const json = await res.json() as { success?: boolean; inserted?: number; duplicates?: number; total?: number; error?: string };
      if (!res.ok) {
        setCsvError(json.error ?? "Import failed.");
      } else {
        setCsvResult({ inserted: json.inserted ?? 0, duplicates: json.duplicates ?? 0 });
        await refreshAccounts();
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

      {deleteTarget && (
        <DeleteModal
          account={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                        text-sm font-semibold shadow-xl"
             style={{ background: "var(--cj-surface)", border: "1px solid rgba(245,197,24,0.3)", color: "var(--cj-gold)" }}>
          {toast}
        </div>
      )}

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── SYNC METHOD OVERVIEW ──────────────────────────────────────────── */}
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Sync Method</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Credentials-based sync via our secure VPS — no EA file needed.
              </p>
              <div className="mt-auto">
                {mt5Connections.length > 0
                  ? <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Connected</span>
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
              <p className="text-[11px] text-zinc-500 leading-relaxed">Manual import from any broker — MT5 history CSV.</p>
              <div className="mt-auto">
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Always available</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── MT5 DIRECT CONNECT ────────────────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">MT5 Direct Connect</p>

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

          {/* Security notice */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-4"
               style={{ background: "rgba(139,53,255,0.07)", border: "1px solid rgba(139,53,255,0.2)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p className="text-xs text-violet-300 leading-relaxed">
              <span className="font-semibold">Your password is never stored on our servers.</span>{" "}
              It is encrypted with a key that only our VPS holds, and only used to connect to your broker.
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
                {mt5Connections.length > 0 ? "Add Another MT5 Account" : "Connect MT5 Account"}
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                               bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Real-time
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-5">
              Enter your MT5 credentials. Your trades sync automatically every minute.
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
                    value={mt5Server}
                    onChange={(e) => setMt5Server(e.target.value)}
                    placeholder="e.g. ICMarkets-MT5"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
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
                    placeholder="Your MT5 investor or master password"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600 pr-10
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
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
                <p className="mt-1.5 text-[11px] text-zinc-600">Encrypted on connection — never stored in plain text</p>
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
                style={{ background: "linear-gradient(135deg,#F5C518,#8B35FF)", color: "#fff" }}>
                {mt5Connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Connecting…
                  </span>
                ) : mt5Connections.length > 0 ? "Add Account →" : "Connect Account →"}
              </button>
            </form>
          </div>
        </div>

        {/* ── CSV IMPORT ────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">CSV Import</p>
          <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
            <p className="text-sm font-semibold text-zinc-100 mb-1">Import from MT5 History CSV</p>
            <p className="text-xs text-zinc-500 leading-relaxed mb-4">
              Export your trade history from MetaTrader 5 as CSV and import it here. Works with any broker.
            </p>

            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5"
                 style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5"
                   strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div className="text-xs text-emerald-300 leading-relaxed space-y-1">
                <p>In MT5: <strong>View → Terminal → Account History</strong> → right-click → <strong>Save as Report</strong> → choose CSV.</p>
                <p className="text-zinc-500">Columns expected: ticket, open time, type, size, symbol, price, S/L, T/P, close time, close price, commission, swap, profit.</p>
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
                  Importing…
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

        {/* ── CONNECTED ACCOUNTS ────────────────────────────────────────────── */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
              Connected Accounts
            </p>
            <span className="text-[11px] text-zinc-500">
              {tradingAccounts.length} of {sub.status === "pro" ? 10 : 1}
              <span className="ml-1 text-zinc-600 capitalize">({sub.status})</span>
            </span>
          </div>

          {tradingAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--cj-raised)] border border-zinc-800
                              flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <p className="text-sm text-zinc-500 mb-1">No accounts connected yet</p>
              <p className="text-xs text-zinc-600">
                Connect your MT5 account above to start syncing trades.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tradingAccounts.map((acct) => (
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
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full
                                       bg-violet-500/15 border border-violet-500/30 text-violet-400">
                        Direct Sync
                      </span>
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

                  {/* Status row */}
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-zinc-800">
                    <SyncStatusDot status={acct.sync_status} />
                    <span className="text-[11px] text-zinc-600">
                      Last sync: {timeAgo(acct.last_synced_at)}
                    </span>
                  </div>

                  {/* Error message */}
                  {acct.sync_status === "failed" && acct.sync_error && (
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
                  </div>

                  {/* Actions */}
                  <div className="border-t border-zinc-800 pt-3 flex items-center gap-3">
                    <button
                      onClick={() => setDeleteTarget(acct)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                                 border border-rose-500/20 text-rose-500 hover:bg-rose-500/10
                                 hover:border-rose-500/40 transition-all">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                      Delete Account
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(() => {
            const limit = sub.status === "pro" ? 10 : 1;
            const atLimit = tradingAccounts.length >= limit;
            return (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                {atLimit ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-600">
                      Limit reached ({limit}/{limit}). Upgrade to connect more accounts.
                    </p>
                    <Link href="/pricing"
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
                      style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                      Upgrade
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600">
                    {tradingAccounts.length}/{limit} accounts connected.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── REFERRALS QUICK-VIEW ──────────────────────────────────────────── */}
        <ReferralQuickView />

      </main>
      </div>
    </div>
  );
}
