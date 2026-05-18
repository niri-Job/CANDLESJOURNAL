import { createClient as svcClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

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
  const { data, error } = await db
    .from("signal_providers")
    .select("id, name, description, strategy, broker, broker_server, monthly_fee, grade, win_rate, profit_factor, max_drawdown, total_trades, total_subscribers, is_active, is_verified, provider_token, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ provider: data });
}

export async function POST(request: Request) {
  const { user } = await authedCopyUser();
  if (!user) return NextResponse.json({ error: "Copy trading not enabled for your account" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { name, description, strategy, broker, broker_server, monthly_fee } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = svc();

  // Check if already registered
  const { data: existing } = await db
    .from("signal_providers")
    .select("id, provider_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, provider_id: existing.id, provider_token: existing.provider_token, already_exists: true });
  }

  const provider_token = randomUUID();

  const { data, error } = await db
    .from("signal_providers")
    .insert({
      user_id:       user.id,
      name:          String(name).trim(),
      description:   description ? String(description).trim() : null,
      strategy:      strategy ? String(strategy).trim() : null,
      broker:        broker ? String(broker).trim() : null,
      broker_server: broker_server ? String(broker_server).trim() : null,
      monthly_fee:   monthly_fee ? Number(monthly_fee) : 0,
      is_active:     false,
      grade:         "ungraded",
      provider_token,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, provider_id: data.id, provider_token });
}
