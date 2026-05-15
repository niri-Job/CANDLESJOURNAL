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
  const requestId = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.log(`[ea-sync:${requestId}] ── NEW REQUEST ──────────────────────────────`);

  // ── Auth header ──────────────────────────────────────────────────────────
  const auth  = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const tokenPreview = token ? `${token.slice(0, 8)}…(len=${token.length})` : "(none)";
  console.log(`[ea-sync:${requestId}] Auth header: "${auth.slice(0, 20)}…"  token=${tokenPreview}`);

  if (!token) {
    console.log(`[ea-sync:${requestId}] REJECTED: Missing or malformed Authorization header`);
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await request.json(); }
  catch (e) {
    console.log(`[ea-sync:${requestId}] REJECTED: Invalid JSON — ${e}`);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    account_number,
    account_type: acctType,
    ticket, symbol, type: tradeType, volume,
    open_price, close_price, open_time, close_time,
    profit, commission, swap, comment,
  } = body as Record<string, string | number | undefined>;

  console.log(`[ea-sync:${requestId}] Body fields received: ${Object.keys(body as object).join(", ")}`);
  console.log(`[ea-sync:${requestId}] Values: account=${account_number} acct_type=${acctType} ticket=${ticket} symbol=${symbol} type=${tradeType} volume=${volume} profit=${profit} close_time=${close_time}(type=${typeof close_time}) open_time=${open_time}`);

  // ── Required field check ─────────────────────────────────────────────────
  if (!account_number || !ticket || !symbol || !tradeType ||
      volume == null || close_time == null || profit == null) {
    const missing = ["account_number","ticket","symbol","type","volume","close_time","profit"]
      .filter(f => (body as Record<string,unknown>)[f] == null);
    console.log(`[ea-sync:${requestId}] REJECTED: Missing required fields: ${missing.join(", ")}`);
    return NextResponse.json({ error: "Missing required fields", missing }, { status: 400 });
  }

  // ── DB client ────────────────────────────────────────────────────────────
  let svc: ReturnType<typeof serviceDb>;
  try { svc = serviceDb(); }
  catch (e) {
    console.log(`[ea-sync:${requestId}] ERROR: serviceDb() failed — ${e}`);
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // ── Token validation ─────────────────────────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await svc
    .from("ea_tokens")
    .select("id, user_id, account_number, broker_server")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    console.log(`[ea-sync:${requestId}] REJECTED: Token DB lookup error — ${tokenErr.message}`);
    return NextResponse.json({ error: "Invalid token — generate a new EA at niri.live/settings" }, { status: 401 });
  }
  if (!tokenRow) {
    console.log(`[ea-sync:${requestId}] REJECTED: Token not found in ea_tokens (token=${tokenPreview})`);
    return NextResponse.json({ error: "Invalid token — generate a new EA at niri.live/settings" }, { status: 401 });
  }

  console.log(`[ea-sync:${requestId}] Token OK → user=${tokenRow.user_id} registered_account=${tokenRow.account_number} broker=${tokenRow.broker_server}`);

  // ── Demo account block ───────────────────────────────────────────────────
  const DEV_USER_ID = "b9433d15-02e3-44ed-b66f-b4f51f22fac7";
  const acctTypeLower = String(acctType ?? "").toLowerCase();
  console.log(`[ea-sync:${requestId}] Account type received: "${acctTypeLower}"`);
  if (acctTypeLower === "demo" && tokenRow.user_id !== DEV_USER_ID) {
    console.log(`[ea-sync:${requestId}] REJECTED: Demo account blocked for user ${tokenRow.user_id}`);
    return NextResponse.json({
      error: "NIRI only supports live MT5 accounts. Demo accounts are not supported.",
    }, { status: 403 });
  }

  // ── Account number lock ───────────────────────────────────────────────────
  const claimedAccount    = String(account_number).trim();
  const registeredAccount = String(tokenRow.account_number).trim();
  console.log(`[ea-sync:${requestId}] Account check: claimed="${claimedAccount}" registered="${registeredAccount}" match=${claimedAccount === registeredAccount}`);

  if (claimedAccount !== registeredAccount) {
    console.log(`[ea-sync:${requestId}] REJECTED: Account mismatch`);
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

  // ── Build trade record ───────────────────────────────────────────────────
  const userId     = tokenRow.user_id;
  const accountSig = `${registeredAccount}_${tokenRow.broker_server}`;
  const dealId     = String(ticket);

  // close_time may arrive as Unix timestamp (number) or MT5 string — log raw value
  const closeTimestamp = typeof close_time === "number"
    ? close_time
    : parseInt(String(close_time), 10);
  const closeDate = new Date(closeTimestamp * 1000).toISOString().slice(0, 10);
  console.log(`[ea-sync:${requestId}] close_time raw=${close_time} parsed_ts=${closeTimestamp} → date=${closeDate}`);

  const symbolStr     = String(symbol).toUpperCase().trim();
  const direction     = String(tradeType).toUpperCase() === "BUY" ? "BUY" : "SELL";
  const uniqueTradeId = `${accountSig}_${dealId}_${closeTimestamp}`;

  console.log(`[ea-sync:${requestId}] unique_trade_id=${uniqueTradeId} symbol=${symbolStr} dir=${direction} pnl=${profit} date=${closeDate}`);

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

  // Check if this trade already exists (to know whether it's new)
  const { data: existingTrade, error: existingErr } = await svc
    .from("trades")
    .select("id")
    .eq("user_id", userId)
    .eq("unique_trade_id", uniqueTradeId)
    .maybeSingle();

  if (existingErr) {
    console.log(`[ea-sync:${requestId}] WARN: duplicate-check query failed — ${existingErr.message}`);
  }
  const isNewTrade = !existingTrade;
  console.log(`[ea-sync:${requestId}] Trade ${isNewTrade ? "NEW — will insert" : "DUPLICATE — will skip"} (unique_trade_id=${uniqueTradeId})`);

  // Upsert — unique_trade_id constraint silently skips duplicate sends
  const { error: upsertErr } = await svc
    .from("trades")
    .upsert(tradeRow, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true });

  if (upsertErr) {
    console.log(`[ea-sync:${requestId}] DB ERROR upserting trade: ${upsertErr.message} | code=${upsertErr.code} | details=${upsertErr.details}`);
    return NextResponse.json(
      { error: "Failed to save trade: " + upsertErr.message },
      { status: 500 }
    );
  }

  console.log(`[ea-sync:${requestId}] SUCCESS: trade ${isNewTrade ? "inserted" : "skipped (duplicate)"} — ${uniqueTradeId}`);

  // Insert a per-user notification for the new trade (throttled: at most 1 per hour)
  if (isNewTrade) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentNotif } = await svc
      .from("notifications")
      .select("id")
      .eq("target_user_id", userId)
      .gte("created_at", oneHourAgo)
      .maybeSingle();

    if (!recentNotif) {
      const pnl      = Number(profit);
      const pnlSign  = pnl >= 0 ? "+" : "";
      const pnlStr   = `${pnlSign}$${pnl.toFixed(2)}`;
      await svc.from("notifications").insert({
        title:          "Trade Synced from MT5",
        message:        `${symbolStr} ${direction} — PnL: ${pnlStr}`,
        target_user_id: userId,
        is_active:      true,
      });
    }
  }

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

  console.log(`[ea-sync:${requestId}] ── DONE ────────────────────────────────────`);
  return NextResponse.json({
    success:           true,
    is_new:            isNewTrade,
    is_duplicate:      !isNewTrade,
    account_signature: accountSig,
    trade_date:        closeDate,
    unique_trade_id:   uniqueTradeId,
  });
}
