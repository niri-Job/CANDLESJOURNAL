import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  ()    => cookieStore.getAll(),
        setAll:  (cs)  => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

// GET /api/accounts/sync-status?signature=LOGIN_SERVER
export async function GET(request: NextRequest) {
  const signature = request.nextUrl.searchParams.get("signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature query param" }, { status: 400 });
  }

  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: acct, error } = await supabase
    .from("trading_accounts")
    .select("account_signature, sync_status, last_synced_at, sync_error, platform, sync_method")
    .eq("user_id", user.id)
    .eq("account_signature", signature)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!acct) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Total trades synced for this account
  const { count } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("account_signature", signature);

  return NextResponse.json({
    account_signature:   acct.account_signature,
    sync_status:         acct.sync_status  ?? "pending",
    last_synced_at:      acct.last_synced_at,
    sync_error:          acct.sync_error,
    platform:            acct.platform     ?? "MT5",
    sync_method:         acct.sync_method  ?? "ea",
    trades_synced_total: count             ?? 0,
  });
}
