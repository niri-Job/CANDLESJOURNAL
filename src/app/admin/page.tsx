"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

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
function writeTheme(t: Theme) { localStorage.setItem("cj_theme", t); }
function applyTheme(t: Theme) { document.documentElement.setAttribute("data-theme", t); }

interface ActivityRow {
  id:                   string;
  email:                string;
  signup_date:          string;
  total_trades:         number;
  csv_imports:          number;
  has_metaapi:          boolean;
  last_active:          string | null;
  onboarding_completed: boolean;
  ai_credits_used:      number;
  ai_credits_limit:     number;
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

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_active: boolean;
}

type SortCol = "email" | "signup_date" | "onboarding_completed" | "total_trades" | "has_metaapi" | "last_active" | "ai_credits_used";

function fmtDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 opacity-30 text-[10px]">↕</span>;
  return <span className="ml-1 text-[var(--cj-gold)] text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function AdminPage() {
  const [theme, setTheme]       = useState<Theme>("dark");
  const [view, setView]         = useState<"loading" | "login" | "dashboard">("loading");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [logging, setLogging]   = useState(false);

  const [activity,   setActivity]   = useState<ActivityRow[]>([]);
  const [aiUsage,    setAiUsage]    = useState<AiUsageData | null>(null);
  const [notifications,      setNotifications]      = useState<AdminNotification[]>([]);
  const [newNotiTitle,       setNewNotiTitle]       = useState("");
  const [newNotiMessage,     setNewNotiMessage]     = useState("");
  const [notiSubmitting,     setNotiSubmitting]     = useState(false);
  const [notiError,          setNotiError]          = useState("");
  const [tgSending,          setTgSending]          = useState(false);
  const [tgResult,           setTgResult]           = useState<{ ok: boolean; text: string } | null>(null);
  const [calSending,         setCalSending]         = useState(false);
  const [calResult,          setCalResult]          = useState<{ ok: boolean; text: string } | null>(null);
  const [refStats, setRefStats] = useState<{
    total: number; pending: number; converted: number; paid: number;
    top_referrers: { email: string; count: number }[];
  } | null>(null);
  const [ctStats,            setCtStats]            = useState<{
    total_providers: number; total_subscriptions: number; copied_trades_today: number;
    providers: { id: string; name: string; grade: string; win_rate: number; total_trades: number; total_subscribers: number; is_active: boolean; is_verified: boolean }[];
  } | null>(null);
  const [ctGrading,          setCtGrading]          = useState(false);
  const [ctGradingResult,    setCtGradingResult]    = useState<string | null>(null);
  const [announceSubject,    setAnnounceSubject]    = useState("");
  const [announceMessage,    setAnnounceMessage]    = useState("");
  const [announceRecipients, setAnnounceRecipients] = useState<"all" | "pro" | "specific">("all");
  const [announceSpecific,   setAnnounceSpecific]   = useState("");
  const [announceSending,    setAnnounceSending]    = useState(false);
  const [announceProgress,   setAnnounceProgress]   = useState<{ sent: number; total: number } | null>(null);
  const [announceResult,     setAnnounceResult]     = useState<{ ok: boolean; text: string; errors?: string[] } | null>(null);

  const [search,  setSearch]  = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("signup_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const saved = readTheme();
    setTheme(saved);
    applyTheme(saved);
  }, []);

  function selectTheme(t: Theme) { setTheme(t); writeTheme(t); applyTheme(t); }

  const loadDashboard = useCallback(async () => {
    const [activityRes, aiUsageRes, ctRes, refRes] = await Promise.all([
      fetch("/api/admin/activity"),
      fetch("/api/admin/ai-usage"),
      fetch("/api/copy-trading/grading"),
      fetch("/api/admin/referrals"),
    ]);

    if (activityRes.status === 401) { setView("login"); return; }

    if (activityRes.ok) setActivity(((await activityRes.json()) as { activity: ActivityRow[] }).activity ?? []);
    if (aiUsageRes.ok)  setAiUsage((await aiUsageRes.json()) as AiUsageData);
    if (ctRes.ok)       setCtStats(await ctRes.json());
    if (refRes.ok)      setRefStats(await refRes.json());

    setView("dashboard");

    const notiRes = await fetch("/api/admin/notifications");
    if (notiRes.ok) {
      const d = (await notiRes.json()) as { notifications: AdminNotification[] };
      setNotifications(d.notifications ?? []);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true); setLoginError("");
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
    setView("login"); setActivity([]);
  }

  async function handleCreateNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!newNotiTitle.trim() || !newNotiMessage.trim()) return;
    setNotiSubmitting(true); setNotiError("");
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
    setNewNotiTitle(""); setNewNotiMessage("");
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
    setTgSending(true); setTgResult(null);
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

  async function handleSendWeeklyCalendar() {
    setCalSending(true); setCalResult(null);
    const res = await fetch("/api/telegram/weekly-calendar", { method: "POST" });
    setCalSending(false);
    if (res.ok) {
      const d = (await res.json()) as { range?: string; events_high?: number; events_medium?: number };
      setCalResult({ ok: true, text: `Calendar sent — ${d.range} · ${d.events_high ?? 0} high + ${d.events_medium ?? 0} medium events.` });
    } else {
      const d = (await res.json()) as { error?: string };
      setCalResult({ ok: false, text: d.error ?? "Failed to send" });
    }
  }

  async function handleSendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!announceSubject.trim() || !announceMessage.trim()) return;
    setAnnounceSending(true); setAnnounceResult(null); setAnnounceProgress(null);

    const res = await fetch("/api/admin/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject:        announceSubject.trim(),
        message:        announceMessage.trim(),
        recipients:     announceRecipients,
        specific_email: announceRecipients === "specific" ? announceSpecific.trim() : undefined,
      }),
    });

    if (!res.ok) {
      setAnnounceSending(false);
      const d = (await res.json()) as { error?: string };
      setAnnounceResult({ ok: false, text: d.error ?? "Failed to send" });
      return;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("ndjson")) {
      setAnnounceSending(false);
      const d = (await res.json()) as { sent: number; total: number; email?: string; errors?: string[] };
      const text = d.email ? `Email sent to ${d.email}.` : `Sent to ${d.sent} of ${d.total} recipients.`;
      setAnnounceResult({ ok: d.sent > 0, text, errors: d.errors });
      setAnnounceSubject(""); setAnnounceMessage("");
      return;
    }

    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as { sent: number; total: number; done: boolean; errors?: string[] };
          setAnnounceProgress({ sent: d.sent, total: d.total });
          if (d.done) {
            setAnnounceSending(false); setAnnounceProgress(null);
            const errNote = d.errors?.length ? ` (${d.errors.length} failed)` : "";
            setAnnounceResult({ ok: d.sent > 0, text: `Sent to ${d.sent} of ${d.total} recipients${errNote}.`, errors: d.errors });
            setAnnounceSubject(""); setAnnounceMessage("");
            if (announceRecipients === "specific") setAnnounceSpecific("");
          }
        } catch { /* skip */ }
      }
    }
    setAnnounceSending(false); setAnnounceProgress(null);
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "signup_date" ? "desc" : "asc");
    }
  }

  const displayRows = useMemo(() => {
    const q = search.toLowerCase();
    const rows = q ? activity.filter((r) => r.email.toLowerCase().includes(q)) : activity;
    return [...rows].sort((a, b) => {
      const av = a[sortCol as keyof ActivityRow] ?? "";
      const bv = b[sortCol as keyof ActivityRow] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [activity, search, sortCol, sortDir]);

  const statCards = useMemo(() => [
    { label: "Total Users",   value: activity.length },
    { label: "Active",        value: activity.filter((r) => r.total_trades > 0).length },
    { label: "MT5 Connected", value: activity.filter((r) => r.has_metaapi).length },
    { label: "Total Trades",  value: activity.reduce((s, r) => s + r.total_trades, 0) },
  ], [activity]);

  const ThemePicker = () => (
    <div className="flex items-center gap-1.5">
      {THEMES.map(({ key, icon, label }) => (
        <button
          key={key}
          title={label}
          onClick={() => selectTheme(key)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all border
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
          <div className="flex justify-center"><ThemePicker /></div>
          <form
            onSubmit={handleLogin}
            className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-8 space-y-4"
          >
            <h1 className="text-[var(--cj-text)] text-xl font-semibold">NIRI Admin</h1>
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
        <h1 className="text-lg font-semibold">NIRI Admin</h1>
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

        {/* Stat Cards */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {statCards.map(({ label, value }) => (
              <div key={label} className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4">
                <div className="text-[var(--cj-text-muted)] text-xs mb-1">{label}</div>
                <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Unified Users Table */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider">
              Users ({displayRows.length})
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                  {(
                    [
                      { col: "email",                label: "Email" },
                      { col: "signup_date",          label: "Signed up" },
                      { col: "onboarding_completed", label: "Onboarded" },
                      { col: "total_trades",         label: "Trades" },
                      { col: "has_metaapi",          label: "MT5" },
                      { col: "last_active",          label: "Last active" },
                      { col: "ai_credits_used",      label: "AI uses" },
                    ] as { col: SortCol; label: string }[]
                  ).map(({ col, label }) => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-[var(--cj-text)] transition-colors"
                      onClick={() => toggleSort(col)}
                    >
                      {label}
                      <SortIcon active={sortCol === col} dir={sortDir} />
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[var(--cj-text-muted)]">
                      {search ? "No users match your search" : "No users yet"}
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--cj-border)]/50 hover:bg-[var(--cj-raised)]">
                      <td className="px-4 py-3 text-[var(--cj-text)] font-sans text-xs max-w-[200px] truncate">
                        {row.email}
                      </td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs whitespace-nowrap">
                        {fmtDate(row.signup_date)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.onboarding_completed
                          ? <span className="text-emerald-400">Yes</span>
                          : <span className="text-amber-400">No</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">{row.total_trades}</td>
                      <td className="px-4 py-3 text-xs">
                        {row.has_metaapi
                          ? <span className="text-emerald-400">Yes</span>
                          : <span className="text-zinc-500">No</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs whitespace-nowrap">
                        {fmtDate(row.last_active)}
                      </td>
                      <td className="px-4 py-3 text-[var(--cj-text-muted)] text-xs">
                        {row.ai_credits_used}/{row.ai_credits_limit}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`mailto:${row.email}`}
                          className="text-xs px-2.5 py-1 bg-[var(--cj-raised)] hover:bg-[var(--cj-border)]
                                     border border-[var(--cj-border)] text-[var(--cj-text-muted)]
                                     hover:text-[var(--cj-text)] rounded transition-colors"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Telegram */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Telegram Channel
          </h2>
          <div className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-5 space-y-4">
            <p className="text-xs text-[var(--cj-text-muted)]">
              Sends posts to the <span className="text-[var(--cj-gold)]">@niritoday</span> Telegram channel.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSendDailySetup}
                disabled={tgSending || calSending}
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
            <div className="border-t border-[var(--cj-border)]" />
            <div>
              <p className="text-xs text-[var(--cj-text-muted)] mb-2">
                Generates a 1080×1080 PNG flier of the week&apos;s high-impact economic events and sends it as an image.
                Auto-fires every Monday at 7:30 AM WAT.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSendWeeklyCalendar}
                  disabled={calSending || tgSending}
                  className="btn-gold px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {calSending ? "Generating…" : "Send Weekly Calendar"}
                </button>
                {calResult && (
                  <p className={`text-xs ${calResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {calResult.text}
                  </p>
                )}
              </div>
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
                  * Token counts marked with * are estimates. Pricing based on Claude Haiku 4.5: $1/M input, $5/M output.
                </p>
              )}
              {aiUsage.per_user.length > 0 && (
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
                onChange={(e) => { setAnnounceRecipients(e.target.value as "all" | "pro" | "specific"); setAnnounceResult(null); }}
                className="bg-[var(--cj-raised)] border border-[var(--cj-border)] rounded-lg px-3 py-2
                           text-sm text-[var(--cj-text)] outline-none focus:border-[var(--cj-gold)] transition-[border-color]"
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
                {announceSending
                  ? announceProgress
                    ? `Sending… ${announceProgress.sent}/${announceProgress.total}`
                    : "Sending…"
                  : "Send Announcement"}
              </button>
            </div>
            {announceResult && (
              <div className="space-y-2">
                <p className={`text-xs ${announceResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {announceResult.text}
                </p>
                {announceResult.errors && announceResult.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-amber-400 hover:text-amber-300">
                      Show {announceResult.errors.length} failure{announceResult.errors.length !== 1 ? "s" : ""}
                    </summary>
                    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto bg-zinc-900 rounded p-2">
                      {announceResult.errors.map((err, i) => (
                        <li key={i} className="text-red-400 font-sans break-all">{err}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </form>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider mb-4">
            Notifications
          </h2>
          <form
            onSubmit={handleCreateNotification}
            className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-5 mb-4 space-y-3"
          >
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
          <div className="space-y-2">
            {notifications.filter((n) => n.is_active).map((n) => (
              <div
                key={n.id}
                className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--cj-text)] mb-1">{n.title}</p>
                  <p className="text-xs text-[var(--cj-text-muted)] whitespace-pre-wrap line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-[var(--cj-text-muted)] mt-1 opacity-60">{fmtDate(n.created_at)}</p>
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

        {/* Copy Trading */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-[var(--cj-gold-muted)] uppercase tracking-wider">
              Copy Trading
            </h2>
            <button
              onClick={async () => {
                setCtGrading(true); setCtGradingResult(null);
                const res = await fetch("/api/copy-trading/grading", { method: "POST" });
                const d = await res.json() as { ok?: boolean; updated?: number; error?: string };
                setCtGradingResult(res.ok ? `Grades recalculated for ${d.updated} providers.` : (d.error ?? "Failed"));
                setCtGrading(false);
                const r = await fetch("/api/copy-trading/grading");
                if (r.ok) setCtStats(await r.json());
              }}
              disabled={ctGrading}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "var(--cj-raised)", border: "1px solid var(--cj-border)", color: "var(--cj-gold)" }}
            >
              {ctGrading ? "Recalculating…" : "Recalculate Grades"}
            </button>
          </div>
          {ctGradingResult && <p className="text-xs text-emerald-400 mb-3">{ctGradingResult}</p>}
          {ctStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total Providers",     value: ctStats.total_providers },
                  { label: "Total Subscriptions", value: ctStats.total_subscriptions },
                  { label: "Copied Trades Today", value: ctStats.copied_trades_today },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4">
                    <div className="text-[var(--cj-text-muted)] text-xs mb-1">{label}</div>
                    <div className="text-2xl font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              {ctStats.providers.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[var(--cj-border)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--cj-border)] text-[var(--cj-text-muted)]">
                        <th className="text-left px-4 py-3 font-medium">Provider</th>
                        <th className="text-left px-4 py-3 font-medium">Grade</th>
                        <th className="text-right px-4 py-3 font-medium">Win Rate</th>
                        <th className="text-right px-4 py-3 font-medium">Trades</th>
                        <th className="text-right px-4 py-3 font-medium">Subscribers</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ctStats.providers.map((p) => (
                        <tr key={p.id} className="border-b border-[var(--cj-border)]/50 hover:bg-[var(--cj-raised)]">
                          <td className="px-4 py-3 text-[var(--cj-text)] text-xs font-medium">
                            {p.name}
                            {p.is_verified && <span className="ml-1 text-[var(--cj-gold)] text-[10px]">✓</span>}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold capitalize" style={{ color: p.grade === "ungraded" ? "#6b7280" : "#F5C518" }}>
                            {p.grade}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-emerald-400">{p.win_rate}%</td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--cj-text)]">{p.total_trades}</td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--cj-text)]">{p.total_subscribers}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${p.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                              {p.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[var(--cj-text-muted)] text-sm">No copy trading data</div>
          )}
        </section>

        {/* ── REFERRALS ── */}
        <section className="mb-8">
          <h2 className="text-[var(--cj-text)] font-semibold text-base mb-4">Referrals</h2>

          {refStats ? (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total",     value: refStats.total },
                  { label: "Pending",   value: refStats.pending },
                  { label: "Converted", value: refStats.converted },
                  { label: "Paid",      value: refStats.paid },
                ].map(({ label, value }) => (
                  <div key={label}
                       className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--cj-text-muted)] mb-1">{label}</p>
                    <p className="text-2xl font-bold text-[var(--cj-text)]">{value}</p>
                  </div>
                ))}
              </div>

              {/* Top referrers table */}
              {refStats.top_referrers.length > 0 && (
                <div className="bg-[var(--cj-surface)] border border-[var(--cj-border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--cj-border)]">
                    <p className="text-xs font-semibold text-[var(--cj-text-muted)] uppercase tracking-widest">Top Referrers</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--cj-border)] text-[var(--cj-text-muted)]">
                        <th className="text-left px-4 py-2.5 font-medium text-xs">Email</th>
                        <th className="text-right px-4 py-2.5 font-medium text-xs">Referrals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refStats.top_referrers.map((r, i) => (
                        <tr key={i} className="border-b border-[var(--cj-border)]/50 hover:bg-[var(--cj-raised)]">
                          <td className="px-4 py-2.5 text-xs text-[var(--cj-text)]">{r.email}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-bold text-[var(--cj-text)]">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[var(--cj-text-muted)] text-sm">No referral data</div>
          )}
        </section>

      </div>
    </div>
  );
}
