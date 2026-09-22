import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { DEALER_BRAND_UPDATED_EVENT, loadDealerBrand } from "@/components/account/dealerBrandAuthority";

const SP_LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

/**
 * HeroBanner — premium full-width brand partnership banner.
 *
 * Displays:  Sound Proof logo  ×  Dealer logo (or dealer name)
 * No marketing copy. The logos communicate the relationship.
 *
 * Sound Proof is always first and visually dominant.
 * Dealer logo is 75% of the Sound Proof logo height.
 * The × symbol is the partnership mark.
 *
 * Background:
 *   If a dealer hero image exists, it is rendered full-width, cover,
 *   centred, with a ~50% dark overlay for logo legibility. No blur.
 *   If no hero image, a clean neutral background is used.
 *
 * Fallbacks:
 *   - Dealer logo present:  SP × Dealer Logo
 *   - Dealer logo missing:  SP × Dealer Name
 *   - No dealer at all:     SP logo only, centred
 *
 * Height: ~300px on desktop, ~200px on mobile.
 */
export default function DealerHero() {
  const { user } = useAuth();
  const accountId = user?.account_id || user?.access_context?.account?.id || null;
  const [brand, setBrand] = useState(null);

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

  const heroBg = brand?.hero_background_url || null;
  const dealerName = brand?.display_name_override || brand?.company_name || null;
  const dealerLogo = heroBg
    ? (brand?.white_logo_url || brand?.dealer_logo_url || null)
    : (brand?.dealer_logo_url || brand?.white_logo_url || null);
  const hasDealer = !!(dealerLogo || dealerName);

  const textColor = heroBg ? "#FFFFFF" : "#1B1A1A";
  const crossColor = heroBg ? "rgba(255,255,255,0.45)" : "rgba(27,26,26,0.30)";

  return (
    <div
      className="relative w-full flex-shrink-0 overflow-hidden"
      style={{
        height: "clamp(200px, 20vw, 300px)",
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

      {/* Centred brand partnership */}
      <div
        className="relative h-full flex items-center justify-center px-6 sm:px-10"
        style={{ fontFamily: "Didact Gothic, Century Gothic, sans-serif" }}
      >
        <div
          className="flex items-center justify-center"
          style={{ gap: "clamp(24px, 4vw, 48px)" }}
        >
          {/* Sound Proof — primary brand, always first, always dominant */}
          <img
            src={SP_LOGO_URL}
            alt="Sound Proof"
            style={{
              height: "clamp(40px, 5vw, 64px)",
              objectFit: "contain",
              maxWidth: 320,
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
                  style={{
                    height: "clamp(30px, 3.75vw, 48px)",
                    objectFit: "contain",
                    maxWidth: 240,
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
    </div>
  );
}