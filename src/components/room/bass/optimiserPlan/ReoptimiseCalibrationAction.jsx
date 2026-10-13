// ReoptimiseCalibrationAction.jsx
// ---------------------------------------------------------------------------
// The CALIBRATION action — it lives inside Section 1 (Safe calibration
// adjustments) and nowhere else.
//
// ONE action, one label: "Re-test Calibration". Pressing it runs the full
// calibration workflow: ADI tests the safe calibration candidates (delay, gain,
// polarity, phase) and MAY APPLY those that improve P19/P20 without damaging the
// other objective, then recalculates and republishes the authority. It never
// applies a physical design change: seats, subwoofers and speakers are only ever
// recommended.
//
// Whether this is the panel's PRIMARY action is decided by the panel, not here:
// the panel passes `primary`, and this control is drawn as a secondary button
// whenever the design recommendation owns the primary. There is never a second
// green button competing with it.
//
// PRESENTATION ONLY: no decision logic, no calculation. It calls the handler it
// is given and states what that handler may do.
// ---------------------------------------------------------------------------

import React from "react";
import { Loader2, RefreshCw } from "lucide-react";

export const CALIBRATION_APPLY_TITLE = "Applied adjustment";
export const CALIBRATION_APPLY_BUTTON_LABEL = "Re-test Bass Optimisation";
export const CALIBRATION_APPLY_BUSY_LABEL = "Re-testing Bass Optimisation…";
export const CALIBRATION_APPLY_SCOPE_SENTENCE =
  "ADI re-checks the design and applies a better adjustment only when one improves the result.";

const PRIMARY_CLASS =
  "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45";
const SECONDARY_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-4 py-2 text-[12px] font-semibold text-[#213428] transition-colors hover:border-[#213428] disabled:cursor-not-allowed disabled:opacity-45";

export default function ReoptimiseCalibrationAction({
  onReoptimise = null,
  busy = false,
  disabledReason = null,
  primary = false,
  className = "",
}) {
  // No handler = the action is not offered for this design state at all.
  if (typeof onReoptimise !== "function") return null;

  const blocked = busy || !!disabledReason;

  return (
    <div className={`space-y-1 ${className}`} data-adi-reoptimise-calibration="true">
      <button
        type="button"
        onClick={onReoptimise}
        disabled={blocked}
        data-adi-reoptimise-calibration-button={primary ? "primary" : "secondary"}
        aria-busy={busy || undefined}
        className={primary ? PRIMARY_CLASS : SECONDARY_CLASS}
      >
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />}
        {busy ? CALIBRATION_APPLY_BUSY_LABEL : CALIBRATION_APPLY_BUTTON_LABEL}
      </button>

      {/* One short line: what pressing it may write. */}
      {!busy && !disabledReason && (
        <div className="text-[11px] text-[#625143] leading-relaxed">
          {CALIBRATION_APPLY_SCOPE_SENTENCE}
        </div>
      )}

      {!busy && disabledReason && (
        <div className="text-[11px] text-[#8A5A2B] leading-relaxed">{disabledReason}</div>
      )}
    </div>
  );
}