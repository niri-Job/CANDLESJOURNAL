import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWelcomeEmail } from "@/lib/email";

function adminDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  let email: string, password: string;
  try {
    ({ email, password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  let supabase: ReturnType<typeof adminDb>;
  try {
    supabase = adminDb();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Surface duplicate-email as a friendly message
    if (error.message?.toLowerCase().includes("already registered") ||
        error.message?.toLowerCase().includes("already been registered") ||
        error.message?.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Fire-and-forget — email failure must never block account creation
  const nameFromEmail = email.split("@")[0].replace(/[._-]/g, " ");
  sendWelcomeEmail(email, nameFromEmail).catch((err) =>
    console.error("[signup] welcome email error:", err)
  );

  return NextResponse.json({ success: true, userId: data.user.id });
}
