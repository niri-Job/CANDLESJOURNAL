"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase";

interface TradeNoteModalProps {
  trade: { id: string; notes: string; screenshot_url?: string | null };
  userId: string;
  onClose: () => void;
  onSave: (notes: string, screenshotUrl: string | null) => void;
}

export function TradeNoteModal({ trade, userId, onClose, onSave }: TradeNoteModalProps) {
  const [notes, setNotes]               = useState(trade.notes || "");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(trade.screenshot_url ?? null);
  const [uploading, setUploading]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { setError("File too large — max 5 MB"); return; }
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/${trade.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("trade-screenshots")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
      setScreenshotUrl(data.publicUrl);
    } catch (e) {
      setError("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: saveErr } = await supabase
        .from("trades")
        .update({ notes, screenshot_url: screenshotUrl })
        .eq("id", trade.id)
        .eq("user_id", userId);
      if (saveErr) throw saveErr;
      setSaved(true);
      onSave(notes, screenshotUrl);
      setTimeout(() => { setSaved(false); onClose(); }, 700);
    } catch (e) {
      setError("Save failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-[var(--cj-surface)] border border-zinc-700 rounded-2xl p-6 w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold text-zinc-100">Trade Journal</p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was your setup? Entry reasoning, emotions, mistakes, lessons learned..."
            className="w-full h-32 bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-3
                       text-sm text-zinc-300 placeholder-zinc-700 resize-none
                       focus:outline-none focus:border-blue-500/60 transition-colors"
          />
        </div>

        {/* Screenshot */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Screenshot</label>
          {screenshotUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={screenshotUrl} alt="Trade screenshot" className="w-full max-h-48 object-cover" />
              <button
                onClick={() => setScreenshotUrl(null)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-zinc-300
                           hover:text-white flex items-center justify-center text-xs transition-colors"
              >✕</button>
            </div>
          ) : (
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              className="h-28 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-500
                         flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {uploading
                ? <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                : <><span className="text-2xl">📷</span><span className="text-xs text-zinc-600">Click or drag to upload (jpg / png / webp, max 5 MB)</span></>
              }
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
          />
        </div>

        {error && <p className="text-xs text-rose-400 mb-4">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || uploading}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm
                       font-semibold transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
          <button onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors ml-auto">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
