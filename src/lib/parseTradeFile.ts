// src/lib/parseTradeFile.ts
// All MT5 trade-file parsing logic — CSV, XLSX, HTML. Imported by CsvImportModal.
import * as XLSX from "xlsx";

export interface PreviewRow {
  pair:      string;
  direction: string;
  lot:       number;
  entry:     number;
  exit:      number;
  pnl:       number;
  date:      string;
}

export interface ParseResult {
  csvRaw:  string;
  preview: PreviewRow[];
  error?:  string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── HTML parser ──────────────────────────────────────────────────────────────

function parseHTMLToCSV(html: string): string {
  const doc    = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll("tr"));
    let headerIdx = -1;
    let headers: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll("th,td"))
        .map((c) => c.textContent?.trim() ?? "");
      const norm = cells.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ""));
      const hasSymbol = norm.some((c) => c.includes("symbol") || c === "item" || c === "asset");
      const hasType   = norm.some((c) => c === "type" || c === "direction");
      const hasTicket = norm.some((c) => c.includes("ticket") || c === "deal" || c === "order");
      if (hasSymbol && hasType && cells.length >= 5) {
        if (hasTicket || headerIdx === -1) { headerIdx = i; headers = cells; }
        if (hasTicket) break;
      }
    }

    if (headerIdx === -1 || headers.length < 4) continue;

    const csvLines: string[] = [headers.map((h) => `"${h}"`).join(",")];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll("td"))
        .map((c) => c.textContent?.trim() ?? "");
      if (cells.length < Math.floor(headers.length / 2)) continue;
      if (cells.filter((c) => c !== "").length <= 2) continue;
      csvLines.push(cells.map((c) => `"${c.replace(/"/g, "'")}"`).join(","));
    }

    if (csvLines.length > 1) return csvLines.join("\n");
  }
  return "";
}

// ── XLSX column mapper ────────────────────────────────────────────────────────

interface ColumnMapResult {
  canonical: string[];
  found:     Record<string, number>;
  missing:   string[];
}

function buildXLSXColumnMap(rawHeaders: string[]): ColumnMapResult {
  const BY_POSITION: Record<string, [string, string]> = {
    time:  ["opentime",  "closetime"],
    price: ["openprice", "closeprice"],
  };

  const ALIAS: Record<string, string> = {
    symbol: "symbol", item: "symbol", instrument: "symbol", currency: "symbol", asset: "symbol",
    type: "type", direction: "type", side: "type", action: "type",
    volume: "volume", size: "volume", lots: "volume", qty: "volume", quantity: "volume",
    opentime: "opentime", openingtime: "opentime", entrytime: "opentime", opendate: "opentime", openedtime: "opentime",
    closetime: "closetime", closingtime: "closetime", exittime: "closetime", closedate: "closetime", closedtime: "closetime",
    openprice: "openprice", openingprice: "openprice", entryprice: "openprice", entry: "openprice", open: "openprice",
    closeprice: "closeprice", closingprice: "closeprice", exitprice: "closeprice", exit: "closeprice", close: "closeprice",
    profit: "profit", pnl: "profit", netprofit: "profit", pl: "profit", gain: "profit",
    position: "ticket", ticket: "ticket", order: "ticket", deal: "ticket", id: "ticket",
    sl: "sl", stoploss: "sl",
    tp: "tp", takeprofit: "tp",
  };

  const seenCount  = new Map<string, number>();
  const found: Record<string, number> = {};
  const unmapped: string[] = [];

  const canonical = rawHeaders.map((h, colIdx) => {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    const occ  = seenCount.get(norm) ?? 0;
    seenCount.set(norm, occ + 1);

    if (norm in BY_POSITION) {
      const name = BY_POSITION[norm][occ === 0 ? 0 : 1];
      if (!(name in found)) found[name] = colIdx;
      return name;
    }
    if (norm in ALIAS) {
      const name = ALIAS[norm];
      if (!(name in found)) found[name] = colIdx;
      return name;
    }
    unmapped.push(`"${h}"@col${colIdx}`);
    return h;
  });

  const KEY_FIELDS = ["symbol","type","volume","profit","opentime","closetime","openprice","closeprice"];
  const missing    = KEY_FIELDS.filter((f) => !(f in found));

  if (unmapped.length) {
    console.log("[parseTradeFile] Unmapped columns (non-critical):", unmapped.join(", "));
  }
  return { canonical, found, missing };
}

// ── CSV row parser ────────────────────────────────────────────────────────────

function parseCSV(content: string): PreviewRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("---"));
  if (lines.length < 2) return [];
  const delim   = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map((h) => normKey(h.replace(/^"|"$/g, "")));

  function idx(aliases: string[]): number {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) return i;
    }
    for (const a of aliases) {
      if (a.length < 4) continue;
      const i = headers.findIndex((h) => h.includes(a));
      if (i >= 0) return i;
    }
    return -1;
  }

  const COL = {
    type:       idx(["type","direction","action","side"]),
    volume:     idx(["volume","size","lots","qty","quantity"]),
    symbol:     idx(["symbol","item","instrument","asset"]),
    openPrice:  idx(["openprice","entryprice","openingprice","entry"]),
    closeTime:  idx(["closetime","closingtime","exittime","closedate","closedtime"]),
    openTime:   idx(["opentime","openingtime","entrytime","opendate","time","date"]),
    closePrice: idx(["closeprice","closingprice","exitprice"]),
    profit:     idx(["profit","pnl","netprofit","pl","gain"]),
  };
  if (COL.openPrice < 0) COL.openPrice = idx(["price"]);

  const SKIP = new Set(["balance","credit","deposit","withdrawal","correction"]);
  const rows: PreviewRow[] = [];

  for (let i = 1; i < lines.length && rows.length < 200; i++) {
    const raw = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (raw.length < 4) continue;
    const get   = (col: number) => (col >= 0 && col < raw.length ? raw[col] ?? "" : "");
    const toNum = (v: unknown) => parseFloat(String(v ?? "").replace(/[\s,]/g, "")) || 0;
    const num   = (col: number) => toNum(get(col));
    const symbol  = get(COL.symbol).toUpperCase().trim();
    const typeStr = get(COL.type).toLowerCase().trim();
    const dateRaw = get(COL.closeTime) || get(COL.openTime);
    if (!symbol || symbol.length < 2 || !dateRaw) continue;
    if (SKIP.has(typeStr)) continue;
    // Skip MT5 order rows (volume like "0.3 / 0.3") and deals rows (volume "in"/"out")
    if (get(COL.volume).includes("/")) continue;
    const lotVal = num(COL.volume);
    if (lotVal === 0) continue;
    const entry = num(COL.openPrice);
    if (entry === 0) continue;
    const d = new Date(dateRaw.trim().replace(/\./g, "-").replace(" ", "T"));
    rows.push({
      pair:      symbol,
      direction: (typeStr.startsWith("sell") || typeStr === "s" || typeStr === "out") ? "SELL" : "BUY",
      lot:       lotVal,
      entry,
      exit:      num(COL.closePrice),
      pnl:       num(COL.profit),
      date:      isNaN(d.getTime()) ? dateRaw : d.toISOString().slice(0, 10),
    });
  }
  return rows;
}

// ── XLSX parser ───────────────────────────────────────────────────────────────

function parseXLSX(buffer: ArrayBuffer): ParseResult {
  const wb      = XLSX.read(buffer, { type: "array" });
  console.log("[parseTradeFile] XLSX sheets:", wb.SheetNames);

  const ws      = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  console.log("[parseTradeFile] First 10 rows:", allRows.slice(0, 10));

  const HEADER_KW = ["ticket","deal","symbol","item","type","direction","volume","size","lots",
                     "profit","pnl","price","commission","swap","position","time","open","close"];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(allRows.length, 30); i++) {
    const norm = allRows[i].map((c) => String(c ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hits = norm.filter((c) => HEADER_KW.some((kw) => c === kw || (kw.length >= 4 && c.includes(kw)))).length;
    if (hits >= 3) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { console.warn("[parseTradeFile] No header found, using row 0"); headerIdx = 0; }

  const rawHeaders = allRows[headerIdx].map((c) => String(c ?? ""));
  console.log("[parseTradeFile] Raw headers at row", headerIdx, ":", rawHeaders);

  const { canonical, found, missing } = buildXLSXColumnMap(rawHeaders);
  console.log("[parseTradeFile] Mapped fields:", found);
  if (missing.length) console.log("[parseTradeFile] Fields NOT found:", missing);

  const KEY_FIELDS = ["symbol","type","volume","profit","opentime","closetime","openprice","closeprice"];
  const foundCount = KEY_FIELDS.filter((f) => f in found).length;
  if (foundCount < 3) {
    console.error("[parseTradeFile] Only", foundCount, "key fields found. Raw headers:", rawHeaders);
    return { csvRaw: "", preview: [], error: "Could not read this file format. Please contact support with your broker name." };
  }

  const csvLines: string[] = [
    canonical.map((h) => `"${h.replace(/"/g, "'")}"`).join(","),
    ...allRows
      .slice(headerIdx + 1)
      .filter((row) => row.some((c) => String(c ?? "").trim() !== ""))
      .map((row) => row.map((c) => {
        // Strip comma thousands-separators (e.g. "4,714.482" → "4714.482")
        // before embedding in CSV to prevent column-shift when re-parsing
        const s = String(c ?? "").replace(/,/g, "").replace(/"/g, "'");
        return `"${s}"`;
      }).join(",")),
  ];
  const csv = csvLines.join("\n");
  return fromCSV(csv);
}

// ── Shared CSV → ParseResult ──────────────────────────────────────────────────

function fromCSV(text: string): ParseResult {
  const preview = parseCSV(text);
  if (preview.length > 0) console.log("[parseTradeFile] First 3 trades:", preview.slice(0, 3));
  if (preview.length === 0) {
    return {
      csvRaw: text, preview: [],
      error: "No valid trades found. Export from MT5 → Account History → right-click → Save as Report → CSV, Excel, or HTML.",
    };
  }
  return { csvRaw: text, preview };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseTradeFile(file: File): Promise<ParseResult> {
  const ext    = file.name.toLowerCase().split(".").pop() ?? "";
  const isXlsx = ext === "xlsx" || ext === "xls";
  const isHTML = ext === "htm"  || ext === "html";
  const isPDF  = ext === "pdf";

  if (isPDF) {
    return Promise.resolve({
      csvRaw: "", preview: [],
      error: "PDF format is not supported. Please export as CSV or Excel from MT5: Account History → right-click → Save as Report.",
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ csvRaw: "", preview: [], error: "Could not read the file." });

    if (isXlsx) {
      reader.onload = (ev) => {
        try   { resolve(parseXLSX(ev.target?.result as ArrayBuffer)); }
        catch (err) {
          console.error("[parseTradeFile] XLSX error:", err);
          resolve({ csvRaw: "", preview: [], error: "Could not read Excel file. Make sure it is a valid MT5 export." });
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (isHTML) {
      reader.onload = (ev) => {
        try {
          const csv = parseHTMLToCSV(ev.target?.result as string);
          if (!csv) resolve({ csvRaw: "", preview: [], error: "Could not find a trade table in this HTML file. Make sure it is an MT5 Account History HTML export." });
          else       resolve(fromCSV(csv));
        } catch (err) {
          console.error("[parseTradeFile] HTML error:", err);
          resolve({ csvRaw: "", preview: [], error: "Could not parse HTML file. Make sure it is an MT5 Account History export." });
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => resolve(fromCSV(ev.target?.result as string));
      reader.readAsText(file);
    }
  });
}
