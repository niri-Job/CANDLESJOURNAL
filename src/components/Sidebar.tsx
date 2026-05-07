"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { UpgradeModal } from "./UpgradeModal";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )},
  { href: "/reports",      label: "Reports",      icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )},
  { href: "/chart",        label: "Chart",        icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )},
  { href: "/intelligence", label: "Intelligence", icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )},
  { href: "/calculator",   label: "Calculator",   icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="8" y1="6" x2="16" y2="6"/>
      <line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/>
      <line x1="8" y1="18" x2="12" y2="18"/>
    </svg>
  )},
  { href: "/playbook",     label: "Playbook",     icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )},
  { href: "/market",       label: "Market",       icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )},
  { href: "/referrals",    label: "Referrals",    icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  )},
  { href: "/settings",     label: "Settings",     icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )},
];

interface SidebarProps {
  user: User | null;
  onSignOut: () => void;
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const [open,         setOpen]         = useState(false);
  const [plan,         setPlan]         = useState<string>("free");
  const [collapsed,    setCollapsed]    = useState(false);
  const [upgradeOpen,  setUpgradeOpen]  = useState(false);

  // Load collapse preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("niri_sidebar_collapsed");
      if (saved === "true") setCollapsed(true);
    } catch {}
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("niri_sidebar_collapsed", String(next)); } catch {}
  }

  useEffect(() => {
    if (!user) return;
    const sb = createClient();
    sb.from("user_profiles")
      .select("subscription_status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const s = (data as { subscription_status: string | null } | null)?.subscription_status;
        if (s) setPlan(s);
      });
  }, [user?.id]);

  const isPaid = plan === "pro";
  const sidebarWidth = collapsed ? 64 : 240;

  function NavLinks({ onClick, isCollapsed }: { onClick?: () => void; isCollapsed?: boolean }) {
    return (
      <>
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClick}
              title={isCollapsed ? label : undefined}
              className={`flex items-center rounded-xl font-medium transition-all relative group
                          ${isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2.5 text-sm"}
                          ${active
                            ? isCollapsed
                              ? "bg-[var(--cj-gold-glow)] text-[var(--cj-gold)]"
                              : "bg-[var(--cj-gold-glow)] border-l-[3px] border-l-[var(--cj-gold)] text-[var(--cj-gold)] pl-[10px]"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-[var(--cj-raised)]"
                          }`}
            >
              <span className="shrink-0">{icon}</span>
              {!isCollapsed && label}
              {/* Tooltip when collapsed */}
              {isCollapsed && (
                <span className="absolute left-full ml-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                                 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none
                                 transition-opacity z-50"
                      style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)", color: "var(--cj-text)" }}>
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </>
    );
  }

  function BottomSection({ onSignOutClick, isCollapsed }: { onSignOutClick: () => void; isCollapsed?: boolean }) {
    if (isCollapsed) {
      return (
        <div className="px-2 py-3 flex flex-col items-center gap-2"
             style={{ borderTop: "1px solid var(--cj-gold-muted)" }}>
          <button
            onClick={onSignOutClick}
            title="Sign out"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-rose-400 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      );
    }
    return (
      <div className="px-4 py-4 space-y-3"
           style={{ borderTop: "1px solid var(--cj-gold-muted)" }}>
        {user && (
          <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
        )}
        <ThemeSwitcher user={user} />

        {isPaid ? (
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.3)", color: "var(--cj-gold)" }}>
              {plan.toUpperCase()}
            </span>
            <Link href="/pricing" className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              Manage
            </Link>
          </div>
        ) : (
          <button
            onClick={() => setUpgradeOpen(true)}
            className="block w-full text-center text-xs font-bold py-2 rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
            Upgrade to Pro
          </button>
        )}

        <button
          onClick={onSignOutClick}
          className="text-xs text-zinc-500 hover:text-rose-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  const Logo = ({ size = "md" }: { size?: "sm" | "md" }) => (
    <div
      className={`${size === "md" ? "w-8 h-8 text-sm" : "w-7 h-7 text-xs"} rounded-lg
                  bg-gradient-to-br from-[#F5C518] to-[#C9A227]
                  flex items-center justify-center font-bold text-[#0A0A0F] shrink-0`}
      style={{ boxShadow: "0 0 16px rgba(245,197,24,0.30)" }}
    >
      NI
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col fixed inset-y-0 left-0 z-20 overflow-hidden"
        style={{
          width: sidebarWidth,
          background: "linear-gradient(180deg, var(--cj-bg) 0%, #120D00 100%)",
          borderRight: "1px solid var(--cj-border)",
          transition: "width 0.2s ease",
        }}
      >
        {/* Gold gradient top accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-[#F5C518] via-[#C9A227] to-transparent shrink-0" />

        <div className={`flex items-center h-16 shrink-0 ${collapsed ? "justify-center px-2" : "gap-3 px-5"}`}
             style={{ borderBottom: "1px solid var(--cj-border)" }}>
          {collapsed ? (
            <button onClick={toggleCollapse} title="Expand sidebar">
              <Logo size="md" />
            </button>
          ) : (
            <>
              <Logo size="md" />
              <span className="font-semibold text-sm tracking-tight text-zinc-100 flex-1 whitespace-nowrap">NIRI</span>
              {/* Collapse toggle */}
              <button
                onClick={toggleCollapse}
                title="Collapse sidebar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
                style={{ border: "1px solid var(--cj-border)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
            </>
          )}
        </div>

        <nav className={`flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden ${collapsed ? "px-0" : "px-3"}`}>
          <NavLinks isCollapsed={collapsed} />
        </nav>

        <BottomSection onSignOutClick={onSignOut} isCollapsed={collapsed} />
      </aside>

      {/* ── Content offset div — consumed by page wrappers ───────────────── */}
      {/* Pages use md:ml-[240px]; when collapsed they'd need 64px. We handle this
          via a CSS var so pages don't need to change. */}

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 h-14"
           style={{ background: "var(--cj-bg)", borderBottom: "1px solid var(--cj-border)" }}>
        <div className="flex items-center gap-2.5">
          <Logo size="sm" />
          <span className="font-semibold text-sm tracking-tight text-zinc-100">NIRI</span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
          style={{ border: "1px solid var(--cj-border)", color: "var(--cj-text-muted)" }}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* ── Upgrade modal ────────────────────────────────────────────── */}
      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        email={user?.email}
        userId={user?.id}
        onSuccess={() => { setUpgradeOpen(false); setPlan("pro"); }}
      />

      {/* ── Mobile overlay sidebar ────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/70"
          onClick={() => setOpen(false)}
        >
          <aside
            className="absolute inset-y-0 left-0 w-[240px] flex flex-col"
            style={{ background: "var(--cj-bg)", borderRight: "1px solid var(--cj-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[2px] w-full bg-gradient-to-r from-[#F5C518] via-[#C9A227] to-transparent" />
            <div className="flex items-center gap-2.5 px-5 h-14 shrink-0"
                 style={{ borderBottom: "1px solid var(--cj-border)" }}>
              <Logo size="sm" />
              <span className="font-semibold text-sm tracking-tight text-zinc-100">NIRI</span>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NavLinks onClick={() => setOpen(false)} />
            </nav>

            <BottomSection onSignOutClick={() => { setOpen(false); onSignOut(); }} />
          </aside>
        </div>
      )}
    </>
  );
}
