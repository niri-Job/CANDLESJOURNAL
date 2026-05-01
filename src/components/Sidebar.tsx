"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { User } from "@supabase/supabase-js";

const NAV_ITEMS = [
  { href: "/",          label: "Dashboard", icon: "🏠" },
  { href: "/reports",   label: "Reports",   icon: "📊" },
  { href: "/chart",     label: "Chart",     icon: "🕯️" },
  { href: "/market",    label: "Market",    icon: "📈" },
  { href: "/referrals", label: "Referrals", icon: "🎁" },
  { href: "/settings",  label: "Settings",  icon: "⚙️" },
];

interface SidebarProps {
  user: User | null;
  onSignOut: () => void;
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function NavLinks({ onClick }: { onClick?: () => void }) {
    return (
      <>
        {NAV_ITEMS.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-base font-medium
                        transition-all
                        ${pathname === href
                          ? "bg-[var(--cj-gold-glow)] border-l-[3px] border-l-[var(--cj-gold)] text-[var(--cj-gold)] pl-[10px]"
                          : "text-zinc-400 hover:text-zinc-100 hover:bg-[var(--cj-raised)]"
                        }`}
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}
      </>
    );
  }

  function BottomSection({ onSignOutClick }: { onSignOutClick: () => void }) {
    return (
      <div className="px-4 py-4 space-y-3"
           style={{ borderTop: "1px solid var(--cj-gold-muted)" }}>
        {user && (
          <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
        )}
        <ThemeSwitcher user={user} />
        <button
          onClick={onSignOutClick}
          className="text-xs text-zinc-500 hover:text-rose-400 transition-colors mt-1"
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
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-[240px] z-20"
             style={{ background: "var(--cj-bg)", borderRight: "1px solid var(--cj-border)" }}>

        {/* Gold gradient top accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-[#F5C518] via-[#C9A227] to-transparent" />

        <div className="flex items-center gap-3 px-5 h-16 shrink-0"
             style={{ borderBottom: "1px solid var(--cj-border)" }}>
          <Logo size="md" />
          <span className="font-semibold text-sm tracking-tight text-zinc-100">NIRI</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>

        <BottomSection onSignOutClick={onSignOut} />
      </aside>

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
