import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

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
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const db = svc();

  const [profilesRes, proRes, txRes] = await Promise.all([
    db.from("user_profiles").select("user_id, created_at", { count: "exact", head: false }),
    db.from("user_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("subscription_status", "pro")
      .gt("subscription_end", new Date().toISOString()),
    db.from("payment_transactions")
      .select("amount")
      .eq("status", "success")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const allProfiles = profilesRes.data ?? [];
  const totalUsers  = profilesRes.count ?? allProfiles.length;
  const proCount    = proRes.count ?? 0;

  // Active trials: created within last 3 days, not pro
  const trialCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const activeTrials = allProfiles.filter(
    (p) => (p as { created_at?: string }).created_at &&
           (p as { created_at?: string }).created_at! >= trialCutoff
  ).length;

  // Recent signups (last 7 days)
  const weekCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const recentSignups = allProfiles.filter(
    (p) => (p as { created_at?: string }).created_at &&
           (p as { created_at?: string }).created_at! >= weekCutoff
  ).length;

  // Monthly revenue in NGN (amounts stored in kobo, divide by 100)
  const monthlyRevenue = (txRes.data ?? []).reduce(
    (sum, t) => sum + Number((t as { amount?: number }).amount ?? 0) / 100, 0
  );

  return NextResponse.json({
    total_users:     totalUsers,
    pro_count:       proCount,
    active_trials:   activeTrials,
    monthly_revenue: monthlyRevenue,
    recent_signups:  recentSignups,
  });
}
