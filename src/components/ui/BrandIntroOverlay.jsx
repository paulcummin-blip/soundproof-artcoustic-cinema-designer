import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { loadDealerBrand } from "@/components/account/dealerBrandAuthority";

// Opening brand treatment. It uses the same account-owned hero image and logo
// authority as the settled header, then contracts into that header's live box.
// Plays once per browser session and respects reduced-motion preferences.

const STORAGE_KEY = "soundproof_intro_played_v3";
const SP_WORDMARK = "SOUND PROOF";
const BASE_FONT_SIZE = 40;
const LETTER_SPACING = "0.15em";
const FONT_FAMILY = "Didact Gothic, Century Gothic, sans-serif";
const FONT_WEIGHT = 300;
const SP_WIDER = 1.1;
const DEALER_WIDTH_RATIO = 0.44;
const MAX_SETTLED_DEALER_WIDTH = 520;
const GAP_PX = 32;
const CROSS_HEIGHT_PX = 30;
const HORIZONTAL_PADDING = 48;
const VERTICAL_PADDING = 48;
const INTRO_HOLD_MS = 2000;
const INTRO_MOVE_MS = 9000;
const INTRO_FADE_MS = 800;

if (typeof window !== "undefined" && !window.__resetSoundProofIntro) {
  window.__resetSoundProofIntro = () => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    // eslint-disable-next-line no-console
    console.log("[SoundProof Intro] Session flag cleared. Reload to replay.");
  };
}

function hasPlayed() {
  try { return !!sessionStorage.getItem(STORAGE_KEY); } catch (_) { return false; }
}

function markPlayed() {
  try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}
}

function calculateLockup({
  width,
  height,
  baseTextWidth,
  hasDealer,
  hasDealerLogo,
  dealerNatural,
  maxDealerWidth,
}) {
  if (!baseTextWidth) {
    return { spFontSize: 56, dealerWidth: hasDealerLogo ? 360 : 0 };
  }

  const textFactor = baseTextWidth / BASE_FONT_SIZE;
  const usableWidth = Math.max(0, width - HORIZONTAL_PADDING);

  if (!hasDealer || !hasDealerLogo || !dealerNatural) {
    const maxWordmarkWidth = Math.min(usableWidth * 0.58, maxDealerWidth * SP_WIDER);
    const maxWordmarkHeight = Math.max(36, height - VERTICAL_PADDING * 2);
    return {
      spFontSize: Math.min(maxWordmarkWidth / textFactor, maxWordmarkHeight),
      dealerWidth: 0,
    };
  }

  const dealerAspect = dealerNatural.w / dealerNatural.h;
  const desiredDealerWidth = Math.min(
    usableWidth * DEALER_WIDTH_RATIO,
    maxDealerWidth,
  );
  const sizeCoefficient = (SP_WIDER / textFactor) + (1 / dealerAspect);
  const availableVariableHeight = Math.max(
    0,
    height - VERTICAL_PADDING * 2 - CROSS_HEIGHT_PX - GAP_PX * 2,
  );
  const heightBoundDealerWidth = availableVariableHeight / sizeCoefficient;
  const dealerWidth = Math.max(
    0,
    Math.min(desiredDealerWidth, heightBoundDealerWidth),
  );

  return {
    spFontSize: (SP_WIDER * dealerWidth) / textFactor,
    dealerWidth,
  };
}

export default function BrandIntroOverlay() {
  const { user, isLoadingAuth } = useAuth();
  const accountId = user?.account_id || user?.access_context?.account?.id || null;

  const [brand, setBrand] = useState(null);
  const [brandReady, setBrandReady] = useState(false);
  const [show, setShow] = useState(false);
  const [stage, setStage] = useState("hold");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const [targetRect, setTargetRect] = useState(null);
  const [dealerNatural, setDealerNatural] = useState(null);
  const [baseTextWidth, setBaseTextWidth] = useState(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const measureRef = useRef(null);

  useEffect(() => {
    if (isLoadingAuth) return undefined;

    let cancelled = false;
    setBrandReady(false);

    if (!accountId) {
      setBrand(null);
      setBrandReady(true);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const loadedBrand = await loadDealerBrand(accountId);
        if (!cancelled) setBrand(loadedBrand || null);
      } catch {
        if (!cancelled) setBrand(null);
      } finally {
        if (!cancelled) setBrandReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [accountId, isLoadingAuth]);

  useEffect(() => {
    if (!brandReady) return undefined;

    try {
      if (new URLSearchParams(window.location.search).get("resetIntro") !== null) {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
      }
    } catch (_) {}

    if (hasPlayed()) return undefined;

    let frame = 0;
    let attempts = 0;
    const locateTarget = () => {
      const target = document.querySelector('[data-dealer-hero="true"]');
      const rect = target?.getBoundingClientRect();
      if ((!rect || rect.width < 10 || rect.height < 10) && attempts < 120) {
        attempts += 1;
        frame = requestAnimationFrame(locateTarget);
        return;
      }
      if (!rect) return;

      let prefersReducedMotion = false;
      try {
        prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (_) {}

      setReducedMotion(prefersReducedMotion);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setTargetRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
      markPlayed();
      setShow(true);
    };

    frame = requestAnimationFrame(locateTarget);
    return () => cancelAnimationFrame(frame);
  }, [brandReady]);

  useEffect(() => {
    if (!show) return undefined;
    const timers = [];

    if (reducedMotion) {
      timers.push(setTimeout(() => setStage("fade"), 800));
      timers.push(setTimeout(() => setStage("done"), 1100));
    } else {
      const fadeAt = INTRO_HOLD_MS + INTRO_MOVE_MS;
      timers.push(setTimeout(() => setStage("settle"), INTRO_HOLD_MS));
      timers.push(setTimeout(() => setStage("fade"), fadeAt));
      timers.push(setTimeout(() => setStage("done"), fadeAt + INTRO_FADE_MS));
    }

    return () => timers.forEach(clearTimeout);
  }, [show, reducedMotion]);

  useEffect(() => {
    const measure = () => {
      if (!measureRef.current) return;
      const measured = measureRef.current.offsetWidth;
      if (measured > 0) setBaseTextWidth(measured);
    };
    measure();
    if (document.fonts?.ready) document.fonts.ready.then(measure);
  }, [show]);

  const heroBg = brand?.hero_background_url || null;
  const dealerName = brand?.display_name_override || brand?.company_name || null;
  const dealerLogo = heroBg
    ? (brand?.white_logo_url || brand?.dealer_logo_url || null)
    : (brand?.dealer_logo_url || brand?.white_logo_url || null);
  const hasDealer = !!(dealerLogo || dealerName);

  useEffect(() => {
    setDealerNatural(null);
  }, [dealerLogo]);

  useEffect(() => {
    if (!heroBg) {
      setOverlayOpacity(0.48);
      return undefined;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 60;
        canvas.height = 60;
        ctx.drawImage(img, 0, 0, 60, 60);
        const data = ctx.getImageData(0, 0, 60, 60).data;
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          sum += (data[index] + data[index + 1] + data[index + 2]) / 3;
        }
        const average = sum / (data.length / 4);
        setOverlayOpacity(
          average > 128
            ? Math.min(0.5, 0.45 + ((average - 128) / 128) * 0.05)
            : 0.45,
        );
      } catch {
        setOverlayOpacity(0.5);
      }
    };
    img.onerror = () => setOverlayOpacity(0.48);
    img.src = heroBg;
    return undefined;
  }, [heroBg]);

  const geometry = useMemo(() => {
    if (!targetRect) return null;
    const margin = Math.max(
      12,
      Math.min(36, Math.round(Math.min(viewport.width, viewport.height) * 0.035)),
    );
    return {
      start: {
        left: margin,
        top: margin,
        width: Math.max(0, viewport.width - margin * 2),
        height: Math.max(0, viewport.height - margin * 2),
      },
      end: targetRect,
    };
  }, [targetRect, viewport]);

  const settled = stage === "settle" || stage === "fade";
  const frameBox = geometry ? (settled ? geometry.end : geometry.start) : null;

  const startLockup = useMemo(() => {
    if (!geometry) return { spFontSize: 56, dealerWidth: 360 };
    return calculateLockup({
      width: geometry.start.width,
      height: geometry.start.height,
      baseTextWidth,
      hasDealer,
      hasDealerLogo: !!dealerLogo,
      dealerNatural,
      maxDealerWidth: Math.min(720, geometry.start.width * 0.5),
    });
  }, [geometry, baseTextWidth, hasDealer, dealerLogo, dealerNatural]);

  const endLockup = useMemo(() => {
    if (!geometry) return { spFontSize: 56, dealerWidth: 360 };
    return calculateLockup({
      width: geometry.end.width,
      height: geometry.end.height,
      baseTextWidth,
      hasDealer,
      hasDealerLogo: !!dealerLogo,
      dealerNatural,
      maxDealerWidth: MAX_SETTLED_DEALER_WIDTH,
    });
  }, [geometry, baseTextWidth, hasDealer, dealerLogo, dealerNatural]);

  if (!show || stage === "done" || !geometry || !frameBox) return null;

  const lockup = settled ? endLockup : startLockup;
  const textColor = heroBg ? "#FFFFFF" : "#1B1A1A";
  const crossColor = heroBg ? "rgba(255,255,255,0.45)" : "rgba(27,26,26,0.30)";
  const transition = reducedMotion
    ? "none"
    : "left 9s cubic-bezier(0.45,0,0.55,1), top 9s cubic-bezier(0.45,0,0.55,1), width 9s cubic-bezier(0.45,0,0.55,1), height 9s cubic-bezier(0.45,0,0.55,1)";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        pointerEvents: "none",
        overflow: "hidden",
        background: settled ? "rgba(15,15,15,0)" : "rgba(15,15,15,0.94)",
        transition: reducedMotion ? "none" : "background 9s cubic-bezier(0.45,0,0.55,1)",
      }}
    >
      <div
        style={{
          position: "fixed",
          left: frameBox.left,
          top: frameBox.top,
          width: frameBox.width,
          height: frameBox.height,
          overflow: "hidden",
          background: heroBg ? "#1B1A1A" : "#F8F8F7",
          borderBottom: `1px solid ${heroBg ? "rgba(255,255,255,0.12)" : "#DCDBD6"}`,
          boxShadow: settled ? "0 0 0 rgba(0,0,0,0)" : "0 28px 80px rgba(0,0,0,0.30)",
          opacity: stage === "fade" ? 0 : 1,
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          willChange: "left, top, width, height, opacity, box-shadow",
          transition: `${transition}, box-shadow 9s cubic-bezier(0.45,0,0.55,1), opacity 0.8s ease`,
        }}
      >
        <span
          ref={measureRef}
          style={{
            position: "absolute",
            visibility: "hidden",
            fontSize: BASE_FONT_SIZE,
            letterSpacing: LETTER_SPACING,
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT,
            lineHeight: 1,
            whiteSpace: "nowrap",
            left: -9999,
          }}
        >
          {SP_WORDMARK}
        </span>

        {heroBg && (
          <>
            <div
              style={{
                position: "absolute",
                inset: -10,
                backgroundImage: `url(${heroBg})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: settled
                  ? "brightness(0.9) blur(0px)"
                  : "brightness(0.78) blur(6px)",
                transform: settled ? "scale(1)" : "scale(1.025)",
                backfaceVisibility: "hidden",
                willChange: "filter, transform",
                transition: reducedMotion
                  ? "none"
                  : "filter 9s cubic-bezier(0.45,0,0.55,1), transform 9s cubic-bezier(0.45,0,0.55,1)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `rgba(0,0,0,${settled ? overlayOpacity : Math.max(0.56, overlayOpacity)})`,
                transition: reducedMotion ? "none" : "background 9s cubic-bezier(0.45,0,0.55,1)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.35) 100%)",
              }}
            />
          </>
        )}

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            boxSizing: "border-box",
            gap: settled ? GAP_PX : Math.max(GAP_PX, 40),
            fontFamily: FONT_FAMILY,
            transition: reducedMotion ? "none" : "gap 9s cubic-bezier(0.45,0,0.55,1)",
          }}
        >
          <span
            style={{
              fontSize: lockup.spFontSize,
              fontWeight: FONT_WEIGHT,
              letterSpacing: LETTER_SPACING,
              lineHeight: 1,
              color: textColor,
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: reducedMotion ? "none" : "font-size 9s cubic-bezier(0.45,0,0.55,1)",
            }}
          >
            {SP_WORDMARK}
          </span>

          {hasDealer && (
            <>
              <span
                style={{
                  fontSize: settled ? 30 : 40,
                  fontWeight: 300,
                  color: crossColor,
                  lineHeight: 1,
                  userSelect: "none",
                  flexShrink: 0,
                  transition: reducedMotion ? "none" : "font-size 9s cubic-bezier(0.45,0,0.55,1)",
                }}
              >
                ×
              </span>

              {dealerLogo ? (
                <img
                  src={dealerLogo}
                  alt=""
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setDealerNatural({ w: img.naturalWidth, h: img.naturalHeight });
                  }}
                  style={{
                    width: lockup.dealerWidth,
                    height: "auto",
                    objectFit: "contain",
                    flexShrink: 0,
                    transition: reducedMotion ? "none" : "width 9s cubic-bezier(0.45,0,0.55,1)",
                  }}
                />
              ) : (
                <span
                  style={{
                    color: textColor,
                    fontSize: settled ? 26 : 36,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: reducedMotion ? "none" : "font-size 9s cubic-bezier(0.45,0,0.55,1)",
                  }}
                >
                  {dealerName}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
