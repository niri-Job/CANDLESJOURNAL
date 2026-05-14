import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";
import { MARKET_PAIRS, fetchPairIndicators } from "@/lib/marketPrices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL = "@niritoday";

// The 3 pairs we include in the daily Telegram message
const TELEGRAM_PAIRS = MARKET_PAIRS.filter(p =>
  ["EURUSD", "GBPUSD", "XAUUSD"].includes(p.label)
);

// Sanity bounds — if the fetched price lands outside these, skip the pair
const SANITY: Record<string, { min: number; max: number }> = {
  XAUUSD: { min: 1800, max: 6000 },
  EURUSD: { min: 0.80, max: 1.80 },
  GBPUSD: { min: 0.90, max: 2.00 },
};

// Day-of-week content rotation (0=Sun, 1=Mon, …, 6=Sat)
const DAY_CONFIG: Record<number, { title: string; prompt: string }> = {
  0: { // Sunday
    title: "Weekend Mindset Reset",
    prompt: "Write a short weekend trading mindset piece. Encourage traders to review their week, rest, and prepare mentally for the week ahead. Blend in 1-2 sentences of market context for the pairs listed. Keep it motivating and grounded.",
  },
  1: { // Monday
    title: "Why Traders Lose Money",
    prompt: "Write a concise educational piece on the most common reason traders lose money — focus on one specific psychological or technical mistake (e.g. revenge trading, ignoring stop losses, overleverage). Relate it briefly to the current market conditions for the pairs listed. End with one actionable tip for the week.",
  },
  2: { // Tuesday
    title: "Daily Market Setup",
    prompt: "Write a concise daily market setup covering ONLY the pairs listed. For each pair: one sentence bias based on the real data, one key level to watch (derived from the actual price shown). End with one short trading tip. Stay grounded in the numbers — no invention.",
  },
  3: { // Wednesday
    title: "NIRI Feature Spotlight",
    prompt: "Write a short promotional message highlighting a feature of the NIRI trading journal app (niri.live). Rotate through features: trade journaling, performance analytics, market intelligence, or EA sync with MT5. Make it feel natural and useful, not salesy. Include 1-2 sentences of market context for the pairs listed.",
  },
  4: { // Thursday
    title: "Trading Psychology",
    prompt: "Write a short trading psychology insight — pick one concept (e.g. FOMO, discipline, patience, process over outcome, detachment from results). Keep it practical and relatable to forex traders. Blend in a sentence or two about what the current market conditions demand psychologically.",
  },
  5: { // Friday
    title: "Week Wrap & Levels to Watch",
    prompt: "Write a brief end-of-week market wrap. Summarise the week's movement for the pairs listed based on their price change data. Highlight one key level to watch going into next week for each pair. End with a reminder to review trades and journal the week.",
  },
  6: { // Saturday
    title: "Weekend Analysis",
    prompt: "Write a short weekend market analysis for the pairs listed. Cover each pair's week-end position relative to key EMAs (reference the trend direction given). Give traders something to think about and prepare for next week. Keep it analytical but accessible.",
  },
};

// ── Economic calendar ─────────────────────────────────────────────────────────

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
}

async function fetchEconomicCalendar(todayStr: string): Promise<string> {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);
    const events: CalendarEvent[] = await res.json();

    // Filter to today's events
    const todays = events.filter(e => e.date === todayStr);

    // Prefer HIGH impact; fall back to MEDIUM; fall back to message
    let selected = todays.filter(e => e.impact === "High");
    if (selected.length === 0) selected = todays.filter(e => e.impact === "Medium");
    if (selected.length === 0) {
      return "No major events today — good day to focus on execution.";
    }

    return selected.slice(0, 6).map(e => {
      const time  = e.time || "All Day";
      const fc    = e.forecast  ? `Forecast: ${e.forecast}` : "";
      const prev  = e.previous  ? `Prev: ${e.previous}` : "";
      const meta  = [fc, prev].filter(Boolean).join(" | ");
      return `• ${e.country} — ${e.title} (${time})${meta ? "\n  " + meta : ""}`;
    }).join("\n");
  } catch (err) {
    console.error("[daily-setup] calendar fetch failed:", err);
    return "Calendar unavailable — check ForexFactory for today's events.";
  }
}

// ── Telegram send ─────────────────────────────────────────────────────────────

async function sendTelegram(token: string, chatId: string | number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Route handler ─────────────────────────────────────────────────────────────

// Called by admin UI (requires admin cookie) or by Vercel cron (passes chat_id in body)
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 503 });
  }

  // Parse body first to check if this is a webhook-triggered call (has chat_id)
  let body: { chat_id?: string | number } = {};
  try { body = await request.json(); } catch { /* no body */ }

  const isWebhookCall = body.chat_id !== undefined;

  // Admin-triggered calls must pass admin cookie auth
  if (!isWebhookCall) {
    if (!await verifyAdminCookie()) return adminUnauthorized();
  }

  const chatId: string | number = body.chat_id ?? CHANNEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  // ── Market data ──────────────────────────────────────────────────────────────
  const pairData: { label: string; price: number; changePct: number; rsi: number; trend: string; decimals: number }[] = [];
  for (const p of TELEGRAM_PAIRS) {
    const ind = await fetchPairIndicators(p);
    if (!ind) {
      console.error(`[daily-setup] ${p.label}: fetchPairIndicators returned null, skipping`);
      continue;
    }

    const bounds = SANITY[p.label];
    if (bounds && (ind.price < bounds.min || ind.price > bounds.max)) {
      console.error(
        `[daily-setup] ${p.label}: price ${ind.price} outside sane range ` +
        `[${bounds.min}, ${bounds.max}] — skipping`
      );
      continue;
    }

    console.log(`[daily-setup] ${p.label}: price=${ind.price.toFixed(p.decimals)} changePct=${ind.dailyChangePct.toFixed(2)}% rsi=${ind.rsi} trend=${ind.trend}`);
    pairData.push({
      label:     p.label,
      price:     ind.price,
      changePct: ind.dailyChangePct,
      rsi:       ind.rsi,
      trend:     ind.trend.charAt(0) + ind.trend.slice(1).toLowerCase(),
      decimals:  p.decimals,
    });
  }

  if (pairData.length === 0) {
    return NextResponse.json({ error: "Could not fetch market data" }, { status: 502 });
  }

  // ── Day config ───────────────────────────────────────────────────────────────
  const now       = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const dayConfig = DAY_CONFIG[dayOfWeek] ?? DAY_CONFIG[2]; // fallback to Tuesday

  const today = now.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // YYYY-MM-DD in UTC for calendar matching
  const todayStr = now.toISOString().split("T")[0];

  // ── Economic calendar ────────────────────────────────────────────────────────
  const calendarSection = await fetchEconomicCalendar(todayStr);

  // ── AI analysis ──────────────────────────────────────────────────────────────
  const pairLabels = pairData.map(p => p.label).join(", ");
  const dataText   = pairData.map(p =>
    `${p.label}: Price ${p.price.toFixed(p.decimals)} | Change ${p.changePct >= 0 ? "+" : ""}${p.changePct.toFixed(2)}% | RSI ${p.rsi} | Trend ${p.trend}`
  ).join("\n");

  const client = new Anthropic();
  const aiRes = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `You are a forex analyst writing for a Telegram trading channel.
Today is ${today}.

Live market data (ONLY these pairs — do NOT invent data for any other pair):
${dataText}

Task: ${dayConfig.prompt}

RULES:
- ONLY analyse ${pairLabels}. Do NOT mention any pair not listed above.
- Use plain text only — no asterisks, no markdown, no bullet symbols.
- Keep total length under 180 words.
- Traders read this on their phone — keep it tight.`,
    }],
  });

  const aiText = aiRes.content[0].type === "text" ? aiRes.content[0].text : "";

  // ── Build message ─────────────────────────────────────────────────────────────
  const priceLines = pairData.map(p => {
    const arrow = p.changePct >= 0 ? "▲" : "▼";
    const sign  = p.changePct >= 0 ? "+" : "";
    return `${p.label}: ${p.price.toFixed(p.decimals)} ${arrow} ${sign}${p.changePct.toFixed(2)}%`;
  }).join("\n");

  const message = [
    `📊 <b>NIRI Daily Post</b>`,
    `📅 ${today}`,
    `<b>${dayConfig.title}</b>`,
    ``,
    `<b>Live Prices</b>`,
    priceLines,
    ``,
    `<b>Analysis</b>`,
    aiText.trim(),
    ``,
    `📰 <b>Economic Calendar</b>`,
    calendarSection,
    ``,
    `—`,
    `<a href="https://niri.live">niri.live</a> · <a href="https://t.me/niritoday">@niritoday</a>`,
  ].join("\n");

  try {
    await sendTelegram(token, chatId, message);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[telegram/daily-setup] send failed:", detail);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true, chat_id: chatId, pairs: pairData.map(p => p.label), day: dayConfig.title });
}
