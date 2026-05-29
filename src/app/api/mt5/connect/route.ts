import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VPS_URL = process.env.VPS_API_URL ?? "https://api.niri.live";
const DIRECT_CONNECT_DISABLED_MESSAGE = "MT5 Direct Connect is coming soon. Use EA Sync or CSV Import for now.";

async function getJwt(): Promise<string | null> {
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
  return session?.access_token ?? null;
}

export async function POST(_req: NextRequest) {
  const jwt = await getJwt();
  if (!jwt) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({ error: DIRECT_CONNECT_DISABLED_MESSAGE }, { status: 403 });
}

export async function DELETE(req: NextRequest) {
  const jwt = await getJwt();
  if (!jwt) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { login: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.login?.trim()) {
    return NextResponse.json({ error: "login is required" }, { status: 400 });
  }

  try {
    const vpsRes = await fetch(`${VPS_URL}/mt5/disconnect`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify({ login: body.login.trim() }),
    });

    const data = await vpsRes.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: vpsRes.status });
  } catch {
    return NextResponse.json({ error: "Could not reach sync server" }, { status: 503 });
  }
}
