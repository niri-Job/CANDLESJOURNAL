import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ signature: string }> }
) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { signature } = await params;

  // Verify the account belongs to this user
  const { data: account } = await supabase
    .from("trading_accounts")
    .select("id, sync_method")
    .eq("account_signature", signature)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const svc = serviceDb();

  // If this was an EA account, also revoke the token so the EA stops syncing
  // and the user can register a different account number.
  const syncMethod = (account as Record<string, string>).sync_method;
  if (syncMethod === "ea") {
    await svc
      .from("ea_tokens")
      .delete()
      .eq("user_id", user.id);
  }

  // Delete trades first (FK integrity)
  await svc
    .from("trades")
    .delete()
    .eq("account_signature", signature)
    .eq("user_id", user.id);

  // Delete the account
  const { error } = await svc
    .from("trading_accounts")
    .delete()
    .eq("account_signature", signature)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
