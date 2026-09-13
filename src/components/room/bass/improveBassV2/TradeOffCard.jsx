// TradeOffCard.jsx
// Presents a verified trade-off as a designer choice — NOT a recommendation.
//
// Shows:
//   - "Alternative calibration available" headline (neutral)
//   - What improves and what reduces (neutral language, no judgement)
//   - Two designer options: "Prioritise Primary Seats" vs "Keep Current Balance"
//   - Neutral supporting text explaining the choice
//   - What-changed collapsible (same as RecommendationCard)
//   - Apply button for the alternative
//
// NEVER uses: "better design", "worse design", "recommended", "poor choice"
// The designer is choosing a priority, not being told one is universally correct.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, Scale, CheckCircle2 } from "lucide-react";
import { buildWhatChanged } from "./improveBassV2WhatChanged.js";
import { buildCalibrationSummary } from "./improveBassV2Apply.js";
import { buildTradeOffSummary } from "./tradeOffClassifier.js";

function levelText(level) {
  const n = (() => {
    if (Number.isFinite(Number(level))) return Math.max(0, Math.min(4, Number(level)));
    const match = String(level || "").match(/^L([1-4])$/i);
    return match ? Number(match[1]) : 0;
  })();
  return n > 0 ? `L${n}` : "FAIL";
}

function WhatChangedSection({ result, snapshot, currentInstances }) {
  const [showChanges, setShowChanges] = useState(false);

  const winnerForChanges = {
    ...result,
    coordinates: result.positionCoordinates || result.coordinates,
    appliedTuning: result.appliedTuning || result.tuning,
  };
  const augmentedSnapshot = {
    ...snapshot,
    positions: (snapshot?.positions && snapshot.positions.length > 0)
      ? snapshot.positions
      : (Array.isArray(currentInstances) ? currentInstances.filter((s) => s.enabled !== false).map((inst) => ({ x: Number(inst.position?.x) || 0, y: Number(inst.position?.y) || 0 })) : []),
    tuning: (snapshot?.tuning && snapshot.tuning.length > 0)
      ? snapshot.tuning
      : (Array.isArray(currentInstances) ? currentInstances.filter((s) => s.enabled !== false).map((inst) => ({ delayMs: Number(inst.delayMs) || 0, gainDb: Number(inst.gainDb) || 0, polarity: Number(inst.polarity) || 0 })) : []),
  };

  const whatChanged = buildWhatChanged(augmentedSnapshot, winnerForChanges);
  const calSummary = buildCalibrationSummary(winnerForChanges);

  const hasDesignChanges = whatChanged.designChanges.length > 0;
  const hasCalChanges = whatChanged.calibrationChanges.length > 0;
  if (!hasDesignChanges && !hasCalChanges) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setShowChanges(!showChanges)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-[#213428] hover:underline"
      >
        {showChanges ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        What changed
      </button>
      {showChanges && (
        <div className="mt-1.5 space-y-1.5">
          {hasDesignChanges && (
            <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
                <Wrench className="h-3 w-3" />
                Design changes
              </div>
              <ul className="mt-1 space-y-0.5">
                {whatChanged.designChanges.map((change, i) => (
                  <li key={i} className="text-[10px] leading-relaxed text-[#625143]">• {change}</li>
                ))}
              </ul>
            </div>
          )}
          {hasCalChanges && (
            <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
                <Settings className="h-3 w-3" />
                Calibration settings
              </div>
              <ul className="mt-1 space-y-0.5">
                {whatChanged.calibrationChanges.map((change, i) => (
                  <li key={i} className="text-[10px] leading-relaxed text-[#625143]">• {change}</li>
                ))}
              </ul>
              <p className="mt-1 text-[9px] italic text-[#8A7B6A]">
                Calibration settings are reproduced in the processor by the installer.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TradeOffCard({
  tradeOffEntry,
  snapshot,
  currentInstances,
  onApply,
  isApplied,
  currentResult,
  seatingPositions,
}) {
  const { result, tradeOff, candidateId } = tradeOffEntry;
  const { improvement, worsening, neutralText } = tradeOff;
  const summary = buildTradeOffSummary(improvement, worsening);

  return (
    <div data-candidate-id={candidateId} data-trade-off-card={candidateId}
      className="rounded-md border border-[#B8A88E] bg-[#F8F7F4] p-3">
      {/* Headline — neutral */}
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-[#625143]" />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#625143]">
          Alternative calibration available
        </span>
      </div>

      {/* Trade-off summary — neutral, no judgement */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-[#625143]">Improves</div>
          <div className="mt-0.5 text-[11px] font-semibold text-[#213428]">{summary.improvesLabel}</div>
          <div className="text-[10px] text-[#625143]">{summary.improvesText}</div>
        </div>
        <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-[#625143]">Reduces</div>
          <div className="mt-0.5 text-[11px] font-semibold text-[#213428]">{summary.reducesLabel}</div>
          <div className="text-[10px] text-[#625143]">{summary.reducesText}</div>
        </div>
      </div>

      {/* Neutral supporting text */}
      <p className="mt-2 text-[10px] leading-relaxed text-[#625143]">
        {neutralText}
      </p>

      {/* What changed */}
      <WhatChangedSection result={result} snapshot={snapshot} currentInstances={currentInstances} />

      {/* Designer choice buttons */}
      <div className="mt-3 space-y-2">
        <Button
          type="button"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold"
          data-apply-trade-off-id={candidateId}
          onClick={() => onApply?.(candidateId)}
          disabled={isApplied}
        >
          {isApplied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Applied
            </>
          ) : (
            "Prioritise Primary Seats"
          )}
        </Button>
        <div className="text-center text-[10px] text-[#8A7B6A]">
          or keep the current balance — both are legitimate choices
        </div>
      </div>
    </div>
  );
}