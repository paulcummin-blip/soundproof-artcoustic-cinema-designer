// ExpertCurveView.jsx
//
// The graph's own expert validation disclosure.
//
// Product rule: "ADI can simplify the story, but expert validation controls
// must remain available." This disclosure sits directly above the graph in the
// Bass Design Assistant layout, so the graph validation layers are reachable
// without the global Options → Expert View toggle. It stays closed by default,
// so the normal ADI presentation is unchanged. The global Engineering Mode
// still guards the deeper diagnostics, forensic tools and experimental
// controls below the graph.
//
// Three presentation jobs are kept deliberately separate:
//   • seat scope       → which listening position is inspected
//                        (SeatResponseScopeControls, hosted by the graph)
//   • curve comparison → which response curves are compared (this control)
//   • graph focus      → which RP22 parameter is inspected (ParameterFocusBar)
//
// Nothing here recalculates acoustics, changes RP22 grades or thresholds,
// alters smoothing mathematics, or saves project data. Curve visibility is
// session state only — toggling a curve mutates no design and no record.

import React from "react";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import BassCurveVisibilityControls from "@/components/room/bass/BassCurveVisibilityControls";
import BassSmoothingControl from "@/components/room/bass/BassSmoothingControl";
import Rp22GraphMarkerKey from "@/components/room/bass/Rp22GraphMarkerKey";

export default function ExpertCurveView({
  curveVisibility,
  onCurveVisibilityChange,
  layerAvailability,
  smoothingMode,
  onSmoothingModeChange,
  markers = null,
  placementPreviewActive = false,
  previousResultFaded = false,
}) {
  return (
    <CollapsiblePanel title="Expert Curve View" defaultOpen={false}>
      <div className="space-y-3 pt-2">
        <div style={{ fontSize: 10, color: "#625143" }}>
          Curve comparison is independent of seat scope and graph focus. Selecting an
          RP22 parameter never hides or resets the curves chosen here.
        </div>

        {/* Placement preview is the one mode where the authoritative layers are
            deliberately withheld. State that limitation here rather than leaving
            the designer to wonder why a layer looks unavailable. */}
        {placementPreviewActive && (
          <div
            style={{
              border: "1px solid #F59E0B",
              borderRadius: 8,
              background: "#FFFBEB",
              padding: "8px 10px",
              fontSize: 10,
              color: "#92400E",
              lineHeight: 1.45,
            }}
          >
            <strong>Placement preview is provisional.</strong> The graph shows the current
            preview curve
            {previousResultFaded
              ? ", with the previous result faded and labelled out of date"
              : ""}
            . Authoritative engineering layers are suppressed until the layout is
            recalculated.
          </div>
        )}

        <BassCurveVisibilityControls
          visibility={curveVisibility}
          availability={layerAvailability}
          onChange={onCurveVisibilityChange}
        />

        <BassSmoothingControl value={smoothingMode} onChange={onSmoothingModeChange} />

        {!placementPreviewActive && markers ? <Rp22GraphMarkerKey markers={markers} /> : null}
      </div>
    </CollapsiblePanel>
  );
}