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

// GET /api/admin/payouts
// Returns pending payout requests. Flags those within the payout window (days 28–31).
export async function GET() {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const db = svc();

  const { data: payouts, error } = await db
    .from("payouts")
    .select("id, referrer_id, amount, status, payout_method, account_details, requested_at, paid_at")
    .in("status", ["pending", "processing", "paid", "rejected"])
    .order("requested_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve referrer emails
  const referrerIds = [...new Set((payouts ?? []).map((p) => p.referrer_id))];
  const emails: Record<string, string> = {};
  await Promise.all(
    referrerIds.map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      if (data?.user?.email) emails[id] = data.user.email;
    })
  );

  const now = new Date();
  const inPayoutWindow = now.getDate() >= 28;

  const rows = (payouts ?? []).map((p) => ({
    ...p,
    referrer_email:   emails[p.referrer_id] ?? p.referrer_id,
    amount_ngn:       Number(p.amount) / 100,
    in_payout_window: inPayoutWindow,
  }));

  return NextResponse.json({ payouts: rows, in_payout_window: inPayoutWindow });
}

// POST /api/admin/payouts
// Body: { action: "approve" | "reject", payoutId: string }
export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  let body: { action?: string; payoutId?: string };
  try { body = await request.json(); } catch { body = {}; }

  const { action, payoutId } = body;
  if (!action || !payoutId)
    return NextResponse.json({ error: "action and payoutId required" }, { status: 400 });

  const db = svc();

  if (action === "approve") {
    const { error } = await db.from("payouts")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payoutId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark associated commissions as paid
    const { data: payout } = await db.from("payouts")
      .select("referrer_id")
      .eq("id", payoutId)
      .maybeSingle();
    if (payout?.referrer_id) {
      await db.from("commissions")
        .update({ status: "paid" })
        .eq("referrer_id", payout.referrer_id)
        .eq("status", "confirmed");
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    const { error } = await db.from("payouts")
      .update({ status: "rejected" })
      .eq("id", payoutId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
