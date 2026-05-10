"use client";

import { useState, useEffect, useCallback } from "react";

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

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default function AdminPage() {
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

  const loadDashboard = useCallback(async () => {
    const [statsRes, usersRes, payoutsRes] = await Promise.all([
      fetch("/api/admin/stats"),
      fetch("/api/admin/users"),
      fetch("/api/admin/payouts"),
    ]);

    if (statsRes.status === 401) {
      setView("login");
      return;
    }

    if (statsRes.ok) setStats((await statsRes.json()) as Stats);
    if (usersRes.ok) setUsers(((await usersRes.json()) as { users: AdminUser[] }).users ?? []);
    if (payoutsRes.ok) {
      const d = (await payoutsRes.json()) as { payouts: Payout[]; in_payout_window: boolean };
      setPayouts(d.payouts ?? []);
      setInPayoutWindow(d.in_payout_window ?? false);
    }
    setView("dashboard");
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
    const key = `${action}-${userId}`;
    setActionLoading(key);
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

  if (view === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white/30 text-sm">
        Loading…
      </div>
    );
  }

  if (view === "login") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="bg-[#111] border border-white/10 rounded-xl p-8 w-full max-w-sm space-y-4"
        >
          <h1 className="text-white text-xl font-semibold">Niri Admin</h1>
          {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={logging || !password}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {logging ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Niri Admin</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* Stats */}
        <section>
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">Overview</h2>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: "Total Users",      value: stats.total_users },
                { label: "Pro",              value: stats.pro_count },
                { label: "Active Trials",    value: stats.active_trials },
                { label: "7-day Signups",    value: stats.recent_signups },
                { label: "Monthly Revenue",  value: `₦${stats.monthly_revenue.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#111] border border-white/10 rounded-xl p-4">
                  <div className="text-white/40 text-xs mb-1">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/30 text-sm">No stats available</div>
          )}
        </section>

        {/* Users */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Users ({users.length})
            </h2>
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by email…"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-500 w-60"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
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
                    <td colSpan={7} className="py-8 text-center text-white/30">Loading…</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-white/30">No users found</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white/80 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            u.is_pro
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-white/10 text-white/50"
                          }`}
                        >
                          {u.is_pro ? "Pro" : u.subscription_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        {u.trial_active ? (
                          <span className="text-amber-400">Until {fmt(u.trial_ends_at)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">{fmt(u.created_at)}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{fmt(u.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        {u.ai_credits_used}/{u.ai_credits_limit}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => userAction("set_pro", u.id)}
                            disabled={actionLoading === `set_pro-${u.id}`}
                            className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded transition-colors disabled:opacity-50"
                          >
                            Set Pro
                          </button>
                          <button
                            onClick={() => userAction("extend_trial", u.id)}
                            disabled={actionLoading === `extend_trial-${u.id}`}
                            className="text-xs px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 rounded transition-colors disabled:opacity-50"
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
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">
            Payout Requests
            {inPayoutWindow && (
              <span className="ml-2 text-amber-400 normal-case font-normal text-xs">
                — payout window active (days 28–31)
              </span>
            )}
          </h2>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
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
                    <td colSpan={6} className="py-8 text-center text-white/30">
                      No payout requests
                    </td>
                  </tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white/80 text-xs font-mono">{p.referrer_email}</td>
                      <td className="px-4 py-3 text-white/80">₦{p.amount_ngn.toLocaleString()}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{p.payout_method ?? "—"}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{fmt(p.requested_at)}</td>
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
                              className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => payoutAction("reject", p.id)}
                              disabled={!!actionLoading}
                              className="text-xs px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
