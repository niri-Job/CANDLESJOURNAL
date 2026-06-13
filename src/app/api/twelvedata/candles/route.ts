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
  // Strip trailing M for broker-specific variants (XAUUSDM → XAUUSD, EURUSDM → EURUSD)
  const base = s.length > 5 && s.endsWith("M") ? s.slice(0, -1) : s;
  if (base === "XAUUSD") return "XAU/USD";
  if (base === "XAGUSD") return "XAG/USD";
  if (base === "BTCUSD" || base === "BTCUSDT") return "BTC/USD";
  if (base === "ETHUSD" || base === "ETHUSDT") return "ETH/USD";
  if (base === "BNBUSD" || base === "BNBUSDT") return "BNB/USD";
  if (base === "XRPUSD" || base === "XRPUSDT") return "XRP/USD";
  // Already formatted
  if (s.includes("/")) return s;
  // Standard 6-char forex pair → split at 3
  if (base.length >= 6) return `${base.slice(0, 3)}/${base.slice(3, 6)}`;
  return base;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol     = searchParams.get("symbol") ?? "";
  const interval   = searchParams.get("interval") ?? "5min";
  const start_date = searchParams.get("start_date") ?? "";
  const end_date   = searchParams.get("end_date") ?? "";

  console.log("[td] request — symbol:", symbol, "| interval:", interval,
    "| start:", start_date, "| end:", end_date);

  if (!symbol) {
    return NextResponse.json({ error: "symbol_required", candles: [] }, { status: 400 });
  }

  const apiKey = process.env.TWELVEDATA_API_KEY;
  console.log("[td] API key present:", !!apiKey,
    apiKey ? `(first 6: ${apiKey.slice(0, 6)}...)` : "(MISSING — check Vercel env vars)");

  if (!apiKey) {
    return NextResponse.json({ error: "no_api_key", candles: [] });
  }

  const mapped = mapSymbol(symbol);
  console.log("[td] symbol map:", symbol, "→", mapped);

  const cacheKey = `${mapped}:${interval}:${start_date}:${end_date}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    console.log("[td] cache hit —", hit.candles.length, "candles");
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

    const apiUrl = url.toString();
    console.log("[td] fetching:", apiUrl.replace(apiKey, "REDACTED"));

    const res = await fetch(apiUrl, { cache: "no-store" });
    const rawText = await res.text();
    console.log("[td] HTTP status:", res.status,
      "| body[:300]:", rawText.slice(0, 300));

    // Parse JSON
    let json: {
      status?: string;
      message?: string;
      code?: number;
      values?: Array<{ datetime: string; open: string; high: string; low: string; close: string }>;
    };
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      console.error("[td] JSON parse failed, raw:", rawText.slice(0, 200));
      return NextResponse.json({ error: "invalid_json", candles: [] });
    }

    // Rate limit
    if (json.code === 429) {
      console.warn("[td] rate limit (429):", json.message);
      return NextResponse.json({ error: "rate_limit", message: json.message ?? "Rate limit reached", candles: [] });
    }

    // API-level error or missing values array
    if (json.status === "error" || !Array.isArray(json.values)) {
      const msg = json.message ?? `unexpected_response`;
      console.error("[td] API error — code:", json.code, "| message:", msg,
        "| values type:", typeof json.values,
        "| values:", JSON.stringify(json.values)?.slice(0, 100));
      return NextResponse.json({ error: msg, candles: [] });
    }

    if (json.values.length === 0) {
      console.warn("[td] values array is empty — symbol/date range may have no data");
      return NextResponse.json({ error: "no_data", candles: [] });
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

    console.log("[td] success —", candles.length, "candles | first:", candles[0]?.datetime, "| last:", candles[candles.length - 1]?.datetime);
    cache.set(cacheKey, { ts: Date.now(), candles });
    return NextResponse.json({ candles });

  } catch (err) {
    console.error("[td] fetch threw:", err);
    return NextResponse.json({ error: "fetch_error", candles: [] });
  }
}
