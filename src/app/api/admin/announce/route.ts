import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";
import { sendAnnouncementEmail } from "@/lib/email";

export const dynamic    = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby allows up to 60s for API routes

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

  // ── Single recipient ─────────────────────────────────────────────────────────
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

  // ── Fetch recipient list ─────────────────────────────────────────────────────
  const db = svc();

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
    return NextResponse.json({ sent: 0, total: 0, message: "No matching users found" });
  }

  const userIds = new Set((profiles as { user_id: string }[]).map((p) => p.user_id));
  const emailMap: Record<string, string> = {};

  let page = 1;
  while (true) {
    const { data: listData, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    for (const u of listData.users) {
      if (userIds.has(u.id) && u.email) emailMap[u.id] = u.email;
    }
    if (listData.users.length < 1000) break;
    page++;
  }

  const emails = Object.values(emailMap);
  if (emails.length === 0) {
    return NextResponse.json({ sent: 0, total: 0, message: "No emails found for matching users" });
  }

  // ── Stream progress as newline-delimited JSON ─────────────────────────────────
  // Send 1 email per second to stay safely under Resend's 5 req/s rate limit.
  // Each completed send (success or failure) streams a progress line to the client
  // so the admin sees a live counter instead of a stuck "Sending..." button.
  const subj    = subject.trim();
  const body    = message.trim();
  const total   = emails.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let sent   = 0;
      const errors: string[] = [];

      const push = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      for (let i = 0; i < emails.length; i++) {
        try {
          await sendAnnouncementEmail(emails[i], subj, body);
          sent++;
          console.log(`[announce] sent ${sent}/${total} → ${emails[i]}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${emails[i]}: ${msg}`);
          console.error(`[announce] failed ${emails[i]}:`, msg);
        }

        // Stream progress after every send so the UI can update in real time
        push({ sent, total, done: false, errors: errors.length > 0 ? errors : undefined });

        // 1 000 ms between sends ≈ 1/s — well under Resend's 5/s limit
        if (i < emails.length - 1) {
          await new Promise((r) => setTimeout(r, 1_000));
        }
      }

      // Final frame — done: true signals the client to close the stream
      push({ sent, total, done: true, errors: errors.length > 0 ? errors : undefined });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
