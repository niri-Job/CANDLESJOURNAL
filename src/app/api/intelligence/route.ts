import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Cache for 30 min — live prices are fetched on every cache miss
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

interface LivePrices {
  EURUSD: number;
  GBPUSD: number;
  XAUUSD: number;
  fetchedAt: string;
}

async function fetchLivePrices(): Promise<LivePrices> {
  const now = new Date().toISOString();

  // Frankfurter returns the rate FROM the base TO the symbol
  // e.g. from=EUR&to=USD gives { rates: { USD: 1.0831 } } → EURUSD = 1.0831
  const [eurRes, gbpRes, goldRes] = await Promise.all([
    fetch("https://api.frankfurter.app/latest?from=EUR&to=USD", {
      signal: AbortSignal.timeout(8000),
    }),
    fetch("https://api.frankfurter.app/latest?from=GBP&to=USD", {
      signal: AbortSignal.timeout(8000),
    }),
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1m&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    }),
  ]);

  if (!eurRes.ok)  throw new Error(`Frankfurter EUR fetch failed: ${eurRes.status}`);
  if (!gbpRes.ok)  throw new Error(`Frankfurter GBP fetch failed: ${gbpRes.status}`);
  if (!goldRes.ok) throw new Error(`Yahoo Finance gold fetch failed: ${goldRes.status}`);

  const [eurJson, gbpJson, goldJson] = await Promise.all([
    eurRes.json()  as Promise<{ rates: { USD: number } }>,
    gbpRes.json()  as Promise<{ rates: { USD: number } }>,
    goldRes.json() as Promise<{ chart: { result?: { meta: { regularMarketPrice: number } }[] } }>,
  ]);

  const eurusd = eurJson?.rates?.USD;
  const gbpusd = gbpJson?.rates?.USD;
  const xauusd = goldJson?.chart?.result?.[0]?.meta?.regularMarketPrice;

  if (!eurusd || !gbpusd || !xauusd) {
    throw new Error(
      `Incomplete price data — EURUSD:${eurusd} GBPUSD:${gbpusd} XAUUSD:${xauusd}`
    );
  }

  return {
    EURUSD: Math.round(eurusd * 10000) / 10000,
    GBPUSD: Math.round(gbpusd * 10000) / 10000,
    XAUUSD: Math.round(xauusd * 100) / 100,
    fetchedAt: now,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isTest = searchParams.get("test") === "1";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Intelligence API: ANTHROPIC_API_KEY is not set");
    return NextResponse.json(
      { error: "Intelligence service not configured", key_present: false },
      { status: 503 }
    );
  }

  // Test mode: verify key + live price fetch without calling Claude
  if (isTest) {
    try {
      const prices = await fetchLivePrices();
      return NextResponse.json({
        key_prefix: apiKey.slice(0, 10),
        model: "claude-haiku-4-5-20251001",
        status: "ok",
        live_prices: prices,
      });
    } catch (err) {
      return NextResponse.json(
        { key_prefix: apiKey.slice(0, 10), status: "price_fetch_failed", error: String(err) },
        { status: 502 }
      );
    }
  }

  // Return cached if still fresh
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // ── Fetch live prices — hard fail if unavailable ──────────────────────────
  let prices: LivePrices;
  try {
    prices = await fetchLivePrices();
    console.log("Intelligence API: live prices fetched —", prices);
  } catch (err) {
    console.error("Intelligence API: price fetch failed:", err);
    return NextResponse.json(
      {
        error: "Unable to fetch live prices. Analysis paused to protect traders from stale data.",
        detail: String(err),
      },
      { status: 502 }
    );
  }

  const client = new Anthropic();
  const today = new Date().toISOString().split("T")[0];

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are a professional forex and financial market analyst. Today is ${today}.

LIVE MARKET PRICES (fetched ${prices.fetchedAt}):
- EURUSD: ${prices.EURUSD}
- GBPUSD: ${prices.GBPUSD}
- XAUUSD (Gold/USD): ${prices.XAUUSD}

Using these exact current prices, identify the 3 strongest trading setups available today. Base ALL entry zones, stop loss, and take profit levels on the real prices above — do not invent prices. Apply standard technical analysis (support/resistance, moving averages, structure) relative to these actual levels.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "setups": [
    {
      "pair": "XAUUSD",
      "direction": "BUY",
      "setup_type": "Break and Retest",
      "entry_zone": "2,320 - 2,325",
      "stop_loss": "2,305",
      "take_profit": "2,360",
      "confluence": [
        "Price above 200 EMA on H4",
        "Key support zone holding",
        "USD weakness on recent data",
        "Retail traders 65% short (contrarian)"
      ],
      "confidence": 7,
      "expected_move": "Targeting 2,360 resistance",
      "risk_warning": "High impact data at 14:30 UTC"
    }
  ],
  "overview": {
    "bias": "Risk-on",
    "events": ["Fed speakers today", "NFP this Friday"],
    "pairs_to_watch": ["XAUUSD", "EURUSD", "GBPUSD"],
    "pairs_to_avoid": ["USDJPY", "USDCHF"]
  },
  "live_prices": {
    "EURUSD": ${prices.EURUSD},
    "GBPUSD": ${prices.GBPUSD},
    "XAUUSD": ${prices.XAUUSD},
    "fetched_at": "${prices.fetchedAt}"
  },
  "generated_at": "${new Date().toISOString()}"
}`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("Intelligence API — JSON parse failed. Raw response:", raw);
      throw parseErr;
    }
    cached = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Intelligence API error:", message);
    return NextResponse.json(
      { error: "Failed to generate analysis", detail: message },
      { status: 500 }
    );
  }
}
