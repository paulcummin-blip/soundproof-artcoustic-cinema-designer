// AdiImprovementReviewDialog.jsx
// ---------------------------------------------------------------------------
// REVIEW IMPROVEMENT — the one deliberate Apply for a confirmed improvement.
//
// It states what the change is, the current → proposed result with both P19 and
// P20, the protected-seat statement and the scope the evidence supports, then
// offers exactly two things: APPLY CHANGE (through the SAME lever apply path
// every other Apply uses) and KEEP CURRENT DESIGN (which applies nothing).
//
// Presentation only: it applies nothing itself and re-decides nothing.
// ---------------------------------------------------------------------------

import React from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IMPROVEMENT_COPY } from "./improvementResultAuthority.js";
import AdiAppliedStateLine from "./AdiAppliedStateLine.jsx";

const BUTTON_PRIMARY = "inline-flex items-center rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const BUTTON_SECONDARY = "inline-flex items-center rounded-md border border-[#D9D5CE] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

function Row({ label, value, emphasis = false }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-relaxed">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">{label}</span>
      <span className={`text-right ${emphasis ? "font-semibold text-[#213428]" : "text-[#3E4349]"}`}>{value}</span>
    </div>
  );
}

export default function AdiImprovementReviewDialog({
  open = false,
  onOpenChange = null,
  result = null,
  // THE ONE RESULT. The current and proposed values and the applied state are
  // read from the view model when it is present: the review states the PUBLISHED
  // current result and the EVALUATED candidate, each labelled, and never the
  // candidate on its own. A stale or identity-mismatched result carries no
  // proposed values at all, so the review states no candidate figure.
  resultModel = null,
  onApply = null,
  onKeep = null,
  applyBusy = false,
  className = "",
}) {
  if (!result?.found) return null;

  const proposedP20 = resultModel?.proposed?.p20?.text || null;
  const proposedP19 = resultModel?.proposed?.p19?.text || null;
  const proposedP14 = resultModel?.proposed?.p14?.text || null;
  const currentP20 = resultModel?.current?.p20?.text || null;
  const currentP14 = resultModel?.current?.p14?.text || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-xl ${className}`} data-adi-improvement-review="true">
        <DialogHeader>
          <DialogTitle className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#213428]">
            {IMPROVEMENT_COPY.REVIEW}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* THE CHANGE FIRST: what it is, then the result it was measured on. */}
          <div className="text-[14px] font-semibold text-[#1B1A1A] leading-snug" data-adi-improvement-review-adjustment="true">
            {result.adjustment}
          </div>

          <div className="space-y-1.5 rounded-md border border-[#E7E5E0] bg-[#FBFBF9] px-3 py-2.5">
            <Row label="RESULT" value={result.result?.line} />
            <Row
              label={proposedP20 ? "PROPOSED P20" : (result.p20?.title || IMPROVEMENT_COPY.P20_TITLE)}
              value={proposedP20 || result.p20?.text}
              emphasis
            />
            <Row
              label={proposedP19 ? "PROPOSED P19" : (result.p19?.title || IMPROVEMENT_COPY.P19_TITLE)}
              value={proposedP19 || result.p19?.text}
            />
            {/* The candidate's capability figure is only ever stated as the
                candidate's — never as the design's current capability. */}
            <Row label="PROPOSED P14" value={proposedP14} />
            <Row label="CURRENT (PUBLISHED RESULT)" value={currentP20} />
            <Row label="CURRENT P14 (PUBLISHED RESULT)" value={currentP14} />
            <Row label={result.seats?.title || IMPROVEMENT_COPY.SEATS_TITLE} value={result.seats?.text} />
            {result.p20?.scope && (
              <p className="pt-0.5 text-[11px] text-[#625143] leading-relaxed">{result.p20.scope}</p>
            )}
          </div>

          {/* HELD / APPLIED — the persisted terminal decision, in the same words
              every other surface states it. */}
          <AdiAppliedStateLine resultModel={resultModel} />

          {/* The candidate behind the change, so the designer knows what they are
              approving. Stated only when the run recorded it. */}
          {(result.candidateId || result.familyLabel) && (
            <div className="space-y-0.5 text-[11px] text-[#625143] leading-relaxed" data-adi-improvement-candidate="true">
              {result.candidateId && <div>{`${IMPROVEMENT_COPY.CANDIDATE}: ${result.candidateId}`}</div>}
              {result.familyLabel && <div>{`${IMPROVEMENT_COPY.FAMILY}: ${result.familyLabel}`}</div>}
            </div>
          )}

          {/* What applying it writes, stated before the designer commits. */}
          <p className="flex items-start gap-1.5 text-[11.5px] text-[#8A5A2B] leading-relaxed" data-adi-improvement-apply-note="true">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B45309]" />
            Applying this change writes the setting to the design. Nothing else is changed.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onApply && (
              <button
                type="button"
                onClick={onApply}
                disabled={applyBusy}
                data-adi-improvement-apply="true"
                className={`${BUTTON_PRIMARY} ${applyBusy ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {IMPROVEMENT_COPY.APPLY_IN_REVIEW}
              </button>
            )}
            {onKeep && (
              <button
                type="button"
                onClick={() => {
                  onKeep();
                  onOpenChange?.(false);
                }}
                data-adi-improvement-keep="true"
                className={BUTTON_SECONDARY}
              >
                {IMPROVEMENT_COPY.KEEP}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}