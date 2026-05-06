import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

async function serverDb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}

interface Deal {
  deal: string;
  order: string;
  symbol: string;
  type: string;
  direction: string;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  time: string;
  comment: string;
}

// ── Date normaliser ───────────────────────────────────────────────────────────
// MT5 exports dates as "YYYY.MM.DD HH:MM:SS" — replace dots with dashes so
// the JS Date constructor can parse them reliably.
function parseDate(s: string): Date {
  const normalised = s.trim()
    .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3")
    .replace(" ", "T");
  return new Date(normalised);
}

// ── Format detection ──────────────────────────────────────────────────────────
function detectFormat(filename: string, content: string): "xlsx" | "xml" | "html" | "csv" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "xml") return "xml";
  if (ext === "htm" || ext === "html") return "html";
  const head = content.trimStart().slice(0, 200).toLowerCase();
  if (head.includes("<workbook") || head.includes("ss:type") || head.includes("<?mso")) return "xml";
  if (head.startsWith("<html") || head.includes("<table") || head.includes("<!doctype")) return "html";
  return "csv";
}

// ── XLSX → rows ───────────────────────────────────────────────────────────────
// MT5 "Open XML (MS Office Excel 2007)" saves as .xlsx. SheetJS reads the
// binary workbook and returns each row as a plain string array.
function parseXlsxRows(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return (json as unknown[][]).map((row) =>
    row.map((cell) => {
      if (cell instanceof Date) {
        // Format as "YYYY-MM-DD HH:MM:SS" to match parseDate expectations
        return cell.toISOString().replace("T", " ").slice(0, 19);
      }
      return String(cell ?? "").trim();
    })
  );
}

// ── CSV → rows ────────────────────────────────────────────────────────────────
function parseCsvRows(text: string): string[][] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      l.split(/[,\t]/).map((c) => c.trim().replace(/^["']|["']$/g, ""))
    );
}

// ── SpreadsheetML XML → rows ──────────────────────────────────────────────────
// MT5 "Open XML (MS Office Excel 2007)" produces SpreadsheetML.
// Structure: <Workbook> → <Worksheet> → <Table> → <Row> → <Cell> → <Data>
function parseXmlRows(text: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(text)) !== null) {
    const cells: string[] = [];
    const dataRe = /<Data[^>]*>([\s\S]*?)<\/Data>/gi;
    let dataMatch: RegExpExecArray | null;
    while ((dataMatch = dataRe.exec(rowMatch[1])) !== null) {
      cells.push(dataMatch[1].trim());
    }
    // Rows with no <Data> elements are empty (style-only rows) — skip them
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// ── HTML → rows ───────────────────────────────────────────────────────────────
// MT5 "HTML (Internet Explorer)" export wraps deals in an HTML <table>.
// We scan all tables and pick the first one whose header row contains
// recognisable MT5 column names.
function parseHtmlRows(text: string): string[][] {
  const stripTags = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .trim();

  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRe.exec(text)) !== null) {
    const tableRows: string[][] = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(tableMatch[1])) !== null) {
      const cells: string[] = [];
      const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
        cells.push(stripTags(tdMatch[1]));
      }
      if (cells.length > 0) tableRows.push(cells);
    }

    if (tableRows.length < 2) continue;

    // Check header row for MT5 deal column names
    const firstRow = tableRows[0].map((h) => h.toLowerCase());
    const isDealsTable = firstRow.some((h) =>
      ["deal", "symbol", "time", "item", "ticket"].includes(h)
    );
    if (isDealsTable) return tableRows;
  }

  return [];
}

// ── rows[][] → Deal[] ─────────────────────────────────────────────────────────
// Works for CSV, XML, and HTML once the raw strings are extracted into rows.
// Finds the header row automatically (some formats prepend account-info rows).
function extractDeals(rows: string[][]): { deals: Deal[]; skipped: number } {
  const headerIdx = rows.findIndex((row) =>
    row.some((cell) =>
      ["symbol", "deal", "time", "item", "ticket"].includes(cell.toLowerCase().trim())
    )
  );
  if (headerIdx === -1) return { deals: [], skipped: 0 };

  const headers = rows[headerIdx].map((h) =>
    h.toLowerCase().replace(/\s+/g, " ").trim()
  );

  function col(row: string[], name: string): string {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").trim().replace(/^["']|["']$/g, "") : "";
  }

  const deals: Deal[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    if (row.every((c) => !c.trim())) continue; // blank row

    const symbol  = col(row, "symbol") || col(row, "item");
    const timeStr = col(row, "time") || col(row, "close time") || col(row, "closetime");
    const dealId  = col(row, "deal") || col(row, "ticket");
    const orderId = col(row, "order") || col(row, "deal");
    const dirStr  = col(row, "direction").toLowerCase();
    const typeStr = col(row, "type").toLowerCase();
    const volume  = parseFloat(col(row, "volume") || col(row, "size") || "0");
    const price   = parseFloat(col(row, "price") || "0");
    const profit  = parseFloat(col(row, "profit") || "0");
    const commission = parseFloat(col(row, "commission") || "0");
    const swap    = parseFloat(col(row, "swap") || "0");
    const comment = col(row, "comment");

    if (!symbol || !timeStr) { skipped++; continue; }

    const isBalance =
      typeStr.includes("balance") || typeStr.includes("credit") ||
      dirStr.includes("balance")  ||
      comment.toLowerCase().includes("deposit") ||
      comment.toLowerCase().includes("withdraw");
    if (isBalance) { skipped++; continue; }

    deals.push({
      deal: dealId, order: orderId, symbol, type: typeStr, direction: dirStr,
      volume, price, profit, commission, swap, time: timeStr, comment,
    });
  }

  return { deals, skipped };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await serverDb();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const accountSignature = formData.get("account_signature") as string | null;
  const file = formData.get("file") as File | null;

  if (!file || !accountSignature) {
    return NextResponse.json({ error: "Missing file or account_signature" }, { status: 400 });
  }

  // xlsx is binary — detect by extension before reading as text
  const extHint = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isXlsx  = extHint === "xlsx" || extHint === "xls";

  let rows: string[][];
  let format: string;

  if (isXlsx) {
    format = "xlsx";
    const buffer = await file.arrayBuffer();
    rows = parseXlsxRows(buffer);
  } else {
    const text = await file.text();
    format = detectFormat(file.name, text);
    if (format === "xml") {
      rows = parseXmlRows(text);
    } else if (format === "html") {
      rows = parseHtmlRows(text);
    } else {
      rows = parseCsvRows(text);
    }
  }

  const { deals, skipped: initialSkipped } = extractDeals(rows);
  let skipped = initialSkipped;

  if (deals.length === 0) {
    return NextResponse.json(
      { error: `No valid deals found in the ${format.toUpperCase()} file. Skipped ${skipped} rows. Ensure this is an MT5 account history export.` },
      { status: 400 }
    );
  }

  // ── Match IN + OUT deal pairs by Order number ─────────────────────────────
  const orderMap: Record<string, { in?: Deal; out?: Deal }> = {};

  for (const deal of deals) {
    const isIn  = deal.direction.includes("in")  || (deal.type === "buy" || deal.type === "sell");
    const isOut = deal.direction.includes("out") || deal.type.includes("out");
    const key   = deal.order || deal.deal;
    if (!orderMap[key]) orderMap[key] = {};
    if (isIn && !isOut)      orderMap[key].in  = deal;
    else if (isOut)          orderMap[key].out = deal;
    else {
      if (!orderMap[key].out) orderMap[key].out = deal;
      else if (!orderMap[key].in) orderMap[key].in = deal;
    }
  }

  const trades = [];

  for (const [orderId, pair] of Object.entries(orderMap)) {
    const outDeal = pair.out;
    const inDeal  = pair.in;
    if (!outDeal) continue;

    const symbol = outDeal.symbol || inDeal?.symbol || "";
    if (!symbol) continue;

    const outDate = parseDate(outDeal.time);
    if (isNaN(outDate.getTime())) continue;

    const typeStr = (inDeal?.type || outDeal.type || "").toLowerCase();
    const dirStr  = (inDeal?.direction || outDeal.direction || "").toLowerCase();
    let direction: "BUY" | "SELL" = "BUY";
    if (typeStr.includes("sell") || dirStr.includes("sell")) direction = "SELL";

    const entryPrice = inDeal?.price ?? outDeal.price;
    const exitPrice  = outDeal.price;
    const volume     = inDeal?.volume ?? outDeal.volume;
    const profit     = outDeal.profit + (outDeal.commission || 0) + (outDeal.swap || 0);

    const openedAt  = inDeal ? parseDate(inDeal.time).toISOString() : null;
    const closedAt  = outDate.toISOString();
    const date      = outDate.toISOString().split("T")[0];
    const closeTs   = Math.floor(outDate.getTime() / 1000);
    const cleanSymbol   = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const uniqueTradeId = `${accountSignature}_${orderId}_${closeTs}`;

    trades.push({
      user_id:             user.id,
      pair:                cleanSymbol,
      direction,
      lot:                 volume || 0.01,
      date,
      entry:               entryPrice,
      exit_price:          exitPrice,
      sl:                  null,
      tp:                  null,
      pnl:                 profit,
      notes:               `Imported from MT5 ${format.toUpperCase()} history`,
      asset_class:         "Forex",
      session:             "London",
      setup:               "",
      mt5_deal_id:         outDeal.deal || null,
      account_signature:   accountSignature,
      normalized_pnl:      profit,
      unique_trade_id:     uniqueTradeId,
      opened_at:           openedAt,
      closed_at:           closedAt,
      is_verified:         false,
      verification_method: "csv_import",
    });
  }

  // Fallback: if IN/OUT matching produced nothing, try single-row import
  if (trades.length === 0) {
    for (const deal of deals) {
      const isOut =
        deal.direction.includes("out") || deal.type.includes("out") ||
        deal.type.includes("sell") || deal.type.includes("buy");
      if (!isOut || !deal.time) { skipped++; continue; }

      const dateObj = parseDate(deal.time);
      if (isNaN(dateObj.getTime())) { skipped++; continue; }

      const direction: "BUY" | "SELL" =
        deal.type.includes("sell") || deal.direction.includes("sell") ? "SELL" : "BUY";
      const date        = dateObj.toISOString().split("T")[0];
      const closeTs     = Math.floor(dateObj.getTime() / 1000);
      const cleanSymbol = deal.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const uniqueTradeId = deal.deal
        ? `${accountSignature}_${deal.deal}_${closeTs}`
        : null;

      trades.push({
        user_id:             user.id,
        pair:                cleanSymbol,
        direction,
        lot:                 deal.volume || 0.01,
        date,
        entry:               deal.price,
        exit_price:          deal.price,
        sl:                  null,
        tp:                  null,
        pnl:                 deal.profit,
        notes:               `Imported from MT5 ${format.toUpperCase()} history`,
        asset_class:         "Forex",
        session:             "London",
        setup:               "",
        mt5_deal_id:         deal.deal || null,
        account_signature:   accountSignature,
        normalized_pnl:      deal.profit,
        unique_trade_id:     uniqueTradeId,
        opened_at:           null,
        closed_at:           dateObj.toISOString(),
        is_verified:         false,
        verification_method: "csv_import",
      });
    }
  }

  if (trades.length === 0) {
    return NextResponse.json(
      { error: `No valid trades found after parsing. Skipped ${skipped} rows. Check the file is an MT5 account history export.` },
      { status: 400 }
    );
  }

  const { error: upsertErr } = await supabase
    .from("trades")
    .upsert(trades, { onConflict: "user_id,unique_trade_id", ignoreDuplicates: true });

  if (upsertErr) {
    return NextResponse.json({ error: "Import failed: " + upsertErr.message }, { status: 500 });
  }

  await supabase
    .from("trading_accounts")
    .update({ import_status: "complete", last_synced_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("account_signature", accountSignature);

  return NextResponse.json({ success: true, imported: trades.length, skipped });
}
