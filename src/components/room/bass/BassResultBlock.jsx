import React from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import BassResultsPills from "@/components/room/bass/BassResultsPills";
import BassDesignRecommendation from "@/components/room/bass/BassDesignRecommendation";
import BassCapabilitySummary from "@/components/room/bass/BassCapabilitySummary";

// BassResultBlock — presentation-only. Consumes the already-published
// authoritative result from the shared room analysis owner. No second
// simulation path: all data comes from useSharedBassResults().
//
// Contains ONLY:
//   1. P14 / P18 / P19 / P20 pills
//   2. Concise capability / limitation / improvement guidance
//
// The authoritative response graph, RSP/seat selectors, and graph-layer
// controls live exclusively in Bass Simulation (BassResponse.jsx).
// Gated by verified current authority (hasCurrentResult), not structural storage.
export default function BassResultBlock() {
  const shared = useSharedBassResults();

  if (!shared?.hasCurrentResult) return null;

  return (
    <div className="mt-4 space-y-3">
      {/* 1. P14 / P18 / P19 / P20 pills */}
      <BassResultsPills compact={false} nowMs={Date.now()} />

      {/* 2. Concise capability / limitation / improvement guidance */}
      <BassCapabilitySummary
        capability={shared?.contract?.selectedCandidate?.postEqCapabilityAssessment}
        targetWarning={shared?.contract?.selectedCandidate?.targetWarning}
        p14Parameter={shared?.contract?.productAnalysis?.parameters?.p14}
      />
      <BassDesignRecommendation recommendation={shared?.contract?.designRecommendation} />
    </div>
  );
}