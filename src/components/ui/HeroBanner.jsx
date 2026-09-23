import React, { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { DEALER_BRAND_UPDATED_EVENT, loadDealerBrand } from "@/components/account/dealerBrandAuthority";
import { useNavigate } from "react-router-dom";

const SP_WORDMARK = "SOUND PROOF";
const BASE_FONT_SIZE = 40; // px — reference size for text width measurement
const LETTER_SPACING = "0.15em";
const FONT_FAMILY = "Didact Gothic, Century Gothic, sans-serif";
const FONT_WEIGHT = 300;

const GAP_PX = 32;
const SP_WIDER = 1.1; // SP rendered width = 1.1 × dealer rendered width
const DEALER_WIDTH_RATIO = 0.44; // approved larger dealer mark within the hero
const MAX_DEALER_WIDTH = 520;
const HERO_HORIZONTAL_PADDING = 48;
const HERO_VERTICAL_PADDING = 48;
const CROSS_HEIGHT_PX = 30;

/**
 * HeroBanner — premium full-width brand partnership banner (vertical hierarchy).
 *
 *   SOUND PROOF  (white wordmark — no panel, no graphic)
 *       ×
 *   Dealer Logo
 *
 * The Sound Proof wordmark is pure text floating directly over the hero
 * photography. No blue rectangle, no wave graphic, no background panel.
 *
 * Sizing rules (mandatory):
 *   - Sound Proof rendered width is always exactly 10% wider than the dealer
 *     logo rendered width (e.g. dealer 300px → SP 330px).
 *   - Both logos preserve their original proportions (text scales proportionally;
 *     dealer image uses width + height:auto).
 *   - The dealer mark is width-led for a strong visual presence, with a
 *     height safety bound for unusually tall uploaded logos.
 *
 * Contrast:
 *   The dark overlay auto-adjusts (45–60%) based on hero image brightness so
 *   the white wordmark stays readable over any photograph.
 *
 * Fallbacks:
 *   - Dealer logo present:  SOUND PROOF × Dealer Logo
 *   - Dealer logo missing:  SOUND PROOF × Dealer Name (text)
 *   - No dealer at all:     SOUND PROOF centred
 */
export default function DealerHero() {
  const { user } = useAuth();
  const accountId = user?.account_id || user?.access_context?.account?.id || null;
  const [brand, setBrand] = useState(null);
  const [dealerNatural, setDealerNatural] = useState(null);
  const [heroSize, setHeroSize] = useState({ width: 1200, height: 520 });
  const [baseTextWidth, setBaseTextWidth] = useState(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [hoveredEl, setHoveredEl] = useState(null);
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const measureRef = useRef(null);

  // Load dealer brand assets
  useEffect(() => {
    let cancelled = false;
    if (!accountId) {
      setBrand(null);
      return () => { cancelled = true; };
    }
    setBrand(null);
    (async () => {
      try {
        const loadedBrand = await loadDealerBrand(accountId);
        if (!cancelled) setBrand(loadedBrand);
      } catch {
        if (!cancelled) setBrand(null);
      }
    })();
    const handleBrandUpdated = (event) => {
      const detail = event?.detail || {};
      if (String(detail.accountId || "") === String(accountId)) {
        setBrand(detail.brand || null);
      }
    };
    window.addEventListener(DEALER_BRAND_UPDATED_EVENT, handleBrandUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(DEALER_BRAND_UPDATED_EVENT, handleBrandUpdated);
    };
  }, [accountId]);

  // Measure the actual hero box. Width-led sizing restores the approved
  // larger dealer mark while the height bound keeps unusual logo shapes safe.
  useEffect(() => {
    if (!heroRef.current) return;
    const update = () => {
      if (!heroRef.current) return;
      setHeroSize({
        width: heroRef.current.offsetWidth,
        height: heroRef.current.offsetHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Measure base text width of the SP wordmark at reference font size.
  // Re-measures after web fonts finish loading so the calculation is exact.
  useEffect(() => {
    const measure = () => {
      if (measureRef.current) {
        const w = measureRef.current.offsetWidth;
        if (w > 0) setBaseTextWidth(w);
      }
    };
    measure();
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure);
    }
  }, []);

  const heroBg = brand?.hero_background_url || null;
  const dealerName = brand?.display_name_override || brand?.company_name || null;
  const dealerLogo = heroBg
    ? (brand?.white_logo_url || brand?.dealer_logo_url || null)
    : (brand?.dealer_logo_url || brand?.white_logo_url || null);
  const hasDealer = !!(dealerLogo || dealerName);
  const hasCustomLogo = !!(brand?.dealer_logo_url || brand?.white_logo_url);
  const hasCustomHero = !!brand?.hero_background_url;

  const tooltipText = hoveredEl === "wordmark" ? "Sound Proof branding is fixed."
    : hoveredEl === "logo" ? (hasCustomLogo ? "Change your company logo" : "Personalise this logo with your own branding. Upload your company logo from Dealer Branding.")
    : hoveredEl === "hero" ? (hasCustomHero ? "Change your Hero Image" : "Personalise this Hero Image from Dealer Branding.")
    : null;

  // Auto-adjust dark overlay based on hero image brightness (45–50%)
  useEffect(() => {
    if (!heroBg) {
      setOverlayOpacity(0.48);
      return;
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
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = sum / pixelCount; // 0–255
        if (avgBrightness > 128) {
          // Bright image — increase overlay (capped at 50%)
          setOverlayOpacity(Math.min(0.5, 0.45 + ((avgBrightness - 128) / 128) * 0.05));
        } else {
          setOverlayOpacity(0.45);
        }
      } catch {
        // CORS-tainted canvas — use safe default
        setOverlayOpacity(0.5);
      }
    };
    img.onerror = () => setOverlayOpacity(0.48);
    img.src = heroBg;
  }, [heroBg]);

  // Reset dealer natural dims when the logo URL changes
  useEffect(() => {
    setDealerNatural(null);
  }, [dealerLogo]);

  const textColor = heroBg ? "#FFFFFF" : "#1B1A1A";
  const crossColor = heroBg ? "rgba(255,255,255,0.45)" : "rgba(27,26,26,0.30)";

  // Width leads the settled lockup: the dealer mark is deliberately large,
  // and Sound Proof remains exactly 10% wider. A separate height bound only
  // reduces the pair when an unusually tall uploaded logo would overflow.
  const { spFontSize, dealerWidth } = useMemo(() => {
    const { width: heroWidth, height: heroHeight } = heroSize;

    // Before measurement — use stable, deliberately generous defaults.
    if (!baseTextWidth) {
      return { spFontSize: 56, dealerWidth: 360 };
    }

    const textFactor = baseTextWidth / BASE_FONT_SIZE;
    const usableWidth = Math.max(0, heroWidth - HERO_HORIZONTAL_PADDING);
    const desiredDealerWidth = Math.min(
      usableWidth * DEALER_WIDTH_RATIO,
      MAX_DEALER_WIDTH,
    );

    if (!hasDealer || !dealerLogo || !dealerNatural) {
      const maxWordmarkWidth = Math.min(usableWidth * 0.58, MAX_DEALER_WIDTH * SP_WIDER);
      const maxWordmarkHeight = Math.max(36, heroHeight - HERO_VERTICAL_PADDING * 2);
      return {
        spFontSize: Math.min(maxWordmarkWidth / textFactor, maxWordmarkHeight),
        dealerWidth: 0,
      };
    }

    const dealerAspect = dealerNatural.w / dealerNatural.h;
    const sizeCoefficient = (SP_WIDER / textFactor) + (1 / dealerAspect);
    const availableVariableHeight = Math.max(
      0,
      heroHeight - HERO_VERTICAL_PADDING * 2 - CROSS_HEIGHT_PX - GAP_PX * 2,
    );
    const heightBoundDealerWidth = availableVariableHeight / sizeCoefficient;
    const dWidth = Math.max(
      0,
      Math.min(desiredDealerWidth, heightBoundDealerWidth),
    );
    const fontSize = (SP_WIDER * dWidth) / textFactor;

    return { spFontSize: fontSize, dealerWidth: dWidth };
  }, [dealerNatural, heroSize, hasDealer, dealerLogo, baseTextWidth]);

  return (
    <div
      ref={heroRef}
      className="relative w-full flex-shrink-0 overflow-hidden"
      onMouseOver={(e) => {
        const el = e.target.dataset?.heroEl || "hero";
        setHoveredEl(el);
      }}
      onMouseLeave={() => setHoveredEl(null)}
      onClick={(e) => {
        const el = e.target.dataset?.heroEl || "hero";
        if (el !== "wordmark") navigate("/DealerBranding");
      }}
      data-hero-el="hero"
      data-dealer-hero="true"
      style={{
        height: "clamp(380px, 30vw, 520px)",
        background: heroBg ? "#1B1A1A" : "#F8F8F7",
        borderBottom: `1px solid ${heroBg ? "rgba(255,255,255,0.12)" : "#DCDBD6"}`,
        cursor: "pointer",
      }}
    >
      {/* Hidden measurement span — determines text width at reference font size */}
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          fontSize: BASE_FONT_SIZE,
          letterSpacing: LETTER_SPACING,
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT,
          lineHeight: 1,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          left: -9999,
        }}
      >
        {SP_WORDMARK}
      </span>

      {/* Hero background image — full width, cover, centred, no blur */}
      {heroBg && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${heroBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "brightness(0.9)",
            }}
          />
          {/* Dark overlay — 45–50% to de-emphasise the image */}
          <div
            className="absolute inset-0"
            style={{ background: `rgba(0,0,0,${overlayOpacity})` }}
          />
          {/* Subtle vignette — darkens edges, keeps centre clear for logos */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.35) 100%)",
            }}
          />
        </>
      )}

      {/* Vertically centred brand hierarchy */}
      <div
        className="relative h-full flex flex-col items-center justify-center px-6"
        style={{ fontFamily: FONT_FAMILY, gap: GAP_PX }}
      >
        {/* Sound Proof wordmark — white text, no panel, floats over photography */}
        <span
          data-hero-el="wordmark"
          style={{
            fontSize: spFontSize,
            fontWeight: FONT_WEIGHT,
            letterSpacing: LETTER_SPACING,
            lineHeight: 1,
            color: heroBg ? "#FFFFFF" : "#1B1A1A",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {SP_WORDMARK}
        </span>

        {/* Partnership mark + dealer branding */}
        {hasDealer && (
          <>
            <span
              style={{
                fontSize: "clamp(20px, 2.5vw, 30px)",
                fontWeight: 300,
                color: crossColor,
                lineHeight: 1,
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              ×
            </span>

            {dealerLogo ? (
              <img
                src={dealerLogo}
                alt={dealerName || "Dealer"}
                data-hero-el="logo"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDealerNatural({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                style={{
                  width: dealerWidth,
                  height: "auto",
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                data-hero-el="logo"
                style={{
                  color: textColor,
                  fontSize: "clamp(18px, 2vw, 26px)",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {dealerName}
              </span>
            )}
          </>
        )}
      </div>

      {/* Hover discovery tooltip — only visible on hover, no permanent UI */}
      {tooltipText && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.78)",
            color: "#FFFFFF",
            fontSize: 12,
            fontFamily: FONT_FAMILY,
            padding: "6px 14px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            letterSpacing: "0.02em",
            maxWidth: "90%",
          }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}