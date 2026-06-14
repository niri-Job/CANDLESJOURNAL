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

export async function GET() {
  const supabase = await serverDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();

  const { data: analysts, error } = await db
    .from("alpha_points")
    .select("user_id, points, total_posts, tp_hits, sl_hits, accuracy_rate")
    .order("points", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!analysts?.length) return NextResponse.json({ leaderboard: [] });

  const userIds = analysts.map((a: { user_id: string }) => a.user_id);

  const [profilesRes, tradesRes, followsRes] = await Promise.all([
    db.from("user_profiles").select("user_id, name").in("user_id", userIds),
    db.from("trades").select("user_id, pnl").in("user_id", userIds),
    db.from("alpha_follows").select("analyst_id").in("analyst_id", userIds),
  ]);

  type Profile = { user_id: string; name: string | null };
  type Trade   = { user_id: string; pnl: number };
  type Follow  = { analyst_id: string };

  const profileMap: Record<string, Profile> = {};
  const tradeStats: Record<string, { wins: number; total: number }> = {};
  const followerCount: Record<string, number> = {};

  for (const p of (profilesRes.data ?? []) as Profile[]) profileMap[p.user_id] = p;
  for (const t of (tradesRes.data  ?? []) as Trade[]) {
    if (!tradeStats[t.user_id]) tradeStats[t.user_id] = { wins: 0, total: 0 };
    tradeStats[t.user_id].total++;
    if (t.pnl > 0) tradeStats[t.user_id].wins++;
  }
  for (const f of (followsRes.data ?? []) as Follow[]) {
    followerCount[f.analyst_id] = (followerCount[f.analyst_id] ?? 0) + 1;
  }

  type Analyst = { user_id: string; points: number; total_posts: number; tp_hits: number; sl_hits: number; accuracy_rate: number };

  const leaderboard = (analysts as Analyst[]).map((a) => {
    const stats    = tradeStats[a.user_id]   ?? { wins: 0, total: 0 };
    const winRate  = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
    const accuracy = a.accuracy_rate ?? 0;
    const followers= followerCount[a.user_id] ?? 0;
    const score    = winRate * 0.4 + accuracy * 0.4 + Math.min(followers, 100) * 0.2;
    return {
      ...a,
      user_profiles: profileMap[a.user_id] ?? null,
      trade_stats:   stats,
      win_rate:      winRate,
      follower_count: followers,
      score,
    };
  }).sort((a, b) => b.score - a.score).slice(0, 10);

  return NextResponse.json({ leaderboard });
}
