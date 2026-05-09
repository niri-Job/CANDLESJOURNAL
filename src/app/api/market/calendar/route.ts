import { NextResponse } from "next/server";

// Never serve a cached ISR snapshot — always proxy fresh data from ForexFactory.
// The CDN caches the response for 15 min via Cache-Control, giving freshness
// without hammering the upstream on every page load.
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8000;

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      {
        headers: { "Accept": "application/json" },
        signal: controller.signal,
        cache: "no-store", // bypass Next.js fetch cache — always hit ForexFactory
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        // CDN caches 15 min; serves stale for up to 3 min during revalidation
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=180",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = (err as Error).name === "AbortError";
    console.error("calendar proxy:", isTimeout ? "timed out after 8s" : err);
    return NextResponse.json([], { status: 200 }); // empty array so UI degrades gracefully
  }
}
