// TradeOffCard.jsx
// Presents a verified trade-off as a designer choice — NOT a recommendation.
//
// Shows:
//   - "Alternative: Prioritise Primary Seats" headline (secondary/trade-off)
//   - What improves and what reduces (neutral language, no judgement)
//   - Two designer actions: "Prioritise Primary Seats" vs "Keep Recommended Balance"
//   - Neutral supporting text explaining the choice
//   - Practical calibrator settings (front/rear pair delay, gain, polarity)
//   - Apply lifecycle: READY → APPLYING → VERIFIED APPLIED
//   - Before evidence remains visible throughout apply
//
// NEVER uses: "better design", "worse design", "recommended", "poor choice"
// The designer is choosing a priority, not being told one is universally correct.

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, Scale, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { buildWhatChanged } from "./improveBassV2WhatChanged.js";
import { buildCalibrationSummary } from "./improveBassV2Apply.js";
import { buildTradeOffSummary, delayToPathLengthCm } from "./tradeOffClassifier.js";
import { resolveTradeOffVerification, VERIFICATION_VERIFIED, VERIFICATION_FAILED } from "./tradeOffVerificationAuthority.js";

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

  const roundToHalf = (v) => Math.round(Number(v) * 2) / 2;
  const formatDelay = (v) => `${roundToHalf(v).toFixed(1)} ms`;
  const formatGain = (v) => `${v > 0 ? "+" : ""}${roundToHalf(v).toFixed(1)} dB`;

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

/**
 * Display the actual verified after-values from the completed bass authority.
 * Shows the real P14/P18/P19/P20 values that the bass engine produced for the
 * applied design — not the predicted values from the trade-off candidate.
 */
function VerifiedAfterValues({ verifiedValues }) {
  const { perSeatP19Results, perSeatP20Results, p14AchievedLevel, p18AchievedExtensionHz } = verifiedValues;

  // Summarise per-seat P19 levels
  const p19Summary = useMemo(() => {
    if (!Array.isArray(perSeatP19Results) || perSeatP19Results.length === 0) return null;
    return perSeatP19Results.map((s) => {
      const level = s.achievedLevel ?? s.p19Level ?? s.level;
      const seatId = s.seatId || s.id || "?";
      return { seatId, level };
    });
  }, [perSeatP19Results]);

  // Summarise per-seat P20 deviation
  const p20Summary = useMemo(() => {
    if (!Array.isArray(perSeatP20Results) || perSeatP20Results.length === 0) return null;
    return perSeatP20Results.map((s) => {
      const deviation = s.deviationDb ?? s.p20DeviationDb ?? s.rawDeviationDb;
      const seatId = s.seatId || s.id || "?";
      return { seatId, deviation };
    });
  }, [perSeatP20Results]);

  const levelText = (lvl) => {
    const n = Number(lvl);
    if (Number.isFinite(n) && n >= 1 && n <= 4) return `L${n}`;
    if (typeof lvl === "string" && /^L[1-4]$/i.test(lvl)) return lvl.toUpperCase();
    return "—";
  };

  return (
    <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-[#625143]">
        Verified after-values
      </div>
      <div className="mt-1 space-y-1">
        {p14AchievedLevel != null && (
          <div className="text-[10px] text-[#213428]">
            <span className="font-semibold">P14 achieved:</span> {levelText(p14AchievedLevel)}
          </div>
        )}
        {p18AchievedExtensionHz != null && (
          <div className="text-[10px] text-[#213428]">
            <span className="font-semibold">P18 extension:</span> {Number(p18AchievedExtensionHz).toFixed(1)} Hz
          </div>
        )}
        {p19Summary && (
          <div className="text-[10px] text-[#213428]">
            <span className="font-semibold">P19 per-seat:</span>{" "}
            {p19Summary.map((s) => `${s.seatId} ${levelText(s.level)}`).join(", ")}
          </div>
        )}
        {p20Summary && (
          <div className="text-[10px] text-[#213428]">
            <span className="font-semibold">P20 per-seat:</span>{" "}
            {p20Summary.map((s) => `${s.seatId} ${Number(s.deviation).toFixed(1)} dB`).join(", ")}
          </div>
        )}
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
  sharedBassResults,
  currentDesignFingerprint,
}) {
  const { result, tradeOff, candidateId } = tradeOffEntry;
  const { improvement, worsening, neutralText } = tradeOff;
  const summary = buildTradeOffSummary(improvement, worsening);

  // Apply lifecycle: idle → applying → recalculating → verified | failed
  const [applyState, setApplyState] = useState("idle");
  const [declined, setDeclined] = useState(false);

  // When the parent confirms the tuning is committed, transition to recalculating.
  useEffect(() => {
    if (applyState === "applying" && isApplied) {
      setApplyState("recalculating");
    }
  }, [applyState, isApplied]);

  // Verification authority: resolve from the shared bass results.
  // VERIFIED APPLIED only appears when a completed authoritative bass result
  // exists for the applied design with P14/P18/P19/P20 values available.
  // No fixed timer — the real result drives the transition.
  const verification = useMemo(
    () => resolveTradeOffVerification({ isApplied, shared: sharedBassResults, currentDesignFingerprint }),
    [isApplied, sharedBassResults, currentDesignFingerprint]
  );

  useEffect(() => {
    if (applyState !== "recalculating") return;
    if (verification.status === VERIFICATION_VERIFIED) {
      setApplyState("verified");
    } else if (verification.status === VERIFICATION_FAILED) {
      setApplyState("failed");
    }
    // else: stay in "recalculating" until the real result arrives
  }, [applyState, verification.status]);

  const handleApply = () => {
    setApplyState("applying");
    onApply?.(candidateId);
  };

  const handleKeepCurrent = () => {
    setDeclined(true);
  };

  // After verified, failed, or declined, show the evidence card but hide action buttons
  const showActions = applyState === "idle" && !declined;

  return (
    <div data-candidate-id={candidateId} data-trade-off-card={candidateId}
      data-apply-state={applyState}
      data-verification-status={verification.status}
      className="rounded-md border border-[#D9D5CE] bg-[#F5F4F1] p-3">

      {/* Headline — alternative trade-off */}
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-[#8A7B6A]" />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          Alternative: Prioritise Primary Seats
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-[#8A7B6A]">
        Improves the primary listening position, but reduces consistency across the seating area.
      </p>

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

      {/* Practical calibrator settings — visible when applying, recalculating, or verified */}
      {(applyState === "applying" || applyState === "recalculating" || applyState === "verified" || isApplied) && (
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
      {applyState === "recalculating" && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-[#E0DDD7] bg-white p-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#213428]" />
          <span className="text-[10px] font-semibold text-[#213428]">
            RECALCULATING BASS RESPONSE
          </span>
        </div>
      )}
      {applyState === "verified" && verification.verifiedValues && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 rounded-md border border-[#213428] bg-white p-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#213428]" />
            <span className="text-[10px] font-semibold text-[#213428]">
              VERIFIED APPLIED
            </span>
          </div>
          <VerifiedAfterValues verifiedValues={verification.verifiedValues} />
        </div>
      )}
      {applyState === "failed" && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-700" />
            <span className="text-[10px] font-semibold text-red-800">
              VERIFICATION FAILED
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-red-700">
            The bass recalculation did not produce a valid result for this calibration.
            The trade-off was not verified. The before evidence remains visible above.
            Recalculate bass response and try again, or keep the recommended balance.
          </p>
          <p className="text-[10px] leading-relaxed text-red-700" data-verification-failed-reason={verification.reason}>
            Reason: {verification.reason}
          </p>
        </div>
      )}

      {/* Designer choice buttons */}
      {showActions && (
        <div className="mt-3 space-y-2" data-trade-off-actions={candidateId}>
          <Button
            type="button"
            variant="outline"
            className="w-full border-[#8A7B6A] text-[#625143] hover:bg-[#E7E4DF] font-semibold"
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
            Keep Recommended Balance
          </Button>
        </div>
      )}

      {/* Declined notice — no mutation, evidence still visible */}
      {declined && (
        <div className="mt-2 text-[10px] text-[#8A7B6A] italic" data-declined={candidateId}>
          Recommended balance retained. No changes applied.
        </div>
      )}
    </div>
  );
}