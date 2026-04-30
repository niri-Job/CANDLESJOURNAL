"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const THEMES = [
  { key: "dark",     icon: "🌑", label: "Dark Gold" },
  { key: "light",    icon: "☀️",  label: "Light"     },
  { key: "midnight", icon: "🌙", label: "Midnight"  },
] as const;

type Theme = (typeof THEMES)[number]["key"];

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

export function ThemeSwitcher({ user }: { user: User | null }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("cj_theme") as Theme | null) ?? "dark";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  async function selectTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("cj_theme", next);
    applyTheme(next);

    if (user) {
      const supabase = createClient();
      await supabase
        .from("user_profiles")
        .upsert({ user_id: user.id, theme: next }, { onConflict: "user_id" });
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {THEMES.map(({ key, icon, label }) => (
        <button
          key={key}
          title={label}
          onClick={() => selectTheme(key)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm
                      transition-all border
                      ${theme === key
                        ? "border-[var(--cj-gold)] bg-[var(--cj-gold-glow)] scale-110"
                        : "border-zinc-700 hover:border-zinc-600 bg-[var(--cj-raised)] hover:scale-105"
                      }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
