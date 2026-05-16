import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface DerivTransaction {
  transaction_id:   number;
  buy_price:        number;
  sell_price:       number;
  profit_loss:      number;
  longcode:         string;
  transaction_time: number;
  shortcode:        string;
}

async function fetchDerivSince(apiToken: string, since: number): Promise<{
  transactions: DerivTransaction[]; accountId: string; currency: string;
}> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = new (globalThis as any).WebSocket("wss://ws.binaryws.com/websockets/v3?app_id=1089");
    const all: DerivTransaction[] = []; let accountId = ""; let currency = "USD";
    let offset = 0; const LIMIT = 500; let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; ws.close(); reject(new Error("Timeout")); } }, 30_000);
    function done(err?: Error) { if (settled) return; settled = true; clearTimeout(timer); ws.close(); if (err) reject(err); else resolve({ transactions: all, accountId, currency }); }
    function fetchPage() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: Record<string, any> = { profit_table: 1, description: 1, limit: LIMIT, offset, sort: "DESC" };
      if (since > 0) { p.date_from = since; p.date_to = Math.floor(Date.now() / 1000); }
      ws.send(JSON.stringify(p));
    }
    ws.onopen = () => ws.send(JSON.stringify({ authorize: apiToken }));
    ws.onmessage = (evt: { data: string }) => {
      let msg: Record<string, unknown>; try { msg = JSON.parse(evt.data); } catch { return; }
      const err = msg.error as Record<string, unknown> | undefined;
      if (err?.message) { done(new Error(err.message as string)); return; }
      if (msg.msg_type === "authorize") {
        const a = msg.authorize as Record<string, unknown>; accountId = String(a.loginid ?? ""); currency = String(a.currency ?? "USD"); fetchPage(); return;
      }
      if (msg.msg_type === "profit_table") {
        const pt = msg.profit_table as { transactions?: DerivTransaction[] }; const batch = pt.transactions ?? [];
        all.push(...batch); if (batch.length < LIMIT) done(); else { offset += LIMIT; fetchPage(); }
      }
    };
    ws.onerror = () => done(new Error("WebSocket failed"));
  });
}

function parseShortcode(sc: string): { symbol: string; direction: "BUY" | "SELL" } {
  const parts = sc.split("_"); const contract = parts[0] ?? "";
  let underlying = parts[1] ?? "UNKNOWN";
  if (underlying.startsWith("frx")) underlying = underlying.slice(3);
  else if (underlying.startsWith("cry")) underlying = underlying.slice(3);
  const buyPrefixes = ["CALL", "ONETOUCH", "RANGE", "EXPIRYRANGE", "TICKHIGH", "DIGITEVEN", "DIGITOVER"];
  return { symbol: underlying.toUpperCase(), direction: buyPrefixes.some((p) => contract.startsWith(p)) ? "BUY" : "SELL" };
}
function derivAssetClass(s: string): string {
  const u = s.toUpperCase();
  if (["BTC","ETH","XRP","LTC"].some((c) => u.includes(c))) return "Crypto";
  if (["XAU","XAG"].some((c) => u.includes(c))) return "Metals";
  if (["OIL","BRENT","WTI"].some((c) => u.includes(c))) return "Commodities";
  if (u.startsWith("R_") || u.startsWith("1HZ") || u.startsWith("BOOM") || u.startsWith("CRASH")) return "Synthetic";
  return "Forex";
}

export async function GET(request: Request) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = serviceDb();

  // Fetch up to 50 connected accounts
  const { data: connections } = await svc
    .from("deriv_connections")
    .select("user_id, api_token, deriv_account_id, last_synced_at, total_synced")
    .eq("status", "connected")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(50);

  if (!connections?.length) return NextResponse.json({ synced: 0, accounts: 0 });

  let totalNew   = 0;
  let processed  = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    const since = conn.last_synced_at ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) : 0;
    try {
      const { transactions, accountId, currency } = await fetchDerivSince(conn.api_token, since);
      const accountSig = `deriv_${accountId}`;
      const tradeRows = transactions.map((tx) => {
        const { symbol, direction } = parseShortcode(tx.shortcode ?? "CALL_UNKNOWN");
        return {
          user_id: conn.user_id, account_signature: accountSig,
          pair: symbol, direction, lot: 1.0,
          date: new Date(tx.transaction_time * 1000).toISOString().slice(0, 10),
          entry: Number(tx.buy_price ?? 0), exit_price: Number(tx.sell_price ?? 0),
          sl: null, tp: null, pnl: Number(tx.profit_loss ?? 0),
          notes: tx.longcode ? `Deriv: ${tx.longcode.slice(0, 120)}` : "Auto-synced via Deriv API",
          asset_class: derivAssetClass(symbol), session: "London", setup: "",
          mt5_deal_id: String(tx.transaction_id),
          unique_trade_id: `deriv_${accountId}_${tx.transaction_id}`,
          is_verified: true, verification_method: "Deriv",
        };
      });

      let inserted = 0;
      const CHUNK = 200;
      for (let i = 0; i < tradeRows.length; i += CHUNK) {
        const { data: up } = await svc.from("trades")
          .upsert(tradeRows.slice(i, i + CHUNK), { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true })
          .select("id");
        inserted += up?.length ?? 0;
      }

      totalNew += inserted;
      await svc.from("deriv_connections").update({
        status: "connected", last_synced_at: new Date().toISOString(),
        last_error: null, total_synced: (conn.total_synced ?? 0) + inserted,
        updated_at: new Date().toISOString(),
      }).eq("user_id", conn.user_id);

      await svc.from("trading_accounts").upsert({
        user_id: conn.user_id, account_signature: accountSig, account_login: accountId,
        account_server: "Deriv", sync_method: "deriv", sync_status: "connected",
        last_synced_at: new Date().toISOString(), account_currency: currency,
        account_type: "real", is_cent: false, is_verified: true,
        verification_status: "verified_ea", sync_error: null,
      }, { onConflict: "user_id,account_signature" });

      processed++;
    } catch (e) {
      const msg = String((e as Error).message);
      errors.push(`${conn.user_id.slice(0, 8)}: ${msg}`);
      await svc.from("deriv_connections").update({
        status: "error", last_error: msg, updated_at: new Date().toISOString(),
      }).eq("user_id", conn.user_id);
    }
  }

  return NextResponse.json({ synced: totalNew, accounts: processed, errors });
}
