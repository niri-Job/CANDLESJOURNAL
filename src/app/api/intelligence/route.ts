import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Simple in-memory cache (30 min TTL)
let cached: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET() {
  // Return cached if fresh
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Intelligence service not configured" }, { status: 503 });
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

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const data = JSON.parse(text);
    cached = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("Intelligence API error:", err);
    return NextResponse.json({ error: "Failed to generate analysis" }, { status: 500 });
  }
}
