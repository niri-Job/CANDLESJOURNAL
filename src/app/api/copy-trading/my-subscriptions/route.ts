import { createClient as svcClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function authedCopyUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_copy_trading_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_copy_trading_enabled) return { user: null };
  return { user };
}

export async function GET() {
  const { user } = await authedCopyUser();
  if (!user) return NextResponse.json({ error: "Copy trading not enabled for your account" }, { status: 403 });

  const db = svc();

  const { data: subs, error } = await db
    .from("copy_subscriptions")
    .select(`
      id, is_active, risk_mode, fixed_lot, risk_percent, max_lot_size,
      max_daily_loss_percent, max_open_trades, mt5_login, mt5_server, broker,
      vps_status, subscriber_balance, created_at,
      signal_providers (
        id, name, grade, is_verified, broker, win_rate, profit_factor
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach per-subscription trade stats
  const enriched = await Promise.all((subs ?? []).map(async (sub: Record<string, unknown>) => {
    const { data: trades } = await db
      .from("copied_trades")
      .select("pnl, status, direction")
      .eq("subscription_id", String(sub.id));

    const allTrades = trades ?? [];
    const closed = allTrades.filter((t: { status: string }) => t.status === "closed");
    const totalPnl = closed.reduce((acc: number, t: { pnl: number | null }) => acc + (t.pnl ?? 0), 0);
    const wins = closed.filter((t: { pnl: number | null }) => (t.pnl ?? 0) > 0).length;
    const openCount = allTrades.filter((t: { status: string }) => t.status === "pending").length;

    return {
      ...sub,
      total_copied_trades: closed.length,
      total_pnl: totalPnl,
      win_rate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
      open_positions: openCount,
    };
  }));

  return NextResponse.json({ subscriptions: enriched });
}

export async function PATCH(request: Request) {
  const { user } = await authedCopyUser();
  if (!user) return NextResponse.json({ error: "Copy trading not enabled for your account" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { subscription_id, is_active, risk_mode, fixed_lot, risk_percent, max_lot_size } = body;
  if (!subscription_id) return NextResponse.json({ error: "subscription_id required" }, { status: 400 });

  const db = svc();
  const updates: Record<string, unknown> = {};
  if (is_active !== undefined) updates.is_active = Boolean(is_active);
  if (risk_mode) updates.risk_mode = String(risk_mode);
  if (fixed_lot !== undefined) updates.fixed_lot = Number(fixed_lot);
  if (risk_percent !== undefined) updates.risk_percent = Number(risk_percent);
  if (max_lot_size !== undefined) updates.max_lot_size = Number(max_lot_size);

  const { error } = await db
    .from("copy_subscriptions")
    .update(updates)
    .eq("id", String(subscription_id))
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
