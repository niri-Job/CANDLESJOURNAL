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
  const sort      = searchParams.get("sort") ?? "latest";
  const filterPair = searchParams.get("pair");
  const filterDir  = searchParams.get("direction");
  const followingOnly = searchParams.get("following") === "true";

  const db = svc();

  // If following tab, get followed analyst IDs first
  let followedIds: string[] = [];
  if (followingOnly) {
    const { data: follows } = await db
      .from("alpha_follows")
      .select("analyst_id")
      .eq("follower_id", user.id);
    followedIds = (follows ?? []).map((f: { analyst_id: string }) => f.analyst_id);
    if (!followedIds.length) return NextResponse.json({ posts: [] });
  }

  let query = db.from("alpha_posts").select("*");

  if (followingOnly) query = query.in("user_id", followedIds);
  if (filterPair)    query = query.ilike("pair", filterPair);
  if (filterDir)     query = query.eq("direction", filterDir);
  if (sort === "accurate") query = query.eq("status", "tp_hit");
  query = query.order("created_at", { ascending: false }).limit(60);

  const { data: posts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!posts?.length) return NextResponse.json({ posts: [] });

  // Enrich with user_profiles, alpha_points, alpha_reactions, trade_stats
  const userIds = [...new Set(posts.map((p: { user_id: string }) => p.user_id))];
  const postIds  = posts.map((p: { id: string }) => p.id);

  const [profilesRes, pointsRes, reactionsRes, tradesRes] = await Promise.all([
    db.from("user_profiles").select("user_id, display_name, avatar_url").in("user_id", userIds),
    db.from("alpha_points").select("user_id, accuracy_rate, points, tp_hits, sl_hits, total_posts").in("user_id", userIds),
    db.from("alpha_reactions").select("post_id, type, user_id").in("post_id", postIds),
    db.from("trades").select("user_id, pnl").in("user_id", userIds),
  ]);

  type Profile  = { user_id: string; display_name: string | null; avatar_url: string | null };
  type Points   = { user_id: string; accuracy_rate: number; points: number; tp_hits: number; sl_hits: number; total_posts: number };
  type Reaction = { post_id: string; type: string; user_id: string };
  type Trade    = { user_id: string; pnl: number };

  const profileMap: Record<string, Profile>  = {};
  const pointsMap:  Record<string, Points>   = {};
  const tradeStats: Record<string, { wins: number; total: number }> = {};

  for (const p of (profilesRes.data ?? []) as Profile[])  profileMap[p.user_id] = p;
  for (const p of (pointsRes.data  ?? []) as Points[])    pointsMap[p.user_id]  = p;
  for (const t of (tradesRes.data  ?? []) as Trade[]) {
    if (!tradeStats[t.user_id]) tradeStats[t.user_id] = { wins: 0, total: 0 };
    tradeStats[t.user_id].total++;
    if (t.pnl > 0) tradeStats[t.user_id].wins++;
  }

  const reactByPost: Record<string, Reaction[]> = {};
  for (const r of (reactionsRes.data ?? []) as Reaction[]) {
    if (!reactByPost[r.post_id]) reactByPost[r.post_id] = [];
    reactByPost[r.post_id].push(r);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let enriched = posts.map((post: any) => ({
    ...post,
    user_profiles: profileMap[post.user_id] ?? null,
    alpha_points:  pointsMap[post.user_id]  ?? null,
    alpha_reactions: reactByPost[post.id]   ?? [],
    trade_stats:   tradeStats[post.user_id] ?? { wins: 0, total: 0 },
  }));

  if (sort === "top") {
    enriched = enriched.sort((a: { alpha_reactions: Reaction[] }, b: { alpha_reactions: Reaction[] }) =>
      b.alpha_reactions.length - a.alpha_reactions.length
    );
  }

  return NextResponse.json({ posts: enriched });
}

export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();

  const { count } = await db
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) < 20) {
    return NextResponse.json(
      { error: "You need at least 20 trades to post analysis" },
      { status: 403 }
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { pair, direction, entry_from, entry_to, stop_loss, take_profit, timeframe, write_up } = body as {
    pair: string; direction: string; entry_from?: number; entry_to?: number;
    stop_loss?: number; take_profit?: number; timeframe?: string; write_up?: string;
  };

  if (!pair || !direction) return NextResponse.json({ error: "pair and direction required" }, { status: 400 });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: post, error } = await db.from("alpha_posts").insert({
    user_id: user.id,
    pair: pair.toUpperCase().trim(),
    direction,
    entry_from:  entry_from  ?? null,
    entry_to:    entry_to    ?? null,
    stop_loss:   stop_loss   ?? null,
    take_profit: take_profit ?? null,
    timeframe:   timeframe   ?? null,
    write_up:    write_up?.slice(0, 500) ?? null,
    status:      "pending",
    locked_at:   now.toISOString(),
    expires_at:  expiresAt.toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // +5 points
  const { data: existing } = await db.from("alpha_points").select("points, total_posts").eq("user_id", user.id).maybeSingle();
  const prev = existing as { points?: number; total_posts?: number } | null;
  await db.from("alpha_points").upsert({
    user_id:    user.id,
    points:     (prev?.points     ?? 0) + 5,
    total_posts:(prev?.total_posts ?? 0) + 1,
    updated_at: now.toISOString(),
  }, { onConflict: "user_id" });

  return NextResponse.json({ post }, { status: 201 });
}
