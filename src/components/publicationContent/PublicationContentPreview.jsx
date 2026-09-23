/**
 * PublicationContentPreview — renders publication content in a preview frame.
 *
 * Two modes:
 *  - 'desktop': simulates the on-screen About page appearance.
 *  - 'print': simulates the A4 report page appearance.
 *
 * Props:
 *  - html: string
 *  - mode: 'desktop' | 'print'
 */
import React from "react";
import { LOGO_URL } from "@/components/report/ReportCover";

const BRAND_GREEN = "#213428";
const TEXT_DARK = "#1B1A1A";

export default function PublicationContentPreview({ html, mode = "desktop" }) {
  if (mode === "print") {
    return (
      <div
        style={{
          width: "210mm",
          minHeight: "297mm",
          background: "#FFFFFF",
          padding: "10mm 14mm",
          boxSizing: "border-box",
          fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
          margin: "0 auto",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src={LOGO_URL}
            alt="Sound Proof"
            style={{ maxWidth: "170mm", width: "55%", maxHeight: "22mm", objectFit: "contain", marginBottom: "6mm" }}
          />
          <div style={{ width: "55mm", height: "1.5px", background: BRAND_GREEN, marginBottom: "8mm" }} />
          <h1
            style={{
              fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif",
              fontSize: "17pt",
              fontWeight: 400,
              color: TEXT_DARK,
              letterSpacing: "0.02em",
              margin: "0 0 8mm 0",
              textAlign: "center",
            }}
          >
            About Sound Proof
          </h1>
          <div
            style={{
              maxWidth: "160mm",
              width: "100%",
              fontSize: "10pt",
              lineHeight: 1.6,
              color: "#3E4349",
              textAlign: "left",
            }}
            dangerouslySetInnerHTML={{ __html: html || "" }}
          />
        </div>
      </div>
    );
  }

  // desktop preview
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "210mm",
        minHeight: "297mm",
        background: "#fff",
        borderLeft: `3px solid ${BRAND_GREEN}`,
        borderRadius: "2px",
        padding: "clamp(24px, 6vw, 64px) clamp(28px, 7vw, 80px)",
        margin: "0 auto",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <img
          src={LOGO_URL}
          alt="Sound Proof"
          style={{ maxWidth: 280, width: "60%", objectFit: "contain" }}
        />
      </div>
      <div style={{ width: "40%", maxWidth: 200, height: 2, background: BRAND_GREEN, margin: "0 auto 40px auto" }} />
      <h1
        style={{
          fontFamily: "'Didact Gothic', sans-serif",
          fontSize: "clamp(20px, 3vw, 26px)",
          fontWeight: 600,
          color: TEXT_DARK,
          letterSpacing: "0.02em",
          textAlign: "center",
          marginBottom: 40,
        }}
      >
        About Sound Proof
      </h1>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "clamp(14px, 1.1vw, 15.5px)",
          lineHeight: 1.85,
          color: "#3E4349",
        }}
        dangerouslySetInnerHTML={{ __html: html || "" }}
      />
    </div>
  );
}