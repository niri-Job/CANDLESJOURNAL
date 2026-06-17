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

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return email.slice(0, 3) + "***";
  const local  = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  return local.slice(0, 3) + "***@" + domain;
}

export async function GET() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = serviceDb();

  const { data: referrals } = await svc
    .from("referrals")
    .select("id, referred_email, status, created_at")
    .eq("referrer_user_id", user.id)
    .order("created_at", { ascending: false });

  const list = (referrals ?? []).map((r) => ({
    id:        r.id,
    email:     maskEmail(r.referred_email),
    status:    r.status as "pending" | "converted" | "paid",
    joined_at: r.created_at,
  }));

  return NextResponse.json({ referrals: list });
}
