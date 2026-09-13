/**
 * AboutSoundProofReportPage
 * -------------------------
 * Shared closing page for the Visual Report and Technical Report.
 * Renders the fixed "About Sound Proof" brand/explanation content as a
 * single A4 portrait page. Used by both report PDFs so the copy, spacing
 * and branding stay identical.
 *
 * Print-safe: the parent wrapper provides the page frame and page-break
 * rules. This component fills the available space with the content.
 */

import React from "react";
import { LOGO_URL } from "@/components/report/ReportCover";

const BRAND_GREEN = "#213428";
const TEXT_DARK = "#1B1A1A";
const TEXT_BODY = "#3E4349";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function AboutSoundProofReportPage() {
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

      {/* Body copy */}
      <div
        style={{
          maxWidth: "160mm",
          width: "100%",
          fontSize: "10pt",
          lineHeight: 1.6,
          color: TEXT_BODY,
          textAlign: "left",
        }}
      >
        <p style={{ margin: "0 0 3.5mm 0" }}>
          Sound Proof is a cinema design and performance prediction tool built
          around the principles of CEDIA RP22. It helps designers move beyond
          simply choosing loudspeakers and placing them in a room, and instead
          consider how the complete system is expected to perform for the
          people actually using it.
        </p>

        <p style={{ margin: "0 0 3.5mm 0" }}>
          RP22 separates audio performance into three key areas:{" "}
          <strong>Dynamic Range, Spatial Resolution and Timbre Matching</strong>.
          In an ideal world, every parameter would achieve the highest possible
          level. In practice, real projects involve compromise. Aesthetic
          requirements may limit loudspeaker size or placement. Practical
          constraints may affect seating positions, room layout or available
          locations. Financial considerations may determine how far a system
          can be taken.
        </p>

        <p style={{ margin: "0 0 3.5mm 0" }}>
          Sound Proof is designed to make those compromises visible and
          understandable.
        </p>

        <p style={{ margin: "0 0 3.5mm 0" }}>
          Rather than presenting RP22 as a pass-or-fail exercise, the app helps
          the designer explain where limitations exist, what they mean in real
          terms, and what changes would improve the result. This creates a more
          informed conversation with the client, allowing decisions to be made
          consciously rather than by accident.
        </p>

        <p style={{ margin: "0 0 3.5mm 0" }}>
          The objective is therefore not necessarily to force every parameter
          to Level 4. It is to achieve the{" "}
          <strong>
            highest appropriate performance level that the aesthetics,
            practicality and budget of the project allow
          </strong>
          . Done properly, that process leads to the right system for the room,
          the application and the client brief.
        </p>

        <p style={{ margin: "0 0 3.5mm 0" }}>
          Sound Proof combines the strict recommendations and performance
          intent of RP22 with unique raw engineering data from{" "}
          <strong>Artcoustic Loudspeakers</strong>. Instead of relying on
          generic loudspeaker assumptions, it models real Artcoustic products
          and predicts their expected in-room behaviour, capability and
          performance.
        </p>

        <p style={{ margin: 0 }}>
          The result is a design tool that brings together engineering
          credibility and client-facing clarity: helping professionals specify
          with greater confidence, demonstrate why a system has been designed
          in a particular way, and give clients a clear understanding of the
          choices behind their cinema.
        </p>
      </div>
    </div>
  );
}