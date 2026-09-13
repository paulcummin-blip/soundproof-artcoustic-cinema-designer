// TradeOffCard.jsx
// Presents a verified trade-off as a designer choice — NOT a recommendation.
//
// Shows:
//   - "Alternative calibration available" headline (neutral)
//   - What improves and what reduces (neutral language, no judgement)
//   - Two designer actions: "Prioritise Primary Seats" vs "Keep Current Balance"
//   - Neutral supporting text explaining the choice
//   - Practical calibrator settings (front/rear pair delay, gain, polarity)
//   - Apply lifecycle: READY → APPLYING → VERIFIED APPLIED
//   - Before evidence remains visible throughout apply
//
// NEVER uses: "better design", "worse design", "recommended", "poor choice"
// The designer is choosing a priority, not being told one is universally correct.

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, Scale, CheckCircle2, Loader2 } from "lucide-react";
import { buildWhatChanged } from "./improveBassV2WhatChanged.js";
import { buildCalibrationSummary } from "./improveBassV2Apply.js";
import { buildTradeOffSummary, delayToPathLengthCm } from "./tradeOffClassifier.js";

function levelText(level) {
  const n = (() => {
    if (Number.isFinite(Number(level))) return Math.max(0, Math.min(4, Number(level)));
    const match = String(level || "").match(/^L([1-4])$/i);
    return match ? Number(match[1]) : 0;
  })();
  return n > 0 ? `L${n}` : "FAIL";
}

function normalisePolarity(value) {
  const n = Number(value) || 0;
  return (n < 0 || n === 180) ? -1 : 0;
}

function polarityText(pol) {
  return normalisePolarity(pol) < 0 ? "Inverted" : "Normal";
}

/**
 * Group tuning entries into front/rear pairs based on instance legacyGroup.
 * Returns { front: [tuning...], rear: [tuning...], hasGroups: boolean }
 */
function groupTuningByPosition(tuning, currentInstances) {
  if (!Array.isArray(tuning) || !Array.isArray(currentInstances)) {
    return { front: [], rear: [], hasGroups: false };
  }
  const activeInstances = currentInstances.filter(s => s.enabled !== false);
  const byId = new Map(activeInstances.map(s => [s.id, s]));
  const front = [];
  const rear = [];
  for (const t of tuning) {
    const inst = byId.get(t.sourceId);
    const group = inst?.legacyGroup || inst?.legacy_group || "";
    if (group === "front") front.push(t);
    else if (group === "rear") rear.push(t);
    else front.push(t); // default to front
  }
  return { front, rear, hasGroups: front.length > 0 && rear.length > 0 };
}

/**
 * Summarise a group of tuning entries into a single display line.
 * If all entries have the same value, show it once; otherwise show per-sub.
 */
function summariseGroupValue(entries, field, formatter) {
  if (!entries.length) return "—";
  const values = entries.map(t => Number(t[field]) || 0);
  const allSame = values.every(v => Math.abs(v - values[0]) < 0.05);
  if (allSame) return formatter(values[0]);
  return values.map((v, i) => `Sub ${i + 1}: ${formatter(v)}`).join(", ");
}

function PracticalTuningSection({ result, currentInstances }) {
  const tuning = result?.appliedTuning || result?.tuning || [];
  const { front, rear, hasGroups } = useMemo(
    () => groupTuningByPosition(tuning, currentInstances),
    [tuning, currentInstances]
  );

  if (!tuning.length) return null;

  // Compute relative delay between front and rear groups
  const frontAvgDelay = front.length ? front.reduce((s, t) => s + (Number(t.delayMs) || 0), 0) / front.length : 0;
  const rearAvgDelay = rear.length ? rear.reduce((s, t) => s + (Number(t.delayMs) || 0), 0) / rear.length : 0;
  const relativeDelayMs = hasGroups ? rearAvgDelay - frontAvgDelay : 0;
  const relativePathCm = delayToPathLengthCm(relativeDelayMs);

  const formatDelay = (v) => `${v.toFixed(1)} ms`;
  const formatGain = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;

  return (
    <div className="mt-2 rounded-md border border-[#E0DDD7] bg-white p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
        <Settings className="h-3 w-3" />
        Practical calibrator settings
      </div>
      <div className="mt-1.5 space-y-1.5">
        {hasGroups ? (
          <>
            <div className="text-[10px] text-[#625143]">
              <span className="font-semibold">Front pair:</span>{" "}
              delay {summariseGroupValue(front, "delayMs", formatDelay)},
              gain {summariseGroupValue(front, "gainDb", formatGain)},
              polarity {summariseGroupValue(front, "polarity", polarityText)}
            </div>
            <div className="text-[10px] text-[#625143]">
              <span className="font-semibold">Rear pair:</span>{" "}
              delay {summariseGroupValue(rear, "delayMs", formatDelay)},
              gain {summariseGroupValue(rear, "gainDb", formatGain)},
              polarity {summariseGroupValue(rear, "polarity", polarityText)}
            </div>
            {Math.abs(relativeDelayMs) > 0.05 && (
              <div className="text-[10px] text-[#625143]">
                <span className="font-semibold">Rear pair relative delay:</span>{" "}
                {relativeDelayMs > 0 ? "+" : ""}{relativeDelayMs.toFixed(1)} ms
                {" "}(~{relativePathCm} cm acoustic path equivalent)
              </div>
            )}
          </>
        ) : (
          <div className="text-[10px] text-[#625143]">
            <span className="font-semibold">Subs:</span>{" "}
            delay {summariseGroupValue(tuning, "delayMs", formatDelay)},
            gain {summariseGroupValue(tuning, "gainDb", formatGain)},
            polarity {summariseGroupValue(tuning, "polarity", polarityText)}
          </div>
        )}
        <p className="text-[9px] italic text-[#8A7B6A]">
          Calibration settings are reproduced in the processor by the installer.
        </p>
      </div>
    </div>
  );
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
        What Sound Proof checked
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

  // Apply lifecycle: idle → applying → verified
  const [applyState, setApplyState] = useState("idle");
  const [declined, setDeclined] = useState(false);

  // When the parent confirms the tuning is applied, transition to verified
  useEffect(() => {
    if (applyState === "applying" && isApplied) {
      setApplyState("verified");
    }
  }, [applyState, isApplied]);

  const handleApply = () => {
    setApplyState("applying");
    onApply?.(candidateId);
  };

  const handleKeepCurrent = () => {
    setDeclined(true);
  };

  // After verified or declined, show the evidence card but hide action buttons
  const showActions = applyState === "idle" && !declined;

  return (
    <div data-candidate-id={candidateId} data-trade-off-card={candidateId}
      data-apply-state={applyState}
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

      {/* What Sound Proof checked — always visible (evidence retained) */}
      <WhatChangedSection result={result} snapshot={snapshot} currentInstances={currentInstances} />

      {/* Practical calibrator settings — visible when applying or verified */}
      {(applyState === "applying" || applyState === "verified" || isApplied) && (
        <PracticalTuningSection result={result} currentInstances={currentInstances} />
      )}

      {/* Apply status — visible during apply lifecycle */}
      {applyState === "applying" && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-[#E0DDD7] bg-white p-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#213428]" />
          <span className="text-[10px] font-semibold text-[#213428]">
            APPLYING CALIBRATION
          </span>
        </div>
      )}
      {applyState === "verified" && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-[#213428] bg-white p-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#213428]" />
          <span className="text-[10px] font-semibold text-[#213428]">
            VERIFIED APPLIED
          </span>
        </div>
      )}

      {/* Designer choice buttons */}
      {showActions && (
        <div className="mt-3 space-y-2" data-trade-off-actions={candidateId}>
          <Button
            type="button"
            className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold"
            data-apply-trade-off-id={candidateId}
            onClick={handleApply}
          >
            Prioritise Primary Seats
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-[#D9D5CE] text-[#625143] hover:bg-[#E7E4DF]"
            data-keep-current-id={candidateId}
            onClick={handleKeepCurrent}
          >
            Keep Current Balance
          </Button>
        </div>
      )}

      {/* Declined notice — no mutation, evidence still visible */}
      {declined && (
        <div className="mt-2 text-[10px] text-[#8A7B6A] italic" data-declined={candidateId}>
          Current balance retained. No changes applied.
        </div>
      )}
    </div>
  );
}