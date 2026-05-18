import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";
import { sendAnnouncementEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  let subject: string, message: string, recipients: "all" | "pro" | "specific", specific_email: string | undefined;
  try {
    ({ subject, message, recipients, specific_email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }
  if (recipients !== "all" && recipients !== "pro" && recipients !== "specific") {
    return NextResponse.json({ error: "Invalid recipients value" }, { status: 400 });
  }
  if (recipients === "specific") {
    if (!specific_email?.trim()) {
      return NextResponse.json({ error: "Email address is required for specific user" }, { status: 400 });
    }
    try {
      await sendAnnouncementEmail(specific_email.trim(), subject.trim(), message.trim());
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
    return NextResponse.json({ sent: 1, total: 1, email: specific_email.trim() });
  }

  const db = svc();

  // Query user_profiles for emails; join auth.users via service role
  let query = db
    .from("user_profiles")
    .select("user_id, subscription_status, subscription_end");

  if (recipients === "pro") {
    query = query
      .eq("subscription_status", "pro")
      .gt("subscription_end", new Date().toISOString());
  }

  const { data: profiles, error: profilesErr } = await query;
  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ sent: 0, message: "No matching users found" });
  }

  // Fetch emails for these user IDs via admin.listUsers (paginated)
  const userIds = new Set((profiles as { user_id: string }[]).map((p) => p.user_id));
  const emailMap: Record<string, string> = {};

  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: listData, error: listErr } = await db.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }
    for (const u of listData.users) {
      if (userIds.has(u.id) && u.email) {
        emailMap[u.id] = u.email;
      }
    }
    if (listData.users.length < perPage) break;
    page++;
  }

  const emails = Object.values(emailMap);
  if (emails.length === 0) {
    return NextResponse.json({ sent: 0, message: "No emails found for matching users" });
  }

  // 3 concurrent sends + 200ms between groups ≈ ~3 emails/s, under Resend's 5/s limit.
  // Check elapsed time before each group and return a partial result if we're close
  // to Vercel's 10s function timeout so the endpoint always responds.
  const BATCH      = 3;
  const DELAY_MS   = 200;
  const TIMEOUT_MS = 8_500; // bail out with partial result before Vercel hard-kills us

  let sent = 0;
  const errors: string[] = [];
  const start = Date.now();
  const subj  = subject.trim();
  const body  = message.trim();

  for (let i = 0; i < emails.length; i += BATCH) {
    if (Date.now() - start > TIMEOUT_MS) {
      return NextResponse.json({
        sent,
        total:   emails.length,
        partial: true,
        message: `Timed out — sent ${sent} of ${emails.length} emails before the 10 s limit.`,
        errors:  errors.length > 0 ? errors : undefined,
      });
    }

    const batch   = emails.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((email) => sendAnnouncementEmail(email, subj, body))
    );

    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        sent++;
      } else {
        errors.push(`${batch[idx]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    });

    if (i + BATCH < emails.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return NextResponse.json({
    sent,
    total:  emails.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
