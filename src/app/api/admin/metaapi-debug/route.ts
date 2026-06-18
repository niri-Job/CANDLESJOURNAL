import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// Temporary diagnostic route — checks raw MetaAPI account state server-side,
// where METAAPI_TOKEN resolves to its real value. Admin-gated. Safe to delete
// once the two stuck-sync accounts are diagnosed.
export async function GET(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  if (!idsParam) return NextResponse.json({ error: "Pass ?ids=id1,id2" }, { status: 400 });

  const accountIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const results = await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        const res = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}`, {
          headers: { "auth-token": token },
          cache:   "no-store",
        });
        const body = await res.json().catch(() => ({}));
        return { accountId, status: res.status, body };
      } catch (e) {
        return { accountId, status: 0, error: (e as { message?: string }).message ?? "Network error" };
      }
    })
  );

  return NextResponse.json({ results });
}
