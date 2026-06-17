import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";

export const dynamic = "force-dynamic";

// ₦3,000 reward per converted referral (in naira)
const REFERRAL_REWARD = 3000;

function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST /api/referrals/convert
// Body: { referred_user_id: string }
// Called by Paystack webhook (Phase 2) when a referred user makes their first payment.
// NOT called from anywhere in the app yet — wired to Paystack in Phase 2.
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { referred_user_id } = body as Record<string, string | undefined>;
  if (!referred_user_id) return NextResponse.json({ error: "referred_user_id required" }, { status: 400 });

  const svc = serviceDb();

  // Find referral record for this user
  const { data: referral, error: findErr } = await svc
    .from("referrals")
    .select("id, referrer_user_id, status")
    .eq("referred_user_id", referred_user_id)
    .maybeSingle();

  if (findErr) {
    console.error("[referrals/convert] find error:", findErr.message);
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!referral) return NextResponse.json({ error: "No referral record found for this user" }, { status: 404 });
  if (referral.status === "paid") return NextResponse.json({ ok: true, note: "already paid" });

  const now = new Date().toISOString();

  // Mark as converted and paid in one update
  const { error: updateErr } = await svc
    .from("referrals")
    .update({ status: "paid", converted_at: now, paid_at: now })
    .eq("id", referral.id);

  if (updateErr) {
    console.error("[referrals/convert] update error:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Add ₦3,000 to referrer's earnings
  const { data: profile } = await svc
    .from("user_profiles")
    .select("referral_earnings")
    .eq("user_id", referral.referrer_user_id)
    .maybeSingle();

  const { error: earnErr } = await svc
    .from("user_profiles")
    .update({ referral_earnings: (profile?.referral_earnings ?? 0) + REFERRAL_REWARD })
    .eq("user_id", referral.referrer_user_id);

  if (earnErr) {
    console.error("[referrals/convert] earnings update error:", earnErr.message);
  }

  console.log(`[referrals/convert] ₦${REFERRAL_REWARD} credited to referrer ${referral.referrer_user_id} for referred user ${referred_user_id}`);
  return NextResponse.json({ ok: true, reward: REFERRAL_REWARD });
}
