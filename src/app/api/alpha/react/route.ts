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

export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { post_id, type } = body as { post_id: string; type: "fire" | "accurate" | "wrong" };
  if (!post_id || !type) return NextResponse.json({ error: "post_id and type required" }, { status: 400 });

  const db = svc();
  const { data: existing } = await db
    .from("alpha_reactions")
    .select("id, type")
    .eq("post_id", post_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const prev = existing as { id: string; type: string } | null;

  if (prev) {
    if (prev.type === type) {
      await db.from("alpha_reactions").delete().eq("id", prev.id);
      return NextResponse.json({ reacted: false, type: null });
    }
    await db.from("alpha_reactions").update({ type }).eq("id", prev.id);
    return NextResponse.json({ reacted: true, type });
  }

  await db.from("alpha_reactions").insert({ post_id, user_id: user.id, type });

  // +20 points to post author for "accurate" reaction
  if (type === "accurate") {
    const { data: postRow } = await db.from("alpha_posts").select("user_id").eq("id", post_id).single();
    const p = postRow as { user_id: string } | null;
    if (p && p.user_id !== user.id) {
      const { data: pts } = await db.from("alpha_points").select("points").eq("user_id", p.user_id).maybeSingle();
      const cur = pts as { points?: number } | null;
      await db.from("alpha_points").upsert({
        user_id:    p.user_id,
        points:     (cur?.points ?? 0) + 20,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  }

  return NextResponse.json({ reacted: true, type });
}
