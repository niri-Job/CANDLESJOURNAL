import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: ()    => cookieStore.getAll(),
        setAll: (cs)  => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// POST /api/referrals/track
// Body: { referral_code: string }
// Called immediately after a new user signs up
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { referral_code } = body as Record<string, string | undefined>;
  if (!referral_code) return NextResponse.json({ error: "referral_code required" }, { status: 400 });

  // Auth: new user must be signed in
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const newUserId = user.id;

  // Lookup referrer by code
  const svc = serviceDb();
  const { data: referrerProfile } = await svc
    .from("user_profiles")
    .select("user_id, referral_code, referral_enabled, subscription_status")
    .eq("referral_code", referral_code.toUpperCase())
    .maybeSingle();

  if (!referrerProfile) return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
  if (!referrerProfile.referral_enabled) return NextResponse.json({ error: "Referral not active" }, { status: 400 });

  const referrerId = referrerProfile.user_id as string;

  // Block self-referral
  if (referrerId === newUserId) return NextResponse.json({ ok: true, note: "self-referral ignored" });

  // Check if already referred
  const { data: existingRef } = await svc
    .from("referrals")
    .select("id")
    .eq("referred_id", newUserId)
    .maybeSingle();

  if (existingRef) return NextResponse.json({ ok: true, note: "already referred" });

  // Abuse check: same IP signed up 3+ times in 24h (log only, don't block)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
           || request.headers.get("x-real-ip")
           || "unknown";

  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count: ipCount } = await svc
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referral_ip", ip)
    .gte("joined_at", oneDayAgo);

  if ((ipCount ?? 0) >= 3) {
    console.warn(`[referrals/track] IP ${ip} has ${ipCount} referrals in 24h — possible abuse`);
  }

  // Create referral record
  const { error: insertErr } = await svc.from("referrals").insert({
    referrer_id:     referrerId,
    referred_id:     newUserId,
    referral_code,
    status:          "pending",
    plan_type:       null,
    commission_rate: 0.50,  // default; updated when they pay
    referral_ip:     ip,
  });

  if (insertErr) {
    console.error("[referrals/track] insert failed:", insertErr.message);
    return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
  }

  // Save referred_by on the new user's profile
  await svc
    .from("user_profiles")
    .upsert(
      { user_id: newUserId, referred_by: referral_code },
      { onConflict: "user_id" }
    );

  return NextResponse.json({ ok: true });
}
