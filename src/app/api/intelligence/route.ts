import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkTrialAccess } from "@/lib/trial";

export const maxDuration = 60;

// 15-minute cache
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

// ── 10 pairs ─────────────────────────────────────────────────────────────────
const PAIRS = [
  { symbol: "EURUSD=X",  label: "EURUSD",  decimals: 5 },
  { symbol: "GBPUSD=X",  label: "GBPUSD",  decimals: 5 },
  { symbol: "USDJPY=X",  label: "USDJPY",  decimals: 3 },
  { symbol: "USDCHF=X",  label: "USDCHF",  decimals: 5 },
  { symbol: "AUDUSD=X",  label: "AUDUSD",  decimals: 5 },
  { symbol: "USDCAD=X",  label: "USDCAD",  decimals: 5 },
  { symbol: "NZDUSD=X",  label: "NZDUSD",  decimals: 5 },
  { symbol: "XAUUSD=X",  label: "XAUUSD",  decimals: 2 },
  { symbol: "^DJI",      label: "US30",    decimals: 0 },
  { symbol: "BTC-USD",   label: "BTCUSD",  decimals: 0 },
];

// ── TA helpers ────────────────────────────────────────────────────────────────

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
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

function calcMacd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 35) return { line: 0, signal: 0, hist: 0 };
  const macdLine: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const sl = closes.slice(0, i);
    macdLine.push(calcEma(sl, 12) - calcEma(sl, 26));
  }
  const line = macdLine[macdLine.length - 1];
  const signal = calcEma(macdLine, 9);
  return { line, signal, hist: line - signal };
}

function calcBbands(closes: number[], period = 20): { upper: number; mid: number; lower: number } {
  const last = closes[closes.length - 1];
  if (closes.length < period) return { upper: last, mid: last, lower: last };
  const sl = closes.slice(-period);
  const sma = sl.reduce((s, v) => s + v, 0) / period;
  const std = Math.sqrt(sl.reduce((s, v) => s + (v - sma) ** 2, 0) / period);
  return { upper: sma + 2 * std, mid: sma, lower: sma - 2 * std };
}

// ── Yahoo Finance OHLCV ────────────────────────────────────────────────────────
async function fetchCloses(yahooSymbol: string): Promise<number[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1h&range=30d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Yahoo ${yahooSymbol}: ${res.status}`);
  const json = await res.json() as {
    chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
  };
  const raw = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!raw) throw new Error(`Yahoo ${yahooSymbol}: no data`);
  return raw.filter((c): c is number => c !== null && !isNaN(c));
}

interface PairIndicators {
  label: string;
  price: number;
  dailyChangePct: number;
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macdLine: number;
  macdHist: number;
  bbUpper: number;
  bbLower: number;
  bbPct: number; // price position 0–100 within band
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
}

async function fetchPairIndicators(p: typeof PAIRS[0]): Promise<PairIndicators | null> {
  try {
    const closes = await fetchCloses(p.symbol);
    if (closes.length < 30) return null;

    const price    = closes[closes.length - 1];
    const prev24h  = closes.length > 24 ? closes[closes.length - 25] : closes[0];
    const dailyChangePct = prev24h > 0 ? ((price - prev24h) / prev24h) * 100 : 0;

    const rsi    = calcRsi(closes);
    const ema20  = calcEma(closes, 20);
    const ema50  = calcEma(closes, 50);
    const ema200 = calcEma(closes, Math.min(200, closes.length - 1));
    const macd   = calcMacd(closes);
    const bb     = calcBbands(closes);
    const bbRange = bb.upper - bb.lower;
    const bbPct  = bbRange > 0 ? Math.round(((price - bb.lower) / bbRange) * 100) : 50;

    const bullPoints = [price > ema20, price > ema50, price > ema200, macd.hist > 0, rsi > 50].filter(Boolean).length;
    const trend = bullPoints >= 4 ? "BULLISH" : bullPoints <= 1 ? "BEARISH" : "NEUTRAL";

    return {
      label: p.label, price, dailyChangePct,
      rsi, ema20, ema50, ema200,
      macdLine: macd.line, macdHist: macd.hist,
      bbUpper: bb.upper, bbLower: bb.lower, bbPct,
      trend,
    };
  } catch (e) {
    console.warn(`[intelligence] ${p.label} fetch failed:`, e);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isTest = searchParams.get("test") === "1";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Intelligence service not configured", key_present: false },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll:  (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isTest) {
    try {
      const ind = await fetchPairIndicators(PAIRS[0]);
      return NextResponse.json({ key_prefix: apiKey.slice(0, 10), status: "ok", sample: ind });
    } catch (err) {
      return NextResponse.json({ status: "fetch_failed", error: String(err) }, { status: 502 });
    }
  }

  // Serve cache for non-expired users
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    const trialExpiry = await checkTrialAccess(user.id, "market_intelligence", { consume: false });
    if (!trialExpiry.ok && trialExpiry.reason === "expired") {
      return NextResponse.json(
        { error: trialExpiry.message, trial_reason: trialExpiry.reason },
        { status: trialExpiry.httpStatus }
      );
    }
    return NextResponse.json(cached.data);
  }

  // Fetch all 10 pairs in parallel
  const results = await Promise.all(PAIRS.map(fetchPairIndicators));
  const indicators = results.filter((r): r is PairIndicators => r !== null);

  if (indicators.length < 3) {
    return NextResponse.json(
      { error: "Unable to fetch market data. Please try again shortly." },
      { status: 502 }
    );
  }

  // Trial enforcement
  const trial = await checkTrialAccess(user.id, "market_intelligence", { consume: true });
  if (!trial.ok) {
    return NextResponse.json(
      { error: trial.message, trial_reason: trial.reason },
      { status: trial.httpStatus }
    );
  }

  const client = new Anthropic();
  const today  = new Date().toISOString().split("T")[0];

  const indicatorTable = indicators.map((ind) => {
    const dp = PAIRS.find((p) => p.label === ind.label)?.decimals ?? 5;
    return [
      `${ind.label.padEnd(7)} | ${ind.trend.padEnd(7)} | Price: ${ind.price.toFixed(dp)}`,
      `  RSI(14)=${ind.rsi} | EMA20=${ind.ema20.toFixed(dp)} EMA50=${ind.ema50.toFixed(dp)} EMA200=${ind.ema200.toFixed(dp)}`,
      `  MACD line=${ind.macdLine.toFixed(6)} hist=${ind.macdHist > 0 ? "+" : ""}${ind.macdHist.toFixed(6)} | BB%=${ind.bbPct}% (upper=${ind.bbUpper.toFixed(dp)} lower=${ind.bbLower.toFixed(dp)})`,
    ].join("\n");
  }).join("\n\n");

  // Build live_prices and price_changes maps for front-end header
  const priceMap:  Record<string, number> = {};
  const changeMap: Record<string, number> = {};
  for (const ind of indicators) {
    priceMap[ind.label]  = ind.price;
    changeMap[ind.label] = parseFloat(ind.dailyChangePct.toFixed(2));
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      messages: [
        {
          role: "user",
          content: `You are a professional forex and financial market analyst. Today is ${today}.

LIVE MARKET DATA WITH TECHNICAL INDICATORS (hourly, 30-day history):

${indicatorTable}

Using the real indicator data above, identify the 5 strongest trading setups across all available pairs. For each setup:
- Entry zone must be derived from the actual current price shown
- Stop loss / take profit must be real price levels near the current price
- Confidence (1–10) should reflect indicator confluence count (how many indicators agree)
- Flag pairs where RSI > 75 or < 25 as overbought/oversold risk warnings
- Trend label is pre-computed: use it to set direction bias

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "setups": [
    {
      "pair": "EURUSD",
      "direction": "BUY",
      "setup_type": "EMA Pullback",
      "entry_zone": "1.08200 - 1.08350",
      "stop_loss": "1.07800",
      "take_profit": "1.09100",
      "confluence": [
        "Price above all 3 EMAs",
        "RSI 52 — room to run",
        "MACD histogram positive and growing",
        "BB% 58 — mid-range, not extended"
      ],
      "confidence": 7,
      "expected_move": "Targeting 1.09100 previous resistance",
      "risk_warning": null
    }
  ],
  "overview": {
    "bias": "Risk-on",
    "events": ["Fed minutes today", "NFP Friday"],
    "pairs_to_watch": ["EURUSD", "XAUUSD"],
    "pairs_to_avoid": ["USDJPY"]
  },
  "live_prices": ${JSON.stringify(priceMap)},
  "generated_at": "${new Date().toISOString()}"
}`,
        },
      ],
    });

    const raw  = response.content[0].type === "text" ? response.content[0].text : "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("[intelligence] JSON parse failed:", raw);
      throw parseErr;
    }
    // Merge server-computed change data (Claude's JSON doesn't include this)
    const enriched = { ...(data as Record<string, unknown>), price_changes: changeMap };
    cached = { data: enriched, ts: Date.now() };
    return NextResponse.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[intelligence] error:", message);
    return NextResponse.json(
      { error: "Failed to generate analysis", detail: message },
      { status: 500 }
    );
  }
}
