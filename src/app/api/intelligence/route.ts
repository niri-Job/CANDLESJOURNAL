import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkTrialAccess } from "@/lib/trial";
import { MARKET_PAIRS, fetchPairIndicators, type PairIndicators } from "@/lib/marketPrices";

export const maxDuration = 60;

// 15-minute cache
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

const PAIRS = MARKET_PAIRS;

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
