import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const db = svc();

  const { data: providers, error } = await db
    .from("signal_providers")
    .select("id, name, description, strategy, broker, broker_server, avatar_url, is_verified, verified_at, grade, max_drawdown, total_subscribers, monthly_fee, account_currency, created_at")
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!providers || providers.length === 0) return NextResponse.json({ providers: [] });

  // Fetch all closed signals for every active provider in one query
  const ids = providers.map((p: { id: string }) => p.id);
  const { data: signals } = await db
    .from("provider_signals")
    .select("provider_id, pnl")
    .in("provider_id", ids)
    .eq("action", "close");

  // Aggregate per provider
  type Agg = { total: number; wins: number; grossProfit: number; grossLoss: number };
  const agg: Record<string, Agg> = {};
  for (const sig of (signals ?? []) as { provider_id: string; pnl: number | null }[]) {
    if (!agg[sig.provider_id]) agg[sig.provider_id] = { total: 0, wins: 0, grossProfit: 0, grossLoss: 0 };
    const a = agg[sig.provider_id];
    const pnl = sig.pnl ?? 0;
    a.total++;
    if (pnl > 0) { a.wins++; a.grossProfit += pnl; }
    else if (pnl < 0) { a.grossLoss += Math.abs(pnl); }
  }

  const enriched = providers
    .map((p: Record<string, unknown>) => {
      const a = agg[p.id as string] ?? { total: 0, wins: 0, grossProfit: 0, grossLoss: 0 };
      const winRate      = a.total > 0 ? (a.wins / a.total) * 100 : 0;
      const profitFactor = a.grossLoss > 0 ? a.grossProfit / a.grossLoss : a.grossProfit > 0 ? 999 : 0;
      return {
        ...p,
        total_trades:  a.total,
        win_rate:      Math.round(winRate * 10) / 10,
        profit_factor: Math.round(profitFactor * 100) / 100,
      };
    })
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      (b.total_trades as number) - (a.total_trades as number)
    );

  return NextResponse.json({ providers: enriched });
}
