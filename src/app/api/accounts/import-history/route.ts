import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const accountSignature = formData.get("account_signature") as string | null;
  const file = formData.get("file") as File | null;

  if (!file || !accountSignature) {
    return NextResponse.json({ error: "Missing file or account_signature" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Find header row
  const headerIdx = lines.findIndex(l => l.toLowerCase().includes("symbol") || l.toLowerCase().includes("deal") || l.toLowerCase().includes("time"));
  if (headerIdx === -1) {
    return NextResponse.json({ error: "Could not find header row in CSV. Ensure this is a valid MT5 history export." }, { status: 400 });
  }

  const headers = lines[headerIdx].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  const dataLines = lines.slice(headerIdx + 1);

  function col(row: string[], name: string): string {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] || "").trim().replace(/['"]/g, "") : "";
  }

  const trades = [];
  let skipped = 0;

  for (const line of dataLines) {
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const row = line.split(",");

    const symbol   = col(row, "symbol") || col(row, "item");
    const profit   = parseFloat(col(row, "profit") || "0");
    const volume   = parseFloat(col(row, "volume") || col(row, "size") || "0");
    const price    = parseFloat(col(row, "price") || "0");
    const typeStr  = (col(row, "type") || "").toLowerCase();
    const dirStr   = (col(row, "direction") || "").toLowerCase();
    const timeStr  = col(row, "time") || col(row, "close time") || col(row, "closetime");
    const dealId   = col(row, "deal") || col(row, "ticket") || col(row, "order");
    const sl       = parseFloat(col(row, "s/l") || col(row, "sl") || "0") || null;
    const tp       = parseFloat(col(row, "t/p") || col(row, "tp") || "0") || null;

    // Only import closed trades (type = "out" or direction = "out" or has profit column with value)
    const isOut = typeStr.includes("out") || dirStr.includes("out") || typeStr.includes("sell") || typeStr.includes("buy");
    if (!symbol || !isOut || !timeStr) { skipped++; continue; }

    const direction = (typeStr.includes("sell") || dirStr.includes("sell")) ? "SELL" : "BUY";
    const dateObj = new Date(timeStr);
    if (isNaN(dateObj.getTime())) { skipped++; continue; }

    const date       = dateObj.toISOString().split("T")[0];
    const closeTs    = Math.floor(dateObj.getTime() / 1000);
    const uniqueTradeId = dealId ? `${accountSignature}_${dealId}_${closeTs}` : null;

    trades.push({
      user_id:             user.id,
      pair:                symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      direction,
      lot:                 volume || 0.01,
      date,
      entry:               price,
      exit_price:          price,
      sl:                  sl || null,
      tp:                  tp || null,
      pnl:                 profit,
      notes:               "Imported from MT5 CSV history",
      asset_class:         "Forex",
      session:             "London",
      setup:               "",
      mt5_deal_id:         dealId || null,
      account_signature:   accountSignature,
      normalized_pnl:      profit,
      unique_trade_id:     uniqueTradeId,
      is_verified:         false,
      verification_method: "csv_import",
    });
  }

  if (trades.length === 0) {
    return NextResponse.json({ error: `No valid trades found in CSV. Skipped ${skipped} rows. Ensure this is a MT5 Deals/History export in CSV format.` }, { status: 400 });
  }

  // Upsert all trades
  const { error: upsertErr } = await supabase
    .from("trades")
    .upsert(trades, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true });

  if (upsertErr) {
    return NextResponse.json({ error: "Import failed: " + upsertErr.message }, { status: 500 });
  }

  // Update account import_status
  await supabase
    .from("trading_accounts")
    .update({ import_status: "complete", last_synced_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("account_signature", accountSignature);

  return NextResponse.json({ success: true, imported: trades.length, skipped });
}
