import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Service role bypasses ALL RLS — required because the EA has no user session.
function db() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

interface AccountInfo {
  account_signature?: string;
  account_label?: string;
  account_login?: string;
  account_server?: string;
  broker_name?: string;
  account_currency?: string;
  account_type?: string;
  is_cent?: boolean;
  current_balance?: number;
}

interface TradePayload {
  pair?: string;
  direction?: string;
  lot?: number;
  date?: string;
  entry?: number;
  exit_price?: number;
  sl?: number | null;
  tp?: number | null;
  pnl?: number;
  notes?: string;
  asset_class?: string;
  mt5_deal_id?: string;
  ticket?: string | number;     // MT5 deal/order ticket (alias for mt5_deal_id)
  close_time_unix?: number;     // Unix timestamp of close time for unique_trade_id
  is_cent?: boolean;
  contract_size?: number;
  tick_value?: number;
}

// EA sync is temporarily disabled — all requests return 503
export async function POST(_request: Request) {
  return NextResponse.json(
    { error: "EA sync is temporarily unavailable. Please use Quick Connect instead." },
    { status: 503 }
  );
}

export async function _POST_DISABLED(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, trade, trades: batchTrades, account, ping } = body as {
    token?: string;
    trade?: TradePayload;
    trades?: TradePayload[];
    account?: AccountInfo;
    ping?: boolean;
  };

  if (!token || typeof token !== "string")
    return NextResponse.json({ error: "Missing sync token" }, { status: 400 });

  let supabase: ReturnType<typeof db>;
  try {
    supabase = db();
  } catch {
    return NextResponse.json(
      { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 }
    );
  }

  // ── Validate token → resolve user_id ─────────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("mt5_sync_tokens")
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    console.error("MT5 sync: token lookup error:", tokenErr.message);
    return NextResponse.json({ error: "Token lookup failed: " + tokenErr.message }, { status: 500 });
  }
  if (!tokenRow)
    return NextResponse.json(
      { error: "Token not found — go to Settings page and click Generate Token" },
      { status: 401 }
    );

  const userId: string = tokenRow.user_id;

  // ── Ping / connection test (always allowed regardless of plan) ────────────
  if (ping === true)
    return NextResponse.json({ pong: true });

  // ── Subscription check: EA sync requires a paid plan ─────────────────────
  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("subscription_status")
    .eq("user_id", userId)
    .maybeSingle();
  const plan = (profileRow as { subscription_status: string | null } | null)
    ?.subscription_status ?? "free";

  if (plan !== "pro" && plan !== "starter") {
    return NextResponse.json(
      { error: "EA sync requires a paid plan. Upgrade at niri.app/pricing" },
      { status: 403 }
    );
  }

  // ── Upsert trading_accounts — EA is the authoritative source ─────────────
  let resolvedAccountSig: string | null = null;
  let resolvedAccountLabel: string | null = null;

  if (account?.account_signature) {
    resolvedAccountSig   = account.account_signature;
    resolvedAccountLabel = account.account_label || null;

    // Detect cent account from currency code
    const currency = (account.account_currency || "USD").toUpperCase();
    const isCentAccount = account.is_cent ?? (currency.includes("USC") || currency.includes("CENT"));

    const accountRow = {
      user_id:              userId,
      account_signature:    account.account_signature,
      account_label:        account.account_label    || null,
      account_login:        account.account_login    || null,
      account_server:       account.account_server   || null,
      broker_name:          account.broker_name      || null,
      account_currency:     account.account_currency || "USD",
      // EA sends ACCOUNT_TRADE_MODE — trust it directly, never override from user input
      account_type:         account.account_type     || "real",
      is_cent:              isCentAccount,
      current_balance:      account.current_balance  ?? null,
      last_synced_at:       new Date().toISOString(),
      // Verification: EA connection is authoritative
      verification_status:  "verified_ea",
      verification_method:  "EA",
      is_verified:          true,
      import_status:        "complete",
    };

    const { error: upsertErr } = await supabase
      .from("trading_accounts")
      .upsert(accountRow, { onConflict: "user_id,account_signature" });

    if (upsertErr)
      console.error("MT5 sync: trading_accounts upsert error:", upsertErr.message);
  }

  // ── Build trade list (single or batch) ────────────────────────────────────
  const tradeList: TradePayload[] =
    batchTrades && batchTrades.length > 0 ? batchTrades : trade ? [trade] : [];

  if (tradeList.length === 0)
    return NextResponse.json({ error: "Missing trade object in request body" }, { status: 400 });

  let successCount = 0;
  let dupCount = 0;
  const errors: string[] = [];

  for (const t of tradeList) {
    const {
      pair, direction, lot, date, entry, exit_price,
      sl, tp, pnl, notes, asset_class,
      mt5_deal_id, ticket, close_time_unix,
      is_cent: tradeLevelCent,
    } = t;

    if (!pair || !direction || !lot || !date || entry == null || exit_price == null || pnl == null) {
      errors.push(`Missing required fields: ${JSON.stringify({ pair, direction, lot, date })}`);
      continue;
    }

    // ── P&L normalization for cent accounts ─────────────────────────────────
    const isCentTrade = tradeLevelCent ?? account?.is_cent ?? false;
    const rawPnl      = Number(pnl);
    const normalizedPnl = isCentTrade ? rawPnl / 100 : rawPnl;

    // ── Generate unique_trade_id: {account_sig}_{ticket}_{close_time_unix} ──
    const dealId  = mt5_deal_id || ticket;
    const closeTs = close_time_unix ?? Math.floor(Date.parse(String(date)) / 1000);
    const uniqueTradeId = resolvedAccountSig && dealId
      ? `${resolvedAccountSig}_${dealId}_${closeTs}`
      : null;

    const payload = {
      user_id:             userId,
      pair:                String(pair).toUpperCase().trim(),
      direction:           String(direction).toUpperCase().trim(),
      lot:                 Number(lot),
      date:                String(date),
      entry:               Number(entry),
      exit_price:          Number(exit_price),
      sl:                  sl != null ? Number(sl) : null,
      tp:                  tp != null ? Number(tp) : null,
      pnl:                 normalizedPnl,
      notes:               notes || "Auto-synced from MT5",
      asset_class:         String(asset_class || "Forex"),
      session:             "London",
      setup:               "",
      mt5_deal_id:         dealId ? String(dealId) : null,
      account_signature:   resolvedAccountSig,
      account_label:       resolvedAccountLabel,
      normalized_pnl:      normalizedPnl,
      unique_trade_id:     uniqueTradeId,
      is_verified:         true,
      verification_method: "EA",
    };

    if (uniqueTradeId) {
      // Upsert — conflict on unique_trade_id silently skips duplicates
      const { error: upsertErr } = await supabase
        .from("trades")
        .upsert(payload, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true });
      if (upsertErr) {
        errors.push(`Upsert failed: ${upsertErr.message}`);
        continue;
      }
    } else {
      // Fallback: manual dedup via mt5_deal_id
      if (dealId) {
        const { data: dup } = await supabase
          .from("trades").select("id")
          .eq("user_id", userId).eq("mt5_deal_id", String(dealId)).maybeSingle();
        if (dup) { dupCount++; continue; }
      }
      const { error: insertErr } = await supabase.from("trades").insert(payload);
      if (insertErr) {
        errors.push(`Insert failed: ${insertErr.message}`);
        continue;
      }
    }

    successCount++;
  }

  // ── Update account import status ──────────────────────────────────────────
  if (resolvedAccountSig && successCount > 0) {
    const lastTrade = tradeList[tradeList.length - 1];
    const lastDealId = lastTrade?.mt5_deal_id || lastTrade?.ticket;
    await supabase
      .from("trading_accounts")
      .update({
        last_synced_at:   new Date().toISOString(),
        import_status:    "complete",
        ...(lastDealId ? { last_trade_id: String(lastDealId) } : {}),
      })
      .eq("user_id", userId)
      .eq("account_signature", resolvedAccountSig);
  }

  // ── Stamp last_sync_at on token row ───────────────────────────────────────
  await supabase
    .from("mt5_sync_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  if (errors.length > 0 && successCount === 0) {
    console.error("MT5 sync: all trades failed:", errors);
    return NextResponse.json({ error: errors[0], details: errors }, { status: 500 });
  }

  console.log(`MT5 sync: ${successCount} synced, ${dupCount} dups skipped, ${errors.length} errors`);
  return NextResponse.json({
    success:            true,
    account_signature:  resolvedAccountSig,
    trades_synced:      successCount,
    duplicates_skipped: dupCount,
    account_balance:    account?.current_balance ?? null,
  });
}
