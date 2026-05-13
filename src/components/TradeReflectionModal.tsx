"use client";

import { useState, useEffect } from "react";

interface Trade {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  lot: number;
  date: string;
  entry: number;
  exit_price: number;
  sl: number | null;
  tp: number | null;
  pnl: number;
}

interface TradeReflectionModalProps {
  trade: Trade;
  onClose: () => void;
}

export function TradeReflectionModal({ trade, onClose }: TradeReflectionModalProps) {
  const [plan,          setPlan]          = useState("");
  const [whatHappened,  setWhatHappened]  = useState("");
  const [whatDifferent, setWhatDifferent] = useState("");
  const [aiFeedback,    setAiFeedback]    = useState<string | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load existing reflection on open
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/reflections?trade_id=${trade.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.reflection) {
          setPlan(data.reflection.plan ?? "");
          setWhatHappened(data.reflection.what_happened ?? "");
          setWhatDifferent(data.reflection.what_different ?? "");
          setAiFeedback(data.reflection.ai_feedback ?? null);
        }
      } catch {
        // not found or network error — start blank
      }
    }
    load();
  }, [trade.id]);

  async function getAiFeedback() {
    if (!plan.trim() || !whatHappened.trim() || !whatDifferent.trim()) {
      setError("Fill in all three fields to get AI coaching.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_id:       trade.id,
          trade_context:  trade,
          plan,
          what_happened:  whatHappened,
          what_different: whatDifferent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAiFeedback(data.ai_feedback);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveWithoutAI() {
    if (!plan.trim() && !whatHappened.trim() && !whatDifferent.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_id:       trade.id,
          trade_context:  trade,
          plan,
          what_happened:  whatHappened,
          what_different: whatDifferent,
          skip_ai:        true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const pnlPositive = trade.pnl >= 0;
  const rrRaw = trade.sl && trade.sl > 0
    ? Math.abs(trade.pnl) / (Math.abs(trade.entry - trade.sl) * trade.lot * 100)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="bg-[var(--cj-surface)] border border-zinc-700
                   rounded-t-2xl sm:rounded-2xl
                   w-full sm:max-w-xl
                   max-h-[95vh] sm:max-h-[92vh]
                   flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Trade Reflection</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Review this trade and get AI coaching</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Trade details */}
          <div className="bg-[var(--cj-raised)] rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-3">Trade Details</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
              {[
                { label: "Pair",      value: trade.pair },
                { label: "Direction", value: trade.direction,
                  cls: trade.direction === "BUY" ? "text-emerald-400" : "text-rose-400" },
                { label: "Date",      value: trade.date },
                { label: "Entry",     value: trade.entry.toFixed(5) },
                { label: "Exit",      value: trade.exit_price.toFixed(5) },
                { label: "P&L",       value: (trade.pnl >= 0 ? "+$" : "-$") + Math.abs(trade.pnl).toFixed(2),
                  cls: pnlPositive ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">{item.label}</p>
                  <p className={`font-mono text-xs ${item.cls ?? "text-zinc-300"}`}>{item.value}</p>
                </div>
              ))}
            </div>
            {rrRaw && (
              <p className="text-[10px] text-zinc-600 text-center mt-3">
                Est. R:R — {rrRaw.toFixed(2)}
              </p>
            )}
          </div>

          {/* Question 1 */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
              What was your plan for this trade?
            </label>
            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={3}
              placeholder="Describe your setup, entry rationale, SL/TP targets, and what you expected to happen..."
              className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-3
                         text-sm text-zinc-300 placeholder-zinc-700 resize-none
                         focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* Question 2 */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
              What actually happened?
            </label>
            <textarea
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              rows={3}
              placeholder="Describe what the market did, how you managed the trade, and what led to the outcome..."
              className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-3
                         text-sm text-zinc-300 placeholder-zinc-700 resize-none
                         focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* Question 3 */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
              What would you do differently?
            </label>
            <textarea
              value={whatDifferent}
              onChange={(e) => setWhatDifferent(e.target.value)}
              rows={3}
              placeholder="If you could replay this trade, what would you change about your entry, management, or exit?"
              className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-3
                         text-sm text-zinc-300 placeholder-zinc-700 resize-none
                         focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* AI feedback */}
          {aiFeedback && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-blue-400/70 font-medium mb-3">
                AI Coaching Feedback
              </p>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {aiFeedback}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex flex-col gap-2 px-6 py-4 border-t border-zinc-800 bg-[var(--cj-surface)]">
          <button
            type="button"
            onClick={getAiFeedback}
            disabled={loading || saving}
            className="btn-gold w-full py-2.5 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Getting AI Coaching...
              </span>
            ) : saved && aiFeedback ? "Saved ✓" : aiFeedback ? "Refresh AI Feedback" : "Get AI Coaching"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveWithoutAI}
              disabled={loading || saving}
              className="flex-1 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200
                         bg-[var(--cj-raised)] border border-zinc-700 hover:border-zinc-600
                         transition-all disabled:opacity-40"
            >
              {saving ? "Saving..." : saved && !aiFeedback ? "Saved ✓" : "Save Without AI"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
