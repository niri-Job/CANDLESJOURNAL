import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { makeAdminToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const adminPw = (process.env.ADMIN_PASSWORD ?? "").trim();
  console.log("ADMIN_PASSWORD exists:", !!adminPw, "| length:", adminPw.length);

  if (!adminPw)
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });

  let body: { password?: string };
  try { body = await request.json(); } catch { body = {}; }

  if (!body.password || body.password.trim() !== adminPw)
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });

  const store = await cookies();
  store.set("niri_admin", makeAdminToken(), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   60 * 60 * 8, // 8 hours
    path:     "/",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete("niri_admin");
  return NextResponse.json({ ok: true });
}
