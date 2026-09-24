// BassOptimisationSummary.jsx
// ---------------------------------------------------------------------------
// ADI-driven engineering recommendation — replaces optimiser diagnostics.
//
// Displays the Physical-First, RP22-Reported engineering story:
//   Physical Diagnosis → Recommended Action → Expected Improvement → Remaining Limitation
//
// The optimiser is the engineer. ADI is the interpreter. This component
// only presents the ADI reasoning — it never changes engineering behaviour.
//
// When calibration was auto-applied, an "Applied" badge confirms the action.
// Physical recommendations (move subs, move seating) flow naturally below
// via FurtherImprovements — no duplicate heading, one continuous story.
// ---------------------------------------------------------------------------

import React from "react";
import { CheckCircle2, Activity, Wrench, TrendingUp, AlertTriangle } from "lucide-react";
import { runEngineeringDecisionModel } from "@/components/adi";

export default function BassOptimisationSummary({
  autoApplied,
  v2State,
  completedBassAuthority,
  subwooferCount,
  shared,
  roomDims,
  seatingPositions,
}) {
  const adiDecision = React.useMemo(() => {
    try {
      return runEngineeringDecisionModel({
        optimiserResult: v2State,
        currentResult: completedBassAuthority?.result || completedBassAuthority,
        designObjectives: {
          p14TargetDb: shared?.authoritative?.requested?.selectedP14TargetDb,
          p14Level: shared?.authoritative?.requested?.requestedLevel,
          p18TargetBasis: shared?.authoritative?.requested?.p18TargetBasis,
        },
        context: { subwooferCount, roomDims, seatingPositions },
      });
    } catch {
      return null;
    }
  }, [v2State, completedBassAuthority, shared, subwooferCount, roomDims, seatingPositions]);

  if (!adiDecision?.recommendation) return null;

  const { recommendation, diagnosis } = adiDecision;
  const problemDesc = diagnosis?.problem?.description || "No significant issue identified";
  const causeDesc = diagnosis?.physicalCause?.description || "";
  const correctabilityDesc = diagnosis?.correctability?.description || "";

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[#213428]" />
        <span className="text-[13px] font-semibold text-[#1B1A1A]">
          Engineering Recommendation
        </span>
        {autoApplied && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#213428] px-2 py-0.5 text-[9px] font-semibold uppercase text-white">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Applied
          </span>
        )}
      </div>

      {/* Physical diagnosis */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          <AlertTriangle className="h-3 w-3" />
          Physical Diagnosis
        </div>
        <div className="text-[11px] text-[#3E4349] leading-relaxed">
          {problemDesc}
          {causeDesc && <div className="mt-0.5 text-[#625143]">{causeDesc}</div>}
          {correctabilityDesc && <div className="mt-0.5 text-[#625143]">{correctabilityDesc}</div>}
        </div>
      </div>

      {/* Recommended action */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          <Wrench className="h-3 w-3" />
          Recommended Action
        </div>
        <div className="text-[11px] text-[#1B1A1A] font-medium leading-relaxed">
          {recommendation.action}
        </div>
      </div>

      {/* Expected improvement */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          <TrendingUp className="h-3 w-3" />
          Expected Improvement
        </div>
        <div className="text-[11px] text-[#3E4349] leading-relaxed">
          {recommendation.expectedEngineeringEffect}
        </div>
      </div>

      {/* Remaining limitation */}
      <div className="space-y-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          Remaining Limitation
        </div>
        <div className="text-[11px] text-[#625143] leading-relaxed">
          {recommendation.remainingLimitation}
        </div>
      </div>
    </div>
  );
}