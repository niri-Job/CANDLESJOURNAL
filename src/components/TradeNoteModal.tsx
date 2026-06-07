"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";

interface TradeNoteModalProps {
  trade: {
    id: string;
    notes: string;
    screenshot_url?: string | null;
    emotion?: string | null;
    entry_emotion?: string | null;
    exit_emotion?: string | null;
  };
  userId: string;
  onClose: () => void;
  onSave: (
    notes: string,
    screenshotUrl: string | null,
    emotion: string | null,
    entryEmotion: string | null,
    exitEmotion: string | null,
  ) => void;
}

const EMOTIONS = [
  { key: "confident", emoji: "😎", label: "Confident"  },
  { key: "fear",      emoji: "😰", label: "Fearful"    },
  { key: "greedy",    emoji: "🤑", label: "Greedy"     },
  { key: "revenge",   emoji: "😤", label: "Revenge"    },
  { key: "bored",     emoji: "😴", label: "Bored"      },
  { key: "neutral",   emoji: "😐", label: "Neutral"    },
  { key: "news",      emoji: "📰", label: "News-based" },
];

const MAX_CHARS = 500;

function EmotionPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-3">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {EMOTIONS.map(({ key, emoji, label: eLabel }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(value === key ? null : key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all
              ${value === key
                ? "bg-blue-500/15 border-blue-500/60 text-blue-300"
                : "bg-[var(--cj-raised)] border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
          >
            <span className="text-base leading-none">{emoji}</span>
            <span>{eLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TradeNoteModal({ trade, userId, onClose, onSave }: TradeNoteModalProps) {
  const [notes,         setNotes]         = useState(trade.notes || "");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(trade.screenshot_url ?? null);
  // entry_emotion falls back to legacy emotion field for backwards compat
  const [entryEmotion, setEntryEmotion]   = useState<string | null>(trade.entry_emotion ?? trade.emotion ?? null);
  const [exitEmotion,  setExitEmotion]    = useState<string | null>(trade.exit_emotion  ?? null);
  const [uploading,    setUploading]      = useState(false);
  const [saving,       setSaving]         = useState(false);
  const [saved,        setSaved]          = useState(false);
  const [error,        setError]          = useState<string | null>(null);
  const [dragging,     setDragging]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      const { data: savedRow, error: saveErr } = await supabase
        .from("trades")
        .update({
          notes,
          screenshot_url: screenshotUrl,
          emotion:        entryEmotion,   // keep legacy field in sync
          entry_emotion:  entryEmotion,
          exit_emotion:   exitEmotion,
        })
        .eq("id", trade.id)
        .eq("user_id", userId)
        .select("notes, screenshot_url, emotion, entry_emotion, exit_emotion")
        .single();

      if (saveErr) throw saveErr;

      const r = savedRow as {
        notes: string;
        screenshot_url: string | null;
        emotion: string | null;
        entry_emotion: string | null;
        exit_emotion: string | null;
      };

      setSaved(true);
      onSave(r.notes, r.screenshot_url, r.emotion, r.entry_emotion, r.exit_emotion);
      setTimeout(() => { setSaved(false); onClose(); }, 700);
    } catch (e) {
      setError("Save failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  const overLimit = notes.length > MAX_CHARS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75"
      onClick={onClose}
    >
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

          {/* Entry emotion */}
          <EmotionPicker
            label="How did you feel entering this trade?"
            value={entryEmotion}
            onChange={setEntryEmotion}
          />

          {/* Exit emotion */}
          <EmotionPicker
            label="How did you feel exiting this trade?"
            value={exitEmotion}
            onChange={setExitEmotion}
          />

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                Your Notes
              </label>
              <span className={`text-[10px] font-sans ${overLimit ? "text-rose-400" : "text-zinc-600"}`}>
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

          {/* Screenshot */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">
              Trade Screenshot
            </label>

            {screenshotUrl ? (
              <div className="relative rounded-xl overflow-hidden"
                   style={{ border: "1px solid var(--cj-border)" }}>
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
                              ? "border-[var(--cj-gold)] bg-[var(--cj-gold-glow)]"
                              : "border-[var(--cj-gold-muted)] hover:border-[var(--cj-gold)] hover:bg-[var(--cj-gold-glow)]"
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
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 bg-[var(--cj-surface)]"
             style={{ borderTop: "1px solid var(--cj-border)" }}>
          <button
            type="button"
            onClick={save}
            disabled={saving || uploading}
            className="btn-gold flex-1 py-2.5 rounded-xl text-sm transition-all"
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
