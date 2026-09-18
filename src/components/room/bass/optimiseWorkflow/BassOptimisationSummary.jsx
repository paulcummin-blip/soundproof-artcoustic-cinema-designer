// BassOptimisationSummary.jsx
// Post-completion summary of the automatic optimisation.
//
// Shows what was auto-applied (phase, delay, gain, global bass trim) or
// "No automatic improvements required" if nothing was found.
// Does NOT show engineering diagnostics — those are in Advanced Diagnostics.

import React from "react";
import { CheckCircle2, Minus } from "lucide-react";

function SummaryRow({ applied, label, detail }) {
  return (
    <div className="flex items-start gap-2 text-[12px] py-0.5">
      {applied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[#213428] flex-shrink-0 mt-0.5" />
      ) : (
        <Minus className="h-3.5 w-3.5 text-[#8A7B6A] flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className={applied ? "text-[#1B1A1A] font-medium" : "text-[#8A7B6A]"}>
          {applied ? `${label} adjusted` : `No ${label.toLowerCase()} improvement available`}
        </span>
        {applied && detail && (
          <span className="block text-[10px] text-[#625143] mt-0.5">{detail}</span>
        )}
      </div>
    </div>
  );
}

function formatDetail(changes, key) {
  if (!changes || !changes[key] || !changes[key].length) return null;
  return changes[key].join(", ");
}

export default function BassOptimisationSummary({ autoApplied, noImprovementsFound }) {
  if (!autoApplied && !noImprovementsFound) return null;

  if (noImprovementsFound) {
    return (
      <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">No automatic improvements required</span>
        </div>
        <p className="mt-1 text-[11px] text-[#625143] leading-relaxed pl-6">
          The current design already produces the best achievable bass response. No calibration adjustments were needed.
        </p>
      </div>
    );
  }

  const details = autoApplied?.details || {};
  const hasAny = autoApplied?.phase || autoApplied?.delay || autoApplied?.gain || autoApplied?.globalBassTrim;

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-4 w-4 text-[#213428]" />
        <span className="text-[13px] font-semibold text-[#1B1A1A]">Bass Optimisation Summary</span>
      </div>
      <p className="text-[11px] text-[#625143] mb-2 pl-6">
        {hasAny ? "Automatic optimisation applied" : "No automatic improvements required"}
      </p>
      <div className="pl-6 space-y-0.5">
        <SummaryRow
          applied={autoApplied?.phase}
          label="Phase"
          detail={formatDetail(details, "phases")}
        />
        <SummaryRow
          applied={autoApplied?.delay}
          label="Delay"
          detail={formatDetail(details, "delays")}
        />
        <SummaryRow
          applied={autoApplied?.gain}
          label="Gain"
          detail={formatDetail(details, "trims")}
        />
        <SummaryRow
          applied={autoApplied?.globalBassTrim}
          label="Global bass trim"
          detail={
            Number.isFinite(details?.globalTrimDb)
              ? `${details.globalTrimDb > 0 ? "+" : ""}${details.globalTrimDb.toFixed(1)} dB`
              : null
          }
        />
      </div>
    </div>
  );
}