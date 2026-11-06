// ResponseCurvesPanel.jsx
//
// One compact control surface for the Bass Response graph, replacing the
// legacy Expert Curve View and the scattered inline curve/smoothing controls.
//
// Two display modes organise the controls without changing any calculation:
//   Room       — the live room-only response (preview / raw physical curve)
//   Calculated — the authoritative calculated layers, offered as compact
//                 chips only when current valid evidence backs them.
//
// Stale calculated curves are never offered. The segmented control follows
// the engine: when the calculated result is stale the panel locks to Room and
// Calculated shows a neutral status instead of a disabled grid. Smoothing
// stays as one compact control using only the options the graph engine already
// supports. Presentation only — no recalculation, no RP22 grading, no authority.

import React from "react";
import BassCurveVisibilityControls from "@/components/room/bass/BassCurveVisibilityControls";
import BassSmoothingControl from "@/components/room/bass/BassSmoothingControl";
import Rp22GraphMarkerKey from "@/components/room/bass/Rp22GraphMarkerKey";

const FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function ResponseCurvesPanel({
  mode,
  onModeChange,
  roomAvailable,
  calculatedAvailable,
  curveVisibility,
  onCurveVisibilityChange,
  layerAvailability,
  smoothingMode,
  onSmoothingModeChange,
  markers = null,
}) {
  const segmentStyle = (active, enabled) => ({
    flex: 1,
    height: 30,
    border: "none",
    background: active ? "#FFFFFF" : "transparent",
    cursor: enabled ? "pointer" : "default",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? "#1B1A1A" : enabled ? "#625143" : "#B5B0A8",
    borderRadius: 7,
    transition: "background 0.15s ease, color 0.15s ease",
    fontFamily: FONT,
  });

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Segmented control — Room | Calculated */}
      <div
        role="tablist"
        aria-label="Response curves display mode"
        style={{ display: "flex", background: "#F1F0EE", borderRadius: 8, padding: 3, gap: 2 }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "room"}
          aria-disabled={!roomAvailable}
          disabled={!roomAvailable}
          style={segmentStyle(mode === "room", roomAvailable)}
          onClick={() => roomAvailable && onModeChange?.("room")}
        >
          Room
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "calculated"}
          aria-disabled={!calculatedAvailable}
          disabled={!calculatedAvailable}
          style={segmentStyle(mode === "calculated", calculatedAvailable)}
          onClick={() => calculatedAvailable && onModeChange?.("calculated")}
        >
          Calculated
        </button>
      </div>

      {/* Mode content */}
      {mode === "room" ? (
        <div style={{ marginTop: 10 }}>
          <BassSmoothingControl value={smoothingMode} onChange={onSmoothingModeChange} />
        </div>
      ) : calculatedAvailable ? (
        <div style={{ marginTop: 10 }}>
          <BassCurveVisibilityControls
            visibility={curveVisibility}
            availability={layerAvailability}
            onChange={onCurveVisibilityChange}
          />
          <div style={{ marginTop: 8 }}>
            <BassSmoothingControl value={smoothingMode} onChange={onSmoothingModeChange} />
          </div>
          {markers ? (
            <div style={{ marginTop: 6 }}>
              <Rp22GraphMarkerKey markers={markers} />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#8B7F76",
            textAlign: "center",
            padding: "10px 0",
            fontFamily: FONT,
          }}
        >
          Calculate Bass Results to view calculated curves.
        </div>
      )}
    </div>
  );
}