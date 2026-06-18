import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const CLIENT_API = "https://mt-client-api-v1.london.agiliumtrade.ai";

// Temporary diagnostic route — force-undeploys specific MetaAPI accounts.
// Admin-gated. Safe to delete once done.
export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });

  let body: { ids?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const ids = (body.ids ?? []).map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "Pass { ids: [...] }" }, { status: 400 });

  const results = await Promise.all(
    ids.map(async (accountId) => {
      try {
        const res = await fetch(`${CLIENT_API}/users/current/accounts/${accountId}/undeploy`, {
          method:  "PUT",
          headers: { "auth-token": token },
          cache:   "no-store",
        });
        const body = await res.text();
        return { accountId, status: res.status, ok: res.ok, body };
      } catch (e) {
        return { accountId, status: 0, ok: false, error: (e as { message?: string }).message ?? "Network error" };
      }
    })
  );

  return NextResponse.json({ results });
}
