import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { DEALER_BRAND_UPDATED_EVENT, loadDealerBrand } from "@/components/account/dealerBrandAuthority";

const SP_LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

/**
 * HeroBanner — premium full-width brand partnership banner (vertical hierarchy).
 *
 * Displays vertically:
 *   Sound Proof logo
 *       ×
 *   Dealer logo (or dealer name)
 *
 * No marketing copy. The logos communicate the relationship.
 *
 * Sound Proof is always first and ~10% wider than the dealer logo.
 * Both logos maintain their original aspect ratio (never distorted).
 * The × symbol is the partnership mark with 32px spacing above and below.
 *
 * Background:
 *   Dealer hero image rendered full-width, cover, centred, no blur,
 *   with a ~50% dark overlay for logo legibility.
 *
 * Fallbacks:
 *   - Dealer logo present:  SP × Dealer Logo
 *   - Dealer logo missing:  SP × Dealer Name
 *   - No dealer at all:     SP logo only, centred
 *
 * Height: ~340px on desktop, ~260px on mobile.
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
        style={{ fontFamily: "Didact Gothic, Century Gothic, sans-serif", gap: 32 }}
      >
        {/* Sound Proof — primary brand, always first, ~10% wider than dealer */}
        <div
          style={{
            width: "clamp(180px, 15vw, 280px)",
            height: "clamp(50px, 6vw, 80px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={SP_LOGO_URL}
            alt="Sound Proof"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>

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
              }}
            >
              ×
            </span>

            {dealerLogo ? (
              <div
                style={{
                  width: "clamp(162px, 13.5vw, 252px)",
                  height: "clamp(45px, 5.4vw, 72px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={dealerLogo}
                  alt={dealerName || "Dealer"}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            ) : (
              <span
                style={{
                  color: textColor,
                  fontSize: "clamp(18px, 2vw, 26px)",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
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