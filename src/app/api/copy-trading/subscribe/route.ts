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

export async function POST(request: Request) {
  const { user } = await authedCopyUser();
  if (!user) return NextResponse.json({ error: "Copy trading not enabled for your account" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    provider_id, risk_mode, fixed_lot, risk_percent, max_lot_size,
    max_daily_loss_percent, max_open_trades, mt5_login, mt5_investor_password,
    mt5_server, broker, subscriber_balance,
  } = body as Record<string, unknown>;

  if (!provider_id) return NextResponse.json({ error: "provider_id is required" }, { status: 400 });

  const db = svc();

  const { data, error } = await db
    .from("copy_subscriptions")
    .insert({
      user_id:               user.id,
      provider_id:           String(provider_id),
      risk_mode:             risk_mode ? String(risk_mode) : "proportional",
      fixed_lot:             fixed_lot ? Number(fixed_lot) : 0.01,
      risk_percent:          risk_percent ? Number(risk_percent) : 1.0,
      max_lot_size:          max_lot_size ? Number(max_lot_size) : 0.1,
      max_daily_loss_percent: max_daily_loss_percent ? Number(max_daily_loss_percent) : 5.0,
      max_open_trades:       max_open_trades ? Number(max_open_trades) : 5,
      mt5_login:             mt5_login ? String(mt5_login) : null,
      mt5_investor_password: mt5_investor_password ? String(mt5_investor_password) : null,
      mt5_server:            mt5_server ? String(mt5_server) : null,
      broker:                broker ? String(broker) : null,
      subscriber_balance:    subscriber_balance ? Number(subscriber_balance) : 0,
      is_active:             true,
      vps_status:            "pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Subscriber count is recalculated by the grading endpoint

  return NextResponse.json({ ok: true, subscription_id: data.id });
}
