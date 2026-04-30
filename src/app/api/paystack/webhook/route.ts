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

  // ── charge.success → activate / extend Pro + create commission ──────────────
  if (event.event === "charge.success") {
    const metadata = event.data.metadata as Record<string, unknown> | undefined;
    const customFields = metadata?.custom_fields as { value?: string }[] | undefined;
    const userId   = (metadata?.user_id ?? customFields?.[0]?.value) as string | undefined;
    const planType = (metadata?.plan_type ?? "pro") as string;

    if (!userId) {
      console.warn("webhook: charge.success missing user_id in metadata");
      return NextResponse.json({ received: true });
    }

    const now = new Date();
    const subscriptionEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { error: profileErr } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id:             userId,
          subscription_status: planType || "pro",
          subscription_start:  now.toISOString(),
          subscription_end:    subscriptionEnd.toISOString(),
          updated_at:          now.toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (profileErr) {
      console.error("webhook: failed to activate plan for user", userId, ":", profileErr.message);
    } else {
      console.log("webhook: plan activated for user", userId, "(", planType, ") until", subscriptionEnd.toISOString());
    }

    // Find referral for this user and create/update commission
    const { data: referral } = await supabase
      .from("referrals")
      .select("id, referrer_id, status, commission_rate")
      .eq("referred_id", userId)
      .maybeSingle();

    if (referral) {
      const commissionRate = planType === "pro" ? 1.00 : planType === "starter" ? 0.50 : 0.00;
      const month          = now.toISOString().slice(0, 7);

      // Activate referral if pending/inactive
      if (referral.status === "pending" || referral.status === "inactive") {
        await supabase
          .from("referrals")
          .update({
            status:          "active",
            plan_type:       planType,
            commission_rate: commissionRate,
            activated_at:    now.toISOString(),
            last_payment_at: now.toISOString(),
          })
          .eq("id", referral.id);
      } else {
        await supabase
          .from("referrals")
          .update({ last_payment_at: now.toISOString(), plan_type: planType, commission_rate: commissionRate })
          .eq("id", referral.id);
      }

      if (commissionRate > 0) {
        // Upsert commission for this month (idempotent on re-delivery)
        const { error: commErr } = await supabase
          .from("commissions")
          .upsert(
            {
              referral_id: referral.id,
              referrer_id: referral.referrer_id,
              month,
              amount:      commissionRate,
              status:      "pending",
            },
            { onConflict: "referral_id,month" }
          );

        if (commErr) {
          console.error("webhook: commission upsert failed:", commErr.message);
        } else {
          // Increment pending_earnings on referrer's profile
          await supabase.rpc("increment_pending_earnings", {
            p_user_id: referral.referrer_id,
            p_amount:  commissionRate,
          });
          console.log("webhook: commission created for referrer", referral.referrer_id, "amount", commissionRate);
        }
      }
    }
  }

  // ── subscription.disable → revert to free + cancel pending commissions ───────
  if (event.event === "subscription.disable") {
    const metadata = event.data.metadata as Record<string, unknown> | undefined;
    const customFields = metadata?.custom_fields as { value?: string }[] | undefined;
    const userId = (metadata?.user_id ?? customFields?.[0]?.value) as string | undefined;

    if (userId) {
      const { error: profileErr } = await supabase
        .from("user_profiles")
        .update({ subscription_status: "free", updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (profileErr) {
        console.error("webhook: failed to disable sub for user", userId, ":", profileErr.message);
      } else {
        console.log("webhook: subscription disabled for user", userId);
      }

      // Mark referral inactive and cancel this month's pending commission
      const { data: referral } = await supabase
        .from("referrals")
        .select("id, referrer_id")
        .eq("referred_id", userId)
        .maybeSingle();

      if (referral) {
        await supabase
          .from("referrals")
          .update({ status: "inactive", cancelled_at: new Date().toISOString() })
          .eq("id", referral.id);

        const thisMonth = new Date().toISOString().slice(0, 7);
        const { data: pendingComm } = await supabase
          .from("commissions")
          .select("id, amount")
          .eq("referral_id", referral.id)
          .eq("month", thisMonth)
          .eq("status", "pending")
          .maybeSingle();

        if (pendingComm) {
          await supabase
            .from("commissions")
            .update({ status: "cancelled" })
            .eq("id", pendingComm.id);

          // Decrement pending_earnings on referrer's profile
          await supabase.rpc("decrement_pending_earnings", {
            p_user_id: referral.referrer_id,
            p_amount:  pendingComm.amount,
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
