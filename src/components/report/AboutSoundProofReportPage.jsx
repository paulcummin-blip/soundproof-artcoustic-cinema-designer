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

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

export default function AboutSoundProofReportPage({ variant = "full" }) {
  const { html, loading } = usePublicationContent("about_sound_proof");
  // compact = the Visual Report's short brand closing section. It keeps the
  // heading, logo and published copy, laid out in two columns so the section
  // stays within roughly half a page and never dominates the end of the report.
  const compact = variant === "compact";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: compact ? "0 0 4mm 0" : "10mm 14mm",
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
          maxWidth: compact ? "110mm" : "170mm",
          width: compact ? "42%" : "55%",
          height: "auto",
          maxHeight: compact ? "14mm" : "22mm",
          objectFit: "contain",
          marginBottom: compact ? "3mm" : "6mm",
        }}
      />

      {/* Thin brand-colour line */}
      <div
        style={{
          width: compact ? "40mm" : "55mm",
          height: "1.5px",
          background: BRAND_GREEN,
          marginBottom: compact ? "4mm" : "8mm",
        }}
      />

      {/* Heading */}
      <h1
        style={{
          fontFamily: FONT_HEADING,
          fontSize: compact ? "14pt" : "17pt",
          fontWeight: 400,
          color: TEXT_DARK,
          letterSpacing: "0.02em",
          margin: compact ? "0 0 4mm 0" : "0 0 8mm 0",
          textAlign: compact ? "left" : "center",
        }}
      >
        About Sound Proof
      </h1>

      {/* Body copy — canonical published content */}
      {loading ? (
        <div style={{ fontSize: "10pt", color: "#625143" }}>Loading…</div>
      ) : compact ? (
        <div
          style={{
            columnCount: 2,
            columnGap: "8mm",
            maxWidth: "165mm",
            width: "100%",
            fontSize: "9pt",
          }}
        >
          <PublicationContentHtml html={html} variant="print" style={{ width: "100%" }} />
        </div>
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