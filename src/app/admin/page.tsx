"use client";

import { useState, useEffect, useCallback } from "react";

const THEMES = [
  { key: "dark",     icon: "🌑", label: "Default" },
  { key: "midnight", icon: "🌙", label: "Dark"    },
  { key: "light",    icon: "☀️",  label: "Light"   },
] as const;

type Theme = (typeof THEMES)[number]["key"];

function readTheme(): Theme {
  if (typeof localStorage === "undefined") return "dark";
  return (localStorage.getItem("cj_theme") as Theme) ?? "dark";
}

function writeTheme(t: Theme) {
  localStorage.setItem("cj_theme", t);
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

interface Stats {
  total_users: number;
  pro_count: number;
  active_trials: number;
  monthly_revenue: number;
  recent_signups: number;
}

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  subscription_status: string;
  is_pro: boolean;
  trial_active: boolean;
  trial_ends_at: string | null;
  ai_credits_used: number;
  ai_credits_limit: number;
}

interface Payout {
  id: string;
  referrer_email: string;
  amount_ngn: number;
  status: string;
  payout_method: string | null;
  account_details: string | null;
  requested_at: string;
  paid_at: string | null;
  in_payout_window: boolean;
}

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_active: boolean;
}

interface AiUsageData {
  anthropic_key_present: boolean;
  total_analyses: number;
  tokens: { input: number; output: number; source: "anthropic_api" | "estimated" };
  cost_usd: number;
  cost_source: "anthropic_api" | "estimated";
  per_user: { user_id: string; email: string; analyses: number; plan: string }[];
  month: string;
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default function AdminPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [view, setView] = useState<"loading" | "login" | "dashboard">("loading");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [logging, setLogging] = useState(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inPayoutWindow, setInPayoutWindow] = useState(false);
  const [notifications,      setNotifications]      = useState<AdminNotification[]>([]);
  const [newNotiTitle,       setNewNotiTitle]       = useState("");
  const [newNotiMessage,     setNewNotiMessage]     = useState("");
  const [notiSubmitting,     setNotiSubmitting]     = useState(false);
  const [notiError,          setNotiError]          = useState("");

  const [tgSending,          setTgSending]          = useState(false);
  const [tgResult,           setTgResult]           = useState<{ ok: boolean; text: string } | null>(null);
  const [aiUsage,            setAiUsage]            = useState<AiUsageData | null>(null);

  const [announceSubject,    setAnnounceSubject]    = useState("");
  const [announceMessage,    setAnnounceMessage]    = useState("");
  const [announceRecipients, setAnnounceRecipients] = useState<"all" | "pro" | "specific">("all");
  const [announceSpecific,   setAnnounceSpecific]   = useState("");
  const [announceSending,    setAnnounceSending]    = useState(false);
  const [announceResult,     setAnnounceResult]     = useState<{ ok: boolean; text: string } | null>(null);

  // Restore theme from localStorage on mount
  useEffect(() => {
    const saved = readTheme();
    setTheme(saved);
    applyTheme(saved);
  }, []);

  function selectTheme(t: Theme) {
    setTheme(t);
    writeTheme(t);
    applyTheme(t);
  }

  const loadDashboard = useCallback(async () => {
    const [statsRes, usersRes, payoutsRes, aiUsageRes] = await Promise.all([
      fetch("/api/admin/stats"),
      fetch("/api/admin/users"),
      fetch("/api/admin/payouts"),
      fetch("/api/admin/ai-usage"),
    ]);

    if (statsRes.status === 401) {
      setView("login");
      return;
    }

    if (statsRes.ok) setStats((await statsRes.json()) as Stats);
    if (usersRes.ok) setUsers(((await usersRes.json()) as { users: AdminUser[] }).users ?? []);
    if (aiUsageRes.ok) setAiUsage((await aiUsageRes.json()) as AiUsageData);
    if (payoutsRes.ok) {
      const d = (await payoutsRes.json()) as { payouts: Payout[]; in_payout_window: boolean };
      setPayouts(d.payouts ?? []);
      setInPayoutWindow(d.in_payout_window ?? false);
    }
    setView("dashboard");

    // Load notifications separately (non-blocking)
    const notiRes = await fetch("/api/admin/notifications");
    if (notiRes.ok) {
      const d = (await notiRes.json()) as { notifications: AdminNotification[] };
      setNotifications(d.notifications ?? []);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLogging(false);
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setLoginError(d.error ?? "Login failed");
      return;
    }
    setPassword("");
    loadDashboard();
  }

  async function handleLogout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setView("login");
    setStats(null);
    setUsers([]);
    setPayouts([]);
  }

  async function handleSearch(q: string) {
    setSearch(q);
    setLoadingUsers(true);
    const r = await fetch(`/api/admin/users${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    if (r.ok) setUsers(((await r.json()) as { users: AdminUser[] }).users ?? []);
    setLoadingUsers(false);
  }

  async function userAction(action: string, userId: string) {
    setActionLoading(`${action}-${userId}`);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    setActionLoading(null);
    if (res.ok) {
      const r = await fetch(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      if (r.ok) setUsers(((await r.json()) as { users: AdminUser[] }).users ?? []);
    }
  }

  async function payoutAction(action: string, payoutId: string) {
    setActionLoading(`${action}-${payoutId}`);
    const res = await fetch("/api/admin/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payoutId }),
    });
    setActionLoading(null);
    if (res.ok) {
      const r = await fetch("/api/admin/payouts");
      if (r.ok) {
        const d = (await r.json()) as { payouts: Payout[]; in_payout_window: boolean };
        setPayouts(d.payouts ?? []);
        setInPayoutWindow(d.in_payout_window ?? false);
      }
    }
  }

  async function handleCreateNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!newNotiTitle.trim() || !newNotiMessage.trim()) return;
    setNotiSubmitting(true);
    setNotiError("");
    const res = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newNotiTitle.trim(), message: newNotiMessage.trim() }),
    });
    setNotiSubmitting(false);
    if (!res.ok) {
      const d = (await res.json()) as { error?: string };
      setNotiError(d.error ?? "Failed to create notification");
      return;
    }
    setNewNotiTitle("");
    setNewNotiMessage("");
    const r = await fetch("/api/admin/notifications");
    if (r.ok) {
      const d = (await r.json()) as { notifications: AdminNotification[] };
      setNotifications(d.notifications ?? []);
    }
  }

  async function deleteNotification(id: string) {
    await fetch(`/api/admin/notifications?id=${id}`, { method: "DELETE" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleSendDailySetup() {
    setTgSending(true);
    setTgResult(null);
    const res = await fetch("/api/telegram/daily-setup", { method: "POST" });
    setTgSending(false);
    if (res.ok) {
      const d = (await res.json()) as { pairs?: string[] };
      setTgResult({ ok: true, text: `Sent to @niritoday covering ${(d.pairs ?? []).join(", ")}.` });
    } else {
      const d = (await res.json()) as { error?: string };
      setTgResult({ ok: false, text: d.error ?? "Failed to send" });
    }
  }

  async function handleSendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!announceSubject.trim() || !announceMessage.trim()) return;
    setAnnounceSending(true);
    setAnnounceResult(null);
    const res = await fetch("/api/admin/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: announceSubject.trim(),
        message: announceMessage.trim(),
        recipients: announceRecipients,
        specific_email: announceRecipients === "specific" ? announceSpecific.trim() : undefined,
      }),
    });
    setAnnounceSending(false);
    if (res.ok) {
      const d = (await res.json()) as { sent: number; total: number; email?: string; errors?: string[] };
      const errNote = d.errors?.length ? ` (${d.errors.length} failed)` : "";
      const text = d.email
        ? `Email sent to ${d.email}.`
        : `Sent to ${d.sent} of ${d.total} recipients${errNote}.`;
      setAnnounceResult({ ok: true, text });
      setAnnounceSubject("");
      setAnnounceMessage("");
      if (announceRecipients === "specific") setAnnounceSpecific("");
    } else {
      const d = (await res.json()) as { error?: string };
      setAnnounceResult({ ok: false, text: d.error ?? "Failed to send" });
    }
  }

  const ThemePicker = () => (
    <div className="flex items-center gap-1.5">
      {THEMES.map(({ key, icon, label }) => (
        <button
          key={key}
          title={label}
          onClick={() => selectTheme(key)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm
                      transition-all border
                      ${theme === key
                        ? "border-[var(--cj-gold)] bg-[var(--cj-gold-glow)] scale-110"
                        : "border-[var(--cj-border)] hover:border-[var(--cj-border-light)] bg-[var(--cj-raised)] hover:scale-105"
                      }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );

  if (view === "loading") {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center text-[var(--cj-text-muted)] text-sm">
        Loading…
      </div>
    );
  }

  if (view === "login") {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex justify-center">
            <ThemePicker />
          </div>
          <form
            onSubmit={handleLogin}
            className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-8 space-y-4"
          >
            <h1 className="text-[var(--cj-text)] text-xl font-semibold">Niri Admin</h1>
            {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                         text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] text-sm outline-none
                         focus:border-[var(--cj-gold)] focus:shadow-[0_0_0_2px_var(--cj-gold-glow)]
                         transition-[border-color,box-shadow]"
              autoFocus
            />
            <button
              type="submit"
              disabled={logging || !password}
              className="btn-gold w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
            >
              {logging ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-[var(--cj-text)]">
      {/* Header */}
      <div className="border-b border-[var(--cj-border)] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Niri Admin</h1>
        <div className="flex items-center gap-4">
          <ThemePicker />
          <button
            onClick={handleLogout}
            className="text-sm text-[var(--cj-text-muted)] hover:text-[var(--cj-text)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* Stats */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Overview
          </h2>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: "Total Users",     value: stats.total_users },
                { label: "Pro",             value: stats.pro_count },
                { label: "Active Trials",   value: stats.active_trials },
                { label: "7-day Signups",   value: stats.recent_signups },
                { label: "Monthly Revenue", value: `₦${stats.monthly_revenue.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4">
                  <div className="text-[var(--cj-text-muted)] text-xs mb-1">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[var(--cj-text-muted)] text-sm">No stats available</div>
          )}
        </section>

        {/* Users */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider">
              Users ({users.length})
            </h2>
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by email…"
              className="bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-1.5
                         text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none
                         focus:border-[var(--cj-gold)] transition-[border-color] w-60"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--cj-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--cj-border)] text-[var(--cj-text-muted)]">
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Trial</th>
                  <th className="text-left px-4 py-3 font-medium">Signed up</th>
                  <th className="text-left px-4 py-3 font-medium">Last active</th>
                  <th className="text-left px-4 py-3 font-medium">AI credits</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--cj-text-muted)]">Loading…</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--cj-text-muted)]">No users found</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--cj-border)]/50 hover:bg-[var(--cj-raised)]">
                      <td className="px-4 py-3 text-[var(--cj-text)] font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            u.is_pro
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-[var(--cj-raised)] text-[var(--cj-text-muted)]"
                          }`}
                        >
                          {u.is_pro ? "Pro" : u.subscription_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {u.trial_active ? (
                          <span className="text-amber-400">Until {fmt(u.trial_ends_at)}</span>
                        ) : (
                          <span className="text-[var(--cj-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs">{fmt(u.created_at)}</td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs">{fmt(u.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs">
                        {u.ai_credits_used}/{u.ai_credits_limit}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => userAction("set_pro", u.id)}
                            disabled={actionLoading === `set_pro-${u.id}`}
                            className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40
                                       text-emerald-400 rounded transition-colors disabled:opacity-50"
                          >
                            Set Pro
                          </button>
                          <button
                            onClick={() => userAction("extend_trial", u.id)}
                            disabled={actionLoading === `extend_trial-${u.id}`}
                            className="text-xs px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40
                                       text-amber-400 rounded transition-colors disabled:opacity-50"
                          >
                            +3d Trial
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Payouts */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Payout Requests
            {inPayoutWindow && (
              <span className="ml-2 text-amber-400 normal-case font-normal text-xs">
                — payout window active (days 28–31)
              </span>
            )}
          </h2>

          <div className="overflow-x-auto rounded-xl border border-[var(--cj-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--cj-border)] text-[var(--cj-text-muted)]">
                  <th className="text-left px-4 py-3 font-medium">Referrer</th>
                  <th className="text-left px-4 py-3 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Method</th>
                  <th className="text-left px-4 py-3 font-medium">Requested</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--cj-text-muted)]">
                      No payout requests
                    </td>
                  </tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--cj-border)]/50 hover:bg-[var(--cj-raised)]">
                      <td className="px-4 py-3 text-[var(--cj-text)] text-xs font-mono">{p.referrer_email}</td>
                      <td className="px-4 py-3 text-[var(--cj-text)]">₦{p.amount_ngn.toLocaleString()}</td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs">{p.payout_method ?? "—"}</td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs">{fmt(p.requested_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            p.status === "paid"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : p.status === "rejected"
                              ? "bg-red-500/20 text-red-400"
                              : p.status === "processing"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.status === "pending" || p.status === "processing" ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => payoutAction("approve", p.id)}
                              disabled={!!actionLoading}
                              className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40
                                         text-emerald-400 rounded transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => payoutAction("reject", p.id)}
                              disabled={!!actionLoading}
                              className="text-xs px-2 py-1 bg-red-600/20 hover:bg-red-600/40
                                         text-red-400 rounded transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[var(--cj-text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        {/* Telegram Daily Setup */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Telegram Daily Setup
          </h2>
          <div className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-5 space-y-3">
            <p className="text-xs text-[var(--cj-text-muted)]">
              Sends the daily AI-generated post (market data + economic calendar) to the{" "}
              <span className="text-[var(--cj-gold)]">@niritoday</span> Telegram channel.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSendDailySetup}
                disabled={tgSending}
                className="btn-gold px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {tgSending ? "Sending…" : "Send Daily Post"}
              </button>
              {tgResult && (
                <p className={`text-xs ${tgResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {tgResult.text}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* AI Usage & Costs */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            AI Usage &amp; Costs
          </h2>
          {aiUsage ? (
            <div className="space-y-4">
              {/* Key + summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: "ANTHROPIC_API_KEY",
                    value: aiUsage.anthropic_key_present ? "✓ Configured" : "✗ Missing",
                    ok:    aiUsage.anthropic_key_present,
                  },
                  { label: `Analyses (${aiUsage.month})`, value: aiUsage.total_analyses },
                  {
                    label: "Input tokens",
                    value: `${(aiUsage.tokens.input / 1000).toFixed(1)}K${aiUsage.tokens.source === "estimated" ? "*" : ""}`,
                  },
                  {
                    label: `Est. cost${aiUsage.cost_source === "estimated" ? " (est.)" : ""}`,
                    value: `$${aiUsage.cost_usd.toFixed(4)}`,
                  },
                ].map(({ label, value, ok }) => (
                  <div key={label} className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4">
                    <div className="text-[var(--cj-text-muted)] text-xs mb-1">{label}</div>
                    <div className={`text-lg font-semibold ${ok === false ? "text-red-400" : ok === true ? "text-emerald-400" : ""}`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              {aiUsage.tokens.source === "estimated" && (
                <p className="text-[10px] text-[var(--cj-text-muted)]">
                  * Token counts marked with * are estimates based on avg usage per call (Anthropic usage API unavailable).
                  Pricing based on Claude Haiku 4.5: $1/M input, $5/M output.
                </p>
              )}
              {/* Per-user breakdown */}
              {aiUsage.per_user.length > 0 ? (
                <div className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--cj-border)] bg-[var(--cj-raised)]">
                        <th className="text-left px-4 py-3 font-medium text-[var(--cj-text-muted)] text-xs">User</th>
                        <th className="text-left px-4 py-3 font-medium text-[var(--cj-text-muted)] text-xs">Plan</th>
                        <th className="text-right px-4 py-3 font-medium text-[var(--cj-text-muted)] text-xs">Analyses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiUsage.per_user.map((u) => (
                        <tr key={u.user_id} className="border-b border-[var(--cj-border)]/50 hover:bg-[var(--cj-raised)]">
                          <td className="px-4 py-3 text-xs text-[var(--cj-text)] max-w-[200px] truncate">{u.email}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${u.plan === "Pro" ? "bg-amber-500/20 text-amber-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                              {u.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-right font-medium">{u.analyses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[var(--cj-text-muted)] text-center py-4">No AI analyses recorded yet.</p>
              )}
            </div>
          ) : (
            <div className="text-[var(--cj-text-muted)] text-sm">Loading AI usage…</div>
          )}
        </section>

        {/* Announcement Emailer */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Send Announcement
          </h2>

          <form
            onSubmit={handleSendAnnouncement}
            className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-5 space-y-3"
          >
            <p className="text-xs text-[var(--cj-text-muted)]">
              Sends a branded NIRI email to the selected recipients via Resend.
            </p>

            <input
              value={announceSubject}
              onChange={(e) => setAnnounceSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                         text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none
                         focus:border-[var(--cj-gold)] transition-[border-color]"
            />

            <textarea
              value={announceMessage}
              onChange={(e) => setAnnounceMessage(e.target.value)}
              placeholder="Message body (each line becomes a paragraph)"
              rows={5}
              className="w-full bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                         text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none
                         focus:border-[var(--cj-gold)] transition-[border-color] resize-none"
            />

            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={announceRecipients}
                onChange={(e) => {
                  setAnnounceRecipients(e.target.value as "all" | "pro" | "specific");
                  setAnnounceResult(null);
                }}
                className="bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                           text-sm text-[var(--cj-text)] outline-none
                           focus:border-[var(--cj-gold)] transition-[border-color]"
              >
                <option value="all">All Users</option>
                <option value="pro">Pro Users Only</option>
                <option value="specific">Specific User</option>
              </select>

              {announceRecipients === "specific" && (
                <input
                  type="email"
                  value={announceSpecific}
                  onChange={(e) => setAnnounceSpecific(e.target.value)}
                  placeholder="user@email.com"
                  className="bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                             text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none
                             focus:border-[var(--cj-gold)] transition-[border-color] w-64"
                />
              )}

              <button
                type="submit"
                disabled={
                  announceSending ||
                  !announceSubject.trim() ||
                  !announceMessage.trim() ||
                  (announceRecipients === "specific" && !announceSpecific.trim())
                }
                className="btn-gold px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {announceSending ? "Sending…" : "Send Announcement"}
              </button>
            </div>

            {announceResult && (
              <p className={`text-xs ${announceResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                {announceResult.text}
              </p>
            )}
          </form>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Notifications
          </h2>

          {/* Create form */}
          <form onSubmit={handleCreateNotification}
                className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-5 mb-4 space-y-3">
            <p className="text-xs font-medium text-[var(--cj-text-muted)]">Send to all users</p>
            <input
              value={newNotiTitle}
              onChange={(e) => setNewNotiTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                         text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none
                         focus:border-[var(--cj-gold)] transition-[border-color]"
            />
            <textarea
              value={newNotiMessage}
              onChange={(e) => setNewNotiMessage(e.target.value)}
              placeholder="Message (supports line breaks)"
              rows={3}
              className="w-full bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                         text-sm text-[var(--cj-text)] placeholder:text-[var(--cj-text-muted)] outline-none
                         focus:border-[var(--cj-gold)] transition-[border-color] resize-none"
            />
            {notiError && <p className="text-xs text-red-400">{notiError}</p>}
            <button
              type="submit"
              disabled={notiSubmitting || !newNotiTitle.trim() || !newNotiMessage.trim()}
              className="btn-gold px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {notiSubmitting ? "Sending…" : "Send Notification"}
            </button>
          </form>

          {/* Existing notifications */}
          <div className="space-y-2">
            {notifications.filter((n) => n.is_active).map((n) => (
              <div key={n.id}
                   className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--cj-text)] mb-1">{n.title}</p>
                  <p className="text-xs text-[var(--cj-text-muted)] whitespace-pre-wrap line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-[var(--cj-text-muted)] mt-1 opacity-60">{fmt(n.created_at)}</p>
                </div>
                <button
                  onClick={() => deleteNotification(n.id)}
                  className="text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/30 text-red-400 rounded shrink-0 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
            {notifications.filter((n) => n.is_active).length === 0 && (
              <p className="text-xs text-[var(--cj-text-muted)] py-4 text-center">No active notifications</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
