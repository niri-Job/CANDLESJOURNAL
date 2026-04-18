"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Trade {
  id: number;
  pair: string;
  direction: "BUY" | "SELL";
  lot: number;
  date: string;
  entry: number;
  exit: number;
  sl: number | null;
  tp: number | null;
  pnl: number;
  notes: string;
}

const EMPTY_FORM = {
  pair: "",
  lot: "",
  date: new Date().toISOString().split("T")[0],
  entry: "",
  exit: "",
  sl: "",
  tp: "",
  pnl: "",
  notes: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TradingJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("tj_trades");
    if (saved) setTrades(JSON.parse(saved));
  }, []);

  // Save to localStorage whenever trades change
  useEffect(() => {
    localStorage.setItem("tj_trades", JSON.stringify(trades));
  }, [trades]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : null;
  const avgPnl = trades.length > 0 ? (totalPnl / trades.length).toFixed(2) : null;

  const pnlColor = (v: number) =>
    v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-zinc-300";

  const fmt = (v: number) =>
    (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);

  // ── Add Trade ──────────────────────────────────────────────────────────────
  function addTrade() {
    if (!form.pair.trim()) return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0) return showToast("Enter a valid lot size", "err");
    if (!form.entry || !form.exit) return showToast("Enter entry and exit prices", "err");

    let pnl: number;
    if (form.pnl !== "") {
      pnl = parseFloat(form.pnl);
    } else {
      const diff =
        direction === "BUY"
          ? parseFloat(form.exit) - parseFloat(form.entry)
          : parseFloat(form.entry) - parseFloat(form.exit);
      pnl = parseFloat((diff * parseFloat(form.lot) * 10000).toFixed(2));
    }

    const trade: Trade = {
      id: Date.now(),
      pair: form.pair.toUpperCase(),
      direction,
      lot: parseFloat(form.lot),
      date: form.date,
      entry: parseFloat(form.entry),
      exit: parseFloat(form.exit),
      sl: form.sl ? parseFloat(form.sl) : null,
      tp: form.tp ? parseFloat(form.tp) : null,
      pnl,
      notes: form.notes,
    };

    setTrades((prev) => [trade, ...prev]);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
    showToast(`${trade.pair} added — ${fmt(pnl)}`, "ok");
  }

  // ── Edit Trade ─────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setDirection(trade.direction);
    setForm({
      pair: trade.pair,
      lot: String(trade.lot),
      date: trade.date,
      entry: String(trade.entry),
      exit: String(trade.exit),
      sl: trade.sl ? String(trade.sl) : "",
      tp: trade.tp ? String(trade.tp) : "",
      pnl: "",
      notes: trade.notes,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveEdit() {
    if (!form.pair.trim()) return showToast("Enter a currency pair", "err");
    if (!form.lot || +form.lot <= 0) return showToast("Enter a valid lot size", "err");
    if (!form.entry || !form.exit) return showToast("Enter entry and exit prices", "err");

    let pnl: number;
    if (form.pnl !== "") {
      pnl = parseFloat(form.pnl);
    } else {
      const diff =
        direction === "BUY"
          ? parseFloat(form.exit) - parseFloat(form.entry)
          : parseFloat(form.entry) - parseFloat(form.exit);
      pnl = parseFloat((diff * parseFloat(form.lot) * 10000).toFixed(2));
    }

    setTrades((prev) =>
      prev.map((t) =>
        t.id === editingId
          ? {
              ...t,
              pair: form.pair.toUpperCase(),
              direction,
              lot: parseFloat(form.lot),
              date: form.date,
              entry: parseFloat(form.entry),
              exit: parseFloat(form.exit),
              sl: form.sl ? parseFloat(form.sl) : null,
              tp: form.tp ? parseFloat(form.tp) : null,
              pnl,
              notes: form.notes,
            }
          : t
      )
    );

    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
    showToast("Trade updated", "ok");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setDirection("BUY");
  }

  function deleteTrade(id: number) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) cancelEdit();
    showToast("Trade deleted", "err");
  }

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
  }

  const isEditing = editingId !== null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0f14] text-zinc-100 font-sans">

      {/* HEADER */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-7 h-16
                         bg-[#13161e] border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600
                          flex items-center justify-center text-sm font-bold text-white">
            TJ
          </div>
          <span className="font-semibold text-base tracking-tight">My Trading Journal</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1e29] border border-zinc-800
                        rounded-xl px-4 py-2">
          <span className="text-[11px] uppercase tracking-widest text-zinc-500">Total P&L</span>
          <span className={`font-mono text-lg font-semibold ${pnlColor(totalPnl)}`}>
            {fmt(totalPnl)}
          </span>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-7">

        {/* STAT CARDS */}
        <div className="grid grid-cols-4 gap-3.5 mb-7">
          {[
            {
              label: "Total P&L",
              value: fmt(totalPnl),
              cls: pnlColor(totalPnl),
              sub: `${trades.length} trade${trades.length !== 1 ? "s" : ""}`,
            },
            {
              label: "Win Rate",
              value: winRate ? `${winRate}%` : "—",
              cls: winRate
                ? pnlColor(parseFloat(winRate) - 50)
                : "text-zinc-400",
              sub: winRate ? `${wins}W / ${losses}L` : "No trades yet",
            },
            {
              label: "Total Trades",
              value: String(trades.length),
              cls: "text-zinc-100",
              sub: `${wins} wins · ${losses} losses`,
            },
            {
              label: "Avg P&L / Trade",
              value: avgPnl ? fmt(parseFloat(avgPnl)) : "—",
              cls: avgPnl ? pnlColor(parseFloat(avgPnl)) : "text-zinc-400",
              sub: "Per closed trade",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-[#13161e] border border-zinc-800 rounded-xl px-5 py-4
                         hover:border-zinc-700 transition-colors"
            >
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2">
                {card.label}
              </p>
              <p className={`font-mono text-2xl font-semibold ${card.cls}`}>
                {card.value}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* MAIN GRID */}
        <div className="grid gap-5" style={{ gridTemplateColumns: "380px 1fr" }}>

          {/* ── FORM PANEL ── */}
          <div className={`bg-[#13161e] border rounded-2xl p-6 transition-colors
                           ${isEditing ? "border-blue-500/50" : "border-zinc-800"}`}>

            {/* Form header */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-zinc-800">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                {isEditing ? "Edit Trade" : "New Trade"}
              </p>
              {isEditing && (
                <button
                  onClick={cancelEdit}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300
                             border border-zinc-700 rounded-lg px-2.5 py-1 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Pair */}
            <label className="block mb-4">
              <span className="label">Currency Pair</span>
              <input
                className="inp"
                placeholder="e.g. EURUSD"
                value={form.pair}
                onChange={(e) => setForm({ ...form, pair: e.target.value })}
              />
            </label>

            {/* Direction */}
            <div className="mb-4">
              <span className="label">Direction</span>
              <div className="flex gap-2 mt-1.5">
                {(["BUY", "SELL"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-2.5 rounded-lg font-mono text-xs font-semibold
                                tracking-widest border transition-all
                                ${direction === d
                        ? d === "BUY"
                          ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
                          : "bg-rose-500/15 border-rose-500 text-rose-400"
                        : "bg-[#1a1e29] border-zinc-700 text-zinc-500 hover:border-zinc-600"
                      }`}
                  >
                    {d === "BUY" ? "▲ " : "▼ "}
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Lot + Date */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Lot Size</span>
                <input
                  className="inp"
                  type="number"
                  step="0.01"
                  placeholder="0.10"
                  value={form.lot}
                  onChange={(e) => setForm({ ...form, lot: e.target.value })}
                />
              </label>
              <label>
                <span className="label">Date</span>
                <input
                  className="inp"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
            </div>

            {/* Entry + Exit */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Entry Price</span>
                <input
                  className="inp"
                  type="number"
                  step="0.00001"
                  placeholder="1.08500"
                  value={form.entry}
                  onChange={(e) => setForm({ ...form, entry: e.target.value })}
                />
              </label>
              <label>
                <span className="label">Exit Price</span>
                <input
                  className="inp"
                  type="number"
                  step="0.00001"
                  placeholder="1.09200"
                  value={form.exit}
                  onChange={(e) => setForm({ ...form, exit: e.target.value })}
                />
              </label>
            </div>

            {/* SL + TP */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label>
                <span className="label">Stop Loss</span>
                <input
                  className="inp"
                  type="number"
                  step="0.00001"
                  placeholder="1.08100"
                  value={form.sl}
                  onChange={(e) => setForm({ ...form, sl: e.target.value })}
                />
              </label>
              <label>
                <span className="label">Take Profit</span>
                <input
                  className="inp"
                  type="number"
                  step="0.00001"
                  placeholder="1.09500"
                  value={form.tp}
                  onChange={(e) => setForm({ ...form, tp: e.target.value })}
                />
              </label>
            </div>

            {/* Manual P&L */}
            <label className="block mb-4">
              <span className="label">P&L Override ($)</span>
              <input
                className="inp"
                type="number"
                step="0.01"
                placeholder="Override auto-calculation"
                value={form.pnl}
                onChange={(e) => setForm({ ...form, pnl: e.target.value })}
              />
            </label>

            {/* Notes */}
            <label className="block mb-5">
              <span className="label">Notes</span>
              <textarea
                className="inp resize-none h-16"
                placeholder="Setup, reason, lessons..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            {/* Submit / Save */}
            <button
              onClick={isEditing ? saveEdit : addTrade}
              className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm
                          tracking-wide transition-all active:scale-[0.98]
                          ${isEditing
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-blue-600 hover:bg-blue-500"
                }`}
            >
              {isEditing ? "💾 Save Changes" : "+ Add Trade"}
            </button>
          </div>

          {/* ── TABLE PANEL ── */}
          <div className="bg-[#13161e] border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                Trade History
              </p>
              <span className="font-mono text-xs text-zinc-500">
                {trades.length} trade{trades.length !== 1 ? "s" : ""}
              </span>
            </div>

            {trades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                <div className="w-12 h-12 rounded-xl bg-[#1a1e29] border border-zinc-800
                                flex items-center justify-center text-xl mb-4">
                  📋
                </div>
                <p className="font-semibold text-zinc-400 mb-1">No trades yet</p>
                <p className="text-sm">Add your first trade using the form</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Pair", "Dir", "Date", "Lot", "Entry", "Exit", "P&L", "Actions"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-[10px] uppercase tracking-widest text-zinc-600
                                       font-medium text-left pb-3 border-b border-zinc-800 px-2
                                       last:text-right"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr
                        key={t.id}
                        className={`group transition-colors
                                    ${editingId === t.id
                            ? "bg-blue-500/5 border-l-2 border-l-blue-500"
                            : "hover:bg-[#1a1e29]"
                          }`}
                      >
                        {/* Pair */}
                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <span className="font-mono text-xs font-semibold bg-zinc-800
                                           rounded-md px-2 py-1">
                            {t.pair}
                          </span>
                        </td>

                        {/* Direction */}
                        <td className="px-2 py-3 border-b border-zinc-800/60">
                          <span
                            className={`font-mono text-[10px] font-bold rounded px-2 py-1
                              ${t.direction === "BUY"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-rose-500/15 text-rose-400"
                              }`}
                          >
                            {t.direction}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-zinc-500">
                          {t.date}
                        </td>

                        {/* Lot */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">
                          {t.lot}
                        </td>

                        {/* Entry */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">
                          {t.entry.toFixed(5)}
                        </td>

                        {/* Exit */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 font-mono text-xs text-right">
                          {t.exit.toFixed(5)}
                        </td>

                        {/* P&L */}
                        <td
                          className={`px-2 py-3 border-b border-zinc-800/60 font-mono text-sm
                                      font-semibold text-right ${pnlColor(t.pnl)}`}
                        >
                          {fmt(t.pnl)}
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-3 border-b border-zinc-800/60 text-right">
                          <div className="flex items-center justify-end gap-1
                                          opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(t)}
                              className="text-zinc-500 hover:text-blue-400 border border-zinc-800
                                         hover:border-blue-500/50 rounded-md px-2 py-1 text-xs
                                         transition-all"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteTrade(t.id)}
                              className="text-zinc-600 hover:text-rose-400 border border-zinc-800
                                         hover:border-rose-500/50 rounded-md px-2 py-1 text-xs
                                         transition-all"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl border text-sm
                       bg-[#1a1e29] text-zinc-100 shadow-xl z-50
                       ${toast.type === "ok"
              ? "border-l-2 border-l-emerald-500 border-zinc-700"
              : "border-l-2 border-l-rose-500 border-zinc-700"
            }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

