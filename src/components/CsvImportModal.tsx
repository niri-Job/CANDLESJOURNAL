// BUILD: 2026-06-08T18:00:00.000Z
"use client";

import { useRef, useState } from "react";
import { parseTradeFile, type PreviewRow } from "@/lib/parseTradeFile";

interface Props {
  onClose:   () => void;
  onSuccess: (inserted: number, duplicates: number) => void;
}

// ── Inline input styles ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "#1a1a1f", border: "1px solid #3f3f46",
  borderRadius: 10, padding: "10px 14px",
  fontSize: 14, color: "#f4f4f5", outline: "none", fontFamily: "inherit",
};
const inputErrorStyle: React.CSSProperties = {
  ...inputStyle, border: "1px solid rgba(239,68,68,0.6)",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase",
  color: "#C4973E", marginBottom: 6,
};

export default function CsvImportModal({ onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [login,       setLogin]       = useState("");
  const [broker,      setBroker]      = useState("");
  const [preview,     setPreview]     = useState<PreviewRow[] | null>(null);
  const [csvRaw,      setCsvRaw]      = useState("");
  const [fileName,    setFileName]    = useState("");
  const [importing,   setImporting]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [touched,     setTouched]     = useState({ login: false, broker: false });
  const [successInfo, setSuccessInfo] = useState<{
    inserted: number; duplicates: number; label: string;
  } | null>(null);

  const loginMissing  = touched.login  && !login.trim();
  const brokerMissing = touched.broker && !broker.trim();

  // ── Fresh file handler ────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("=== NIRI FILE HANDLER FIRED ===");
    const file = e.target.files?.[0];
    if (!file) return;
    console.log("File:", file.name, file.size);

    if (!login.trim() || !broker.trim()) {
      setTouched({ login: true, broker: true });
      setError("Fill in your MT5 Login Number and Broker first.");
      e.target.value = "";
      return;
    }

    setFileName(file.name);
    setError(null);
    setPreview(null);

    const result = await parseTradeFile(file);
    console.log("parseTradeFile result:", result);

    if (result.error) {
      setError(result.error);
      setCsvRaw("");
      setPreview(null);
    } else {
      setCsvRaw(result.csvRaw);
      setPreview(result.preview);
    }

    // Allow re-selecting the same file
    e.target.value = "";
  };

  // ── Server import ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    setTouched({ login: true, broker: true });
    if (!login.trim())  { setError("MT5 Login Number is required."); return; }
    if (!broker.trim()) { setError("Broker is required."); return; }
    if (!csvRaw)        { setError("Please select a file first."); return; }

    setImporting(true);
    setError(null);
    try {
      const res  = await fetch("/api/trades/import-csv", {
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
        if (data.error?.includes("Database error")) {
          setError(`${data.error} — Check browser console for details.`);
          console.error("[import] server error:", data.error);
        } else {
          setError(data.error ?? "Import failed. Please try again.");
        }
        return;
      }

      const label = data.account_label ?? `${login.trim()} — ${broker.trim()}`;
      setSuccessInfo({ inserted: data.inserted ?? 0, duplicates: data.duplicates ?? 0, label });
      setTimeout(() => { onSuccess(data.inserted ?? 0, data.duplicates ?? 0); }, 2500);
    } catch (e) {
      console.error("[import] network error:", e);
      setError("Network error — could not reach the server. Check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  const canConfirm = !!login.trim() && !!broker.trim() && !!preview && !importing;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 16px", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 560, maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        borderRadius: 20, overflow: "hidden",
        background: "#111113", border: "1px solid #27272a",
        borderTop: "2px solid #C4973E",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px 16px", borderBottom: "1px solid #27272a", flexShrink: 0,
        }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: "#f4f4f5", margin: 0 }}>Import MT5 History</p>
            <p style={{ fontSize: 12, color: "#71717a", margin: "3px 0 0" }}>Upload your MT5 history — CSV, Excel, or HTML format accepted.</p>
          </div>
          <button onClick={onClose} disabled={importing} style={{
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "1px solid #3f3f46",
            color: "#71717a", cursor: "pointer", fontSize: 16, opacity: importing ? 0.4 : 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Success */}
          {successInfo && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "32px 16px", gap: 16 }}>
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
                  {successInfo.inserted} new trade{successInfo.inserted !== 1 ? "s" : ""} added
                  {successInfo.duplicates > 0 ? `, ${successInfo.duplicates} duplicate${successInfo.duplicates !== 1 ? "s" : ""} skipped` : ""}
                </p>
                <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
                  Account: <span style={{ color: "#e4e4e7", fontWeight: 600 }}>{successInfo.label}</span>
                </p>
              </div>
              <p style={{ fontSize: 12, color: "#52525b", margin: 0 }}>
                Your account will appear in Synced Accounts on the Settings page.
              </p>
            </div>
          )}

          {!successInfo && (<>
            {/* Step 1: Account details */}
            <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 14, padding: "16px 16px 18px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C4973E", margin: "0 0 14px" }}>
                Step 1 — Account Details
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 180px" }}>
                  <label style={labelStyle}>MT5 Login Number <span style={{ color: "#f87171" }}>*</span></label>
                  <input
                    type="number" inputMode="numeric" value={login}
                    onChange={(e) => { setLogin(e.target.value); setError(null); }}
                    onBlur={() => setTouched((t) => ({ ...t, login: true }))}
                    placeholder="e.g. 12345678"
                    style={loginMissing ? inputErrorStyle : inputStyle}
                  />
                  <p style={{ fontSize: 11, color: loginMissing ? "#f87171" : "#52525b", margin: "4px 0 0" }}>
                    {loginMissing ? "Required" : "Shown in MT5 top-left corner"}
                  </p>
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <label style={labelStyle}>Broker <span style={{ color: "#f87171" }}>*</span></label>
                  <input
                    type="text" value={broker}
                    onChange={(e) => { setBroker(e.target.value); setError(null); }}
                    onBlur={() => setTouched((t) => ({ ...t, broker: true }))}
                    placeholder="e.g. Exness, FXTM"
                    style={brokerMissing ? inputErrorStyle : inputStyle}
                  />
                  <p style={{ fontSize: 11, color: brokerMissing ? "#f87171" : "#52525b", margin: "4px 0 0" }}>
                    {brokerMissing ? "Required" : (login && broker ? `Account: ${login} — ${broker}` : "Saved with your imported trades")}
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2: File upload */}
            <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 14, padding: "16px 16px 18px" }}>
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

              {/* Dropzone — transparent overlay so input receives clicks directly */}
              <div style={{
                position: "relative", display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 12, minHeight: 48,
                border: `2px dashed ${preview ? "rgba(52,211,153,0.5)" : "#3f3f46"}`,
                background: preview ? "rgba(16,185,129,0.05)" : "transparent",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke={preview ? "#34d399" : "#52525b"} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, pointerEvents: "none" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span style={{ fontSize: 13, color: preview ? "#86efac" : "#71717a", pointerEvents: "none" }}>
                  {fileName || "Click to choose a .csv, .xlsx, .htm, or .html file"}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.htm,.html,.txt"
                  onChange={handleFileChange}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 0 }}
                />
              </div>

              {/* Visible fallback button */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  marginTop: 8, width: "100%", padding: "9px 0", borderRadius: 10,
                  border: "1px solid #3f3f46", background: "transparent",
                  color: "#a1a1aa", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {fileName ? `Change file: ${fileName}` : "Browse for file…"}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                {error}
                {error.includes("Upgrade to Pro") && (
                  <a href="/pricing" style={{ marginLeft: 8, fontWeight: 700, textDecoration: "underline", color: "#F5C518" }}>Upgrade →</a>
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
                          <td style={{ padding: "8px 10px", fontWeight: 600, color: "#f4f4f5" }}>{row.pair}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 10, color: row.direction === "BUY" ? "#34d399" : "#f87171" }}>{row.direction}</td>
                          <td style={{ padding: "8px 10px", color: "#a1a1aa" }}>{row.lot}</td>
                          <td style={{ padding: "8px 10px", color: "#a1a1aa" }}>{row.entry}</td>
                          <td style={{ padding: "8px 10px", color: "#a1a1aa" }}>{row.exit}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 600, color: row.pnl >= 0 ? "#34d399" : "#f87171" }}>
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

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "16px 24px", borderTop: "1px solid #27272a", flexShrink: 0,
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

          {!successInfo && (
            <button onClick={handleConfirm} disabled={!canConfirm} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 12, fontSize: 14, fontWeight: 700,
              background: canConfirm ? "linear-gradient(135deg,#F5C518,#C9A227)" : "#27272a",
              color: canConfirm ? "#0A0A0F" : "#52525b",
              border: "none", cursor: canConfirm ? "pointer" : "not-allowed",
            }}>
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
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
