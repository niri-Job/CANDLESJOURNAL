import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CJ-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  ()    => cookieStore.getAll(),
        setAll: (cs)   => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

// POST /api/referrals/stats — enable referral program for the authenticated user
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const { enable } = (body as Record<string, unknown>);
  if (!enable) return NextResponse.json({ error: "enable required" }, { status: 400 });

  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = serviceDb();

  // Generate a unique referral code
  let code = genCode();
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await svc
      .from("user_profiles")
      .select("user_id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!existing) break;
    code = genCode();
    attempts++;
  }

  const { error } = await svc
    .from("user_profiles")
    .upsert(
      { user_id: user.id, referral_code: code, referral_enabled: true },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[referrals/stats] enable failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, referral_code: code });
}

export async function GET() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = user.id;

  // Profile (referral_code, referral_enabled, earnings, subscription_status)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("referral_code, referral_enabled, total_earnings, pending_earnings, paid_earnings, subscription_status")
    .eq("user_id", uid)
    .maybeSingle();

  // Referral counts
  const { data: allReferrals } = await supabase
    .from("referrals")
    .select("id, status, plan_type, commission_rate, joined_at, activated_at, last_payment_at")
    .eq("referrer_id", uid);

  const refs = allReferrals || [];
  const total    = refs.length;
  const active   = refs.filter(r => r.status === "active").length;
  const inactive = refs.filter(r => r.status === "inactive" || r.status === "cancelled").length;
  const pending  = refs.filter(r => r.status === "pending").length;

  // Conversion rate (pending+active+inactive = signed up; active = paid)
  const conversionRate = total > 0 ? Math.round(active / total * 100) : 0;

  // This month's commissions
  const thisMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const { data: thisMonthComms } = await supabase
    .from("commissions")
    .select("amount, status")
    .eq("referrer_id", uid)
    .eq("month", thisMonth);

  const thisMonthEarnings = (thisMonthComms || [])
    .filter(c => c.status !== "cancelled")
    .reduce((s, c) => s + Number(c.amount), 0);

  // Available for payout (confirmed, not paid)
  const { data: confirmedComms } = await supabase
    .from("commissions")
    .select("amount")
    .eq("referrer_id", uid)
    .eq("status", "confirmed");

  const availableForPayout = (confirmedComms || []).reduce((s, c) => s + Number(c.amount), 0);

  return NextResponse.json({
    referral_code:       profile?.referral_code    ?? null,
    referral_enabled:    profile?.referral_enabled ?? false,
    subscription_status: profile?.subscription_status || "free",
    total_referrals:     total,
    active_referrals:    active,
    inactive_referrals:  inactive,
    pending_referrals:   pending,
    conversion_rate:     conversionRate,
    this_month_earnings: thisMonthEarnings,
    lifetime_earnings:   Number(profile?.total_earnings   || 0),
    pending_earnings:    Number(profile?.pending_earnings || 0),
    paid_earnings:       Number(profile?.paid_earnings    || 0),
    available_for_payout: availableForPayout,
  });
}
