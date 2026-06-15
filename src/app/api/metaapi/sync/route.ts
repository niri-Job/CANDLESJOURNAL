import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_API   = "https://mt-client-api-v1.london.agiliumtrade.ai";

// ── MetaAPI REST helpers ──────────────────────────────────────────────────────

interface MetaApiError { message?: string; details?: unknown; }

async function mGet<T>(base: string, path: string, token: string): Promise<T> {
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "auth-token": token }, cache: "no-store" });
  } catch (netErr) {
    console.error("[metaapi/sync] fetch network error GET", url, netErr);
    throw Object.assign(
      new Error(`Network error reaching MetaAPI: ${String(netErr)}`),
      { status: 502 }
    );
  }
  if (!res.ok) {
    const err: MetaApiError = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(err.message ?? `MetaAPI ${res.status}`),
      { details: err.details, status: res.status }
    );
  }
  return res.json() as Promise<T>;
}

async function mPost<T>(base: string, path: string, token: string): Promise<T> {
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch (netErr) {
    console.error("[metaapi/sync] fetch network error POST", url, netErr);
    throw Object.assign(
      new Error(`Network error reaching MetaAPI: ${String(netErr)}`),
      { status: 502 }
    );
  }
  if (!res.ok) {
    const err: MetaApiError = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(err.message ?? `MetaAPI ${res.status}`),
      { details: err.details, status: res.status }
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
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

const SKIP_DEAL_TYPES = new Set([
  "DEAL_TYPE_BALANCE", "DEAL_TYPE_CREDIT", "DEAL_TYPE_CHARGE",
  "DEAL_TYPE_CORRECTION", "DEAL_TYPE_BONUS", "DEAL_TYPE_COMMISSION",
  "DEAL_TYPE_COMMISSION_DAILY", "DEAL_TYPE_COMMISSION_MONTHLY",
  "DEAL_TYPE_AGENT_COMMISSION", "DEAL_TYPE_INTEREST", "DEAL_DIVIDEND",
  "DEAL_DIVIDEND_FRANKED", "DEAL_TAX", "DEAL_TYPE_SO_COMPENSATION",
  "DEAL_TYPE_BUY_CANCELED", "DEAL_TYPE_SELL_CANCELED",
]);

interface MetaDeal {
  id:           string;
  type:         string;
  entryType:    string;
  symbol?:      string;
  volume?:      number;
  price?:       number;
  profit:       number;
  commission?:  number;
  swap?:        number;
  time:         string;
  positionId?:  string;
  stopLoss?:    number;
  takeProfit?:  number;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

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

// ── POST /api/metaapi/sync ────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = serviceDb();

  let body: { account_signature?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { account_signature } = body;
  if (!account_signature?.trim()) {
    return NextResponse.json({ error: "account_signature is required" }, { status: 400 });
  }

  const { data: tradingAccount, error: taErr } = await svc
    .from("trading_accounts")
    .select("metaapi_account_id, account_login, account_server, account_label")
    .eq("user_id", user.id)
    .eq("account_signature", account_signature.trim())
    .maybeSingle();

  console.log("[metaapi/sync] Loaded trading account:", JSON.stringify(tradingAccount));

  if (taErr || !tradingAccount) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (!tradingAccount.metaapi_account_id) {
    return NextResponse.json(
      { error: "This account has no MetaAPI ID. Use the Connect form first." },
      { status: 400 }
    );
  }

  const token = process.env.METAAPI_TOKEN;
  console.log("[metaapi/sync] token present:", !!token, "| PROVISIONING:", PROVISIONING, "| CLIENT_API:", CLIENT_API);
  if (!token) return NextResponse.json({ error: "MetaAPI is not configured on this server." }, { status: 503 });

  const accountId = tradingAccount.metaapi_account_id;

  try {
    // Ensure account is deployed before fetching history
    const accountInfo = await mGet<{ state: string }>(
      PROVISIONING, `/users/current/accounts/${accountId}`, token
    );

    console.log("[metaapi/sync] MetaAPI account info:", JSON.stringify(accountInfo));

    if (accountInfo.state !== "DEPLOYED") {
      console.log("[metaapi/sync] Account state is", accountInfo.state, "— firing deploy for", accountId);
      await mPost<void>(PROVISIONING, `/users/current/accounts/${accountId}/deploy`, token)
        .then(() => console.log("[metaapi/sync] Deploy triggered successfully"))
        .catch((e: unknown) => console.warn("[metaapi/sync] Deploy trigger (non-fatal):", (e as { message?: string }).message));

      return NextResponse.json(
        { error: "Account is connecting to your broker for the first time. This takes 1–2 minutes. Please try again shortly." },
        { status: 202 }
      );
    }

    // Fetch live account information (balance, equity, floating P&L)
    interface LiveAccountInfo { balance?: number; equity?: number; profit?: number; currency?: string; [k: string]: unknown; }
    let liveInfo: LiveAccountInfo | null = null;
    const accountInfoPath = `/users/current/accounts/${accountId}/accountInformation`;
    console.log("[metaapi/sync] Fetching accountInformation URL:", `${CLIENT_API}${accountInfoPath}`);
    try {
      liveInfo = await mGet<LiveAccountInfo>(CLIENT_API, accountInfoPath, token);
      console.log("[metaapi/sync] accountInformation raw:", JSON.stringify(liveInfo));
      console.log("[metaapi/sync] profit:", liveInfo?.profit, "| balance:", liveInfo?.balance, "| equity:", liveInfo?.equity);
    } catch (e) {
      console.warn("[metaapi/sync] accountInformation fetch failed (non-fatal):", (e as { message?: string; status?: number }).message, "status:", (e as { status?: number }).status);
    }

    // Fetch last 6 months of deal history via REST
    const to   = new Date();
    const from = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const startIso = from.toISOString();
    const endIso   = to.toISOString();

    const historyRes = await mGet<{ deals: MetaDeal[] } | MetaDeal[]>(
      CLIENT_API,
      `/users/current/accounts/${accountId}/history-deals/time/${encodeURIComponent(startIso)}/${encodeURIComponent(endIso)}?limit=10000`,
      token
    );

    const deals: MetaDeal[] = Array.isArray(historyRes)
      ? historyRes
      : ((historyRes as { deals?: MetaDeal[] }).deals ?? []);

    console.log(`[metaapi/sync] Got ${deals.length} deals for account ${account_signature}`);
    console.log("[metaapi/sync] Raw historyRes type:", Array.isArray(historyRes) ? "array" : typeof historyRes, "keys:", !Array.isArray(historyRes) ? Object.keys(historyRes as object) : "n/a");
    console.log("[metaapi/sync] First 3 deals:", JSON.stringify(deals.slice(0, 3), null, 2));

    // ── Reconstruct closed trades from IN/OUT deal pairs ──────────────────────
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
        const closeDate = closeTime.toISOString().slice(0, 10);
        const closeTsec = Math.floor(closeTime.getTime() / 1000);
        const symbol    = (inDeal!.symbol ?? "UNKNOWN").toUpperCase();
        const direction: "BUY" | "SELL" = inDeal!.type === "DEAL_TYPE_BUY" ? "BUY" : "SELL";

        return {
          user_id:             user.id,
          account_signature:   account_signature.trim(),
          account_login:       tradingAccount.account_login ?? "",
          account_broker:      tradingAccount.account_server ?? "",
          source:              "metaapi",
          pair:                symbol,
          direction,
          lot:                 inDeal!.volume    ?? 0,
          date:                closeDate,
          entry:               inDeal!.price     ?? 0,
          exit_price:          outDeal!.price    ?? 0,
          sl:                  inDeal!.stopLoss  ?? null,
          tp:                  inDeal!.takeProfit ?? null,
          pnl:                 outDeal!.profit   ?? 0,
          notes:               "Imported via MetaAPI",
          asset_class:         assetClass(symbol),
          session:             "London",
          setup:               "",
          mt5_deal_id:         posId,
          unique_trade_id:     `${account_signature.trim()}_${posId}_${symbol}_${closeTsec}`,
          is_verified:         true,
          verification_method: "metaapi",
        };
      });

    const totalPositions = Object.keys(positions).length;
    const pairedPositions = Object.values(positions).filter((p) => p.in && p.out).length;
    console.log(`[metaapi/sync] Positions: ${totalPositions} total, ${pairedPositions} fully paired (IN+OUT), ${tradeRows.length} mapped`);
    console.log(`[metaapi/sync] Mapped ${tradeRows.length} closed trades`);

    // ── Upsert in chunks ──────────────────────────────────────────────────────
    let inserted  = 0;
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
        console.error("[metaapi/sync] upsert error:", upsertErr);
        return NextResponse.json({ error: `Database error: ${upsertErr.message}` }, { status: 500 });
      }
      inserted   += upserted?.length ?? 0;
      duplicates += chunk.length - (upserted?.length ?? 0);
    }

    const dbPayload: Record<string, unknown> = {
      last_synced_at: new Date().toISOString(),
      sync_status:    "connected",
      sync_error:     null,
      sync_source:    "metaapi",
      ...(liveInfo ? {
        balance:      liveInfo.balance      ?? null,
        equity:       liveInfo.equity       ?? null,
        floating_pnl: liveInfo.profit       ?? null,
      } : {}),
    };
    console.log("[metaapi/sync] DB update payload:", JSON.stringify(dbPayload));
    const { error: updateErr } = await svc
      .from("trading_accounts")
      .update(dbPayload)
      .eq("user_id", user.id)
      .eq("account_signature", account_signature.trim());
    if (updateErr) {
      console.error("[metaapi/sync] trading_accounts update ERROR:", JSON.stringify(updateErr));
    } else {
      console.log("[metaapi/sync] trading_accounts update OK — balance:", dbPayload.balance, "equity:", dbPayload.equity, "floating_pnl:", dbPayload.floating_pnl);
    }

    return NextResponse.json({ success: true, total: tradeRows.length, inserted, duplicates });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    console.error("[metaapi/sync] error:", e.message);

    await svc.from("trading_accounts").update({
      sync_status: "failed",
      sync_error:  e.message ?? "Unknown error",
    }).eq("user_id", user.id).eq("account_signature", account_signature.trim());

    return NextResponse.json(
      { error: e.message ?? "Sync failed. Please try again." },
      { status: e.status ?? 500 }
    );
  }
}
