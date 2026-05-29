import type { SupabaseClient } from "@supabase/supabase-js";

export type BillingType = "monthly" | "yearly";

const DURATION_DAYS: Record<BillingType, number> = {
  monthly: 30,
  yearly:  365,
};

type ActivateArgs = {
  supabase: SupabaseClient;
  userId: string;
  planType?: string;
  metadataBillingType?: unknown;
  reference?: string;
  amount?: number;
  currency?: string;
  now?: Date;
};

export type ActivationResult = {
  billingType: BillingType;
  subscriptionEnd: Date;
};

export function normalizeBillingType(value: unknown): BillingType | null {
  return value === "yearly" || value === "monthly" ? value : null;
}

export async function activatePaidSubscription({
  supabase,
  userId,
  planType = "pro",
  metadataBillingType,
  reference,
  amount,
  currency,
  now = new Date(),
}: ActivateArgs): Promise<ActivationResult> {
  let transactionBillingType: BillingType | null = null;
  let transactionStatus: string | null = null;

  if (reference) {
    const { data: tx, error: txFetchErr } = await supabase
      .from("payment_transactions")
      .select("billing_type, status")
      .eq("reference", reference)
      .maybeSingle();

    if (txFetchErr) {
      console.warn("[subscriptionActivation] transaction lookup failed:", txFetchErr.message);
    } else {
      transactionBillingType = normalizeBillingType(
        (tx as { billing_type?: unknown } | null)?.billing_type
      );
      transactionStatus = (tx as { status?: string | null } | null)?.status ?? null;
    }
  }

  const billingType =
    normalizeBillingType(metadataBillingType) ??
    transactionBillingType ??
    "monthly";

  const { data: existingProfile, error: profileFetchErr } = await supabase
    .from("user_profiles")
    .select("subscription_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileFetchErr) {
    throw new Error("Failed to fetch existing subscription: " + profileFetchErr.message);
  }

  const existingEndRaw = (existingProfile as { subscription_end?: string | null } | null)
    ?.subscription_end;
  const existingEnd = existingEndRaw ? new Date(existingEndRaw) : null;

  if (transactionStatus === "success" && existingEnd) {
    return { billingType, subscriptionEnd: existingEnd };
  }

  const baseTime =
    existingEnd && existingEnd.getTime() > now.getTime()
      ? existingEnd.getTime()
      : now.getTime();

  const subscriptionEnd = new Date(baseTime + DURATION_DAYS[billingType] * 86_400_000);

  const { error: updateErr } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id:             userId,
        subscription_status: planType || "pro",
        subscription_type:   billingType,
        subscription_start:  now.toISOString(),
        subscription_end:    subscriptionEnd.toISOString(),
        updated_at:          now.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (updateErr) {
    throw new Error("Failed to activate subscription: " + updateErr.message);
  }

  if (reference) {
    const txPayload = {
      user_id:      userId,
      reference,
      amount:       amount ?? 0,
      currency:     currency ?? "NGN",
      plan_type:    planType || "pro",
      billing_type: billingType,
      status:       "success",
      verified_at:  now.toISOString(),
    };

    const { error: txUpdateErr } = transactionStatus === null
      ? await supabase.from("payment_transactions").insert(txPayload)
      : await supabase
        .from("payment_transactions")
        .update({
          billing_type: billingType,
          status:       "success",
          verified_at:  now.toISOString(),
        })
        .eq("reference", reference);

    if (txUpdateErr) {
      console.warn("[subscriptionActivation] transaction update failed:", txUpdateErr.message);
    }
  }

  return { billingType, subscriptionEnd };
}
