// BassOptimisationSummary.jsx
// Post-completion summary of the automatic optimisation.
//
// Layout:
//   Bass Optimisation
//   ✓ Automatic optimisation completed  (or "✓ No automatic improvements required")
//
//   CURRENT SYSTEM
//   • Floor · Fails · P19 · P20
//
//   IMPROVEMENTS FOUND
//   ✓ Phase — Applied ✓      (only stages that produced a genuine improvement)
//   ✓ Delay — Applied ✓
//   ✓ Gain  — Applied ✓
//   ...physical improvement cards passed as children (Seating, Placement)
//
//   If no improvements at all: "No improvements available."

import React from "react";
import { CheckCircle2 } from "lucide-react";
import CurrentSystemSummary from "./CurrentSystemSummary";

function AppliedRow({ label, detail }) {
  return (
    <div className="flex items-start gap-2 text-[12px] py-0.5">
      <CheckCircle2 className="h-3.5 w-3.5 text-[#213428] flex-shrink-0 mt-0.5" />
      <div>
        <span className="text-[#1B1A1A] font-medium">{label}</span>
        <span className="ml-1.5 text-[#213428] font-semibold">✓ Applied</span>
        {detail && (
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

export default function BassOptimisationSummary({
  autoApplied,
  noImprovementsFound,
  shared,
  seatingPositions,
  hasPhysicalImprovements,
  children,
}) {
  if (!autoApplied && !noImprovementsFound) return null;

  const hasAutoImprovement = autoApplied?.phase || autoApplied?.delay || autoApplied?.gain || autoApplied?.globalBassTrim;
  const hasAnyImprovement = hasAutoImprovement || hasPhysicalImprovements;

  return (
    <div className="space-y-3">
      {/* Heading + status line */}
      <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
        <div className="text-[13px] font-semibold text-[#1B1A1A] mb-1.5">Bass Optimisation</div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[12px] font-medium text-[#1B1A1A]">
            {noImprovementsFound ? "No automatic improvements required" : "Automatic optimisation completed"}
          </span>
        </div>
      </div>

      {/* Current System */}
      <CurrentSystemSummary shared={shared} seatingPositions={seatingPositions} />

      {/* Improvements Found */}
      <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A] mb-2">
          Improvements Found
        </div>
        {!hasAnyImprovement ? (
          <p className="text-[12px] text-[#625143]">No improvements available.</p>
        ) : (
          <div className="space-y-1">
            {autoApplied?.phase && (
              <AppliedRow label="Phase" detail={formatDetail(autoApplied?.details, "phases")} />
            )}
            {autoApplied?.delay && (
              <AppliedRow label="Delay" detail={formatDetail(autoApplied?.details, "delays")} />
            )}
            {autoApplied?.gain && (
              <AppliedRow label="Gain" detail={formatDetail(autoApplied?.details, "trims")} />
            )}
            {autoApplied?.globalBassTrim && (
              <AppliedRow
                label="Global bass trim"
                detail={
                  Number.isFinite(autoApplied?.details?.globalTrimDb)
                    ? `${autoApplied.details.globalTrimDb > 0 ? "+" : ""}${autoApplied.details.globalTrimDb.toFixed(1)} dB`
                    : null
                }
              />
            )}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}