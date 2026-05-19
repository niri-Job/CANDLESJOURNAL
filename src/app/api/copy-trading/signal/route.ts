import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function calcLot(
  mode: string,
  providerLot: number,
  providerBalance: number,
  subscriberBalance: number,
  fixedLot: number,
  riskPercent: number,
  maxLot: number,
  entryPrice: number,
  stopLoss: number | null,
  symbol: string,
): number {
  const clamp = (v: number) => Math.max(0.01, Math.min(maxLot, Math.round(v * 100) / 100));

  if (mode === "fixed") return clamp(fixedLot);

  if (mode === "risk_percent" && stopLoss && entryPrice) {
    const sym = symbol.toUpperCase();
    const pipSize = sym.includes("JPY") ? 0.01 : sym.includes("XAU") ? 0.1 : 0.0001;
    const slPips = Math.abs(entryPrice - stopLoss) / pipSize;
    if (slPips < 1) return clamp(fixedLot);
    const pipValuePerLot = sym.includes("XAU") ? 1 : 10;
    return clamp((subscriberBalance * riskPercent / 100) / (slPips * pipValuePerLot));
  }

  // proportional (default)
  if (providerBalance <= 0) return clamp(fixedLot);
  return clamp(providerLot * (subscriberBalance / providerBalance));
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    ticket, symbol, action, direction, lot_size, entry_price,
    stop_loss, take_profit, close_price, pnl, account_balance,
  } = body as Record<string, unknown>;

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  const db = svc();

  // Validate provider token
  const { data: provider, error: provErr } = await db
    .from("signal_providers")
    .select("id, account_balance, is_active")
    .eq("provider_token", token)
    .maybeSingle();

  if (provErr || !provider) {
    return NextResponse.json({ error: "Invalid provider token" }, { status: 401 });
  }

  // Update provider account_balance on heartbeat or any signal
  if (account_balance) {
    await db.from("signal_providers")
      .update({ account_balance: Number(account_balance), is_active: true })
      .eq("id", provider.id);
  }

  if (action === "heartbeat") {
    return NextResponse.json({ ok: true, provider_id: provider.id });
  }

  // Store signal
  const { data: signal, error: sigErr } = await db
    .from("provider_signals")
    .insert({
      provider_id: provider.id,
      ticket:       ticket ? Number(ticket) : null,
      symbol:       symbol ? String(symbol).toUpperCase() : null,
      action:       String(action),
      direction:    direction ? String(direction).toLowerCase() : null,
      lot_size:     lot_size ? Number(lot_size) : null,
      entry_price:  entry_price ? Number(entry_price) : null,
      stop_loss:    stop_loss ? Number(stop_loss) : null,
      take_profit:  take_profit ? Number(take_profit) : null,
      close_price:  close_price ? Number(close_price) : null,
      pnl:          pnl ? Number(pnl) : null,
      account_balance: account_balance ? Number(account_balance) : null,
      opened_at:    action === "open" ? new Date().toISOString() : null,
      closed_at:    action === "close" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (sigErr || !signal) {
    return NextResponse.json({ error: "Failed to store signal" }, { status: 500 });
  }

  // On open: fan out to all active subscribers
  if (action === "open" && lot_size && symbol) {
    const { data: subs } = await db
      .from("copy_subscriptions")
      .select("id, user_id, risk_mode, fixed_lot, risk_percent, max_lot_size, subscriber_balance, max_open_trades, allowed_symbols")
      .eq("provider_id", provider.id)
      .eq("is_active", true);

    if (subs && subs.length > 0) {
      const providerBal = account_balance ? Number(account_balance) : (provider.account_balance ?? 0);

      const copies = subs.map((sub: {
        id: string; user_id: string; risk_mode: string; fixed_lot: number;
        risk_percent: number; max_lot_size: number; subscriber_balance: number;
        allowed_symbols: string[] | null;
      }) => {
        // Symbol filter
        if (sub.allowed_symbols && sub.allowed_symbols.length > 0) {
          const sym = String(symbol).toUpperCase();
          if (!sub.allowed_symbols.map((s: string) => s.toUpperCase()).includes(sym)) {
            return {
              subscription_id: sub.id,
              signal_id: signal.id,
              user_id: sub.user_id,
              symbol: String(symbol).toUpperCase(),
              direction: direction ? String(direction).toLowerCase() : null,
              lot_size: 0,
              entry_price: entry_price ? Number(entry_price) : null,
              status: "skipped",
              skip_reason: "symbol_not_allowed",
              opened_at: new Date().toISOString(),
            };
          }
        }

        const lot = calcLot(
          sub.risk_mode,
          Number(lot_size),
          providerBal,
          sub.subscriber_balance ?? 0,
          sub.fixed_lot ?? 0.01,
          sub.risk_percent ?? 1,
          sub.max_lot_size ?? 0.1,
          entry_price ? Number(entry_price) : 0,
          stop_loss ? Number(stop_loss) : null,
          String(symbol),
        );

        return {
          subscription_id: sub.id,
          signal_id: signal.id,
          user_id: sub.user_id,
          symbol: String(symbol).toUpperCase(),
          direction: direction ? String(direction).toLowerCase() : null,
          lot_size: lot,
          entry_price: entry_price ? Number(entry_price) : null,
          status: "pending",
          opened_at: new Date().toISOString(),
        };
      });

      await db.from("copied_trades").insert(copies);
    }
  }

  // On close: update all pending copied trades that belong to this provider's subscriptions
  if (action === "close") {
    const { data: providerSubs } = await db
      .from("copy_subscriptions")
      .select("id")
      .eq("provider_id", provider.id);

    if (providerSubs && providerSubs.length > 0) {
      const subIds = providerSubs.map((s: { id: string }) => s.id);
      await db.from("copied_trades")
        .update({
          close_price: close_price ? Number(close_price) : null,
          pnl: pnl ? Number(pnl) : null,
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("status", "pending")
        .in("subscription_id", subIds);
    }
  }

  return NextResponse.json({ ok: true, signal_id: signal.id });
}
