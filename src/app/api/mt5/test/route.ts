import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// DELETE THIS ROUTE after testing — it inserts without any auth check

export async function GET() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !skey) {
    return NextResponse.json({
      error: "SUPABASE_SERVICE_ROLE_KEY is not set in environment variables",
      hint:  "Add it in Netlify: Site config → Environment variables → SUPABASE_SERVICE_ROLE_KEY",
    }, { status: 500 });
  }

  const db = createClient(url, skey);

  // ── Step 1: get a user_id from mt5_sync_tokens ──────────────────────────
  const { data: tokenRow, error: tokenErr } = await db
    .from("mt5_sync_tokens")
    .select("user_id, token")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenErr) {
    return NextResponse.json({
      error:   "Failed to query mt5_sync_tokens",
      details: tokenErr.message,
      hint:    "Make sure the mt5_sync_tokens table exists in Supabase",
    }, { status: 500 });
  }

  if (!tokenRow) {
    return NextResponse.json({
      error: "No rows in mt5_sync_tokens",
      hint:  "Go to the Settings page and click 'Generate Token' first",
    }, { status: 404 });
  }

  const userId = tokenRow.user_id;

  // ── Step 2: insert a test trade ─────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  const payload = {
    user_id:     userId,
    pair:        "EURUSD",
    direction:   "BUY",
    lot:         0.01,
    date:        today,
    entry:       1.08500,
    exit_price:  1.09000,
    sl:          null,
    tp:          null,
    pnl:         50.00,
    notes:       "TEST — delete this trade after confirming sync works",
    asset_class: "Forex",
    session:     "London",
    setup:       "",
  };

  const { data: inserted, error: insertErr } = await db
    .from("trades")
    .insert(payload)
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({
      error:   "INSERT failed",
      message: insertErr.message,
      details: insertErr.details,
      hint:    insertErr.message.includes("column")
        ? "Column name mismatch — check Supabase trades table schema"
        : "Check Supabase RLS or table structure",
      payload_sent: payload,
    }, { status: 500 });
  }

  return NextResponse.json({
    success:          true,
    message:          "Test trade inserted. Check your dashboard — it should appear now.",
    inserted_row:     inserted,
    user_id_used:     userId,
    token_found:      tokenRow.token.slice(0, 8) + "...",
    delete_reminder:  "Remove /api/mt5/test once you've confirmed sync works",
  });
}
