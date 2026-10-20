import React from "react";
import { useSubwooferCompatibilityActions } from "@/components/hooks/useSubwooferCompatibilityActions";

/**
 * Secondary action in Bass Optimisation: resets every subwoofer to 0 dB,
 * 0 ms, 0°, Normal polarity and clears the outdated ADI tuning. Never
 * recalculates — the designer recalculates bass results afterwards.
 */
export default function ResetSubwooferTuningButton({ appState, frontSubsCfg, rearSubsCfg, disabled }) {
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  return (
    <div className="mt-3 flex justify-end">
      <button
        type="button"
        disabled={disabled || !compat.hasCanonicalInstances}
        onClick={compat.resetSubwooferTuning}
        className="cursor-pointer rounded border border-[#C1B6AD] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#625143] transition-colors hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-45"
      >
        Reset Subwoofer Tuning
      </button>
    </div>
  );
}