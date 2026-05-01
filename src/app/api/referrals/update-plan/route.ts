import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getCommissionRate(plan: string): number {
  if (plan === "pro")     return 1.00;
  if (plan === "starter") return 0.50;
  return 0.00;
}

// PATCH /api/referrals/update-plan
// Called by the Paystack webhook when a referred user changes plan.
// Body: { referred_user_id: string, plan_type: "starter"|"pro"|"free" }
// This is an internal service route — validated by a shared secret.
export async function PATCH(request: Request) {
  // Validate internal secret (set REFERRAL_INTERNAL_SECRET in env)
  const secret = request.headers.get("x-internal-secret");
  if (secret !== (process.env.REFERRAL_INTERNAL_SECRET || "cj-internal")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { referred_user_id, plan_type } = body as Record<string, string | undefined>;
  if (!referred_user_id || !plan_type) {
    return NextResponse.json({ error: "referred_user_id and plan_type required" }, { status: 400 });
  }

  const svc = serviceDb();
  const rate = getCommissionRate(plan_type);

  // Find the referral record for this referred user
  const { data: referral } = await svc
    .from("referrals")
    .select("id, referrer_id, status")
    .eq("referred_id", referred_user_id)
    .maybeSingle();

  if (!referral) return NextResponse.json({ ok: true, note: "no referral found" });

  const newStatus = plan_type === "free"
    ? "inactive"
    : referral.status === "inactive" ? "active" : referral.status;

  const { error } = await svc
    .from("referrals")
    .update({
      plan_type,
      commission_rate: rate,
      status:          newStatus,
      ...(plan_type !== "free" && referral.status === "inactive" ? { activated_at: new Date().toISOString() } : {}),
      ...(plan_type === "free" ? { cancelled_at: new Date().toISOString() } : {}),
    })
    .eq("id", referral.id);

  if (error) {
    console.error("[referrals/update-plan] update failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, commission_rate: rate, status: newStatus });
}
