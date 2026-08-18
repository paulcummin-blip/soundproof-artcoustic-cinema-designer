import React, { useEffect, useState } from "react";

// Sound Proof brand intro animation.
// Plays once per browser session: the logo appears large and centred,
// holds still for 2s, then moves smoothly to the sidebar position over 3s.
// Total ~5s. The overlay is removed only after the animation completes.
//
// Respects prefers-reduced-motion (brief fade, no movement) — but only
// when the media query actually matches; never suppresses for normal users.
//
// DEBUG / TESTING:
//   - Call window.__resetSoundProofIntro() from the console, then reload.
//   - Or append ?resetIntro to the URL and reload.
// Either clears the session flag so the animation replays.

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";
const STORAGE_KEY = "soundproof_intro_played_v2";

// Expose a debug reset helper on window so it can be called from the console.
if (typeof window !== "undefined" && !window.__resetSoundProofIntro) {
  window.__resetSoundProofIntro = () => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    // eslint-disable-next-line no-console
    console.log("[SoundProof Intro] Session flag cleared. Reload to replay.");
  };
}

// Safe sessionStorage helpers — never throw even in sandboxed iframes.
function hasPlayed() {
  try { return !!sessionStorage.getItem(STORAGE_KEY); } catch (_) { return false; }
}
function markPlayed() {
  try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}
}

export default function BrandIntroOverlay() {
  const [show, setShow] = useState(false);
  // Stages: hold → move → fade → done
  const [stage, setStage] = useState("hold");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    // Debug: ?resetIntro clears the flag so the animation replays on reload.
    try {
      if (new URLSearchParams(window.location.search).get("resetIntro") !== null) {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
      }
    } catch (_) {}

    if (hasPlayed()) return;
    markPlayed();

    // Only skip movement when the media query genuinely matches.
    try {
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_) {
      setReducedMotion(false);
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Start large and centred so the brand clearly registers.
    const startW = Math.min(480, Math.max(280, vw - 80));
    setGeometry({
      start: {
        left: Math.round((vw - startW) / 2),
        top: Math.round((vh - startW * 0.3) / 2),
        width: startW,
      },
      // Matches the sidebar logo position (p-4 padding = 16px, width 300).
      end: { left: 16, top: 16, width: 300 },
    });
    setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const timers = [];
    if (reducedMotion) {
      // Reduced motion: show logo briefly, fade out, no movement.
      timers.push(setTimeout(() => setStage("fade"), 800));
      timers.push(setTimeout(() => setStage("done"), 1200));
    } else {
      // 0–2s: hold centred. 2–5s: move to sidebar. 4.7–5s: fade. 5s: done.
      timers.push(setTimeout(() => setStage("move"), 2000));
      timers.push(setTimeout(() => setStage("fade"), 4700));
      timers.push(setTimeout(() => setStage("done"), 5000));
    }
    return () => timers.forEach(clearTimeout);
  }, [show, reducedMotion]);

  if (!show || stage === "done" || !geometry) return null;

  const { start, end } = geometry;
  const atEnd = stage === "move" || stage === "fade";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#FFFFFF",
        zIndex: 99999,
        opacity: stage === "fade" ? 0 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <img
        src={LOGO_URL}
        alt="Sound Proof"
        style={{
          position: "absolute",
          objectFit: "contain",
          left: atEnd ? end.left : start.left,
          top: atEnd ? end.top : start.top,
          width: atEnd ? end.width : start.width,
          transition:
            "left 3s cubic-bezier(0.4,0,0.2,1), top 3s cubic-bezier(0.4,0,0.2,1), width 3s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </div>
  );
}