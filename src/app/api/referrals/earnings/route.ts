import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: ()    => cookieStore.getAll(),
        setAll: (cs)  => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

export async function GET() {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Last 6 months
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const { data: commissions } = await supabase
    .from("commissions")
    .select("month, amount, status")
    .eq("referrer_id", user.id)
    .in("month", months)
    .neq("status", "cancelled");

  // Aggregate by month
  const byMonth: Record<string, { confirmed: number; pending: number }> = {};
  months.forEach(m => { byMonth[m] = { confirmed: 0, pending: 0 }; });

  (commissions || []).forEach(c => {
    if (!byMonth[c.month]) return;
    const amt = Number(c.amount);
    if (c.status === "confirmed" || c.status === "paid") {
      byMonth[c.month].confirmed += amt;
    } else {
      byMonth[c.month].pending += amt;
    }
  });

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const data = months.map(m => ({
    month:     MONTH_NAMES[parseInt(m.slice(5)) - 1] + " '" + m.slice(2, 4),
    month_key: m,
    confirmed: +byMonth[m].confirmed.toFixed(2),
    pending:   +byMonth[m].pending.toFixed(2),
    total:     +(byMonth[m].confirmed + byMonth[m].pending).toFixed(2),
  }));

  return NextResponse.json({ earnings: data });
}
