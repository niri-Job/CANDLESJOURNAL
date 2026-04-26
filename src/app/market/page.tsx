"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: "High" | "Medium" | "Low" | "Holiday" | string;
  forecast: string;
  previous: string;
  actual: string;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

type CalFilter = "all" | "high" | "today";

// ─── Constants ────────────────────────────────────────────────────────────────
const HIGH_IMPACT_KEYWORDS = [
  "NFP", "Non-Farm", "CPI", "inflation", "interest rate", "Fed ", "FOMC",
  "BOE", "ECB", "BOJ", "GDP", "unemployment", "payroll", "rate decision",
  "Federal Reserve", "Bank of England", "European Central", "Bank of Japan",
];

// Map currency code → pairs it affects
const CURRENCY_PAIRS: Record<string, string[]> = {
  USD: ["EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "USDNOK", "US30", "NAS100", "BTCUSD"],
  EUR: ["EURUSD", "EURCAD", "EURGBP"],
  GBP: ["GBPUSD", "GBPJPY", "EURGBP"],
  JPY: ["USDJPY", "GBPJPY"],
  CHF: ["USDCHF"],
  CAD: ["USDCAD", "EURCAD"],
  AUD: ["AUDUSD"],
  NZD: ["NZDUSD"],
  NOK: ["USDNOK"],
  CNY: ["USDJPY"],
  XAU: ["XAUUSD"],
};

const ALL_CURRENCIES = Object.keys(CURRENCY_PAIRS);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toWAT(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function toDateWAT(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "—";
  }
}

function isToday(iso: string): boolean {
  try {
    const eventDate = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    return eventDate === today;
  } catch {
    return false;
  }
}

function timeAgo(pubDate: string): string {
  if (!pubDate) return "";
  try {
    const diff = Date.now() - new Date(pubDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return "";
  }
}

function impactIsHigh(text: string): boolean {
  const lower = text.toLowerCase();
  return HIGH_IMPACT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function pairsForCurrency(currency: string): string[] {
  return CURRENCY_PAIRS[currency] ?? [];
}

function isEventRelevantToUser(country: string, preferred: string[]): boolean {
  if (preferred.length === 0) return true;
  const pairs = pairsForCurrency(country);
  return pairs.some((p) => preferred.includes(p));
}

function countdownText(targetISO: string): string {
  const diff = new Date(targetISO).getTime() - Date.now();
  if (diff <= 0) return "now";
  const totalMins = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

// ─── Impact badge ─────────────────────────────────────────────────────────────
function ImpactBadge({ impact }: { impact: string }) {
  const norm = impact?.toLowerCase();
  if (norm === "high")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider
                       bg-red-500/10 border border-red-500/25 text-red-400 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        High
      </span>
    );
  if (norm === "medium")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider
                       bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
        Medium
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider
                     bg-zinc-800 border border-zinc-700 text-zinc-500 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
      Low
    </span>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
function CalendarSkeleton() {
  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              {[60, 52, 52, 80, 200, 52, 52, 52].map((w, i) => (
                <th key={i} className="px-4 py-3.5">
                  <div className={`h-2 bg-zinc-800 rounded`} style={{ width: w }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 9 }).map((_, row) => (
              <tr key={row} className="border-b border-zinc-800/60">
                {[60, 44, 44, 70, 180, 44, 44, 44].map((w, col) => (
                  <td key={col} className="px-4 py-3.5">
                    <div
                      className="h-3 bg-zinc-800/70 rounded"
                      style={{ width: w, opacity: 1 - row * 0.07 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-zinc-800">
        <div className="h-2 bg-zinc-800 rounded w-56" />
      </div>
    </div>
  );
}

function NewsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-[var(--cj-surface)] border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="h-2.5 bg-zinc-800 rounded w-20" />
            <div className="h-2.5 bg-zinc-800 rounded w-12" />
          </div>
          <div className="space-y-2 mb-3">
            <div className="h-3.5 bg-zinc-800 rounded w-full" />
            <div className="h-3.5 bg-zinc-800 rounded w-4/5" />
            <div className="h-3.5 bg-zinc-800 rounded w-3/5" />
          </div>
          <div className="h-2 bg-zinc-800 rounded w-32" />
        </div>
      ))}
    </div>
  );
}

function CountdownSkeleton() {
  return (
    <div className="mb-5 bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl px-5 py-4
                    flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-pulse">
      <div className="space-y-2">
        <div className="h-2.5 bg-zinc-800 rounded w-40" />
        <div className="h-4 bg-zinc-800 rounded w-56" />
        <div className="h-2.5 bg-zinc-800 rounded w-36" />
      </div>
      <div className="h-10 bg-zinc-800 rounded w-28 shrink-0" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MarketPage() {
  const [tab, setTab] = useState<"calendar" | "news">("calendar");
  const [calFilter, setCalFilter] = useState<CalFilter>("all");
  const [newsCurrencyFilter, setNewsCurrencyFilter] = useState("all");
  const [preferredPairs, setPreferredPairs] = useState<string[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarEvent[]>([]);
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ── Auth + preferences ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setCurrentUser(user);

      const { data: raw } = await supabase
        .from("user_profiles")
        .select("preferred_pairs")
        .eq("user_id", user.id)
        .maybeSingle();
      const profile = raw as { preferred_pairs: string[] | null } | null;
      setPreferredPairs(profile?.preferred_pairs ?? []);
    }
    init();
  }, []);

  // ── Fetch calendar ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setCalLoading(true);
      setCalError(null);
      try {
        const res = await fetch("/api/market/calendar");
        const data = await res.json() as CalendarEvent[];
        setCalendarData(Array.isArray(data) ? data : []);
      } catch {
        setCalError("Unable to load economic calendar");
      } finally {
        setCalLoading(false);
      }
    }
    load();
  }, []);

  // ── Fetch news on tab switch ───────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "news" || newsData.length > 0) return;
    async function load() {
      setNewsLoading(true);
      setNewsError(null);
      try {
        const res = await fetch("/api/market/news");
        const data = await res.json() as NewsItem[];
        setNewsData(Array.isArray(data) ? data : []);
      } catch {
        setNewsError("Unable to load market news");
      } finally {
        setNewsLoading(false);
      }
    }
    load();
  }, [tab, newsData.length]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  const updateCountdown = useCallback(() => {
    const now = Date.now();
    const upcoming = calendarData
      .filter((e) => e.impact === "High" && new Date(e.date).getTime() > now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const next = upcoming[0] ?? null;
    setNextEvent(next);
    setCountdown(next ? countdownText(next.date) : "");
  }, [calendarData]);

  useEffect(() => {
    updateCountdown();
    const id = setInterval(updateCountdown, 60_000);
    return () => clearInterval(id);
  }, [updateCountdown]);

  // ── Filtered calendar ─────────────────────────────────────────────────────
  const filteredCalendar = calendarData.filter((e) => {
    if (e.impact === "Holiday") return false;
    if (calFilter === "high" && e.impact !== "High") return false;
    if (calFilter === "today" && !isToday(e.date)) return false;
    return true;
  });

  // ── Filtered news ──────────────────────────────────────────────────────────
  const filteredNews = newsData.filter((item) => {
    if (newsCurrencyFilter === "all") return true;
    const text = (item.title + " " + item.description).toUpperCase();
    return text.includes(newsCurrencyFilter);
  });

  // ── Preferred currencies derived from pairs ────────────────────────────────
  const preferredCurrencies = new Set<string>();
  for (const pair of preferredPairs) {
    for (const [ccy, pairs] of Object.entries(CURRENCY_PAIRS)) {
      if (pairs.includes(pair)) preferredCurrencies.add(ccy);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">

      <Sidebar user={currentUser} onSignOut={handleLogout} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">

        {/* COUNTDOWN SKELETON while calendar loads */}
        {calLoading && <CountdownSkeleton />}

        {/* NEXT HIGH-IMPACT EVENT COUNTDOWN */}
        {!calLoading && nextEvent && (
          <div className="mb-5 bg-red-500/8 border border-red-500/20 rounded-2xl px-5 py-4
                          flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-red-400/70 font-medium mb-0.5">
                  Next High-Impact Event
                </p>
                <p className="text-sm font-semibold text-zinc-100">{nextEvent.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {nextEvent.country} · {toDateWAT(nextEvent.date)} at {toWAT(nextEvent.date)} WAT
                </p>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="font-mono text-3xl font-bold text-red-400">{countdown}</span>
              <span className="text-xs text-zinc-500">remaining</span>
            </div>
          </div>
        )}

        {/* TAB BAR */}
        <div className="flex gap-1 bg-[var(--cj-surface)] border border-zinc-800 rounded-xl p-1 mb-5 w-fit">
          {(["calendar", "news"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
                ${tab === t
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
                }`}
            >
              {t === "calendar" ? "📅 Economic Calendar" : "📰 Market News"}
            </button>
          ))}
        </div>

        {/* ─── ECONOMIC CALENDAR ─────────────────────────────────────────── */}
        {tab === "calendar" && (
          <div>
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex gap-1 bg-[var(--cj-surface)] border border-zinc-800 rounded-lg p-1">
                {([
                  { key: "all", label: "All Events" },
                  { key: "high", label: "🔴 High Impact" },
                  { key: "today", label: "Today" },
                ] as { key: CalFilter; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setCalFilter(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                      ${calFilter === key
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {preferredPairs.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-600">Your pairs:</span>
                  {preferredPairs.slice(0, 6).map((p) => (
                    <span key={p}
                      className="text-[10px] font-mono bg-blue-500/10 border border-blue-500/20
                                 text-blue-400 px-2 py-0.5 rounded-md">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {calLoading && <CalendarSkeleton />}

            {calError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-5 py-4
                              text-rose-400 text-sm">
                {calError} — try refreshing the page.
              </div>
            )}

            {!calLoading && !calError && (
              <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl overflow-hidden">
                {filteredCalendar.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                    <p className="text-sm text-zinc-500 font-semibold mb-1">No events to show</p>
                    <p className="text-xs">Try changing the filter above</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          {["Date", "Time (WAT)", "Currency", "Impact", "Event", "Previous", "Forecast", "Actual"].map((h) => (
                            <th key={h}
                              className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium
                                         text-left px-4 py-3 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCalendar.map((ev, i) => {
                          const today = isToday(ev.date);
                          const relevant = isEventRelevantToUser(ev.country, preferredPairs);
                          return (
                            <tr
                              key={i}
                              className={`border-b border-zinc-800/60 transition-colors
                                ${today
                                  ? "bg-blue-500/5 hover:bg-blue-500/8"
                                  : "hover:bg-[var(--cj-raised)]"
                                }
                                ${!relevant && preferredPairs.length > 0 ? "opacity-40" : ""}
                              `}
                            >
                              <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
                                {today
                                  ? <span className="text-blue-400 font-semibold">Today</span>
                                  : toDateWAT(ev.date)
                                }
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-zinc-300 whitespace-nowrap">
                                {toWAT(ev.date)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs font-bold text-zinc-200
                                                 bg-zinc-800 px-2 py-0.5 rounded">
                                  {ev.country}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <ImpactBadge impact={ev.impact} />
                              </td>
                              <td className="px-4 py-3 text-xs text-zinc-200 max-w-[280px]">
                                <span className="font-medium">{ev.title}</span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                                {ev.previous || "—"}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                                {ev.forecast || "—"}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                {ev.actual ? (
                                  <span className={
                                    ev.forecast && ev.actual > ev.forecast
                                      ? "text-emerald-400 font-semibold"
                                      : ev.forecast && ev.actual < ev.forecast
                                      ? "text-rose-400 font-semibold"
                                      : "text-zinc-300"
                                  }>
                                    {ev.actual}
                                  </span>
                                ) : (
                                  <span className="text-zinc-700">Pending</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
                  <p className="text-[10px] text-zinc-600">
                    {filteredCalendar.length} event{filteredCalendar.length !== 1 ? "s" : ""} · Times in WAT (UTC+1)
                    {preferredPairs.length > 0 && " · Dimmed events don't affect your pairs"}
                  </p>
                  <p className="text-[10px] text-zinc-700">Source: ForexFactory</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── MARKET NEWS ───────────────────────────────────────────────── */}
        {tab === "news" && (
          <div>
            {/* Currency filter */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {["all", "EURUSD", "GBPUSD", "XAUUSD", "USDJPY", "USDCAD", "AUD", "NZD"].map((f) => (
                <button
                  key={f}
                  onClick={() => setNewsCurrencyFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                    ${newsCurrencyFilter === f
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-[var(--cj-surface)] border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                >
                  {f === "all" ? "All News" : f}
                </button>
              ))}
            </div>

            {newsLoading && <NewsSkeleton />}

            {newsError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-5 py-4
                              text-rose-400 text-sm">
                {newsError} — try refreshing the page.
              </div>
            )}

            {!newsLoading && !newsError && filteredNews.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                <p className="text-sm text-zinc-500 font-semibold mb-1">No news items</p>
                <p className="text-xs">Try a different filter or refresh</p>
              </div>
            )}

            {!newsLoading && !newsError && filteredNews.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredNews.map((item, i) => {
                  const isHighImpact = impactIsHigh(item.title + " " + item.description);
                  return (
                    <a
                      key={i}
                      href={item.link || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group block bg-[var(--cj-surface)] border rounded-xl p-4
                                  hover:border-zinc-600 transition-all cursor-pointer
                                  ${isHighImpact ? "border-red-500/25 hover:border-red-500/40" : "border-zinc-800"}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                            {item.source}
                          </span>
                          {isHighImpact && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider
                                             bg-red-500/10 border border-red-500/25 text-red-400
                                             px-2 py-0.5 rounded-full">
                              High Impact
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-600 whitespace-nowrap shrink-0">
                          {timeAgo(item.pubDate)}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-zinc-100 leading-snug mb-2
                                     group-hover:text-white transition-colors line-clamp-3">
                        {item.title}
                      </h3>

                      {item.description && (
                        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-3 flex items-center gap-1 text-[10px] text-zinc-600
                                      group-hover:text-blue-400 transition-colors">
                        Read full article
                        <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {!newsLoading && newsData.length > 0 && (
              <p className="mt-4 text-center text-[10px] text-zinc-700">
                Sources: ForexLive · DailyFX · Updated every 5 minutes
              </p>
            )}
          </div>
        )}

      </main>
      </div>{/* end md:ml-[240px] wrapper */}
    </div>
  );
}
