// CrossoverRegionPhaseEvidence.jsx
// ---------------------------------------------------------------------------
// The phase / crossover-region lever's own evidence, rendered inside the run
// evidence list.
//
// It states the crossover band, what the lever is for, whether the current
// optimiser evaluates the region, and why not. Read-only: it offers no Apply
// control, and it never presents a sub-only all-pass phase result as crossover
// alignment.
// ---------------------------------------------------------------------------

import React from "react";

export default function CrossoverRegionPhaseEvidence({ region = null }) {
  if (!region) return null;

  return (
    <div className="mt-0.5 space-y-0.5">
      <div className="text-[#625143]">{region.purpose}</div>

      <div className="text-[#8B7F76]">
        Crossover region: {region.bandHz.low}–{region.bandHz.high} Hz
        {region.slopeDbPerOct ? ` · typically ${region.slopeDbPerOct} dB/octave` : ""}
      </div>

      {region.subPhaseOnly?.tested && (
        <div className="text-[#625143]">
          <span className="text-[#8B7F76]">Subwoofer phase only: </span>
          {region.subPhaseOnly.note}
        </div>
      )}

      <div className="text-[10px] text-[#8B7F76] leading-relaxed">{region.bandNote}</div>

      {region.supportReason && (
        <details>
          <summary className="cursor-pointer text-[10px] text-[#8B7F76]">
            Why the crossover region is outside the current model
          </summary>
          <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">
            {region.supportReason}
          </div>
        </details>
      )}
    </div>
  );
}