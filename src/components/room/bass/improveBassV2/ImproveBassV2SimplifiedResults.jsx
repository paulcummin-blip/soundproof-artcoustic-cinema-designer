// ImproveBassV2SimplifiedResults.jsx
// Simplified Improve Bass Response results UI with live canonical combination preview.
//
// Layout:
//   CURRENT SYSTEM — failing seats, primary floor, P19/P20 seat pills
//   IMPROVEMENTS FOUND — checkboxes with per-option metrics
//   WITH SELECTED CHANGES — live canonical preview of the exact selected combination
//   [ Apply Selected Changes ] — applies the exact previewed candidate
//
// The preview is canonical: selected changes → chained retune → canonical confirmation.
// No naive field-overlay merge. No individual result addition.

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { countFailingSeats } from "./zeroFailOptimiser";
import { buildStageResults, STAGE_ORDER, STAGE_DISPLAY_LABELS } from "./improveBassV2StageAuthority";
import { formatAcousticPath } from "./acousticDistance";
import { extractGainAdjustmentDb } from "./gainRationaleBuilder";
import { usePreviewState, resetPreview } from "./selectedCombinationPreviewStore";
import { runSelectedCombinationPreview } from "./selectedCombinationPreview";

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

// ── SeatPills — compact per-seat level pills ─────────────────────────────

function SeatPills({ perSeat }) {
  if (!Array.isArray(perSeat) || !perSeat.length) return null;
  return (
    <div className="flex flex-wrap gap-0.5">
      {perSeat.map((seat, i) => {
        const level = seat.level || "FAIL";
        const n = numericLevel(level);
        const colorClass = n >= 3
          ? "bg-[#213428] text-white"
          : n >= 1
            ? "bg-[#D9E5DF] text-[#213428]"
            : "bg-red-100 text-red-700";
        return (
          <span key={seat.seatId || i} className={`text-[8px] px-1 py-0.5 rounded font-medium ${colorClass}`}>
            {levelText(level)}
          </span>
        );
      })}
    </div>
  );
}

// ── Delta displays ───────────────────────────────────────────────────────

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

// ── Default selection: preselect the recommended combination ─────────────

function getDefaultSelectedKeys(selection, availableKeys) {
  const winner = selection?.winner;
  if (!winner) return new Set();

  const keys = new Set();
  const combinedFrom = winner.combinedFrom || {};
  const isCombined = winner.candidateOrigin === "combined"
    || combinedFrom.calibrationOnly
    || combinedFrom.calibrationRetuned;

  if (isCombined) {
    // Combined candidates retune all calibration levers
    if (availableKeys.has("phase")) keys.add("phase");
    if (availableKeys.has("delay")) keys.add("delay");
    if (availableKeys.has("gain")) keys.add("gain");
    if (availableKeys.has("seating") && (winner.seatingOffsetMm != null || combinedFrom.seatingOffsetMm != null)) {
      keys.add("seating");
    }
    if (availableKeys.has("subPositions") && (winner.isPositionCandidate || combinedFrom.positionCandidateId)) {
      keys.add("subPositions");
    }
  } else if (winner.candidateKind === "phase" && availableKeys.has("phase")) {
    keys.add("phase");
  } else if (winner.candidateKind === "calibration" && availableKeys.has("delay")) {
    keys.add("delay");
  } else if (winner.candidateKind === "gain" && availableKeys.has("gain")) {
    keys.add("gain");
  } else if (winner.candidateKind === "seating" && availableKeys.has("seating")) {
    keys.add("seating");
  } else if (winner.isPositionCandidate && availableKeys.has("subPositions")) {
    keys.add("subPositions");
  }

  return keys;
}

// ── Main component ────────────────────────────────────────────────────────

export default function ImproveBassV2SimplifiedResults({
  selection,
  currentInstances,
  roomDims,
  seatingPositions,
  selectedSubModel,
  onApplyCandidate,
  stale,
  projectId,
  versionId,
  rspPosition,
  amplifierPowerPerSubW,
  subwooferBottomHeightM,
  p14TargetBasis,
  p14TargetLevel,
  p14TargetDb,
  p18TargetBasis,
  currentDesignFingerprint,
}) {
  const improvements = useMemo(() => buildImprovementList(selection), [selection]);
  const availableKeys = useMemo(() => new Set(improvements.map((i) => i.stageKey)), [improvements]);

  const [selectedKeys, setSelectedKeys] = useState(() => getDefaultSelectedKeys(selection, availableKeys));

  // Reset selection when a new result arrives (new optimisation run)
  useEffect(() => {
    setSelectedKeys(getDefaultSelectedKeys(selection, availableKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Reset preview when selection becomes stale
  useEffect(() => {
    if (stale) resetPreview(projectId, versionId);
  }, [stale, projectId, versionId]);

  const previewState = usePreviewState(projectId, versionId);

  // Trigger canonical preview on selection change
  const selectedKeysKey = Array.from(selectedKeys).sort().join(",");
  const paramsRef = useRef({});
  paramsRef.current = {
    projectId, versionId, selection,
    roomDims, subwooferInstances: currentInstances,
    rspPosition, selectedSubModel,
    amplifierPowerPerSubW, subwooferBottomHeightM,
    seatingPositions,
    p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis,
    currentDesignFingerprint,
  };

  useEffect(() => {
    if (selectedKeys.size === 0) {
      resetPreview(projectId, versionId);
      return;
    }
    const controller = new AbortController();
    runSelectedCombinationPreview({
      ...paramsRef.current,
      selectedKeys,
      signal: controller.signal,
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeysKey, selection, currentDesignFingerprint, projectId, versionId]);

  const toggleImprovement = useCallback((stageKey) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    if (onApplyCandidate && previewState.result) {
      onApplyCandidate(previewState.result);
    }
  }, [onApplyCandidate, previewState.result]);

  // ── Current system metrics ──────────────────────────────────────────
  const currentResult = selection?.currentResult;
  const currentFails = countFailingSeats(currentResult);
  const currentPrimaryP20 = primarySeatMetric(currentResult?.perSeatP20);
  const currentFloor = currentPrimaryP20?.level || "FAIL";

  // ── Preview metrics ─────────────────────────────────────────────────
  const previewResult = previewState.result;
  const previewFails = previewResult ? countFailingSeats(previewResult) : null;
  const previewPrimaryP20 = previewResult ? primarySeatMetric(previewResult.perSeatP20) : null;
  const previewFloor = previewPrimaryP20?.level || "FAIL";

  const isPreviewRunning = ["preparing", "retuning", "confirming"].includes(previewState.status);
  const isPreviewComplete = previewState.status === "complete" && !!previewResult;

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

  return (
    <div className="mt-3 space-y-2" data-simplified-results="true">
      {/* ── CURRENT SYSTEM ────────────────────────────────────────────── */}
      <div className="rounded-md border border-[#D9D5CE] bg-white p-2.5" data-current-system="true">
        <div className="text-[11px] font-semibold text-[#1B1A1A] uppercase tracking-wide mb-1.5">
          Current System
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[#8A7B6A] w-10">Fails</span>
            <span className={currentFails > 0 ? "text-red-600 font-semibold" : "text-[#213428]"}>{currentFails}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[#8A7B6A] w-10">Floor</span>
            <span className={levelColor(currentFloor)}>{levelText(currentFloor)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#8A7B6A] w-8">P19</span>
            <SeatPills perSeat={currentResult?.perSeatP19} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#8A7B6A] w-8">P20</span>
            <SeatPills perSeat={currentResult?.perSeatP20} />
          </div>
        </div>
      </div>

      {/* ── IMPROVEMENTS FOUND ────────────────────────────────────────── */}
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

            {/* Per-option metrics: Fails/Floor first, then P19/P20 */}
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

      {/* ── WITH SELECTED CHANGES ────────────────────────────────────── */}
      {selectedKeys.size > 0 && (
        <div className="rounded-md border border-[#213428]/30 bg-[#F8F7F4] p-2.5" data-with-selected-changes="true">
          <div className="text-[11px] font-semibold text-[#213428] uppercase tracking-wide mb-1.5">
            With Selected Changes
          </div>

          {isPreviewRunning && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-[#213428] flex-shrink-0" />
              <span className="text-[11px] text-[#625143]">
                {previewState.progress?.label || "Checking selected combination..."}
              </span>
              {previewState.progress && (
                <span className="text-[9px] text-[#8A7B6A]">
                  ({previewState.progress.current}/{previewState.progress.total})
                </span>
              )}
            </div>
          )}

          {isPreviewComplete && (
            <div className="space-y-1">
              <FailingSeatsDelta before={currentFails} after={previewFails} />
              <MetricDelta
                label="Floor"
                beforeValue={currentFloor}
                afterValue={previewFloor}
                formatFn={levelText}
                levelBased
              />
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-[#8A7B6A] w-8">P19</span>
                  <SeatPills perSeat={currentResult?.perSeatP19} />
                  <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A] flex-shrink-0" />
                  <SeatPills perSeat={previewResult?.perSeatP19} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-[#8A7B6A] w-8">P20</span>
                  <SeatPills perSeat={currentResult?.perSeatP20} />
                  <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A] flex-shrink-0" />
                  <SeatPills perSeat={previewResult?.perSeatP20} />
                </div>
              </div>
            </div>
          )}

          {previewState.status === "error" && (
            <div className="text-[10px] text-red-600">
              {previewState.error || "Preview failed"}
            </div>
          )}

          {previewState.status === "idle" && (
            <div className="text-[10px] text-[#8A7B6A]">
              Select options to preview the combined result.
            </div>
          )}
        </div>
      )}

      {/* ── Apply Selected Changes ────────────────────────────────────── */}
      {!stale && (
        <Button
          type="button"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold mt-1"
          disabled={!isPreviewComplete}
          onClick={handleApply}
          data-apply-selected="true"
        >
          Apply Selected Changes
        </Button>
      )}
    </div>
  );
}