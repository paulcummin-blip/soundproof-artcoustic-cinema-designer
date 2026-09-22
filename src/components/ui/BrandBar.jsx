import React from "react";

const FONT_FAMILY = "Didact Gothic, Century Gothic, sans-serif";

/**
 * BrandBar — quiet secondary brand strip immediately below the hero.
 *
 * White background, ~60–70px tall, separated from the hero by a subtle
 * divider. Left-aligned supporting text only:
 *
 *   Professional Home Cinema Engineering
 *   Powered by Artcoustic Design Intelligence (ADI)
 *
 * This is supporting information — it never competes with the hero branding.
 */
export default function BrandBar() {
  return (
    <div
      className="w-full flex-shrink-0"
      style={{
        background: "#FFFFFF",
        borderTop: "1px solid #DCDBD6",
        padding: "20px 32px",
      }}
    >
      <div style={{ fontFamily: FONT_FAMILY }}>
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
    </div>
  );
}