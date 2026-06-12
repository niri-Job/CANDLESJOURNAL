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

// ── Asset class ───────────────────────────────────────────────────────────────
function assetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (["BTC","ETH","XRP","LTC","BNB","SOL","ADA","DOGE"].some((c) => s.includes(c))) return "Crypto";
  if (["XAU","XAG","GOLD","SILVER"].some((c) => s.includes(c)))                       return "Metals";
  if (["US30","NAS","SPX","DAX","FTSE","NIKKEI","HSI","CAC"].some((c) => s.includes(c))) return "Indices";
  if (["OIL","BRENT","WTI","USOIL","UKOIL","NGAS"].some((c) => s.includes(c)))        return "Commodities";
  return "Forex";
}

// ── MT5 date parser ──────────────────────────────────────────────────────────
function parseMT5Date(s: string): string {
  if (!s?.trim()) return new Date().toISOString().slice(0, 10);
  // "2024.01.15 10:30:00" or "2024-01-15 10:30:00"
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

// ── Normalise header text → lookup key ───────────────────────────────────────
function normKey(h: string) { return h.toLowerCase().replace(/[^a-z0-9]/g, ""); }

// ── Non-trade MT5 row types to skip ──────────────────────────────────────────
const SKIP_TYPES = new Set([
  "balance","credit","creditin","creditout","deposit","withdrawal",
  "bonus","correction","commission","dividend","tax",
]);

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

export function parseCSV(content: string): { trades: ParsedTrade[]; headers: string[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("---"));
  if (lines.length < 2) return { trades: [], headers: [] };

  const delim = lines[0].includes(";") ? ";" : ",";
  const rawHeaders = lines[0].split(delim).map((h) => normKey(h.replace(/^"|"$/g, "")));

  // Prefer exact match, fall back to substring containment
  function idx(aliases: string[]): number {
    for (const a of aliases) {
      const i = rawHeaders.findIndex((h) => h === a);
      if (i >= 0) return i;
    }
    for (const a of aliases) {
      const i = rawHeaders.findIndex((h) => h.includes(a) || a.includes(h));
      if (i >= 0) return i;
    }
    return -1;
  }

  // MT5 standard columns (after normKey):
  //   ticket | opentime | type | size | item | price | sl | tp | closetime | closeprice | commission | swap | profit
  const COL = {
    ticket:     idx(["ticket","order","deal","dealid"]),
    openTime:   idx(["opentime","opendate","time"]),
    type:       idx(["type","direction"]),
    volume:     idx(["size","volume","lots","qty"]),
    symbol:     idx(["item","symbol","instrument","pair","asset"]),
    openPrice:  idx(["price","openprice","open"]),
    sl:         idx(["sl","stoploss","stop"]),
    tp:         idx(["tp","takeprofit","take"]),
    closeTime:  idx(["closetime","closedate"]),
    closePrice: idx(["closeprice","close"]),
    commission: idx(["commission"]),
    swap:       idx(["swap"]),
    profit:     idx(["profit","pnl","gain"]),
  };

  const trades: ParsedTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (raw.length < 5) continue;

    const get = (col: number) => (col >= 0 ? (raw[col] ?? "") : "");
    const num = (col: number) => {
      const v = parseFloat(get(col).replace(/\s/g, ""));
      return isNaN(v) ? 0 : v;
    };

    const typeRaw  = get(COL.type).toLowerCase().replace(/[^a-z]/g, "");
    const symbol   = get(COL.symbol).toUpperCase().trim();
    const closeDateRaw = get(COL.closeTime) || get(COL.openTime);

    // Skip non-trade rows (balance, credit, deposit, etc.)
    if (SKIP_TYPES.has(typeRaw)) continue;
    // Skip rows with no symbol or no date
    if (!symbol || !closeDateRaw) continue;
    // Skip rows with suspiciously generic symbols (sometimes MT5 puts "n/a" or "-")
    if (symbol.length < 2 || symbol === "N/A" || symbol === "-") continue;
    // Skip MT5 order rows: volume is "0.3 / 0.3" format and price is "market"/"filled"
    if (get(COL.volume).includes("/")) continue;
    // Skip MT5 deals rows: volume is "in"/"out" (deal direction, not a lot size → parses to 0)
    const volumeVal = num(COL.volume);
    if (volumeVal === 0) continue;

    const openPrice = num(COL.openPrice);
    // Skip rows with no valid entry price (order rows, header rows, summary rows)
    if (openPrice === 0) continue;

    const direction: "BUY" | "SELL" = typeRaw.includes("sell") || typeRaw === "s" ? "SELL" : "BUY";
    const rawSL = num(COL.sl);
    const rawTP = num(COL.tp);

    trades.push({
      ticket:     get(COL.ticket) || String(i),
      symbol,
      direction,
      volume:     volumeVal,
      openPrice,
      closePrice: num(COL.closePrice),
      closeDate:  parseMT5Date(closeDateRaw),
      closeTsec:  parseMT5Timestamp(closeDateRaw),
      profit:     num(COL.profit),
      commission: num(COL.commission),
      swap:       num(COL.swap),
      sl:         rawSL !== 0 ? rawSL : null,
      tp:         rawTP !== 0 ? rawTP : null,
    });
  }

  return { trades, headers: rawHeaders };
}

// ── POST /api/trades/import-csv ──────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { csv_content?: string; account_login?: string; account_broker?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const csvContent    = body.csv_content?.trim();
  const accountLogin  = body.account_login?.trim();
  const accountBroker = body.account_broker?.trim();

  if (!csvContent)    return NextResponse.json({ error: "csv_content is required" }, { status: 400 });
  if (!accountLogin)  return NextResponse.json({ error: "MT5 Login Number is required" }, { status: 400 });
  if (!accountBroker) return NextResponse.json({ error: "Broker name is required" }, { status: 400 });

  const svc = serviceDb();

  // ── Parse CSV ────────────────────────────────────────────────────────────────
  const { trades, headers } = parseCSV(csvContent);
  if (trades.length > 0) {
    console.log("[import-csv] First 3 parsed pnl values:",
      trades.slice(0, 3).map((t) => ({ pair: t.symbol, profit: t.profit, openPrice: t.openPrice }))
    );
  }

  if (trades.length === 0) {
    const foundHeaders = headers.join(", ") || "(no headers detected)";
    return NextResponse.json({
      error: `No valid trades found in the CSV. Detected columns: ${foundHeaders}. ` +
        `MT5 expects: ticket, opentime/time, type, size/volume, item/symbol, price, closetime, closeprice, profit.`,
    }, { status: 400 });
  }

  const accountSig   = `${accountLogin}_${accountBroker}`;
  const accountLabel = `${accountLogin} — ${accountBroker}`;

  const tradeRows = trades.map((t) => ({
    user_id:              user.id,
    account_signature:    accountSig,
    account_login:        accountLogin,
    account_broker:       accountBroker,
    source:               "csv",
    pair:                 t.symbol,
    direction:            t.direction,
    lot:                  t.volume,
    date:                 t.closeDate,
    entry:                t.openPrice,
    exit_price:           t.closePrice,
    sl:                   t.sl,
    tp:                   t.tp,
    pnl:                  t.profit,
    notes:                "Imported from MT5 trade history",
    asset_class:          assetClass(t.symbol),
    session:              "London",
    setup:                "",
    mt5_deal_id:          t.ticket,
    unique_trade_id:      `${accountSig}_${t.ticket}_${t.symbol}_${t.closeTsec}`,
    is_verified:          false,
    verification_method:  "csv_import",
  }));

  // ── Pre-filter already-imported deal IDs to avoid constraint 23505 ──────────
  // trades_mt5_deal_id_unique is a separate constraint from user_id+unique_trade_id,
  // so ignoreDuplicates on the latter won't silence conflicts on the former.
  const existingDealIds = new Set<string>();
  {
    const { data: existingRows } = await svc
      .from("trades")
      .select("mt5_deal_id")
      .eq("user_id", user.id)
      .not("mt5_deal_id", "is", null);
    if (existingRows) {
      existingRows.forEach((r) => { if (r.mt5_deal_id) existingDealIds.add(String(r.mt5_deal_id)); });
    }
  }

  const rowsToInsert = tradeRows.filter((r) => !existingDealIds.has(String(r.mt5_deal_id)));

  // ── Insert trades ────────────────────────────────────────────────────────────
  let inserted  = 0;
  let duplicates = tradeRows.length - rowsToInsert.length; // pre-filtered
  const CHUNK = 100;

  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const chunk = rowsToInsert.slice(i, i + CHUNK);
    const { data: upserted, error: upsertErr } = await svc
      .from("trades")
      .upsert(chunk, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true })
      .select("id");

    if (upsertErr) {
      if (upsertErr.code === "23505") {
        // A different unique constraint fired — count this chunk as duplicates and continue
        console.warn("[import-csv] 23505 on chunk (duplicate), skipping:", upsertErr.message);
        duplicates += chunk.length;
        continue;
      }
      console.error("[import-csv] upsert error:", upsertErr);
      return NextResponse.json({
        error: `Database error while saving trades: ${upsertErr.message}` +
          (upsertErr.hint ? ` Hint: ${upsertErr.hint}` : "") +
          (upsertErr.code ? ` (code ${upsertErr.code})` : ""),
      }, { status: 500 });
    }

    inserted   += upserted?.length ?? 0;
    duplicates += chunk.length - (upserted?.length ?? 0);
  }

  // ── Upsert account record ────────────────────────────────────────────────────
  const { error: accErr } = await svc.from("trading_accounts").upsert({
    user_id:             user.id,
    account_signature:   accountSig,
    account_login:       accountLogin,
    account_server:      accountBroker,
    account_label:       accountLabel,
    broker_name:         accountBroker,
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

  if (accErr) {
    console.error("[import-csv] trading_accounts upsert error:", accErr.message);
    // Non-fatal: trades were inserted, just account record failed
  }

  return NextResponse.json({
    success:      true,
    total:        trades.length,
    inserted,
    duplicates,
    account_login: accountLogin,
    account_broker: accountBroker,
    account_label:  accountLabel,
  });
}
