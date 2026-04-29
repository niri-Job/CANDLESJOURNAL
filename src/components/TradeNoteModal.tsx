"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";

interface TradeNoteModalProps {
  trade: {
    id: string;
    notes: string;
    screenshot_url?: string | null;
    emotion?: string | null;
  };
  userId: string;
  onClose: () => void;
  onSave: (notes: string, screenshotUrl: string | null, emotion: string | null) => void;
}

const EMOTIONS = [
  { key: "revenge",   emoji: "😤", label: "Revenge"    },
  { key: "fear",      emoji: "😰", label: "Fear"       },
  { key: "greedy",    emoji: "🤑", label: "Greedy"     },
  { key: "confident", emoji: "😎", label: "Confident"  },
  { key: "bored",     emoji: "😴", label: "Bored"      },
  { key: "news",      emoji: "📰", label: "News-based" },
];

const MAX_CHARS = 500;

export function TradeNoteModal({ trade, userId, onClose, onSave }: TradeNoteModalProps) {
  const [notes,         setNotes]         = useState(trade.notes || "");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(trade.screenshot_url ?? null);
  const [emotion,       setEmotion]       = useState<string | null>(trade.emotion ?? null);
  const [uploading,     setUploading]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [dragging,      setDragging]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Issue 1: Lock body scroll so the page doesn't jump when modal opens or textarea is focused
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { setError("File too large — max 5 MB"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, and WEBP are supported");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext  = file.name.split(".").pop()?.toLowerCase() || "png";
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();

      // Issue 3: Use .select().single() so we get back exactly what landed in the DB.
      // If the emotion column doesn't exist, this will throw a clear error rather than silently dropping the field.
      const { data: saved, error: saveErr } = await supabase
        .from("trades")
        .update({ notes, screenshot_url: screenshotUrl, emotion })
        .eq("id", trade.id)
        .eq("user_id", userId)
        .select("notes, screenshot_url, emotion")
        .single();

      if (saveErr) {
        console.error("[TradeNoteModal] save error:", saveErr);
        throw saveErr;
      }

      console.log("[TradeNoteModal] saved row:", saved);

      // Use confirmed DB values — not local state — so the table always reflects what was persisted
      const savedNotes  = (saved as { notes: string; screenshot_url: string | null; emotion: string | null }).notes;
      const savedScreen = (saved as { notes: string; screenshot_url: string | null; emotion: string | null }).screenshot_url;
      const savedEmotion = (saved as { notes: string; screenshot_url: string | null; emotion: string | null }).emotion;

      setSaved(true);
      onSave(savedNotes, savedScreen, savedEmotion);
      setTimeout(() => { setSaved(false); onClose(); }, 700);
    } catch (e) {
      setError("Save failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  const overLimit = notes.length > MAX_CHARS;

  return (
    // Issue 1: overlay is position:fixed so page scroll position is not affected
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75"
      onClick={onClose}
    >
      {/*
        Issue 2: flex column — header and footer are shrink-0 (sticky),
        the middle section scrolls. On mobile: slides up from bottom,
        max 95vh. On sm+: centred, max 90vh.
      */}
      <div
        className="bg-[var(--cj-surface)] border border-zinc-700
                   rounded-t-2xl sm:rounded-2xl
                   w-full sm:max-w-lg
                   max-h-[95vh] sm:max-h-[90vh]
                   flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Sticky header ── */}
        <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
          <p className="text-sm font-semibold text-zinc-100">Trade Journal Entry</p>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Section 1: Emotion (top — always visible on open) */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-3">
              How were you feeling?
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map(({ key, emoji, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEmotion(emotion === key ? null : key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs
                               font-medium transition-all
                               ${emotion === key
                                 ? "bg-blue-500/15 border-blue-500/60 text-blue-300"
                                 : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                               }`}
                >
                  <span className="text-base leading-none">{emoji}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                Your Notes
              </label>
              <span className={`text-[10px] font-mono ${overLimit ? "text-rose-400" : "text-zinc-600"}`}>
                {notes.length}/{MAX_CHARS}
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What was your plan? How did you feel? What would you do differently?"
              className="w-full bg-[var(--cj-raised)] border border-zinc-700 rounded-xl px-4 py-3
                         text-sm text-zinc-300 placeholder-zinc-700 resize-none
                         focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* Section 3: Screenshot */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
              Trade Screenshot
            </label>

            {screenshotUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshotUrl}
                  alt="Trade screenshot"
                  className="w-full max-h-52 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setScreenshotUrl(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70
                             text-zinc-300 hover:text-white hover:bg-black/90
                             flex items-center justify-center text-xs transition-all"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => !uploading && fileRef.current?.click()}
                className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center
                            gap-3 cursor-pointer transition-all py-8
                            ${dragging
                              ? "border-blue-500 bg-blue-500/5"
                              : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/20"
                            }`}
              >
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-4xl">📷</span>
                    <div className="text-center">
                      <p className="text-sm text-zinc-400 font-medium">
                        Drop your chart screenshot here or click to upload
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">JPG, PNG, WEBP — max 5 MB</p>
                    </div>
                  </>
                )}
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

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-t border-zinc-800 bg-[var(--cj-surface)]">
          <button
            type="button"
            onClick={save}
            disabled={saving || uploading}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm
                       font-semibold transition-all disabled:opacity-50"
          >
            {saved ? "Saved ✓" : saving ? "Saving..." : "Save Journal Entry"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
