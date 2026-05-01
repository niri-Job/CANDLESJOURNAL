import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Yahoo Finance symbol mapping
const YAHOO_MAP: Record<string, string> = {
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X",
  USDCHF: "USDCHF=X", USDCAD: "USDCAD=X", AUDUSD: "AUDUSD=X",
  NZDUSD: "NZDUSD=X", EURGBP: "EURGBP=X", EURJPY: "EURJPY=X",
  GBPJPY: "GBPJPY=X", EURAUD: "EURAUD=X", GBPAUD: "GBPAUD=X",
  CADJPY: "CADJPY=X", CHFJPY: "CHFJPY=X", AUDCAD: "AUDCAD=X",
  USDMXN: "USDMXN=X", USDZAR: "USDZAR=X", USDNOK: "USDNOK=X",
  XAUUSD: "GC=F",    XAGUSD: "SI=F",
  BTCUSD: "BTC-USD", ETHUSD: "ETH-USD",
  US30: "^DJI", NAS100: "^NDX", SPX500: "^GSPC",
};

const INTERVAL_MAP: Record<string, { yInterval: string; range: string }> = {
  "1":   { yInterval: "1m",  range: "7d"  },
  "5":   { yInterval: "5m",  range: "60d" },
  "15":  { yInterval: "15m", range: "60d" },
  "60":  { yInterval: "1h",  range: "730d" },
  "240": { yInterval: "1h",  range: "730d" },
  "D":   { yInterval: "1d",  range: "5y"  },
};

// Module-level cache (lives for server process lifetime)
const cache = new Map<string, { data: CandleData[]; expiresAt: number }>();

export async function GET(request: NextRequest) {
  const symbol   = request.nextUrl.searchParams.get("symbol")?.toUpperCase() ?? "";
  const interval = request.nextUrl.searchParams.get("interval") ?? "";

  if (!symbol || !interval) {
    return NextResponse.json({ error: "Missing symbol or interval" }, { status: 400 });
  }

  const cacheKey = `${symbol}:${interval}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return NextResponse.json(hit.data);

  const yahooSym = YAHOO_MAP[symbol];
  if (!yahooSym) {
    return NextResponse.json({ error: `Symbol ${symbol} not supported yet` }, { status: 400 });
  }

  const iv = INTERVAL_MAP[interval] ?? INTERVAL_MAP["60"];

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${iv.yInterval}&range=${iv.range}&includePrePost=false`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NIRI/1.0)" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream returned ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "No chart data returned" }, { status: 502 });
    }

    const timestamps: number[]        = result.timestamp ?? [];
    const q                            = result.indicators?.quote?.[0] ?? {};
    const opens:  (number | null)[]    = q.open  ?? [];
    const highs:  (number | null)[]    = q.high  ?? [];
    const lows:   (number | null)[]    = q.low   ?? [];
    const closes: (number | null)[]    = q.close ?? [];

    const candles: CandleData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
      if (o == null || h == null || l == null || c == null) continue;
      if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
      candles.push({ time: timestamps[i], open: o, high: h, low: l, close: c });
    }

    const ttl = interval === "D" ? 3_600_000 : 300_000; // 1h daily, 5min intraday
    cache.set(cacheKey, { data: candles, expiresAt: Date.now() + ttl });
    return NextResponse.json(candles);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
