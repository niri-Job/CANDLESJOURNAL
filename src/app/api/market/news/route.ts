import { NextResponse } from "next/server";

export const revalidate = 300;

const TIMEOUT_MS = 5000;

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.forexlive.com/feed/news", source: "ForexLive" },
  { url: "https://www.dailyfx.com/feeds/all", source: "DailyFX" },
];

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
        "User-Agent": "CandlesJournal/1.0 (forex news aggregator)",
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

  return NextResponse.json(all.slice(0, 20), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
