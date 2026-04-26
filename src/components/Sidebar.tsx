"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import type { User } from "@supabase/supabase-js";

const NAV_ITEMS = [
  { href: "/",         label: "Dashboard", icon: "📊" },
  { href: "/market",   label: "Market",    icon: "📈" },
  { href: "/settings", label: "Settings",  icon: "⚙️" },
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                        transition-all
                        ${pathname === href
                          ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
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
      <div className="px-4 py-4 border-t border-zinc-800 space-y-3">
        {user && (
          <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={onSignOutClick}
            className="text-xs text-zinc-500 hover:text-rose-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Desktop sidebar (fixed, 240 px) ─────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-[240px]
                        bg-[var(--cj-surface)] border-r border-zinc-800 z-20">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-zinc-800 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600
                          flex items-center justify-center text-sm font-bold text-white shrink-0">
            CJ
          </div>
          <span className="font-semibold text-sm tracking-tight">CandlesJournal</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>

        <BottomSection onSignOutClick={onSignOut} />
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between
                      px-4 h-14 bg-[var(--cj-surface)] border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-violet-600
                          flex items-center justify-center text-xs font-bold text-white shrink-0">
            CJ
          </div>
          <span className="font-semibold text-sm tracking-tight">CandlesJournal</span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-zinc-700
                     text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-all"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* ── Mobile overlay sidebar ────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <aside
            className="absolute inset-y-0 left-0 w-[240px] flex flex-col
                       bg-[var(--cj-surface)] border-r border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-5 h-14 border-b border-zinc-800 shrink-0">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-violet-600
                              flex items-center justify-center text-xs font-bold text-white shrink-0">
                CJ
              </div>
              <span className="font-semibold text-sm tracking-tight">CandlesJournal</span>
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
