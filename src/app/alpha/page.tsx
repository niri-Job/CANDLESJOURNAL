"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Reaction { post_id: string; type: string; user_id: string; }
interface AlphaPost {
  id: string; user_id: string; pair: string; direction: "BUY" | "SELL";
  entry_from: number | null; entry_to: number | null;
  stop_loss: number | null; take_profit: number | null;
  timeframe: string | null; write_up: string | null;
  status: "pending" | "tp_hit" | "sl_hit" | "expired" | "running";
  created_at: string; expires_at: string | null;
  display_name: string;
  user_profiles: { name: string | null } | null;
  alpha_points:  { accuracy_rate: number; points: number; tp_hits: number; sl_hits: number; total_posts: number } | null;
  alpha_reactions: Reaction[];
  trade_stats: { wins: number; total: number };
}
interface Analyst {
  user_id: string; points: number; total_posts: number; tp_hits: number; sl_hits: number;
  accuracy_rate: number; win_rate: number; follower_count: number; score: number;
  display_name: string;
  trade_stats: { wins: number; total: number };
  user_profiles: { name: string | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const GOLD  = "#D4A017";
const GREEN = "#5DCAA5";
const RED   = "#E24B4A";
const BORDER = "1px solid rgba(255,255,255,0.07)";

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function daysLeft(iso: string | null): string {
  if (!iso) return "";
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (d <= 0) return "Expired";
  return `${d}d left`;
}
function fmtP(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 10)   return n.toFixed(3);
  return n.toFixed(5);
}
function analystName(post: AlphaPost): string {
  return post.display_name || post.user_profiles?.name || "Trader";
}
function badge(accuracy: number, winRate: number): { label: string; color: string } | null {
  if (accuracy >= 75 && winRate >= 65) return { label: "Gold",   color: GOLD };
  if (accuracy >= 65 && winRate >= 60) return { label: "Silver", color: "#9ca3af" };
  if (accuracy >= 50)                  return { label: "Bronze", color: "#cd7f32" };
  return null;
}
function statusInfo(s: string): { label: string; color: string; icon: string } {
  if (s === "tp_hit")  return { label: "TP Hit",  color: GREEN,    icon: "✅" };
  if (s === "sl_hit")  return { label: "SL Hit",  color: RED,      icon: "❌" };
  if (s === "running") return { label: "Running", color: GOLD,     icon: "🔄" };
  if (s === "expired") return { label: "Expired", color: "#52525b",icon: "⏰" };
  return                      { label: "Pending", color: "#71717a",icon: "⏳" };
}
function reactionCount(reactions: Reaction[], type: string): number {
  return reactions.filter(r => r.type === type).length;
}
function myReaction(reactions: Reaction[], userId: string): string | null {
  return reactions.find(r => r.user_id === userId)?.type ?? null;
}

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({
  post, userId, followed, onFollow, onReact, onFilterAnalyst,
}: {
  post: AlphaPost; userId: string;
  followed: boolean;
  onFollow: (id: string) => void;
  onReact: (postId: string, type: "fire" | "accurate" | "wrong") => void;
  onFilterAnalyst: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const winRate = post.trade_stats.total > 0
    ? Math.round((post.trade_stats.wins / post.trade_stats.total) * 100) : 0;
  const accuracy = Math.round(post.alpha_points?.accuracy_rate ?? 0);
  const b = badge(accuracy, winRate);
  const st = statusInfo(post.status);
  const myR = myReaction(post.alpha_reactions, userId);
  const isOwn = post.user_id === userId;

  return (
    <div style={{
      background: "var(--cj-surface)", border: BORDER, borderRadius: 12,
      marginBottom: 12, overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.28)",
    }}>
      {/* Top bar: status accent */}
      <div style={{ height: 2, background: st.color, opacity: 0.7 }} />

      <div style={{ padding: "14px 16px 12px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Avatar placeholder */}
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: GOLD, flexShrink: 0 }}>
              {analystName(post).charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <button
                  onClick={() => onFilterAnalyst(post.user_id)}
                  style={{ fontSize: 13, fontWeight: 700, color: "var(--cj-text)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                >
                  {analystName(post)}
                </button>
                {b && (
                  <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, border: `1px solid ${b.color}`, color: b.color }}>
                    {b.label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "var(--cj-text-muted)" }}>
                {post.trade_stats.total} trades · {winRate}% WR · {accuracy}% alpha accuracy
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: st.color, fontWeight: 600 }}>{st.icon} {st.label}</span>
            {!isOwn && (
              <button
                onClick={() => onFollow(post.user_id)}
                style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                  background: followed ? "rgba(212,160,23,0.12)" : "transparent",
                  color: followed ? GOLD : "var(--cj-text-muted)",
                  border: `1px solid ${followed ? GOLD : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {followed ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>

        {/* Pair + Direction */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--cj-text)" }}>{post.pair}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
            background: post.direction === "BUY" ? "rgba(93,202,165,0.14)" : "rgba(226,75,74,0.14)",
            color: post.direction === "BUY" ? GREEN : RED,
          }}>{post.direction}</span>
          {post.timeframe && (
            <span style={{ fontSize: 10, color: "var(--cj-text-muted)", padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.05)" }}>
              {post.timeframe}
            </span>
          )}
        </div>

        {/* Price levels */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
          {(post.entry_from || post.entry_to) && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "7px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--cj-text-muted)", marginBottom: 2 }}>ENTRY ZONE</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>
                {post.entry_from && post.entry_to
                  ? `${fmtP(post.entry_from)} – ${fmtP(post.entry_to)}`
                  : fmtP(post.entry_from ?? post.entry_to)}
              </div>
            </div>
          )}
          {post.stop_loss && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "7px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--cj-text-muted)", marginBottom: 2 }}>STOP LOSS</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: RED }}>{fmtP(post.stop_loss)}</div>
            </div>
          )}
          {post.take_profit && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "7px 10px" }}>
              <div style={{ fontSize: 9, color: "var(--cj-text-muted)", marginBottom: 2 }}>TAKE PROFIT</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{fmtP(post.take_profit)}</div>
            </div>
          )}
        </div>

        {/* Write-up */}
        {post.write_up && (
          <div style={{ marginBottom: 10 }}>
            <p style={{
              fontSize: 12, color: "var(--cj-text-muted)", lineHeight: 1.6, margin: 0,
              display: "-webkit-box", WebkitLineClamp: expanded ? "unset" : 3,
              WebkitBoxOrient: "vertical" as const, overflow: expanded ? "visible" : "hidden",
            }}>
              {post.write_up}
            </p>
            {post.write_up.length > 120 && (
              <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 10, color: GOLD, background: "none", border: "none", cursor: "pointer", padding: "2px 0", marginTop: 2 }}>
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}

        {/* Footer: time + reactions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#52525b" }}>
            {timeAgo(post.created_at)}
            {post.expires_at && ` · ${daysLeft(post.expires_at)}`}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["fire", "accurate", "wrong"] as const).map(type => {
              const icons: Record<string, string> = { fire: "🔥", accurate: "✓", wrong: "✗" };
              const active = myR === type;
              const n = reactionCount(post.alpha_reactions, type);
              return (
                <button
                  key={type}
                  onClick={() => onReact(post.id, type)}
                  style={{
                    display: "flex", alignItems: "center", gap: 3,
                    padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer",
                    background: active ? (type === "fire" ? "rgba(212,160,23,0.18)" : type === "accurate" ? "rgba(93,202,165,0.14)" : "rgba(226,75,74,0.14)") : "rgba(255,255,255,0.04)",
                    color: active ? (type === "fire" ? GOLD : type === "accurate" ? GREEN : RED) : "var(--cj-text-muted)",
                    border: `1px solid ${active ? (type === "fire" ? GOLD : type === "accurate" ? GREEN : RED) : "rgba(255,255,255,0.07)"}`,
                  }}
                >
                  <span>{icons[type]}</span>
                  {n > 0 && <span>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Post Modal ────────────────────────────────────────────────────────────────
const QUICK_PAIRS = ["XAUUSD", "EURUSD", "BTCUSD", "GBPUSD", "USDJPY", "NAS100"];
const TIMEFRAMES  = ["15M", "1H", "4H", "Daily", "Weekly"];

function PostModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [pair, setPair]         = useState("");
  const [dir, setDir]           = useState<"BUY" | "SELL">("BUY");
  const [entryFrom, setEF]      = useState("");
  const [entryTo, setET]        = useState("");
  const [sl, setSl]             = useState("");
  const [tp, setTp]             = useState("");
  const [tf, setTf]             = useState("4H");
  const [writeUp, setWriteUp]   = useState("");
  const [submitting, setSubmit] = useState(false);
  const [err, setErr]           = useState("");

  async function submit() {
    if (!pair.trim()) { setErr("Pair is required"); return; }
    setSubmit(true); setErr("");
    const res = await fetch("/api/alpha/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair, direction: dir,
        entry_from:  entryFrom ? parseFloat(entryFrom) : undefined,
        entry_to:    entryTo   ? parseFloat(entryTo)   : undefined,
        stop_loss:   sl        ? parseFloat(sl)         : undefined,
        take_profit: tp        ? parseFloat(tp)         : undefined,
        timeframe: tf, write_up: writeUp,
      }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setErr(data.error ?? "Failed to post"); setSubmit(false); return; }
    onSuccess();
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)", border: BORDER, borderRadius: 8,
    padding: "9px 12px", fontSize: 13, color: "var(--cj-text)", outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 520, background: "var(--cj-surface)", borderRadius: 16,
        border: `1px solid ${GOLD}`, borderTop: `3px solid ${GOLD}`,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: BORDER }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--cj-text)" }}>Post Analysis</div>
            <div style={{ fontSize: 10, color: "var(--cj-text-muted)", marginTop: 2 }}>Backed by your NIRI performance history</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--cj-text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Pair */}
          <div>
            <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>PAIR</label>
            <input value={pair} onChange={e => setPair(e.target.value.toUpperCase())} placeholder="e.g. XAUUSD" style={inp} />
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" as const }}>
              {QUICK_PAIRS.map(p => (
                <button key={p} onClick={() => setPair(p)} style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                  background: pair === p ? "rgba(212,160,23,0.15)" : "rgba(255,255,255,0.05)",
                  color: pair === p ? GOLD : "var(--cj-text-muted)",
                  border: `1px solid ${pair === p ? GOLD : "rgba(255,255,255,0.08)"}`,
                }}>{p}</button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div>
            <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>DIRECTION</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["BUY", "SELL"] as const).map(d => (
                <button key={d} onClick={() => setDir(d)} style={{
                  flex: 1, padding: "10px", fontWeight: 700, fontSize: 13, borderRadius: 8, cursor: "pointer",
                  background: dir === d ? (d === "BUY" ? "rgba(93,202,165,0.18)" : "rgba(226,75,74,0.18)") : "rgba(255,255,255,0.04)",
                  color: dir === d ? (d === "BUY" ? GREEN : RED) : "var(--cj-text-muted)",
                  border: `1px solid ${dir === d ? (d === "BUY" ? GREEN : RED) : "rgba(255,255,255,0.08)"}`,
                }}>{d}</button>
              ))}
            </div>
          </div>

          {/* Entry zone */}
          <div>
            <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>ENTRY ZONE</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input value={entryFrom} onChange={e => setEF(e.target.value)} placeholder="From" style={inp} type="number" step="any" />
              <input value={entryTo}   onChange={e => setET(e.target.value)} placeholder="To"   style={inp} type="number" step="any" />
            </div>
          </div>

          {/* SL / TP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>STOP LOSS</label>
              <input value={sl} onChange={e => setSl(e.target.value)} placeholder="Price" style={{ ...inp, color: RED }} type="number" step="any" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>TAKE PROFIT</label>
              <input value={tp} onChange={e => setTp(e.target.value)} placeholder="Price" style={{ ...inp, color: GREEN }} type="number" step="any" />
            </div>
          </div>

          {/* Timeframe */}
          <div>
            <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>TIMEFRAME</label>
            <div style={{ display: "flex", gap: 6 }}>
              {TIMEFRAMES.map(t => (
                <button key={t} onClick={() => setTf(t)} style={{
                  fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                  background: tf === t ? "rgba(212,160,23,0.15)" : "rgba(255,255,255,0.04)",
                  color: tf === t ? GOLD : "var(--cj-text-muted)",
                  border: `1px solid ${tf === t ? GOLD : "rgba(255,255,255,0.08)"}`,
                }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Write-up */}
          <div>
            <label style={{ fontSize: 10, color: "var(--cj-text-muted)", display: "block", marginBottom: 5 }}>
              WRITE-UP <span style={{ color: writeUp.length > 450 ? RED : "#52525b" }}>({writeUp.length}/500)</span>
            </label>
            <textarea
              value={writeUp} onChange={e => setWriteUp(e.target.value.slice(0, 500))}
              placeholder="Your analysis rationale, key levels, confluence factors..."
              rows={4}
              style={{ ...inp, resize: "vertical" as const, fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </div>

          {/* Lock warning */}
          <div style={{ background: "rgba(212,160,23,0.06)", border: "1px solid rgba(212,160,23,0.2)", borderRadius: 8, padding: "9px 12px", fontSize: 11, color: "#a1a1aa" }}>
            ⚠ Once posted, entry/SL/TP cannot be edited. This analysis will be locked and timestamped.
          </div>

          {err && <div style={{ fontSize: 12, color: RED }}>{err}</div>}

          <button
            onClick={submit}
            disabled={submitting}
            style={{
              padding: "12px", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: submitting ? "not-allowed" : "pointer",
              background: submitting ? "rgba(212,160,23,0.4)" : GOLD, color: "#0A0908", border: "none",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Posting…" : "Post Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Tab = "latest" | "top" | "accurate" | "following";

export default function AlphaPage() {
  const [user,         setUser]         = useState<User | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [posts,        setPosts]        = useState<AlphaPost[]>([]);
  const [leaderboard,  setLeaderboard]  = useState<Analyst[]>([]);
  const [activeTab,    setActiveTab]    = useState<Tab>("latest");
  const [showModal,    setShowModal]    = useState(false);
  const [userPoints,   setUserPoints]   = useState(0);
  const [tradeCount,   setTradeCount]   = useState(0);
  const [followedIds,  setFollowedIds]  = useState<Set<string>>(new Set());
  const [filterPair,   setFilterPair]   = useState("");
  const [postsLoading, setPostsLoading] = useState(false);

  // Auth + initial data
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user: u }, error }) => {
      if (error || !u) { window.location.href = "/login"; return; }
      setUser(u);

      // Parallel: trade count, alpha points, follows, leaderboard
      const [tcRes, ptsRes, followRes, lbRes] = await Promise.all([
        sb.from("trades").select("*", { count: "exact", head: true }).eq("user_id", u.id),
        sb.from("alpha_points").select("points").eq("user_id", u.id).maybeSingle(),
        fetch("/api/alpha/follow"),
        fetch("/api/alpha/leaderboard"),
      ]);

      setTradeCount(tcRes.count ?? 0);
      const pts = ptsRes.data as { points?: number } | null;
      setUserPoints(pts?.points ?? 0);

      if (followRes.ok) {
        const fd = await followRes.json() as { followed?: string[] };
        setFollowedIds(new Set(fd.followed ?? []));
      }
      if (lbRes.ok) {
        const lb = await lbRes.json() as { leaderboard?: Analyst[] };
        setLeaderboard(lb.leaderboard ?? []);
      }

      setLoading(false);
    });
  }, []);

  const fetchPosts = useCallback(async (tab: Tab, pair: string) => {
    setPostsLoading(true);
    const params = new URLSearchParams({ sort: tab === "following" ? "latest" : tab });
    if (pair) params.set("pair", pair);
    if (tab === "following") params.set("following", "true");
    const res = await fetch(`/api/alpha/posts?${params.toString()}`);
    if (res.ok) {
      const d = await res.json() as { posts?: AlphaPost[] };
      setPosts(d.posts ?? []);
    }
    setPostsLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) fetchPosts(activeTab, filterPair);
  }, [activeTab, filterPair, loading, fetchPosts]);

  async function toggleFollow(analystId: string) {
    const res  = await fetch("/api/alpha/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analyst_id: analystId }) });
    const data = await res.json() as { following: boolean };
    setFollowedIds(prev => {
      const next = new Set(prev);
      data.following ? next.add(analystId) : next.delete(analystId);
      return next;
    });
    // Optimistically update leaderboard follower count
    setLeaderboard(prev => prev.map(a => a.user_id === analystId
      ? { ...a, follower_count: a.follower_count + (data.following ? 1 : -1) }
      : a
    ));
  }

  async function react(postId: string, type: "fire" | "accurate" | "wrong") {
    const res  = await fetch("/api/alpha/react", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: postId, type }) });
    const data = await res.json() as { reacted: boolean; type: string | null };
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const filtered = p.alpha_reactions.filter(r => r.user_id !== user?.id);
      const next: Reaction[] = data.reacted && data.type
        ? [...filtered, { post_id: postId, user_id: user!.id, type: data.type }]
        : filtered;
      return { ...p, alpha_reactions: next };
    }));
  }

  function filterByAnalyst(analystId: string) {
    setFilterPair("");
    // Show only this analyst's posts — fetch with user_id filter client-side
    setPosts(prev => prev.filter(p => p.user_id === analystId));
  }

  function handleLogout() { createClient().auth.signOut().then(() => { window.location.href = "/login"; }); }

  if (loading) return (
    <div style={{ height: "100dvh", background: "var(--cj-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Sidebar user={null} onSignOut={() => {}} />
      <p style={{ color: "#52525b", fontSize: 13 }}>Loading…</p>
    </div>
  );

  const canPost = tradeCount >= 20;
  const TABS: { id: Tab; label: string }[] = [
    { id: "latest",    label: "Latest" },
    { id: "top",       label: "Top Rated" },
    { id: "accurate",  label: "Most Accurate" },
    { id: "following", label: "Following" },
  ];

  return (
    <div className="md:ml-[240px] pt-14 md:pt-0 min-h-screen" style={{ background: "var(--cj-bg)" }}>
      <Sidebar user={user} onSignOut={handleLogout} />

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--cj-text)", margin: 0 }}>NIRI Alpha</h1>
            <p style={{ fontSize: 12, color: "var(--cj-text-muted)", margin: "3px 0 0" }}>Trade analysis backed by real performance history</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {userPoints > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>🏆 {userPoints} pts</span>
            )}
            <button
              onClick={() => canPost ? setShowModal(true) : null}
              title={canPost ? "Post Analysis" : `Need ${20 - tradeCount} more trades to unlock`}
              style={{
                padding: "9px 18px", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: canPost ? "pointer" : "not-allowed",
                background: canPost ? GOLD : "rgba(212,160,23,0.2)", color: canPost ? "#0A0908" : GOLD,
                border: "none", opacity: canPost ? 1 : 0.7,
              }}
            >
              + Post Analysis
            </button>
          </div>
        </div>

        {/* ── Eligibility banner ────────────────────────────────── */}
        {!canPost && (
          <div style={{ background: "rgba(212,160,23,0.08)", border: "1px solid rgba(212,160,23,0.25)", borderRadius: 10, padding: "11px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>
                You need 20+ trades to post analysis — you have {tradeCount}
              </div>
              <div style={{ fontSize: 11, color: "var(--cj-text-muted)", marginTop: 1 }}>
                Import your trading history to unlock posting.
              </div>
            </div>
          </div>
        )}

        {/* ── Leaderboard strip ─────────────────────────────────── */}
        {leaderboard.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: "var(--cj-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8 }}>
              Top Analysts
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
              {leaderboard.map((a, i) => {
                const b2 = badge(Math.round(a.accuracy_rate), Math.round(a.win_rate));
                const isFollowed = followedIds.has(a.user_id);
                return (
                  <div key={a.user_id} style={{
                    flexShrink: 0, width: 160, background: "var(--cj-surface)", border: BORDER, borderRadius: 12, padding: "12px 14px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#52525b" }}>#{i + 1}</span>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(212,160,23,0.15)", border: "1px solid rgba(212,160,23,0.35)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, color: GOLD,
                      }}>
                        {(a.display_name || "T").charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--cj-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.display_name || "Analyst"}
                      </span>
                      {b2 && <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, border: `1px solid ${b2.color}`, color: b2.color }}>{b2.label}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--cj-text-muted)", marginBottom: 3 }}>
                      WR: <strong style={{ color: GREEN }}>{Math.round(a.win_rate)}%</strong>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--cj-text-muted)", marginBottom: 3 }}>
                      Alpha: <strong style={{ color: GOLD }}>{Math.round(a.accuracy_rate)}%</strong>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--cj-text-muted)", marginBottom: 10 }}>
                      Score: <strong style={{ color: "var(--cj-text)" }}>{a.score.toFixed(1)}</strong>
                    </div>
                    {user && a.user_id !== user.id && (
                      <button
                        onClick={() => toggleFollow(a.user_id)}
                        style={{
                          width: "100%", padding: "4px 0", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                          background: isFollowed ? "rgba(212,160,23,0.12)" : "transparent",
                          color: isFollowed ? GOLD : "var(--cj-text-muted)",
                          border: `1px solid ${isFollowed ? GOLD : "rgba(255,255,255,0.1)"}`,
                        }}
                      >
                        {isFollowed ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Tabs + filter ─────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12, borderBottom: BORDER, paddingBottom: 2 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${GOLD}` : "2px solid transparent",
                color: activeTab === tab.id ? GOLD : "var(--cj-text-muted)",
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto" }}>
            <input
              value={filterPair}
              onChange={e => setFilterPair(e.target.value.toUpperCase())}
              placeholder="Filter pair…"
              style={{
                background: "rgba(255,255,255,0.04)", border: BORDER, borderRadius: 7,
                padding: "5px 10px", fontSize: 11, color: "var(--cj-text)", outline: "none", width: 110,
              }}
            />
          </div>
        </div>

        {/* ── Feed ──────────────────────────────────────────────── */}
        {postsLoading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#52525b", fontSize: 13 }}>Loading…</div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cj-text)", marginBottom: 4 }}>No posts yet</div>
            <div style={{ fontSize: 12, color: "var(--cj-text-muted)" }}>
              {activeTab === "following" ? "Follow analysts to see their posts here." : "Be the first to post analysis."}
            </div>
          </div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              userId={user!.id}
              followed={followedIds.has(post.user_id)}
              onFollow={toggleFollow}
              onReact={react}
              onFilterAnalyst={filterByAnalyst}
            />
          ))
        )}
      </div>

      {/* ── Post Modal ────────────────────────────────────────── */}
      {showModal && (
        <PostModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            setUserPoints(p => p + 5);
            fetchPosts("latest", "");
            setActiveTab("latest");
          }}
        />
      )}
    </div>
  );
}
