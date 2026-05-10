"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function NotificationBell() {
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [mounted,       setMounted]       = useState(false);
  const [dropPos,       setDropPos]       = useState({ top: 0, left: 0 });
  const btnRef      = useRef<HTMLButtonElement>(null);
  const dropRef     = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const loadNotifications = useCallback(async () => {
    const r = await fetch("/api/notifications");
    if (!r.ok) return;
    const d = (await r.json()) as { notifications: Notification[]; unread_count: number };
    setNotifications(d.notifications ?? []);
    setUnreadCount(d.unread_count ?? 0);
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !dropRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function toggleOpen() {
    if (open) { setOpen(false); return; }

    // Position dropdown below the button
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropW = 320;
      const left  = Math.min(rect.left, window.innerWidth - dropW - 8);
      setDropPos({ top: rect.bottom + 8, left: Math.max(8, left) });
    }
    setOpen(true);

    // Mark all as read when opening
    if (unreadCount > 0) {
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      await fetch("/api/notifications", { method: "POST" });
    }
  }

  const dropdown = open && mounted ? createPortal(
    <div
      ref={dropRef}
      style={{
        position:   "fixed",
        top:        dropPos.top,
        left:       dropPos.left,
        width:      320,
        zIndex:     200,
        background: "var(--cj-surface)",
        border:     "1px solid var(--cj-border)",
        borderRadius: 12,
        boxShadow:  "0 20px 60px rgba(0,0,0,0.5)",
        overflow:   "hidden",
      }}
    >
      <div
        style={{
          padding:      "10px 16px",
          borderBottom: "1px solid var(--cj-border)",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cj-gold-muted)" }}>
          Notifications
        </span>
        {unreadCount === 0 && notifications.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--cj-text-muted)" }}>All caught up</span>
        )}
      </div>

      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 12, color: "var(--cj-text-muted)" }}>
            No notifications
          </div>
        ) : notifications.map((n, i) => (
          <div
            key={n.id}
            style={{
              padding:      "12px 16px",
              borderBottom: i < notifications.length - 1 ? "1px solid var(--cj-border)" : undefined,
              position:     "relative",
            }}
          >
            {!n.read && (
              <span style={{
                position: "absolute", left: 6, top: 18,
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--cj-gold)",
              }} />
            )}
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, paddingLeft: 12, color: "var(--cj-text)" }}>
              {n.title}
            </p>
            <p style={{ fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", paddingLeft: 12, color: "var(--cj-text-muted)" }}>
              {n.message}
            </p>
            <p style={{ fontSize: 10, marginTop: 6, paddingLeft: 12, color: "var(--cj-text-muted)", opacity: 0.6 }}>
              {fmt(n.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        title="Notifications"
        style={{
          width: 32, height: 32,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 8,
          border: "1px solid var(--cj-border)",
          background: "transparent",
          cursor: "pointer",
          position: "relative",
          color: "var(--cj-text-muted)",
          transition: "border-color 0.15s, color 0.15s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--cj-text)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--cj-text-muted)"; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 4, right: 4,
            width: 8, height: 8, borderRadius: "50%",
            background: "#f43f5e",
            border: "1.5px solid var(--cj-bg)",
          }} />
        )}
      </button>
      {dropdown}
    </>
  );
}
