import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Simple bearer-token guard — caller must pass ADMIN_SECRET env var as Authorization
  const authHeader = request.headers.get("authorization") ?? "";
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    adminKey,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("trading_accounts")
    .delete()
    .eq("sync_method", "ea")
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: data?.length ?? 0 });
}
