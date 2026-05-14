import { NextResponse } from "next/server";

export const revalidate = 900;

const TIMEOUT_MS = 5000;

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.forexlive.com/feed/news", source: "ForexLive" },
  { url: "https://feeds.fxstreet.com/fxstreet/rss/news", source: "FXStreet" },
];

// Keywords that mark a story as high-impact for forex traders
const HIGH_KEYWORDS = [
  "nfp", "non-farm", "cpi", "inflation", "fed ", "federal reserve", "fomc",
  "ecb", "boe", "bank of england", "bank of japan", "boj", "rba", "rbnz",
  "interest rate", "rate decision", "rate hike", "rate cut", "rate hold",
  "gdp", "unemployment", "payroll", "powell", "lagarde", "bailey",
  "ueda", "bullock", "jobs report", "pce", "ppi", "ism", "adp",
  "gold", "xauusd", "eurusd", "gbpusd", "dollar", "euro", "pound",
  "yen", "usdjpy", "bitcoin", "btc", "crude", "oil", "treasury",
];

function isHighImpact(title: string): boolean {
  const lower = title.toLowerCase();
  return HIGH_KEYWORDS.some(kw => lower.includes(kw));
}

function extractTag(xml: string, tag: string): string {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, "s"));
  if (cdata) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, "s"));
  return plain ? plain[1].trim().replace(/<[^>]+>/g, "") : "";
}

function parseRSS(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const chunk = match[1];
    const title = extractTag(chunk, "title");
    if (!title) continue;

    const linkMatch =
      chunk.match(/<link>(https?:\/\/[^<]+)<\/link>/) ||
      chunk.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
    const link = linkMatch ? linkMatch[1].trim() : "";

    const pubDate = extractTag(chunk, "pubDate");
    const raw = extractTag(chunk, "description");
    const description = raw.replace(/&lt;[^&]+&gt;/g, "").replace(/&amp;/g, "&").slice(0, 220);

    items.push({ title, link, pubDate, description, source });
  }
  return items.slice(0, 15);
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NIRI/1.0 (forex news aggregator)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${source}`);
    const xml = await res.text();
    return parseRSS(xml, source);
  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = (err as Error).name === "AbortError";
    console.error(`news proxy [${source}]:`, isTimeout ? "timed out after 5s" : (err as Error).message);
    return [];
  }
}

export async function GET() {
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.source)));
  const all: NewsItem[] = results.flat();

  all.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  // Deduplicate by first 50 chars of title
  const seen = new Set<string>();
  const deduped = all.filter(item => {
    const key = item.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Prefer high-impact; fall back to all if fewer than 4 high-impact items
  let filtered = deduped.filter(item => isHighImpact(item.title));
  if (filtered.length < 4) filtered = deduped;

  return NextResponse.json(filtered.slice(0, 10), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
