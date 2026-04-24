import Anthropic from "@anthropic-ai/sdk";

export interface TradeForAnalysis {
  pair: string;
  direction: string;
  lot: number;
  date: string;
  entry: number;
  exit: number | null;
  sl: number | null;
  tp: number | null;
  pnl: number | null;
  notes: string | null;
  asset_class: string | null;
  session: string | null;
  setup: string | null;
}

export async function analyzeJournal(
  trades: TradeForAnalysis[],
  period: "weekly" | "monthly"
): Promise<string> {
  const client = new Anthropic();

  const closedTrades = trades.filter((t) => t.pnl != null);
  const winners = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const winRate =
    closedTrades.length > 0
      ? ((winners.length / closedTrades.length) * 100).toFixed(1)
      : "N/A";

  const tradesSummary = trades
    .map((t, i) => {
      const rr =
        t.sl != null && t.tp != null && t.entry != null && t.entry !== t.sl
          ? Math.abs((t.tp - t.entry) / (t.entry - t.sl)).toFixed(2)
          : "N/A";
      const pnlStr =
        t.pnl != null
          ? (t.pnl >= 0 ? "+" : "") + t.pnl.toFixed(2)
          : "open";
      return `Trade ${i + 1}: ${t.pair} ${t.direction.toUpperCase()} | ${t.date} | Lot: ${t.lot} | Entry: ${t.entry} | Exit: ${t.exit ?? "open"} | SL: ${t.sl ?? "none"} | TP: ${t.tp ?? "none"} | P&L: ${pnlStr} | R:R: ${rr} | Asset: ${t.asset_class ?? "Forex"} | Session: ${t.session ?? "N/A"} | Setup: ${t.setup || "none"} | Notes: ${t.notes || "none"}`;
    })
    .join("\n");

  const prompt = `You are an expert forex trading coach analysing a trader's journal. The trader is based in Africa and trades forex, crypto, indices, and stocks.

Here is their ${period} trading data:
- Total trades: ${trades.length} | Closed: ${closedTrades.length} | Win rate: ${winRate}% | Total P&L: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}

${tradesSummary}

Provide a structured coaching analysis using these exact section headings:

## Performance Score
Score this trader 0–100 based on risk management, consistency, win rate, and R:R quality. State it clearly (e.g. "Score: 72/100") and give a 2-sentence explanation.

## Top 3 Strengths
List 3 strengths. For each one, cite specific trade numbers from the data above as evidence.

## Top 3 Weaknesses
List 3 weaknesses. For each one, cite specific trade numbers from the data above as evidence.

## Most Important Behavioural Pattern
Identify the single most significant pattern in this trader's behaviour. Reference specific trades. Be direct.

## 3 Actionable Recommendations
Give 3 concrete, measurable steps this trader should implement in the next ${period === "weekly" ? "week" : "month"}. Make them specific to what you saw in the data.

Be direct and specific. Use trade numbers (Trade 1, Trade 4, etc.) when giving examples.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");
  return content.text;
}
