import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

// Amounts in NGN kobo (₦15,000 monthly, ₦162,000 yearly)
const PRO_MONTHLY_CENTS = 1_500_000;
const PRO_YEARLY_CENTS  = 16_200_000;

async function userDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll:  (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// POST /api/payments/initialize
// Body: { plan: "pro", billing: "monthly" | "yearly" }
// Returns: { authorization_url, reference }
export async function POST(request: Request) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "PAYSTACK_SECRET_KEY not configured" }, { status: 500 });
  }

  const supabase = await userDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: string; billing?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const plan    = body.plan    === "pro" ? "pro" : "pro"; // only pro for now
  const billing = body.billing === "yearly" ? "yearly" : "monthly";
  const amount  = billing === "yearly" ? PRO_YEARLY_CENTS : PRO_MONTHLY_CENTS;

  const reference = `niri_${plan}_${billing === "yearly" ? "yr" : "mo"}_${Date.now()}_${user.id.slice(0, 8)}`;
  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://niri.live";
  const callbackUrl = `${siteUrl}/payment/verify?reference=${reference}`;

  // ── Call Paystack /transaction/initialize ─────────────────────────────────
  let paystackData: { authorization_url: string; access_code: string; reference: string };
  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email:        user.email,
        amount,
        currency:     "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          user_id:      user.id,
          plan_type:    plan,
          billing_type: billing,
        },
      }),
    });
    const json = await res.json() as { status: boolean; message: string; data?: typeof paystackData };
    if (!json.status || !json.data) {
      console.error("initialize: Paystack error:", json.message);
      return NextResponse.json({ error: json.message ?? "Paystack initialization failed" }, { status: 502 });
    }
    paystackData = json.data;
  } catch (err) {
    console.error("initialize: network error:", err);
    return NextResponse.json({ error: "Could not reach Paystack" }, { status: 502 });
  }

  // ── Record the pending transaction ────────────────────────────────────────
  try {
    const svc = serviceDb();
    await svc.from("payment_transactions").insert({
      user_id:      user.id,
      reference,
      amount,
      currency:     "NGN",
      plan_type:    plan,
      billing_type: billing,
      status:       "pending",
    });
  } catch (err) {
    // Non-fatal — the payment can still proceed
    console.warn("initialize: failed to log transaction:", err);
  }

  return NextResponse.json({
    authorization_url: paystackData.authorization_url,
    reference,
  });
}
