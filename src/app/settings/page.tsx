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

  const isFree = !data || (data.subscription_status !== "pro" && data.subscription_status !== "starter");

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
              Upgrade to Starter or Pro to unlock your referral link and start earning $0.50–$1.00/month per referral.
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
              ${(data?.this_month_earnings ?? 0).toFixed(2)}
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

  const [loading,           setLoading]           = useState(true);
  const [sub,               setSub]               = useState<SubState>({ status: "free", end: null });
  const [tradingAccounts,   setTradingAccounts]   = useState<TradingAccount[]>([]);
  const [eaCleanupNotice,   setEaCleanupNotice]   = useState(false);
  const [editingAccountId,  setEditingAccountId]  = useState<string | null>(null);
  const [editLabel,         setEditLabel]         = useState("");

  // Delete modal state
  const [deleteTarget,  setDeleteTarget]  = useState<TradingAccount | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // Quick Connect state
  const [qcForm, setQcForm] = useState<QuickConnectForm>({
    server: "", login: "", password: "", platform: "MT5", label: "",
  });
  const [connecting,     setConnecting]     = useState(false);
  const [connectError,   setConnectError]   = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<{ account_signature: string; ea_warning: string | null } | null>(null);

  // CSV import state
  const [importAccountSig, setImportAccountSig] = useState("");
  const [importFile,        setImportFile]       = useState<File | null>(null);
  const [importing,         setImporting]        = useState(false);
  const [importResult,      setImportResult]     = useState<{ imported: number; skipped: number } | null>(null);
  const [importError,       setImportError]      = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

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
      if (accounts) {
        const all = accounts as TradingAccount[];
        const hasEa = all.some((a) => a.sync_method === "ea");
        if (hasEa) setEaCleanupNotice(true);
        setTradingAccounts(all.filter((a) => a.sync_method !== "ea"));
      }

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

  async function handleCsvImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) { setImportError("Select a CSV file first."); return; }
    if (!importAccountSig) { setImportError("Select an account to import into."); return; }
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("account_signature", importAccountSig);
    try {
      const res = await fetch("/api/accounts/import-history", { method: "POST", body: fd });
      const data = await res.json() as { success?: boolean; imported?: number; skipped?: number; error?: string };
      if (!res.ok) { setImportError(data.error ?? "Import failed"); }
      else { setImportResult({ imported: data.imported ?? 0, skipped: data.skipped ?? 0 }); setImportFile(null); }
    } catch { setImportError("Network error — check your connection."); }
    finally { setImporting(false); }
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
        // Auto-select new account for CSV import
        if (data.account_signature) setImportAccountSig(data.account_signature);
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteModal
          account={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                        text-sm font-semibold shadow-xl"
             style={{ background: "var(--cj-surface)", border: "1px solid rgba(245,197,24,0.3)", color: "var(--cj-gold)" }}>
          {toast}
        </div>
      )}

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── CONNECT ACCOUNT ───────────────────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Connect Account</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">

            {/* ── CARD 1: EA Sync ──────────────────────────────────────────── */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 flex flex-col opacity-70">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                  bg-zinc-700/50 border border-zinc-700 text-zinc-500">
                  Coming Soon
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 px-2 py-0.5
                                  rounded-full bg-zinc-800 border border-zinc-700">
                  Real-time
                </span>
              </div>
              <p className="text-sm font-semibold text-zinc-400 mb-1.5">EA Sync</p>
              <p className="text-xs text-zinc-600 leading-relaxed mb-4 flex-1">
                Install our Expert Advisor in MT5 for instant trade sync. Most accurate — trades appear the second you close them.
              </p>
              <div className="rounded-xl p-3 bg-zinc-800/60 border border-zinc-700 text-center">
                <p className="text-xs text-zinc-500 mb-1 font-semibold">EA auto-sync is temporarily unavailable</p>
                <p className="text-[11px] text-zinc-600">Use Quick Connect to sync your MT5 account.</p>
              </div>
            </div>

            {/* ── CARD 2: Quick Connect overview ───────────────────────────── */}
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                  bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  All plans
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                  bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  Easy Setup
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
                    Broker Server Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={qcForm.server}
                    onChange={(e) => setQcForm((f) => ({ ...f, server: e.target.value }))}
                    placeholder="Your broker's MT5 server name"
                    className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                               text-sm text-zinc-100 placeholder-zinc-600
                               focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-600">
                    e.g. ICMarkets-MT5, Deriv-Server, HFM-Live · Find in MT5 → File → Open an Account
                  </p>
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
                  Encrypted before storage. Investor passwords are read-only — we cannot place trades.
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
                      ⚠ MT4 support is limited. Quick Connect is available but may have reduced compatibility.
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
                    placeholder="e.g. My Live Account, Demo Practice"
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

        {/* ── IMPORT TRADE HISTORY (prominent, always visible when accounts exist or after QC) */}
        {(tradingAccounts.length > 0 || connectSuccess) && (
          <div className="bg-[var(--cj-surface)] border rounded-2xl p-6 mb-5"
               style={{ borderColor: connectSuccess ? "rgba(245,197,24,0.35)" : "var(--cj-border)",
                        boxShadow: connectSuccess ? "0 0 40px -10px rgba(245,197,24,0.12)" : "none" }}>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Import Trade History</p>
              {connectSuccess && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                 bg-[var(--cj-gold-glow)] border border-[var(--cj-gold)]/25 text-[var(--cj-gold)]">
                  Recommended
                </span>
              )}
            </div>

            {connectSuccess && (
              <div className="mb-5 p-4 rounded-xl"
                   style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.15)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--cj-gold)" }}>
                  Import your full MT5 trade history
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  To see your full performance analysis, import your MT5 trade history.
                  Follow the steps below to export and upload your CSV file.
                </p>
              </div>
            )}

            {/* Step-by-step instructions */}
            <div className="mb-5 space-y-2">
              {[
                { step: 1, text: "Open MetaTrader 5" },
                { step: 2, text: "Click the History tab at the bottom of the terminal" },
                { step: 3, text: "Right-click anywhere in the history list" },
                { step: 4, text: "Select \"Save as Report\"" },
                { step: 5, text: "Choose CSV format and save the file" },
                { step: 6, text: "Upload the CSV file below" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                        style={{ background: "rgba(245,197,24,0.12)", color: "var(--cj-gold)", border: "1px solid rgba(245,197,24,0.2)" }}>
                    {step}
                  </span>
                  <p className="text-xs text-zinc-400 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleCsvImport} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                  Account <span className="text-rose-500">*</span>
                </label>
                <select
                  value={importAccountSig}
                  onChange={(e) => setImportAccountSig(e.target.value)}
                  className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-2.5
                             text-sm text-zinc-100 focus:outline-none focus:border-[var(--cj-gold-muted)]
                             transition-colors cursor-pointer">
                  <option value="">Select account to import into…</option>
                  {tradingAccounts.map((a) => (
                    <option key={a.id} value={a.account_signature}>
                      {a.account_label || a.broker_name || a.account_login || a.account_signature.slice(0, 12)}
                      {a.account_type === "demo" ? " (Demo)" : " (Live)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                  MT5 History CSV <span className="text-rose-500">*</span>
                </label>
                <div className={`relative flex items-center justify-center rounded-xl border-2 border-dashed
                                 px-4 py-8 transition-colors cursor-pointer
                                 ${importFile
                                   ? "border-emerald-500/40 bg-emerald-500/5"
                                   : "hover:border-[var(--cj-gold-muted)]"}`}
                     style={!importFile ? { borderColor: "rgba(245,197,24,0.25)", background: "rgba(245,197,24,0.03)" } : undefined}>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportError(null); setImportResult(null); }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {importFile ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-emerald-400">{importFile.name}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{(importFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                           style={{ background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.2)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-zinc-300">Drop your MT5 history CSV here</p>
                      <p className="text-xs text-zinc-600 mt-1">or click to browse files</p>
                    </div>
                  )}
                </div>
              </div>

              {importResult && (
                <div className="rounded-xl px-4 py-3 bg-emerald-500/8 border border-emerald-500/20">
                  <p className="text-sm text-emerald-400 font-semibold">
                    Import complete: {importResult.imported} trade{importResult.imported !== 1 ? "s" : ""} imported!
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-xs text-zinc-500 mt-0.5">{importResult.skipped} rows skipped (deposits, withdrawals, etc.)</p>
                  )}
                </div>
              )}

              {importError && (
                <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
                  <p className="text-xs text-rose-400">{importError}</p>
                </div>
              )}

              {importing && (
                <div className="rounded-xl px-4 py-3 bg-[var(--cj-raised)] border border-zinc-800">
                  <p className="text-xs text-zinc-400 flex items-center gap-2">
                    <span className="w-3 h-3 border border-[var(--cj-gold)] border-t-transparent rounded-full animate-spin shrink-0" />
                    Processing trades…
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={importing || !importFile || !importAccountSig}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                {importing ? "Importing…" : "Import Trade History"}
              </button>
            </form>
          </div>
        )}

        {/* ── CONNECTED ACCOUNTS ────────────────────────────────────────────── */}
        {eaCleanupNotice && (
          <div className="mb-5 px-4 py-3 rounded-xl border text-xs"
               style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.2)", color: "#C4B89A" }}>
            <span className="font-semibold" style={{ color: "var(--cj-gold)" }}>EA-connected accounts have been removed.</span>
            {" "}Please reconnect using Quick Connect above.
          </div>
        )}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
              Connected Accounts
            </p>
            <span className="text-[11px] text-zinc-500">
              {tradingAccounts.length} of {sub.status === "pro" ? 10 : sub.status === "starter" ? 3 : 1}
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
                Use Quick Connect above to connect your MT5 account.
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
                          {isQC ? "Quick Connect" : "EA Sync"}
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
                        {acct.account_type !== "demo" && acct.verification_status !== "verified_ea" && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full
                            bg-zinc-700/50 border border-zinc-700 text-zinc-500">
                            Unverified
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
                );
              })}
            </div>
          )}

          {(() => {
            const limit = sub.status === "pro" ? 10 : sub.status === "starter" ? 3 : 1;
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
                    {tradingAccounts.length}/{limit} accounts · use Quick Connect above to add more.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── REFERRALS QUICK-VIEW ──────────────────────────────────────────── */}
        <ReferralQuickView />

        {/* ── EA SYNC — COMING SOON ─────────────────────────────────────────── */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 opacity-60 select-none pointer-events-none">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                             bg-zinc-700/50 border border-zinc-700 text-zinc-500">Coming Soon</span>
          </div>
          <p className="text-sm font-semibold text-zinc-500 mb-2">MT5 EA Sync — Coming Soon</p>
          <p className="text-xs text-zinc-600 leading-relaxed">
            EA auto-sync is temporarily unavailable.
            Use Quick Connect to connect your MT5 account instead.
          </p>
        </div>

      </main>
      </div>
    </div>
  );
}
