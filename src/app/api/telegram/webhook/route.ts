import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Telegram sends updates to this endpoint when a message is received
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let update: {
    message?: {
      chat?: { id: number };
      text?: string;
    };
  };
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const chatId = update?.message?.chat?.id;
  const text   = update?.message?.text?.trim() ?? "";

  if (!chatId) return NextResponse.json({ ok: true });

  if (text === "/start" || text === "/help") {
    await sendTelegramMessage(token, chatId, [
      "<b>Welcome to NIRI Bot</b> 👋",
      "",
      "I post daily market setups for forex traders.",
      "",
      "Commands:",
      "/setup — Get today's market setup",
      "/start — Show this message",
    ].join("\n"));
  } else if (text === "/setup") {
    // Trigger daily setup for this chat
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://niri.live";
    try {
      await fetch(`${baseUrl}/api/telegram/daily-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
      });
    } catch (err) {
      console.error("[telegram/webhook] daily-setup trigger failed:", err);
      await sendTelegramMessage(token, chatId, "Sorry, couldn't fetch market data right now. Try again shortly.");
    }
  }

  return NextResponse.json({ ok: true });
}

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}
