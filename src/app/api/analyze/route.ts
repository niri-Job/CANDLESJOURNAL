import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { analyzeJournal } from "@/lib/analyzeJournal";
import { checkTrialAccess } from "@/lib/trial";

// Increase Netlify/Vercel function timeout — Claude analysis takes 15–30s
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { period } = body as { period: string };

  if (period !== "daily" && period !== "weekly" && period !== "monthly") {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  // Fail fast if the API key is missing — gives a clear error instead of a
  // cryptic Anthropic SDK exception that surfaces as "Analysis failed"
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("analyze: ANTHROPIC_API_KEY is not set on this server");
    return NextResponse.json(
      { error: "Server misconfiguration: ANTHROPIC_API_KEY not set. Add it in Netlify → Site config → Environment variables." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Trial enforcement ─────────────────────────────────────────────────────
  const trial = await checkTrialAccess(user.id, "ai_analyses", { consume: true });
  if (!trial.ok) {
    return NextResponse.json(
      { error: trial.message, trial_reason: trial.reason },
      { status: trial.httpStatus }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  let fromStr: string;

  if (period === "daily") {
    fromStr = today;
  } else {
    const from = new Date();
    if (period === "weekly") {
      from.setDate(from.getDate() - 7);
    } else {
      from.setMonth(from.getMonth() - 1);
    }
    fromStr = from.toISOString().split("T")[0];
  }

  const { data: trades, error: tradesError } = await supabase
    .from("trades")
    .select(
      "pair, direction, lot, date, entry, exit_price, sl, tp, pnl, notes, asset_class, session, setup"
    )
    .eq("user_id", user.id)
    .gte("date", fromStr)
    .lte("date", today)
    .order("date", { ascending: true });

  if (tradesError) {
    console.error("analyze: trades fetch error:", tradesError.message);
    return NextResponse.json(
      { error: "Failed to fetch trades: " + tradesError.message },
      { status: 500 }
    );
  }

  const periodLabel =
    period === "daily" ? "today" : period === "weekly" ? "the last 7 days" : "the last 30 days";

  if (!trades || trades.length === 0) {
    return NextResponse.json(
      { error: `No trades found for ${periodLabel}` },
      { status: 404 }
    );
  }

  // Call Claude — wrap in try/catch so any SDK error (auth, timeout, rate limit)
  // returns a readable message instead of an unhandled rejection
  let analysis: string;
  try {
    analysis = await analyzeJournal(trades, period);
  } catch (err: unknown) {
    console.error("analyze: Claude API error (full):", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AI analysis failed: " + msg },
      { status: 500 }
    );
  }

  const { data: saved, error: saveError } = await supabase
    .from("journal_analyses")
    .insert({
      user_id: user.id,
      period,
      trade_count: trades.length,
      analysis,
    })
    .select("id, created_at")
    .single();

  if (saveError) {
    console.error("analyze: failed to save analysis:", saveError.message);
    return NextResponse.json({ analysis, saved: false });
  }

  // Increment ai_credits_used — best-effort, never blocks the response
  ;(async () => {
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("ai_credits_used")
      .eq("user_id", user.id)
      .maybeSingle();
    const used = ((prof as { ai_credits_used?: number } | null)?.ai_credits_used ?? 0) + 1;
    await supabase
      .from("user_profiles")
      .update({ ai_credits_used: used })
      .eq("user_id", user.id);
  })().catch((err: unknown) =>
    console.warn("analyze: ai_credits increment failed:", err)
  );

  return NextResponse.json({
    analysis,
    id: saved.id,
    created_at: saved.created_at,
    saved: true,
  });
}
