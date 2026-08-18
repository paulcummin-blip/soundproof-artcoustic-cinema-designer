import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Restrained Sound Proof brand intro animation.
// Plays once per browser session on first app load: the logo appears
// large and centred, then animates smoothly into its sidebar position.
// Respects prefers-reduced-motion (quick fade only, no movement).

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";
const STORAGE_KEY = "sp_brand_intro_played";

// Smooth, calm easing — no bounce.
const EASE = [0.4, 0.0, 0.2, 1];

export default function BrandIntroOverlay() {
  const [show, setShow] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return; // already played
      sessionStorage.setItem(STORAGE_KEY, "1");

      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Start large and centred so the brand clearly registers before moving.
      const startW = Math.min(480, Math.max(280, vw - 80));
      setGeometry({
        start: {
          left: Math.round((vw - startW) / 2),
          top: Math.round((vh - startW * 0.3) / 2),
          width: startW,
        },
        end: { left: 16, top: 16, width: 300 },
      });
      setShow(true);
    } catch (_e) {
      // sessionStorage unavailable — skip intro silently
    }
  }, []);

  if (!show || !geometry) return null;

  const handleComplete = () => setShow(false);

  // Reduced motion: no movement, just a quick fade.
  if (reducedMotion) {
    return (
      <motion.div
        style={{
          position: "fixed",
          inset: 0,
          background: "#FFFFFF",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
        onAnimationComplete={handleComplete}
      >
        <img
          src={LOGO_URL}
          alt="Sound Proof"
          style={{ width: 300, display: "block", objectFit: "contain" }}
        />
      </motion.div>
    );
  }

  const { start, end } = geometry;

  // Total ~5s: fade in (0.3s) → hold still (2s) → move to sidebar (2.7s)
  const TOTAL = 5.0;
  const FADE_IN = 0.3;
  const HOLD = 2.0;
  // times are fractions of TOTAL
  const tFadeIn = FADE_IN / TOTAL;           // 0.06
  const tHoldEnd = (FADE_IN + HOLD) / TOTAL; // 0.46

  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        background: "#FFFFFF",
        zIndex: 9999,
        pointerEvents: "none",
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{
        duration: TOTAL,
        times: [0, 0.94, 1],
        ease: "easeInOut",
      }}
      onAnimationComplete={handleComplete}
    >
      <motion.img
        src={LOGO_URL}
        alt="Sound Proof"
        style={{ position: "absolute", objectFit: "contain" }}
        initial={{ ...start, opacity: 0 }}
        animate={{
          left: [start.left, start.left, start.left, end.left],
          top: [start.top, start.top, start.top, end.top],
          width: [start.width, start.width, start.width, end.width],
          opacity: [0, 1, 1, 1],
        }}
        transition={{
          duration: TOTAL,
          times: [0, tFadeIn, tHoldEnd, 1],
          ease: EASE,
        }}
      />
    </motion.div>
  );
}