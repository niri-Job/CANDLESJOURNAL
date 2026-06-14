import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: Request) {
  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const analyst_id = searchParams.get("analyst_id");

  const db = svc();

  if (analyst_id) {
    const { data } = await db
      .from("alpha_follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("analyst_id", analyst_id)
      .maybeSingle();
    return NextResponse.json({ following: !!data });
  }

  // Return all followed analyst IDs
  const { data } = await db
    .from("alpha_follows")
    .select("analyst_id")
    .eq("follower_id", user.id);
  return NextResponse.json({ followed: (data ?? []).map((f: { analyst_id: string }) => f.analyst_id) });
}

export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { analyst_id } = body as { analyst_id: string };
  if (!analyst_id) return NextResponse.json({ error: "analyst_id required" }, { status: 400 });
  if (analyst_id === user.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  const db = svc();
  const { data: existing } = await db
    .from("alpha_follows")
    .select("id")
    .eq("follower_id", user.id)
    .eq("analyst_id", analyst_id)
    .maybeSingle();

  if (existing) {
    await db.from("alpha_follows").delete().eq("id", (existing as { id: string }).id);
    return NextResponse.json({ following: false });
  }

  await db.from("alpha_follows").insert({ follower_id: user.id, analyst_id });
  return NextResponse.json({ following: true });
}
