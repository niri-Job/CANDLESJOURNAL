import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NIRI_SYSTEM = `You are NIRI, an AI trading coach living inside a trading journal app. You are funny but serious, direct, and care deeply about the trader's discipline. Analyse the trades provided and give ONE key insight in 2-3 sentences max. Be specific about what you see in their data — mention actual pairs, times, or patterns. Never be generic. Speak directly to the trader in second person. No emojis.`;

export async function POST(request: Request) {
  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => store.set(name, value, options)) } }
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let body: { type?: string; trades?: unknown[]; reportStats?: unknown };
  try { body = await request.json(); } catch { body = {}; }

  const userContent = body.type === "reports" && body.reportStats
    ? `Report statistics: ${JSON.stringify(body.reportStats, null, 0)}`
    : `Last ${Math.min((body.trades ?? []).length, 20)} trades (JSON): ${JSON.stringify((body.trades ?? []).slice(0, 20), null, 0)}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 150,
      system:     NIRI_SYSTEM,
      messages:   [{ role: "user", content: userContent }],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return NextResponse.json({ insight: text });
  } catch (e) {
    console.error("[niri/insight] Claude error:", e);
    return NextResponse.json({ error: "AI insight unavailable" }, { status: 500 });
  }
}
