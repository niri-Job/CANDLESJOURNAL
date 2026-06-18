import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const CLIENT_API   = "https://mt-client-api-v1.london.agiliumtrade.ai";
const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// Temporary diagnostic route — force-undeploys specific MetaAPI accounts.
// Admin-gated. Safe to delete once done.
export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const token: string | undefined = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });
  const authToken: string = token;

  let body: { ids?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const ids = (body.ids ?? []).map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "Pass { ids: [...] }" }, { status: 400 });

  async function tryUndeploy(base: string, accountId: string, method: "PUT" | "POST") {
    try {
      const res = await fetch(`${base}/users/current/accounts/${accountId}/undeploy`, {
        method,
        headers: { "auth-token": authToken, "Content-Type": "application/json" },
        cache:   "no-store",
      });
      const body = await res.text();
      return { status: res.status, ok: res.ok, body };
    } catch (e) {
      return { status: 0, ok: false, error: (e as { message?: string }).message ?? "Network error" };
    }
  }

  const results = await Promise.all(
    ids.map(async (accountId) => ({
      accountId,
      clientApiPut:     await tryUndeploy(CLIENT_API, accountId, "PUT"),
      clientApiPost:    await tryUndeploy(CLIENT_API, accountId, "POST"),
      provisioningPut:  await tryUndeploy(PROVISIONING, accountId, "PUT"),
      provisioningPost: await tryUndeploy(PROVISIONING, accountId, "POST"),
    }))
  );

  return NextResponse.json({ results });
}

export async function GET(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();
  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });

  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const results = await Promise.all(
    ids.map(async (accountId) => {
      const res = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}`, {
        headers: { "auth-token": token }, cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      return { accountId, status: res.status, state: body.state, connectionStatus: body.connectionStatus };
    })
  );

  return NextResponse.json({ results });
}
