import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

export async function GET(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountParam = new URL(request.url).searchParams.get("account");

  const svc = serviceDb();
  let query = svc
    .from("ea_tokens")
    .select("token, account_number, broker_server")
    .eq("user_id", user.id);

  if (accountParam) {
    query = query.eq("account_number", accountParam) as typeof query;
  } else {
    query = query.order("created_at", { ascending: false }) as typeof query;
  }

  const { data: tokenRow } = await query.maybeSingle();

  if (!tokenRow)
    return NextResponse.json(
      { error: "No EA token found. Generate one first in onboarding or Settings." },
      { status: 404 }
    );

  // MT5 parameter preset format (.set file)
  const setContent =
    `[T3]\r\n` +
    `InpToken=${tokenRow.token}\r\n` +
    `InpAccount=${tokenRow.account_number}\r\n` +
    `InpDaysBack=365\r\n`;

  return new Response(setContent, {
    headers: {
      "Content-Type":        "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="NIRI_settings_${tokenRow.account_number}.set"`,
      "Cache-Control":       "no-store",
    },
  });
}
