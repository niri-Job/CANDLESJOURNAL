import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Threshold in minutes: if the last heartbeat is older than this, service is "offline"
const OFFLINE_THRESHOLD_MIN = 5;

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  // Auth required — don't expose service health to unauthenticated requests
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll:  (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const svc = serviceDb();
    const { data } = await svc
      .from("sync_service_health")
      .select("last_heartbeat, version, last_account_count")
      .eq("service_name", "mt5_sync")
      .maybeSingle();

    if (!data) {
      // Table exists but no row — service has never run
      return NextResponse.json({
        online: false,
        last_heartbeat: null,
        stale_minutes: null,
        message: "Sync service has not connected yet",
      });
    }

    const staleMs = Date.now() - new Date(data.last_heartbeat as string).getTime();
    const stale_minutes = Math.floor(staleMs / 60_000);
    const online = stale_minutes < OFFLINE_THRESHOLD_MIN;

    return NextResponse.json({
      online,
      last_heartbeat: data.last_heartbeat,
      stale_minutes,
      version: data.version,
      last_account_count: data.last_account_count,
    });
  } catch {
    // sync_service_health table may not exist yet (migration not run)
    return NextResponse.json({
      online: null,       // null = unknown (table missing)
      last_heartbeat: null,
      stale_minutes: null,
      message: "Health table not found — run the sync_health migration",
    });
  }
}
