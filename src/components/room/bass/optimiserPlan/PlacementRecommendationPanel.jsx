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
// `variant` decides which half of that is rendered where: the main panel takes
// the controls, Engineer details takes the evidence. The move itself is stated by
// the card's headline, so the main panel never repeats it.
//
// It is one panel drawn twice, never two panels: nothing is recomputed, and the
// values it reads are the same object both times.
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
  // Whether this panel owns the panel's ONE primary action. When it does not,
  // its Apply is drawn as a secondary control so two green buttons can never
  // compete for attention.
  primary = true,
  onApply = null,
  onUndo = null,
  onRerun = null,
  // "full"     — the whole panel: its evidence and its controls (the default)
  // "actions"  — the controls only, for the main panel's action row
  // "evidence" — the evidence only, for Engineer details
  // The card draws this panel twice: the decision and its controls stay on the
  // main panel, and the reasoning behind the move stays in the details. Each mode
  // renders exactly one of the two, so a control is never duplicated.
  variant = "full",
  className = "",
  // The result view model's own statement about this placement. When the run
  // TESTED a placement but did not recommend it, the label is supplied here so
  // the evidence can never read as a recommendation. Null = the placement IS the
  // recommendation (or is already applied) and nothing extra is stated.
  testedNotRecommendedLabel = null,
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

  const actions = (showApply || showUndo || showRerun) ? (
    <div className="flex flex-wrap items-center gap-2">
      {showApply && (
        <button type="button" className={primary ? PRIMARY : SECONDARY} onClick={onApply} disabled={busy}>
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
  ) : null;

  if (variant === "actions") {
    return actions
      ? <div className={className} data-placement-actions={placement.kind}>{actions}</div>
      : null;
  }

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

      {/* A placement the run evaluated but did NOT recommend is never presented
          as a recommendation: it is named for what it is, before any of its
          measured detail. */}
      {testedNotRecommendedLabel && (
        <div
          className="text-[10px] leading-relaxed text-[#625143]"
          data-placement-tested-not-recommended="true"
        >
          {testedNotRecommendedLabel}
        </div>
      )}

      {placement.definition && (
        <div className="text-[10px] text-[#8B7F76] leading-relaxed">{placement.definition}</div>
      )}

      {/* Applied, not applied, or already matching the design — stated, so the
          designer never has to infer whether the move is in the design yet. */}
      {placement.statusText && (
        <div className="text-[10px] leading-relaxed text-[#625143]" data-placement-status="true">
          {placement.statusText}
        </div>
      )}

      {placement.message && (
        <div className="text-[12px] font-semibold text-[#213428]">{placement.message}</div>
      )}

      {placement.summary && (
        <div className="text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">{placement.summary}</div>
      )}

      {/* WHY this move is expected to help, read from the limiting seat the design
          measures now. Never inferred, and never a claim beyond that measurement. */}
      {placement.reason && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed" data-placement-reason="true">
          {placement.reason}
        </div>
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

      {/* WHERE it moves from and to, per wall group: the designer's own distances
          from the nearest side wall. Raw coordinates stay in Engineer details. */}
      {Array.isArray(placement.move?.groups) && placement.move.groups.length > 0 && (
        <div className="space-y-1" data-placement-position-change="true">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Position change
          </div>
          {placement.move.groups.map((group) => (
            <div key={group.group || group.groupPhrase} className="space-y-0.5">
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold text-[#1B1A1A]">{group.groupPhrase || "Subwoofers"}</span>
                {group.subLabelsText && <span className="text-[#8B7F76]"> · {group.subLabelsText}</span>}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px] leading-relaxed">
                <span className="text-[#625143]">Current</span>
                <span className="text-[#3E4349]">{group.fromText}</span>
                <span className="text-[#625143]">Suggested</span>
                <span className="font-semibold text-[#1B1A1A]">{group.toText}</span>
              </div>
              {group.movementText && (
                <div className="text-[10px] text-[#8B7F76] leading-relaxed">
                  Movement required: {group.movementText}
                </div>
              )}
            </div>
          ))}
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

      {/* The controls, on the panel the designer acts on — never twice. */}
      {variant !== "evidence" && actions && <div className="pt-0.5">{actions}</div>}
    </div>
  );
}