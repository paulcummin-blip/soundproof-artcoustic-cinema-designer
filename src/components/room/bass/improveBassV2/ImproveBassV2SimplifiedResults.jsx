// ImproveBassV2SimplifiedResults.jsx
// Simplified Improve Bass Response results UI — replaces the large stage cards.
//
// Shows a simple checkbox list of available improvements with Current → With Change
// metrics (failing seats, primary floor, P19, P20). One "Apply Selected Changes"
// button applies all checked improvements as one atomic configuration, then
// triggers automatic canonical recalculation.
//
// Recommended combined winner is pre-checked. Individual options are unchecked
// (optional). The user can override manually.

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { countFailingSeats } from "./zeroFailOptimiser";
import { buildStageResults, STAGE_ORDER, STAGE_DISPLAY_LABELS } from "./improveBassV2StageAuthority";
import { buildOptimisedInstances } from "./improveBassV2Apply";
import { applyCalibrationTuning, resolveTuningInstances } from "./improveBassV2ApplyCalibration";
import { buildProvenance } from "./appliedProvenance";
import { computeV2DesignFingerprint } from "./improveBassV2Fingerprint";
import { formatAcousticPath } from "./acousticDistance";
import { extractGainAdjustmentDb, extractGainGroupLabel } from "./gainRationaleBuilder";

// ── Helpers ──────────────────────────────────────────────────────────────

function primarySeatMetric(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  return perSeatArray.find((s) => s?.isPrimary === true) || perSeatArray[0];
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : "FAIL";
}

function fmtDb(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(2);
}

function levelColor(level) {
  const n = numericLevel(level);
  if (n >= 3) return "text-[#213428]";
  if (n >= 1) return "text-[#625143]";
  return "text-red-600 font-semibold";
}

// ── Build the list of available improvements ──────────────────────────────

function buildImprovementList(selection) {
  const stages = buildStageResults(selection);
  const currentResult = selection.currentResult;
  const improvements = [];

  for (const stageKey of STAGE_ORDER) {
    const stage = stages[stageKey];
    if (stage.verdict !== "improvement" || !stage.result) continue;

    const result = stage.result;
    const beforeFails = countFailingSeats(currentResult);
    const afterFails = countFailingSeats(result);
    const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
    const afterP19 = primarySeatMetric(result.perSeatP19);
    const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
    const afterP20 = primarySeatMetric(result.perSeatP20);

    // Build a human-readable change description
    let changeDesc = "";
    if (stageKey === "phase") {
      const grouped = result.groupedPhase || {};
      const phaseDeg = Number(grouped.phaseAtReferenceDeg) || 0;
      const refHz = Number(grouped.phaseReferenceHz) || 80;
      if (phaseDeg > 0) changeDesc = `${phaseDeg.toFixed(0)}° lag at ${refHz.toFixed(0)} Hz`;
    } else if (stageKey === "delay") {
      const groupedDelay = result.groupedDelay;
      const range = Number(groupedDelay?.adjustmentMs) || 0;
      if (range > 0.1) changeDesc = `+${range.toFixed(1)} ms (${formatAcousticPath(range)})`;
    } else if (stageKey === "gain") {
      const adjDb = extractGainAdjustmentDb(result);
      if (Math.abs(adjDb) > 0.1) changeDesc = `${adjDb > 0 ? "+" : ""}${adjDb.toFixed(1)} dB`;
    } else if (stageKey === "subPositions") {
      const coords = result.positionCoordinates || result.coordinates || [];
      if (coords.length) changeDesc = `${coords.length} subwoofer${coords.length > 1 ? "s" : ""} repositioned`;
    } else if (stageKey === "seating") {
      const offsetMm = result.seatingOffsetMm || 0;
      const dir = offsetMm < 0 ? "toward screen" : "away from screen";
      if (offsetMm !== 0) changeDesc = `Move ${Math.abs(offsetMm)} mm ${dir}`;
    } else if (stageKey === "combined") {
      changeDesc = "Combined recommended configuration";
    }

    improvements.push({
      stageKey,
      label: STAGE_DISPLAY_LABELS[stageKey],
      result,
      stage,
      changeDesc,
      before: {
        failingSeats: beforeFails,
        p19Level: beforeP19?.level,
        p19Raw: beforeP19?.variationDbRaw,
        p20Level: beforeP20?.level,
        p20Raw: beforeP20?.variationDbRaw,
      },
      after: {
        failingSeats: afterFails,
        p19Level: afterP19?.level,
        p19Raw: afterP19?.variationDbRaw,
        p20Level: afterP20?.level,
        p20Raw: afterP20?.variationDbRaw,
      },
    });
  }

  return improvements;
}

// ── Compose selected changes into one complete configuration ──────────────

export function composeSelectedChanges(
  selectedKeys,
  improvements,
  currentInstances,
  roomDims,
  selectedSubModel,
  applyFingerprint,
  currentFingerprint,
) {
  const _provenance = buildProvenance("subPositions", "combined-apply", applyFingerprint, currentFingerprint);

  // Case 1: Combined winner is selected → use it directly (it has everything)
  if (selectedKeys.has("combined")) {
    const combined = improvements.find((i) => i.stageKey === "combined");
    if (!combined) return null;
    const result = combined.result;
    const hasCoords = (result.positionCoordinates?.length || result.coordinates?.length || 0) > 0;
    let next;
    if (hasCoords) {
      next = buildOptimisedInstances(result, currentInstances, roomDims, selectedSubModel, _provenance);
    } else {
      next = applyCalibrationTuning(currentInstances, result.appliedTuning || result.tuning || [], _provenance);
    }
    return { instances: next, seatingPositions: result.seatingPositions || null };
  }

  // Case 2: Individual stages selected → compose a merged configuration
  const selectedCalibration = ["phase", "delay", "gain"].filter((k) => selectedKeys.has(k));
  const selectedPositions = selectedKeys.has("subPositions");
  const selectedSeating = selectedKeys.has("seating");

  if (selectedCalibration.length === 0 && !selectedPositions && !selectedSeating) {
    return null; // Nothing selected
  }

  // Build merged tuning from selected calibration stages
  let nextInstances = currentInstances;

  if (selectedCalibration.length > 0) {
    // Start with current tuning values, then overlay selected fields
    const activeInstances = (currentInstances || []).filter((s) => s.enabled !== false);
    const referenceTuning = improvements.find((i) => i.stageKey === selectedCalibration[0])?.result?.appliedTuning
      || improvements.find((i) => i.stageKey === selectedCalibration[0])?.result?.tuning
      || [];
    const ordered = resolveTuningInstances(currentInstances, referenceTuning);
    if (!ordered) return null;

    const mergedTuning = ordered.map((inst, i) => {
      const base = {
        sourceId: referenceTuning[i]?.sourceId || inst.id,
        delayMs: Number(inst.delayMs) || 0,
        gainDb: Number(inst.gainDb) || 0,
        phaseControlDeg: inst.phaseControlDeg ?? inst.phaseAdjust ?? 0,
        polarity: Number(inst.polarity) || 0,
      };

      // Overlay phase from phase result
      if (selectedKeys.has("phase")) {
        const phaseResult = improvements.find((im) => im.stageKey === "phase")?.result;
        const phaseTuning = phaseResult?.appliedTuning || phaseResult?.tuning || [];
        const phaseEntry = phaseTuning[i];
        if (phaseEntry) {
          base.phaseControlDeg = phaseEntry.phaseControlDeg ?? phaseEntry.phaseAdjust ?? base.phaseControlDeg;
          base.polarity = phaseEntry.polarity ?? base.polarity;
        }
      }

      // Overlay delay from delay result
      if (selectedKeys.has("delay")) {
        const delayResult = improvements.find((im) => im.stageKey === "delay")?.result;
        const delayTuning = delayResult?.appliedTuning || delayResult?.tuning || [];
        const delayEntry = delayTuning[i];
        if (delayEntry) {
          base.delayMs = delayEntry.delayMs ?? base.delayMs;
        }
      }

      // Overlay gain from gain result
      if (selectedKeys.has("gain")) {
        const gainResult = improvements.find((im) => im.stageKey === "gain")?.result;
        const gainTuning = gainResult?.appliedTuning || gainResult?.tuning || [];
        const gainEntry = gainTuning[i];
        if (gainEntry) {
          base.gainDb = gainEntry.gainDb ?? base.gainDb;
        }
      }

      return base;
    });

    nextInstances = applyCalibrationTuning(currentInstances, mergedTuning, _provenance);
  }

  // Overlay positions from subPositions result
  if (selectedPositions) {
    const posResult = improvements.find((im) => im.stageKey === "subPositions")?.result;
    if (posResult) {
      nextInstances = buildOptimisedInstances(posResult, nextInstances, roomDims, selectedSubModel, _provenance);
    }
  }

  // Extract seating positions if selected
  let seatingPositions = null;
  if (selectedSeating) {
    const seatingResult = improvements.find((im) => im.stageKey === "seating")?.result;
    if (seatingResult?.seatingPositions) {
      seatingPositions = seatingResult.seatingPositions;
    }
  }

  return { instances: nextInstances, seatingPositions };
}

// ── Metric delta display ──────────────────────────────────────────────────

function MetricDelta({ label, beforeValue, afterValue, formatFn, levelBased = false }) {
  const before = formatFn(beforeValue);
  const after = formatFn(afterValue);
  const changed = levelBased
    ? numericLevel(beforeValue) !== numericLevel(afterValue)
    : Math.abs(Number(beforeValue) - Number(afterValue)) > 0.05;

  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-[#8A7B6A] w-10">{label}</span>
      <span className={levelBased ? levelColor(beforeValue) : "text-[#625143]"}>{before}</span>
      {changed && <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />}
      {changed && <span className={levelBased ? levelColor(afterValue) : "text-[#213428] font-medium"}>{after}</span>}
    </div>
  );
}

function FailingSeatsDelta({ before, after }) {
  const changed = before !== after;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-[#8A7B6A] w-10">Fails</span>
      <span className={before > 0 ? "text-red-600 font-semibold" : "text-[#213428]"}>{before}</span>
      {changed && <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />}
      {changed && <span className={after > 0 ? "text-red-600 font-semibold" : "text-[#213428] font-semibold"}>{after}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ImproveBassV2SimplifiedResults({
  selection,
  currentInstances,
  roomDims,
  seatingPositions,
  selectedSubModel,
  onApplySelected,
  stale,
  sharedBassResults,
  currentDesignFingerprint,
}) {
  const improvements = useMemo(() => buildImprovementList(selection), [selection]);

  // Pre-select the combined winner (recommended). Individual options unchecked.
  const [selectedKeys, setSelectedKeys] = useState(() => {
    const initial = new Set();
    if (improvements.some((im) => im.stageKey === "combined")) {
      initial.add("combined");
    }
    return initial;
  });

  // Reset selection when a new result arrives (new optimisation run)
  useEffect(() => {
    const initial = new Set();
    if (improvements.some((im) => im.stageKey === "combined")) {
      initial.add("combined");
    }
    setSelectedKeys(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const toggleImprovement = useCallback((stageKey) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(stageKey)) {
        next.delete(stageKey);
      } else {
        next.add(stageKey);
      }
      // If selecting an individual option, uncheck combined (user override)
      if (stageKey !== "combined" && next.has(stageKey)) {
        next.delete("combined");
      }
      // If selecting combined, uncheck all individual options
      if (stageKey === "combined" && next.has(stageKey)) {
        STAGE_ORDER.forEach((k) => { if (k !== "combined") next.delete(k); });
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    if (onApplySelected) {
      onApplySelected(selectedKeys, improvements);
    }
  }, [selectedKeys, improvements, onApplySelected]);

  if (improvements.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">
            {selection?.message || "No verified material automatic improvement found."}
          </span>
        </div>
      </div>
    );
  }

  const hasSelection = selectedKeys.size > 0;

  return (
    <div className="mt-3 space-y-2" data-simplified-results="true">
      <div className="text-[11px] font-semibold text-[#213428] uppercase tracking-wide">
        Improvements found
      </div>

      {improvements.map((imp) => {
        const isCombined = imp.stageKey === "combined";
        const isChecked = selectedKeys.has(imp.stageKey);
        const failsChanged = imp.before.failingSeats !== imp.after.failingSeats;
        const p19Changed = numericLevel(imp.before.p19Level) !== numericLevel(imp.after.p19Level)
          || Math.abs(Math.abs(Number(imp.before.p19Raw)) - Math.abs(Number(imp.after.p19Raw))) > 0.05;
        const p20Changed = numericLevel(imp.before.p20Level) !== numericLevel(imp.after.p20Level)
          || Math.abs(Math.abs(Number(imp.before.p20Raw)) - Math.abs(Number(imp.after.p20Raw))) > 0.05;

        return (
          <div
            key={imp.stageKey}
            data-improvement-key={imp.stageKey}
            data-improvement-checked={isChecked ? "true" : "false"}
            className={`rounded-md border p-2.5 transition-colors ${
              isCombined
                ? "border-2 border-[#213428] bg-[#E7F0EC]"
                : isChecked
                  ? "border-[#213428]/30 bg-[#F8F7F4]"
                  : "border-[#E7E4DF] bg-white"
            }`}
          >
            {/* Checkbox + label row */}
            <div className="flex items-start gap-2">
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleImprovement(imp.stageKey)}
                className="mt-0.5"
                data-improvement-checkbox={imp.stageKey}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold text-[#1B1A1A] ${isCombined ? "tracking-wide" : ""}`}>
                    {isCombined ? "Recommended combined improvement" : imp.label}
                  </span>
                  {isCombined && (
                    <span className="text-[9px] font-medium text-[#213428] bg-[#D9E5DF] rounded px-1.5 py-0.5">
                      BEST OVERALL
                    </span>
                  )}
                </div>
                {imp.changeDesc && (
                  <div className="text-[10px] text-[#625143] mt-0.5">{imp.changeDesc}</div>
                )}
              </div>
            </div>

            {/* Current → With Change metrics */}
            <div className="mt-2 ml-6 space-y-1">
              {failsChanged && (
                <FailingSeatsDelta before={imp.before.failingSeats} after={imp.after.failingSeats} />
              )}
              <MetricDelta
                label="Floor"
                beforeValue={imp.before.p20Level}
                afterValue={imp.after.p20Level}
                formatFn={levelText}
                levelBased
              />
              {(p19Changed || p20Changed) && (
                <div className="flex gap-4">
                  {p19Changed && (
                    <MetricDelta
                      label="P19"
                      beforeValue={imp.before.p19Raw}
                      afterValue={imp.after.p19Raw}
                      formatFn={fmtDb}
                    />
                  )}
                  {p20Changed && (
                    <MetricDelta
                      label="P20"
                      beforeValue={imp.before.p20Raw}
                      afterValue={imp.after.p20Raw}
                      formatFn={fmtDb}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* One Apply button */}
      {!stale && (
        <Button
          type="button"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold mt-2"
          disabled={!hasSelection}
          onClick={handleApply}
          data-apply-selected="true"
        >
          Apply Selected Changes
        </Button>
      )}
    </div>
  );
}