import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  ()    => cookieStore.getAll(),
        setAll:  (cs)  => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

// POST /api/accounts/trigger-sync
// Body: { account_signature: string }
// Marks the account sync_status = "pending" so the sync worker picks it up again.
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_signature } = body as { account_signature?: string };
  if (!account_signature) {
    return NextResponse.json({ error: "Missing account_signature" }, { status: 400 });
  }

  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("trading_accounts")
    .update({ sync_status: "pending", sync_error: null })
    .eq("user_id", user.id)
    .eq("account_signature", account_signature);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, queued: true });
}
