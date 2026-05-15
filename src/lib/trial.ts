import { createClient } from "@supabase/supabase-js";

// Developer account — always treated as Pro, bypasses all trial logic
const DEV_USER_ID = "b9433d15-02e3-44ed-b66f-b4f51f22fac7";

const TRIAL_DAYS = 30;

// Maximum AI uses per feature during the 30-day trial (one-time, never reset)
export const TRIAL_LIMITS = {
  ai_analyses:         3,  // /api/analyze   ~$0.03 total
  market_intelligence: 3,  // /api/intelligence ~$0.03 total
  psychology_reports:  1,  // /api/trade-insight ~$0.01 total
} as const;

export type TrialFeature = keyof typeof TRIAL_LIMITS;

export type TrialResult =
  | { ok: true }
  | { ok: false; reason: "expired";      message: string; httpStatus: 403 }
  | { ok: false; reason: "limit_reached"; message: string; httpStatus: 403 };

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Check whether a trial user has access to a feature, and optionally consume
 * one credit. Paid Pro users always pass through.
 *
 * @param userId   The authenticated user's ID.
 * @param feature  Which AI feature is being used.
 * @param consume  If true, increment the usage counter when access is granted.
 *                 Pass false for read-only checks (e.g. UI gatekeeping).
 */
export async function checkTrialAccess(
  userId: string,
  feature: TrialFeature,
  { consume = false }: { consume?: boolean } = {}
): Promise<TrialResult> {
  // Developer account: always allowed
  if (userId === DEV_USER_ID) return { ok: true };

  const sb = serviceDb();

  // ── 1. Fetch user profile ─────────────────────────────────────────────────
  const { data: profile } = await sb
    .from("user_profiles")
    .select("subscription_status, subscription_end, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Paid active Pro: no limits
  const active =
    !!profile?.subscription_end &&
    new Date(profile.subscription_end) > new Date();
  if (profile?.subscription_status === "pro" && active) {
    return { ok: true };
  }

  // ── 2. Check trial expiry ──────────────────────────────────────────────────
  const createdAt = (profile as { created_at?: string } | null)?.created_at;
  const trialEnd = createdAt
    ? new Date(new Date(createdAt).getTime() + TRIAL_DAYS * 86_400_000)
    : null;

  if (!trialEnd || Date.now() > trialEnd.getTime()) {
    return {
      ok:         false,
      reason:     "expired",
      message:    "Your 30-day free trial has ended. Upgrade to Pro to continue.",
      httpStatus: 403,
    };
  }

  // ── 3. Check feature usage count ──────────────────────────────────────────
  const { data: usage, error: usageErr } = await sb
    .from("trial_usage")
    .select("ai_analyses, market_intelligence, psychology_reports")
    .eq("user_id", userId)
    .maybeSingle();

  // If the trial_usage table doesn't exist yet, fail open with a warning.
  // This prevents a missing migration from blocking all users.
  if (usageErr) {
    const isMissingTable = usageErr.message?.includes("relation") ||
      usageErr.message?.includes("does not exist") ||
      usageErr.code === "42P01";
    if (isMissingTable) {
      console.warn("trial: trial_usage table not found — run the migration. Failing open.");
      return { ok: true };
    }
    console.error("trial: usage fetch error:", usageErr.message);
    return { ok: true }; // fail open on unexpected DB errors
  }

  const currentCount = (usage as Record<string, number> | null)?.[feature] ?? 0;
  const limit        = TRIAL_LIMITS[feature];

  if (currentCount >= limit) {
    const featureLabel =
      feature === "ai_analyses"         ? "90 analyses/month"        :
      feature === "market_intelligence"  ? "unlimited Market Intelligence" :
                                           "unlimited trade insights";
    return {
      ok:         false,
      reason:     "limit_reached",
      message:    `You've used your free trial AI credits. Upgrade to Pro for ${featureLabel}.`,
      httpStatus: 403,
    };
  }

  // ── 4. Consume a credit if requested ──────────────────────────────────────
  if (consume) {
    if (usage) {
      await sb
        .from("trial_usage")
        .update({ [feature]: currentCount + 1 })
        .eq("user_id", userId);
    } else {
      // First use — insert a fresh row
      await sb
        .from("trial_usage")
        .insert({ user_id: userId, [feature]: 1 });
    }
  }

  return { ok: true };
}

/**
 * Returns { expired: boolean, daysLeft: number } for a userId.
 * Used by server-side page components or middleware.
 */
export async function getTrialStatus(userId: string): Promise<{
  isPro: boolean;
  expired: boolean;
  daysLeft: number;
}> {
  if (userId === DEV_USER_ID) return { isPro: true, expired: false, daysLeft: 999 };

  const sb = serviceDb();
  const { data: profile } = await sb
    .from("user_profiles")
    .select("subscription_status, subscription_end, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  const active =
    !!profile?.subscription_end &&
    new Date(profile.subscription_end) > new Date();
  if (profile?.subscription_status === "pro" && active) {
    return { isPro: true, expired: false, daysLeft: 0 };
  }

  const createdAt = (profile as { created_at?: string } | null)?.created_at;
  if (!createdAt) return { isPro: false, expired: true, daysLeft: 0 };

  const trialEnd  = new Date(new Date(createdAt).getTime() + TRIAL_DAYS * 86_400_000);
  const daysLeft  = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000));
  return { isPro: false, expired: daysLeft === 0, daysLeft };
}
