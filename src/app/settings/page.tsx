"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { User } from "@supabase/supabase-js";

interface SubState { status: string; end: string | null; }

interface SyncToken {
  id: string;
  token: string;
  label: string;
  last_sync_at: string | null;
  created_at: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [syncToken, setSyncToken] = useState<SyncToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [sub, setSub] = useState<SubState>({ status: "free", end: null });
  const [syncUrl] = useState(() =>
    typeof window !== "undefined" ? window.location.origin + "/api/mt5/sync" : ""
  );

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

      setLoading(false);
    }
    init();
  }, []);

  async function generateToken() {
    if (!user) return;
    setGenerating(true);
    setGenError(null);
    const supabase = createClient();
    if (syncToken) {
      await supabase
        .from("mt5_sync_tokens")
        .delete()
        .eq("id", syncToken.id)
        .eq("user_id", user.id);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">

      {/* HEADER */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-7 h-16
                         bg-[var(--cj-surface)] border-b border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600
                            flex items-center justify-center text-sm font-bold text-white">
              CJ
            </div>
            <span className="font-semibold text-base tracking-tight hidden sm:block">
              My Trading Journal
            </span>
          </Link>
          <span className="text-zinc-700 mx-1 hidden sm:block">·</span>
          <span className="text-sm text-zinc-400 hidden sm:block">Settings</span>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-[11px] text-zinc-500 hidden sm:block">{user.email}</span>}
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* SUBSCRIPTION */}
        {(() => {
          const isPro = sub.status === "pro" && !!sub.end && new Date(sub.end) > new Date();
          const daysLeft = sub.end
            ? Math.max(0, Math.ceil((new Date(sub.end).getTime() - Date.now()) / 86_400_000))
            : 0;
          return (
            <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                  Subscription
                </p>
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
                    Expires{" "}
                    {new Date(sub.end!).toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric",
                    })}{" "}
                    · {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                  </p>
                  <Link href="/pricing"
                    className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors">
                    Renew Pro →
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-zinc-500 mb-4">
                    You are on the Free plan — up to 20 trades/month, no AI analysis.
                    Upgrade to unlock everything.
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

        {/* MT5 SYNC TOKEN */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
              MT5 Sync Token
            </p>
            {syncToken?.last_sync_at && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Last sync: {new Date(syncToken.last_sync_at).toLocaleString()}
              </span>
            )}
          </div>
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
                    }`}
                >
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
                    }`}
                >
                  {copiedUrl ? "Copied!" : "Copy"}
                </button>
              </div>

              <button
                onClick={generateToken}
                disabled={generating}
                className="text-xs text-zinc-600 hover:text-rose-400 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? "Regenerating..." : "⚠ Regenerate token (invalidates current EA connection)"}
              </button>
              {genError && <p className="mt-3 text-xs text-rose-400">{genError}</p>}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-10 h-10 rounded-xl bg-[var(--cj-raised)] border border-zinc-800
                              flex items-center justify-center text-lg mb-3">
                🔑
              </div>
              <p className="text-sm text-zinc-500 mb-4">No sync token generated yet</p>
              <button
                onClick={generateToken}
                disabled={generating}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white
                           font-semibold text-sm transition-all disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate Token"}
              </button>
              {genError && <p className="mt-3 text-xs text-rose-400">{genError}</p>}
            </div>
          )}
        </div>

        {/* SETUP GUIDE */}
        <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
              MT5 Setup Guide
            </p>
            <a
              href="/CandlesJournalEA.mq5"
              download
              className="text-center text-xs px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white
                         font-semibold transition-all sm:w-auto w-full"
            >
              Download EA
            </a>
          </div>

          <ol className="space-y-6">
            {[
              {
                n: "1",
                title: "Download the Expert Advisor",
                body: 'Click "Download EA" above to get CandlesJournalEA.mq5.',
              },
              {
                n: "2",
                title: "Install the EA in MetaTrader 5",
                body: "In MT5: File → Open Data Folder → MQL5 → Experts. Copy CandlesJournalEA.mq5 into that folder. In the Navigator panel, right-click Experts → Refresh.",
              },
              {
                n: "3",
                title: "Allow WebRequest in MT5",
                body: `Tools → Options → Expert Advisors → check "Allow WebRequest for listed URL". Add your Sync URL: ${syncUrl || "(shown above once generated)"}`,
              },
              {
                n: "4",
                title: "Attach the EA to a chart",
                body: 'Drag CandlesJournalEA onto any chart (e.g. EURUSD H1). In the EA inputs, paste your Sync Token and Sync URL from above. Enable "Allow algo trading".',
              },
              {
                n: "5",
                title: "Trades sync automatically",
                body: 'Every time you close a trade in MT5, the EA sends it to your journal instantly. The "Last sync" timestamp on this page will update.',
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-4">
                <div className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30
                                flex items-center justify-center text-[11px] font-bold text-blue-400
                                shrink-0 mt-0.5">
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
  );
}
