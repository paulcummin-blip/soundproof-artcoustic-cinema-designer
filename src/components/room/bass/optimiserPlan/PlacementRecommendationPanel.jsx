// PlacementRecommendationPanel.jsx
// ---------------------------------------------------------------------------
// The placement recommendation, as a design decision.
//
// It states, in this order:
//   • what placement means and what the recommended move is, in installer words
//   • the expected result in whole dB — P20, P19, output/headroom, extension
//   • Apply placement, or Undo placement once it has been applied
//   • the one action that applies when the result belongs to an earlier design
//     state (Bass Optimiser) — never an Apply that cannot work
//
// Presentation only: every value arrives from placementRecommendationAuthority.
// No coordinates, no decimals, no calculation.
// ---------------------------------------------------------------------------

import React from "react";
import { ArrowRight, Check, Loader2, MapPin, RotateCcw, Undo2 } from "lucide-react";
import { PLACEMENT_KIND } from "./placementRecommendationAuthority.js";
import { ADI_BASS_OPTIMISER_LABEL } from "./resolveAdiOptimiserJourney.js";
import { PLACEMENT_PREVIEW_UNAVAILABLE } from "./placementMoveAuthority.js";
import AdiBeforeAfterResult from "./AdiBeforeAfterResult.jsx";

const PRIMARY = "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-60";
const SECONDARY = "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-4 py-2 text-[12px] font-semibold text-[#213428] transition-colors hover:border-[#213428] disabled:opacity-60";

const STATUS_STYLE = {
  [PLACEMENT_KIND.RECOMMENDED]: { background: "#E7F0E9", border: "#9DB8A4", color: "#213428" },
  [PLACEMENT_KIND.APPLIED]: { background: "#213428", border: "#213428", color: "#FFFFFF" },
  [PLACEMENT_KIND.PREVIOUS]: { background: "#FBF3E4", border: "#E0C48F", color: "#8A5A2B" },
  // A small improvement stated as a note: neutral, never the recommended green.
  [PLACEMENT_KIND.NOTE]: { background: "#F2F1EE", border: "#D9D5CE", color: "#625143" },
};

export default function PlacementRecommendationPanel({
  placement = null,
  busy = false,
  onApply = null,
  onUndo = null,
  onRerun = null,
  className = "",
}) {
  if (!placement || !placement.kind) return null;

  const showApply = placement.kind === PLACEMENT_KIND.RECOMMENDED
    && placement.canApply === true
    && typeof onApply === "function";
  const showUndo = placement.kind === PLACEMENT_KIND.APPLIED
    && placement.canUndo === true
    && typeof onUndo === "function";
  const showRerun = placement.kind === PLACEMENT_KIND.PREVIOUS
    && placement.canRerun === true
    && typeof onRerun === "function";
  const statusStyle = STATUS_STYLE[placement.kind] || STATUS_STYLE[PLACEMENT_KIND.PREVIOUS];

  return (
    <div
      className={`rounded-md border border-[#E7E5E0] bg-white px-3 py-2 space-y-1.5 ${className}`}
      data-placement-recommendation={placement.kind}
    >
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#213428]" />
        <span className="text-[12px] font-semibold text-[#1B1A1A]">{placement.title}</span>
        <span
          className="ml-auto shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase"
          style={statusStyle}
        >
          {placement.status}
        </span>
      </div>

      {placement.definition && (
        <div className="text-[10px] text-[#8B7F76] leading-relaxed">{placement.definition}</div>
      )}

      {placement.message && (
        <div className="text-[12px] font-semibold text-[#213428]">{placement.message}</div>
      )}

      {placement.summary && (
        <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">{placement.summary}</div>
      )}

      {placement.move?.movementLabel && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Physical change
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">{placement.move.movementLabel}</div>
          {placement.move.wallStatement && (
            <div className="text-[10px] text-[#8B7F76] leading-relaxed">{placement.move.wallStatement}</div>
          )}
        </div>
      )}

      {Array.isArray(placement.expected) && placement.expected.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Expected result
          </div>
          <div className="space-y-0.5">
            {placement.expected.map((row) => (
              // A before → after row uses the card's one result presentation, so
              // the predicted final deviation and the improvement read the same
              // way wherever ADI states them.
              row.before && row.after ? (
                <AdiBeforeAfterResult
                  key={row.label}
                  metricLabel={row.label}
                  beforeText={row.before}
                  afterText={row.after}
                  improvementDb={row.improvementDb}
                />
              ) : (
                <div key={row.label} className="flex items-baseline gap-2 text-[11px]">
                  <span className="w-32 shrink-0 font-semibold text-[#1B1A1A]">{row.label}</span>
                  <span className="text-[#3E4349]">{row.value}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* The missing on-plan preview is a limitation of the evidence, not a
          warning about the recommendation: it is stated inside Engineer details
          instead, so the default card never carries a "Preview not yet
          available" line. */}
      {placement.notice && placement.notice !== PLACEMENT_PREVIEW_UNAVAILABLE && (
        <div className="text-[11px] leading-relaxed text-[#8A5A2B]">{placement.notice}</div>
      )}

      {(showApply || showUndo || showRerun) && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {showApply && (
            <button type="button" className={PRIMARY} onClick={onApply} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {placement.applyLabel || "Apply placement"}
            </button>
          )}
          {showUndo && (
            <button type="button" className={SECONDARY} onClick={onUndo} disabled={busy}>
              <Undo2 className="h-3.5 w-3.5" />
              {placement.undoLabel || "Undo placement"}
            </button>
          )}
          {showRerun && (
            <button type="button" className={SECONDARY} onClick={onRerun} disabled={busy}>
              <RotateCcw className="h-3.5 w-3.5" />
              {placement.rerunLabel || ADI_BASS_OPTIMISER_LABEL}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}