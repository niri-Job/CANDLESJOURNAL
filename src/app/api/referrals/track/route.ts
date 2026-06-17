import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

export const dynamic = "force-dynamic";

async function serverDb() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => store.set(name, value, options)) } }
  );
}
function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST /api/referrals/track
// Body: { referral_code: string }
// Called from login page immediately after signup
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { referral_code } = body as Record<string, string | undefined>;
  if (!referral_code?.trim()) return NextResponse.json({ error: "referral_code required" }, { status: 400 });

  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc  = serviceDb();
  const code = referral_code.trim().toUpperCase();

  // Look up referrer by code
  const { data: referrer } = await svc
    .from("user_profiles")
    .select("user_id")
    .eq("referral_code", code)
    .maybeSingle();

  if (!referrer) return NextResponse.json({ ok: true, note: "invalid code — ignored" });
  if (referrer.user_id === user.id) return NextResponse.json({ ok: true, note: "self-referral ignored" });

  // Skip if already referred
  const { data: existing } = await svc
    .from("referrals")
    .select("id")
    .eq("referred_user_id", user.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ ok: true, note: "already tracked" });

  // Insert referral row
  const { error: insertErr } = await svc.from("referrals").insert({
    referrer_user_id: referrer.user_id,
    referred_user_id: user.id,
    referred_email:   user.email ?? null,
    status:           "pending",
  });

  if (insertErr) {
    console.error("[referrals/track] insert error:", insertErr.message);
    return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
  }

  // Save referred_by on the new user's profile
  await svc.from("user_profiles").upsert(
    { user_id: user.id, referred_by: code },
    { onConflict: "user_id" }
  );

  console.log(`[referrals/track] tracked: ${user.email} referred by code ${code}`);
  return NextResponse.json({ ok: true });
}
