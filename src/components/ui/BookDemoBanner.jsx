import React from "react";

export default function BookDemoBanner({
  href = "https://calendly.com/solutes-impish-0i/artcoustic-showroom",
}) {
  return (
    <div
      role="contentinfo"
      aria-label="Book a Demo"
      style={{
        marginTop: 16,
        padding: 16,
        borderTop: "1px solid #DCDBD6",
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
        style={{
          backgroundColor: "var(--brand-cta)",
          color: "#FFFFFF",
          border: "1px solid transparent",
          borderRadius: 10,
          padding: "10px 16px",
          fontSize: 14,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--brand-cta-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--brand-cta)")}
        aria-label="Book a Demo (opens in new tab)"
      >
        Book a Demo
      </button>
    </div>
  );
}