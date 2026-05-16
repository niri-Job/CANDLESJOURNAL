import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic    = "force-dynamic";
export const maxDuration = 300;

// ── Supabase helpers ────────────────────────────────────────────────────────
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

// ── Types ───────────────────────────────────────────────────────────────────
interface DerivTransaction {
  transaction_id:   number;
  contract_id:      number;
  buy_price:        number;
  sell_price:       number;
  profit_loss:      number;
  longcode:         string;
  transaction_time: number;
  purchase_time:    number;
  shortcode:        string;
}

// ── Deriv WebSocket fetch ───────────────────────────────────────────────────
async function fetchDerivHistory(apiToken: string, since?: number): Promise<{
  transactions: DerivTransaction[];
  accountId:   string;
  currency:    string;
}> {
  return new Promise((resolve, reject) => {
    // Node 22 has native WebSocket; suppress the ts error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = new (globalThis as any).WebSocket(
      "wss://ws.binaryws.com/websockets/v3?app_id=1089"
    );

    const all: DerivTransaction[] = [];
    let accountId  = "";
    let currency   = "USD";
    let offset     = 0;
    const LIMIT    = 500;
    let settled    = false;

    const timer = setTimeout(() => {
      if (!settled) { settled = true; ws.close(); reject(new Error("Deriv API timeout")); }
    }, 90_000);

    function done(err?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      if (err) reject(err); else resolve({ transactions: all, accountId, currency });
    }

    function fetchPage() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        profit_table: 1,
        description:  1,
        limit:        LIMIT,
        offset,
        sort:         "DESC",
      };
      if (since) {
        payload.date_from = since;
        payload.date_to   = Math.floor(Date.now() / 1000);
      }
      ws.send(JSON.stringify(payload));
    }

    ws.onopen = () => ws.send(JSON.stringify({ authorize: apiToken }));

    ws.onmessage = (evt: { data: string }) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(evt.data); } catch { return; }

      const err = msg.error as Record<string, unknown> | undefined;
      if (err?.message) { done(new Error(err.message as string)); return; }

      if (msg.msg_type === "authorize") {
        const auth = msg.authorize as Record<string, unknown>;
        accountId = String(auth.loginid ?? "");
        currency  = String(auth.currency ?? "USD");
        fetchPage();
        return;
      }

      if (msg.msg_type === "profit_table") {
        const pt = msg.profit_table as { transactions?: DerivTransaction[]; count?: number };
        const batch = pt.transactions ?? [];
        all.push(...batch);
        if (batch.length < LIMIT) { done(); }
        else { offset += LIMIT; fetchPage(); }
      }
    };

    ws.onerror = () => done(new Error("WebSocket connection to Deriv failed"));
  });
}

// ── Symbol / direction helpers ───────────────────────────────────────────────
function parseShortcode(sc: string): { symbol: string; direction: "BUY" | "SELL" } {
  const parts    = sc.split("_");
  const contract = parts[0] ?? "";
  let underlying = parts[1] ?? "UNKNOWN";
  if (underlying.startsWith("frx")) underlying = underlying.slice(3);
  else if (underlying.startsWith("cry")) underlying = underlying.slice(3);
  const buyPrefixes = ["CALL", "ONETOUCH", "RANGE", "EXPIRYRANGE", "TICKHIGH", "DIGITEVEN", "DIGITOVER"];
  const direction: "BUY" | "SELL" = buyPrefixes.some((p) => contract.startsWith(p)) ? "BUY" : "SELL";
  return { symbol: underlying.toUpperCase(), direction };
}

function derivAssetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (["BTC", "ETH", "XRP", "LTC", "BCH"].some((c) => s.includes(c))) return "Crypto";
  if (["XAU", "XAG"].some((c) => s.includes(c)))                       return "Metals";
  if (["OIL", "BRENT", "WTI"].some((c) => s.includes(c)))              return "Commodities";
  if (s.startsWith("R_") || s.startsWith("1HZ") || s.startsWith("BOOM") ||
      s.startsWith("CRASH") || s.startsWith("JD") || s.startsWith("DEX"))
    return "Synthetic";
  return "Forex";
}

// ── POST /api/deriv/connect ─────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { api_token?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const apiToken = body.api_token?.trim();
  if (!apiToken) return NextResponse.json({ error: "api_token is required" }, { status: 400 });

  // Fetch full Deriv history via WebSocket
  let transactions: DerivTransaction[];
  let accountId:    string;
  let currency:     string;
  try {
    ({ transactions, accountId, currency } = await fetchDerivHistory(apiToken));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 400 });
  }

  const svc              = serviceDb();
  const accountSig       = `deriv_${accountId}`;
  let   inserted         = 0;
  let   duplicates       = 0;

  // Batch upsert trades in chunks of 200
  const tradeRows = transactions.map((tx) => {
    const { symbol, direction } = parseShortcode(tx.shortcode ?? "CALL_UNKNOWN");
    const closeDate             = new Date(tx.transaction_time * 1000).toISOString().slice(0, 10);
    return {
      user_id:             user.id,
      account_signature:   accountSig,
      pair:                symbol,
      direction,
      lot:                 1.0,
      date:                closeDate,
      entry:               Number(tx.buy_price  ?? 0),
      exit_price:          Number(tx.sell_price ?? 0),
      sl:                  null,
      tp:                  null,
      pnl:                 Number(tx.profit_loss ?? 0),
      notes:               tx.longcode ? `Deriv: ${tx.longcode.slice(0, 120)}` : "Auto-synced via Deriv API",
      asset_class:         derivAssetClass(symbol),
      session:             "London",
      setup:               "",
      mt5_deal_id:         String(tx.transaction_id),
      unique_trade_id:     `deriv_${accountId}_${tx.transaction_id}`,
      is_verified:         true,
      verification_method: "Deriv",
    };
  });

  const CHUNK = 200;
  for (let i = 0; i < tradeRows.length; i += CHUNK) {
    const chunk = tradeRows.slice(i, i + CHUNK);
    const { error: upsertErr, data: upserted } = await svc
      .from("trades")
      .upsert(chunk, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true })
      .select("id");
    if (upsertErr) {
      console.error("[deriv/connect] upsert error:", upsertErr.message);
    } else {
      inserted   += upserted?.length ?? 0;
      duplicates += chunk.length - (upserted?.length ?? 0);
    }
  }

  // Save / update deriv_connections
  await svc.from("deriv_connections").upsert({
    user_id:          user.id,
    api_token:        apiToken,
    deriv_account_id: accountId,
    account_currency: currency,
    status:           "connected",
    last_synced_at:   new Date().toISOString(),
    last_error:       null,
    total_synced:     inserted,
    updated_at:       new Date().toISOString(),
  }, { onConflict: "user_id" });

  // Keep trading_accounts in sync
  await svc.from("trading_accounts").upsert({
    user_id:             user.id,
    account_signature:   accountSig,
    account_login:       accountId,
    account_server:      "Deriv",
    sync_method:         "deriv",
    sync_status:         "connected",
    last_synced_at:      new Date().toISOString(),
    account_currency:    currency,
    account_type:        "real",
    is_cent:             false,
    is_verified:         true,
    verification_status: "verified_ea",
    sync_error:          null,
  }, { onConflict: "user_id,account_signature" });

  return NextResponse.json({
    success:    true,
    account_id: accountId,
    currency,
    total:      transactions.length,
    inserted,
    duplicates,
  });
}

// ── DELETE /api/deriv/connect — disconnect ──────────────────────────────────
export async function DELETE() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = serviceDb();
  await svc.from("deriv_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
