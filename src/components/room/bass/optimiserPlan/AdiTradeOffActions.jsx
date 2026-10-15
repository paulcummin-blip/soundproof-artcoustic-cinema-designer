// AdiTradeOffActions.jsx
// ---------------------------------------------------------------------------
// THE TWO CONTROLS OF THE TRADE-OFF STATE, and nothing else.
//
//   REVIEW TRADE-OFF      the primary action: it opens the compact CURRENT vs
//                         PROPOSED comparison, where the deliberate Apply lives
//   KEEP CURRENT DESIGN   the secondary action: the candidate is dismissed for
//                         this run and nothing is written
//
// No run control and no re-test control is drawn here: the run has completed and
// its result is trustworthy, so there is nothing to re-run. Once the trade-off
// has been kept, nothing is offered — the panel states that the design is
// unchanged.
//
// Presentation only: the comparison and every figure are resolved by
// optimiserTradeOffState.js; the Apply calls the existing lever apply path.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { Scale } from "lucide-react";
import AdiTradeOffReviewDialog from "./AdiTradeOffReviewDialog.jsx";
import { TRADE_OFF_ACTIONS } from "./optimiserTradeOffState.js";

const BUTTON_PRIMARY = "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const BUTTON_SECONDARY = "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

export default function AdiTradeOffActions({
  tradeOff = null,
  kept = false,
  primary = true,
  applyBusy = false,
  onApply = null,
  onKeep = null,
  className = "",
}) {
  const [reviewing, setReviewing] = useState(false);
  if (!tradeOff || kept) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-adi-trade-off-actions="true">
      <button
        type="button"
        onClick={() => setReviewing(true)}
        data-adi-trade-off-review-action="true"
        className={primary ? BUTTON_PRIMARY : BUTTON_SECONDARY}
      >
        <Scale className="h-3.5 w-3.5" />
        {TRADE_OFF_ACTIONS.REVIEW}
      </button>

      {/* The designer's own no: the candidate is dismissed for this run and no
          design field, setting or saved evidence is touched. */}
      {onKeep && (
        <button
          type="button"
          onClick={onKeep}
          data-adi-trade-off-keep="true"
          className={BUTTON_SECONDARY}
        >
          {TRADE_OFF_ACTIONS.KEEP}
        </button>
      )}

      <AdiTradeOffReviewDialog
        open={reviewing}
        tradeOff={tradeOff}
        onOpenChange={setReviewing}
        onKeep={onKeep}
        applyBusy={applyBusy}
        onApply={onApply
          ? () => {
            onApply();
            setReviewing(false);
          }
          : null}
      />
    </div>
  );
}