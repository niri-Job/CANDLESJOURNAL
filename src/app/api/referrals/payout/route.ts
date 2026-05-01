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

// POST /api/referrals/payout
// Body: { method: string, account_details: object }
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { method, account_details } = body as Record<string, unknown>;
  if (!method) return NextResponse.json({ error: "method required" }, { status: 400 });

  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = user.id;

  // Calculate available balance (confirmed commissions not yet paid)
  const { data: confirmed } = await supabase
    .from("commissions")
    .select("amount")
    .eq("referrer_id", uid)
    .eq("status", "confirmed");

  const available = (confirmed || []).reduce((s, c) => s + Number(c.amount), 0);

  if (available < 5) {
    return NextResponse.json(
      { error: `Minimum payout is $5.00. Available balance: $${available.toFixed(2)}` },
      { status: 400 }
    );
  }

  // Check for pending payout request already in flight
  const { data: existingPayout } = await supabase
    .from("payouts")
    .select("id")
    .eq("referrer_id", uid)
    .in("status", ["pending", "processing"])
    .maybeSingle();

  if (existingPayout) {
    return NextResponse.json({ error: "You already have a pending payout request" }, { status: 409 });
  }

  const svc = serviceDb();

  // Create payout record
  const { data: payout, error: payoutErr } = await svc
    .from("payouts")
    .insert({
      referrer_id:     uid,
      amount:          available,
      status:          "pending",
      payout_method:   method,
      account_details: account_details || null,
    })
    .select("id")
    .single();

  if (payoutErr) {
    console.error("[referrals/payout] insert failed:", payoutErr.message);
    return NextResponse.json({ error: "Failed to create payout request" }, { status: 500 });
  }

  // Log admin notification to console (can be replaced with email/Slack webhook later)
  console.log(`[PAYOUT REQUEST] user=${uid}, amount=$${available.toFixed(2)}, method=${method}, payout_id=${payout.id}`);

  return NextResponse.json({ ok: true, payout_id: payout.id, amount: available });
}

// GET /api/referrals/payout — list payout history
export async function GET() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("payouts")
    .select("id, amount, status, payout_method, requested_at, paid_at")
    .eq("referrer_id", user.id)
    .order("requested_at", { ascending: false });

  return NextResponse.json({ payouts: data || [] });
}
