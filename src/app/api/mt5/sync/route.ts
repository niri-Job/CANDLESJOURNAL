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
  is_cent?: boolean;
  contract_size?: number;
  tick_value?: number;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, trade, account, ping } = body as {
    token?: string;
    trade?: TradePayload;
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

  // ── Ping / connection test (must respond before trade validation) ─────────
  if (ping === true)
    return NextResponse.json({ pong: true });

  // ── Validate required trade fields ────────────────────────────────────────
  if (!trade)
    return NextResponse.json({ error: "Missing trade object in request body" }, { status: 400 });

  const {
    pair, direction, lot, date, entry, exit_price,
    sl, tp, pnl, notes, asset_class, mt5_deal_id,
    is_cent: tradeLevelCent,
  } = trade;

  if (!pair || !direction || !lot || !date || entry == null || exit_price == null || pnl == null)
    return NextResponse.json(
      { error: "Missing required trade fields", received: { pair, direction, lot, date, entry, exit_price, pnl } },
      { status: 400 }
    );

  // ── Dedup: skip if this exact MT5 deal was already synced ─────────────────
  if (mt5_deal_id) {
    const { data: dup } = await supabase
      .from("trades")
      .select("id")
      .eq("user_id", userId)
      .eq("mt5_deal_id", mt5_deal_id)
      .maybeSingle();
    if (dup) {
      console.log("MT5 sync: duplicate deal", mt5_deal_id, "— skipped");
      return NextResponse.json({ success: true, duplicate: true });
    }
  }

  // ── Upsert trading_accounts when account info is provided ─────────────────
  let resolvedAccountSig: string | null = null;
  let resolvedAccountLabel: string | null = null;

  if (account?.account_signature) {
    resolvedAccountSig   = account.account_signature;
    resolvedAccountLabel = account.account_label || null;

    const accountRow = {
      user_id:           userId,
      account_signature: account.account_signature,
      account_label:     account.account_label     || null,
      account_login:     account.account_login     || null,
      account_server:    account.account_server    || null,
      broker_name:       account.broker_name       || null,
      account_currency:  account.account_currency  || "USD",
      account_type:      account.account_type      || "real",
      is_cent:           account.is_cent            ?? false,
      current_balance:   account.current_balance    ?? null,
      last_synced_at:    new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("trading_accounts")
      .upsert(accountRow, { onConflict: "user_id,account_signature" });

    if (upsertErr)
      console.error("MT5 sync: trading_accounts upsert error:", upsertErr.message);
  }

  // ── P&L normalization for cent accounts ───────────────────────────────────
  const isCentTrade = tradeLevelCent ?? account?.is_cent ?? false;
  const rawPnl      = Number(pnl);
  const normalizedPnl = isCentTrade ? rawPnl / 100 : rawPnl;

  // ── Insert trade ──────────────────────────────────────────────────────────
  const payload = {
    user_id:           userId,
    pair:              String(pair).toUpperCase().trim(),
    direction:         String(direction).toUpperCase().trim(),
    lot:               Number(lot),
    date:              String(date),
    entry:             Number(entry),
    exit_price:        Number(exit_price),
    sl:                sl != null ? Number(sl) : null,
    tp:                tp != null ? Number(tp) : null,
    pnl:               normalizedPnl,
    notes:             notes || "Auto-synced from MT5",
    asset_class:       String(asset_class || "Forex"),
    session:           "London",
    setup:             "",
    mt5_deal_id:       mt5_deal_id ? String(mt5_deal_id) : null,
    account_signature: resolvedAccountSig,
    account_label:     resolvedAccountLabel,
    normalized_pnl:    normalizedPnl,
  };

  console.log("MT5 sync: inserting trade", JSON.stringify(payload));

  const { error: insertErr } = await supabase.from("trades").insert(payload);

  if (insertErr) {
    console.error("MT5 sync: insert error:", insertErr.message, insertErr.details);
    return NextResponse.json(
      { error: "Insert failed: " + insertErr.message, details: insertErr.details, hint: insertErr.hint },
      { status: 500 }
    );
  }

  // ── Stamp last_sync_at on token row ───────────────────────────────────────
  await supabase
    .from("mt5_sync_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  console.log("MT5 sync: success —", payload.pair, payload.direction, "pnl:", payload.pnl);
  return NextResponse.json({
    success:           true,
    account_signature: resolvedAccountSig,
    trades_synced:     1,
    account_balance:   account?.current_balance ?? null,
  });
}
