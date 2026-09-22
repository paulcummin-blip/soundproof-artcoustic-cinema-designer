import React, { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { DEALER_BRAND_UPDATED_EVENT, loadDealerBrand } from "@/components/account/dealerBrandAuthority";

const SP_LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

const GAP_PX = 32;
const HEIGHT_RATIO = 0.65; // logos occupy ~65% of hero height
const SP_WIDER = 1.1; // SP rendered width = 1.1 × dealer rendered width
const MAX_LOGO_WIDTH = 420; // hard cap so extreme aspect ratios don't overflow

/**
 * HeroBanner — premium full-width brand partnership banner (vertical hierarchy).
 *
 *   Sound Proof logo
 *       ×
 *   Dealer logo
 *
 * Sizing rules (mandatory):
 *   - Both logos preserve their original aspect ratio (never stretched/squashed).
 *   - Sound Proof rendered width is always exactly 10% wider than the dealer
 *     rendered width.
 *   - The two logos together occupy approximately 65% of the hero height.
 *   - If a logo is unusually tall or wide, the layout spacing absorbs the
 *     difference — logo proportions are never adjusted.
 *
 * Background: dealer hero image, full-width, cover, centred, no blur,
 * ~50% dark overlay.
 *
 * Fallbacks:
 *   - Dealer logo present:  SP × Dealer Logo
 *   - Dealer logo missing:  SP × Dealer Name (text)
 *   - No dealer at all:     SP logo only, centred
 */
export default function DealerHero() {
  const { user } = useAuth();
  const accountId = user?.account_id || user?.access_context?.account?.id || null;
  const [brand, setBrand] = useState(null);
  const [spNatural, setSpNatural] = useState(null);
  const [dealerNatural, setDealerNatural] = useState(null);
  const [heroHeight, setHeroHeight] = useState(340);
  const heroRef = useRef(null);

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

  // Measure actual hero height so logo sizing adapts to the real rendered value
  useEffect(() => {
    if (!heroRef.current) return;
    const update = () => {
      if (heroRef.current) setHeroHeight(heroRef.current.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  const heroBg = brand?.hero_background_url || null;
  const dealerName = brand?.display_name_override || brand?.company_name || null;
  const dealerLogo = heroBg
    ? (brand?.white_logo_url || brand?.dealer_logo_url || null)
    : (brand?.dealer_logo_url || brand?.white_logo_url || null);
  const hasDealer = !!(dealerLogo || dealerName);

  // Reset dealer natural dims when the logo URL changes
  useEffect(() => {
    setDealerNatural(null);
  }, [dealerLogo]);

  const textColor = heroBg ? "#FFFFFF" : "#1B1A1A";
  const crossColor = heroBg ? "rgba(255,255,255,0.45)" : "rgba(27,26,26,0.30)";

  // Calculate rendered widths from natural dimensions + 10% rule + 65% height target
  const sizes = useMemo(() => {
    if (!spNatural) return null;
    const spAspect = spNatural.w / spNatural.h;
    const availableHeight = heroHeight * HEIGHT_RATIO;

    if (!hasDealer || !dealerLogo || !dealerNatural) {
      // Only SP logo — fill available height, cap to max width
      let spWidth = availableHeight * spAspect;
      spWidth = Math.min(spWidth, MAX_LOGO_WIDTH);
      return { spWidth, dealerWidth: 0 };
    }

    const dealerAspect = dealerNatural.w / dealerNatural.h;

    // SP width = 1.1 × dealer width
    // SP height = spWidth / spAspect = (1.1 × dealerWidth) / spAspect
    // dealer height = dealerWidth / dealerAspect
    // SP height + dealer height = availableHeight
    // → dealerWidth × (1.1/spAspect + 1/dealerAspect) = availableHeight
    const denom = SP_WIDER / spAspect + 1 / dealerAspect;
    let dealerWidth = availableHeight / denom;
    let spWidth = SP_WIDER * dealerWidth;

    // Cap to max width — if SP hits the cap, dealer follows the 10% rule
    if (spWidth > MAX_LOGO_WIDTH) {
      spWidth = MAX_LOGO_WIDTH;
      dealerWidth = spWidth / SP_WIDER;
    }

    return { spWidth, dealerWidth };
  }, [spNatural, dealerNatural, heroHeight, hasDealer, dealerLogo]);

  const spWidth = sizes?.spWidth || 220;
  const dealerWidth = sizes?.dealerWidth || 0;

  return (
    <div
      ref={heroRef}
      className="relative w-full flex-shrink-0 overflow-hidden"
      style={{
        height: "clamp(260px, 22vw, 340px)",
        background: heroBg ? "#1B1A1A" : "#F8F8F7",
        borderBottom: `1px solid ${heroBg ? "rgba(255,255,255,0.12)" : "#DCDBD6"}`,
      }}
    >
      {/* Hero background image — full width, cover, centred, no blur */}
      {heroBg && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${heroBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} />
        </>
      )}

      {/* Vertically centred brand hierarchy */}
      <div
        className="relative h-full flex flex-col items-center justify-center px-6"
        style={{ fontFamily: "Didact Gothic, Century Gothic, sans-serif", gap: GAP_PX }}
      >
        {/* Sound Proof — primary brand, always first, 10% wider than dealer */}
        <img
          src={SP_LOGO_URL}
          alt="Sound Proof"
          onLoad={(e) => {
            const img = e.currentTarget;
            setSpNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          style={{
            width: spWidth,
            height: "auto",
            flexShrink: 0,
          }}
        />

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
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDealerNatural({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                style={{
                  width: dealerWidth,
                  height: "auto",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
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
    </div>
  );
}