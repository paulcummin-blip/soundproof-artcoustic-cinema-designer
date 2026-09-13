/**
 * PrintP7Content
 * ---------------
 * Print/PDF content for P7 Front Wide Placement page.
 *
 * Renders the same plan + summary as ClientP7FrontWides
 * but in the print layout — heading region, drawing region (SVG),
 * support region (legend + level badge).
 */

import React from "react";
import ClientP7FrontWides from "../ClientP7FrontWides";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function PrintP7Content({
  p7Data,
  roomDims,
  screenFrontPlaneM,
  screenWidthM,
}) {
  if (!p7Data) return null;

  return (
    <>
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameter 7 — Front Wide Speaker Position</p>
      </div>
      <div className="client-report-print-drawing">
        <ClientP7FrontWides
          p7Data={p7Data}
          roomDims={roomDims}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          print
          printPart="drawing"
        />
      </div>
      <div className="client-report-print-support">
        <ClientP7FrontWides
          p7Data={p7Data}
          roomDims={roomDims}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          print
          printPart="support"
        />
      </div>
    </>
  );
}