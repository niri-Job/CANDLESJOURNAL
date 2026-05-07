import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Cache for 30 min — live prices fetched on every cache miss
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

interface LivePrices {
  EURUSD: number;
  GBPUSD: number;
  XAUUSD: number;
  fetchedAt: string;
  source: string;
}

// ── Primary: open.er-api.com (free, no key, very reliable) ───────────────────
async function fetchForexPrimary(): Promise<{ EURUSD: number; GBPUSD: number }> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`open.er-api: ${res.status}`);
  const json = await res.json() as { rates?: Record<string, number> };
  const eur = json.rates?.EUR;
  const gbp = json.rates?.GBP;
  if (!eur || !gbp) throw new Error(`open.er-api: missing rates (EUR=${eur} GBP=${gbp})`);
  return {
    EURUSD: Math.round((1 / eur) * 100000) / 100000,
    GBPUSD: Math.round((1 / gbp) * 100000) / 100000,
  };
}

// ── Primary: metals.live (free, no key) ──────────────────────────────────────
async function fetchGoldPrimary(): Promise<number> {
  const res = await fetch("https://api.metals.live/v1/spot/gold", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`metals.live: ${res.status}`);
  const json = await res.json() as unknown;
  // metals.live returns [{ gold: number }] or { gold: number }
  const raw = (Array.isArray(json) ? json[0] : json) as Record<string, number> | null;
  const price = raw?.gold ?? raw?.price ?? raw?.xau ?? raw?.XAU;
  if (!price || typeof price !== "number") {
    throw new Error(`metals.live: unexpected format — ${JSON.stringify(json).slice(0, 120)}`);
  }
  return Math.round(price * 100) / 100;
}

// ── Fallback: CDN-hosted currency API (never goes down) ───────────────────────
async function fetchCdnFallback(): Promise<{ EURUSD: number; GBPUSD: number; XAUUSD: number }> {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`CDN fallback: ${res.status}`);
  const json = await res.json() as { usd?: Record<string, number> };
  const rates = json.usd;
  const eur = rates?.eur;
  const gbp = rates?.gbp;
  const xau = rates?.xau; // amount of XAU per 1 USD → invert for XAUUSD
  if (!eur || !gbp || !xau) {
    throw new Error(`CDN fallback: missing rates (eur=${eur} gbp=${gbp} xau=${xau})`);
  }
  return {
    EURUSD: Math.round((1 / eur) * 100000) / 100000,
    GBPUSD: Math.round((1 / gbp) * 100000) / 100000,
    XAUUSD: Math.round((1 / xau) * 100) / 100,
  };
}

// ── Orchestrator: parallel primary fetch → CDN fallback ──────────────────────
async function fetchLivePrices(): Promise<LivePrices> {
  const now = new Date().toISOString();

  const [forexRes, goldRes] = await Promise.allSettled([
    fetchForexPrimary(),
    fetchGoldPrimary(),
  ]);

  if (forexRes.status === "fulfilled" && goldRes.status === "fulfilled") {
    return {
      ...forexRes.value,
      XAUUSD: goldRes.value,
      fetchedAt: now,
      source: "open.er-api + metals.live",
    };
  }

  // At least one primary failed — log and try CDN fallback
  console.warn("Intelligence API: primary fetch partial failure — trying CDN fallback", {
    forex: forexRes.status === "rejected" ? String(forexRes.reason) : "ok",
    gold:  goldRes.status  === "rejected" ? String(goldRes.reason)  : "ok",
  });

  const fallback = await fetchCdnFallback(); // throws if this also fails
  return { ...fallback, fetchedAt: now, source: "cdn.jsdelivr.net/fawazahmed0" };
}

// ── Route handler ─────────────────────────────────────────────────────────────
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

  // ── Hard-fail if live prices are unavailable ──────────────────────────────
  let prices: LivePrices;
  try {
    prices = await fetchLivePrices();
    console.log(`Intelligence API: prices from [${prices.source}] —`, {
      EURUSD: prices.EURUSD,
      GBPUSD: prices.GBPUSD,
      XAUUSD: prices.XAUUSD,
    });
  } catch (err) {
    console.error("Intelligence API: all price sources failed:", err);
    return NextResponse.json(
      {
        error:
          "Unable to fetch live prices. Analysis paused to protect traders from stale data.",
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
    "fetched_at": "${prices.fetchedAt}",
    "source": "${prices.source}"
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
