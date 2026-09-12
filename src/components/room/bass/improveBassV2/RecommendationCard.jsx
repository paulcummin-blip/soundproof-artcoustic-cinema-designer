import V2SeatBeforeAfterGrid from "./V2SeatBeforeAfterGrid.jsx";
// RecommendationCard.jsx
// A single ranked recommendation card for the Improve Bass V2 results.
//
// Shows:
//   - Rank tier label (BEST IMPROVEMENT / NEXT BEST / SMALLER IMPROVEMENT)
//   - Intervention label (Adjust calibration / Adjust subwoofer positions)
//   - P19/P20 before→after levels (or "Same RP22 level")
//   - Raw improvement (if same level)
//   - What changed (positions / calibration settings) — collapsible
//   - Apply button (only on the #1 / canonical winner recommendation)
//
// Lower-ranked recommendations are preview-only — no Apply button — to
// preserve the canonical winner authority and the explicit-Apply safety.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, MapPin, Sliders, CheckCircle2 } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatLevelChangeText, hasLevelChange } from "./recommendationRanker.js";
import { buildWhatChanged } from "./improveBassV2WhatChanged.js";
import { buildCalibrationSummary } from "./improveBassV2Apply.js";

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : "FAIL";
}

function InterventionIcon({ type }) {
  if (type === 'calibration') return <Sliders className="h-4 w-4 text-[#213428]" />;
  return <MapPin className="h-4 w-4 text-[#213428]" />;
}

function LevelChangeBadge({ rec }) {
  const text = formatLevelChangeText(rec);
  if (!hasLevelChange(rec)) {
    return (
      <div className="text-[10px] text-[#625143] font-medium">{text}</div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-[#E7F0EC] border border-[#213428]/20 px-2 py-0.5">
      <span className="text-[10px] font-semibold text-[#213428]">{text}</span>
    </div>
  );
}

function RawImprovementText({ rec }) {
  if (hasLevelChange(rec)) return null;
  if (rec.rawImprovement < 0.1) return null;
  return (
    <div className="text-[10px] text-[#625143]">
      P19/P20 deviation reduced by {rec.rawImprovement.toFixed(1)} dB
    </div>
  );
}

function WhatChangedSection({ rec, snapshot, currentInstances }) {
  const [showChanges, setShowChanges] = useState(false);
  const result = rec.result;

  // Build what-changed from the result
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

export default function RecommendationCard({
  recommendation,
  snapshot,
  currentInstances,
  onApply,
  onApplyCalibration,
  isApplied,
  currentResult,
  seatingPositions,
}) {
  const rec = recommendation;
  const isWinner = rec.isWinner;
  const tierColor = rec.rank === 1
    ? 'border-[#213428] bg-[#F8F7F4]'
    : 'border-[#E7E4DF] bg-[#F8F7F4]';

  return (
    <div data-candidate-id={rec.result.candidateId} className={`rounded-md border ${tierColor} p-3`}>
      {/* Tier label + intervention */}
      <div className="flex items-center gap-2">
        <InterventionIcon type={rec.interventionType} />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#625143]">
          {rec.rank}. {rec.tier}
        </span>
      </div>
      <div className="mt-1 text-[12px] font-semibold text-[#213428]">
        {rec.interventionLabel}
      </div>
      {rec.interventionSubLabel && (
        <div className="text-[10px] text-[#625143] mt-0.5">{rec.interventionSubLabel}</div>
      )}

      {/* Level change / raw improvement */}
      <div className="mt-2 space-y-1">
        <LevelChangeBadge rec={rec} />
        <RawImprovementText rec={rec} />
      </div>

      {/* Materiality reason */}
      {rec.materialityReason && (
        <div className="mt-1.5 text-[10px] leading-relaxed text-[#625143]">
          {rec.materialityReason}
        </div>
      )}

      {/* What changed (collapsible) */}
      <WhatChangedSection rec={rec} snapshot={snapshot} currentInstances={currentInstances} />

      {/* Apply button — only on the canonical winner */}
      {isWinner && (
        <div className="mt-3">
          <Button
            type="button"
            className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold"
            data-apply-candidate-id={rec.result.candidateId}
            onClick={() => (rec.interventionType === 'calibration' ? onApplyCalibration : onApply)?.(rec.result.candidateId)}
            disabled={isApplied}
          >
            {isApplied ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Applied
              </>
            ) : (
              rec.interventionType === 'calibration' ? 'Apply Calibration' : 'Apply Optimised Design'
            )}
          </Button>
        </div>
      )}

      <details data-comparison-candidate-id={rec.result.candidateId} className="mt-2 text-[10px]">
        <summary>P19 / P20 — per-seat comparison</summary>
        <V2SeatBeforeAfterGrid seatingPositions={seatingPositions}
          beforeP19={currentResult?.perSeatP19 || []} afterP19={rec.result.perSeatP19}
          beforeP20={currentResult?.perSeatP20 || []} afterP20={rec.result.perSeatP20} />
      </details>

    </div>
  );
}