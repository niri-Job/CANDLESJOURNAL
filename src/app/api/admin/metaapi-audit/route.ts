import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// Temporary diagnostic route — finds every MetaAPI-connected trading_accounts
// row, checks its live deploy state, and undeploys any still DEPLOYED
// (cleanup for accounts stranded by the broken auto-undeploy URL).
// Admin-gated. Safe to delete once done.

function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request) {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const token = process.env.METAAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") !== "false"; // default: dry run, no undeploy

  const svc = serviceDb();
  const { data: accounts, error } = await svc
    .from("trading_accounts")
    .select("id, user_id, account_signature, metaapi_account_id")
    .not("metaapi_account_id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.all(
    (accounts ?? []).map(async (acc) => {
      try {
        const res = await fetch(`${PROVISIONING}/users/current/accounts/${acc.metaapi_account_id}`, {
          headers: { "auth-token": token }, cache: "no-store",
        });
        if (!res.ok) {
          return { ...acc, checkStatus: res.status, state: null, action: "skip-check-failed" };
        }
        const body = await res.json() as { state?: string; connectionStatus?: string };

        if (body.state === "DEPLOYED" && !dryRun) {
          const undeployRes = await fetch(`${PROVISIONING}/users/current/accounts/${acc.metaapi_account_id}/undeploy`, {
            method: "POST", headers: { "auth-token": token }, cache: "no-store",
          });
          return {
            ...acc, state: body.state, connectionStatus: body.connectionStatus,
            action: "undeployed", undeployStatus: undeployRes.status,
          };
        }

        return {
          ...acc, state: body.state, connectionStatus: body.connectionStatus,
          action: body.state === "DEPLOYED" ? "would-undeploy (dry run)" : "already-undeployed",
        };
      } catch (e) {
        return { ...acc, action: "error", error: (e as { message?: string }).message };
      }
    })
  );

  return NextResponse.json({ dryRun, totalAccounts: accounts?.length ?? 0, results });
}
