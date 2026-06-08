// test-parse.mjs — local test for the XLSX import parser
// Run: node test-parse.mjs
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX    = require("xlsx");

const FILE = "C:\\Users\\Job Niri Joseph\\Downloads\\ReportHistory-435810328.xlsx";

// ── Same column-mapper logic as src/lib/parseTradeFile.ts ─────────────────────

function buildXLSXColumnMap(rawHeaders) {
  const BY_POSITION = {
    time:  ["opentime",  "closetime"],
    price: ["openprice", "closeprice"],
  };
  const ALIAS = {
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

  const seenCount = new Map();
  const found = {};
  const unmapped = [];

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
  const missing = KEY_FIELDS.filter(f => !(f in found));
  return { canonical, found, missing, unmapped };
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("---"));
  if (lines.length < 2) return [];
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^"|"$/g, ""));

  function idx(aliases) {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) return i;
    }
    for (const a of aliases) {
      if (a.length < 4) continue;
      const i = headers.findIndex(h => h.includes(a));
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

  console.log("\n[CSV parser] Column index map:", COL);

  const SKIP = new Set(["balance","credit","deposit","withdrawal","correction"]);
  const rows = [];

  for (let i = 1; i < lines.length && rows.length < 200; i++) {
    const raw = lines[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ""));
    if (raw.length < 4) continue;
    const get = col => (col >= 0 && col < raw.length ? raw[col] ?? "" : "");
    const num = col => parseFloat(get(col).replace(/[, ]/g, "")) || 0;
    const symbol  = get(COL.symbol).toUpperCase().trim();
    const typeStr = get(COL.type).toLowerCase().trim();
    const dateRaw = get(COL.closeTime) || get(COL.openTime);
    if (!symbol || symbol.length < 2 || !dateRaw) continue;
    if (SKIP.has(typeStr)) continue;
    const d = new Date(dateRaw.trim().replace(/\./g, "-").replace(" ", "T"));
    rows.push({
      pair:      symbol,
      direction: (typeStr.startsWith("sell") || typeStr === "s" || typeStr === "out") ? "SELL" : "BUY",
      lot:       num(COL.volume),
      entry:     num(COL.openPrice),
      exit:      num(COL.closePrice),
      pnl:       num(COL.profit),
      date:      isNaN(d.getTime()) ? dateRaw : d.toISOString().slice(0, 10),
    });
  }
  return rows;
}

// ── Run the test ──────────────────────────────────────────────────────────────

try {
  console.log("Reading file:", FILE);
  const buffer  = readFileSync(FILE);
  const wb      = XLSX.read(buffer, { type: "buffer" });

  console.log("\n[XLSX] Sheets found:", wb.SheetNames);

  const ws      = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  console.log("\n[XLSX] First 10 rows:");
  allRows.slice(0, 10).forEach((r, i) => console.log(`  row ${i}:`, r));

  // Find header row
  const HEADER_KW = ["ticket","deal","symbol","item","type","direction","volume","size","lots",
                     "profit","pnl","price","commission","swap","position","time","open","close"];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(allRows.length, 30); i++) {
    const norm = allRows[i].map(c => String(c ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hits = norm.filter(c => HEADER_KW.some(kw => c === kw || (kw.length >= 4 && c.includes(kw)))).length;
    if (hits >= 3) { headerIdx = i; break; }
  }

  if (headerIdx === -1) {
    console.error("\n[ERROR] No header row found in first 30 rows.");
    process.exit(1);
  }

  const rawHeaders = allRows[headerIdx].map(c => String(c ?? ""));
  console.log("\n[XLSX] Header row at index", headerIdx, ":", rawHeaders);

  const { canonical, found, missing, unmapped } = buildXLSXColumnMap(rawHeaders);
  console.log("\n[XLSX] Mapped fields:", found);
  if (missing.length)  console.log("[XLSX] Fields NOT found:", missing);
  if (unmapped.length) console.log("[XLSX] Unmapped columns:", unmapped);

  const KEY_FIELDS = ["symbol","type","volume","profit","opentime","closetime","openprice","closeprice"];
  const foundCount = KEY_FIELDS.filter(f => f in found).length;
  if (foundCount < 3) {
    console.error(`\n[ERROR] Only ${foundCount} key fields found. Cannot parse. Raw headers:`, rawHeaders);
    process.exit(1);
  }

  // Build CSV
  const csvLines = [
    canonical.map(h => `"${h.replace(/"/g, "'")}"`).join(","),
    ...allRows
      .slice(headerIdx + 1)
      .filter(row => row.some(c => String(c ?? "").trim() !== ""))
      .map(row => row.map(c => `"${String(c ?? "").replace(/"/g, "'")}"`).join(",")),
  ];
  const csv = csvLines.join("\n");

  console.log("\n[CSV] First 3 data lines after header:");
  csvLines.slice(1, 4).forEach((l, i) => console.log(`  line ${i+1}:`, l));

  const trades = parseCSV(csv);

  if (trades.length === 0) {
    console.error("\n[ERROR] parseCSV returned 0 trades.");
    console.log("[DEBUG] Full CSV header line:", csvLines[0]);
    console.log("[DEBUG] First data line:", csvLines[1]);
    process.exit(1);
  }

  console.log(`\n✅ SUCCESS — ${trades.length} trades parsed. First 3:`);
  trades.slice(0, 3).forEach((t, i) => console.log(`  trade ${i+1}:`, t));

} catch (err) {
  console.error("\n[FATAL]", err);
  process.exit(1);
}
