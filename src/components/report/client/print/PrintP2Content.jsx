/**
 * PrintP2Content
 * ---------------
 * Print/PDF content for P2 System Architecture page.
 *
 * Renders the same plan + summary as ClientP2SystemArchitecture
 * but in the print layout — heading region, drawing region (SVG),
 * support region (counts + level + upgrade).
 */

import React from "react";
import ClientP2SystemArchitecture from "../ClientP2SystemArchitecture";

import { REPORT_FONT_BODY as BODY_FONT } from '@/components/report/typography/reportTypography';

export default function PrintP2Content({
  p2Data,
  roomDims,
  seatingPositions,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  placedSpeakers,
  subwooferInstances,
}) {
  if (!p2Data) return null;

  return (
    <>
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameter 2 — Number of Discrete Speaker Channels</p>
      </div>
      <div className="client-report-print-drawing">
        <ClientP2SystemArchitecture
          p2Data={p2Data}
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          rsp={rsp}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          placedSpeakers={placedSpeakers}
          subwooferInstances={subwooferInstances}
          print
          printPart="drawing"
        />
      </div>
      <div className="client-report-print-support">
        <ClientP2SystemArchitecture
          p2Data={p2Data}
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          rsp={rsp}
          screenFrontPlaneM={screenFrontPlaneM}
          screenWidthM={screenWidthM}
          placedSpeakers={placedSpeakers}
          subwooferInstances={subwooferInstances}
          print
          printPart="support"
        />
      </div>
    </>
  );
}