"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNiriBehaviour } from "@/hooks/useNiriBehaviour";
import type { TradeForNiri, NiriAlert } from "@/hooks/useNiriBehaviour";

export type { TradeForNiri };

// ── Layout constants ─────────────────────────────────────────────────────────
const ORB_SIZE  = 56;
const BUBBLE_W  = 224;
// Offset from orb left edge so bubble appears centered on orb
const BUBBLE_L  = -(BUBBLE_W / 2) + ORB_SIZE / 2; // = -84

// Safe drift bounds (keep bubble fully on screen)
function getBounds() {
  if (typeof window === "undefined") return { minX: 280, maxX: 800, minY: 90, maxY: 500 };
  const sidebar = window.innerWidth >= 1024 ? 264 : 16;
  return {
    minX: sidebar + BUBBLE_W / 2,
    maxX: Math.max(sidebar + BUBBLE_W / 2 + 10, window.innerWidth  - ORB_SIZE - BUBBLE_W / 2),
    minY: 90,
    maxY: Math.max(90, window.innerHeight - ORB_SIZE - 100),
  };
}

function randomPos() {
  const b = getBounds();
  return {
    x: b.minX + Math.random() * (b.maxX - b.minX),
    y: b.minY + Math.random() * (b.maxY - b.minY),
  };
}

// ── Bubble arrow (CSS triangle pointing down) ─────────────────────────────────
function Arrow() {
  return (
    <div style={{
      position:    "absolute",
      bottom:      -6,
      left:        BUBBLE_W / 2 - 6,
      width:       12,
      height:      12,
      background:  "#0f0f11",
      border:      "1px solid rgba(45,212,191,0.3)",
      borderTop:   "none",
      borderLeft:  "none",
      transform:   "rotate(45deg)",
    }} />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  trades?: TradeForNiri[];
}

export default function NiriOrb({ trades = [] }: Props) {
  // ── Visibility ──────────────────────────────────────────────────────────────
  const [hidden,     setHidden]     = useState(true); // start hidden until localStorage read
  const [pos,        setPos]        = useState({ x: 400, y: 300 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [alert,      setAlert]      = useState<NiriAlert | null>(null);
  const [showPanel,  setShowPanel]  = useState(false);
  const [inMsg,      setInMsg]      = useState(false);

  const inMsgRef     = useRef(false);
  const msgTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driftTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync so timer callbacks see latest value
  useEffect(() => { inMsgRef.current = inMsg; }, [inMsg]);

  // ── Init: check hidden flag ──────────────────────────────────────────────────
  useEffect(() => {
    const h = localStorage.getItem("niriOrbHidden") === "1";
    setHidden(h);
    if (!h) setPos(randomPos());
  }, []);

  // ── Drift ────────────────────────────────────────────────────────────────────
  const drift = useCallback(() => {
    if (inMsgRef.current) return;
    setPos(randomPos());
  }, []);

  useEffect(() => {
    if (hidden) return;
    function schedule() {
      const delay = (15 + Math.random() * 15) * 1000;
      driftTimerRef.current = setTimeout(() => { drift(); schedule(); }, delay);
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
        setTimeout(() => { setIsBlinking(false); blink(); }, 140);
      }, (4 + Math.random() * 4) * 1000);
    }
    blink();
    return () => clearTimeout(t);
  }, [hidden]);

  // ── Daily check-in ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (hidden) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("niri_last_checkin") === today) return;
    localStorage.setItem("niri_last_checkin", today);

    const t = setTimeout(() => {
      // Drift to centre of content area
      const sidebar  = window.innerWidth >= 1024 ? 264 : 0;
      const cx       = sidebar + (window.innerWidth - sidebar) / 2 - ORB_SIZE / 2;
      const cy       = window.innerHeight / 2 - ORB_SIZE / 2;
      setPos({ x: cx, y: cy });
      setInMsg(true);
      inMsgRef.current = true;
      setAlert({
        type:    "daily_checkin",
        message: "Good to see you. Let's make today's trades count. I'll be watching your behaviour — you know I always do.",
      });
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      msgTimerRef.current = setTimeout(() => {
        setAlert(null);
        setInMsg(false);
        inMsgRef.current = false;
      }, 6000);
    }, 2000);

    return () => clearTimeout(t);
  }, [hidden]);

  // ── Behaviour hook ───────────────────────────────────────────────────────────
  const handleAlert = useCallback((a: NiriAlert) => {
    setAlert(a);
    setInMsg(true);
    inMsgRef.current = true;
    setShowPanel(false);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => {
      setAlert(null);
      setInMsg(false);
      inMsgRef.current = false;
    }, 10000);
  }, []);

  useNiriBehaviour(trades, handleAlert);

  // ── Actions ──────────────────────────────────────────────────────────────────
  function dismiss() {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setAlert(null);
    setInMsg(false);
    inMsgRef.current = false;
  }

  function hideForSession() {
    localStorage.setItem("niriOrbHidden", "1");
    setHidden(true);
  }

  // ── Today stats (for idle panel) ─────────────────────────────────────────────
  const today       = new Date().toISOString().slice(0, 10);
  const todayTs     = trades.filter((t) => t.date === today);
  const todayPnl    = todayTs.reduce((s, t) => s + t.pnl, 0);
  const todayWins   = todayTs.filter((t) => t.pnl > 0).length;

  if (hidden) return null;

  return (
    <motion.div
      style={{ position: "fixed", top: 0, left: 0, zIndex: 9999, width: ORB_SIZE, height: ORB_SIZE }}
      animate={{ x: pos.x, y: pos.y, scale: inMsg ? 1.15 : 1 }}
      transition={{
        x:     { duration: inMsg ? 0.7 : 3, ease: "easeInOut" },
        y:     { duration: inMsg ? 0.7 : 3, ease: "easeInOut" },
        scale: { duration: 0.35, ease: "easeOut" },
      }}
    >
      {/* ── Orb body with pulse ── */}
      <motion.div
        style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        onClick={() => { if (!alert) setShowPanel((v) => !v); }}
      >
        {/* Outer glow ring */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(20,184,166,0.1)",
          boxShadow:  "0 0 16px rgba(20,184,166,0.7), 0 0 32px rgba(20,184,166,0.3), 0 0 56px rgba(20,184,166,0.12)",
        }} />

        {/* Middle ring */}
        <div style={{
          position: "absolute", inset: 7, borderRadius: "50%",
          background: "rgba(20,184,166,0.28)",
        }} />

        {/* Inner core */}
        <div style={{
          position:        "absolute",
          inset:           14,
          borderRadius:    "50%",
          background:      "linear-gradient(140deg, #2dd4bf 0%, #0d9488 60%, #0f766e 100%)",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          boxShadow:       "inset 0 2px 4px rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.2)",
        }}>
          {/* Eyes */}
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <motion.div
              animate={{ scaleY: isBlinking ? 0.08 : 1 }}
              transition={{ duration: 0.08, ease: "easeIn" }}
              style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.92)", boxShadow: "0 0 3px rgba(255,255,255,0.6)" }}
            />
            <motion.div
              animate={{ scaleY: isBlinking ? 0.08 : 1 }}
              transition={{ duration: 0.08, ease: "easeIn" }}
              style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.92)", boxShadow: "0 0 3px rgba(255,255,255,0.6)" }}
            />
          </div>
        </div>

        {/* Dismiss × */}
        <button
          onClick={(e) => { e.stopPropagation(); hideForSession(); }}
          style={{
            position:   "absolute",
            top:        -3,
            right:      -3,
            width:      16,
            height:     16,
            borderRadius: "50%",
            background: "#111113",
            border:     "1px solid #3f3f46",
            color:      "#71717a",
            fontSize:   9,
            fontWeight: 700,
            cursor:     "pointer",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            zIndex:     4,
            padding:    0,
          }}
        >×</button>
      </motion.div>

      {/* ── Speech bubble ── */}
      <AnimatePresence>
        {alert && (
          <motion.div
            key="bubble"
            initial={{ opacity: 0, scale: 0.86, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{    opacity: 0, scale: 0.86, y: 8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position:     "absolute",
              bottom:       ORB_SIZE + 10,
              left:         BUBBLE_L,
              width:        BUBBLE_W,
              background:   "#0f0f11",
              border:       "1px solid rgba(45,212,191,0.32)",
              borderRadius: 14,
              padding:      "10px 13px 13px",
              boxShadow:    "0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(45,212,191,0.08)",
              zIndex:       5,
              pointerEvents:"auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "#2dd4bf", textTransform: "uppercase" }}>NIRI</span>
              <button
                onClick={dismiss}
                style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>
            <p style={{ fontSize: 12.5, color: "#e4e4e7", lineHeight: 1.6, margin: 0 }}>
              {alert.message}
            </p>
            <Arrow />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Idle summary panel ── */}
      <AnimatePresence>
        {showPanel && !alert && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.86, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{    opacity: 0, scale: 0.86, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position:     "absolute",
              bottom:       ORB_SIZE + 10,
              left:         BUBBLE_L,
              width:        BUBBLE_W,
              background:   "#0f0f11",
              border:       "1px solid rgba(45,212,191,0.28)",
              borderRadius: 14,
              padding:      "10px 13px 13px",
              boxShadow:    "0 16px 40px rgba(0,0,0,0.55)",
              zIndex:       5,
              pointerEvents:"auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "#2dd4bf", textTransform: "uppercase" }}>NIRI · Today</span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPanel(false); }}
                style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>
            {todayTs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#71717a", margin: 0, lineHeight: 1.55 }}>
                No trades yet today. What are you waiting for?
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <Row label="Trades" value={String(todayTs.length)} />
                <Row
                  label="Wins"
                  value={`${todayWins}/${todayTs.length}`}
                  colour={todayWins > 0 ? "#34d399" : "#71717a"}
                />
                <Row
                  label="P&L"
                  value={`${todayPnl >= 0 ? "+" : ""}$${Math.abs(todayPnl).toFixed(2)}`}
                  colour={todayPnl >= 0 ? "#34d399" : "#f87171"}
                  mono
                />
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid #27272a", fontSize: 11, color: "#52525b" }}>
                  {todayWins / todayTs.length >= 0.6 ? "Solid day. Stay focused." :
                   todayWins / todayTs.length >= 0.4 ? "Mixed bag. Watch your setups." :
                   "Rough session. Breathe first, trade second."}
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

function Row({ label, value, colour, mono }: { label: string; value: string; colour?: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#71717a" }}>{label}</span>
      <span style={{ fontWeight: 600, color: colour ?? "#e4e4e7", fontFamily: mono ? "monospace" : undefined }}>
        {value}
      </span>
    </div>
  );
}
