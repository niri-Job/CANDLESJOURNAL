import { NextResponse } from "next/server";

export const revalidate = 3600;

const TIMEOUT_MS = 5000;

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      {
        headers: { "Accept": "application/json" },
        signal: controller.signal,
        next: { revalidate: 3600 },
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = (err as Error).name === "AbortError";
    console.error("calendar proxy:", isTimeout ? "timed out after 5s" : err);
    return NextResponse.json([], { status: 200 }); // empty array so UI degrades gracefully
  }
}
