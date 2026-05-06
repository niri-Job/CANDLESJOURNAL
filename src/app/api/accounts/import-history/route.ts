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

interface Deal {
  deal: string;
  order: string;
  symbol: string;
  type: string;
  direction: string;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  time: string;
  comment: string;
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

  // Find header row (look for "time" or "deal" or "symbol" column)
  const headerIdx = lines.findIndex(l => {
    const lower = l.toLowerCase();
    return lower.includes("symbol") || lower.includes("deal") || lower.includes("time");
  });
  if (headerIdx === -1) {
    return NextResponse.json({ error: "Could not find header row. Ensure this is a valid MT5 history export." }, { status: 400 });
  }

  const rawHeaders = lines[headerIdx].split(/[,\t]/).map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  const dataLines = lines.slice(headerIdx + 1);

  function col(row: string[], name: string): string {
    const idx = rawHeaders.indexOf(name);
    return idx >= 0 ? (row[idx] || "").trim().replace(/['"]/g, "") : "";
  }

  // Parse all deals from CSV
  const deals: Deal[] = [];
  let skipped = 0;

  for (const line of dataLines) {
    if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith("Deals")) continue;
    const row = line.split(/[,\t]/);

    const symbol = col(row, "symbol") || col(row, "item");
    const timeStr = col(row, "time") || col(row, "close time") || col(row, "closetime");
    const dealId  = col(row, "deal") || col(row, "ticket");
    const orderId = col(row, "order") || col(row, "deal");
    const dirStr  = (col(row, "direction") || "").toLowerCase();
    const typeStr = (col(row, "type") || "").toLowerCase();
    const volume  = parseFloat(col(row, "volume") || col(row, "size") || "0");
    const price   = parseFloat(col(row, "price") || "0");
    const profit  = parseFloat(col(row, "profit") || "0");
    const commission = parseFloat(col(row, "commission") || "0");
    const swap    = parseFloat(col(row, "swap") || "0");
    const comment = col(row, "comment");

    if (!symbol || !timeStr) { skipped++; continue; }

    // Skip balance/credit operations
    const isBalance = typeStr.includes("balance") || typeStr.includes("credit") ||
                      dirStr.includes("balance") || comment.toLowerCase().includes("deposit") ||
                      comment.toLowerCase().includes("withdraw");
    if (isBalance) { skipped++; continue; }

    deals.push({ deal: dealId, order: orderId, symbol, type: typeStr, direction: dirStr, volume, price, profit, commission, swap, time: timeStr, comment });
  }

  if (deals.length === 0) {
    return NextResponse.json({ error: `No valid deals found. Skipped ${skipped} rows.` }, { status: 400 });
  }

  // ── Strategy: match IN + OUT deals by Order number ────────────────────────
  // MT5 Deals history: each trade has an IN deal and an OUT deal sharing the same Order ID.
  const orderMap: Record<string, { in?: Deal; out?: Deal }> = {};

  for (const deal of deals) {
    const isIn  = deal.direction.includes("in")  || deal.type === "buy"  || deal.type === "sell";
    const isOut = deal.direction.includes("out") || deal.type.includes("out");

    const key = deal.order || deal.deal;
    if (!orderMap[key]) orderMap[key] = {};

    if (isIn && !isOut) {
      orderMap[key].in = deal;
    } else if (isOut) {
      orderMap[key].out = deal;
    } else {
      // Fallback: treat as standalone (e.g. old-style CSV without direction column)
      if (!orderMap[key].out) orderMap[key].out = deal;
      else if (!orderMap[key].in) orderMap[key].in = deal;
    }
  }

  const trades = [];

  for (const [orderId, pair] of Object.entries(orderMap)) {
    const outDeal = pair.out;
    const inDeal  = pair.in;

    // Need at least the OUT deal to form a closed trade
    if (!outDeal) continue;

    const symbol = outDeal.symbol || inDeal?.symbol || "";
    if (!symbol) continue;

    const outDate = new Date(outDeal.time);
    if (isNaN(outDate.getTime())) continue;

    // Determine direction from IN deal type, or OUT deal type
    const typeStr = (inDeal?.type || outDeal.type || "").toLowerCase();
    const dirStr  = (inDeal?.direction || outDeal.direction || "").toLowerCase();
    let direction: "BUY" | "SELL" = "BUY";
    if (typeStr.includes("sell") || dirStr.includes("sell")) direction = "SELL";
    else if (typeStr.includes("buy") || dirStr.includes("buy")) direction = "BUY";

    const entryPrice = inDeal?.price ?? outDeal.price;
    const exitPrice  = outDeal.price;
    const volume     = inDeal?.volume ?? outDeal.volume;
    const profit     = outDeal.profit + (outDeal.commission || 0) + (outDeal.swap || 0);

    const openedAt  = inDeal ? new Date(inDeal.time).toISOString() : null;
    const closedAt  = outDate.toISOString();
    const date      = outDate.toISOString().split("T")[0];
    const closeTs   = Math.floor(outDate.getTime() / 1000);
    const uniqueTradeId = `${accountSignature}_${orderId}_${closeTs}`;

    // Clean symbol: remove trailing "m" suffix (cent accounts) and spaces
    const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

    trades.push({
      user_id:             user.id,
      pair:                cleanSymbol,
      direction,
      lot:                 volume || 0.01,
      date,
      entry:               entryPrice,
      exit_price:          exitPrice,
      sl:                  null,
      tp:                  null,
      pnl:                 profit,
      notes:               "Imported from MT5 CSV history",
      asset_class:         "Forex",
      session:             "London",
      setup:               "",
      mt5_deal_id:         outDeal.deal || null,
      account_signature:   accountSignature,
      normalized_pnl:      profit,
      unique_trade_id:     uniqueTradeId,
      opened_at:           openedAt,
      closed_at:           closedAt,
      is_verified:         false,
      verification_method: "csv_import",
    });
  }

  // Fallback: if IN/OUT matching produced nothing, try old-style single-row import
  if (trades.length === 0) {
    for (const deal of deals) {
      const isOut = deal.direction.includes("out") || deal.type.includes("out") ||
                    deal.type.includes("sell") || deal.type.includes("buy");
      if (!isOut || !deal.time) { skipped++; continue; }

      const dateObj = new Date(deal.time);
      if (isNaN(dateObj.getTime())) { skipped++; continue; }

      const direction: "BUY" | "SELL" = (deal.type.includes("sell") || deal.direction.includes("sell")) ? "SELL" : "BUY";
      const date = dateObj.toISOString().split("T")[0];
      const closeTs = Math.floor(dateObj.getTime() / 1000);
      const cleanSymbol = deal.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const uniqueTradeId = deal.deal ? `${accountSignature}_${deal.deal}_${closeTs}` : null;

      trades.push({
        user_id:             user.id,
        pair:                cleanSymbol,
        direction,
        lot:                 deal.volume || 0.01,
        date,
        entry:               deal.price,
        exit_price:          deal.price,
        sl:                  null,
        tp:                  null,
        pnl:                 deal.profit,
        notes:               "Imported from MT5 CSV history",
        asset_class:         "Forex",
        session:             "London",
        setup:               "",
        mt5_deal_id:         deal.deal || null,
        account_signature:   accountSignature,
        normalized_pnl:      deal.profit,
        unique_trade_id:     uniqueTradeId,
        opened_at:           null,
        closed_at:           dateObj.toISOString(),
        is_verified:         false,
        verification_method: "csv_import",
      });
    }
  }

  if (trades.length === 0) {
    return NextResponse.json({
      error: `No valid trades found. Skipped ${skipped} rows. Ensure this is a MT5 Deals history export in CSV format.`,
    }, { status: 400 });
  }

  // Upsert with duplicate protection
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
