"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNiriBehaviour } from "@/hooks/useNiriBehaviour";
import type { TradeForNiri, NiriAlert } from "@/hooks/useNiriBehaviour";

export type { TradeForNiri };

// ── Constants ─────────────────────────────────────────────────────────────────
const ORB_SIZE = 64;
const BUBBLE_W = 260;
const BUBBLE_L = -(BUBBLE_W / 2) + ORB_SIZE / 2;

const PERSONALITY_QUIPS = [
  "Just checking in. The market will always be there. Are YOU okay?",
  "Still watching. Still in your corner — no matter what today throws at you.",
  "Before you open that next trade, ask yourself: is this your setup, or are you just bored?",
  "Most traders quit before they figure themselves out. You're still here. That means something.",
  "Your best trade today hasn't happened yet. Are you ready for it?",
  "The discipline you build today compounds into the trader you become. Trust it.",
  "Take a breath. Seriously — right now. The chart will wait. Your clarity won't.",
  "Losses are tuition fees. The question is: are you actually learning from the lesson?",
];

type EyeMode = "normal" | "concerned" | "wide";

// ── Helpers ───────────────────────────────────────────────────────────────────
// Uses the browser's local time (not UTC, not server time) — getHours() already
// resolves to the user's own timezone, so no conversion is needed.
function timeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  return "Good night";
}

// Small idle wobble — a few px from the pinned corner, never roams over content
function smallDrift() {
  const r = 14;
  return { x: (Math.random() * 2 - 1) * r, y: (Math.random() * 2 - 1) * r };
}

// ── Arrow ─────────────────────────────────────────────────────────────────────
function Arrow({ gold }: { gold?: boolean }) {
  return (
    <div style={{
      position:    "absolute",
      bottom:      -6,
      left:        BUBBLE_W - ORB_SIZE / 2 - 6,
      width:       12,
      height:      12,
      background:  "#0f0f11",
      border:      `1px solid ${gold ? "rgba(245,158,11,0.35)" : "rgba(124,58,237,0.35)"}`,
      borderTop:   "none",
      borderLeft:  "none",
      transform:   "rotate(45deg)",
    }} />
  );
}

// ── Restore button (shown when orb is minimised) ──────────────────────────────
function RestoreButton({ onRestore }: { onRestore: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999 }}>
      <button
        onClick={onRestore}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Bring NIRI back"
        style={{
          width:        32,
          height:       32,
          borderRadius: "50%",
          background:   "linear-gradient(135deg, #F59E0B 0%, #7C3AED 100%)",
          border:       "none",
          cursor:       "pointer",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          boxShadow:    hovered
            ? "0 0 16px rgba(245,158,11,0.7), 0 0 32px rgba(124,58,237,0.4)"
            : "0 0 8px rgba(245,158,11,0.3), 0 0 16px rgba(124,58,237,0.15)",
          fontSize:     6.5,
          fontWeight:   900,
          color:        "#fff",
          letterSpacing: "0.08em",
          opacity:      hovered ? 1 : 0.55,
          transform:    hovered ? "scale(1.18)" : "scale(1)",
          transition:   "opacity 0.2s, transform 0.2s, box-shadow 0.2s",
          padding:      0,
        }}
      >
        NIRI
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props { trades?: TradeForNiri[]; }

export default function NiriOrb({ trades = [] }: Props) {
  const [hidden,      setHidden]      = useState(true);
  const [pos,         setPos]         = useState({ x: 500, y: 300 });
  const [driftDur,    setDriftDur]    = useState(3);
  const [eyeMode,     setEyeMode]     = useState<EyeMode>("normal");
  const [isBlinking,  setIsBlinking]  = useState(false);
  const [alert,       setAlert]       = useState<NiriAlert | null>(null);
  const [alertKind,   setAlertKind]   = useState<"normal" | "ai">("normal");
  const [showPanel,   setShowPanel]   = useState(false);
  const [inMsg,       setInMsg]       = useState(false);
  const [isAttention, setIsAttention] = useState(false);

  // ── Ask NIRI state ─────────────────────────────────────────────────────────
  const [askOpen,     setAskOpen]     = useState(false);
  const [askInput,    setAskInput]    = useState("");
  const [askThinking, setAskThinking] = useState(false);
  const [askUsed,     setAskUsed]     = useState(0);
  const askLimit = 10;

  const inMsgRef      = useRef(false);
  const msgTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAction    = useRef(Date.now());
  const askOpenRef    = useRef(false);
  const alertQueue    = useRef<{ a: NiriAlert; eye: EyeMode; dur: number }[]>([]);
  const askInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => { inMsgRef.current = inMsg; }, [inMsg]);
  useEffect(() => { askOpenRef.current = askOpen; }, [askOpen]);

  // ── Init: position then reveal (no localStorage permanent-hide) ──────────────
  useEffect(() => {
    setPos(smallDrift());
    setHidden(false);
  }, []);

  // ── Core: show alert ─────────────────────────────────────────────────────────
  const showAlert = useCallback((a: NiriAlert, eye: EyeMode, durationMs: number) => {
    if (askOpenRef.current) {
      alertQueue.current.push({ a, eye, dur: durationMs });
      return;
    }
    console.log("[NIRI] showAlert firing:", a.type, "—", a.message.slice(0, 60));
    setAlert(a);
    setAlertKind(a.kind ?? "normal");
    setEyeMode(eye);
    setIsAttention(true);
    setInMsg(true);
    inMsgRef.current = true;
    setShowPanel(false);
    setTimeout(() => setIsAttention(false), 700);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => {
      setAlert(null);
      setEyeMode("normal");
      setInMsg(false);
      inMsgRef.current = false;
    }, durationMs);
  }, []);

  // ── Test event ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    const handler = () => {
      console.log("[NIRI] test event received");
      showAlert({ type: "test", message: "NIRI is online and watching. If you can see this, everything is working perfectly." }, "wide", 8000);
    };
    window.addEventListener("niri:test", handler);
    return () => window.removeEventListener("niri:test", handler);
  }, [hidden, showAlert]);

  // ── Page-navigation message ──────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (msg) showAlert({ type: "page_nav", message: msg }, "normal", 8000);
    };
    window.addEventListener("niri:page-message", handler);
    return () => window.removeEventListener("niri:page-message", handler);
  }, [hidden, showAlert]);

  // ── AI insight ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (msg) showAlert({ type: "ai_insight", message: msg, kind: "ai" }, "wide", 12000);
    };
    window.addEventListener("niri:ai-insight", handler);
    return () => window.removeEventListener("niri:ai-insight", handler);
  }, [hidden, showAlert]);

  // ── Onboarding step guide ─────────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    const ONBOARDING_MSGS: Record<string, string> = {
      "1":        "Hey — I'm NIRI, and I live inside this app. I'm not just a widget. I watch how you trade, how you feel, and I'll tell you when I'm worried about you. Let's get you set up.",
      "2":        "Your MT5 login and broker — these are how I'll know which account to watch. Don't worry, I'm not here to judge the numbers. I'm here to help you understand them.",
      "3":        "Now I need your history. Export your trade file from MT5 and drop it here. The more context I have, the better I can read your patterns — and help you see yourself clearly.",
      "complete": "Setup done. This is where the real journey starts. I'll be watching — not to criticize, but because I genuinely want to see you grow. Let's do this.",
    };
    const handler = (e: Event) => {
      const step = String((e as CustomEvent<{ step: number | string }>).detail?.step);
      const msg  = ONBOARDING_MSGS[step];
      if (msg) showAlert({ type: `onboarding_${step}`, message: msg }, step === "complete" ? "wide" : "normal", 9000);
    };
    window.addEventListener("niri:onboarding", handler);
    return () => window.removeEventListener("niri:onboarding", handler);
  }, [hidden, showAlert]);

  // ── Behaviour hook callback ──────────────────────────────────────────────────
  const handleAlert = useCallback((a: NiriAlert) => {
    const bad  = ["revenge_trading","overtrading","ignoring_sl","greed"].includes(a.type);
    const good = ["win_streak","best_trade","first_green_day"].includes(a.type);
    showAlert(a, bad ? "concerned" : good ? "wide" : "normal", 11000);
  }, [showAlert]);

  useNiriBehaviour(trades, handleAlert);

  // ── Drift ────────────────────────────────────────────────────────────────────
  const drift = useCallback(() => {
    if (inMsgRef.current) return;
    const roll = Math.random();
    const dur = roll < 0.15 ? 5 : roll < 0.85 ? 3 : 1.5;
    setDriftDur(dur);
    setPos(smallDrift());
  }, []);

  useEffect(() => {
    if (hidden) return;
    function schedule() {
      const delay = (15 + Math.random() * 15) * 1000;
      driftTimerRef.current = setTimeout(() => {
        if (!inMsgRef.current) drift();
        schedule();
      }, delay);
    }
    schedule();
    return () => { if (driftTimerRef.current) clearTimeout(driftTimerRef.current); };
  }, [drift, hidden]);

  // ── Blink ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    let t: ReturnType<typeof setTimeout>;
    function blink() {
      t = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => { setIsBlinking(false); blink(); }, 130);
      }, (4 + Math.random() * 4) * 1000);
    }
    blink();
    return () => clearTimeout(t);
  }, [hidden]);

  // ── Daily check-in (3 s after dashboard load) ────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    console.log("[NIRI] daily check-in scheduled");
    const t = setTimeout(() => {
      console.log("[NIRI] daily check-in executing");
      showAlert({
        type:    "daily_checkin",
        message: `${timeGreeting()}. Before the charts, before the news — how are you feeling today? Your mindset is your edge, and I want to make sure it's sharp.`,
      }, "normal", 8000);
    }, 3000);
    return () => clearTimeout(t);
  }, [hidden, showAlert]);

  // ── Personality quips (every 5–10 min) ───────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    let t: ReturnType<typeof setTimeout>;
    function scheduleQuip() {
      t = setTimeout(() => {
        if (!inMsgRef.current) {
          const msg = PERSONALITY_QUIPS[Math.floor(Math.random() * PERSONALITY_QUIPS.length)];
          showAlert({ type: "personality", message: msg }, "normal", 9000);
        }
        scheduleQuip();
      }, (5 + Math.random() * 5) * 60 * 1000);
    }
    scheduleQuip();
    return () => clearTimeout(t);
  }, [hidden, showAlert]);

  // ── 5-min inactivity check-in ────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    const update = () => { lastAction.current = Date.now(); };
    window.addEventListener("mousemove", update, { passive: true });
    window.addEventListener("keydown",   update, { passive: true });
    window.addEventListener("click",     update, { passive: true });

    const interval = setInterval(() => {
      if (inMsgRef.current) return;
      if (Date.now() - lastAction.current > 5 * 60 * 1000) {
        lastAction.current = Date.now();
        showAlert({
          type:    "inactivity",
          message: "Hey. I noticed you've gone quiet. That's okay — sometimes stepping back IS the smartest trade you can make. Just don't stay away too long.",
        }, "normal", 9000);
      }
    }, 30_000);

    return () => {
      window.removeEventListener("mousemove", update);
      window.removeEventListener("keydown",   update);
      window.removeEventListener("click",     update);
      clearInterval(interval);
    };
  }, [hidden, showAlert]);

  // ── Ask: close on outside click ──────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!askOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-niri-orb]")) closeAsk(true);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [askOpen]);

  // ── Ask: auto-focus input ─────────────────────────────────────────────────
  useEffect(() => {
    if (askOpen) setTimeout(() => askInputRef.current?.focus(), 80);
  }, [askOpen]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  function dismiss() {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setAlert(null);
    setAlertKind("normal");
    setEyeMode("normal");
    setInMsg(false);
    inMsgRef.current = false;
  }

  function closeAsk(drainQueue = true) {
    setAskOpen(false);
    setAskInput("");
    askOpenRef.current = false;
    if (drainQueue) {
      const queued = alertQueue.current.shift();
      if (queued) setTimeout(() => showAlert(queued.a, queued.eye, queued.dur), 300);
    } else {
      alertQueue.current = [];
    }
  }

  async function handleAsk() {
    const q = askInput.trim();
    if (!q || askThinking) return;
    setAskInput("");
    setAskThinking(true);
    try {
      const res  = await fetch("/api/niri/ask", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: q }),
      });
      const data = await res.json() as { answer?: string; error?: string; questions_used?: number };
      if (data.questions_used !== undefined) setAskUsed(data.questions_used);
      const msg = res.ok
        ? (data.answer  ?? "I couldn't formulate a response. Try asking differently.")
        : (data.error   ?? "I'm having trouble connecting right now. Try again in a moment.");
      closeAsk(false);
      showAlert({ type: "ask_answer", message: msg, kind: "ai" }, "wide", 15000);
    } catch {
      closeAsk(false);
      showAlert({ type: "ask_answer", message: "I'm having trouble connecting right now. Try again in a moment.", kind: "ai" }, "normal", 6000);
    } finally {
      setAskThinking(false);
    }
  }

  function minimizeOrb() {
    dismiss();
    setShowPanel(false);
    setHidden(true);
  }

  function restoreOrb() {
    setPos(smallDrift());
    setHidden(false);
  }

  // ── Today stats ──────────────────────────────────────────────────────────────
  const today    = new Date().toISOString().slice(0, 10);
  const todayTs  = trades.filter((t) => t.date === today);
  const todayPnl = todayTs.reduce((s, t) => s + t.pnl, 0);
  const todayWins= todayTs.filter((t) => t.pnl > 0).length;

  // ── Minimised state: show restore button ──────────────────────────────────────
  if (hidden) return <RestoreButton onRestore={restoreOrb} />;

  // ── Eye config by mode ───────────────────────────────────────────────────────
  const eyeCfg = {
    normal:    { w: 5,   h: 5,   glow: "rgba(255,255,255,0.6)", gap: 5 },
    concerned: { w: 5,   h: 2.5, glow: "rgba(251,191,36,0.7)", gap: 4 },
    wide:      { w: 7,   h: 7,   glow: "rgba(167,243,208,0.8)", gap: 6 },
  }[eyeMode];
  const eyeH = isBlinking ? 0.3 : eyeCfg.h;

  const isBadAlert   = alert && ["revenge_trading","overtrading","ignoring_sl","greed"].includes(alert.type);
  const bubbleBorder = isBadAlert ? "rgba(251,191,36,0.45)" : "rgba(124,58,237,0.45)";

  return (
    <motion.div
      data-niri-orb=""
      style={{ position: "fixed", bottom: 96, right: 24, zIndex: 9999, width: ORB_SIZE, height: ORB_SIZE }}
      animate={{
        x: pos.x,
        y: pos.y,
        scale: isAttention
          ? [1, 1.4, 0.88, 1.22, 1.0]
          : inMsg ? 1.15 : 1,
      }}
      transition={{
        x: { duration: driftDur, ease: "easeInOut" },
        y: { duration: driftDur, ease: "easeInOut" },
        scale: isAttention
          ? { duration: 0.65, ease: "easeOut", times: [0, 0.25, 0.5, 0.75, 1] }
          : { duration: 0.35, ease: "easeOut" },
      }}
    >
      {/* ── Bob wrapper — continuous gentle float ── */}
      <motion.div
        style={{ position: "relative", width: "100%", height: "100%" }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* ── Magnifying glass ── */}
        {!alert && !askOpen && !inMsg && (
          <motion.div
            style={{ position: "absolute", top: -28, left: ORB_SIZE / 2 - 8, cursor: "pointer", zIndex: 6 }}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            onClick={(e) => { e.stopPropagation(); setAskOpen(true); lastAction.current = Date.now(); }}
            title="Ask NIRI"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.65)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </motion.div>
        )}

        {/* ── Pulse wrapper ── */}
        <motion.div
          style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}
          animate={{ scale: askThinking ? [1, 1.18, 1] : [1, 1.06, 1] }}
          transition={{ duration: askThinking ? 0.5 : 3, repeat: Infinity, ease: "easeInOut" }}
          onClick={() => {
            lastAction.current = Date.now();
            if (alert) return;
            if (showPanel) setShowPanel(false);
            setAskOpen((v) => !v);
          }}
        >
          {/* Gold aura pulse */}
          <motion.div
            style={{
              position: "absolute", inset: -6, borderRadius: "50%",
              background: "transparent",
              boxShadow: "0 0 28px rgba(245,158,11,0.7), 0 0 56px rgba(245,158,11,0.3)",
              pointerEvents: "none",
            }}
            animate={{ opacity: isAttention ? [0.6, 1, 0.6] : [0.35, 0.85, 0.35] }}
            transition={{ duration: isAttention ? 0.4 : 2.5, repeat: isAttention ? 3 : Infinity, ease: "easeInOut" }}
          />
          {/* Outer gold-tint ring */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(245,158,11,0.08)",
            boxShadow: "0 0 14px rgba(245,158,11,0.5), 0 0 28px rgba(245,158,11,0.2), inset 0 0 12px rgba(124,58,237,0.2)",
          }} />
          {/* Middle purple ring */}
          <div style={{
            position: "absolute", inset: 8, borderRadius: "50%",
            background: "rgba(168,85,247,0.35)",
          }} />
          {/* Inner core */}
          <div style={{
            position: "absolute", inset: 16, borderRadius: "50%",
            background: "linear-gradient(140deg, #8B5CF6 0%, #7C3AED 55%, #5B21B6 100%)",
            display:   "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "inset 0 2px 5px rgba(255,255,255,0.18), inset 0 -2px 5px rgba(0,0,0,0.35)",
          }}>
            {/* Eyes */}
            <div style={{ display: "flex", gap: eyeCfg.gap, alignItems: "center" }}>
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: eyeH / eyeCfg.h }}
                  transition={{ duration: 0.09, ease: "easeIn" }}
                  style={{
                    width: eyeCfg.w, height: eyeCfg.h, borderRadius: eyeCfg.h / 2,
                    background: "rgba(255,255,255,0.95)",
                    boxShadow: `0 0 4px ${eyeCfg.glow}`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Minimize × */}
          <button
            onClick={(e) => { e.stopPropagation(); minimizeOrb(); }}
            style={{
              position: "absolute", top: -3, right: -3,
              width: 16, height: 16, borderRadius: "50%",
              background: "#111113", border: "1px solid #3f3f46",
              color: "#71717a", fontSize: 9, fontWeight: 700,
              cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              lineHeight: 1, zIndex: 4, padding: 0,
            }}
          >×</button>
        </motion.div>
      </motion.div>

      {/* ── Ask NIRI input bar ── */}
      <AnimatePresence>
        {askOpen && (
          <motion.div
            key="ask-bar"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position:     "absolute",
              bottom:       ORB_SIZE + 10,
              right:        0,
              width:        BUBBLE_W,
              background:   "#0f0f11",
              border:       "1px solid rgba(124,58,237,0.4)",
              borderRadius: 14,
              padding:      "9px 12px 8px",
              boxShadow:    "0 16px 40px rgba(0,0,0,0.6)",
              zIndex:       5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={askInputRef}
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && askInput.trim() && !askThinking) { void handleAsk(); }
                  if (e.key === "Escape") { closeAsk(true); }
                  e.stopPropagation();
                }}
                placeholder="Ask me about your trading..."
                disabled={askThinking}
                style={{
                  flex:       1,
                  background: "none",
                  border:     "none",
                  outline:    "none",
                  color:      "#e4e4e7",
                  fontSize:   12,
                  minWidth:   0,
                }}
              />
              {askThinking && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  style={{
                    width:        13,
                    height:       13,
                    borderRadius: "50%",
                    border:       "2px solid rgba(124,58,237,0.3)",
                    borderTopColor: "#A78BFA",
                    flexShrink:   0,
                  }}
                />
              )}
            </div>
            <p style={{ fontSize: 10, color: "#3f3f46", marginTop: 6, marginBottom: 0, textAlign: "right" }}>
              {askUsed}/{askLimit} today
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Speech bubble ── */}
      <AnimatePresence>
        {alert && (
          <motion.div
            key="bubble"
            initial={{ opacity: 0, scale: 0.84, y: 10 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.84, y: 10 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position:      "absolute",
              bottom:        ORB_SIZE + 12,
              right:         0,
              width:         BUBBLE_W,
              background:    "#0f0f11",
              border:        `1px solid ${bubbleBorder}`,
              borderRadius:  16,
              padding:       "11px 14px 14px",
              boxShadow:     `0 20px 48px rgba(0,0,0,0.6), 0 0 0 1px ${isBadAlert ? "rgba(251,191,36,0.08)" : "rgba(124,58,237,0.08)"}`,
              zIndex:        5,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: alertKind === "ai" ? "#34d399" : isBadAlert ? "#FBBF24" : "#A78BFA",
              }}>
                {alertKind === "ai" ? "✦ AI Insight" : "NIRI"}
              </span>
              <button onClick={dismiss} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>
            <p style={{
              fontSize:   12.5,
              color:      "#e4e4e7",
              lineHeight: 1.65,
              margin:     0,
              maxHeight:  alertKind === "ai" ? 180 : undefined,
              overflowY:  alertKind === "ai" ? "auto"  : undefined,
            }}>
              {alert.message}
            </p>
            <Arrow gold={!!isBadAlert} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Idle summary panel ── */}
      <AnimatePresence>
        {showPanel && !alert && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.84, y: 10 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.84, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position:      "absolute",
              bottom:        ORB_SIZE + 12,
              right:         0,
              width:         BUBBLE_W,
              background:    "#0f0f11",
              border:        "1px solid rgba(124,58,237,0.3)",
              borderRadius:  16,
              padding:       "11px 14px 14px",
              boxShadow:     "0 20px 48px rgba(0,0,0,0.6)",
              zIndex:        5,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "#A78BFA", textTransform: "uppercase" }}>NIRI · Today</span>
              <button onClick={(e) => { e.stopPropagation(); setShowPanel(false); }} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>
            {todayTs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#71717a", margin: 0, lineHeight: 1.6 }}>
                No trades yet today. Are you waiting for your setup — or holding back? Either way, I&apos;m here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <StatRow label="Trades" value={String(todayTs.length)} />
                <StatRow label="Wins"   value={`${todayWins}/${todayTs.length}`} colour={todayWins > 0 ? "#34d399" : "#71717a"} />
                <StatRow
                  label="P&L"
                  value={`${todayPnl >= 0 ? "+" : ""}$${Math.abs(todayPnl).toFixed(2)}`}
                  colour={todayPnl >= 0 ? "#34d399" : "#f87171"}
                  mono
                />
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid #1f1f23", fontSize: 11, color: "#52525b", lineHeight: 1.55 }}>
                  {todayWins / todayTs.length >= 0.6
                    ? "Solid day. You're trading with real discipline right now. Stay present."
                    : todayWins / todayTs.length >= 0.4
                    ? "Mixed results. Pause for a moment — are your setups clean, or are you forcing it?"
                    : "Tough session. Before your next trade, take a breath. Your edge is still there. Clear your head first."}
                </div>
              </div>
            )}
            <Arrow />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatRow({ label, value, colour, mono }: { label: string; value: string; colour?: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#71717a" }}>{label}</span>
      <span style={{ fontWeight: 600, color: colour ?? "#e4e4e7", fontFamily: mono ? "monospace" : undefined }}>{value}</span>
    </div>
  );
}
