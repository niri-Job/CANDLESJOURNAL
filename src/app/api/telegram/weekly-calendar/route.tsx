import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { verifyAdminCookie, adminUnauthorized } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL = "@niritoday";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
}

interface EventRow {
  type: "day" | "event";
  dayLabel?: string;
  event?: CalendarEvent;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert ForexFactory time (US Eastern) to WAT (UTC+1)
// May–Oct = EDT (UTC-4) → WAT = ET + 5h
// Nov–Mar = EST (UTC-5) → WAT = ET + 6h
function toWAT(timeStr: string, dateStr: string): string {
  if (!timeStr) return "All Day";
  const match = timeStr.match(/^(\d+):(\d+)(am|pm)$/i);
  if (!match) return timeStr.toUpperCase();
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  const month = new Date(dateStr + "T12:00:00Z").getMonth() + 1;
  const offset = month >= 3 && month <= 11 ? 5 : 6; // EDT or EST → WAT
  h = (h + offset) % 24;
  const p = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${p}`;
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  }).toUpperCase();
}

function weekRange(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const mo = mon.getUTCDate();
  const fr = fri.getUTCDate();
  const monMo = mon.toLocaleDateString("en-GB", { month: "short" });
  const friMo = fri.toLocaleDateString("en-GB", { month: "short" });
  const yr = fri.getUTCFullYear();
  if (mon.getUTCMonth() === fri.getUTCMonth()) {
    return `${mo}–${fr} ${friMo} ${yr}`;
  }
  return `${mo} ${monMo} – ${fr} ${friMo} ${yr}`;
}

// ── Fetch events ─────────────────────────────────────────────────────────────

async function fetchWeekEvents(): Promise<CalendarEvent[]> {
  const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Calendar API returned ${res.status}`);
  return res.json() as Promise<CalendarEvent[]>;
}

// ── Flier image ───────────────────────────────────────────────────────────────

const GOLD   = "#F5C518";
const BG     = "#0A0A0F";
const WHITE  = "#F4F4F5";
const MUTED  = "#71717A";
const RED    = "#EF4444";
const ORANGE = "#F97316";
const SURFACE = "#111318";
const BORDER  = "#27272A";

function buildRows(events: CalendarEvent[]): EventRow[] {
  const sorted = [...events]
    .filter(e => e.impact === "High" || e.impact === "Medium")
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time || "zzz").localeCompare(b.time || "zzz");
    });

  const rows: EventRow[] = [];
  let lastDate = "";
  for (const ev of sorted) {
    if (ev.date !== lastDate) {
      rows.push({ type: "day", dayLabel: dayLabel(ev.date) });
      lastDate = ev.date;
    }
    rows.push({ type: "event", event: ev });
    // 5 day headers + ~12 events = ~17 rows; cap at 20 for safety
    if (rows.length >= 20) break;
  }
  return rows;
}

async function generateFlier(events: CalendarEvent[]): Promise<Buffer> {
  const range = weekRange();
  const rows  = buildRows(events);

  const imgResponse = new ImageResponse(
    (
      <div
        style={{
          width: 1080, height: 1080,
          background: BG,
          display: "flex",
          flexDirection: "column",
          padding: "0",
          fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
          position: "relative",
        }}
      >
        {/* Gold top accent strip */}
        <div style={{ width: "100%", height: 5, background: GOLD, display: "flex" }} />

        {/* Header section */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          padding: "40px 64px 0 64px",
        }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: GOLD, letterSpacing: "-1px" }}>
              NIRI
            </span>
            <span style={{ fontSize: 15, color: MUTED, letterSpacing: "2px", marginTop: 4 }}>
              ECONOMIC INTELLIGENCE
            </span>
          </div>

          {/* Thin divider */}
          <div style={{
            width: "100%", height: 1,
            background: `linear-gradient(to right, ${GOLD}55, transparent)`,
            marginBottom: 32, display: "flex",
          }} />

          {/* Headline */}
          <div style={{
            fontSize: 62, fontWeight: 800, color: WHITE,
            lineHeight: 1.1, letterSpacing: "-2px", display: "flex",
            flexDirection: "column",
          }}>
            <span>Weekly Economic</span>
            <span style={{ color: WHITE }}>Calendar</span>
          </div>

          {/* Date range */}
          <div style={{
            fontSize: 28, fontWeight: 600, color: GOLD,
            marginTop: 14, marginBottom: 24, display: "flex",
          }}>
            {range}
          </div>

          {/* Legend row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 24,
            marginBottom: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: RED, display: "flex" }} />
              <span style={{ fontSize: 12, color: MUTED, letterSpacing: "1px" }}>HIGH IMPACT</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: ORANGE, display: "flex" }} />
              <span style={{ fontSize: 12, color: MUTED, letterSpacing: "1px" }}>MEDIUM IMPACT</span>
            </div>
          </div>

          {/* Divider above events */}
          <div style={{
            width: "100%", height: 1, background: BORDER, display: "flex",
          }} />
        </div>

        {/* Events list */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "10px 64px 0 64px",
          overflow: "hidden",
        }}>
          {rows.length === 0 ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: MUTED,
              fontSize: 20,
            }}>
              No major economic events this week
            </div>
          ) : (
            rows.map((row, i) => {
              if (row.type === "day") {
                return (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "7px 10px",
                    marginTop: i === 0 ? 4 : 6,
                    marginBottom: 2,
                    background: `${GOLD}18`,
                    borderRadius: 6,
                    borderLeft: `3px solid ${GOLD}`,
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: GOLD,
                      letterSpacing: "1.5px",
                    }}>
                      {row.dayLabel}
                    </span>
                  </div>
                );
              }

              const ev = row.event!;
              const isHigh = ev.impact === "High";
              const dot = isHigh ? RED : ORANGE;
              const wat = toWAT(ev.time, ev.date);
              const country = ev.country || "—";
              // Truncate long titles
              const title = ev.title.length > 44 ? ev.title.slice(0, 42) + "…" : ev.title;

              return (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  height: 40,
                  borderBottom: `1px solid ${BORDER}`,
                  gap: 0,
                }}>
                  {/* Impact dot */}
                  <div style={{
                    width: 20, display: "flex", justifyContent: "center",
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4,
                      background: dot, display: "flex",
                    }} />
                  </div>

                  {/* Country */}
                  <div style={{
                    width: 56, display: "flex", alignItems: "center",
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: WHITE,
                      background: `${SURFACE}`,
                      padding: "2px 6px", borderRadius: 4,
                      border: `1px solid ${BORDER}`,
                    }}>
                      {country}
                    </span>
                  </div>

                  {/* Time (WAT) */}
                  <div style={{
                    width: 108, display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 13, color: MUTED, fontFamily: "monospace" }}>
                      {wat}
                    </span>
                  </div>

                  {/* Event name */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: 14, color: WHITE,
                      overflow: "hidden",
                    }}>
                      {title}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          padding: "14px 64px 28px 64px",
          borderTop: `1px solid ${GOLD}33`,
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: GOLD }}>
              niri.live  ·  @niritoday
            </span>
            <span style={{ fontSize: 12, color: MUTED }}>
              Times shown in WAT (UTC+1)
            </span>
          </div>
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
    throw new Error(`Telegram sendPhoto error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 503 });
  }

  // Auth: Vercel cron via CRON_SECRET header, OR admin cookie from dashboard
  const cronSecret  = process.env.CRON_SECRET;
  const authHeader  = request.headers.get("authorization");
  const isCronCall  = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronCall) {
    if (!await verifyAdminCookie()) return adminUnauthorized();
  }

  // Fetch events
  let events: CalendarEvent[] = [];
  try {
    events = await fetchWeekEvents();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-calendar] fetch failed:", msg);
    return NextResponse.json({ error: "Failed to fetch calendar: " + msg }, { status: 502 });
  }

  const highCount   = events.filter(e => e.impact === "High").length;
  const mediumCount = events.filter(e => e.impact === "Medium").length;
  console.log(`[weekly-calendar] fetched ${events.length} events — HIGH:${highCount} MEDIUM:${mediumCount}`);

  // Generate PNG
  let pngBuffer: Buffer;
  try {
    pngBuffer = await generateFlier(events);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-calendar] image generation failed:", msg);
    return NextResponse.json({ error: "Image generation failed: " + msg }, { status: 500 });
  }

  // Send to Telegram
  const range = weekRange();
  const caption = `📅 Weekly Economic Calendar\n${range}\n\nHigh-impact events for the trading week ahead.\n\nniri.live | @niritoday`;
  try {
    await sendPhoto(token, CHANNEL, pngBuffer, caption);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-calendar] telegram send failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  console.log(`[weekly-calendar] SUCCESS — sent to ${CHANNEL}`);
  return NextResponse.json({
    ok: true,
    channel: CHANNEL,
    range,
    events_high: highCount,
    events_medium: mediumCount,
  });
}
