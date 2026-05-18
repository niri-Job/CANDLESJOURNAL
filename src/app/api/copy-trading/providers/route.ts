import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const db = svc();
  const { data, error } = await db
    .from("signal_providers")
    .select("id, name, description, strategy, broker, broker_server, avatar_url, is_verified, verified_at, grade, win_rate, profit_factor, max_drawdown, total_trades, total_subscribers, monthly_fee, account_currency, created_at")
    .eq("is_active", true)
    .order("total_trades", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ providers: data ?? [] });
}
