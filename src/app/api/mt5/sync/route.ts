import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Anon client — used only for token lookup (SELECT on mt5_sync_tokens)
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Service role client — bypasses RLS so we can insert into trades server-side
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, trade } = body as {
    token?: string;
    trade?: {
      pair?: string;
      direction?: string;
      lot?: number;
      date?: string;
      entry?: number;
      exit?: number;
      sl?: number | null;
      tp?: number | null;
      pnl?: number;
      notes?: string;
      asset_class?: string;
    };
  };

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing sync token" }, { status: 400 });
  }

  // ── Step 1: validate token + get user_id ─────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await anonClient
    .from("mt5_sync_tokens")
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    console.error("Token lookup error:", tokenErr.message);
    return NextResponse.json({ error: "Token lookup failed" }, { status: 500 });
  }
  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const userId: string = tokenRow.user_id;
  console.log("MT5 sync: token valid, user_id =", userId);

  // ── Ping / connection test ────────────────────────────────────────────────
  const b = body as { ping?: boolean };
  if (b.ping === true) {
    return NextResponse.json({ pong: true });
  }

  // ── Step 2: validate trade fields ────────────────────────────────────────
  if (!trade) {
    return NextResponse.json({ error: "Missing trade data" }, { status: 400 });
  }

  const { pair, direction, lot, date, entry, exit, sl, tp, pnl, notes, asset_class } = trade;

  if (!pair || !direction || !lot || !date || entry == null || exit == null || pnl == null) {
    console.error("MT5 sync: missing fields", { pair, direction, lot, date, entry, exit, pnl });
    return NextResponse.json({ error: "Missing required trade fields" }, { status: 400 });
  }

  const payload = {
    user_id:     userId,
    pair:        String(pair).toUpperCase().trim(),
    direction:   String(direction).toUpperCase().trim(),
    lot:         Number(lot),
    date:        String(date),
    entry:       Number(entry),
    exit:        Number(exit),
    sl:          sl != null ? Number(sl) : null,
    tp:          tp != null ? Number(tp) : null,
    pnl:         Number(pnl),
    notes:       notes || "Auto-synced from MT5",
    asset_class: String(asset_class || "Forex"),
    session:     "London",
    setup:       "",
  };

  console.log("MT5 sync: inserting trade", JSON.stringify(payload));

  // ── Step 3: insert trade (service role bypasses RLS) ─────────────────────
  const db = serviceClient();
  const { error: insertErr } = await db.from("trades").insert(payload);

  if (insertErr) {
    console.error("MT5 sync insert error:", insertErr.message, insertErr.details);
    return NextResponse.json(
      { error: "Insert failed: " + insertErr.message },
      { status: 500 }
    );
  }

  // ── Step 4: update last_sync_at ───────────────────────────────────────────
  await db
    .from("mt5_sync_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  console.log("MT5 sync: trade inserted successfully for", payload.pair, payload.direction);
  return NextResponse.json({ success: true });
}
