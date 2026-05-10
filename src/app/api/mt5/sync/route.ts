import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use the NIRI EA to sync trades — see Settings." },
    { status: 410 }
  );
}
