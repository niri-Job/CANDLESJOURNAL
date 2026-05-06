import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCipheriv, randomBytes } from "crypto";

// ── Encryption ─────────────────────────────────────────────────────────────
// AES-256-CBC. ENCRYPTION_KEY must be set in env (32 chars recommended).
function encryptPassword(plain: string): string {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

// ── Server Supabase client ─────────────────────────────────────────────────
async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  ()     => cookieStore.getAll(),
        setAll:  (cs)   => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

// Service role client — bypasses RLS for sync_logs insert
function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── POST /api/accounts/connect ─────────────────────────────────────────────
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { account_login, account_server, investor_password, platform, account_label } =
    body as Record<string, string | undefined>;

  if (!account_login || !account_server || !investor_password || !platform) {
    return NextResponse.json(
      { error: "Missing required fields: account_login, account_server, investor_password, platform" },
      { status: 400 }
    );
  }
  if (platform !== "MT4" && platform !== "MT5") {
    return NextResponse.json({ error: "platform must be MT4 or MT5" }, { status: 400 });
  }

  // Auth check
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Plan-based account limits ───────────────────────────────────────────
  function getAccountLimit(p: string): number {
    if (p === "pro") return 10;
    return 1; // free: demo only
  }

  const [profileRes, countRes] = await Promise.all([
    supabase.from("user_profiles")
      .select("subscription_status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("trading_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  const plan        = (profileRes.data as { subscription_status: string | null } | null)
    ?.subscription_status ?? "free";
  const accountCount = countRes.count ?? 0;
  const limit        = getAccountLimit(plan);

  if (accountCount >= limit) {
    return NextResponse.json({
      error: `Account limit reached (${accountCount}/${limit}). Your ${plan} plan allows ${limit} account${limit !== 1 ? "s" : ""}. Upgrade at /pricing.`,
    }, { status: 403 });
  }

  // Free plan: only demo accounts allowed (detect by server name)
  if (plan === "free") {
    const serverLower = (account_server as string).toLowerCase();
    if (!/demo|test|practice|paper/.test(serverLower)) {
      return NextResponse.json({
        error: "Free plan only supports demo accounts. Upgrade to Pro to connect live accounts.",
      }, { status: 403 });
    }
  }

  const account_signature = `${account_login}_${account_server}`;

  // Check if already Quick-Connected
  const { data: existing } = await supabase
    .from("trading_accounts")
    .select("id, sync_method")
    .eq("user_id", user.id)
    .eq("account_signature", account_signature)
    .maybeSingle();

  if (existing?.sync_method === "investor") {
    return NextResponse.json(
      { error: "This account is already connected via Quick Connect", account_signature },
      { status: 409 }
    );
  }

  // Warn if an EA account exists for the same signature
  const hasEA = existing?.sync_method === "ea" || (existing && !existing.sync_method);

  // Encrypt the investor password — never store plain text
  let encrypted: string;
  try {
    encrypted = encryptPassword(investor_password);
  } catch {
    return NextResponse.json(
      { error: "Server encryption not configured (ENCRYPTION_KEY missing)" },
      { status: 500 }
    );
  }

  // Upsert trading_accounts
  const row = {
    user_id:                      user.id,
    account_signature,
    account_label:                (account_label?.trim() || null),
    account_login:                String(account_login),
    account_server:               String(account_server),
    sync_method:                  "investor",
    investor_password_encrypted:  encrypted,
    sync_status:                  "pending",
    sync_error:                   null,
    platform,
    last_synced_at:               null,
  };

  const { error: upsertErr } = await supabase
    .from("trading_accounts")
    .upsert(row, { onConflict: "user_id,account_signature" });

  if (upsertErr) {
    return NextResponse.json(
      { error: "Failed to save account: " + upsertErr.message },
      { status: 500 }
    );
  }

  // Write initial sync log entry (service role so RLS insert is unrestricted)
  try {
    const svc = serviceDb();
    await svc.from("sync_logs").insert({
      user_id:           user.id,
      account_signature,
      sync_method:       "investor",
      status:            "pending",
      trades_synced:     0,
      error_message:     null,
    });
  } catch {
    // Non-fatal — log write failure shouldn't block the connect response
  }

  return NextResponse.json({
    success: true,
    account_signature,
    status: "pending",
    ea_warning: hasEA
      ? "This account already has EA sync. Both methods are now active."
      : null,
  });
}
