import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

interface TradeSummary {
  id: string;
  pair: string;
  direction: string;
  lot: number;
  date: string;
  entry: number;
  exit_price: number;
  sl: number | null;
  tp: number | null;
  pnl: number;
  session: string | null;
  setup: string | null;
  notes: string | null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { trade } = body as { trade: TradeSummary };
  if (!trade?.id || typeof trade.pnl !== "number") {
    return NextResponse.json({ error: "Invalid trade data" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify trade belongs to this user
  const { data: dbTrade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", trade.id)
    .eq("user_id", user.id)
    .single();

  if (!dbTrade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const rr = trade.sl != null && trade.tp != null && trade.entry !== trade.sl
    ? Math.abs((trade.tp - trade.entry) / (trade.entry - trade.sl)).toFixed(2)
    : "N/A";

  const pnlStr = trade.pnl >= 0 ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`;

  const prompt = `You are an expert forex trading coach. Analyse this single trade and give exactly 3 sentences of coaching insight. Be specific about the entry/exit quality, not generic.

Trade: ${trade.pair} ${trade.direction.toUpperCase()} | ${trade.date}
Entry: ${trade.entry} | Exit: ${trade.exit_price} | SL: ${trade.sl ?? "none"} | TP: ${trade.tp ?? "none"}
P&L: ${pnlStr} | Lot: ${trade.lot} | R:R planned: ${rr}
Session: ${trade.session ?? "unknown"} | Setup: ${trade.setup || "none"}
Notes: ${trade.notes || "none"}

Respond in exactly 3 sentences. Sentence 1: what the data shows about entry timing. Sentence 2: what was strong or weak about risk management. Sentence 3: one specific actionable improvement for the next similar trade.`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");
    return NextResponse.json({ insight: content.text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "AI failed: " + msg }, { status: 500 });
  }
}
