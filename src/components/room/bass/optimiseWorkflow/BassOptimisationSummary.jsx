// BassOptimisationSummary.jsx
// Post-completion summary of the automatic calibration.
//
// Layout:
//   Bass Optimisation
//   ✓ Automatic optimisation complete  (or "✓ No calibration adjustments required.")
//
//   Phase — 15° lag @ 80 Hz        (adjusted values shown; unchanged marked)
//   Delay — +0.5 ms
//   Relative gain — +1.0 dB
//   Global bass trim — +1.5 dB
//
// The list always shows all four calibration stages so the user can see what
// was adjusted and what was left unchanged. Stage values are preserved.

import React from "react";
import { CheckCircle2, Minus } from "lucide-react";

function CalibrationRow({ label, detail, adjusted }) {
  return (
    <div className="flex items-start gap-2 text-[12px] py-0.5">
      {adjusted ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[#213428] flex-shrink-0 mt-0.5" />
      ) : (
        <Minus className="h-3.5 w-3.5 text-[#B8AF8A] flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className="text-[#1B1A1A] font-medium">{label}</span>
        {adjusted && detail ? (
          <span className="ml-1.5 text-[#625143]">{detail}</span>
        ) : (
          <span className="ml-1.5 text-[#8A7B6A] italic">unchanged</span>
        )}
      </div>
    </div>
  );
}

function formatDetail(changes, key) {
  if (!changes || !changes[key] || !changes[key].length) return null;
  return changes[key].join(", ");
}

export default function BassOptimisationSummary({
  autoApplied,
  noImprovementsFound,
}) {
  if (!autoApplied && !noImprovementsFound) return null;

  const phaseAdjusted = !!autoApplied?.phase;
  const delayAdjusted = !!autoApplied?.delay;
  const gainAdjusted = !!autoApplied?.gain;
  const trimAdjusted = !!autoApplied?.globalBassTrim;

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3 space-y-2">
      {/* Heading + status line */}
      <div>
        <div className="text-[13px] font-semibold text-[#1B1A1A] mb-1.5">Bass Optimisation</div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[12px] font-medium text-[#1B1A1A]">
            {noImprovementsFound ? "No calibration adjustments required." : "Automatic optimisation complete"}
          </span>
        </div>
      </div>

      {/* Calibration stages — always show all four */}
      <div className="space-y-0.5">
        <CalibrationRow
          label="Phase"
          detail={formatDetail(autoApplied?.details, "phases")}
          adjusted={phaseAdjusted}
        />
        <CalibrationRow
          label="Delay"
          detail={formatDetail(autoApplied?.details, "delays")}
          adjusted={delayAdjusted}
        />
        <CalibrationRow
          label="Relative gain"
          detail={formatDetail(autoApplied?.details, "trims")}
          adjusted={gainAdjusted}
        />
        <CalibrationRow
          label="Global bass trim"
          detail={
            Number.isFinite(autoApplied?.details?.globalTrimDb)
              ? `${autoApplied.details.globalTrimDb > 0 ? "+" : ""}${autoApplied.details.globalTrimDb.toFixed(1)} dB`
              : null
          }
          adjusted={trimAdjusted}
        />
      </div>
    </div>
  );
}