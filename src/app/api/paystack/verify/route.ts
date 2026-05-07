import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { reference } = body as { reference?: string };
  if (!reference || typeof reference !== "string") {
    return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    console.error("verify: PAYSTACK_SECRET_KEY not set");
    return NextResponse.json(
      { error: "Server misconfiguration: PAYSTACK_SECRET_KEY not set" },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Verify transaction with Paystack ──────────────────────────────────────
  let verifyJson: {
    status: boolean;
    message: string;
    data?: {
      status: string;
      amount: number;
      currency: string;
      customer: { email: string };
    };
  };

  try {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    verifyJson = await verifyRes.json();
  } catch (err) {
    console.error("verify: Paystack API request failed:", err);
    return NextResponse.json({ error: "Could not reach Paystack API" }, { status: 502 });
  }

  if (!verifyJson.status || verifyJson.data?.status !== "success") {
    console.warn("verify: payment not successful:", verifyJson.message);
    return NextResponse.json(
      { error: "Payment was not successful: " + verifyJson.message },
      { status: 402 }
    );
  }

  // Accept NGN (inline popup) or USD (redirect flow)
  const currency = verifyJson.data.currency;
  if (currency !== "NGN" && currency !== "USD") {
    console.error("verify: unexpected currency", currency);
    return NextResponse.json({ error: "Unexpected payment currency" }, { status: 400 });
  }

  // NGN: 1,300,000 kobo ($13) or 14,040,000 kobo ($140.40)
  // USD: 1,300 cents ($13) or 14,040 cents ($140.40)
  const validAmounts: Record<string, number[]> = {
    NGN: [1_300_000, 14_040_000],
    USD: [1_300,     14_040],
  };
  if (!validAmounts[currency].includes(verifyJson.data.amount)) {
    console.error("verify: unexpected amount", verifyJson.data.amount, "for currency", currency);
    return NextResponse.json({ error: "Unexpected payment amount" }, { status: 400 });
  }

  // ── Activate Pro subscription ─────────────────────────────────────────────
  const now = new Date();
  const subscriptionEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: updateErr } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: user.id,
        subscription_status: "pro",
        subscription_start: now.toISOString(),
        subscription_end: subscriptionEnd.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (updateErr) {
    console.error("verify: failed to update subscription:", updateErr.message);
    return NextResponse.json(
      { error: "Payment confirmed but failed to activate subscription. Contact support with ref: " + reference },
      { status: 500 }
    );
  }

  console.log("verify: Pro activated for user", user.id, "until", subscriptionEnd.toISOString(), "ref:", reference);
  return NextResponse.json({
    success: true,
    subscription_end: subscriptionEnd.toISOString(),
  });
}
