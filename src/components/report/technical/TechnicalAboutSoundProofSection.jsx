/**
 * TechnicalAboutSoundProofSection
 * -------------------------------
 * The Technical Report's closing About Sound Proof page — a MANDATORY page of the
 * report, never omitted.
 *
 * The exported PDF is a clone of the report's rendered DOM taken at export time,
 * so a page still waiting for its copy could be captured as an empty sheet or as
 * a visible "Loading…" label. That is prevented at the source instead of by
 * dropping the page: the copy is resolved through aboutSoundProofCopy, which
 * answers with the published copy when it says something and otherwise with the
 * built-in copy bundled with the app. The fallback is available synchronously,
 * so this block always renders finished copy.
 */
import React from "react";
import AboutSoundProofReportPage from "@/components/report/AboutSoundProofReportPage";
import { usePublicationContent } from "@/components/publicationContent/usePublicationContent";

export default function TechnicalAboutSoundProofSection() {
  // Never awaited: the hook seeds the bundled fallback, and the page resolves
  // published-copy-or-fallback on its own. The block therefore always carries
  // complete copy — no blank page and no loading page can be exported.
  const { html } = usePublicationContent("about_sound_proof");

  return (
    <section
      id="pdf-about-sound-proof"
      className="report-page-block report-page-block--summary"
      data-report-block="about-sound-proof"
      data-report-page-start="true"
      style={{ background: "#FFFFFF", padding: 0, margin: 0 }}
    >
      <AboutSoundProofReportPage html={html} />
    </section>
  );
}