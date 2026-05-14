import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL = "@niritoday";

const FOCUS_PAIRS = [
  {
    symbol: "GC=F",      // Gold Futures — more reliable than XAUUSD=X
    fallback: "XAUUSD=X",
    label: "XAUUSD",
    decimals: 2,
    sanity: { min: 1800, max: 6000 },
  },
  {
    symbol: "EURUSD=X",
    fallback: null,
    label: "EURUSD",
    decimals: 5,
    sanity: { min: 0.80, max: 1.80 },
  },
  {
    symbol: "GBPUSD=X",
    fallback: null,
    label: "GBPUSD",
    decimals: 5,
    sanity: { min: 0.90, max: 2.00 },
  },
];

function calcEma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

async function fetchYahooCloses(symbol: string): Promise<number[]> {
  // Try query2 first (fresher cache), fall back to query1
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=5d`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NIRI/1.0)" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn(`[daily-setup] Yahoo ${host} ${symbol}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json() as {
        chart?: { result?: { meta?: { regularMarketPrice?: number }; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
      };
      const result = json?.chart?.result?.[0];
      const raw = result?.indicators?.quote?.[0]?.close;
      if (!raw?.length) {
        console.warn(`[daily-setup] Yahoo ${host} ${symbol}: empty close array`);
        continue;
      }
      const closes = raw.filter((c): c is number => c !== null && !isNaN(c));
      if (closes.length < 5) {
        console.warn(`[daily-setup] Yahoo ${host} ${symbol}: only ${closes.length} closes`);
        continue;
      }
      // Log so we can see what the API actually returned
      const last = closes[closes.length - 1];
      const regMkt = result?.meta?.regularMarketPrice;
      console.log(`[daily-setup] Yahoo ${host} ${symbol}: last_close=${last} regularMarketPrice=${regMkt} closes=${closes.length}`);
      return closes;
    } catch (e) {
      console.warn(`[daily-setup] Yahoo ${host} ${symbol} fetch error:`, e);
    }
  }
  throw new Error(`Yahoo failed for ${symbol} on both hosts`);
}

// Frankfurter fallback for forex pairs (no gold support)
async function fetchFrankfurterRate(base: string, quote: string): Promise<number> {
  const url = `https://api.frankfurter.app/latest?base=${base}&symbols=${quote}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`Frankfurter ${base}/${quote}: HTTP ${res.status}`);
  const json = await res.json() as { rates?: Record<string, number> };
  const rate = json?.rates?.[quote];
  if (!rate) throw new Error(`Frankfurter ${base}/${quote}: no rate`);
  console.log(`[daily-setup] Frankfurter ${base}/${quote}: ${rate}`);
  return rate;
}

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

  // Fetch market data for the 3 focus pairs
  const pairData: { label: string; price: number; changePct: number; rsi: number; trend: string; decimals: number }[] = [];
  for (const p of FOCUS_PAIRS) {
    try {
      // ── Step 1: fetch closes from Yahoo (primary + fallback symbol) ──────────
      let closes: number[] | null = null;

      for (const sym of [p.symbol, ...(p.fallback ? [p.fallback] : [])]) {
        try {
          const c = await fetchYahooCloses(sym);
          if (c.length >= 20) { closes = c; break; }
          console.warn(`[daily-setup] ${sym}: only ${c.length} closes, skipping`);
        } catch (e) {
          console.warn(`[daily-setup] ${sym} failed:`, e);
        }
      }

      // ── Step 2: Frankfurter fallback for forex (not gold) ───────────────────
      if (!closes && p.label !== "XAUUSD") {
        const [base, quote] = [p.label.slice(0, 3), p.label.slice(3)];
        try {
          const rate = await fetchFrankfurterRate(base, quote);
          // Frankfurter gives only the current rate; build a minimal closes array
          // so downstream RSI/EMA still runs (flat series = RSI 50, no trend bias)
          closes = Array(30).fill(rate);
        } catch (e) {
          console.warn(`[daily-setup] Frankfurter fallback for ${p.label} failed:`, e);
        }
      }

      if (!closes) {
        console.error(`[daily-setup] ${p.label}: all sources failed, skipping pair`);
        continue;
      }

      const price = closes[closes.length - 1];

      // ── Step 3: sanity check ─────────────────────────────────────────────────
      if (p.sanity && (price < p.sanity.min || price > p.sanity.max)) {
        console.error(
          `[daily-setup] ${p.label}: price ${price} outside sane range ` +
          `[${p.sanity.min}, ${p.sanity.max}] — skipping to avoid sending bad data`
        );
        continue;
      }

      console.log(`[daily-setup] ${p.label}: using price=${price.toFixed(p.decimals)}`);

      const prev = closes.length > 24 ? closes[closes.length - 25] : closes[0];
      const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
      const rsi = calcRsi(closes);
      const ema20 = calcEma(closes, 20);
      const trend = price > ema20 ? "Bullish" : "Bearish";
      pairData.push({ label: p.label, price, changePct, rsi, trend, decimals: p.decimals });
    } catch (e) {
      console.error(`[daily-setup] ${p.label} unexpected error:`, e);
    }
  }

  if (pairData.length === 0) {
    return NextResponse.json({ error: "Could not fetch market data" }, { status: 502 });
  }

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dataText = pairData.map(p =>
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

Live market data:
${dataText}

Write a concise daily market setup message for Telegram. Format it EXACTLY like this (use plain text, no markdown, no asterisks):

1. One sentence market bias for each pair (XAUUSD, EURUSD, GBPUSD) based on the real data above
2. One actionable key level to watch per pair (derived from the price shown)
3. One short motivational trading tip (max 1 sentence)

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
