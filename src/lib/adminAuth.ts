import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { NextResponse } from "next/server";

export function makeAdminToken(): string {
  const pw = process.env.ADMIN_PASSWORD ?? "unset";
  return createHmac("sha256", pw).update("niri-admin-v1").digest("hex");
}

export async function verifyAdminCookie(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) return false;
  const store = await cookies();
  return (store.get("niri_admin")?.value ?? "") === makeAdminToken();
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
