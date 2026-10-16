// AdiRerunAgainAction.jsx
// ---------------------------------------------------------------------------
// RUN ADI AGAIN — the quiet, deliberate re-run of a COMPLETED evaluation.
//
// Self-contained and presentation-only: it draws ONE text-weight control and
// calls the run action it is given. It decides nothing — WHICH states offer it,
// what it says and whether it is pressable is resolved once by
// adiRerunAgainAuthority.js and passed in as props.
//
// It is deliberately LOW EMPHASIS. The decision of the state — Apply, Review
// Trade-off, Keep Current Design — owns the primary control; this sits under it
// so a completed result can be verified, repeated or measured again without
// competing with the decision, and without changing the design first.
//
// It writes nothing, applies nothing and calculates nothing: the run it starts
// is the same run action the card's own run control starts.
// ---------------------------------------------------------------------------

import React from "react";
import { RotateCw } from "lucide-react";

const QUIET_CONTROL = "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium text-[#625143] transition-colors hover:text-[#213428] disabled:opacity-60";

export default function AdiRerunAgainAction({
  label = null,
  helper = null,
  disabled = false,
  disabledReason = null,
  onRunAgain = null,
  className = "",
}) {
  if (!label || typeof onRunAgain !== "function") return null;

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-run-again-block="true">
      <button
        type="button"
        onClick={onRunAgain}
        disabled={disabled}
        // The one line of scope belongs on the control itself, so the quiet
        // action never adds a line to the decision it sits under.
        title={helper || undefined}
        data-adi-run-again="true"
        className={QUIET_CONTROL}
      >
        <RotateCw className="h-3.5 w-3.5" />
        {label}
      </button>
      {disabledReason && (
        <div className="text-[11px] text-[#8A5A2B] leading-relaxed">{disabledReason}</div>
      )}
    </div>
  );
}