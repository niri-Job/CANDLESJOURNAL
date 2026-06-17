import { createClient } from "@supabase/supabase-js";

const TRIAL_DAYS = 3;

// Maximum AI uses per feature during the 3-day trial (one-time, never reset)
export const TRIAL_LIMITS = {
  ai_analyses:         3,  // /api/analyze   ~$0.03 total
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
// All features are free until July 1, 2026 — this function always passes through.
// Per-feature rate limits are enforced directly in each API route.
export async function checkTrialAccess(
  _userId: string,
  _feature: TrialFeature,
  _opts: { consume?: boolean } = {}
): Promise<TrialResult> {
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
