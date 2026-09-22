import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { DEALER_BRAND_UPDATED_EVENT, loadDealerBrand } from "@/components/account/dealerBrandAuthority";

const SP_LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg";

/**
 * HeroBanner — centred banner shown at the top of the main content area.
 *
 * Sound Proof is always visually dominant. Dealer branding (logo + name) is
 * secondary and never exceeds ~60% of the Sound Proof logo prominence.
 *
 * If the dealer has uploaded a hero background image, it is rendered with a
 * subtle blur and a translucent dark overlay for text legibility. If no
 * background image exists, the neutral Sound Proof background is used.
 *
 * The banner is not sticky — it scrolls naturally out of view with the page.
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
  const dealerTagline = brand?.tagline || null;
  // On dark hero backgrounds, prefer the white logo if available.
  const dealerLogo = heroBg
    ? (brand?.white_logo_url || brand?.dealer_logo_url || null)
    : (brand?.dealer_logo_url || brand?.white_logo_url || null);
  const hasDealer = !!(dealerLogo || dealerName);

  const textColor = heroBg ? "#FFFFFF" : "#1B1A1A";
  const subTextColor = heroBg ? "rgba(255,255,255,0.82)" : "#625143";
  const partnerColor = heroBg ? "rgba(255,255,255,0.55)" : "#9C9A95";
  const separatorColor = heroBg ? "rgba(255,255,255,0.25)" : "#DCDBD6";

  return (
    <div
      className="relative w-full flex-shrink-0"
      style={{
        background: heroBg ? "#1B1A1A" : "#F8F8F7",
        borderBottom: `1px solid ${heroBg ? "rgba(255,255,255,0.12)" : "#DCDBD6"}`,
      }}
    >
      {/* Blurred background image */}
      {heroBg && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${heroBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(4px)",
              transform: "scale(1.08)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.55)" }}
          />
        </>
      )}

      {/* Centred content */}
      <div
        className="relative flex flex-col items-center justify-center text-center px-4 py-8"
        style={{ fontFamily: "Didact Gothic, Century Gothic, sans-serif" }}
      >
        {/* Sound Proof — primary brand */}
        <img
          src={SP_LOGO_URL}
          alt="Sound Proof"
          style={{ height: 56, objectFit: "contain", maxWidth: 280 }}
        />
        <div
          className="mt-2 font-semibold"
          style={{ color: textColor, fontSize: 14, letterSpacing: "0.04em" }}
        >
          Professional Home Cinema Engineering
        </div>
        <div
          className="mt-0.5"
          style={{ color: subTextColor, fontSize: 11, letterSpacing: "0.03em" }}
        >
          Powered by Artcoustic Design Intelligence
        </div>

        {/* Dealer branding — secondary */}
        {hasDealer && (
          <>
            {/* Separator */}
            <div
              className="flex items-center gap-3 my-4"
              style={{ width: "100%", maxWidth: 360 }}
            >
              <div style={{ flex: 1, height: 1, background: separatorColor }} />
              <span style={{ color: partnerColor, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                In partnership with
              </span>
              <div style={{ flex: 1, height: 1, background: separatorColor }} />
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-center">
              {dealerLogo && (
                <img
                  src={dealerLogo}
                  alt={dealerName || "Dealer"}
                  style={{ height: 34, objectFit: "contain", maxWidth: 200 }}
                />
              )}
              {dealerName && (
                <span
                  style={{
                    color: textColor,
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {dealerName}
                </span>
              )}
            </div>

            {dealerTagline && (
              <div
                className="mt-1.5"
                style={{ color: subTextColor, fontSize: 11, fontStyle: "italic" }}
              >
                {dealerTagline}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}