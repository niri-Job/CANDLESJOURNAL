import Anthropic from "@anthropic-ai/sdk";

export interface TradeForAnalysis {
  pair: string;
  direction: string;
  lot: number;
  date: string;
  entry: number;
  exit_price: number | null;
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
  period: "daily" | "weekly" | "monthly"
): Promise<string> {
  const client = new Anthropic();

  const closedTrades = trades.filter((t) => t.pnl != null);
  const winners  = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
  const losers   = closedTrades.filter((t) => (t.pnl ?? 0) < 0);
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const winRate  = closedTrades.length > 0
    ? ((winners.length / closedTrades.length) * 100).toFixed(1)
    : "N/A";

  const bestTrade  = closedTrades.reduce<TradeForAnalysis | null>(
    (b, t) => !b || (t.pnl ?? 0) > (b.pnl ?? 0) ? t : b, null);
  const worstTrade = closedTrades.reduce<TradeForAnalysis | null>(
    (w, t) => !w || (t.pnl ?? 0) < (w.pnl ?? 0) ? t : w, null);

  const tradesSummary = trades
    .map((t, i) => {
      const rr =
        t.sl != null && t.tp != null && t.entry != null && t.entry !== t.sl
          ? Math.abs((t.tp - t.entry) / (t.entry - t.sl)).toFixed(2)
          : "N/A";
      const pnlStr = t.pnl != null
        ? (t.pnl >= 0 ? "+" : "") + t.pnl.toFixed(2)
        : "open";
      return `Trade ${i + 1}: ${t.pair} ${t.direction.toUpperCase()} | ${t.date} | Lot: ${t.lot} | Entry: ${t.entry} | Exit: ${t.exit_price ?? "open"} | SL: ${t.sl ?? "none"} | TP: ${t.tp ?? "none"} | P&L: ${pnlStr} | R:R: ${rr} | Asset: ${t.asset_class ?? "Forex"} | Session: ${t.session ?? "N/A"} | Setup: ${t.setup || "none"} | Notes: ${t.notes || "none"}`;
    })
    .join("\n");

  const periodLabel = period === "daily" ? "today's" : period === "weekly" ? "last 7 days'" : "last 30 days'";
  const drillLabel  = period === "daily" ? "TOMORROW'S" : period === "weekly" ? "NEXT WEEK'S" : "NEXT MONTH'S";
  const bestLine    = bestTrade  ? `Trade ${trades.indexOf(bestTrade)  + 1} (${bestTrade.pair}  ${bestTrade.direction}, P&L: +${bestTrade.pnl?.toFixed(2)})` : "N/A";
  const worstLine   = worstTrade ? `Trade ${trades.indexOf(worstTrade) + 1} (${worstTrade.pair} ${worstTrade.direction}, P&L: ${worstTrade.pnl?.toFixed(2)})` : "N/A";

  const prompt = `You are an expert forex trading coach analysing a trader's journal. The trader is based in Africa and trades forex, crypto, indices, and commodities.

Here is their ${periodLabel} trading data:
- Total trades: ${trades.length} | Closed: ${closedTrades.length} | Winners: ${winners.length} | Losers: ${losers.length} | Win rate: ${winRate}% | Total P&L: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
- Best trade: ${bestLine}
- Worst trade: ${worstLine}

${tradesSummary}

Provide a structured coaching analysis with EXACTLY these section headings (copy them verbatim including emoji):

## 🏆 BEST TRADE
Identify the best trade by P&L. State: pair, direction, entry, exit, P&L, and WHY it was good (setup quality, R:R, discipline). Cite the trade number.

## 💀 WORST TRADE
Identify the worst trade by P&L. State: pair, direction, entry, exit, P&L, and WHAT went wrong. Be blunt. Cite the trade number.

## 📊 YOUR STRATEGY (DETECTED)
Based on entry/exit patterns, lot sizes, sessions, and setups, identify the likely trading approach. Name it specifically (e.g. "Break & Retest on H4", "Asian session scalping", "Swing trading 1:3 R:R"). Reference specific trades as evidence.

## 🛑 STOP DOING
The single most harmful behaviour visible in this data. Be direct and cite trade numbers. One paragraph only.

## ✅ START DOING
The single most impactful change this trader should make immediately. Be concrete and actionable. Cite evidence from the data.

## 🎯 FOCUS PAIRS
Pairs with best performance (win rate or R:R): state them. Pairs to avoid based on data: state them. Format: "Trade: [pairs] | Avoid: [pairs] | Reason: [brief reason]"

## ⏰ YOUR BEST SESSION
Which session produces the best results? State it, give win rate for that session if calculable, and explain why it suits this trader's style.

## ⚖️ RISK ASSESSMENT
Evaluate lot sizing, SL/TP usage, and risk-per-trade consistency. Label as: Conservative / Disciplined / Aggressive / Reckless. Give one concrete example from the trades.

## 📈 CONSISTENCY SCORE
Score 0–100 based on: win rate, R:R quality, lot discipline, SL/TP use, and session focus. State it clearly (e.g. "Score: 68/100") with a 2-sentence explanation.

## 💪 ${drillLabel} FOCUS
One specific, measurable drill addressing the biggest weakness. Be exact — e.g. "Trade only XAUUSD London session for 5 days, minimum 1:2 R:R, max 0.05 lot, no trades without SL."

Be direct, specific, and reference trade numbers (Trade 1, Trade 4, etc.) throughout. No vague advice.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");
  return content.text;
}
