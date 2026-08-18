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
      // Start large but not splashy; cap for small screens.
      const startW = Math.min(380, Math.max(240, vw - 80));
      setGeometry({
        start: {
          left: Math.round((vw - startW) / 2),
          top: Math.round(vh * 0.4),
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
        duration: 2.2,
        times: [0, 0.82, 1],
        ease: "easeInOut",
      }}
      onAnimationComplete={handleComplete}
    >
      <motion.img
        src={LOGO_URL}
        alt="Sound Proof"
        style={{ position: "absolute", objectFit: "contain" }}
        initial={{ ...start, opacity: 0 }}
        animate={{ ...end, opacity: 1 }}
        transition={{
          duration: 1.8,
          ease: EASE,
          opacity: { duration: 0.3, ease: "easeOut" },
        }}
      />
    </motion.div>
  );
}