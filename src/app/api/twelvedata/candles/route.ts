import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── 5-minute in-memory cache (protects free-tier quota) ───────────────────────
const cache = new Map<string, { ts: number; candles: Candle[] }>();
const CACHE_TTL = 5 * 60 * 1000;

// ── Symbol mapping ────────────────────────────────────────────────────────────
function mapSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  // Explicit overrides
  if (s === "XAUUSDM" || s === "XAUUSD") return "XAU/USD";
  if (s === "XAGUSDM" || s === "XAGUSD") return "XAG/USD";
  if (s === "BTCUSD"  || s === "BTCUSDT") return "BTC/USD";
  if (s === "ETHUSD"  || s === "ETHUSDT") return "ETH/USD";
  if (s === "BNBUSD"  || s === "BNBUSDT") return "BNB/USD";
  if (s === "XRPUSD"  || s === "XRPUSDT") return "XRP/USD";
  // Already formatted
  if (s.includes("/")) return s;
  // Standard 6-char forex pair → split at 3
  if (s.length >= 6) return `${s.slice(0, 3)}/${s.slice(3, 6)}`;
  return s;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol     = searchParams.get("symbol") ?? "";
  const interval   = searchParams.get("interval") ?? "5min";
  const start_date = searchParams.get("start_date") ?? "";
  const end_date   = searchParams.get("end_date") ?? "";

  if (!symbol) {
    return NextResponse.json({ error: "symbol_required", candles: [] }, { status: 400 });
  }

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no_api_key", candles: [] });
  }

  const mapped   = mapSymbol(symbol);
  const cacheKey = `${mapped}:${interval}:${start_date}:${end_date}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ candles: hit.candles });
  }

  try {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol",   mapped);
    url.searchParams.set("interval", interval);
    url.searchParams.set("apikey",   apiKey);
    url.searchParams.set("format",   "JSON");
    if (start_date) url.searchParams.set("start_date", start_date);
    if (end_date)   url.searchParams.set("end_date",   end_date);

    const res  = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json() as {
      status?: string; message?: string; code?: number;
      values?: Array<{ datetime: string; open: string; high: string; low: string; close: string }>;
    };

    if (json.status === "error" || !Array.isArray(json.values)) {
      const msg = json.message ?? "api_error";
      console.error("[twelvedata] API error:", msg, "symbol:", mapped);
      return NextResponse.json({ error: msg, candles: [] });
    }

    // TwelveData returns values newest-first; reverse to chronological order
    const candles: Candle[] = json.values
      .slice()
      .reverse()
      .map(v => ({
        datetime: v.datetime,
        open:  parseFloat(v.open),
        high:  parseFloat(v.high),
        low:   parseFloat(v.low),
        close: parseFloat(v.close),
      }));

    cache.set(cacheKey, { ts: Date.now(), candles });
    return NextResponse.json({ candles });

  } catch (err) {
    console.error("[twelvedata] fetch error:", err);
    return NextResponse.json({ error: "fetch_error", candles: [] });
  }
}
