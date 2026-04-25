import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

function db() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request: Request) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    console.error("webhook: PAYSTACK_SECRET_KEY not set");
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 });
  }

  // ── Verify webhook signature (HMAC-SHA512) ────────────────────────────────
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  const expectedHash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (expectedHash !== signature) {
    console.warn("webhook: invalid signature — ignored");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("webhook: received event:", event.event);

  let supabase: ReturnType<typeof db>;
  try {
    supabase = db();
  } catch (err) {
    console.error("webhook: service role client failed:", err);
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // ── charge.success → activate / extend Pro ────────────────────────────────
  if (event.event === "charge.success") {
    const metadata = event.data.metadata as Record<string, unknown> | undefined;
    const customFields = metadata?.custom_fields as { value?: string }[] | undefined;
    const userId = (metadata?.user_id ?? customFields?.[0]?.value) as string | undefined;

    if (!userId) {
      console.warn("webhook: charge.success missing user_id in metadata");
      return NextResponse.json({ received: true });
    }

    const now = new Date();
    const subscriptionEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          subscription_status: "pro",
          subscription_start: now.toISOString(),
          subscription_end: subscriptionEnd.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("webhook: failed to activate Pro for user", userId, ":", error.message);
    } else {
      console.log("webhook: Pro activated for user", userId, "until", subscriptionEnd.toISOString());
    }
  }

  // ── subscription.disable → revert to free ─────────────────────────────────
  if (event.event === "subscription.disable") {
    const metadata = event.data.metadata as Record<string, unknown> | undefined;
    const customFields = metadata?.custom_fields as { value?: string }[] | undefined;
    const userId = (metadata?.user_id ?? customFields?.[0]?.value) as string | undefined;

    if (userId) {
      const { error } = await supabase
        .from("user_profiles")
        .update({ subscription_status: "free", updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) {
        console.error("webhook: failed to disable sub for user", userId, ":", error.message);
      } else {
        console.log("webhook: subscription disabled for user", userId);
      }
    }
  }

  return NextResponse.json({ received: true });
}
