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

export async function GET() {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const db = svc();

  const [authRes, profilesRes, tradesRes, accountsRes] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 500 }),
    db.from("user_profiles").select("user_id, onboarding_completed"),
    db.from("trades").select("user_id, source, created_at"),
    db.from("trading_accounts").select("user_id, metaapi_account_id, last_synced_at"),
  ]);

  const authUsers = authRes.data?.users ?? [];
  const profiles  = profilesRes.data ?? [];
  const allTrades = (tradesRes.data ?? []) as { user_id: string; source: string | null; created_at: string }[];
  const accounts  = (accountsRes.data ?? []) as { user_id: string; metaapi_account_id: string | null; last_synced_at: string | null }[];

  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  // Group by user
  const tradesByUser  = new Map<string, typeof allTrades>();
  const accountsByUser = new Map<string, typeof accounts>();

  for (const t of allTrades) {
    if (!tradesByUser.has(t.user_id)) tradesByUser.set(t.user_id, []);
    tradesByUser.get(t.user_id)!.push(t);
  }
  for (const a of accounts) {
    if (!accountsByUser.has(a.user_id)) accountsByUser.set(a.user_id, []);
    accountsByUser.get(a.user_id)!.push(a);
  }

  const activity = authUsers.map((u) => {
    const profile      = profileMap.get(u.id);
    const userTrades   = tradesByUser.get(u.id) ?? [];
    const userAccounts = accountsByUser.get(u.id) ?? [];

    const csvImports   = userTrades.filter((t) => t.source === "csv").length;
    const hasMetaApi   = userAccounts.some((a) => a.metaapi_account_id != null);

    const lastTrade    = userTrades.length > 0
      ? userTrades.reduce((a, b) => a.created_at > b.created_at ? a : b).created_at
      : null;
    const lastSynced   = userAccounts.reduce<string | null>((max, a) => {
      if (!a.last_synced_at) return max;
      if (!max) return a.last_synced_at;
      return a.last_synced_at > max ? a.last_synced_at : max;
    }, null);
    const lastActive   = lastTrade && lastSynced
      ? (lastTrade > lastSynced ? lastTrade : lastSynced)
      : (lastTrade ?? lastSynced);

    return {
      id:                   u.id,
      email:                u.email ?? "",
      signup_date:          u.created_at,
      total_trades:         userTrades.length,
      csv_imports:          csvImports,
      has_metaapi:          hasMetaApi,
      last_active:          lastActive,
      onboarding_completed: profile?.onboarding_completed ?? false,
    };
  });

  return NextResponse.json({ activity });
}
