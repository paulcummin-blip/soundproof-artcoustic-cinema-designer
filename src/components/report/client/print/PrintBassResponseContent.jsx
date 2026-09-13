/**
 * PrintBassResponseContent
 * --------------------------
 * Print/PDF content for Bass Performance Page 2 (P19/P20).
 *
 * Renders the same room plan + per-seat table as ClientBassResponse
 * but in the print layout — heading region, drawing region (SVG),
 * support region (legend + table).
 *
 * Handles the NOT CALCULATED state at the print level to avoid
 * duplicate headings from the screen component.
 */

import React from "react";
import ClientBassResponse from "../ClientBassResponse";
import { isAssessedLevel } from "../visualReportSeatStyle";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function PrintBassResponseContent({
  bassPerformance,
  roomDims,
  seatingPositions,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
}) {
  if (!bassPerformance) return null;

  const { p19, p20 } = bassPerformance;
  const hasP19 = p19 && isAssessedLevel(p19.achievedLevel);
  const hasP20 = p20 && isAssessedLevel(p20.achievedLevel);

  // NOT CALCULATED — render a clean print state without delegating to the
  // screen component (which would produce duplicate headings).
  if (!hasP19 && !hasP20) {
    return (
      <>
        <div className="client-report-print-heading">
          <h1 className="client-report-print-heading__title">Bass Performance</h1>
          <p className="client-report-print-heading__subtitle">RP22 Parameters 19 &amp; 20 — Response Quality and Seat Consistency</p>
        </div>
        <div className="client-report-print-drawing" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            fontSize: 16,
            color: "#8A8580",
            fontFamily: BODY_FONT,
            padding: "32px 24px",
            background: "#F5F4F1",
            borderRadius: 8,
            border: "1px solid #D9D5CE",
          }}>
            NOT CALCULATED
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Bass Performance</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameters 19 &amp; 20 — Response Quality and Seat Consistency</p>
      </div>
      <div className="client-report-print-drawing">
        <ClientBassResponse
          bassPerformance={bassPerformance}
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          rsp={rsp}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          print
          printPart="drawing"
        />
      </div>
      <div className="client-report-print-support">
        <ClientBassResponse
          bassPerformance={bassPerformance}
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          rsp={rsp}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          print
          printPart="support"
        />
      </div>
    </>
  );
}