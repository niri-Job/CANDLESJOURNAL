"use client";

import { useRef, useState } from "react";

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

function clientParseCSV(content: string): PreviewRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("---"));
  if (lines.length < 2) return [];

  const delim = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map((h) => normKey(h.replace(/^"|"$/g, "")));

  function idx(aliases: string[]) {
    for (const a of aliases) {
      const i = headers.findIndex((h) => h.includes(a) || a.includes(h));
      if (i >= 0) return i;
    }
    return -1;
  }

  const COL = {
    type:       idx(["type"]),
    volume:     idx(["volume","size","lots"]),
    symbol:     idx(["symbol","item","instrument"]),
    openPrice:  idx(["openprice","price"]),
    closeTime:  idx(["closetime","closedate"]),
    openTime:   idx(["opentime","opendate"]),
    closePrice: idx(["closeprice"]),
    profit:     idx(["profit"]),
  };

  const rows: PreviewRow[] = [];

  for (let i = 1; i < lines.length && rows.length < 200; i++) {
    const raw = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (raw.length < 5) continue;

    const get = (col: number) => (col >= 0 ? raw[col] ?? "" : "");
    const num = (col: number) => parseFloat(get(col)) || 0;

    const symbol    = get(COL.symbol).toUpperCase();
    const typeStr   = get(COL.type).toLowerCase();
    const dateRaw   = get(COL.closeTime) || get(COL.openTime);

    if (!symbol || !dateRaw) continue;

    const clean = dateRaw.trim().replace(/\./g, "-").replace(" ", "T");
    const d     = new Date(clean);
    const date  = isNaN(d.getTime()) ? dateRaw : d.toISOString().slice(0, 10);

    rows.push({
      pair:      symbol,
      direction: typeStr.startsWith("sell") || typeStr === "s" ? "SELL" : "BUY",
      lot:       num(COL.volume),
      entry:     num(COL.openPrice),
      exit:      num(COL.closePrice),
      pnl:       num(COL.profit),
      date,
    });
  }

  return rows;
}

export default function CsvImportModal({ onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [login,     setLogin]     = useState("");
  const [broker,    setBroker]    = useState("");
  const [preview,   setPreview]   = useState<PreviewRow[] | null>(null);
  const [csvRaw,    setCsvRaw]    = useState("");
  const [fileName,  setFileName]  = useState("");
  const [importing, setImporting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRaw(text);
      const rows = clientParseCSV(text);
      if (rows.length === 0) {
        setError("No valid trades found in this file. Make sure to export from MT5 → Account History → Save as Report → CSV.");
        setPreview(null);
      } else {
        setPreview(rows);
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirm() {
    if (!login.trim())  { setError("MT5 Login Number is required."); return; }
    if (!broker.trim()) { setError("Broker is required."); return; }
    if (!csvRaw)        { setError("Please select a CSV file."); return; }

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
        } else {
          setError(data.error ?? "Import failed. Please try again.");
        }
        return;
      }

      onSuccess(data.inserted ?? 0, data.duplicates ?? 0);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  const canConfirm = !!login.trim() && !!broker.trim() && !!preview && !importing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
           style={{ background: "var(--cj-surface)", border: "1px solid var(--cj-border)", borderTop: "2px solid var(--cj-gold-muted)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <p className="font-semibold text-zinc-100">Import MT5 CSV</p>
            <p className="text-xs text-zinc-500 mt-0.5">Upload your MT5 account history export</p>
          </div>
          <button onClick={onClose} disabled={importing}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500
                       hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Account fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                     style={{ color: "var(--cj-gold-muted)" }}>
                MT5 Login Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="e.g. 12345678"
                className="inp w-full"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Shown in MT5 top-left corner</p>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                     style={{ color: "var(--cj-gold-muted)" }}>
                Broker <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g. Exness"
                className="inp w-full"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Will appear as "{login || "12345678"} — {broker || "Exness"}"</p>
            </div>
          </div>

          {/* How to export */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs leading-relaxed"
               style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", color: "#86efac" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>
              In MT5: <strong>View → Terminal → Account History</strong> → right-click any trade → <strong>Save as Report → CSV</strong>.
              Accepted columns: ticket, time, type, volume, symbol, price, close time, close price, commission, swap, profit.
            </span>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                   style={{ color: "var(--cj-gold-muted)" }}>
              CSV File
            </label>
            <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all
                               ${preview ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500"}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   style={{ color: preview ? "#34d399" : "#52525b", flexShrink: 0 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span className="text-sm" style={{ color: preview ? "#86efac" : "#71717a" }}>
                {fileName ? fileName : "Click to choose a .csv file"}
              </span>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-xl text-xs"
                 style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
              {error}
              {error.includes("Upgrade to Pro") && (
                <a href="/pricing" className="ml-2 font-bold underline" style={{ color: "#F5C518" }}>
                  Upgrade →
                </a>
              )}
            </div>
          )}

          {/* Preview table */}
          {preview && preview.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                Preview — {preview.length} trade{preview.length !== 1 ? "s" : ""} detected
                {preview.length === 200 ? " (showing first 200)" : ""}
              </p>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800" style={{ background: "var(--cj-raised)" }}>
                      {["Pair","Dir","Lot","Entry","Exit","P&L","Date"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-3 py-2 font-mono font-semibold text-zinc-200">{row.pair}</td>
                        <td className="px-3 py-2">
                          <span className={`font-mono font-bold text-[10px] ${row.direction === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
                            {row.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-400 font-mono">{row.lot}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono">{row.entry}</td>
                        <td className="px-3 py-2 text-zinc-400 font-mono">{row.exit}</td>
                        <td className="px-3 py-2 font-mono font-semibold"
                            style={{ color: row.pnl >= 0 ? "#34d399" : "#f87171" }}>
                          {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-zinc-500">{row.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p className="px-3 py-2 text-[10px] text-zinc-600 border-t border-zinc-800">
                    … and {preview.length - 10} more trade{preview.length - 10 !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          <button onClick={onClose} disabled={importing}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:text-zinc-200
                       border border-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canConfirm ? "linear-gradient(135deg,#F5C518,#C9A227)" : undefined,
                     backgroundColor: canConfirm ? undefined : "var(--cj-raised)",
                     color: canConfirm ? "#0A0A0F" : "#71717a" }}>
            {importing ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
          </button>
        </div>
      </div>
    </div>
  );
}
