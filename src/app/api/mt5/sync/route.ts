import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Anon key is fine — insert_trade_from_mt5 uses SECURITY DEFINER to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  if (!trade) {
    return NextResponse.json({ error: "Missing trade data" }, { status: 400 });
  }

  const { pair, direction, lot, date, entry, exit, sl, tp, pnl, notes, asset_class } = trade;

  if (!pair || !direction || !lot || !date || entry == null || exit == null || pnl == null) {
    return NextResponse.json({ error: "Missing required trade fields" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("insert_trade_from_mt5", {
    p_token:       token,
    p_pair:        String(pair).toUpperCase().trim(),
    p_direction:   String(direction).toUpperCase().trim(),
    p_lot:         Number(lot),
    p_date:        String(date),
    p_entry:       Number(entry),
    p_exit:        Number(exit),
    p_sl:          sl != null ? Number(sl) : null,
    p_tp:          tp != null ? Number(tp) : null,
    p_pnl:         Number(pnl),
    p_notes:       notes || "Auto-synced from MT5",
    p_asset_class: String(asset_class || "Forex"),
  });

  if (error) {
    console.error("MT5 sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  const result = data as { error?: string; success?: boolean };
  if (result?.error) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
