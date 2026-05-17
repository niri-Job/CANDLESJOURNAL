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

// ── Yahoo Finance crumb authentication ────────────────────────────────────────
// Yahoo requires a session crumb since ~2024; without it, chart responses are
// served from a stale CDN cache and prices can be months/years out of date.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let _crumb: { value: string; cookie: string; expiresAt: number } | null = null;

async function acquireYahooCrumb(): Promise<{ value: string; cookie: string } | null> {
  if (_crumb && Date.now() < _crumb.expiresAt) {
    return { value: _crumb.value, cookie: _crumb.cookie };
  }

  try {
    // Step 1: hit Yahoo Finance to receive a session cookie
    const homeRes = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    // Collect Set-Cookie values into one Cookie header string.
    // getSetCookie() is Node 18+ / Undici; fall back to the combined get() string.
    const rawCookies: string[] = [];
    const headers = homeRes.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof headers.getSetCookie === "function") {
      headers.getSetCookie().forEach((c: string) => rawCookies.push(c.split(";")[0]));
    } else {
      (homeRes.headers.get("set-cookie") ?? "")
        .split(",")
        .forEach(c => rawCookies.push(c.split(";")[0].trim()));
    }
    const cookie = rawCookies.filter(Boolean).join("; ");

    // Step 2: exchange cookie for crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/csrfToken", {
      headers: { "User-Agent": UA, "Cookie": cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!crumbRes.ok) {
      console.warn(`[marketPrices] crumb request failed HTTP ${crumbRes.status}`);
      return null;
    }
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length > 64) {
      console.warn("[marketPrices] crumb response invalid:", crumb.slice(0, 40));
      return null;
    }

    console.log("[marketPrices] Yahoo crumb acquired");
    _crumb = { value: crumb, cookie, expiresAt: Date.now() + 55 * 60 * 1000 };
    return { value: crumb, cookie };
  } catch (e) {
    console.warn("[marketPrices] crumb acquisition failed:", e);
    return null;
  }
}

// ── Live batch quote (backup spot price) ─────────────────────────────────────
// Fetches current market prices for all symbols in a single v7/quote request.
// Used to override stale chart-series closes when the authenticated chart API
// still returns out-of-date regularMarketPrice (extra safety net).

async function fetchLiveQuotes(
  symbols: string[],
  auth: { value: string; cookie: string } | null,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (symbols.length === 0) return prices;

  try {
    const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.value)}` : "";
    const symbolsQ = symbols.map(encodeURIComponent).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsQ}&fields=regularMarketPrice${crumbQ}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        ...(auth?.cookie ? { "Cookie": auth.cookie } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[marketPrices] live quote HTTP ${res.status}`);
      return prices;
    }

    type QuoteResp = { quoteResponse?: { result?: { symbol?: string; regularMarketPrice?: number }[] } };
    const json = await res.json() as QuoteResp;
    for (const r of json?.quoteResponse?.result ?? []) {
      if (r.symbol && r.regularMarketPrice && r.regularMarketPrice > 0) {
        prices.set(r.symbol, r.regularMarketPrice);
      }
    }
    console.log(`[marketPrices] live quotes fetched: ${prices.size}/${symbols.length} symbols`);
  } catch (e) {
    console.warn("[marketPrices] live quote fetch failed:", e);
  }
  return prices;
}

// ── Yahoo Finance chart fetch (30 days of hourly closes for TA) ───────────────

export async function fetchCloses(
  yahooSymbol: string,
  auth: { value: string; cookie: string } | null,
  livePrice?: number,
): Promise<number[]> {
  type YahooResp = {
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number };
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };

  let lastError: unknown;
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.value)}` : "";
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1h&range=30d${crumbQ}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          ...(auth?.cookie ? { "Cookie": auth.cookie } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }

      const json   = await res.json() as YahooResp;
      const result = json?.chart?.result?.[0];
      const raw    = result?.indicators?.quote?.[0]?.close ?? [];
      const regMkt = result?.meta?.regularMarketPrice;

      const closes = raw.filter((c): c is number => c !== null && !isNaN(c));

      console.log(`[marketPrices] ${host} ${yahooSymbol}: closes=${closes.length} last_close=${closes.at(-1)} regMkt=${regMkt} liveQuote=${livePrice}`);

      if (closes.length < 5 && !regMkt && !livePrice) { lastError = "no usable data"; continue; }

      // Authoritative live price: prefer the batch quote (fetched with fresh auth),
      // then regMkt from chart response, then whatever was in the series.
      const authoritative = livePrice ?? (regMkt && regMkt > 0 ? regMkt : undefined);

      if (authoritative && closes.length > 0) {
        const drift = Math.abs(closes[closes.length - 1] - authoritative) / authoritative;
        if (drift > 0.002) {
          console.log(`[marketPrices] ${yahooSymbol}: replacing stale last_close=${closes.at(-1)} with live=${authoritative} (drift ${(drift * 100).toFixed(1)}%)`);
          closes[closes.length - 1] = authoritative;
        }
      }

      if (closes.length < 30 && authoritative) {
        console.log(`[marketPrices] ${yahooSymbol}: sparse closes (${closes.length}), padding to 30`);
        while (closes.length < 30) closes.unshift(authoritative);
      }

      if (closes.length < 5) { lastError = `only ${closes.length} closes`; continue; }
      return closes;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Yahoo fetchCloses failed for ${yahooSymbol}: ${lastError}`);
}

// ── Full indicator fetch for all pairs ────────────────────────────────────────

export async function fetchPairIndicators(p: { symbol: string; label: string; decimals: number }): Promise<PairIndicators | null> {
  try {
    const auth   = await acquireYahooCrumb();
    const quotes = await fetchLiveQuotes([p.symbol], auth);
    const closes = await fetchCloses(p.symbol, auth, quotes.get(p.symbol));
    return _buildIndicators(p, closes);
  } catch (e) {
    console.warn(`[marketPrices] ${p.label} fetch failed:`, e);
    return null;
  }
}

// Batch variant used by /api/intelligence — shares one crumb + one quote call
// across all 10 pairs instead of 10 × (crumb + quote + chart) round-trips.
export async function fetchAllPairIndicators(
  pairs: readonly { symbol: string; label: string; decimals: number }[],
): Promise<(PairIndicators | null)[]> {
  const auth   = await acquireYahooCrumb();
  const quotes = await fetchLiveQuotes(pairs.map(p => p.symbol), auth);

  return Promise.all(
    pairs.map(async p => {
      try {
        const closes = await fetchCloses(p.symbol, auth, quotes.get(p.symbol));
        return _buildIndicators(p, closes);
      } catch (e) {
        console.warn(`[marketPrices] ${p.label} fetch failed:`, e);
        return null;
      }
    }),
  );
}

function _buildIndicators(
  p: { label: string; decimals: number },
  closes: number[],
): PairIndicators | null {
  if (closes.length < 30) return null;

  const price          = closes[closes.length - 1];
  const prev24h        = closes.length > 24 ? closes[closes.length - 25] : closes[0];
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
}
