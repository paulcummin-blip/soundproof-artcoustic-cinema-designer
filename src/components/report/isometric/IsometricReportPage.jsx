// IsometricReportPage.jsx
// ---------------------------------------------------------------------------
// One A4 portrait report page: the deterministic isometric room view.
//
// The IsometricReportImage component (hidden off-screen) renders the scene to a
// PNG data URL using the existing scene-data and mesh builders plus a fixed
// report-only camera. The data URL is then placed in a ReportDrawingPage so the
// PDF capture sees a normal <img>, never a live WebGL canvas.
//
// No user interaction, no saved camera view, no screenshot capture step. The
// image is regenerated whenever the physical design changes.

import React, { useMemo, useState } from "react";

import ReportDrawingPage from "@/components/report/ReportDrawingPage";
import IsometricReportImage from "./IsometricReportImage";

/**
 * @param {object} props
 * @param {string} props.projectName
 * @param {string} props.clientName
 * @param {string} props.readinessKey - "projectId::versionId" for the export gate
 * @param {object} props.appState
 * @param {object} props.stableDimensions
 * @param {Array} props.placedSpeakers
 * @param {Array} props.seatingPositions
 * @param {object|null} props.primarySeatingPosition
 * @param {object} props.screen
 * @param {Array} props.roomElements
 * @param {string} props.dolbyLayout
 * @param {function|null} [props.getSpeakerVisibility]
 */
export default function IsometricReportPage({
  projectName = "",
  clientName = "",
  readinessKey = null,
  appState,
  stableDimensions,
  placedSpeakers = [],
  seatingPositions = [],
  primarySeatingPosition = null,
  screen = null,
  roomElements = [],
  dolbyLayout = "5.1",
  getSpeakerVisibility = null,
}) {
  const [dataUrl, setDataUrl] = useState(null);

  const identity = useMemo(
    () => ({ projectName, clientName }),
    [projectName, clientName],
  );

  return (
    <>
      <IsometricReportImage
        appState={appState}
        stableDimensions={stableDimensions}
        placedSpeakers={placedSpeakers}
        seatingPositions={seatingPositions}
        mlpPoint={primarySeatingPosition}
        screen={screen}
        roomElements={roomElements}
        dolbyLayout={dolbyLayout}
        getSpeakerVisibility={getSpeakerVisibility}
        readinessKey={readinessKey}
        onReady={setDataUrl}
      />
      <ReportDrawingPage
        id="pdf-isometric-room-view"
        blockName="isometric-room-view"
        title="Isometric Room View"
        {...identity}
        sheetCode="ISO-01"
        status="NOT FOR SCALING"
        imageSrc={dataUrl}
        imageAlt="Isometric room view"
      />
    </>
  );
}