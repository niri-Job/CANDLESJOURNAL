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

// GET /api/admin/users?search=email@...
export async function GET(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase().trim() ?? "";

  const db = svc();

  // Load auth users (up to 500) and profiles in parallel
  const [authRes, profilesRes] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 500 }),
    db.from("user_profiles")
      .select("user_id, subscription_status, subscription_end, ai_credits_used, ai_credits_limit, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const authUsers = authRes.data?.users ?? [];
  const profiles  = profilesRes.data ?? [];

  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  let users = authUsers.map((u) => {
    const p = profileMap.get(u.id);
    const isPro = p?.subscription_status === "pro" &&
      !!p?.subscription_end &&
      new Date(p.subscription_end) > new Date();
    const trialEnd  = p?.created_at
      ? new Date(new Date(p.created_at).getTime() + 14 * 86_400_000)
      : null;
    const trialActive = !isPro && !!trialEnd && trialEnd > new Date();
    return {
      id:               u.id,
      email:            u.email ?? "",
      created_at:       u.created_at,
      last_sign_in_at:  u.last_sign_in_at ?? null,
      subscription_status: p?.subscription_status ?? "free",
      subscription_end:    p?.subscription_end ?? null,
      ai_credits_used:     p?.ai_credits_used ?? 0,
      ai_credits_limit:    p?.ai_credits_limit ?? 3,
      is_pro:           isPro,
      trial_active:     trialActive,
      trial_ends_at:    trialEnd?.toISOString() ?? null,
    };
  });

  if (search) users = users.filter((u) => u.email.toLowerCase().includes(search));

  // Sort: newest first
  users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ users: users.slice(0, 200) });
}

// POST /api/admin/users
// Body: { action: "set_pro" | "extend_trial", userId: string }
export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  let body: { action?: string; userId?: string };
  try { body = await request.json(); } catch { body = {}; }

  const { action, userId } = body;
  if (!action || !userId)
    return NextResponse.json({ error: "action and userId required" }, { status: 400 });

  const db = svc();

  if (action === "set_pro") {
    const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { error } = await db.from("user_profiles")
      .update({ subscription_status: "pro", subscription_end: end, ai_credits_limit: 90 })
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "extend_trial") {
    // Extend by 30 days: push created_at forward 30 days
    const { data: profile } = await db.from("user_profiles")
      .select("created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const extended = new Date(
      new Date(profile.created_at).getTime() + 30 * 86_400_000
    ).toISOString();

    const { error } = await db.from("user_profiles")
      .update({ created_at: extended })
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
