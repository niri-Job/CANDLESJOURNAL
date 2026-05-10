import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function makeClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

// GET /api/notifications — active notifications with per-user read status
export async function GET() {
  const supabase = await makeClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: notifications }, { data: reads }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, message, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_id", user.id),
  ]);

  const readIds = new Set((reads ?? []).map((r) => (r as { notification_id: string }).notification_id));
  const items = (notifications ?? []).map((n) => ({
    ...(n as { id: string; title: string; message: string; created_at: string }),
    read: readIds.has((n as { id: string }).id),
  }));

  return NextResponse.json({
    notifications: items,
    unread_count: items.filter((n) => !n.read).length,
  });
}

// POST /api/notifications — mark all active notifications as read for this user
export async function POST() {
  const supabase = await makeClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id")
    .eq("is_active", true);

  if (!notifications?.length) return NextResponse.json({ ok: true });

  await supabase.from("notification_reads").upsert(
    notifications.map((n) => ({
      user_id:         user.id,
      notification_id: (n as { id: string }).id,
    })),
    { onConflict: "user_id,notification_id", ignoreDuplicates: true }
  );

  return NextResponse.json({ ok: true });
}
