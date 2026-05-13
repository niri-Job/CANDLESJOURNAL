import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trade_id = searchParams.get("trade_id");
  if (!trade_id) return NextResponse.json({ error: "trade_id required" }, { status: 400 });

  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("trade_reflections")
    .select("*")
    .eq("user_id", user.id)
    .eq("trade_id", trade_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reflection: data });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    trade_id, trade_context,
    plan, what_happened, what_different,
    skip_ai,
  } = body as {
    trade_id: string;
    trade_context: {
      pair: string; direction: string; lot: number; date: string;
      entry: number; exit_price: number; sl: number | null; tp: number | null; pnl: number;
    };
    plan: string; what_happened: string; what_different: string;
    skip_ai?: boolean;
  };

  if (!trade_id) return NextResponse.json({ error: "trade_id required" }, { status: 400 });

  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let ai_feedback: string | null = null;

  if (!skip_ai && plan?.trim() && what_happened?.trim() && what_different?.trim()) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }
    try {
      const client = new Anthropic();
      const t = trade_context;
      const prompt = `You are an expert trading coach. A trader just submitted a post-trade reflection on a ${t.direction} trade on ${t.pair}.

Trade details:
- Date: ${t.date}
- Direction: ${t.direction}
- Entry: ${t.entry}
- Exit: ${t.exit_price}
- Stop Loss: ${t.sl ?? "not set"}
- Take Profit: ${t.tp ?? "not set"}
- Lot size: ${t.lot}
- P&L: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)} (${t.pnl >= 0 ? "WIN" : "LOSS"})

Trader's reflection:
1. What was your plan: ${plan}
2. What actually happened: ${what_happened}
3. What would you do differently: ${what_different}

Provide concise, honest coaching feedback in 3–5 short paragraphs. Focus on:
- What the trader did well (even in a loss)
- The specific mistake or missed opportunity
- One actionable improvement for the next trade
- A brief motivational closing

Be direct, practical, and specific to this trade. Do not use bullet points or headers — write in plain paragraphs.`;

      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      });

      const block = msg.content.find((b) => b.type === "text");
      ai_feedback = block && block.type === "text" ? block.text : null;
    } catch (e) {
      console.error("[reflections] Claude error:", e);
    }
  }

  const { error: upsertErr } = await supabase
    .from("trade_reflections")
    .upsert(
      {
        user_id:        user.id,
        trade_id,
        plan:           plan ?? null,
        what_happened:  what_happened ?? null,
        what_different: what_different ?? null,
        ai_feedback,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "user_id,trade_id" }
    );

  if (upsertErr) {
    console.error("[reflections] upsert error:", upsertErr);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ai_feedback });
}
