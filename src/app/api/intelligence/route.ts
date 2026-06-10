import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MARKET_PAIRS, fetchAllPairIndicators, type PairIndicators } from "@/lib/marketPrices";

export const maxDuration = 60;

// 15-minute cache
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

const PAIRS = MARKET_PAIRS;
const DEV_USER_ID = "b9433d15-02e3-44ed-b66f-b4f51f22fac7";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function getMondayStr(d: Date = new Date()): string {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - diff);
  return mon.toISOString().slice(0, 10);
}

async function incrementWeeklyAnalyses(userId: string): Promise<void> {
  try {
    const db = svc();
    const { data } = await db
      .from("user_profiles")
      .select("ai_analyses_used_this_week, ai_week_start")
      .eq("user_id", userId)
      .maybeSingle();
    const p = data as { ai_analyses_used_this_week?: number; ai_week_start?: string | null } | null;
    const thisMon = getMondayStr();
    const needsReset = !p?.ai_week_start || p.ai_week_start < thisMon;
    const next = needsReset ? 1 : (p?.ai_analyses_used_this_week ?? 0) + 1;
    await db
      .from("user_profiles")
      .update({ ai_analyses_used_this_week: next, ai_week_start: thisMon })
      .eq("user_id", userId);
  } catch (e) {
    console.warn("[intelligence] weekly increment failed:", e);
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
      const [ind] = await fetchAllPairIndicators([PAIRS[0]]);
      return NextResponse.json({ key_prefix: apiKey.slice(0, 10), status: "ok", sample: ind });
    } catch (err) {
      return NextResponse.json({ status: "fetch_failed", error: String(err) }, { status: 502 });
    }
  }

  // ── Weekly limit: 3 analyses per week, resets every Monday ──────────────────
  let weeklyUsed = 0;
  if (user.id !== DEV_USER_ID) {
    const db = svc();
    const { data: prof } = await db
      .from("user_profiles")
      .select("ai_analyses_used_this_week, ai_week_start")
      .eq("user_id", user.id)
      .maybeSingle();

    const p = prof as { ai_analyses_used_this_week?: number; ai_week_start?: string | null } | null;
    const thisMon = getMondayStr();
    const needsReset = !p?.ai_week_start || p.ai_week_start < thisMon;
    weeklyUsed = needsReset ? 0 : (p?.ai_analyses_used_this_week ?? 0);

    if (needsReset) {
      void db.from("user_profiles")
        .update({ ai_analyses_used_this_week: 0, ai_week_start: thisMon })
        .eq("user_id", user.id);
    }

    if (weeklyUsed >= 3) {
      return NextResponse.json(
        { error: "You've used all 3 analyses this week. Resets Monday.", weekly_used: 3, weekly_limit: 3 },
        { status: 429 }
      );
    }
  }

  // Serve cache
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ ...(cached.data as object), weekly_used: weeklyUsed, weekly_limit: 3 });
  }

  // Fetch all 10 pairs (shared crumb + single batch quote call)
  const results = await fetchAllPairIndicators(PAIRS);
  const indicators = results.filter((r): r is PairIndicators => r !== null);

  if (indicators.length < 3) {
    return NextResponse.json(
      { error: "Unable to fetch market data. Please try again shortly." },
      { status: 502 }
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

Using the real indicator data above, identify 5 trading setups: XAUUSD must always be included (it is the primary pair for this platform), plus the 4 next strongest setups from the remaining pairs. For each setup:
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

    // Increment weekly usage counter — best-effort, non-blocking
    if (user.id !== DEV_USER_ID) {
      incrementWeeklyAnalyses(user.id).catch(() => undefined);
    }

    return NextResponse.json({ ...enriched, weekly_used: weeklyUsed + 1, weekly_limit: 3 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[intelligence] error:", message);
    return NextResponse.json(
      { error: "Failed to generate analysis", detail: message },
      { status: 500 }
    );
  }
}
