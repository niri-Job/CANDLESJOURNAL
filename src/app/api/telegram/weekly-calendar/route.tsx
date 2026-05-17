import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL = "@niritoday";

// ── Types ─────────────────────────────────────────────────────────────────────

// ForexFactory returns: { title, country, date: "2026-05-19T02:00:00-04:00", impact, forecast, previous }
// There is NO separate "time" field — time is embedded in the ISO date string.
interface CalendarEvent {
  title: string;
  country: string;
  date: string;    // full ISO 8601 e.g. "2026-05-19T02:00:00-04:00"
  impact: string;
  forecast: string;
  previous: string;
}

interface ProcessedEvent {
  title: string;
  country: string;
  impact: string;
  watDate: string; // "YYYY-MM-DD" in WAT
  watTime: string; // "H:MM AM/PM" in WAT
  isoDate: string; // original, used for sort tiebreak
}

interface EventRow {
  type: "day" | "event";
  dayLabel?: string;
  event?: ProcessedEvent;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

// Convert a full ISO datetime ("2026-05-19T02:00:00-04:00") to WAT (UTC+1).
// Returns the WAT wall-clock date and time strings.
function toWAT(isoDate: string): { watDate: string; watTime: string } {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    console.error("[weekly-calendar] invalid date:", isoDate);
    return { watDate: "unknown", watTime: "—" };
  }
  // WAT = UTC+1 → add 1 hour to UTC epoch
  const watMs  = d.getTime() + 60 * 60 * 1000;
  const wat    = new Date(watMs);

  const year   = wat.getUTCFullYear();
  const month  = String(wat.getUTCMonth() + 1).padStart(2, "0");
  const day    = String(wat.getUTCDate()).padStart(2, "0");
  const watDate = `${year}-${month}-${day}`;

  const h24    = wat.getUTCHours();
  const min    = wat.getUTCMinutes();
  const period = h24 >= 12 ? "PM" : "AM";
  const h12    = h24 > 12 ? h24 - 12 : h24 === 0 ? 12 : h24;
  const watTime = `${h12}:${String(min).padStart(2, "0")} ${period}`;

  return { watDate, watTime };
}

// "TUESDAY, 19 MAY" from a "YYYY-MM-DD" string (interpreted as UTC noon)
function makeDayLabel(watDate: string): string {
  const d       = new Date(watDate + "T12:00:00Z");
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long",  timeZone: "UTC" }).toUpperCase();
  const dayNum  = d.getUTCDate();
  const mo      = d.toLocaleDateString("en-GB", { month: "short",   timeZone: "UTC" }).toUpperCase();
  return `${weekday}, ${dayNum} ${mo}`;
}

// Mon–Fri range of the current trading week.
// If today is Sunday, the FF "this week" data covers the upcoming Mon–Fri.
function weekRange(): string {
  const now    = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat

  // Days to add to reach Monday: Sun(0)→+1, Mon(1)→0, Tue(2)→-1 … Sat(6)→-5
  const daysToMon = utcDay === 0 ? 1 : 1 - utcDay;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + daysToMon);
  mon.setUTCHours(0, 0, 0, 0);

  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);

  const mo     = mon.getUTCDate();
  const fr     = fri.getUTCDate();
  const monMo  = mon.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const friMo  = fri.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const yr     = fri.getUTCFullYear();

  if (mon.getUTCMonth() === fri.getUTCMonth()) {
    return `${mo}–${fr} ${friMo} ${yr}`;
  }
  return `${mo} ${monMo} – ${fr} ${friMo} ${yr}`;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchWeekEvents(): Promise<CalendarEvent[]> {
  const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Calendar API returned ${res.status}`);
  const data = await res.json() as CalendarEvent[];
  // Log first 3 raw events so the date format is visible in Vercel logs
  console.log("[weekly-calendar] raw sample:", JSON.stringify(data.slice(0, 3)));
  return data;
}

// ── Build rows ────────────────────────────────────────────────────────────────

function buildRows(events: CalendarEvent[]): EventRow[] {
  const processed: ProcessedEvent[] = events
    .filter(e => e.impact === "High")
    .map(e => {
      const { watDate, watTime } = toWAT(e.date);
      return {
        title:   e.title,
        country: e.country,
        impact:  e.impact,
        watDate,
        watTime,
        isoDate: e.date,
      };
    })
    .sort((a, b) => {
      if (a.watDate !== b.watDate) return a.watDate.localeCompare(b.watDate);
      return a.isoDate.localeCompare(b.isoDate);
    });

  console.log(`[weekly-calendar] HIGH impact events: ${processed.length}`);
  processed.forEach(e =>
    console.log(`  ${e.watDate} ${e.watTime}  ${e.country}  ${e.title}`)
  );

  const rows: EventRow[] = [];
  let lastDate = "";
  for (const ev of processed) {
    if (ev.watDate !== lastDate) {
      rows.push({ type: "day", dayLabel: makeDayLabel(ev.watDate) });
      lastDate = ev.watDate;
    }
    rows.push({ type: "event", event: ev });
    if (rows.length >= 22) break; // safety cap
  }
  return rows;
}

// ── Flier constants ───────────────────────────────────────────────────────────

const GOLD    = "#F5C518";
const BG      = "#0A0A0F";
const WHITE   = "#F4F4F5";
const MUTED   = "#71717A";
const RED     = "#EF4444";
const SURFACE = "#111318";
const BORDER  = "#27272A";

// ── Generate PNG ──────────────────────────────────────────────────────────────

async function generateFlier(events: CalendarEvent[]): Promise<Buffer> {
  const range = weekRange();
  const rows  = buildRows(events);

  const imgResponse = new ImageResponse(
    (
      <div style={{
        width: 1080, height: 1080,
        background: BG,
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      }}>
        {/* Gold top accent strip */}
        <div style={{ width: "100%", height: 5, background: GOLD, display: "flex" }} />

        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", padding: "36px 64px 0 64px" }}>

          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: GOLD, letterSpacing: "-1px" }}>
              NIRI
            </span>
            <span style={{ fontSize: 13, color: MUTED, letterSpacing: "3px" }}>
              ECONOMIC INTELLIGENCE
            </span>
          </div>

          {/* Divider */}
          <div style={{
            width: "100%", height: 1,
            background: `linear-gradient(90deg, ${GOLD}60, transparent)`,
            marginBottom: 28, display: "flex",
          }} />

          {/* Headline */}
          <div style={{
            display: "flex", flexDirection: "column",
            fontSize: 58, fontWeight: 800, color: WHITE,
            lineHeight: 1.1, letterSpacing: "-1.5px",
          }}>
            <span>Weekly Economic</span>
            <span>Calendar</span>
          </div>

          {/* Date range */}
          <div style={{
            fontSize: 26, fontWeight: 700, color: GOLD,
            marginTop: 12, marginBottom: 20, display: "flex",
          }}>
            {range}
          </div>

          {/* Legend — HIGH only */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: RED, display: "flex" }} />
            <span style={{ fontSize: 11, color: MUTED, letterSpacing: "1.5px" }}>HIGH IMPACT EVENTS</span>
          </div>

          {/* Divider above events */}
          <div style={{ width: "100%", height: 1, background: BORDER, display: "flex" }} />
        </div>

        {/* Events list */}
        <div style={{
          display: "flex", flexDirection: "column", flex: 1,
          padding: "8px 64px 0 64px", overflow: "hidden",
        }}>
          {rows.length === 0 ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              flex: 1, color: MUTED, fontSize: 18,
            }}>
              No high-impact events this week
            </div>
          ) : (
            rows.map((row, i) =>
              row.type === "day" ? (
                <div key={i} style={{
                  display: "flex", alignItems: "center",
                  padding: "6px 10px",
                  marginTop: i === 0 ? 6 : 8,
                  marginBottom: 2,
                  background: `${GOLD}15`,
                  borderRadius: 5,
                  borderLeft: `3px solid ${GOLD}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: "1.8px" }}>
                    {row.dayLabel}
                  </span>
                </div>
              ) : (
                <div key={i} style={{
                  display: "flex", alignItems: "center",
                  height: 42,
                  borderBottom: `1px solid ${BORDER}`,
                }}>
                  {/* Red dot */}
                  <div style={{ width: 18, display: "flex", justifyContent: "center" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: RED, display: "flex" }} />
                  </div>

                  {/* Country badge */}
                  <div style={{ width: 56, display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: WHITE,
                      background: SURFACE, padding: "2px 6px",
                      borderRadius: 4, border: `1px solid ${BORDER}`,
                    }}>
                      {row.event!.country}
                    </span>
                  </div>

                  {/* WAT time */}
                  <div style={{ width: 100, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                      {row.event!.watTime}
                    </span>
                  </div>

                  {/* Event title */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: WHITE }}>
                      {row.event!.title.length > 46
                        ? row.event!.title.slice(0, 44) + "…"
                        : row.event!.title}
                    </span>
                  </div>
                </div>
              )
            )
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 64px 26px 64px",
          borderTop: `1px solid ${GOLD}30`,
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: GOLD }}>
            niri.live  ·  @niritoday
          </span>
          <span style={{ fontSize: 11, color: MUTED }}>
            Times in WAT (UTC+1)
          </span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );

  return Buffer.from(await imgResponse.arrayBuffer());
}

// ── Telegram ─────────────────────────────────────────────────────────────────

async function sendPhoto(token: string, chatId: string, imgBuffer: Buffer, caption: string) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", new Blob([new Uint8Array(imgBuffer)], { type: "image/png" }), "weekly-calendar.png");
  form.append("caption", caption);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendPhoto ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 503 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron     = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    if (!await verifyAdminCookie()) return adminUnauthorized();
  }

  let events: CalendarEvent[] = [];
  try {
    events = await fetchWeekEvents();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-calendar] fetch failed:", msg);
    return NextResponse.json({ error: "Failed to fetch calendar: " + msg }, { status: 502 });
  }

  const highCount = events.filter(e => e.impact === "High").length;
  console.log(`[weekly-calendar] ${events.length} total events, ${highCount} HIGH`);

  let pngBuffer: Buffer;
  try {
    pngBuffer = await generateFlier(events);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-calendar] image gen failed:", msg);
    return NextResponse.json({ error: "Image generation failed: " + msg }, { status: 500 });
  }

  const range   = weekRange();
  const caption = `📅 Weekly Economic Calendar\n${range}\n\nHigh-impact events for the trading week ahead.\n\nniri.live | @niritoday`;

  try {
    await sendPhoto(token, CHANNEL, pngBuffer, caption);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-calendar] telegram send failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  console.log(`[weekly-calendar] SUCCESS — sent to ${CHANNEL}, range: ${range}`);
  return NextResponse.json({ ok: true, channel: CHANNEL, range, events_high: highCount });
}
