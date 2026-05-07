"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const saved = localStorage.getItem("cj_theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("cj_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-zinc-700
                 hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors"
    >
      {theme === "dark" ? "☀︎" : "☽"}
    </button>
  );
}
