import React from "react";

const FONT_FAMILY = "Didact Gothic, Century Gothic, sans-serif";

// Fixed Sound Proof authority mark. This asset is deliberately independent of
// dealer branding so account-level logo controls can never replace or resize it.
const ARTCOUSTIC_AUTHORITY_LOGO =
  "https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/e1022b903_Artcousticlogo_greycopy.png";

/**
 * BrandBar — quiet secondary brand strip immediately below the hero.
 *
 * The strapline is supporting information, while the fixed Artcoustic mark
 * provides the permanent Sound Proof / Artcoustic authority signature.
 * Neither is sourced from dealer-account branding.
 */
export default function BrandBar() {
  return (
    <div
      className="w-full flex-shrink-0"
      style={{
        background: "#FFFFFF",
        borderTop: "1px solid #DCDBD6",
        borderBottom: "1px solid #ECE9E4",
        padding: "20px 32px",
      }}
    >
      <div
        style={{
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          fontFamily: FONT_FAMILY,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6B6B6B",
              lineHeight: 1.3,
            }}
          >
            Professional Home Cinema Engineering
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#9A9A9A",
              lineHeight: 1.3,
              marginTop: 3,
            }}
          >
            Powered by Artcoustic Design Intelligence (ADI)
          </div>
        </div>

        <img
          src={ARTCOUSTIC_AUTHORITY_LOGO}
          alt="Artcoustic"
          draggable="false"
          style={{
            display: "block",
            width: "clamp(136px, 15vw, 180px)",
            maxWidth: "40%",
            maxHeight: 40,
            height: "auto",
            objectFit: "contain",
            objectPosition: "right center",
            opacity: 0.82,
            flexShrink: 0,
            userSelect: "none",
          }}
        />
      </div>
    </div>
  );
}