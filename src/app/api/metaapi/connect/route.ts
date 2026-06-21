import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// ── MetaAPI REST helpers ──────────────────────────────────────────────────────

interface MetaApiError { message?: string; details?: unknown; }

async function mGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${PROVISIONING}${path}`, {
    headers: { "auth-token": token },
    cache: "no-store",
  });
  if (!res.ok) {
    const err: MetaApiError = await res.json().catch(() => ({}));
    const e = Object.assign(
      new Error(err.message ?? `MetaAPI ${res.status}`),
      { details: err.details, status: res.status }
    );
    throw e;
  }
  return res.json() as Promise<T>;
}

async function mPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PROVISIONING}${path}`, {
    method: "POST",
    headers: { "auth-token": token, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err: MetaApiError = await res.json().catch(() => ({}));
    const e = Object.assign(
      new Error(err.message ?? `MetaAPI ${res.status}`),
      { details: err.details, status: res.status }
    );
    throw e;
  }
  // 204 No Content (e.g. deploy) — return empty object
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
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

// ── POST /api/metaapi/connect ─────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Your session has expired. Please refresh the page and try again." }, { status: 401 });

  const svc = serviceDb();

  // Fetch trial / subscription status up-front (used for gate checks and trial start)
  const { data: profileData } = await svc
    .from("user_profiles")
    .select("subscription_status, mt5_trial_started_at, mt5_trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const isPro        = profileData?.subscription_status === "pro";
  const trialExpired = !isPro
    && !!profileData?.mt5_trial_ends_at
    && new Date() >= new Date(profileData.mt5_trial_ends_at);

  // Hard cap: max 20 MetaAPI-connected accounts across all users
  const { count: metaapiCount } = await svc
    .from("trading_accounts")
    .select("*", { count: "exact", head: true })
    .or("sync_source.eq.metaapi,sync_method.eq.metaapi");
  if ((metaapiCount ?? 0) >= 20) {
    return NextResponse.json(
      { error: "MT5 Direct Sync spots are full for this week. Join the waitlist." },
      { status: 503 }
    );
  }

  let body: { login?: string; password?: string; server?: string; platform?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { login, password, server, platform } = body;
  if (!login?.trim())    return NextResponse.json({ error: "MT5 login number is required" }, { status: 400 });
  if (!password?.trim()) return NextResponse.json({ error: "MT5 password is required" }, { status: 400 });
  if (!server?.trim())   return NextResponse.json({ error: "Broker server name is required" }, { status: 400 });

  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "MetaAPI is not configured on this server." }, { status: 503 });

  const accountSig   = `${login.trim()}_${server.trim()}`;
  const accountLabel = `${login.trim()} — ${server.trim()}`;

  try {
    let accountId: string | null = null;

    // ── Step 1: check if already provisioned in Supabase ─────────────────────
    const { data: existingRow } = await svc
      .from("trading_accounts")
      .select("metaapi_account_id")
      .eq("user_id", user.id)
      .eq("account_signature", accountSig)
      .maybeSingle();

    if (existingRow?.metaapi_account_id) {
      accountId = existingRow.metaapi_account_id;
      console.log("[metaapi/connect] Already provisioned (from DB):", accountId);
    } else {
      // Block new provisioning when trial has expired
      if (trialExpired) {
        return NextResponse.json({
          error: "Your 7-day free trial has ended. Upgrade to connect MT5 accounts.",
          trialExpired: true,
        }, { status: 403 });
      }

      // ── Step 2: check MetaAPI for an account with this login ────────────────
      const existingAccounts = await mGet<Record<string, unknown>[]>(
        "/users/current/accounts?limit=1000", token
      );
      console.log(
        "[metaapi/connect] MetaAPI accounts — count:", existingAccounts.length,
        "sample:", JSON.stringify(existingAccounts.slice(0, 2))
      );

      const match = existingAccounts.find(
        (a) => String(a.login) === login.trim() &&
               (typeof a.type === "string" ? a.type.startsWith("cloud") : true)
      );

      if (match) {
        accountId = (match.id ?? match._id ?? null) as string | null;
        console.log("[metaapi/connect] Found existing MetaAPI account:", accountId, JSON.stringify(match));
      } else {
        // ── Step 3: provision new ──────────────────────────────────────────────
        console.log("[metaapi/connect] Provisioning new account for login", login.trim());
        const created = await mPost<Record<string, unknown>>(
          "/users/current/accounts",
          token,
          {
            login:    login.trim(),
            password: password.trim(),
            server:   server.trim(),
            platform: (platform?.trim() || "mt5"),
            type:     "cloud-g2",
            name:     `NIRI — ${login.trim()} (${server.trim()})`,
            magic:    0,
          }
        );
        accountId = (created.id ?? created._id ?? null) as string | null;
        console.log("[metaapi/connect] Created account:", accountId, "response:", JSON.stringify(created));
      }
    }

    if (!accountId) {
      return NextResponse.json(
        { error: "Failed to obtain MetaAPI account ID. Please try again." },
        { status: 500 }
      );
    }

    // Save to DB first so the account_id is persisted before deploy kicks off
    const { error: upsertErr } = await svc.from("trading_accounts").upsert({
      user_id:             user.id,
      account_signature:   accountSig,
      account_login:       login.trim(),
      account_server:      server.trim(),
      account_label:       accountLabel,
      sync_method:         "metaapi",
      sync_source:         "metaapi",
      sync_status:         "connected",
      account_currency:    "USD",
      account_type:        "real",
      is_cent:             false,
      is_verified:         false,
      verification_status: "inferred",
      sync_error:          null,
      metaapi_account_id:  accountId,
    }, { onConflict: "user_id,account_signature" });

    if (upsertErr) {
      console.error("[metaapi/connect] upsert error:", upsertErr.message);
      return NextResponse.json(
        { error: `Account provisioned but failed to save: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    // Deploy after DB is saved
    try {
      await mPost<void>(`/users/current/accounts/${accountId}/deploy`, token);
      console.log("[metaapi/connect] Deployed:", accountId);
    } catch (deployErr: unknown) {
      const msg = (deployErr as { message?: string }).message ?? "";
      if (!msg.toLowerCase().includes("already") && !msg.includes("E_ALREADY")) {
        console.warn("[metaapi/connect] Deploy warning (non-fatal):", msg);
      }
    }

    // Start MT5 trial on the user's very first MetaAPI connect
    if (!profileData?.mt5_trial_started_at) {
      const now    = new Date();
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await svc.from("user_profiles").upsert({
        user_id:              user.id,
        mt5_trial_started_at: now.toISOString(),
        mt5_trial_ends_at:    trialEnd.toISOString(),
      }, { onConflict: "user_id" });
      console.log("[metaapi/connect] Trial started — ends:", trialEnd.toISOString());
    }

    return NextResponse.json({
      success:            true,
      metaapi_account_id: accountId,
      account_signature:  accountSig,
      account_label:      accountLabel,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; details?: unknown; status?: number };
    console.error("[metaapi/connect] error:", e.message, e.details);

    const detailsStr  = typeof e.details === "string" ? e.details : "";
    const detailsCode = typeof e.details === "object" && e.details !== null
      ? (e.details as { code?: string }).code ?? ""
      : "";

    if (detailsCode === "E_SRV_NOT_FOUND" || (e.message ?? "").includes("not found")) {
      return NextResponse.json(
        { error: `Server "${server}" not found. Check the exact server name in MT5 → File → Open an Account.` },
        { status: 400 }
      );
    }
    if (detailsStr === "E_AUTH" || detailsCode === "E_AUTH" || (e.message ?? "").includes("authentication")) {
      return NextResponse.json(
        { error: "Authentication failed. Check your MT5 login and password." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Connection failed. Please check your MT5 credentials and try again. If the problem persists, contact support." },
      { status: e.status ?? 500 }
    );
  }
}
