// Shared market-data fetching used by both /api/intelligence and /api/telegram/daily-setup.
// Single source of truth — whatever prices the app shows, the Telegram message shows too.

export const MARKET_PAIRS = [
  { symbol: "EURUSD=X",  label: "EURUSD",  decimals: 5 },
  { symbol: "GBPUSD=X",  label: "GBPUSD",  decimals: 5 },
  { symbol: "USDJPY=X",  label: "USDJPY",  decimals: 3 },
  { symbol: "USDCHF=X",  label: "USDCHF",  decimals: 5 },
  { symbol: "AUDUSD=X",  label: "AUDUSD",  decimals: 5 },
  { symbol: "USDCAD=X",  label: "USDCAD",  decimals: 5 },
  { symbol: "NZDUSD=X",  label: "NZDUSD",  decimals: 5 },
  { symbol: "XAUUSD=X",  label: "XAUUSD",  decimals: 2 },
  { symbol: "^DJI",      label: "US30",    decimals: 0 },
  { symbol: "BTC-USD",   label: "BTCUSD",  decimals: 0 },
] as const;

export type PairConfig = (typeof MARKET_PAIRS)[number];

export interface PairIndicators {
  label: string;
  price: number;
  dailyChangePct: number;
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macdLine: number;
  macdHist: number;
  bbUpper: number;
  bbLower: number;
  bbPct: number;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
}

// ── TA helpers ────────────────────────────────────────────────────────────────

export function calcEma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

export function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

export function calcMacd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 35) return { line: 0, signal: 0, hist: 0 };
  const macdLine: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const sl = closes.slice(0, i);
    macdLine.push(calcEma(sl, 12) - calcEma(sl, 26));
  }
  const line = macdLine[macdLine.length - 1];
  const signal = calcEma(macdLine, 9);
  return { line, signal, hist: line - signal };
}

export function calcBbands(closes: number[], period = 20): { upper: number; mid: number; lower: number } {
  const last = closes[closes.length - 1];
  if (closes.length < period) return { upper: last, mid: last, lower: last };
  const sl = closes.slice(-period);
  const sma = sl.reduce((s, v) => s + v, 0) / period;
  const std = Math.sqrt(sl.reduce((s, v) => s + (v - sma) ** 2, 0) / period);
  return { upper: sma + 2 * std, mid: sma, lower: sma - 2 * std };
}

// ── Yahoo Finance fetch (30 days of hourly data, same as /api/intelligence) ───

export async function fetchCloses(yahooSymbol: string): Promise<number[]> {
  type YahooResp = {
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; previousClose?: number };
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };

  let lastError: unknown;
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1h&range=30d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }

      const json = await res.json() as YahooResp;
      const result = json?.chart?.result?.[0];
      const raw    = result?.indicators?.quote?.[0]?.close ?? [];
      const regMkt = result?.meta?.regularMarketPrice;

      // Filter out nulls — Yahoo often trails raw arrays with null for weekends/holidays
      const closes = raw.filter((c): c is number => c !== null && !isNaN(c));

      console.log(`[marketPrices] ${host} ${yahooSymbol}: closes=${closes.length} last_close=${closes.at(-1)} regularMarketPrice=${regMkt}`);

      if (closes.length < 5 && !regMkt) { lastError = "no usable data"; continue; }

      // If Yahoo's regularMarketPrice differs from the last close (stale series),
      // replace the last element with the live quote so TA uses a current price.
      if (regMkt && regMkt > 0 && closes.length > 0) {
        const drift = Math.abs(closes[closes.length - 1] - regMkt) / regMkt;
        if (drift > 0.005) {
          console.log(`[marketPrices] ${yahooSymbol}: replacing stale last_close=${closes.at(-1)} with regularMarketPrice=${regMkt}`);
          closes[closes.length - 1] = regMkt;
        }
      }

      // If closes array is too short but we have a live quote, build a synthetic series
      if (closes.length < 30 && regMkt && regMkt > 0) {
        console.log(`[marketPrices] ${yahooSymbol}: sparse closes (${closes.length}), padding with regularMarketPrice=${regMkt}`);
        while (closes.length < 30) closes.unshift(regMkt);
      }

      if (closes.length < 5) { lastError = `only ${closes.length} closes`; continue; }
      return closes;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Yahoo fetchCloses failed for ${yahooSymbol}: ${lastError}`);
}

// ── Full indicator fetch for one pair ─────────────────────────────────────────

export async function fetchPairIndicators(p: { symbol: string; label: string; decimals: number }): Promise<PairIndicators | null> {
  try {
    const closes = await fetchCloses(p.symbol);
    if (closes.length < 30) return null;

    const price         = closes[closes.length - 1];
    const prev24h       = closes.length > 24 ? closes[closes.length - 25] : closes[0];
    const dailyChangePct = prev24h > 0 ? ((price - prev24h) / prev24h) * 100 : 0;

    const rsi    = calcRsi(closes);
    const ema20  = calcEma(closes, 20);
    const ema50  = calcEma(closes, 50);
    const ema200 = calcEma(closes, Math.min(200, closes.length - 1));
    const macd   = calcMacd(closes);
    const bb     = calcBbands(closes);
    const bbRange = bb.upper - bb.lower;
    const bbPct  = bbRange > 0 ? Math.round(((price - bb.lower) / bbRange) * 100) : 50;

    const bullPoints = [price > ema20, price > ema50, price > ema200, macd.hist > 0, rsi > 50].filter(Boolean).length;
    const trend: PairIndicators["trend"] = bullPoints >= 4 ? "BULLISH" : bullPoints <= 1 ? "BEARISH" : "NEUTRAL";

    return {
      label: p.label, price, dailyChangePct,
      rsi, ema20, ema50, ema200,
      macdLine: macd.line, macdHist: macd.hist,
      bbUpper: bb.upper, bbLower: bb.lower, bbPct,
      trend,
    };
  } catch (e) {
    console.warn(`[marketPrices] ${p.label} fetch failed:`, e);
    return null;
  }
}
