import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function serverDb() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => store.set(name, value, options)) } }
  );
}
function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ── Asset class helper ───────────────────────────────────────────────────────
function assetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (["BTC","ETH","XRP","LTC"].some((c) => s.includes(c))) return "Crypto";
  if (["XAU","XAG"].some((c) => s.includes(c)))             return "Metals";
  if (["US30","NAS","SPX","DAX","FTSE"].some((c) => s.includes(c))) return "Indices";
  if (["OIL","BRENT","WTI"].some((c) => s.includes(c)))     return "Commodities";
  return "Forex";
}

// ── Parse MT5 date "2024.01.15 10:30:00" → ISO date ─────────────────────────
function parseMT5Date(s: string): string {
  if (!s?.trim()) return new Date().toISOString().slice(0, 10);
  const clean = s.trim().replace(/\./g, "-").replace(" ", "T");
  const d = new Date(clean);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
function parseMT5Timestamp(s: string): number {
  if (!s?.trim()) return 0;
  const clean = s.trim().replace(/\./g, "-").replace(" ", "T");
  const d = new Date(clean);
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}

// ── Normalise CSV header → lookup key ────────────────────────────────────────
function normKey(h: string) { return h.toLowerCase().replace(/[^a-z0-9]/g, ""); }

interface ParsedTrade {
  ticket:     string;
  symbol:     string;
  direction:  "BUY" | "SELL";
  volume:     number;
  openPrice:  number;
  closePrice: number;
  closeDate:  string;
  closeTsec:  number;
  profit:     number;
  commission: number;
  swap:       number;
  sl:         number | null;
  tp:         number | null;
}

function parseCSV(content: string): ParsedTrade[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("---"));
  if (lines.length < 2) return [];

  // Detect delimiter: semicolon or comma
  const delim = lines[0].includes(";") ? ";" : ",";

  const rawHeaders = lines[0].split(delim).map((h) => normKey(h.replace(/^"|"$/g, "")));

  function idx(aliases: string[]) {
    for (const a of aliases) {
      const i = rawHeaders.findIndex((h) => h.includes(a) || a.includes(h));
      if (i >= 0) return i;
    }
    return -1;
  }

  const COL = {
    ticket:     idx(["ticket","order","deal"]),
    openTime:   idx(["opentime","opendate"]),
    type:       idx(["type"]),
    volume:     idx(["volume","size","lots"]),
    symbol:     idx(["symbol","item","instrument"]),
    openPrice:  idx(["openprice","price"]),
    sl:         idx(["sl","stoploss"]),
    tp:         idx(["tp","takeprofit"]),
    closeTime:  idx(["closetime","closedate"]),
    closePrice: idx(["closeprice"]),
    commission: idx(["commission"]),
    swap:       idx(["swap"]),
    profit:     idx(["profit"]),
  };

  const trades: ParsedTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (raw.length < 5) continue;

    const get = (col: number) => (col >= 0 ? raw[col] ?? "" : "");
    const num = (col: number) => parseFloat(get(col)) || 0;

    const ticket    = get(COL.ticket)  || String(i);
    const symbol    = get(COL.symbol).toUpperCase();
    const typeStr   = get(COL.type).toLowerCase();
    const direction: "BUY" | "SELL" = typeStr.startsWith("sell") || typeStr === "s" ? "SELL" : "BUY";
    const volume    = num(COL.volume);
    const openPrice = num(COL.openPrice);
    const closePrice = num(COL.closePrice);
    const profit    = num(COL.profit);
    const commission = num(COL.commission);
    const swap      = num(COL.swap);
    const rawSL     = num(COL.sl);
    const rawTP     = num(COL.tp);
    const closeDateRaw = get(COL.closeTime) || get(COL.openTime);

    if (!symbol || !closeDateRaw) continue;

    trades.push({
      ticket,
      symbol,
      direction,
      volume,
      openPrice,
      closePrice,
      closeDate:  parseMT5Date(closeDateRaw),
      closeTsec:  parseMT5Timestamp(closeDateRaw),
      profit,
      commission,
      swap,
      sl: rawSL !== 0 ? rawSL : null,
      tp: rawTP !== 0 ? rawTP : null,
    });
  }

  return trades;
}

// ── POST /api/trades/import-csv ──────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { csv_content?: string; account_label?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const csvContent = body.csv_content?.trim();
  if (!csvContent) return NextResponse.json({ error: "csv_content is required" }, { status: 400 });

  const trades = parseCSV(csvContent);
  if (trades.length === 0)
    return NextResponse.json({ error: "No valid trades found in CSV. Make sure to export from MT5 as CSV with standard columns." }, { status: 400 });

  const svc = serviceDb();
  const accountSig = `csv_import_${user.id.slice(0, 8)}`;

  const tradeRows = trades.map((t) => ({
    user_id:             user.id,
    account_signature:   accountSig,
    pair:                t.symbol,
    direction:           t.direction,
    lot:                 t.volume,
    date:                t.closeDate,
    entry:               t.openPrice,
    exit_price:          t.closePrice,
    sl:                  t.sl,
    tp:                  t.tp,
    pnl:                 t.profit,
    notes:               "Imported via CSV",
    asset_class:         assetClass(t.symbol),
    session:             "London",
    setup:               "",
    mt5_deal_id:         t.ticket,
    unique_trade_id:     `csv_${t.ticket}_${t.symbol}_${t.closeTsec}`,
    is_verified:         false,
    verification_method: "CSV",
  }));

  let inserted  = 0;
  let duplicates = 0;
  const CHUNK = 200;

  for (let i = 0; i < tradeRows.length; i += CHUNK) {
    const chunk = tradeRows.slice(i, i + CHUNK);
    const { data: upserted, error: upsertErr } = await svc
      .from("trades")
      .upsert(chunk, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true })
      .select("id");
    if (upsertErr) {
      console.error("[import-csv] upsert error:", upsertErr.message);
    } else {
      inserted   += upserted?.length ?? 0;
      duplicates += chunk.length - (upserted?.length ?? 0);
    }
  }

  // Upsert a trading_accounts shell for CSV imports
  await svc.from("trading_accounts").upsert({
    user_id:             user.id,
    account_signature:   accountSig,
    account_login:       "CSV Import",
    account_server:      body.account_label ?? "MT5 CSV",
    account_label:       body.account_label ?? "MT5 CSV Import",
    sync_method:         "csv",
    sync_status:         "connected",
    last_synced_at:      new Date().toISOString(),
    account_currency:    "USD",
    account_type:        "real",
    is_cent:             false,
    is_verified:         false,
    verification_status: "inferred",
    sync_error:          null,
  }, { onConflict: "user_id,account_signature" });

  return NextResponse.json({ success: true, total: trades.length, inserted, duplicates });
}
