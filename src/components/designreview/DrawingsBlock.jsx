/**
 * DrawingsBlock.jsx
 * ------------------
 * Stage D — Drawings & Geometry section for the Design Review workspace.
 *
 * Lazy-mounted tabbed view: PLAN · ELEVATION · ZONES · ACOUSTIC TREATMENT.
 * Only the active tab is mounted — no parallel canvas computation.
 *
 * Reads drawing state from the shared window.__ROOM_DESIGNER_ASDR__ store
 * (placedSpeakers, frontSubs, rearSubs, screen, dolbyLayout, mlpPoint)
 * and room geometry from useAppState() (roomDims, seatingPositions, etc.).
 * Does NOT mount any analysis engine or re-derive speaker positions.
 */

import React, { useState, useMemo } from "react";
import { useAppState } from "@/components/AppStateProvider";
import RvStaticCanvas from "@/components/report/RvStaticCanvas";
import SideElevation from "@/components/room/SideElevation";
import FrontElevation from "@/components/room/FrontElevation";
import AcousticTreatmentDrawing from "@/components/designreview/AcousticTreatmentDrawing";

const COLORS = {
  bg: "transparent",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  muted: "#77736B",
  tabActive: "#F8F7F5",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const TABS = [
  { key: "plan", label: "PLAN" },
  { key: "elevation", label: "ELEVATION" },
  { key: "zones", label: "ZONES" },
  { key: "acoustic", label: "ACOUSTIC TREATMENT" },
];

export default function DrawingsBlock({ asdrData }) {
  const app = useAppState();
  const [activeTab, setActiveTab] = useState("plan");

  // Derive drawing inputs from shared store + appState
  const drawingInputs = useMemo(() => {
    const placedSpeakers = asdrData?.placedSpeakers || app?.speakerSystem?.placedSpeakers || [];
    const frontSubs = asdrData?.frontSubs || (Array.isArray(app?.subwoofers) ? app.subwoofers.filter(s => s?.group === 'front') : []);
    const rearSubs = asdrData?.rearSubs || (Array.isArray(app?.subwoofers) ? app.subwoofers.filter(s => s?.group === 'rear') : []);
    const screen = asdrData?.screen || app?.screen || {};
    const dolbyLayout = asdrData?.dolbyLayout || app?.dolbyLayout || "5.1";
    const mlpPoint = asdrData?.mlpPoint || null;
    const dimensions = app?.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
    const seatingPositions = app?.seatingPositions || [];
    const roomElements = app?.roomElements || [];
    const frontSubsCfg = app?.frontSubsCfg;
    const rearSubsCfg = app?.rearSubsCfg;
    const screenFrontPlaneM = Number.isFinite(Number(app?.screenFrontPlaneM)) ? Number(app.screenFrontPlaneM) : undefined;
    const lcrAimMode = app?.lcrAimMode || "flat";
    const aimAtMLP = !!app?.aimAtMLP;
    const rspMode = app?.rspMode || "auto_from_screen";
    const manualRspY_m = app?.manualRspY_m;
    const overlays = app?.overlays || {};
    const acousticTreatmentEnabled = !!app?.acousticTreatmentEnabled;
    const selectedAbfuserQty = Number(app?.selectedAbfuserQty) || 0;

    return {
      placedSpeakers, frontSubs, rearSubs, screen, dolbyLayout, mlpPoint,
      dimensions, seatingPositions, roomElements, frontSubsCfg, rearSubsCfg,
      screenFrontPlaneM, lcrAimMode, aimAtMLP, rspMode, manualRspY_m, overlays,
      acousticTreatmentEnabled, selectedAbfuserQty,
    };
  }, [asdrData, app]);

  if (!asdrData && !app?.roomDims) {
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", color: COLORS.muted, fontFamily: FONT_BODY, fontSize: 13 }}>
        Drawing data not available. Open the project in the Room Designer to populate the drawings.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${COLORS.border}`,
        overflowX: "auto",
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 14px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontFamily: FONT_BODY,
                color: isActive ? COLORS.primary : COLORS.muted,
                background: isActive ? COLORS.tabActive : "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${COLORS.primary}` : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content — lazy mounted */}
      <div style={{ padding: "16px 8px" }}>
        {activeTab === "plan" && (
          <PlanTab {...drawingInputs} app={app} />
        )}
        {activeTab === "elevation" && (
          <ElevationTab {...drawingInputs} />
        )}
        {activeTab === "zones" && (
          <ZonesTab {...drawingInputs} app={app} />
        )}
        {activeTab === "acoustic" && (
          <AcousticTreatmentDrawing
            roomDims={drawingInputs.dimensions}
            seatingPositions={drawingInputs.seatingPositions}
            placedSpeakers={drawingInputs.placedSpeakers}
            acousticTreatmentEnabled={drawingInputs.acousticTreatmentEnabled}
            selectedAbfuserQty={drawingInputs.selectedAbfuserQty}
          />
        )}
      </div>
    </div>
  );
}

// ── Plan tab ──────────────────────────────────────────────────────────
function PlanTab({ placedSpeakers, frontSubs, rearSubs, screen, dolbyLayout, mlpPoint, dimensions, seatingPositions, roomElements, frontSubsCfg, rearSubsCfg, screenFrontPlaneM, lcrAimMode, aimAtMLP, rspMode, manualRspY_m, app }) {
  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <RvStaticCanvas
        placedSpeakers={placedSpeakers}
        seatingPositions={seatingPositions}
        mlpPoint={mlpPoint}
        screen={screen}
        dolbyLayout={dolbyLayout}
        frontSubs={frontSubs}
        rearSubs={rearSubs}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        roomElements={roomElements}
        exportMode="clean"
        showBaffle={true}
        showScreen={true}
        screenFrontPlaneM={screenFrontPlaneM}
        speakerPositionsView="off"
        showMlpRuler={false}
        overlays={{}}
        lcrAimMode={lcrAimMode}
        aimAtMLP={aimAtMLP}
        rspMode={rspMode}
        manualRspY_m={manualRspY_m}
        appState={app}
      />
    </div>
  );
}

// ── Elevation tab ─────────────────────────────────────────────────────
function ElevationTab({ dimensions, screen, seatingPositions, mlpPoint, roomElements, placedSpeakers, frontSubs, frontSubsCfg, rearSubs, rearSubsCfg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "8px 14px",
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          Side Elevation (Right Wall)
        </div>
        <SideElevation
          dimensions={dimensions}
          screen={screen}
          seatingPositions={seatingPositions}
          mlpPoint={mlpPoint}
          roomElements={roomElements}
          placedSpeakers={placedSpeakers}
          frontSubs={frontSubs}
          frontSubsCfg={frontSubsCfg}
          rearSubs={rearSubs}
          rearSubsCfg={rearSubsCfg}
          wall="right"
        />
      </div>
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "8px 14px",
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          Front Elevation
        </div>
        <FrontElevation
          dimensions={dimensions}
          screen={screen}
          placedSpeakers={placedSpeakers}
          frontSubs={frontSubs}
          frontSubsCfg={frontSubsCfg}
          roomElements={roomElements}
        />
      </div>
    </div>
  );
}

// ── Zones tab ─────────────────────────────────────────────────────────
function ZonesTab({ placedSpeakers, frontSubs, rearSubs, screen, dolbyLayout, mlpPoint, dimensions, seatingPositions, roomElements, frontSubsCfg, rearSubsCfg, screenFrontPlaneM, lcrAimMode, aimAtMLP, rspMode, manualRspY_m, overlays, app }) {
  return (
    <div style={{
      background: COLORS.cardBg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <RvStaticCanvas
        placedSpeakers={placedSpeakers}
        seatingPositions={seatingPositions}
        mlpPoint={mlpPoint}
        screen={screen}
        dolbyLayout={dolbyLayout}
        frontSubs={frontSubs}
        rearSubs={rearSubs}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        roomElements={roomElements}
        exportMode="dimensions"
        showBaffle={true}
        showScreen={true}
        screenFrontPlaneM={screenFrontPlaneM}
        speakerPositionsView="off"
        showMlpRuler={true}
        overlays={overlays}
        lcrAimMode={lcrAimMode}
        aimAtMLP={aimAtMLP}
        rspMode={rspMode}
        manualRspY_m={manualRspY_m}
        appState={app}
      />
    </div>
  );
}