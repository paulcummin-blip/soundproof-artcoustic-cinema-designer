// ReoptimiseCalibrationAction.jsx
// ---------------------------------------------------------------------------
// The CALIBRATION APPLY workflow control — the second, distinct action beside
// the evidence-only Bass Optimiser.
//
// Two separate concepts, clearly labelled:
//
//   1. Bass Optimiser          — evaluates only. It explores the options, states
//                                the physical moves it would make and mutates
//                                nothing.
//   2. Re-optimise Bass        — runs the full workflow: it tests the safe
//      Calibration                calibration candidates and MAY APPLY delay,
//                                 gain, polarity and phase, then recalculates
//                                 P14/P18/P19/P20 and republishes the authority.
//
// It never applies a physical design change: seats, subwoofers and speakers are
// only ever recommended. The sentence below the title says exactly that, so the
// designer knows what pressing it can write before they press it.
//
// PRESENTATION ONLY: this component holds no decision logic and performs no
// calculation. It calls the handler it is given and states what that handler
// may do. Nothing here changes bass maths, optimiser scoring, P19/P20
// definition, RP22 grading or placement.
// ---------------------------------------------------------------------------

import React from "react";
import { Loader2, RefreshCw } from "lucide-react";

export const CALIBRATION_APPLY_TITLE = "Calibration apply workflow";
export const CALIBRATION_APPLY_BUTTON_LABEL = "Re-optimise Bass Calibration";
export const CALIBRATION_APPLY_SCOPE_SENTENCE =
  "ADI may apply safe calibration settings such as delay, gain, polarity and phase if they improve P19/P20. Physical design changes will only be recommended.";
export const CALIBRATION_APPLY_DISTINCTION_SENTENCE =
  "The Bass Optimiser evaluates only — this action can apply calibration.";

export default function ReoptimiseCalibrationAction({
  onReoptimise = null,
  busy = false,
  disabledReason = null,
  className = "",
}) {
  // No handler = the action is not offered for this design state at all.
  if (typeof onReoptimise !== "function") return null;

  const blocked = busy || !!disabledReason;

  return (
    <div
      className={`rounded-md border border-[#E7E5E0] bg-white px-3 py-3 ${className}`}
      data-adi-reoptimise-calibration="true"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {CALIBRATION_APPLY_TITLE}
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-[#3E4349]">
        {CALIBRATION_APPLY_SCOPE_SENTENCE}
      </p>

      <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">
        {CALIBRATION_APPLY_DISTINCTION_SENTENCE}
      </p>

      <button
        type="button"
        onClick={onReoptimise}
        disabled={blocked}
        data-adi-reoptimise-calibration-button="true"
        aria-busy={busy || undefined}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />}
        {busy ? "Re-optimising calibration…" : CALIBRATION_APPLY_BUTTON_LABEL}
      </button>

      {!busy && disabledReason && (
        <div className="mt-1.5 text-[11px] leading-relaxed text-[#8A5A2B]">
          {disabledReason}
        </div>
      )}
    </div>
  );
}