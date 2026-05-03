"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Strategy {
  id: string;
  user_id: string;
  name: string;
  asset_class: string | null;
  timeframe: string | null;
  session: string | null;
  description: string | null;
  entry_rules: string[] | null;
  exit_rules: string[] | null;
  sl_rules: string | null;
  tp_rules: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface StrategyForm {
  name: string;
  asset_class: string;
  timeframe: string;
  session: string;
  description: string;
  entry_rules: string;
  exit_rules: string;
  sl_rules: string;
  tp_rules: string;
  tags: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: StrategyForm = {
  name: "", asset_class: "Forex", timeframe: "1H",
  session: "London", description: "",
  entry_rules: "", exit_rules: "",
  sl_rules: "", tp_rules: "", tags: [],
};

const ASSET_CLASSES = ["Forex","Indices","Crypto","Synthetic","Commodities"];
const TIMEFRAMES    = ["1m","5m","15m","30m","1H","4H","1D"];
const SESSIONS      = ["London","New York","Asian","All"];
const TAG_OPTIONS   = ["Trend","Counter-trend","Breakout","Retest","SMC","ICT","Price Action","News"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelCls() {
  return "text-[11px] uppercase tracking-widest text-zinc-500 font-medium block mb-1.5";
}

function inputCls() {
  return "w-full bg-[var(--cj-raised)] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[var(--cj-gold-muted)] transition-colors";
}

function selectCls() {
  return inputCls() + " cursor-pointer";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Empty state SVG ───────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--cj-surface)] border border-zinc-800
                      flex items-center justify-center mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
             stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-400 mb-1.5">No strategies yet</p>
      <p className="text-xs text-zinc-600 mb-6 max-w-xs">
        Document your trading strategies to build a personal playbook you can review and refine over time.
      </p>
      <button
        onClick={onAdd}
        className="text-sm font-bold px-5 py-2.5 rounded-xl transition-all"
        style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
        Add Your First Strategy
      </button>
    </div>
  );
}

// ── Strategy Card ─────────────────────────────────────────────────────────────

function StrategyCard({
  s,
  onEdit,
  onDelete,
}: {
  s: Strategy;
  onEdit: (s: Strategy) => void;
  onDelete: (id: string) => void;
}) {
  const entryCount = s.entry_rules?.filter(r => r.trim()).length ?? 0;

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3">

      {/* Name */}
      <div>
        <p className="text-base font-bold text-zinc-100">{s.name}</p>
        {s.description && (
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed line-clamp-2">{s.description}</p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {s.asset_class && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                           bg-blue-500/10 border border-blue-500/20 text-blue-400">
            {s.asset_class}
          </span>
        )}
        {s.timeframe && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                           bg-zinc-800 border border-zinc-700 text-zinc-400">
            {s.timeframe}
          </span>
        )}
        {s.session && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                           bg-zinc-800 border border-zinc-700 text-zinc-400">
            {s.session}
          </span>
        )}
      </div>

      {/* Tags */}
      {s.tags && s.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.tags.map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full
                                       bg-[var(--cj-gold-glow)] border border-[var(--cj-gold)]/20
                                       text-[var(--cj-gold)]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-zinc-600">
        {entryCount > 0 && (
          <span>{entryCount} entry rule{entryCount !== 1 ? "s" : ""}</span>
        )}
        <span>Added {fmtDate(s.created_at)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
        <button
          onClick={() => onEdit(s)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700
                     text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors">
          Edit
        </button>
        <button
          onClick={() => onDelete(s.id)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-800
                     text-zinc-600 hover:text-rose-400 hover:border-rose-500/30 transition-colors">
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Strategy Form ─────────────────────────────────────────────────────────────

function StrategyFormPanel({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  saveError,
  isEditing,
}: {
  form: StrategyForm;
  setForm: React.Dispatch<React.SetStateAction<StrategyForm>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string | null;
  isEditing: boolean;
}) {
  function toggleTag(tag: string) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  }

  return (
    <div className="bg-[var(--cj-surface)] border border-zinc-800 rounded-2xl p-6 mb-5">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-5">
        {isEditing ? "Edit Strategy" : "New Strategy"}
      </p>

      <div className="space-y-4">

        {/* Name */}
        <div>
          <label className={labelCls()}>Strategy Name <span className="text-rose-500">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Break and Retest, SMC FVG Entry"
            className={inputCls()}
          />
        </div>

        {/* Asset class + timeframe + session */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls()}>Asset Class</label>
            <select value={form.asset_class} onChange={e => setForm(f => ({ ...f, asset_class: e.target.value }))}
                    className={selectCls()}>
              {ASSET_CLASSES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls()}>Timeframe</label>
            <select value={form.timeframe} onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))}
                    className={selectCls()}>
              {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls()}>Session</label>
            <select value={form.session} onChange={e => setForm(f => ({ ...f, session: e.target.value }))}
                    className={selectCls()}>
              {SESSIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={labelCls()}>Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Briefly describe this strategy — when to use it, market conditions, etc."
            className={inputCls() + " resize-none"}
          />
        </div>

        {/* Entry rules */}
        <div>
          <label className={labelCls()}>Entry Rules <span className="text-zinc-600 normal-case tracking-normal font-normal">(one rule per line)</span></label>
          <textarea
            value={form.entry_rules}
            onChange={e => setForm(f => ({ ...f, entry_rules: e.target.value }))}
            rows={4}
            placeholder={"Price must be above 200 EMA\nBreak and retest of key level\nConfirmation candle on entry TF"}
            className={inputCls() + " resize-none font-mono text-xs"}
          />
        </div>

        {/* Exit rules */}
        <div>
          <label className={labelCls()}>Exit Rules <span className="text-zinc-600 normal-case tracking-normal font-normal">(one rule per line)</span></label>
          <textarea
            value={form.exit_rules}
            onChange={e => setForm(f => ({ ...f, exit_rules: e.target.value }))}
            rows={3}
            placeholder={"Take partial at 1:2 RR\nTrail stop to breakeven after 1:1"}
            className={inputCls() + " resize-none font-mono text-xs"}
          />
        </div>

        {/* SL + TP rules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls()}>Stop Loss Rule</label>
            <input
              type="text"
              value={form.sl_rules}
              onChange={e => setForm(f => ({ ...f, sl_rules: e.target.value }))}
              placeholder="e.g. Below swing low + 5 pips"
              className={inputCls()}
            />
          </div>
          <div>
            <label className={labelCls()}>Take Profit Rule</label>
            <input
              type="text"
              value={form.tp_rules}
              onChange={e => setForm(f => ({ ...f, tp_rules: e.target.value }))}
              placeholder="e.g. Minimum 1:2 RR, next liquidity level"
              className={inputCls()}
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className={labelCls()}>Tags</label>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map(tag => {
              const active = form.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                    active
                      ? "text-[#0A0A0F] border-transparent"
                      : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  }`}
                  style={active ? { background: "linear-gradient(135deg,#F5C518,#C9A227)" } : undefined}>
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {saveError && (
          <div className="rounded-xl px-4 py-3 bg-rose-500/8 border border-rose-500/20">
            <p className="text-xs text-rose-400">{saveError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
            {saving && (
              <span className="w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? "Saving…" : isEditing ? "Update Strategy" : "Save Strategy"}
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm border border-zinc-700
                       text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlaybookPage() {
  const [user,        setUser]        = useState<User | null>(null);
  const [strategies,  setStrategies]  = useState<Strategy[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [form,        setForm]        = useState<StrategyForm>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUser(user);

      const { data } = await supabase
        .from("strategies")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) setStrategies(data as Strategy[]);
      setLoading(false);
    }
    init();
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(s: Strategy) {
    setEditingId(s.id);
    setForm({
      name:        s.name,
      asset_class: s.asset_class ?? "Forex",
      timeframe:   s.timeframe ?? "1H",
      session:     s.session ?? "London",
      description: s.description ?? "",
      entry_rules: (s.entry_rules ?? []).join("\n"),
      exit_rules:  (s.exit_rules ?? []).join("\n"),
      sl_rules:    s.sl_rules ?? "",
      tp_rules:    s.tp_rules ?? "",
      tags:        s.tags ?? [],
    });
    setSaveError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!user) return;
    if (!form.name.trim()) { setSaveError("Strategy name is required."); return; }
    setSaving(true);
    setSaveError(null);

    const payload = {
      user_id:     user.id,
      name:        form.name.trim(),
      asset_class: form.asset_class || null,
      timeframe:   form.timeframe || null,
      session:     form.session || null,
      description: form.description.trim() || null,
      entry_rules: form.entry_rules.split("\n").map(r => r.trim()).filter(Boolean),
      exit_rules:  form.exit_rules.split("\n").map(r => r.trim()).filter(Boolean),
      sl_rules:    form.sl_rules.trim() || null,
      tp_rules:    form.tp_rules.trim() || null,
      tags:        form.tags.length > 0 ? form.tags : null,
      updated_at:  new Date().toISOString(),
    };

    const supabase = createClient();

    if (editingId) {
      const { error } = await supabase
        .from("strategies")
        .update(payload)
        .eq("id", editingId)
        .eq("user_id", user.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }
      setStrategies(prev =>
        prev.map(s => s.id === editingId ? { ...s, ...payload, id: editingId, created_at: s.created_at } : s)
      );
    } else {
      const { data, error } = await supabase
        .from("strategies")
        .insert(payload)
        .select()
        .single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setStrategies(prev => [data as Strategy, ...prev]);
    }

    setSaving(false);
    cancelForm();
  }

  async function handleDelete(id: string) {
    if (!user) return;
    if (!confirm("Delete this strategy? This cannot be undone.")) return;
    const supabase = createClient();
    await supabase.from("strategies").delete().eq("id", id).eq("user_id", user.id);
    setStrategies(prev => prev.filter(s => s.id !== id));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cj-bg)] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cj-bg)] text-zinc-100 font-sans">
      <Sidebar user={user} onSignOut={handleSignOut} />

      <div className="md:ml-[240px] pt-14 md:pt-0">
        <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 sm:py-10">

          {/* ── Header ───────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Strategy Library</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                {strategies.length} {strategies.length === 1 ? "strategy" : "strategies"} documented
              </p>
            </div>
            {!showForm && (
              <button
                onClick={openAdd}
                className="text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg,#F5C518,#C9A227)", color: "#0A0A0F" }}>
                Add Strategy
              </button>
            )}
          </div>

          {/* ── Form (inline) ─────────────────────────────────────── */}
          {showForm && (
            <StrategyFormPanel
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancelForm}
              saving={saving}
              saveError={saveError}
              isEditing={!!editingId}
            />
          )}

          {/* ── Empty state ───────────────────────────────────────── */}
          {!showForm && strategies.length === 0 && (
            <EmptyState onAdd={openAdd} />
          )}

          {/* ── Cards grid ───────────────────────────────────────── */}
          {strategies.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strategies.map(s => (
                <StrategyCard key={s.id} s={s} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
