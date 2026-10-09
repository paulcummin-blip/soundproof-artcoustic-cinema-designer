/**
 * ClientReportPage
 * ----------------
 * Page wrapper for the Visual Report.
 *
 * On screen: transparent container — preserves the existing card appearance
 * with no visible page headers or footers.
 *
 * In print: one A4 portrait page with three explicit document regions —
 * header (first page), drawing (SVG), and result summary. The SVG is
 * the primary scaling authority, scaled via CSS to fill the drawing region.
 */

import React from "react";
import PrintP5Content from "@/components/report/client/print/PrintP5Content";
import PrintP9Content from "@/components/report/client/print/PrintP9Content";
import PrintBassCapabilityContent from "@/components/report/client/print/PrintBassCapabilityContent";
import PrintBassResponseContent from "@/components/report/client/print/PrintBassResponseContent";
import ClientP19RspPresentation from "@/components/report/client/ClientP19RspPresentation";
import PrintP2Content from "@/components/report/client/print/PrintP2Content";
import PrintP7Content from "@/components/report/client/print/PrintP7Content";
import AboutSoundProofReportPage from "@/components/report/AboutSoundProofReportPage";
import PrintPerSeatPerformanceContent from "@/components/report/client/print/PrintPerSeatPerformanceContent";
import PrintAcousticTreatmentContent from "@/components/report/client/print/PrintAcousticTreatmentContent";
import ClientDesignHighlights from "@/components/report/client/ClientDesignHighlights";
import ClientRecommendedSeatingPosition from "@/components/report/client/ClientRecommendedSeatingPosition";
import ClientBestListeningArea from "@/components/report/client/ClientBestListeningArea";
import ClientTimbreConsistency from "@/components/report/client/ClientTimbreConsistency";
import ClientFrontSoundstageDynamicRange from "@/components/report/client/ClientFrontSoundstageDynamicRange";
import ClientNonScreenDynamicRange from "@/components/report/client/ClientNonScreenDynamicRange";
import ClientScreenSeating from "@/components/report/client/ClientScreenSeating";
import Rp22SeatCoverageSentence from "@/components/report/Rp22SeatCoverageSentence";
import { getSeatGradeColors } from "@/components/report/client/visualReportSeatStyle";
import ReportPrintHeader from '@/components/report/ReportPrintHeader';
import { REPORT_STRAPLINE } from '@/components/report/reportPrintHeader';
import { clientReportHeaderMeta } from '@/components/report/client/clientReportHeaderMeta';
import ProjectReportCover from '@/components/report/projectReport/ProjectReportCover';
import ProjectReportParameterIndex from '@/components/report/projectReport/ProjectReportParameterIndex';
import ProjectReportProducts from '@/components/report/projectReport/ProjectReportProducts';
import ProjectReportSectionPage from '@/components/report/projectReport/ProjectReportSectionPage';
import { PROJECT_REPORT_TITLE } from '@/components/report/projectReport/projectReportIdentity';

import ProjectReportSummaryOpening from "@/components/report/projectReport/ProjectReportSummaryOpening";

// Level → canonical grade colour for P12/P13 print result badges.
// Derived from RP22_GRADE_TOKENS — the same authority as grading pills.
function printLevelColor(lvl) {
  const grade = getSeatGradeColors(lvl);
  return grade.isFail ? grade.border : grade.text;
}

// The page types this wrapper composes for print. A page whose print
// composition is not implemented carries nothing on paper, so it must never be
// laid out as an empty A4 page shell — that shell is exactly what a printer
// emits as a blank page. Such a page is dropped from the print layout (see
// `client-report-page--no-print` in the print stylesheet) while the on-screen
// report keeps showing it unchanged.
const PRINTABLE_PAGE_TYPES = new Set([
  "project-report-cover",
  "parameter-index",
  "products-selected",
  "p5",
  "p9",
  "highlights",
  "best-listening-area",
  "timbre-consistency",
  "front-soundstage-dynamic-range",
  "non-screen-dynamic-range",
  "screen-seating",
  "p2-system-architecture",
  "p7-front-wides",
  "seating-position",
  "bass-capability",
  "bass-response",
  "p19-rsp",
  "per-seat-performance",
  "acoustic-treatment",
  "about-sound-proof",
]);

export default function ClientReportPage({
  children,
  isFirst,
  projectDetails,
  logoUrl,
  pageId,
  printData,
  version = null,
  // The document's own name — the Project Report. Passed in from the report's
  // identity authority so the masthead can never state an internal report name.
  reportTitle = PROJECT_REPORT_TITLE,
}) {
  // One project metadata line, composed once for the masthead: the same words
  // on screen and in the exported PDF, including the design version this report
  // documents.
  const metaLine = clientReportHeaderMeta(projectDetails, version);

  const sectionFirst = printData?.sectionFirst !== false;
  const sectionContinued = printData?.sectionContinued === true;
  // The canonical heading the composition authority resolved for this page —
  // its RP22 category (from technicalParameterMeta) or its document section —
  // with "— Continued" already stated ONCE for every page after the first of
  // that section. The composition authority is the only place the suffix is
  // applied: nothing here (or in the stylesheet) appends a second one.
  const sectionHeading = printData?.sectionHeading || null;
  // A page with no printable composition is never laid out for paper.
  const prints = PRINTABLE_PAGE_TYPES.has(printData?.type);

  return (
    <div
      className={`client-report-page print-avoid-break${isFirst ? " client-report-page--first" : ""}${prints ? "" : " client-report-page--no-print"}`}
      data-page-id={pageId}
      data-section-first={sectionFirst ? "true" : "false"}
      data-section-continued={sectionContinued ? "true" : "false"}
    >
      {/* A category heading is repeated on every page of its section: the first
          page states it, each later page states that it continues — the
          continuation suffix arrives in the heading TEXT from the composition
          authority, so it is stated once and this stylesheet never appends a
          second one. The heading always stays with the first content block
          beneath it, so it can never be orphaned at the foot of a page. */}
      <style>{`
        .client-report-print-heading { break-after: avoid; page-break-after: avoid; }
      `}</style>
      {/* First-page masthead — the Technical Report's cover structure: logo,
          brand strapline, small rule, the report title as the main headline,
          then one smaller centred project metadata line, closed by the masthead's
          own divider. Identical on screen and in the exported PDF, so the report
          opens on its own first page with no separate cover page above it. */}
      {isFirst && (
        <div className="client-report-page__header">
          <ReportPrintHeader
            title={reportTitle}
            project={projectDetails}
            meta={metaLine}
            className="client-report-print-only"
          />
          <img className="client-report-screen-only" src={logoUrl} alt="Sound Proof" />
          <div className="client-report-page__header-strapline client-report-screen-only">{REPORT_STRAPLINE.title}</div>
          <div className="client-report-page__header-strapline client-report-page__header-strapline--sub client-report-screen-only">{REPORT_STRAPLINE.sub}</div>
          <div className="client-report-page__header-rule client-report-screen-only" />
          <div className="client-report-page__header-title client-report-screen-only">{reportTitle}</div>
          <div className="client-report-page__header-meta client-report-screen-only">
            <span>{metaLine}</span>
          </div>
        </div>
      )}

      {/* Screen visual — hidden in print */}
      <div className="client-report-page__screen-visual client-report-screen-only">
        {children}
      </div>

      {/* Print content — three document regions: heading, drawing, result */}
      <div className="client-report-page__print-content client-report-print-only">
        {printData?.type === "p5" && (
          <PrintP5Content
            p5Snapshot={printData.p5Snapshot}
            seatResults={printData.seatResults}
            roomDims={printData.roomDims}
            screen={printData.screen}
            screenFrontPlaneM={printData.screenFrontPlaneM}
          />
        )}
        {printData?.type === "p9" && (
          <PrintP9Content
            p9Snapshot={printData.p9Snapshot}
            roomDims={printData.roomDims}
          />
        )}
        {printData?.type === "highlights" && (
          <>
            <div className="client-report-print-heading client-report-print-heading--centered">
              <h1 className="client-report-print-heading__title">{sectionHeading || "Design Summary"}</h1>
            </div>
            {/* The summary statement sits centred, with its own breathing room
                below the heading rather than crowding it. */}
            {/* The Design Summary opens on this actual cinema: the project-specific
                summary the report composed from its own evidence. */}
            {printData.summaryOpening && (
              <div style={{ padding: "0 24px", marginTop: "8mm", marginBottom: "4mm", textAlign: "center" }}>
                <ProjectReportSummaryOpening sentence={printData.summaryOpening} print />
              </div>
            )}
            {printData.coverageSentence && (
              <div style={{ padding: "0 24px", marginTop: "8mm", marginBottom: "4mm", textAlign: "center" }}>
                <Rp22SeatCoverageSentence sentence={printData.coverageSentence} variant="print" />
              </div>
            )}
            <div className="client-report-print-drawing" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ClientDesignHighlights highlights={printData.highlights} print />
            </div>
          </>
        )}
        {printData?.type === "best-listening-area" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">{sectionHeading || "Spatial Resolution"}</h1>
              <p className="client-report-print-heading__subtitle">RP22 Parameters 4, 6 & 10 — Listening Quality Across the Seats</p>
            </div>
            <div className="client-report-print-drawing">
              <ClientBestListeningArea
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                counts={printData.counts}
                explanation={printData.explanation}
                print
                printPart="drawing"
              />
            </div>
            <div className="client-report-print-support">
              <ClientBestListeningArea
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                counts={printData.counts}
                explanation={printData.explanation}
                print
                printPart="support"
              />
            </div>
          </>
        )}
        {printData?.type === "timbre-consistency" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">{sectionHeading || "Timbre Matching"}</h1>
              <p className="client-report-print-heading__subtitle">RP22 Parameter 17 — Consistent Sound Across the Seats</p>
            </div>
            <div className="client-report-print-drawing">
              <ClientTimbreConsistency
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                counts={printData.counts}
                print
                printPart="drawing"
              />
            </div>
            <div className="client-report-print-support">
              <ClientTimbreConsistency
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                counts={printData.counts}
                print
                printPart="support"
              />
            </div>
            <div className="client-report-print-result">
              <div className="client-report-print-result__content">
                <div className="client-report-print-result__label">Consistent Sound Across the Seats</div>
                <div className="client-report-print-result__explanation">
                  Tonal balance consistency between screen and surround/overhead channels at each seating position.
                </div>
              </div>
            </div>
          </>
        )}
        {printData?.type === "front-soundstage-dynamic-range" && (() => {
          const color = printLevelColor(printData.level);
          return (
            <>
              <div className="client-report-print-heading">
                <h1 className="client-report-print-heading__title">{sectionHeading || "Dynamic Range"}</h1>
                <p className="client-report-print-heading__subtitle">RP22 Parameter 12 — Screen Speakers SPL Capability at RSP</p>
              </div>
              <div className="client-report-print-drawing">
                <ClientFrontSoundstageDynamicRange
                  roomDims={printData.roomDims}
                  seats={printData.seats}
                  rsp={printData.rsp}
                  screenFrontPlaneM={printData.screenFrontPlaneM}
                  screenWidthM={printData.screenWidthM}
                  placedSpeakers={printData.placedSpeakers}
                  fl={printData.fl}
                  fc={printData.fc}
                  fr={printData.fr}
                  minimum={printData.minimum}
                  level={printData.level}
                  targetBasisLabel={printData.targetBasisLabel}
                  resultHeading={printData.resultHeading}
                  resultExplanation={printData.resultExplanation}
                  print
                />
              </div>
              <div className="client-report-print-result" style={{ borderColor: `${color}40` }}>
                <div className="client-report-print-result__badge" style={{
                  borderColor: color, background: `${color}25`, color,
                }}>
                  {printData.level || "—"}
                </div>
                <div className="client-report-print-result__content">
                  <div className="client-report-print-result__label">{printData.resultHeading || "Front Soundstage Capability"}</div>
                  <div className="client-report-print-result__explanation">
                    {printData.resultExplanation || "The left, centre and right speakers operate together as a single acoustic system, maintaining clear dialogue and preserving the impact of demanding movie soundtracks at the reference seating position."}
                  </div>
                  <div className="client-report-print-result__supporting">
                    {printData.minimum?.formatted ?? "—"} minimum capability — RP22 Parameter 12
                  </div>
                </div>
              </div>
            </>
          );
        })()}
        {printData?.type === "non-screen-dynamic-range" && (() => {
          const color = printLevelColor(printData.level);
          return (
            <>
              <div className="client-report-print-heading">
                <h1 className="client-report-print-heading__title">{sectionHeading || "Dynamic Range"}</h1>
                <p className="client-report-print-heading__subtitle">RP22 Parameter 13 — Non-Screen Speakers SPL Capability at RSP</p>
              </div>
              <div className="client-report-print-drawing">
                <ClientNonScreenDynamicRange
                  roomDims={printData.roomDims}
                  seats={printData.seats}
                  rsp={printData.rsp}
                  screenFrontPlaneM={printData.screenFrontPlaneM}
                  screenWidthM={printData.screenWidthM}
                  placedSpeakers={printData.placedSpeakers}
                  speakerSplValues={printData.speakerSplValues}
                  minimum={printData.minimum}
                  level={printData.level}
                  targetBasisLabel={printData.targetBasisLabel}
                  resultHeading={printData.resultHeading}
                  resultExplanation={printData.resultExplanation}
                  print
                />
              </div>
              <div className="client-report-print-result" style={{ borderColor: `${color}40` }}>
                <div className="client-report-print-result__badge" style={{
                  borderColor: color, background: `${color}25`, color,
                }}>
                  {printData.level || "—"}
                </div>
                <div className="client-report-print-result__content">
                  <div className="client-report-print-result__label">{printData.resultHeading || "Surround Capability"}</div>
                  <div className="client-report-print-result__explanation">
                    {printData.resultExplanation || "The surround and overhead speakers maintain consistent impact and clarity across the listening area, preserving the immersion of demanding movie soundtracks at the reference seating position."}
                  </div>
                  <div className="client-report-print-result__supporting">
                    {printData.minimum?.formatted ?? "—"} minimum capability — RP22 Parameter 13
                  </div>
                </div>
              </div>
            </>
          );
        })()}
        {printData?.type === "screen-seating" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">{sectionHeading || "Viewing Experience"}</h1>
              <p className="client-report-print-heading__subtitle">RP23 — Screen Size &amp; Seating Position</p>
            </div>
            <div className="client-report-print-drawing">
              <ClientScreenSeating
                roomDims={printData.roomDims}
                seats={printData.seats}
                rows={printData.rows}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                zones={printData.zones}
                explanation={printData.explanation}
                projectorLumens={printData.projectorLumens}
                print
                printPart="drawing"
              />
            </div>
            <div className="client-report-print-support">
              <ClientScreenSeating
                roomDims={printData.roomDims}
                seats={printData.seats}
                rows={printData.rows}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                zones={printData.zones}
                explanation={printData.explanation}
                projectorLumens={printData.projectorLumens}
                print
                printPart="support"
              />
            </div>
            <div className="client-report-print-result">
              <div className="client-report-print-result__content">
                <div className="client-report-print-result__label">RP23 Viewing Result</div>
                <div className="client-report-print-result__explanation">
                  {printData.explanation || "Viewing angle range for each seating position relative to the screen."}
                </div>
              </div>
            </div>
          </>
        )}
        {printData?.type === "p2-system-architecture" && (
          <PrintP2Content
            p2Data={printData.p2Data}
            roomDims={printData.roomDims}
            seatingPositions={printData.seatingPositions}
            rsp={printData.rsp}
            screenFrontPlaneM={printData.screenFrontPlaneM}
            screenWidthM={printData.screenWidthM}
            placedSpeakers={printData.placedSpeakers}
            subwooferInstances={printData.subwooferInstances}
          />
        )}
        {printData?.type === "p7-front-wides" && (
          <PrintP7Content
            p7Data={printData.p7Data}
            roomDims={printData.roomDims}
            screenFrontPlaneM={printData.screenFrontPlaneM}
            screenWidthM={printData.screenWidthM}
          />
        )}
        {printData?.type === "seating-position" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">{sectionHeading || "Spatial Resolution"}</h1>
              <p className="client-report-print-heading__subtitle">RP22 Parameter 1 — Listener Distance from Room Boundaries</p>
            </div>
            <div className="client-report-print-drawing">
              <ClientRecommendedSeatingPosition
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                screen={printData.screen}
                print
                printPart="drawing"
              />
            </div>
            <div className="client-report-print-support">
              <ClientRecommendedSeatingPosition
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                screen={printData.screen}
                print
                printPart="support"
              />
            </div>
          </>
        )}
        {/* The detailed P14/P18 page prints under its own RP22 category heading
            (Dynamic Range), and the P19/P20 page under Timbre Matching — the same
            heading every other page of that section states, never a category of
            the bass page's own. */}
        {printData?.type === "bass-capability" && (
          <PrintBassCapabilityContent
            bassPerformance={printData.bassPerformance}
            heading={sectionHeading}
          />
        )}
        {printData?.type === "bass-response" && (
          <PrintBassResponseContent
            heading={sectionHeading}
            bassPerformance={printData.bassPerformance}
            roomDims={printData.roomDims}
            seatingPositions={printData.seatingPositions}
            rsp={printData.rsp}
            screenFrontPlaneM={printData.screenFrontPlaneM}
            screenWidthM={printData.screenWidthM}
          />
        )}
        {printData?.type === "p19-rsp" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">{sectionHeading || "Detailed Bass Evidence"}</h1>
              <p className="client-report-print-heading__subtitle">RP22 Parameter 19 — Bass Response at the Reference Seating Position</p>
            </div>
            <div className="client-report-print-drawing">
              <ClientP19RspPresentation
                bassPerformance={printData.bassPerformance}
                p19Graph={printData.p19Graph}
                roomDims={printData.roomDims}
                seatingPositions={printData.seatingPositions}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                subwooferInstances={printData.subwooferInstances}
                print
                printPart="drawing"
              />
            </div>
            <div className="client-report-print-support">
              <ClientP19RspPresentation
                bassPerformance={printData.bassPerformance}
                p19Graph={printData.p19Graph}
                roomDims={printData.roomDims}
                seatingPositions={printData.seatingPositions}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                subwooferInstances={printData.subwooferInstances}
                print
                printPart="result"
              />
            </div>
          </>
        )}
        {printData?.type === "per-seat-performance" && (
          <PrintPerSeatPerformanceContent rows={printData.seatRows} rsp={printData.rsp} />
        )}
        {/* Acoustic Treatment — the printed treatment page. Its content and its
            quantity come from the acoustic treatment page authority, and the page
            itself is only ever added to the report when the design carries
            treatment, so this composition always has something to print. */}
        {printData?.type === "acoustic-treatment" && (
          <PrintAcousticTreatmentContent {...printData} />
        )}
        {printData?.type === "about-sound-proof" && (
          <AboutSoundProofReportPage html={printData.aboutHtml} />
        )}
        {/* 01 Cover — the project's own identity and the report's contents. */}
        {printData?.type === "project-report-cover" && (
          <ProjectReportCover
            projectDetails={printData.projectDetails || projectDetails}
            version={printData.version || version}
            reference={printData.reference || null}
            generatedOn={printData.generatedOn || null}
            print
          />
        )}
        {/* 04–06 Every parameter of the category, explicitly assessed — including
            the parameters that carry no drawing page of their own. The category
            heading is the composition authority's own heading for the section, so
            a continuation page states it with "— Continued". */}
        {printData?.type === "parameter-index" && (
          <ProjectReportSectionPage heading={sectionHeading} print>
            <ProjectReportParameterIndex
              category={printData.category}
              rows={printData.rows}
              print
            />
          </ProjectReportSectionPage>
        )}
        {/* 10 Systems / Products Selected — the complete equipment schedule. */}
        {printData?.type === "products-selected" && (
          <ProjectReportSectionPage heading={sectionHeading} print>
            <ProjectReportProducts rows={printData.rows} print />
          </ProjectReportSectionPage>
        )}
      </div>

    </div>
  );
}