import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll:  (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { account_number, broker_server, label } =
    body as Record<string, string | undefined>;

  if (!account_number?.trim() || !broker_server?.trim())
    return NextResponse.json(
      { error: "account_number and broker_server are required" },
      { status: 400 }
    );

  const svc = serviceDb();

  const token = randomBytes(32).toString("hex");  // 64-char hex

  // Upsert on (user_id, account_number): creates a new row for a new account,
  // or regenerates the token if this account is already registered.
  const { error: upsertErr } = await svc.from("ea_tokens").upsert({
    user_id:        user.id,
    account_number: account_number.trim(),
    broker_server:  broker_server.trim(),
    token,
  }, { onConflict: "user_id,account_number" });

  if (upsertErr)
    return NextResponse.json(
      { error: "Failed to generate token: " + upsertErr.message },
      { status: 500 }
    );

  // Pre-create trading_accounts shell so the account appears in Settings immediately
  const account_signature = `${account_number.trim()}_${broker_server.trim()}`;
  await svc.from("trading_accounts").upsert({
    user_id:             user.id,
    account_signature,
    account_login:       account_number.trim(),
    account_server:      broker_server.trim(),
    account_label:       label?.trim() || null,
    sync_method:         "ea",
    sync_status:         "pending",
    sync_error:          null,
    account_currency:    "USD",
    account_type:        "real",
    is_cent:             false,
    is_verified:         false,
    verification_status: null,
    last_synced_at:      null,
  }, { onConflict: "user_id,account_signature" });

  return NextResponse.json({
    success:           true,
    token,
    account_number:    account_number.trim(),
    broker_server:     broker_server.trim(),
    account_signature,
  });
}
