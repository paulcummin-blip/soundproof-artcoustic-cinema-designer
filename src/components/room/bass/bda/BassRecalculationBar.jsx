// BassRecalculationBar — the manual recalculation control and the combined
// LCR + subwoofer validity, directly beneath the RP22 P14/P18/P19/P20 results.
//
// Two results are named separately, because they are two different results:
//   * the authoritative SUBWOOFER-ONLY P19/P20, whose state the authority band
//     above already states (Current / Needs calculation);
//   * the COMBINED LCR + subwoofer preview, which is always provisional and is
//     either a Current preview or Needs recalculation.
//
// PRESENTATION ONLY. It shows the state it is given and raises the request; it
// computes no engineering value, changes no crossover and publishes nothing.
import React from "react";
import { RotateCw } from "lucide-react";
import {
  COMBINED_RESULT_STATE,
  COMBINED_RESULT_LABEL,
} from "@/components/room/bass/combinedResultAuthority";

const AMBER = "#92400E";

export default function BassRecalculationBar({
  combinedState = COMBINED_RESULT_STATE.UNAVAILABLE,
  hasCombinedResult = false,
  hasPreviousResult = false,
  subOnlyCurrent = false,
  showRecalculate = false,
  calculating = false,
  canCalculate = false,
  onRecalculate = null,
}) {
  if (!hasPreviousResult) return null;

  const combinedLabel = hasCombinedResult ? COMBINED_RESULT_LABEL[combinedState] : null;
  const combinedNeedsCalculation = hasCombinedResult
    && combinedState === COMBINED_RESULT_STATE.NEEDS_RECALCULATION;
  // The band above already states "Settings changed" when the subwoofer-only
  // result itself has moved on, so the line is only raised here for a crossover
  // change that leaves the subwoofer-only result current.
  const showSettingsChanged = combinedNeedsCalculation && subOnlyCurrent;
  if (!hasCombinedResult && !showRecalculate) return null;

  const disabled = calculating || !canCalculate;

  return (
    <div
      data-bass-recalculation-bar="true"
      className="col-span-2 sm:col-span-4 mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md px-2.5 py-2"
      style={{ border: "1px solid #DCDBD6", background: "#FFFFFF" }}
    >
      <div className="min-w-0">
        {hasCombinedResult && (
          <div style={{ fontSize: "11.5px", color: "#3E4349", lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600 }}>Combined LCR + subwoofer</span>
            <span style={{ margin: "0 6px", color: "#DCDBD6" }}>|</span>
            <span style={{ color: "#625143" }}>Provisional</span>
            {combinedLabel && (
              <>
                <span style={{ margin: "0 6px", color: "#DCDBD6" }}>·</span>
                <span style={{ fontWeight: 600, color: combinedNeedsCalculation ? AMBER : "#213428" }}>
                  {combinedLabel}
                </span>
              </>
            )}
          </div>
        )}
        {showSettingsChanged && (
          <div style={{ marginTop: 2, fontSize: "11.5px", fontWeight: 600, color: AMBER }}>
            Settings changed · Recalculate Bass Results
          </div>
        )}
      </div>

      {showRecalculate && (
        <button
          type="button"
          onClick={onRecalculate}
          disabled={disabled}
          title={canCalculate ? undefined : "Bass results need a complete design before recalculating"}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ fontSize: "12px", background: "#213428", color: "#FFFFFF" }}
        >
          <RotateCw
            className={calculating ? "animate-spin" : undefined}
            style={{ width: 13, height: 13 }}
            aria-hidden="true"
          />
          {calculating ? "Calculating…" : "Recalculate Bass Results"}
        </button>
      )}
    </div>
  );
}