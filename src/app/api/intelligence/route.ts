import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Simple in-memory cache (30 min TTL)
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isTest = searchParams.get("test") === "1";

  // Return cached if fresh (skip cache in test mode)
  if (!isTest && cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Intelligence API: ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ error: "Intelligence service not configured", key_present: false }, { status: 503 });
  }

  console.log("Intelligence API: key prefix =", apiKey.slice(0, 10));
  if (isTest) {
    return NextResponse.json({ key_prefix: apiKey.slice(0, 10), model: "claude-haiku-4-5-20251001", status: "key_present" });
  }

  const client = new Anthropic();
  const today = new Date().toISOString().split("T")[0];

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are a professional forex and financial market analyst. Today is ${today}.

Analyse current market conditions and identify the 3 strongest trading setups available today based on typical technical patterns, major fundamental drivers, and market structure.

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
  "generated_at": "${new Date().toISOString()}"
}`
      }]
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    // Strip markdown code fences the model sometimes adds despite instructions
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
    return NextResponse.json({ error: "Failed to generate analysis", detail: message }, { status: 500 });
  }
}
