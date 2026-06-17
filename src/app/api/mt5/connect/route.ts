// DEPRECATED - not in use, scheduled for removal
// Replaced by /api/metaapi/connect (VPS-based MetaAPI direct connect).
// No frontend component calls this route. Safe to delete after confirming no EA traffic.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VPS_URL = process.env.VPS_API_URL ?? "https://api.niri.live";
const DIRECT_CONNECT_DISABLED_MESSAGE = "MT5 Direct Connect is coming soon. Use EA Sync or CSV Import for now.";

async function getSession(): Promise<{ jwt: string; userId: string } | null> {
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user?.id) return null;
  return { jwt: session.access_token, userId: session.user.id };
}

function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({ error: DIRECT_CONNECT_DISABLED_MESSAGE }, { status: 403 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { id?: string; login?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim();
  const login = body.login?.trim();

  if (!id && !login) {
    return NextResponse.json({ error: "connection id or login is required" }, { status: 400 });
  }

  const db = serviceDb();
  let update = db
    .from("mt5_connections")
    .update({ status: "disconnected" })
    .eq("user_id", session.userId);

  update = id ? update.eq("id", id) : update.eq("mt5_login", login!);

  const { error } = await update;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Legacy Direct Connect cleanup. This is best-effort so users can still
  // remove stale accounts even when the VPS path is unavailable.
  try {
    if (!login) return NextResponse.json({ success: true });

    const vpsRes = await fetch(`${VPS_URL}/mt5/disconnect`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.jwt}`,
      },
      body: JSON.stringify({ login }),
    });

    if (!vpsRes.ok) {
      console.warn("mt5 disconnect: VPS cleanup failed", vpsRes.status);
    }
  } catch {
    console.warn("mt5 disconnect: VPS cleanup unreachable");
  }

  return NextResponse.json({ success: true });
}
