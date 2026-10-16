// AdiImprovementActions.jsx
// ---------------------------------------------------------------------------
// THE ONE NEXT STEP for a confirmed improvement the designer must decide.
//
//   REVIEW IMPROVEMENT      the primary: opens the review, which owns the only
//                           Apply for this change
//   KEEP CURRENT DESIGN     the designer's own no: applies nothing at all
//
// A completed run is not a starting point: no OPTIMISE BASS and no re-test is
// drawn here. Presentation only — it starts no run and re-decides nothing.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import AdiImprovementReviewDialog from "./AdiImprovementReviewDialog.jsx";
import { IMPROVEMENT_COPY } from "./improvementResultAuthority.js";

const REVIEW_PRIMARY_CLASS = "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const KEEP_SECONDARY_CLASS = "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

export default function AdiImprovementActions({
  result = null,
  // The one result view model: the review states the current/proposed pair and
  // the applied state from it, so the review cannot disagree with the card.
  resultModel = null,
  onApply = null,
  onKeep = null,
  applyBusy = false,
  className = "",
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  // The review is only meaningful while the change is still on offer.
  if (!result?.found || result.caseKey !== "review" || !result.nextAction) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-adi-improvement-actions="true">
      <button
        type="button"
        onClick={() => setReviewOpen(true)}
        className={REVIEW_PRIMARY_CLASS}
        data-adi-improvement-review-open="true"
      >
        {result.nextAction.label}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      {onKeep && (
        <button
          type="button"
          onClick={onKeep}
          className={KEEP_SECONDARY_CLASS}
          data-adi-improvement-keep-current="true"
        >
          {IMPROVEMENT_COPY.KEEP}
        </button>
      )}

      <AdiImprovementReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        result={result}
        resultModel={resultModel}
        onApply={onApply}
        onKeep={onKeep}
        applyBusy={applyBusy}
      />
    </div>
  );
}