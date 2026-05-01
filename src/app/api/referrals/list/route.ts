import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

export async function GET() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: referrals } = await supabase
    .from("referrals")
    .select("id, referred_id, status, plan_type, commission_rate, joined_at, activated_at, last_payment_at")
    .eq("referrer_id", user.id)
    .order("joined_at", { ascending: false });

  if (!referrals?.length) return NextResponse.json({ referrals: [] });

  // Calculate earnings per referral from commissions table
  const referralIds = referrals.map(r => r.id);
  const { data: commissions } = await supabase
    .from("commissions")
    .select("referral_id, amount, status")
    .in("referral_id", referralIds)
    .neq("status", "cancelled");

  const earningsByRef: Record<string, number> = {};
  (commissions || []).forEach(c => {
    earningsByRef[c.referral_id] = (earningsByRef[c.referral_id] || 0) + Number(c.amount);
  });

  // Anonymize: only expose first 8 chars of referred_id
  const list = referrals.map(r => ({
    id:              r.id,
    referred_anon:   r.referred_id.slice(0, 8),  // anonymized
    status:          r.status,
    plan_type:       r.plan_type || "free",
    commission_rate: Number(r.commission_rate),
    joined_at:       r.joined_at,
    activated_at:    r.activated_at,
    last_payment_at: r.last_payment_at,
    earnings:        earningsByRef[r.id] || 0,
  }));

  return NextResponse.json({ referrals: list });
}
