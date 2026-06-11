import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const DAILY_LIMIT = 10;

export async function POST(request: Request) {
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
  }

  let body: { question?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 });

  const db = svc();
  const today = new Date().toISOString().slice(0, 10);

  // ── Daily rate-limit check ────────────────────────────────────────────────────
  const { data: profile } = await db
    .from("user_profiles")
    .select("niri_questions_today, niri_questions_date")
    .eq("user_id", user.id)
    .maybeSingle();

  const p = profile as { niri_questions_today?: number; niri_questions_date?: string | null } | null;
  const isNewDay = !p?.niri_questions_date || p.niri_questions_date < today;
  let questionsToday = isNewDay ? 0 : (p?.niri_questions_today ?? 0);

  if (isNewDay) {
    await db.from("user_profiles")
      .update({ niri_questions_today: 0, niri_questions_date: today })
      .eq("user_id", user.id);
    questionsToday = 0;
  }

  if (questionsToday >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: "You've used your 10 questions for today — back tomorrow!",
        questions_used: DAILY_LIMIT,
        questions_remaining: 0,
      },
      { status: 429 }
    );
  }

  // ── Build trade context ───────────────────────────────────────────────────────
  const [recentRes, allRes] = await Promise.all([
    db.from("trades")
      .select("pair, direction, pnl, date, lot, entry, exit_price")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(20),
    db.from("trades")
      .select("pnl")
      .eq("user_id", user.id),
  ]);

  const recentTrades = (recentRes.data ?? []) as { pair: string; direction: string; pnl: number; date: string; lot: number; entry: number; exit_price: number }[];
  const allTrades    = (allRes.data    ?? []) as { pnl: number }[];

  const totalTrades = allTrades.length;
  const wins        = allTrades.filter((t) => t.pnl > 0).length;
  const winRate     = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
  const totalPnl    = allTrades.reduce((s, t) => s + t.pnl, 0);

  const tradeContext = `Total trades: ${totalTrades}
Win rate: ${winRate}%
Total P&L: $${totalPnl.toFixed(2)}
Last 20 trades (most recent first):
${JSON.stringify(recentTrades, null, 0)}`;

  const SYSTEM = `You are NIRI, a friendly trading-psychology companion inside a trading journal app. You answer questions ONLY about the user's own trading data, behaviour, and trading psychology, using the data provided below. Personality: warm, encouraging mentor — concise, 2-4 sentences max per answer. You MUST refuse: price predictions, trade signals, buy/sell recommendations, questions about other users, and anything unrelated to the user's trading data or trading psychology. When refusing, stay in character and gently redirect to what you CAN help with.

User's trading data:
${tradeContext}`;

  // ── Call Claude ───────────────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system:     SYSTEM,
      messages:   [{ role: "user", content: question }],
    });

    const answer = msg.content[0]?.type === "text"
      ? msg.content[0].text.trim()
      : "I couldn't formulate a response. Try asking differently.";

    const newCount = questionsToday + 1;
    await db.from("user_profiles")
      .update({ niri_questions_today: newCount, niri_questions_date: today })
      .eq("user_id", user.id);

    return NextResponse.json({
      answer,
      questions_used:      newCount,
      questions_remaining: DAILY_LIMIT - newCount,
    });
  } catch (e) {
    console.error("[niri/ask] Claude error:", e);
    return NextResponse.json(
      { error: "I'm having trouble connecting right now. Try again in a moment." },
      { status: 500 }
    );
  }
}
