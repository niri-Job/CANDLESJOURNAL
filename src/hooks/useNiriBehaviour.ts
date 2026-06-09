"use client";

import { useEffect, useRef } from "react";

export interface TradeForNiri {
  id:         string;
  pair:       string;
  direction:  "BUY" | "SELL";
  pnl:        number;
  lot:        number;
  date:       string;
  sl:         number | null;
  tp:         number | null;
  entry:      number;
  exit_price: number;
  session?:   string | null;
  created_at?: string;
}

export interface NiriAlert {
  type:    string;
  message: string;
  kind?:   "normal" | "ai";
}

const DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour

function readDebounces(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("niri_alert_times") ?? "{}"); }
  catch { return {}; }
}

function isDebounced(type: string): boolean {
  const d = readDebounces();
  return !!d[type] && Date.now() - d[type] < DEBOUNCE_MS;
}

function stamp(type: string) {
  const d = readDebounces();
  d[type] = Date.now();
  localStorage.setItem("niri_alert_times", JSON.stringify(d));
}

export function useNiriBehaviour(
  trades: TradeForNiri[],
  onAlert: (a: NiriAlert) => void,
) {
  const prevLen  = useRef(0);
  const session  = useRef<Set<string>>(new Set());
  const alertRef = useRef(onAlert);
  alertRef.current = onAlert;

  useEffect(() => {
    console.log("[NIRI] behaviour check — trades:", trades.length, "prev:", prevLen.current);
    if (trades.length === 0) return;
    prevLen.current = trades.length;

    const sorted = [...trades].sort((a, b) => {
      const at = a.created_at ?? a.date;
      const bt = b.created_at ?? b.date;
      return at < bt ? -1 : at > bt ? 1 : 0;
    });

    const today       = sorted[sorted.length - 1].date;
    const todayTrades = sorted.filter((t) => t.date === today);

    function fire(type: string, msg: string) {
      const inSession = session.current.has(type);
      const debounced = isDebounced(type);
      console.log(`[NIRI] fire candidate: ${type} | session=${inSession} | debounced=${debounced}`);
      if (inSession || debounced) return;
      session.current.add(type);
      stamp(type);
      alertRef.current({ type, message: msg });
    }

    // ── Revenge trading ────────────────────────────────────────────────────────
    if (sorted.length >= 4) {
      const [a, b, c, d] = sorted.slice(-4);
      if (a.pnl < 0 && b.pnl < 0 && c.pnl < 0 && d.date === c.date) {
        fire("revenge_trading",
          "Hey, I'm a little worried about you right now. Three losses in a row, and you jumped straight back in? That's your emotions driving, not your plan. Step away for 15 minutes. Take a breath. I'll be right here when you're ready.");
      }
    }

    // ── Overtrading ────────────────────────────────────────────────────────────
    if (todayTrades.length >= 6) {
      fire("overtrading",
        "I need to say something, and I hope you hear it with the care it's meant. You've opened six trades today — and that's not a strategy anymore, that's noise. The best traders know when NOT to trade. Is now really the right moment?");
    }

    // ── Ignoring SL ───────────────────────────────────────────────────────────
    const recentLoss = [...sorted].reverse().find((t) => t.pnl < 0 && t.sl != null);
    if (recentLoss?.sl != null) {
      const slDist  = Math.abs(recentLoss.sl - recentLoss.entry);
      const actDist = Math.abs(recentLoss.exit_price - recentLoss.entry);
      if (slDist > 0 && actDist > slDist * 1.5) {
        fire("ignoring_sl",
          "I saw that. You moved your stop loss, didn't you? I get it — it's hard to let a trade go. But those rules you set? You wrote them when your head was clear. Trust that version of yourself.");
      }
    }

    // ── Greed sizing ──────────────────────────────────────────────────────────
    if (sorted.length >= 4) {
      const [w1, w2, w3, next] = sorted.slice(-4);
      if (w1.pnl > 0 && w2.pnl > 0 && w3.pnl > 0 && next.lot > w3.lot * 1.5) {
        fire("greed",
          "I love that you're winning — genuinely. But sizing up 50% after three wins isn't confidence, it's greed wearing confidence as a costume. Stick to your plan. Protect what you've built.");
      }
    }

    // ── Win streak ────────────────────────────────────────────────────────────
    if (sorted.length >= 3 && sorted.slice(-3).every((t) => t.pnl > 0)) {
      fire("win_streak",
        "YES. That's three in a row and I am HERE for it. You're locked in right now — this is what consistent trading looks like. Keep it exactly like this. Don't change a thing.");
    }

    // ── Best trade of the day ─────────────────────────────────────────────────
    if (todayTrades.length >= 2) {
      const best   = [...todayTrades].sort((a, b) => b.pnl - a.pnl)[0];
      const latest = sorted[sorted.length - 1];
      if (best.id === latest.id && best.pnl > 0) {
        fire("best_trade",
          "Stop for a second. That trade you just closed? That was textbook. That was YOUR edge on full display. Screenshot that setup — it's proof of what you're capable of.");
      }
    }

    // ── First green day of the week ───────────────────────────────────────────
    const dow = new Date().getDay();
    if (dow >= 1 && dow <= 5) {
      const todayPnl = todayTrades.reduce((s, t) => s + t.pnl, 0);
      if (todayPnl > 0) {
        const mon = new Date();
        mon.setDate(mon.getDate() - dow + 1);
        const monStr   = mon.toISOString().slice(0, 10);
        const prevDays = sorted.filter((t) => t.date >= monStr && t.date < today);
        if (prevDays.length > 0 && prevDays.reduce((s, t) => s + t.pnl, 0) <= 0) {
          fire("first_green_day",
            "First green day of the week. After everything this week threw at you, you held your ground and came out ahead. That's not luck — that's character. Let's keep this going.");
        }
      }
    }

    // ── Closed too early (profitable trade, exit < 70% of TP distance) ────────
    if (sorted.length >= 1) {
      const recent = sorted[sorted.length - 1];
      if (recent.tp != null && recent.pnl > 0) {
        const isBuy  = recent.direction === "BUY";
        const tpDist = isBuy
          ? recent.tp - recent.entry
          : recent.entry - recent.tp;
        const exitDist = isBuy
          ? recent.exit_price - recent.entry
          : recent.entry - recent.exit_price;
        if (tpDist > 0 && exitDist > 0 && exitDist < tpDist * 0.7) {
          fire("closed_early",
            "I see you keep closing before your TP. I know it feels safer — but you planned that target for a reason. Let your trades breathe. Trust the plan you made with a clear head.");
        }
      }
    }

    // ── Best pair (needs 10+ trades, pair with >5 trades and highest win rate) ─
    if (sorted.length >= 10) {
      const pairMap: Record<string, { wins: number; total: number }> = {};
      for (const t of sorted) {
        if (!pairMap[t.pair]) pairMap[t.pair] = { wins: 0, total: 0 };
        pairMap[t.pair].total++;
        if (t.pnl > 0) pairMap[t.pair].wins++;
      }
      const best = Object.entries(pairMap)
        .filter(([, s]) => s.total >= 5)
        .sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total)[0];
      if (best) {
        const wr = Math.round((best[1].wins / best[1].total) * 100);
        fire("best_pair", `${best[0]} is where you shine — ${wr}% win rate doesn't lie. So I have to ask: why aren't you leaning into your strength more?`);
      }
    }

    // ── Best session (needs 10+ trades, at least 2 different sessions) ────────
    if (sorted.length >= 10) {
      const sessionPnl: Record<string, number> = {};
      for (const t of sorted) {
        const sess = t.session?.trim() || "Unknown";
        sessionPnl[sess] = (sessionPnl[sess] ?? 0) + t.pnl;
      }
      const sessions = Object.entries(sessionPnl).sort((a, b) => b[1] - a[1]);
      if (sessions.length >= 2 && sessions[0][0] !== "Unknown") {
        fire("best_session",
          `Your ${sessions[0][0]} session is where the real you shows up. The numbers don't lie. Maybe it's worth asking why the other sessions feel different.`);
      }
    }
  }, [trades]);
}
