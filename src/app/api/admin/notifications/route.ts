import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  if (!await verifyAdminCookie()) return adminUnauthorized();
  const db = svc();
  const { data, error } = await db
    .from("notifications")
    .select("id, title, message, created_at, is_active")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();
  let body: { title?: string; message?: string };
  try { body = await request.json(); } catch { body = {}; }
  const { title, message } = body;
  if (!title?.trim() || !message?.trim())
    return NextResponse.json({ error: "title and message required" }, { status: 400 });
  const db = svc();
  const { error } = await db.from("notifications").insert({ title: title.trim(), message: message.trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/notifications?id=<uuid> — soft delete (deactivate)
export async function DELETE(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = svc();
  const { error } = await db.from("notifications").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
