import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_API   = "https://mt-client-api-v1.london.agiliumtrade.ai";

// Temporary diagnostic route — runs the same sync logic as /api/metaapi/sync,
// but admin-gated and keyed by metaapi_account_id directly (bypassing the
// per-user session check) so we can force-sync a specific account without
// impersonating the user. Safe to delete once done.

interface MetaApiError { message?: string; details?: unknown; }

async function mGet<T>(base: string, path: string, token: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: { "auth-token": token }, cache: "no-store" });
  if (!res.ok) {
    const err: MetaApiError = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message ?? `MetaAPI ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

async function mPost<T>(base: string, path: string, token: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST", headers: { "auth-token": token, "Content-Type": "application/json" }, cache: "no-store",
  });
  if (!res.ok) {
    const err: MetaApiError = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.message ?? `MetaAPI ${res.status}`), { status: res.status });
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function assetClass(symbol: string): string {
  const s = symbol.toUpperCase();
  if (["BTC","ETH","XRP","LTC","BNB","SOL","ADA","DOGE"].some((c) => s.includes(c))) return "Crypto";
  if (["XAU","XAG","GOLD","SILVER"].some((c) => s.includes(c)))                       return "Metals";
  if (["US30","NAS","SPX","DAX","FTSE","NIKKEI","HSI","CAC"].some((c) => s.includes(c))) return "Indices";
  if (["OIL","BRENT","WTI","USOIL","UKOIL","NGAS"].some((c) => s.includes(c)))        return "Commodities";
  return "Forex";
}

const SKIP_DEAL_TYPES = new Set([
  "DEAL_TYPE_BALANCE", "DEAL_TYPE_CREDIT", "DEAL_TYPE_CHARGE",
  "DEAL_TYPE_CORRECTION", "DEAL_TYPE_BONUS", "DEAL_TYPE_COMMISSION",
  "DEAL_TYPE_COMMISSION_DAILY", "DEAL_TYPE_COMMISSION_MONTHLY",
  "DEAL_TYPE_AGENT_COMMISSION", "DEAL_TYPE_INTEREST", "DEAL_DIVIDEND",
  "DEAL_DIVIDEND_FRANKED", "DEAL_TAX", "DEAL_TYPE_SO_COMPENSATION",
  "DEAL_TYPE_BUY_CANCELED", "DEAL_TYPE_SELL_CANCELED",
]);

interface MetaDeal {
  id: string; type: string; entryType: string; symbol?: string; volume?: number;
  price?: number; profit: number; commission?: number; swap?: number; time: string;
  positionId?: string; stopLoss?: number; takeProfit?: number;
}

function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const svc = serviceDb();

  let body: { metaapi_account_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const accountId = body.metaapi_account_id?.trim();
  if (!accountId) return NextResponse.json({ error: "metaapi_account_id is required" }, { status: 400 });

  const { data: tradingAccount, error: taErr } = await svc
    .from("trading_accounts")
    .select("id, user_id, account_signature, account_login, account_server, account_label, account_type, last_synced_at")
    .eq("metaapi_account_id", accountId)
    .maybeSingle();

  if (taErr || !tradingAccount) {
    return NextResponse.json({ error: "Account not found", taErr }, { status: 404 });
  }

  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "MetaAPI is not configured on this server." }, { status: 503 });

  const accountSignature = tradingAccount.account_signature;
  const userId = tradingAccount.user_id;

  try {
    const accountInfo = await mGet<{ state: string }>(PROVISIONING, `/users/current/accounts/${accountId}`, token);

    if (accountInfo.state !== "DEPLOYED") {
      await mPost<void>(PROVISIONING, `/users/current/accounts/${accountId}/deploy`, token).catch(() => undefined);
      return NextResponse.json({
        error: "Account is connecting to your broker for the first time. Try again shortly.",
        state: accountInfo.state,
      }, { status: 202 });
    }

    interface LiveAccountInfo { balance?: number; equity?: number; [k: string]: unknown; }
    let liveInfo: LiveAccountInfo | null = null;
    try {
      liveInfo = await mGet<LiveAccountInfo>(CLIENT_API, `/users/current/accounts/${accountId}/accountInformation`, token);
    } catch (e) {
      console.warn("[admin/metaapi-trigger-sync] accountInformation fetch failed:", (e as { message?: string }).message);
    }

    const to   = new Date();
    const from = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

    const historyRes = await mGet<{ deals: MetaDeal[] } | MetaDeal[]>(
      CLIENT_API,
      `/users/current/accounts/${accountId}/history-deals/time/${encodeURIComponent(from.toISOString())}/${encodeURIComponent(to.toISOString())}?limit=10000`,
      token
    );
    const deals: MetaDeal[] = Array.isArray(historyRes) ? historyRes : (historyRes.deals ?? []);

    type DealPair = { in?: MetaDeal; out?: MetaDeal };
    const positions: Record<string, DealPair> = {};
    for (const deal of deals) {
      if (SKIP_DEAL_TYPES.has(deal.type)) continue;
      if (!deal.positionId || !deal.symbol) continue;
      if (!positions[deal.positionId]) positions[deal.positionId] = {};
      if (deal.entryType === "DEAL_ENTRY_IN")  positions[deal.positionId].in  = deal;
      if (deal.entryType === "DEAL_ENTRY_OUT") positions[deal.positionId].out = deal;
    }

    const tradeRows = Object.entries(positions)
      .filter(([, p]) => p.in && p.out)
      .map(([posId, { in: inDeal, out: outDeal }]) => {
        const closeTime = new Date(outDeal!.time);
        const symbol    = (inDeal!.symbol ?? "UNKNOWN").toUpperCase();
        return {
          user_id:             userId,
          account_signature:   accountSignature,
          account_login:       tradingAccount.account_login ?? "",
          account_broker:      tradingAccount.account_server ?? "",
          source:              "metaapi",
          pair:                symbol,
          direction:           (inDeal!.type === "DEAL_TYPE_BUY" ? "BUY" : "SELL") as "BUY" | "SELL",
          lot:                 inDeal!.volume ?? 0,
          date:                closeTime.toISOString().slice(0, 10),
          entry:               inDeal!.price ?? 0,
          exit_price:          outDeal!.price ?? 0,
          sl:                  inDeal!.stopLoss ?? null,
          tp:                  inDeal!.takeProfit ?? null,
          pnl:                 outDeal!.profit ?? 0,
          notes:               "Imported via MetaAPI",
          asset_class:         assetClass(symbol),
          session:             "London",
          setup:               "",
          mt5_deal_id:         posId,
          unique_trade_id:     `${accountSignature}_${posId}_${symbol}_${Math.floor(closeTime.getTime() / 1000)}`,
          is_verified:         true,
          verification_method: "metaapi",
        };
      });

    let inserted = 0;
    let duplicates = 0;
    const CHUNK = 100;
    for (let i = 0; i < tradeRows.length; i += CHUNK) {
      const chunk = tradeRows.slice(i, i + CHUNK);
      const { data: upserted, error: upsertErr } = await svc
        .from("trades")
        .upsert(chunk, { onConflict: "user_id,unique_trade_id,source", ignoreDuplicates: true })
        .select("id");
      if (upsertErr) {
        if (upsertErr.code === "23505") { duplicates += chunk.length; continue; }
        return NextResponse.json({ error: `Database error: ${upsertErr.message}` }, { status: 500 });
      }
      inserted   += upserted?.length ?? 0;
      duplicates += chunk.length - (upserted?.length ?? 0);
    }

    const hasTrades = inserted > 0 || duplicates > 0;
    await svc.from("trading_accounts").update({
      ...(hasTrades ? { last_synced_at: new Date().toISOString() } : {}),
      sync_status: "connected",
      sync_error:  null,
      sync_source: "metaapi",
      ...(liveInfo ? {
        balance:      liveInfo.balance ?? null,
        equity:       liveInfo.equity  ?? null,
        floating_pnl: (liveInfo.equity != null && liveInfo.balance != null) ? liveInfo.equity - liveInfo.balance : null,
      } : {}),
    }).eq("metaapi_account_id", accountId);

    try {
      const undeployRes = await fetch(`${CLIENT_API}/users/current/accounts/${accountId}/undeploy`, {
        method: "PUT", headers: { "auth-token": token }, cache: "no-store",
      });
      if (!undeployRes.ok) console.error("[admin/metaapi-trigger-sync] Undeploy response:", undeployRes.status);
    } catch (e) {
      console.error("[admin/metaapi-trigger-sync] Undeploy (non-fatal):", (e as { message?: string }).message);
    }

    return NextResponse.json({
      accountId,
      tradingAccountRowId: tradingAccount.id,
      accountSignature,
      accountType:    tradingAccount.account_type,
      dealsFetched:   deals.length,
      positionsFound: Object.keys(positions).length,
      tradeRowsBuilt: tradeRows.length,
      inserted,
      duplicates,
      hasTrades,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? "Sync failed", status: e.status }, { status: e.status ?? 500 });
  }
}
