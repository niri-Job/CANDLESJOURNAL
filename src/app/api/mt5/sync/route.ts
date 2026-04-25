import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Service role bypasses ALL RLS — required because the EA has no user session.
// This key must be set in Netlify: Site config → Environment variables.
// Get it from: Supabase → Project Settings → API → service_role (secret key).
function db() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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

  let supabase: ReturnType<typeof db>;
  try {
    supabase = db();
  } catch {
    return NextResponse.json(
      { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 }
    );
  }

  // ── Step 1: validate token → get user_id (service role bypasses RLS) ─────
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("mt5_sync_tokens")
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    console.error("MT5 sync: token lookup error:", tokenErr.message);
    return NextResponse.json(
      { error: "Token lookup failed: " + tokenErr.message },
      { status: 500 }
    );
  }
  if (!tokenRow) {
    return NextResponse.json(
      { error: "Token not found — go to Settings page and click Generate Token" },
      { status: 401 }
    );
  }

  const userId: string = tokenRow.user_id;
  console.log("MT5 sync: token valid, user_id =", userId);

  // ── Ping / connection test from EA OnInit ─────────────────────────────────
  const b = body as { ping?: boolean };
  if (b.ping === true) {
    return NextResponse.json({ pong: true });
  }

  // ── Step 2: validate required trade fields ────────────────────────────────
  if (!trade) {
    return NextResponse.json({ error: "Missing trade object in request body" }, { status: 400 });
  }

  const { pair, direction, lot, date, entry, exit, sl, tp, pnl, notes, asset_class } = trade;

  if (!pair || !direction || !lot || !date || entry == null || exit == null || pnl == null) {
    return NextResponse.json(
      {
        error: "Missing required trade fields",
        received: { pair, direction, lot, date, entry, exit, pnl },
      },
      { status: 400 }
    );
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

  // ── Step 3: insert trade (service role bypasses RLS for all users) ────────
  const { error: insertErr } = await supabase.from("trades").insert(payload);

  if (insertErr) {
    console.error("MT5 sync: insert error:", insertErr.message, insertErr.details);
    return NextResponse.json(
      {
        error:   "Insert failed: " + insertErr.message,
        details: insertErr.details,
        hint:    insertErr.hint,
      },
      { status: 500 }
    );
  }

  // ── Step 4: stamp last_sync_at on the token row ───────────────────────────
  await supabase
    .from("mt5_sync_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  console.log("MT5 sync: success —", payload.pair, payload.direction, "pnl:", payload.pnl);
  return NextResponse.json({ success: true });
}
