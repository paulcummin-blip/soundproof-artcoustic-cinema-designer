/**
 * TechnicalAboutSoundProofSection
 * -------------------------------
 * The Technical Report's closing About Sound Proof page.
 *
 * The exported PDF is a clone of the report's rendered DOM taken at export time,
 * so a page whose copy has not resolved would be captured as an empty sheet — or,
 * worse, as a visible "Loading…" label. This block therefore renders ONLY when the
 * canonical content is available: while it is not ready the page does not exist at
 * all, so the export simply ends on the previous page.
 *
 * The content is read here, once, and handed to the page as a prop, so the printed
 * document carries finished copy and no page ever prints in a waiting state.
 */
import React from "react";
import AboutSoundProofReportPage from "@/components/report/AboutSoundProofReportPage";
import { usePublicationContent } from "@/components/publicationContent/usePublicationContent";

export default function TechnicalAboutSoundProofSection() {
  const { html, loading } = usePublicationContent("about_sound_proof");
  // Ready means resolved AND saying something: the page is omitted rather than
  // printed blank.
  const ready = !loading && typeof html === "string" && html.trim().length > 0;
  if (!ready) return null;

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