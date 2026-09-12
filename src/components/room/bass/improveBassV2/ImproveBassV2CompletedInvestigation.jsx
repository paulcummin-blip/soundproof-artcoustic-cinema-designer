// ImproveBassV2CompletedInvestigation.jsx
// Completed investigation panel — persists after the Improve Bass run finishes.
//
// Shows the full stage checklist with recorded verdicts and numerical results.
// Mounted in ALL terminal states: complete, cancelled, error, stale.
//
// The running progress panel (ImproveBassV2Progress) shows live stages with a
// spinner and Cancel button. This panel shows the SAME stages after the run
// completes, without the spinner/Cancel — it becomes a permanent record of
// what Sound Proof actually checked during that run.
//
// Numerical results (delay option counts, best P19/P20 before→after, position
// phases) are extracted from the selection object that the engine already
// produced. No values are invented.

import React from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Minus, Circle } from "lucide-react";
import { buildStageDisplay, formatStageVerdict } from "./improveBassV2StageMapping.js";
import { delayMsToAcousticDistance } from "./acousticDistance";
import { isCalibrationApplied } from "./improveBassV2ApplyCalibration.js";
import { isOptimisedApplied } from "./improveBassV2Apply.js";
import { isProvenanceApplied, getActiveProvenance } from "./appliedProvenance.js";
import { isSeatingProvenanceApplied } from "./seatingProvenanceAuthority.js";
import { buildStageResults } from "./improveBassV2StageAuthority.js";

// Map the display stage keys (from buildStageDisplay) to the stage authority
// keys (from buildStageResults) so we can look up the result for applied-check.
function mapDisplayKeyToStageKey(displayKey) {
  const map = {
    phase_polarity: "phase",
    delays: "delay",
    gain: "gain",
    sub_positions: "subPositions",
    seating_positions: "seating",
  };
  return map[displayKey] || displayKey;
}

function buildStageResultsFromSelection(selection) {
  try {
    return buildStageResults(selection);
  } catch {
    return null;
  }
}

// ── Pure helpers (exported for testing) ──────────────────────────────────

/**
 * Find the primary-seat metric from a per-seat result array.
 * Prefers isPrimary===true; falls back to the first entry.
 */
export function primarySeatMetric(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  return perSeatArray.find((s) => s?.isPrimary === true) || perSeatArray[0];
}

/**
 * Find the best valid calibration option from calibrationDiagnostics.options.
 * "Best" = lowest primary-seat P19 variationDbRaw.
 * Returns the option object (with .canonical) or null.
 */
export function findBestCalibrationOption(calibrationDiagnostics) {
  if (!calibrationDiagnostics?.options) return null;
  const valid = calibrationDiagnostics.options.filter(
    (o) => o?.validity?.valid && o?.canonical,
  );
  if (!valid.length) return null;
  let best = null;
  let bestP19 = Infinity;
  for (const opt of valid) {
    const p19 = primarySeatMetric(opt.canonical.perSeatP19);
    const raw = p19 ? Math.abs(Number(p19.variationDbRaw) || 0) : Infinity;
    if (raw < bestP19) {
      bestP19 = raw;
      best = opt;
    }
  }
  return best;
}

function fmtDb(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(2);
}

function fmtDb1(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(1);
}

/**
 * Build per-stage numerical detail strings from the engine selection.
 *
 * @param {object} selection - the engine's selection object (state.winner)
 * @returns {object} map of stageKey → detail string
 */
export function buildStageDetails(selection) {
  const details = {};
  if (!selection) return details;

  // ── Delays stage ───────────────────────────────────────────────────
  const calDiag = selection.calibrationDiagnostics;
  if (calDiag) {
    const parts = [];
    const coarse = Number(calDiag.coarseCount) || 0;
    const fine = Number(calDiag.fineCount) || 0;
    const total = coarse + fine;
    const optionCount = calDiag.options?.length || 0;

    if (total > 0) {
      parts.push(`Checked ${total} grouped-delay options`);
    } else if (optionCount > 0) {
      parts.push(`Checked ${optionCount} grouped-delay options`);
    }

    const calResult = selection.calibrationResult;
    const currentResult = selection.currentResult;

    if (calResult && currentResult) {
      // Material calibration winner exists — show group label + delay + acoustic path
      const grouping = calDiag.grouping;
      const groupedDelay = calResult.groupedDelay;
      if (groupedDelay && grouping?.groups?.length) {
        const adjustmentMs = Number(groupedDelay.adjustmentMs) || 0;
        if (adjustmentMs > 0.01) {
          const adjustedGroup = grouping.groups.find(
            (g) => g.id === groupedDelay.direction,
          );
          const groupLabel = adjustedGroup?.label || "Grouped delay";
          const acousticM = delayMsToAcousticDistance(adjustmentMs);
          parts.push(`${groupLabel} +${adjustmentMs.toFixed(1)} ms`);
          parts.push(`Equivalent acoustic path +${acousticM.toFixed(2)} m (timing equivalent)`);
        }
      }

      const beforeP19 = primarySeatMetric(currentResult.perSeatP19);
      const afterP19 = primarySeatMetric(calResult.perSeatP19);
      const beforeP20 = primarySeatMetric(currentResult.perSeatP20);
      const afterP20 = primarySeatMetric(calResult.perSeatP20);

      if (beforeP19 && afterP19) {
        parts.push(`P19 ${fmtDb(beforeP19.variationDbRaw)} → ${fmtDb(afterP19.variationDbRaw)} dB`);
      }
      if (beforeP20 && afterP20) {
        parts.push(`P20 ${fmtDb(beforeP20.variationDbRaw)} → ${fmtDb(afterP20.variationDbRaw)} dB`);
      }
    } else if (currentResult) {
      // No material winner — find the best valid option
      const bestOpt = findBestCalibrationOption(calDiag);
      if (bestOpt?.canonical) {
        const beforeP19 = primarySeatMetric(currentResult.perSeatP19);
        const candP19 = primarySeatMetric(bestOpt.canonical.perSeatP19);
        if (beforeP19 && candP19) {
          parts.push("Best change below material threshold");
          parts.push(`P19 ${fmtDb1(beforeP19.variationDbRaw)} → ${fmtDb1(candP19.variationDbRaw)} dB`);
          const beforeLevel = beforeP19.level;
          const afterLevel = candP19.level;
          if (Number(beforeLevel) === Number(afterLevel) && beforeLevel != null) {
            parts.push("Same RP22 level");
          }
        }
      }
    }

    if (parts.length) {
      details.delays = parts.join(". ");
    }
  }

  // ── Sub positions stage ────────────────────────────────────────────
  const posOpt = selection.positionOptimisation;
  const evalCounts = selection.evaluationCounts;
  if (posOpt || evalCounts) {
    const phases = [];
    if (evalCounts) {
      if (evalCounts.symmetric) phases.push("symmetric");
      if (evalCounts.asymmetricPair) phases.push("alternative");
      if (evalCounts.individual) phases.push("individual");
    }
    const parts = [];
    if (phases.length) {
      parts.push(`Checked ${phases.join(" / ")} positions`);
    }
    if (posOpt) {
      if (posOpt.materialSubImprovementFound) {
        parts.push("Material improvement found");
      } else {
        parts.push("No safe material improvement found");
      }
    }
    if (parts.length) {
      details.sub_positions = parts.join(". ");
    }
  }

  // ── Gain stage ─────────────────────────────────────────────────────
  const gainDiag = selection.gainDiagnostics;
  if (gainDiag) {
    const parts = [];
    const tested = Number(gainDiag.tested) || gainDiag.options?.length || 0;
    if (tested > 0) parts.push(`Checked ${tested} grouped-gain options`);
    const gainRes = selection.gainResult;
    const currentRes = selection.currentResult;
    if (gainRes && currentRes) {
      const beforeP19 = primarySeatMetric(currentRes.perSeatP19);
      const afterP19 = primarySeatMetric(gainRes.perSeatP19);
      if (beforeP19 && afterP19) {
        parts.push(`Best result: P19 primary ${fmtDb(beforeP19.variationDbRaw)} → ${fmtDb(afterP19.variationDbRaw)} dB`);
      }
    } else if (gainDiag.status === "skipped") {
      parts.push("Skipped — single source or symmetric pair");
    } else {
      parts.push("No material gain improvement found");
    }
    if (parts.length) details.gain = parts.join(". ");
  }

  // ── Seating positions stage ───────────────────────────────────────
  const seatingDiag = selection.seatingDiagnostics;
  if (seatingDiag) {
    const parts = [];
    const tested = Number(seatingDiag.tested) || 0;
    if (tested > 0) parts.push(`Checked ${tested} seating offsets (±500 mm)`);
    const seatingRes = selection.seatingResult;
    if (seatingRes) {
      const offset = seatingRes.seatingOffsetMm || 0;
      const dir = offset < 0 ? "toward screen" : "away from screen";
      parts.push(`Best result: move ${Math.abs(offset)} mm ${dir}`);
      const beforeP19 = primarySeatMetric(selection.currentResult?.perSeatP19);
      const afterP19 = primarySeatMetric(seatingRes.perSeatP19);
      if (beforeP19 && afterP19) {
        parts.push(`P19 primary ${fmtDb(beforeP19.variationDbRaw)} → ${fmtDb(afterP19.variationDbRaw)} dB`);
      }
    } else if (tested > 0) {
      parts.push("No material seating improvement found");
    } else {
      parts.push("Not tested");
    }
    if (parts.length) details.seating_positions = parts.join(". ");
  }

  // ── Phase stage ───────────────────────────────────────────────────
  details.phase_polarity = "Not available yet — 5-degree grouped phase search requires an all-pass or processor phase control model.";

  return details;
}

// ── Stage row renderer ───────────────────────────────────────────────────

/**
 * Check whether a stage's result has been applied to the current instances.
 * Uses the same authority as the live Apply check.
 *
 * For Seating, provenance is project-level (appliedSeatingProvenance), NOT
 * on subwooferInstances. The function must NOT inspect subwooferInstances
 * for the Seating stage.
 */
function isStageResultApplied(stageKey, stage, currentInstances, roomDims, appliedSeatingProvenance, winnerApplyFingerprint) {
  if (!stage?.result) return false;

  // Seating stage — project-level provenance authority
  if (stageKey === "seating") {
    return isSeatingProvenanceApplied(appliedSeatingProvenance, stage, winnerApplyFingerprint);
  }

  if (!currentInstances) return false;

  // C3 — APPLIED must match the action record for that stage/candidate.
  // Check provenance FIRST. Only if provenance exists and matches is the
  // stage truly APPLIED. Do NOT infer APPLIED solely from current sub values.
  const candidateId = stage.result.candidateId;
  if (candidateId) {
    if (isProvenanceApplied(currentInstances, stageKey, candidateId)) {
      return true;
    }
    // Provenance exists but doesn't match this candidate → NOT applied.
    // This is the false-positive control: matching values without a matching
    // provenance record do NOT show APPLIED.
    const activeProv = getActiveProvenance(currentInstances);
    if (activeProv) {
      // Some other candidate was applied — this one was not.
      return false;
    }
    // No provenance at all — fall through to legacy value-matching check
    // for backward compatibility with instances that predate provenance.
  }

  if (stageKey === "delay" || stageKey === "gain") {
    return isCalibrationApplied(
      currentInstances,
      stage.result.appliedTuning || stage.result.tuning || [],
    );
  }
  if (stageKey === "subPositions") {
    return isOptimisedApplied(currentInstances, stage.result, roomDims);
  }
  return false;
}

function CompletedStageRow({ stage, detail, applied }) {
  const { status, label, verdict } = stage;

  if (status === "not_tested") {
    return (
      <div className="flex items-start gap-2">
        <Minus className="h-3.5 w-3.5 text-[#B0A89B] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] text-[#B0A89B]">
            {label} — Not tested
          </div>
        </div>
      </div>
    );
  }

  if (status === "not_available") {
    return (
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-[#8A7B6A] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] text-[#625143]">
            {label} — Not available yet
          </div>
          {detail && (
            <div className="text-[10px] text-[#8A7B6A] mt-0.5 leading-relaxed">
              {detail}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === "completed") {
    const verdictText = formatStageVerdict(verdict);
    return (
      <div className="flex items-start gap-2">
        <CheckCircle2 className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${applied ? "text-white bg-[#213428] rounded-full" : "text-[#213428]"}`} />
        <div className="min-w-0">
          <div className="text-[11px] text-[#213428] font-medium flex items-center gap-1.5 flex-wrap">
            {label} checked
            {verdictText && !applied && (
              <span className="font-normal text-[#8A7B6A]"> — {verdictText}</span>
            )}
            {applied && (
              <span className="inline-flex items-center gap-0.5 rounded bg-[#213428] px-1 py-px text-[9px] font-semibold text-white">
                <CheckCircle2 className="h-2.5 w-2.5" />
                APPLIED
              </span>
            )}
          </div>
          {detail && (
            <div className="text-[10px] text-[#625143] mt-0.5 leading-relaxed">
              {detail}
            </div>
          )}
        </div>
      </div>
    );
  }

  // pending or active (should not happen in terminal, but handle gracefully)
  return (
    <div className="flex items-start gap-2">
      <Circle className="h-3.5 w-3.5 text-[#D0CBC2] mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-[#B0A89B]">{label}</div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

/**
 * Completed investigation panel — persists after the run finishes.
 *
 * @param {object} state - improveBassV2 store state
 * @param {object} selection - the engine's selection object (state.winner)
 * @param {boolean} stale - true when the completed result is stale due to
 *   a bass-relevant design change after completion
 */
export default function ImproveBassV2CompletedInvestigation({ state, selection, stale, currentInstances, roomDims, appliedSeatingProvenance }) {
  const display = buildStageDisplay(state);
  const status = state?.status || "idle";

  let icon;
  let headerLabel;
  let headerClass;

  if (stale) {
    icon = <AlertTriangle className="h-4 w-4 text-amber-700" />;
    headerLabel = "Design changed — run Improve Bass again";
    headerClass = "text-amber-800";
  } else if (status === "complete") {
    icon = <CheckCircle2 className="h-4 w-4 text-[#213428]" />;
    headerLabel = "What Sound Proof checked";
    headerClass = "text-[#213428]";
  } else if (status === "cancelled") {
    icon = <AlertCircle className="h-4 w-4 text-amber-700" />;
    headerLabel = "Investigation cancelled";
    headerClass = "text-amber-800";
  } else if (status === "error") {
    icon = <AlertCircle className="h-4 w-4 text-red-700" />;
    headerLabel = "Calculation stopped";
    headerClass = "text-red-800";
  } else if (status === "stale") {
    icon = <AlertTriangle className="h-4 w-4 text-amber-700" />;
    headerLabel = "Design changed — optimisation result discarded";
    headerClass = "text-amber-800";
  } else {
    icon = <CheckCircle2 className="h-4 w-4 text-[#213428]" />;
    headerLabel = "What Sound Proof checked";
    headerClass = "text-[#213428]";
  }

  const stageDetails = buildStageDetails(selection);

  // Build per-stage applied status from the current instances
  const stagesFromSelection = selection ? buildStageResultsFromSelection(selection) : null;

  return (
    <div
      className={`mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3 ${
        stale ? "opacity-60" : ""
      }`}
      data-completed-investigation="true"
      data-completed-status={status}
      data-completed-stale={stale ? "true" : "false"}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className={`text-[12px] font-semibold ${headerClass}`}>{headerLabel}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {display.stages.map((stage) => {
          const stageKey = mapDisplayKeyToStageKey(stage.key);
          const stageResult = stagesFromSelection?.[stageKey];
          const applied = isStageResultApplied(stageKey, stageResult, currentInstances, roomDims, appliedSeatingProvenance, state?.winner?.applyFingerprint);
          return (
            <CompletedStageRow
              key={stage.key}
              stage={stage}
              detail={stageDetails[stage.key]}
              applied={applied}
            />
          );
        })}
      </div>
    </div>
  );
}