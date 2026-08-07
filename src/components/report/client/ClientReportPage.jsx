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
import ClientDesignHighlights from "@/components/report/client/ClientDesignHighlights";
import ClientRecommendedSeatingPosition from "@/components/report/client/ClientRecommendedSeatingPosition";
import ClientBestListeningArea from "@/components/report/client/ClientBestListeningArea";
import ClientTimbreConsistency from "@/components/report/client/ClientTimbreConsistency";
import ClientFrontSoundstageDynamicRange from "@/components/report/client/ClientFrontSoundstageDynamicRange";
import ClientNonScreenDynamicRange from "@/components/report/client/ClientNonScreenDynamicRange";
import ClientScreenSeating from "@/components/report/client/ClientScreenSeating";

// Level → brand colour for P12/P13 print result badges (mirrors shared card)
const PRINT_LEVEL_COLOR = {
  L4: "#213428", L3: "#3E4349", L2: "#625143", L1: "#4A230F",
  FAIL: "#4A230F", default: "#C1B6AD",
};
function printLevelColor(lvl) {
  return PRINT_LEVEL_COLOR[lvl] || PRINT_LEVEL_COLOR.default;
}

export default function ClientReportPage({ children, isFirst, projectDetails, logoUrl, pageId, printData }) {
  const projectName = projectDetails?.name || "Untitled";
  const clientName = projectDetails?.client_name || "";
  const projectId = projectDetails?.id || "";
  const createdDate = projectDetails?.created_date;

  // Short project reference from ID (first 8 chars of UUID)
  const projectRef = projectId ? String(projectId).substring(0, 8).toUpperCase() : "";

  // Format created date only when valid
  let createdDateStr = "";
  if (createdDate) {
    const d = new Date(createdDate);
    if (!isNaN(d.getTime())) {
      createdDateStr = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }
  }

  return (
    <div className={`client-report-page print-avoid-break${isFirst ? " client-report-page--first" : ""}`} data-page-id={pageId}>
      {/* Print-only header (first page) */}
      {isFirst && (
        <div className="client-report-page__header client-report-print-only">
          <img src={logoUrl} alt="Sound Proof" />
          <div className="client-report-page__header-title">Visual Report</div>
          <div className="client-report-page__header-meta">
            <span>{projectName}</span>
            {clientName && <span>{clientName}</span>}
            {projectRef && <span>Ref: {projectRef}</span>}
            {createdDateStr && <span>{createdDateStr}</span>}
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
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">Design Summary</h1>
            </div>
            <div className="client-report-print-drawing" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ClientDesignHighlights highlights={printData.highlights} print />
            </div>
          </>
        )}
        {printData?.type === "best-listening-area" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
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
              />
            </div>
            <div className="client-report-print-result">
              <div className="client-report-print-result__content">
                <div className="client-report-print-result__label">Best Listening Area</div>
                <div className="client-report-print-result__explanation">
                  {printData.explanation || "The seating area provides a range of listening positions, with the strongest available seats highlighted."}
                </div>
              </div>
            </div>
          </>
        )}
        {printData?.type === "timbre-consistency" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">Timbre Matching</h1>
              <p className="client-report-print-heading__subtitle">RP22 Parameters 16 & 17 — Consistent Sound Across the Seats</p>
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
              />
            </div>
            <div className="client-report-print-result">
              <div className="client-report-print-result__content">
                <div className="client-report-print-result__label">Consistent Sound Across the Seats</div>
                <div className="client-report-print-result__explanation">
                  The system is designed to maintain a consistent tonal character across the seating area, preserving clarity and detail as listeners move away from the reference position.
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
                <h1 className="client-report-print-heading__title">Dynamic Range</h1>
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
                <h1 className="client-report-print-heading__title">Dynamic Range</h1>
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
              <h1 className="client-report-print-heading__title">Viewing Experience</h1>
              <p className="client-report-print-heading__subtitle">RP23 — Screen Size &amp; Seating Position</p>
            </div>
            <div className="client-report-print-drawing">
              <ClientScreenSeating
                roomDims={printData.roomDims}
                seats={printData.seats}
                rsp={printData.rsp}
                screenFrontPlaneM={printData.screenFrontPlaneM}
                screenWidthM={printData.screenWidthM}
                zones={printData.zones}
                explanation={printData.explanation}
                print
              />
            </div>
            <div className="client-report-print-result">
              <div className="client-report-print-result__content">
                <div className="client-report-print-result__label">Screen Size and Seating</div>
                <div className="client-report-print-result__explanation">
                  {printData.explanation || "The screen size is well matched to the seating area, placing the main listening positions within the preferred viewing range."}
                </div>
              </div>
            </div>
          </>
        )}
        {printData?.type === "seating-position" && (
          <>
            <div className="client-report-print-heading">
              <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
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
              />
            </div>
            <div className="client-report-print-result">
              <div className="client-report-print-result__content">
                <div className="client-report-print-result__label">Recommended Seating Position</div>
                <div className="client-report-print-result__explanation">
                  The two centre seats sit within the preferred listening area, giving them the greatest separation from the room boundaries. The outer seats remain good listening positions, while their closer proximity to the side walls slightly reduces their spatial performance.
                </div>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}