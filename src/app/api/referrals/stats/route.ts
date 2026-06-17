import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

export const dynamic = "force-dynamic";

async function serverDb() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => store.set(name, value, options)) } }
  );
}
function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = serviceDb();

  const [profileRes, referralsRes] = await Promise.all([
    svc.from("user_profiles")
       .select("referral_code, referral_earnings")
       .eq("user_id", user.id)
       .maybeSingle(),
    svc.from("referrals")
       .select("id, status")
       .eq("referrer_user_id", user.id),
  ]);

  const refs      = referralsRes.data ?? [];
  const total     = refs.length;
  const pending   = refs.filter((r) => r.status === "pending").length;
  const converted = refs.filter((r) => r.status === "converted" || r.status === "paid").length;

  return NextResponse.json({
    referral_code:    profileRes.data?.referral_code  ?? null,
    total,
    pending,
    converted,
    total_earned:     profileRes.data?.referral_earnings ?? 0,
    // Backward-compat keys consumed by ReferralQuickView in settings
    referral_enabled:    true,
    subscription_status: "none",
    active_referrals:    converted,
    this_month_earnings: 0,
  });
}
