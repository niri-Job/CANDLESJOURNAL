"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import NiriOrb from "@/components/NiriOrb";
import type { TradeForNiri } from "@/hooks/useNiriBehaviour";

// ── Routes where the orb should not appear ────────────────────────────────────
const PUBLIC_ROUTES = new Set(["/", "/login", "/pricing", "/terms-of-service", "/reset-password"]);

// ── Page-aware messages (fire once per page per session) ─────────────────────
const PAGE_MESSAGES: Record<string, string> = {
  "/reports":      "Let's see what your numbers are saying. I've been looking at your patterns...",
  "/playbook":     "Your playbook is only useful if you actually follow it. Just saying.",
  "/calculator":   "Good. You're calculating before trading. I respect that.",
  "/market":       "Markets are noisy today. Don't let the news trade for you.",
  "/copy-trading": "Copying others is fine — but understand WHY they took the trade.",
  "/referrals":    "Building your network while building your edge. Smart.",
  "/settings":     "Housekeeping. Good traders keep their tools clean.",
  "/chart":        "Reading charts or just staring at candles hoping they move? Be honest.",
};

// ── Compact trade shape for Claude (minimise tokens) ─────────────────────────
function compact(t: TradeForNiri) {
  return {
    pair:    t.pair,
    dir:     t.direction,
    lot:     t.lot,
    entry:   t.entry,
    exit:    t.exit_price,
    pnl:     t.pnl,
    date:    t.date,
    session: t.session ?? "Unknown",
    sl:      t.sl,
    tp:      t.tp,
  };
}

// ── Compute report-level stats from trades (used for /reports insight) ────────
function reportStats(trades: TradeForNiri[]) {
  if (trades.length === 0) return null;
  const wins  = trades.filter((t) => t.pnl > 0).length;
  const total = trades.length;
  const pnl   = trades.reduce((s, t) => s + t.pnl, 0);
  const avgPnl = (pnl / total).toFixed(2);

  const pairMap: Record<string, { wins: number; total: number }> = {};
  const sessMap: Record<string, number> = {};
  for (const t of trades) {
    if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, total: 0 };
    pairMap[t.pair].total++;
    if (t.pnl > 0) pairMap[t.pair].wins++;
    const s = t.session ?? "Unknown";
    sessMap[s] = (sessMap[s] ?? 0) + t.pnl;
  }
  const pairs   = Object.entries(pairMap).sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total);
  const sessions = Object.entries(sessMap).sort((a, b) => b[1] - a[1]);

  return {
    total, wins, losses: total - wins,
    winRatePct: ((wins / total) * 100).toFixed(1),
    totalPnl:   pnl.toFixed(2),
    avgPnl,
    bestPair:   pairs[0]?.[0] ?? "N/A",
    worstPair:  pairs[pairs.length - 1]?.[0] ?? "N/A",
    bestSession: sessions[0]?.[0] ?? "N/A",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NiriOrbWrapper() {
  const pathname = usePathname();

  const [authed,  setAuthed]  = useState(false);
  const [isPro,   setIsPro]   = useState(false);
  const [trades,  setTrades]  = useState<TradeForNiri[]>([]);

  // Prevent double-triggering inside effects
  const aiTriggeredRef   = useRef<Set<string>>(new Set());
  const pageVisitedRef   = useRef<Set<string>>(new Set());
  const pageTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Skip public routes ───────────────────────────────────────────────────────
  if (PUBLIC_ROUTES.has(pathname) || pathname.startsWith("/payment")) return null;

  // ── Initial auth + data fetch ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setAuthed(true);

      const [profileRes, tradesRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_status, subscription_end")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("trades")
          .select("id, pair, direction, pnl, lot, date, sl, tp, entry, exit_price, session, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const pro =
        profileRes.data?.subscription_status === "pro" &&
        !!profileRes.data?.subscription_end &&
        new Date(profileRes.data.subscription_end) > new Date();
      setIsPro(pro);

      if (tradesRes.data) setTrades(tradesRes.data as TradeForNiri[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-fetch trades when navigating to dashboard/reports ──────────────────────
  useEffect(() => {
    if (!authed) return;
    if (pathname !== "/dashboard" && pathname !== "/reports") return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("trades")
        .select("id, pair, direction, pnl, lot, date, sl, tp, entry, exit_price, session, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setTrades(data as TradeForNiri[]);
    });
  }, [pathname, authed]);

  // ── Page-navigation messages ──────────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    const msg = PAGE_MESSAGES[pathname];
    if (!msg) return;

    const sessionKey = `niri_page_${pathname.replace(/\//g, "_")}`;
    if (pageVisitedRef.current.has(pathname)) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(sessionKey)) return;

    if (pageTimerRef.current) clearTimeout(pageTimerRef.current);
    pageTimerRef.current = setTimeout(() => {
      pageVisitedRef.current.add(pathname);
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(sessionKey, "1");
      window.dispatchEvent(new CustomEvent("niri:page-message", { detail: { message: msg } }));
    }, 2000);

    return () => { if (pageTimerRef.current) clearTimeout(pageTimerRef.current); };
  }, [pathname, authed]);

  // ── AI insights (all users) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    if (trades.length === 0) return;
    if (pathname !== "/dashboard" && pathname !== "/reports") return;

    const insightKey = pathname === "/dashboard" ? "niri_ai_dashboard" : "niri_ai_reports";
    const callsKey   = "niri_ai_session_calls";

    if (aiTriggeredRef.current.has(insightKey)) return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(insightKey)) return;
    if (parseInt(sessionStorage.getItem(callsKey) ?? "0") >= 2) return;

    aiTriggeredRef.current.add(insightKey);

    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(async () => {
      try {
        const calls = parseInt(sessionStorage.getItem(callsKey) ?? "0");
        if (calls >= 2) return;
        sessionStorage.setItem(callsKey, String(calls + 1));
        sessionStorage.setItem(insightKey, "1");

        const body = pathname === "/reports"
          ? { type: "reports", reportStats: reportStats(trades) }
          : { type: "trades",  trades: trades.slice(0, 20).map(compact) };

        const res = await fetch("/api/niri/insight", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });

        if (res.ok) {
          const { insight } = await res.json() as { insight?: string };
          if (insight) {
            window.dispatchEvent(new CustomEvent("niri:ai-insight", { detail: { message: insight } }));
          }
        }
      } catch (e) {
        console.error("[NIRI] AI insight fetch error:", e);
        // Non-fatal — orb continues without the insight
      }
    }, 6000); // 6s delay after page loads before the AI call

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [pathname, authed, trades.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authed) return null;

  return <NiriOrb trades={trades} />;
}
