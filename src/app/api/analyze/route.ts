import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { analyzeJournal } from "@/lib/analyzeJournal";

export async function POST(request: Request) {
  const body = await request.json();
  const { period } = body as { period: string };

  if (period !== "weekly" && period !== "monthly") {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
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

  const now = new Date();
  const from = new Date(now);
  if (period === "weekly") {
    from.setDate(from.getDate() - 7);
  } else {
    from.setMonth(from.getMonth() - 1);
  }
  const fromStr = from.toISOString().split("T")[0];

  const { data: trades, error: tradesError } = await supabase
    .from("trades")
    .select(
      "pair, direction, lot, date, entry, exit_price, sl, tp, pnl, notes, asset_class, session, setup"
    )
    .eq("user_id", user.id)
    .gte("date", fromStr)
    .order("date", { ascending: true });

  if (tradesError) {
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 }
    );
  }

  if (!trades || trades.length === 0) {
    return NextResponse.json(
      {
        error: `No trades found in the last ${period === "weekly" ? "7 days" : "30 days"}`,
      },
      { status: 404 }
    );
  }

  const analysis = await analyzeJournal(trades, period);

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
    console.error("Failed to save analysis:", saveError);
    return NextResponse.json({ analysis, saved: false });
  }

  return NextResponse.json({
    analysis,
    id: saved.id,
    created_at: saved.created_at,
    saved: true,
  });
}
