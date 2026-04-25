import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      {
        headers: { "Accept": "application/json" },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("calendar proxy:", err);
    return NextResponse.json([], { status: 200 }); // return empty array so UI degrades gracefully
  }
}
