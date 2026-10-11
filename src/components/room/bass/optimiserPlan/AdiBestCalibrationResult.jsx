// AdiBestCalibrationResult.jsx
// ---------------------------------------------------------------------------
// The Safe calibration adjustments headline: WHICH calibration result ADI's own
// decision selected, whether it was one lever on its own or levers retuned
// together, what it did to P19 and P20, which settings it changed, and why a
// tested result was not the one taken.
//
// Presentation only: every value arrives already resolved by
// bestCalibrationResult.js from the run's own decision and evidence. It applies
// nothing, decides nothing and prints no candidate id.
//
// `compact` is the MAIN PANEL presentation: the headline and its state alone.
// The section beside it already prints the settings and the canonical P19/P20
// before → after, so those rows, the settings list and the explanation sentences
// are rendered only where `compact` is false — Engineer details.
// ---------------------------------------------------------------------------

import React from "react";

const STATE_STYLE = Object.freeze({
  Applied: { background: "#213428", color: "#FFFFFF" },
  "Held for your approval": { background: "#B45309", color: "#FFFFFF" },
  "Review required": { background: "#B45309", color: "#FFFFFF" },
});

export default function AdiBestCalibrationResult({ result = null, compact = false, className = "" }) {
  if (!result) return null;

  const stateStyle = STATE_STYLE[result.stateLabel] || { background: "#625143", color: "#FFFFFF" };

  return (
    <div className={`space-y-0.5 ${className}`} data-adi-best-calibration-result="true">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-semibold text-[#1B1A1A]" data-adi-best-calibration-label={result.label || "unknown"}>
          {result.headline}
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
          style={stateStyle}
        >
          {result.stateLabel}
        </span>
      </div>

      {!compact && result.valuesStatement && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">{result.valuesStatement}</div>
      )}

      {!compact && result.settingsChanged.length > 0 && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">
          <span className="text-[#625143]">Settings changed: </span>
          {result.settingsChanged.join(", ")}
        </div>
      )}

      {!compact && result.statement && (
        <div className="text-[11.5px] text-[#1B1A1A] leading-relaxed">{result.statement}</div>
      )}

      {!compact && result.heldSentence && (
        <div className="text-[11px] text-[#625143] leading-relaxed">{result.heldSentence}</div>
      )}
    </div>
  );
}