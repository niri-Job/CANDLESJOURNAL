import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Haiku 4.5 pricing ($/1M tokens)
const HAIKU_INPUT_PER_M  = 1.00;
const HAIKU_OUTPUT_PER_M = 5.00;
// Average token estimate per AI analysis call
const AVG_INPUT_TOKENS   = 700;
const AVG_OUTPUT_TOKENS  = 1500;
const COST_PER_CALL      =
  (AVG_INPUT_TOKENS  / 1_000_000) * HAIKU_INPUT_PER_M +
  (AVG_OUTPUT_TOKENS / 1_000_000) * HAIKU_OUTPUT_PER_M;

function svc() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface AnthropicUsage {
  input_tokens:  number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

async function fetchAnthropicUsage(): Promise<AnthropicUsage | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  // Month-to-date window
  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const tomorrow   = new Date(now.getTime() + 86_400_000).toISOString().split("T")[0];

  try {
    const res = await fetch(
      `https://api.anthropic.com/v1/usage?start_time=${monthStart}&end_time=${tomorrow}&granularity=all`,
      {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      console.warn(`[ai-usage] Anthropic usage API returned ${res.status}`);
      return null;
    }
    const body = await res.json() as { data?: AnthropicUsage[] | AnthropicUsage; usage?: AnthropicUsage };
    // Handle both possible response shapes
    const usage = (body as { usage?: AnthropicUsage }).usage
      ?? (Array.isArray((body as { data?: AnthropicUsage[] }).data)
          ? (body as { data: AnthropicUsage[] }).data[0]
          : (body as { data?: AnthropicUsage }).data)
      ?? null;
    return usage ?? null;
  } catch (e) {
    console.warn("[ai-usage] Anthropic usage fetch failed:", e);
    return null;
  }
}

export async function GET() {
  if (!await verifyAdminCookie()) return adminUnauthorized();

  const anthropicKeyPresent = !!process.env.ANTHROPIC_API_KEY;
  const db = svc();

  // Load user profiles + auth users in parallel
  const [profilesRes, authRes, anthropicUsage] = await Promise.all([
    db.from("user_profiles")
      .select("user_id, ai_credits_used, subscription_status, subscription_end")
      .order("ai_credits_used", { ascending: false }),
    db.auth.admin.listUsers({ page: 1, perPage: 500 }),
    fetchAnthropicUsage(),
  ]);

  const profiles  = profilesRes.data ?? [];
  const authUsers = authRes.data?.users ?? [];
  const emailMap  = new Map(authUsers.map(u => [u.id, u.email ?? ""]));

  // Per-user breakdown (only users with at least 1 analysis)
  const perUser = profiles
    .filter(p => ((p as { ai_credits_used?: number }).ai_credits_used ?? 0) > 0)
    .map(p => {
      const used = (p as { ai_credits_used?: number }).ai_credits_used ?? 0;
      const isPro =
        (p as { subscription_status?: string }).subscription_status === "pro" &&
        !!(p as { subscription_end?: string }).subscription_end &&
        new Date((p as { subscription_end: string }).subscription_end) > new Date();
      return {
        user_id:   p.user_id,
        email:     emailMap.get(p.user_id) ?? p.user_id,
        analyses:  used,
        plan:      isPro ? "Pro" : "Trial/Free",
      };
    });

  const totalAnalyses = perUser.reduce((s, u) => s + u.analyses, 0);
  const estimatedCostUsd = totalAnalyses * COST_PER_CALL;

  // If Anthropic usage API worked, use real token counts; otherwise use estimates
  const tokens = anthropicUsage
    ? {
        input:  anthropicUsage.input_tokens,
        output: anthropicUsage.output_tokens,
        source: "anthropic_api" as const,
      }
    : {
        input:  totalAnalyses * AVG_INPUT_TOKENS,
        output: totalAnalyses * AVG_OUTPUT_TOKENS,
        source: "estimated" as const,
      };

  const cost = anthropicUsage
    ? (anthropicUsage.input_tokens  / 1_000_000) * HAIKU_INPUT_PER_M +
      (anthropicUsage.output_tokens / 1_000_000) * HAIKU_OUTPUT_PER_M
    : estimatedCostUsd;

  return NextResponse.json({
    anthropic_key_present: anthropicKeyPresent,
    total_analyses:        totalAnalyses,
    tokens,
    cost_usd:              parseFloat(cost.toFixed(4)),
    cost_source:           anthropicUsage ? "anthropic_api" : "estimated",
    per_user:              perUser,
    month:                 new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }),
  });
}
