"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";

interface PreviewRow {
  pair:      string;
  direction: string;
  lot:       number;
  entry:     number;
  exit:      number;
  pnl:       number;
  date:      string;
}

interface Props {
  onClose:   () => void;
  onSuccess: (inserted: number, duplicates: number) => void;
}

function normKey(h: string) { return h.toLowerCase().replace(/[^a-z0-9]/g, ""); }

/** Convert an MT5 HTML report into a CSV string that clientParseCSV understands. */
function parseHTMLToCSV(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
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
      const hasTicket = norm.some((c) => c.includes("ticket") || c === "" + i || c === "deal" || c === "order");
      if (hasSymbol && hasType && cells.length >= 5) {
        // prefer rows that also have ticket; settle for symbol+type
        if (hasTicket || headerIdx === -1) {
          headerIdx = i;
          headers = cells;
        }
        if (hasTicket) break;
      }
    }

    if (headerIdx === -1 || headers.length < 4) continue;

    const csvLines: string[] = [headers.map((h) => `"${h}"`).join(",")];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll("td"))
        .map((c) => c.textContent?.trim() ?? "");
      if (cells.length < Math.floor(headers.length / 2)) continue;
      // skip summary/totals rows (most cells empty or only 1–2 have values)
      const filled = cells.filter((c) => c !== "").length;
      if (filled <= 2) continue;
      csvLines.push(cells.map((c) => `"${c.replace(/"/g, "'")}"`).join(","));
    }

    if (csvLines.length > 1) return csvLines.join("\n");
  }
  return "";
}

function clientParseCSV(content: string): PreviewRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("---"));
  if (lines.length < 2) return [];
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map((h) => normKey(h.replace(/^"|"$/g, "")));

  // Tier-1 exact, Tier-2 substring (alias ≥4 chars to avoid false hits)
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
    type:       idx(["type", "direction", "action", "side"]),
    volume:     idx(["volume", "size", "lots", "qty", "quantity"]),
    symbol:     idx(["symbol", "item", "instrument", "asset"]),
    openPrice:  idx(["openprice", "entryprice", "openingprice", "entry"]),
    closeTime:  idx(["closetime", "closingtime", "exittime", "closedate", "closedtime"]),
    openTime:   idx(["opentime", "openingtime", "entrytime", "opendate", "time", "date"]),
    closePrice: idx(["closeprice", "closingprice", "exitprice"]),
    profit:     idx(["profit", "pnl", "netprofit", "pl", "gain"]),
  };
  // "price" alone is ambiguous — use only as last-resort for open price
  if (COL.openPrice < 0) COL.openPrice = idx(["price"]);

  const SKIP_TYPES = new Set(["balance", "credit", "deposit", "withdrawal", "correction"]);
  const rows: PreviewRow[] = [];
  for (let i = 1; i < lines.length && rows.length < 200; i++) {
    const raw = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (raw.length < 4) continue;
    const get = (col: number) => (col >= 0 && col < raw.length ? raw[col] ?? "" : "");
    const num = (col: number) => parseFloat(get(col).replace(/[, ]/g, "")) || 0;
    const symbol  = get(COL.symbol).toUpperCase().trim();
    const typeStr = get(COL.type).toLowerCase().trim();
    const dateRaw = get(COL.closeTime) || get(COL.openTime);
    if (!symbol || symbol.length < 2 || !dateRaw) continue;
    if (SKIP_TYPES.has(typeStr)) continue;
    const clean = dateRaw.trim().replace(/\./g, "-").replace(" ", "T");
    const d = new Date(clean);
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

// ── Inline input styles (no reliance on global CSS classes) ──────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#1a1a1f",
  border: "1px solid #3f3f46",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  color: "#f4f4f5",
  outline: "none",
  fontFamily: "inherit",
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: "1px solid rgba(239,68,68,0.6)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#C4973E",
  marginBottom: 6,
};

export default function CsvImportModal({ onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [login,     setLogin]     = useState("");
  const [broker,    setBroker]    = useState("");
  const [preview,   setPreview]   = useState<PreviewRow[] | null>(null);
  const [csvRaw,    setCsvRaw]    = useState("");
  const [fileName,  setFileName]  = useState("");
  const [importing, setImporting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [touched,   setTouched]   = useState({ login: false, broker: false });
  const [successInfo, setSuccessInfo] = useState<{
    inserted: number; duplicates: number; label: string;
  } | null>(null);

  const loginMissing  = touched.login  && !login.trim();
  const brokerMissing = touched.broker && !broker.trim();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    console.log("file input changed", e.target.files?.[0]?.name);
    if (!login.trim() || !broker.trim()) {
      setTouched({ login: true, broker: true });
      setError("Fill in your MT5 Login Number and Broker first.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const isXlsx = ext === "xlsx" || ext === "xls";
    const isHTML = ext === "htm" || ext === "html";
    const isPDF  = ext === "pdf";

    if (isPDF) {
      setError("PDF format is not supported. Please export as CSV or Excel from MT5: Account History → right-click → Save as Report.");
      setPreview(null);
      e.target.value = "";
      return;
    }

    function applyText(text: string) {
      setCsvRaw(text);
      const rows = clientParseCSV(text);
      if (rows.length > 0) {
        console.log("[Import] First 3 parsed trades:", rows.slice(0, 3));
      }
      if (rows.length === 0) {
        setError("No valid trades found. Export from MT5 → Account History → right-click → Save as Report → CSV, Excel, or HTML.");
        setPreview(null);
      } else {
        setPreview(rows);
      }
    }

    const reader = new FileReader();

    if (isXlsx) {
      reader.onload = (ev) => {
        try {
          const data = ev.target?.result as ArrayBuffer;
          const wb   = XLSX.read(data, { type: "array" });

          console.log("[XLSX import] Sheets found:", wb.SheetNames);

          const ws      = wb.Sheets[wb.SheetNames[0]];
          const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];

          // Log enough rows to always see past MT5's metadata header block
          console.log("[XLSX import] First 10 rows:", allRows.slice(0, 10));

          // Find the header row: first row in the first 30 with 3+ MT5 keyword matches
          const HEADER_KW = ["ticket","deal","symbol","item","type","direction","volume","size","lots","profit","pnl","price","commission","swap","position"];
          let headerIdx = -1;
          for (let i = 0; i < Math.min(allRows.length, 30); i++) {
            const norm = allRows[i].map((c) => String(c ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
            const hits = norm.filter((c) => HEADER_KW.some((kw) => c === kw || (kw.length >= 4 && c.includes(kw)))).length;
            if (hits >= 3) { headerIdx = i; break; }
          }
          if (headerIdx === -1) {
            console.warn("[XLSX import] No header row found in first 30 rows — using row 0");
            headerIdx = 0;
          }

          console.log("[XLSX import] Header row at index", headerIdx, ":", allRows[headerIdx]);

          // MT5 exports duplicate column names: "Time" appears twice (open/close)
          // and "Price" appears twice (entry/exit). Rename by position so that
          // clientParseCSV can distinguish them via its alias lists.
          const rawHeaders = allRows[headerIdx].map((c) => String(c ?? ""));
          const seenNorm = new Map<string, number>();
          const dedupedHeaders = rawHeaders.map((h) => {
            const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
            const count = seenNorm.get(norm) ?? 0;
            seenNorm.set(norm, count + 1);
            if (norm === "time")     return count === 0 ? "opentime"  : "closetime";
            if (norm === "price")    return count === 0 ? "openprice" : "closeprice";
            if (norm === "position") return "ticket";
            return h;
          });

          console.log("[XLSX import] Deduplicated headers:", dedupedHeaders);

          // Build CSV: deduplicated header row + data rows (skip fully-empty rows)
          const csvLines: string[] = [
            dedupedHeaders.map((h) => `"${h.replace(/"/g, "'")}"`).join(","),
            ...allRows
              .slice(headerIdx + 1)
              .filter((row) => row.some((c) => String(c ?? "").trim() !== ""))
              .map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, "'")}"`).join(",")),
          ];

          applyText(csvLines.join("\n"));
        } catch (err) {
          console.error("[XLSX import] Parse error:", err);
          setError("Could not read Excel file. Make sure it is a valid MT5 export.");
          setPreview(null);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (isHTML) {
      reader.onload = (ev) => {
        try {
          const csv = parseHTMLToCSV(ev.target?.result as string);
          if (!csv) {
            setError("Could not find a trade table in this HTML file. Make sure it is an MT5 Account History HTML export.");
            setPreview(null);
          } else {
            applyText(csv);
          }
        } catch {
          setError("Could not parse HTML file. Make sure it is an MT5 Account History export.");
          setPreview(null);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => applyText(ev.target?.result as string);
      reader.readAsText(file);
    }

    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  async function handleConfirm() {
    setTouched({ login: true, broker: true });
    if (!login.trim())  { setError("MT5 Login Number is required."); return; }
    if (!broker.trim()) { setError("Broker is required."); return; }
    if (!csvRaw)        { setError("Please select a file first."); return; }

    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_content:    csvRaw,
          account_login:  login.trim(),
          account_broker: broker.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "FREE_LIMIT_REACHED") {
          setError("Upgrade to Pro to import more trades. Your free trial import has been used.");
        } else if (data.error?.includes("Database error")) {
          setError(`${data.error} — Check browser console for details.`);
          console.error("[CSV import] server error:", data.error);
        } else {
          setError(data.error ?? "Import failed. Please try again.");
        }
        return;
      }

      // Show success state with account name, then close
      const label = data.account_label ?? `${login.trim()} — ${broker.trim()}`;
      setSuccessInfo({ inserted: data.inserted ?? 0, duplicates: data.duplicates ?? 0, label });
      setTimeout(() => {
        onSuccess(data.inserted ?? 0, data.duplicates ?? 0);
      }, 2500);
    } catch (e) {
      console.error("[CSV import] network error:", e);
      setError("Network error — could not reach the server. Check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  const canConfirm = !!login.trim() && !!broker.trim() && !!preview && !importing;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 16px",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 560,
        maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        borderRadius: 20, overflow: "hidden",
        background: "#111113",
        border: "1px solid #27272a",
        borderTop: "2px solid #C4973E",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px 16px",
          borderBottom: "1px solid #27272a",
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: "#f4f4f5", margin: 0 }}>Import MT5 History</p>
            <p style={{ fontSize: 12, color: "#71717a", margin: "3px 0 0" }}>Upload your MT5 history — CSV, Excel, or HTML format accepted.</p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "1px solid #3f3f46",
              color: "#71717a", cursor: "pointer", fontSize: 16,
              opacity: importing ? 0.4 : 1,
            }}
          >×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* ── Success state ── */}
          {successInfo && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              textAlign: "center", padding: "32px 16px", gap: 16,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#f4f4f5", margin: "0 0 6px" }}>
                  {successInfo.inserted} trade{successInfo.inserted !== 1 ? "s" : ""} imported successfully
                </p>
                <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
                  Account: <span style={{ color: "#e4e4e7", fontWeight: 600 }}>{successInfo.label}</span>
                </p>
                {successInfo.duplicates > 0 && (
                  <p style={{ fontSize: 12, color: "#52525b", margin: "6px 0 0" }}>
                    {successInfo.duplicates} duplicate{successInfo.duplicates !== 1 ? "s" : ""} skipped (already in your journal)
                  </p>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#52525b", margin: 0 }}>
                Your account will appear in Synced Accounts on the Settings page.
              </p>
            </div>
          )}

          {/* Step 1: Account details */}
          {!successInfo && (<>
          <div style={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 14,
            padding: "16px 16px 18px",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C4973E", margin: "0 0 14px" }}>
              Step 1 — Account Details
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {/* MT5 Login */}
              <div style={{ flex: "1 1 180px" }}>
                <label style={labelStyle}>
                  MT5 Login Number <span style={{ color: "#f87171" }}>*</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={login}
                  onChange={(e) => { setLogin(e.target.value); setError(null); }}
                  onBlur={() => setTouched((t) => ({ ...t, login: true }))}
                  placeholder="e.g. 12345678"
                  style={loginMissing ? inputErrorStyle : inputStyle}
                />
                {loginMissing ? (
                  <p style={{ fontSize: 11, color: "#f87171", margin: "4px 0 0" }}>Required</p>
                ) : (
                  <p style={{ fontSize: 11, color: "#52525b", margin: "4px 0 0" }}>Shown in MT5 top-left corner</p>
                )}
              </div>

              {/* Broker */}
              <div style={{ flex: "1 1 180px" }}>
                <label style={labelStyle}>
                  Broker <span style={{ color: "#f87171" }}>*</span>
                </label>
                <input
                  type="text"
                  value={broker}
                  onChange={(e) => { setBroker(e.target.value); setError(null); }}
                  onBlur={() => setTouched((t) => ({ ...t, broker: true }))}
                  placeholder="e.g. Exness, FXTM"
                  style={brokerMissing ? inputErrorStyle : inputStyle}
                />
                {brokerMissing ? (
                  <p style={{ fontSize: 11, color: "#f87171", margin: "4px 0 0" }}>Required</p>
                ) : (
                  <p style={{ fontSize: 11, color: "#52525b", margin: "4px 0 0" }}>
                    {login && broker ? `Account: ${login} — ${broker}` : "Saved with your imported trades"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: File upload */}
          <div style={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 14,
            padding: "16px 16px 18px",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C4973E", margin: "0 0 10px" }}>
              Step 2 — History File
            </p>

            <div style={{
              fontSize: 12, color: "#86efac", lineHeight: 1.55,
              background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 10, padding: "10px 12px", marginBottom: 12,
            }}>
              In MT5: <strong>View → Terminal → Account History</strong> → right-click → <strong>Save as Report</strong> → choose CSV, HTML, or Excel.
            </div>

            {/* Dropzone: transparent input overlays the full area so it receives clicks directly */}
            <div style={{
              position: "relative",
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 12,
              border: `2px dashed ${preview ? "rgba(52,211,153,0.5)" : "#3f3f46"}`,
              background: preview ? "rgba(16,185,129,0.05)" : "transparent",
              transition: "border 0.2s",
              minHeight: 48,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={preview ? "#34d399" : "#52525b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, pointerEvents: "none" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style={{ fontSize: 13, color: preview ? "#86efac" : "#71717a", pointerEvents: "none" }}>
                {fileName ? fileName : "Click to choose a .csv, .xlsx, .htm, or .html file"}
              </span>
              {/* Transparent overlay — NOT display:none so it actually receives pointer events */}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,.htm,.html,.txt"
                onChange={handleFile}
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%",
                  opacity: 0, cursor: "pointer",
                  fontSize: 0,
                }}
              />
            </div>

            {/* Visible fallback button — triggers the same input via ref */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                marginTop: 8, width: "100%",
                padding: "9px 0", borderRadius: 10,
                border: "1px solid #3f3f46",
                background: "transparent",
                color: "#a1a1aa", fontSize: 13, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {fileName ? `Change file: ${fileName}` : "Browse for file…"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 12,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171",
            }}>
              {error}
              {error.includes("Upgrade to Pro") && (
                <a href="/pricing" style={{ marginLeft: 8, fontWeight: 700, textDecoration: "underline", color: "#F5C518" }}>
                  Upgrade →
                </a>
              )}
            </div>
          )}

          {/* Preview table */}
          {preview && preview.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#52525b", margin: "0 0 8px" }}>
                Preview — {preview.length} trade{preview.length !== 1 ? "s" : ""} found
                {preview.length === 200 ? " (first 200 shown)" : ""}
              </p>
              <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #27272a" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #27272a", background: "#18181b" }}>
                      {["Pair","Dir","Lot","Entry","Exit","P&L","Date"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#52525b", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} style={{ borderBottom: i < 9 && i < preview.length - 1 ? "1px solid rgba(39,39,42,0.6)" : "none" }}>
                        <td style={{ padding: "8px 10px", fontFamily: "inherit", fontWeight: 600, color: "#f4f4f5" }}>{row.pair}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "inherit", fontWeight: 700, fontSize: 10, color: row.direction === "BUY" ? "#34d399" : "#f87171" }}>{row.direction}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "inherit", color: "#a1a1aa" }}>{row.lot}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "inherit", color: "#a1a1aa" }}>{row.entry}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "inherit", color: "#a1a1aa" }}>{row.exit}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "inherit", fontWeight: 600, color: row.pnl >= 0 ? "#34d399" : "#f87171" }}>
                          {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#71717a" }}>{row.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p style={{ padding: "8px 10px", fontSize: 11, color: "#52525b", borderTop: "1px solid #27272a", margin: 0 }}>
                    … and {preview.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}
          </>)}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "16px 24px",
          borderTop: "1px solid #27272a",
          flexShrink: 0,
        }}>
          <button
            onClick={successInfo ? () => onSuccess(successInfo.inserted, successInfo.duplicates) : onClose}
            disabled={importing}
            style={{
              padding: "10px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: successInfo ? "rgba(16,185,129,0.1)" : "none",
              border: successInfo ? "1px solid rgba(16,185,129,0.3)" : "1px solid #3f3f46",
              color: successInfo ? "#34d399" : "#a1a1aa",
              cursor: "pointer", opacity: importing ? 0.4 : 1,
            }}
          >{successInfo ? "Done ✓" : "Cancel"}</button>

          {!successInfo && <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 12, fontSize: 14, fontWeight: 700,
              background: canConfirm ? "linear-gradient(135deg,#F5C518,#C9A227)" : "#27272a",
              color: canConfirm ? "#0A0A0F" : "#52525b",
              border: "none", cursor: canConfirm ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {importing ? (
              <>
                <span style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Importing…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Confirm Import
              </>
            )}
          </button>}
        </div>
      </div>
    </div>
  );
}
