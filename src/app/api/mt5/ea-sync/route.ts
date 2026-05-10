import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function assetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (["BTC", "ETH", "XRP", "LTC"].some((c) => s.includes(c))) return "Crypto";
  if (["XAU", "XAG"].some((c) => s.includes(c)))                 return "Metals";
  if (["US30", "NAS", "SPX", "DAX", "FTSE"].some((c) => s.includes(c))) return "Indices";
  if (["OIL", "BRENT", "WTI"].some((c) => s.includes(c)))        return "Commodities";
  return "Forex";
}

export async function POST(request: Request) {
  // Token-based auth — no user session required (EA has no browser cookie)
  const auth  = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token)
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    account_number,
    account_type: acctType,
    ticket, symbol, type: tradeType, volume,
    open_price, close_price, open_time, close_time,
    profit, commission, swap, comment,
  } = body as Record<string, string | number | undefined>;

  if (!account_number || !ticket || !symbol || !tradeType ||
      volume == null || close_time == null || profit == null)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  // Block demo accounts
  if (String(acctType ?? "").toLowerCase() === "demo") {
    return NextResponse.json({
      error: "NIRI only supports live MT5 accounts. Demo accounts are not supported.",
    }, { status: 403 });
  }

  let svc: ReturnType<typeof serviceDb>;
  try { svc = serviceDb(); }
  catch { return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 }); }

  // ── Token validation ─────────────────────────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await svc
    .from("ea_tokens")
    .select("id, user_id, account_number, broker_server")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !tokenRow)
    return NextResponse.json(
      { error: "Invalid token — generate a new EA at niri.live/settings" },
      { status: 401 }
    );

  // ── SERVER-SIDE ACCOUNT LOCK ─────────────────────────────────────────────
  // This is the real security check. The EA's client-side check is just UX.
  const claimedAccount    = String(account_number).trim();
  const registeredAccount = String(tokenRow.account_number).trim();

  if (claimedAccount !== registeredAccount) {
    // Log the attempt — fire and forget
    svc.from("fraud_attempts").insert({
      token,
      claimed_account:    claimedAccount,
      registered_account: registeredAccount,
      ip_address:         request.headers.get("x-forwarded-for") ?? null,
      user_agent:         request.headers.get("user-agent")      ?? null,
    }).then(() => {}, () => {});

    return NextResponse.json({
      error:   "EA not authorized for this account",
      message: "This token is registered to a different MT5 account. Download a new EA at niri.live/settings.",
    }, { status: 403 });
  }

  // ── Insert trade ─────────────────────────────────────────────────────────
  const userId         = tokenRow.user_id;
  const accountSig     = `${registeredAccount}_${tokenRow.broker_server}`;
  const dealId         = String(ticket);
  const closeTimestamp = typeof close_time === "number"
    ? close_time
    : parseInt(String(close_time), 10);

  const uniqueTradeId = `${accountSig}_${dealId}_${closeTimestamp}`;
  const closeDate     = new Date(closeTimestamp * 1000).toISOString().slice(0, 10);
  const symbolStr     = String(symbol).toUpperCase().trim();
  const direction     = String(tradeType).toUpperCase() === "BUY" ? "BUY" : "SELL";

  const tradeRow = {
    user_id:             userId,
    account_signature:   accountSig,
    pair:                symbolStr,
    direction,
    lot:                 Number(volume),
    date:                closeDate,
    entry:               Number(open_price   ?? 0),
    exit_price:          Number(close_price  ?? 0),
    sl:                  null,
    tp:                  null,
    pnl:                 Number(profit),
    notes:               comment ? String(comment) : "Auto-synced via NIRI EA",
    asset_class:         assetClass(symbolStr),
    session:             "London",
    setup:               "",
    mt5_deal_id:         dealId,
    unique_trade_id:     uniqueTradeId,
    is_verified:         true,
    verification_method: "EA",
  };

  // Upsert — unique_trade_id constraint silently skips duplicate sends
  const { error: upsertErr } = await svc
    .from("trades")
    .upsert(tradeRow, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true });

  if (upsertErr)
    return NextResponse.json(
      { error: "Failed to save trade: " + upsertErr.message },
      { status: 500 }
    );

  // Keep trading_accounts in sync with what the EA reports
  await svc.from("trading_accounts").upsert({
    user_id:             userId,
    account_signature:   accountSig,
    account_login:       registeredAccount,
    account_server:      tokenRow.broker_server,
    sync_method:         "ea",
    sync_status:         "connected",
    last_synced_at:      new Date().toISOString(),
    account_currency:    "USD",
    account_type:        "real",
    is_cent:             false,
    is_verified:         true,
    verification_status: "verified_ea",
    sync_error:          null,
  }, { onConflict: "user_id,account_signature" });

  // Stamp last_used_at on the token
  await svc.from("ea_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return NextResponse.json({
    success:           true,
    account_signature: accountSig,
  });
}
