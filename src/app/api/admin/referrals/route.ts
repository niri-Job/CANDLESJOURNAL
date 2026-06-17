import { createClient } from "@supabase/supabase-js";
import { NextResponse }  from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const db = svc();

  const { data: referrals } = await db
    .from("referrals")
    .select("id, referrer_user_id, status");

  const refs      = referrals ?? [];
  const total     = refs.length;
  const pending   = refs.filter((r) => r.status === "pending").length;
  const converted = refs.filter((r) => r.status === "converted").length;
  const paid      = refs.filter((r) => r.status === "paid").length;

  // Count referrals per referrer
  const countByReferrer: Record<string, number> = {};
  for (const r of refs) {
    countByReferrer[r.referrer_user_id] = (countByReferrer[r.referrer_user_id] ?? 0) + 1;
  }

  // Top 10 referrers by count
  const topIds = Object.entries(countByReferrer)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);

  const topReferrers: { email: string; count: number }[] = [];
  for (const uid of topIds) {
    const { data: authUser } = await db.auth.admin.getUserById(uid);
    topReferrers.push({
      email: authUser.user?.email ?? uid.slice(0, 8) + "…",
      count: countByReferrer[uid],
    });
  }

  return NextResponse.json({ total, pending, converted, paid, top_referrers: topReferrers });
}
