/**
 * AboutSoundProofReportPage
 * -------------------------
 * Shared closing page for the Visual Report and Technical Report.
 * Renders the canonical "About Sound Proof" content from PublicationContent.
 * Falls back to the application default if no custom content is published.
 *
 * Print-safe: the parent wrapper provides the page frame and page-break
 * rules. This component fills the available space with the content.
 */
import React from "react";
import { LOGO_URL } from "@/components/report/ReportCover";
import { usePublicationContent } from "@/components/publicationContent/usePublicationContent";
import PublicationContentHtml from "@/components/publicationContent/PublicationContentHtml";

const BRAND_GREEN = "#213428";
const TEXT_DARK = "#1B1A1A";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function AboutSoundProofReportPage() {
  const { html, loading } = usePublicationContent("about_sound_proof");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "10mm 14mm",
        boxSizing: "border-box",
        background: "#FFFFFF",
        fontFamily: FONT_BODY,
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {/* Logo — centred, restrained */}
      <img
        src={LOGO_URL}
        alt="Sound Proof"
        style={{
          maxWidth: "170mm",
          width: "55%",
          height: "auto",
          maxHeight: "22mm",
          objectFit: "contain",
          marginBottom: "6mm",
        }}
      />

      {/* Thin brand-colour line */}
      <div
        style={{
          width: "55mm",
          height: "1.5px",
          background: BRAND_GREEN,
          marginBottom: "8mm",
        }}
      />

      {/* Heading */}
      <h1
        style={{
          fontFamily: FONT_HEADING,
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

      {/* Body copy — canonical published content */}
      {loading ? (
        <div style={{ fontSize: "10pt", color: "#625143" }}>Loading…</div>
      ) : (
        <PublicationContentHtml
          html={html}
          variant="print"
          style={{ maxWidth: "160mm", width: "100%" }}
        />
      )}
    </div>
  );
}