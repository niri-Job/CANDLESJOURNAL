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

// Called by admin UI (requires admin cookie) or by webhook (passes chat_id in body)
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

  // Fetch market data using the exact same source as /api/intelligence
  const pairData: { label: string; price: number; changePct: number; rsi: number; trend: string; decimals: number }[] = [];
  for (const p of TELEGRAM_PAIRS) {
    const ind = await fetchPairIndicators(p);
    if (!ind) {
      console.error(`[daily-setup] ${p.label}: fetchPairIndicators returned null, skipping`);
      continue;
    }

    // Sanity check — skip the pair rather than send a bad price
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
      trend:     ind.trend.charAt(0) + ind.trend.slice(1).toLowerCase(), // "BULLISH" → "Bullish"
      decimals:  p.decimals,
    });
  }

  if (pairData.length === 0) {
    return NextResponse.json({ error: "Could not fetch market data" }, { status: 502 });
  }

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const pairLabels = pairData.map(p => p.label).join(", ");
  const dataText   = pairData.map(p =>
    `${p.label}: Price ${p.price.toFixed(p.decimals)} | Change ${p.changePct >= 0 ? "+" : ""}${p.changePct.toFixed(2)}% | RSI ${p.rsi} | Trend ${p.trend}`
  ).join("\n");

  const client = new Anthropic();
  const aiRes = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: `You are a forex market analyst writing a daily Telegram message for traders.
Today is ${today}.

Live market data (ONLY these pairs have real data — do NOT mention or invent analysis for any other pair):
${dataText}

Write a concise daily market setup message for Telegram covering ONLY the pairs listed above (${pairLabels}). Format it EXACTLY like this (use plain text, no markdown, no asterisks):

1. One sentence market bias for each pair based on the real data above
2. One actionable key level to watch per pair (derived from the price shown)
3. One short motivational trading tip (max 1 sentence)

IMPORTANT: Only analyse ${pairLabels}. If a pair is not in the data above, do not mention it at all.
Keep it tight — traders read this on their phone. Total length: under 200 words.`,
    }],
  });

  const aiText = aiRes.content[0].type === "text" ? aiRes.content[0].text : "";

  // Build the Telegram message with HTML formatting
  const priceLines = pairData.map(p => {
    const arrow = p.changePct >= 0 ? "▲" : "▼";
    const sign  = p.changePct >= 0 ? "+" : "";
    return `${p.label}: ${p.price.toFixed(p.decimals)} ${arrow} ${sign}${p.changePct.toFixed(2)}%`;
  }).join("\n");

  const message = [
    `📊 <b>NIRI Daily Market Setup</b>`,
    `📅 ${today}`,
    ``,
    `<b>Live Prices</b>`,
    priceLines,
    ``,
    `<b>Analysis</b>`,
    aiText.trim(),
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

  return NextResponse.json({ ok: true, chat_id: chatId, pairs: pairData.map(p => p.label) });
}
