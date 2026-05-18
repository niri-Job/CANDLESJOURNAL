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

function calcGrade(trades: number, winRate: number): string {
  if (trades < 20)                           return "ungraded";
  if (trades >= 200 && winRate >= 72)        return "elite";
  if (trades >= 100 && winRate >= 65)        return "gold";
  if (trades >= 50  && winRate >= 55)        return "silver";
  if (trades >= 20  && winRate >= 45)        return "bronze";
  return "ungraded";
}

export async function POST() {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const db = svc();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { data: providers, error } = await db
    .from("signal_providers")
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!providers || providers.length === 0) return NextResponse.json({ updated: 0 });

  let updated = 0;

  for (const prov of providers) {
    const { data: signals } = await db
      .from("provider_signals")
      .select("pnl, action")
      .eq("provider_id", prov.id)
      .eq("action", "close")
      .gte("created_at", since);

    const trades = signals ?? [];
    const total = trades.length;
    const wins = trades.filter((t: { pnl: number | null }) => (t.pnl ?? 0) > 0).length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    const gross_profit = trades.filter((t: { pnl: number | null }) => (t.pnl ?? 0) > 0).reduce((a: number, t: { pnl: number | null }) => a + (t.pnl ?? 0), 0);
    const gross_loss = Math.abs(trades.filter((t: { pnl: number | null }) => (t.pnl ?? 0) < 0).reduce((a: number, t: { pnl: number | null }) => a + (t.pnl ?? 0), 0));
    const profitFactor = gross_loss > 0 ? gross_profit / gross_loss : gross_profit > 0 ? 999 : 0;

    const grade = calcGrade(total, winRate);

    await db.from("signal_providers").update({
      grade,
      win_rate:      Math.round(winRate * 10) / 10,
      profit_factor: Math.round(profitFactor * 100) / 100,
      total_trades:  total,
    }).eq("id", prov.id);

    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}

export async function GET() {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const db = svc();
  const [providersRes, subsRes, todayTradesRes] = await Promise.all([
    db.from("signal_providers").select("id, name, grade, win_rate, total_trades, total_subscribers, is_active, is_verified, created_at"),
    db.from("copy_subscriptions").select("id", { count: "exact", head: true }),
    db.from("copied_trades").select("id", { count: "exact", head: true }).gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  return NextResponse.json({
    total_providers:      providersRes.data?.length ?? 0,
    total_subscriptions:  subsRes.count ?? 0,
    copied_trades_today:  todayTradesRes.count ?? 0,
    providers:            providersRes.data ?? [],
  });
}
