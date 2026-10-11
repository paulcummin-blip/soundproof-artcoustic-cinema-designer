// optimiserCalibrationEvidence.js
// ---------------------------------------------------------------------------
// The persisted CALIBRATION EVIDENCE of a completed optimiser run.
//
// Product rule this exists to satisfy: the panel states what ADI did with the
// calibration levers — delay, gain, polarity and phase — and it may only say
// "no useful calibration-only improvement was found" when the SAVED record
// proves the run actually tested them. Without that proof the panel says the
// evidence was not retained and asks for the re-run that produces it. A claim is
// never made from missing evidence.
//
// Per lever it records, compactly and only from values the run itself produced:
//   - whether the search ran
//   - how many candidates it generated and confirmed
//   - the best candidate it canonically confirmed, with P19 and P20 before/after,
//     the lever's own signed value (delay offset, gain trim) and the limiting seat
//   - the grouping it searched and the range it swept
//   - the run's own reason for not accepting that candidate
//
// READ-ONLY: it reads the selection the run produced. It evaluates nothing,
// scores nothing, recalculates nothing and changes no bass maths, no optimiser
// scoring and no RP22 grading. A value the run did not produce stays null.
// ---------------------------------------------------------------------------

import { readRspP19 } from "../improveBassV2/p19Authority.js";
import { POLARITY_NOT_EVALUATED_REASON } from "./optimiserPlanConstants.js";
import { deviationText } from "./optimiserWholeNumberDb.js";
import {
  CALIBRATION_NO_DECISION_RECORDED_REASON,
  CALIBRATION_READY_TO_APPLY_REASON,
  describeCalibrationNotApplied,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

export const CALIBRATION_EVIDENCE_SCHEMA_VERSION = 1;

/** Every calibration lever the record covers. */
export const CALIBRATION_EVIDENCE_LEVERS = Object.freeze(["delay", "gain", "polarity", "phase"]);

/**
 * The levers the panel's calibration finding names. The no-improvement claim is
 * about exactly these three, so exactly these three must be evidenced.
 */
export const CALIBRATION_CLAIM_LEVERS = Object.freeze(["delay", "gain", "polarity"]);

export const CALIBRATION_EVIDENCE_LABEL = Object.freeze({
  delay: "Delay",
  gain: "Gain",
  polarity: "Polarity",
  phase: "Phase",
});

/** The mandated copy when the run kept no calibration evidence to read. */
export const CALIBRATION_EVIDENCE_MISSING_MESSAGE =
  "Calibration evidence was not retained for this run. Re-run calibration to evaluate delay, gain and polarity.";

/**
 * The same fact stated once more inside Engineer details, where the reader is
 * already looking at the retained record: it says which part of it is absent.
 */
export const CALIBRATION_EVIDENCE_MISSING_DETAIL =
  "Saved optimiser evidence did not include the calibration candidate summary.";

/** The mandated copy when the best calibration candidate was a trade-off. */
export const CALIBRATION_TRADE_OFF_MESSAGE =
  "A calibration change improves one measure and worsens another — held for the designer, not applied automatically.";

/** Whether a lever's own evidence can be read back from the saved record. */
export const CALIBRATION_EVIDENCE_STATUS = Object.freeze({
  RETAINED: "retained",
  MISSING: "missing",
});

/** What came of a lever's search, in the fixed vocabulary. */
export const CALIBRATION_EVIDENCE_RESULT = Object.freeze({
  APPLIED: "applied",
  IMPROVEMENT_NOT_APPLIED: "improvement_not_applied",
  TRADE_OFF: "trade_off",
  NO_USEFUL_IMPROVEMENT: "no_useful_improvement",
  NOT_TESTED_IN_RUN: "not_tested_in_run",
  EVIDENCE_MISSING: "evidence_missing",
});

const RESULT_LABEL = Object.freeze({
  [CALIBRATION_EVIDENCE_RESULT.APPLIED]: "Applied",
  // An improvement that was not applied is NEVER labelled on its own: the label
  // is the rule that held it, read from the run's own calibration decision. When
  // a saved record predates that decision, the honest sentence below is used.
  [CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED]: CALIBRATION_NO_DECISION_RECORDED_REASON,
  [CALIBRATION_EVIDENCE_RESULT.TRADE_OFF]: "Trade-off — not applied automatically",
  [CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT]: "No useful improvement",
  [CALIBRATION_EVIDENCE_RESULT.NOT_TESTED_IN_RUN]: "Not tested in this run",
  [CALIBRATION_EVIDENCE_RESULT.EVIDENCE_MISSING]: "Evidence not retained",
});

/**
 * The outcome text of one lever: for an improvement that was not applied, always
 * the reason it was held — never a bare "not applied".
 */
export function calibrationOutcomeLabel(record) {
  if (!record) return null;
  if (record.result === CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED) {
    return record.notAppliedReason
      || RESULT_LABEL[CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED];
  }
  return RESULT_LABEL[record.result] || null;
}

/** The fixed reason used only when the measured deltas themselves prove it. */
export const CALIBRATION_NO_IMPROVEMENT_REASON =
  "No calibration candidate cleared the 1 dB action threshold";

/** A change smaller than this is not an improvement (the panel's action threshold). */
const ACTION_THRESHOLD_DB = 1;

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round2(value) {
  const numeric = num(value);
  return numeric == null ? null : Math.round(numeric * 100) / 100;
}

/** "+3 dB" / "−2 ms" / "0 dB" — the lever's own signed value. */
function signedText(value, unit, places = 2) {
  const numeric = num(value);
  if (numeric == null) return null;
  const rounded = Number(numeric.toFixed(places));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} ${unit}`;
}

/** "P19 ±4 dB → ±4 dB" — whole numbers, the card's own presentation. */
function pairText(label, before, after) {
  const beforeText = num(before) == null ? null : deviationText(num(before));
  const afterText = num(after) == null ? null : deviationText(num(after));
  if (!beforeText && !afterText) return null;
  if (beforeText && afterText) return `${label} ${beforeText} → ${afterText}`;
  return `${label} ${beforeText || afterText}`;
}

/** The canonical P19 authority of one result. */
function p19Of(result) {
  const read = readRspP19(result);
  return { deviationDb: num(read.deviationDb), level: read.level ?? null };
}

/** The canonical P20 authority of one result. */
function p20Of(result) {
  const value = num(result?.achievedP20VariationDb);
  return value == null ? { value: null, level: null } : { value, level: result?.achievedP20Level ?? null };
}

/**
 * The worst seat of a confirmed result, read from its own per-seat P20 rows. The
 * limiting frequency is stated only when that result carries one.
 */
function limitingOf(result) {
  const rows = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = null;
  for (const seat of rows) {
    const value = Math.abs(num(seat?.variationDbRaw) ?? NaN);
    if (!Number.isFinite(value)) continue;
    if (!worst || value > worst.value) worst = { value, seatId: seat?.seatId ?? null };
  }
  return {
    limitingSeatId: worst?.seatId ?? null,
    limitingFrequencyHz: num(result?.worstFrequencyHz ?? result?.p20WorstFrequencyHz),
  };
}

/** One candidate, stated compactly against the run's own baseline. */
function candidateRecord({ candidateId, result, baseline, extra = null }) {
  const before19 = p19Of(baseline);
  const after19 = p19Of(result);
  const before20 = p20Of(baseline);
  const after20 = p20Of(result);
  return {
    candidateId: candidateId ?? result?.candidateId ?? null,
    p19Before: before19.deviationDb,
    p19After: after19.deviationDb,
    p19LevelBefore: before19.level,
    p19LevelAfter: after19.level,
    p20Before: before20.value,
    p20After: after20.value,
    p20LevelBefore: before20.level,
    p20LevelAfter: after20.level,
    // The improvement the candidate itself measured. Negative = better.
    p19DeltaDb: before19.deviationDb != null && after19.deviationDb != null
      ? round2(after19.deviationDb - before19.deviationDb) : null,
    p20DeltaDb: before20.value != null && after20.value != null
      ? round2(after20.value - before20.value) : null,
    ...limitingOf(result),
    ...(extra || {}),
  };
}

/** Whether a candidate's own measured values show a real improvement. */
function candidateImproves(candidate) {
  if (!candidate) return false;
  const p20 = num(candidate.p20DeltaDb);
  const p19 = num(candidate.p19DeltaDb);
  return (p20 != null && p20 <= -ACTION_THRESHOLD_DB) || (p19 != null && p19 <= -ACTION_THRESHOLD_DB);
}

/** Whether a candidate's own measured values prove nothing useful came of it. */
function candidateProvesNoImprovement(candidate) {
  if (!candidate) return false;
  const p20 = num(candidate.p20DeltaDb);
  const p19 = num(candidate.p19DeltaDb);
  if (p20 == null && p19 == null) return false;
  return !candidateImproves(candidate);
}

/** The grouping the search used, compactly. */
function compactGrouping(grouping) {
  if (!grouping || typeof grouping !== "object") return null;
  const groups = Array.isArray(grouping.groups)
    ? grouping.groups.map((group) => ({
      id: group?.id ?? null,
      label: group?.label ?? null,
      role: group?.role ?? null,
    }))
    : [];
  return { status: grouping.status ?? null, reason: grouping.reason ?? null, groups };
}

/**
 * The range the grouped sweep actually covered, read from the search's own
 * ledger: the adjustments generated per direction and the effective (signed)
 * offsets those adjustments produce for the rear group.
 */
function ledgerRange(ledger) {
  const rows = Array.isArray(ledger) ? ledger : [];
  if (rows.length === 0) return null;
  const directions = new Map();
  const offsets = [];
  for (const row of rows) {
    const adjustment = num(row?.adjustmentMs);
    const direction = row?.direction ?? null;
    if (direction && direction !== "current" && adjustment != null) {
      const current = directions.get(direction) || { id: direction, minMs: adjustment, maxMs: adjustment, candidates: 0 };
      current.minMs = Math.min(current.minMs, adjustment);
      current.maxMs = Math.max(current.maxMs, adjustment);
      current.candidates += 1;
      directions.set(direction, current);
    }
    const offset = num(row?.effectiveOffsetMs);
    if (offset != null && offset !== 0) offsets.push(offset);
  }
  return {
    directions: [...directions.values()],
    signedOffsetsMs: offsets.length ? { min: Math.min(...offsets), max: Math.max(...offsets) } : null,
  };
}

/**
 * One lever's record. `evidenceStatus` states whether the saved record can be
 * read back at all: a search that ran and kept its count or its best candidate,
 * or a search that did not apply to this design and recorded why.
 */
function leverRecord({
  lever,
  tested = false,
  candidateCount = null,
  candidateCounts = null,
  grouping = null,
  testedRange = null,
  bestCandidate = null,
  result = CALIBRATION_EVIDENCE_RESULT.EVIDENCE_MISSING,
  reason = null,
  scope = null,
}) {
  const retained = (tested === true && (candidateCount != null || bestCandidate != null))
    || (tested !== true && Boolean(reason));
  return {
    lever,
    label: CALIBRATION_EVIDENCE_LABEL[lever] || lever,
    tested: tested === true,
    evidenceStatus: retained
      ? CALIBRATION_EVIDENCE_STATUS.RETAINED
      : CALIBRATION_EVIDENCE_STATUS.MISSING,
    candidateCount,
    candidateCounts,
    grouping,
    testedRange,
    bestCandidate,
    result: retained ? result : CALIBRATION_EVIDENCE_RESULT.EVIDENCE_MISSING,
    reason,
    scope,
  };
}

/** The run's own evaluation of one candidate, when it recorded one. */
function evaluationFor(evaluations, candidateId) {
  const list = Array.isArray(evaluations) ? evaluations : [];
  return list.find((entry) => entry?.candidateId === candidateId) || null;
}

/** The run's own reason for the evaluation of one candidate, when it recorded one. */
function reasonForCandidate({ candidateId, evaluations, material }) {
  const evaluation = evaluationFor(evaluations, candidateId);
  // The run's own recorded reason first: the material assessment, then the
  // evaluation it produced for this candidate. Never a reason this module made up.
  return material?.reason
    || (typeof evaluation?.materiality?.reason === "string" ? evaluation.materiality.reason : null)
    || (typeof evaluation?.tradeOff?.reason === "string" ? evaluation.tradeOff.reason : null)
    || null;
}

/** What came of a lever's search, from the run's own records. */
function outcomeFor({ applied = false, tradeOff = false, material = null, bestCandidate = null, tested = true }) {
  if (applied) return CALIBRATION_EVIDENCE_RESULT.APPLIED;
  if (!tested) return CALIBRATION_EVIDENCE_RESULT.NOT_TESTED_IN_RUN;
  if (tradeOff) return CALIBRATION_EVIDENCE_RESULT.TRADE_OFF;
  if (material?.material === true || candidateImproves(bestCandidate)) {
    return CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED;
  }
  return CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT;
}

/** The delay lever: the grouped front/rear sweep and its best confirmed option. */
function buildDelayEvidence({ selection, baseline, appliedLevers }) {
  const diagnostics = selection?.calibrationDiagnostics || null;
  const ledger = Array.isArray(diagnostics?.ledger) ? diagnostics.ledger : [];
  const options = Array.isArray(diagnostics?.options) ? diagnostics.options : [];
  const retention = num(diagnostics?.retained);
  const confirmed = num(diagnostics?.confirmed);
  const grouping = compactGrouping(diagnostics?.grouping);
  const accepted = selection?.calibrationResult || null;

  const candidates = options
    .map((option) => ({
      candidateId: option?.candidateId ?? option?.canonical?.candidateId ?? null,
      result: option?.canonical || option?.validated || null,
      valid: option?.validity?.valid !== false,
    }))
    .filter((entry) => entry.result && entry.valid);

  // The run's own accepted delay candidate first; otherwise the confirmed option
  // whose own canonical values are best. Reading the minimum of values the run
  // already confirmed selects WHICH evidence to show — it scores nothing.
  const best = accepted
    ? (candidates.find((entry) => entry.candidateId === accepted.candidateId)
      || { candidateId: accepted.candidateId ?? null, result: accepted, valid: true })
    : candidates
      .slice()
      .sort((a, b) => {
        const p20 = (num(p20Of(a.result).value) ?? Infinity) - (num(p20Of(b.result).value) ?? Infinity);
        if (p20 !== 0) return p20;
        const p19 = (num(p19Of(a.result).deviationDb) ?? Infinity) - (num(p19Of(b.result).deviationDb) ?? Infinity);
        if (p19 !== 0) return p19;
        return String(a.candidateId).localeCompare(String(b.candidateId));
      })[0] || null;

  const ledgerRow = best
    ? ledger.find((row) => row?.id === best.candidateId) || null
    : null;
  const bestCandidate = best
    ? candidateRecord({
      candidateId: best.candidateId,
      result: best.result,
      baseline,
      extra: {
        // The engine's own signed offset for that candidate, never a re-derived one.
        signedOffsetMs: num(ledgerRow?.effectiveOffsetMs),
        adjustmentMs: num(ledgerRow?.adjustmentMs),
        direction: ledgerRow?.direction ?? null,
      },
    })
    : null;

  // The run's own verdict on this candidate: a trade-off is never restated as a
  // no-improvement conclusion, whatever the measured deltas are.
  const evaluation = evaluationFor(diagnostics?.evaluations, best?.candidateId ?? null);
  const reason = reasonForCandidate({
    candidateId: best?.candidateId ?? null,
    evaluations: diagnostics?.evaluations,
    material: selection?.calibrationMaterial,
  }) || (bestCandidate && candidateProvesNoImprovement(bestCandidate) ? CALIBRATION_NO_IMPROVEMENT_REASON : null);

  const tested = num(diagnostics?.coarseCount) != null || num(diagnostics?.retained) != null
    || num(diagnostics?.confirmed) != null || candidates.length > 0;
  const skippedReason = typeof diagnostics?.grouping?.reason === "string" ? diagnostics.grouping.reason : null;

  return leverRecord({
    lever: "delay",
    tested,
    candidateCount: retention ?? confirmed,
    candidateCounts: diagnostics ? {
      coarse: num(diagnostics.coarseCount),
      fine: num(diagnostics.fineCount),
      retained: retention,
      confirmed,
      valid: num(diagnostics.valid),
      invalid: num(diagnostics.invalid),
    } : null,
    grouping,
    testedRange: ledgerRange(ledger),
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("delay"),
      tradeOff: Boolean(accepted?.tradeOff)
        || Boolean(best?.result?.tradeOff)
        || evaluation?.status === "trade-off",
      material: selection?.calibrationMaterial,
      bestCandidate,
      tested,
    }),
    reason: tested ? reason : skippedReason,
    scope: null,
  });
}

/** The gain lever: the grouped front/rear trim sweep and its best attempt. */
function buildGainEvidence({ selection, baseline, appliedLevers }) {
  const diagnostics = selection?.gainDiagnostics || null;
  const accepted = selection?.gainResult || null;
  const attempt = diagnostics?.bestAttempt || null;
  const gainAdjustable = typeof diagnostics?.gainAdjustable === "boolean" ? diagnostics.gainAdjustable : null;

  const bestCandidate = accepted
    ? candidateRecord({ candidateId: accepted.candidateId, result: accepted, baseline, extra: { adjustmentDb: num(attempt?.adjustmentDb) } })
    : attempt
      ? {
        candidateId: attempt.candidateId ?? null,
        p19Before: p19Of(baseline).deviationDb, p19After: num(attempt.p19VariationDb),
        p19LevelBefore: p19Of(baseline).level, p19LevelAfter: attempt.p19Level ?? null,
        p20Before: p20Of(baseline).value, p20After: num(attempt.p20VariationDb),
        p20LevelBefore: p20Of(baseline).level, p20LevelAfter: attempt.p20Level ?? null,
        p19DeltaDb: p19Of(baseline).deviationDb != null && num(attempt.p19VariationDb) != null
          ? round2(num(attempt.p19VariationDb) - p19Of(baseline).deviationDb) : null,
        p20DeltaDb: p20Of(baseline).value != null && num(attempt.p20VariationDb) != null
          ? round2(num(attempt.p20VariationDb) - p20Of(baseline).value) : null,
        limitingSeatId: null,
        limitingFrequencyHz: null,
        adjustmentDb: num(attempt.adjustmentDb),
      }
      : null;

  // The run's own verdict on this candidate: a trade-off is never restated as a
  // no-improvement conclusion, whatever the measured deltas are.
  const evaluation = evaluationFor(diagnostics?.evaluations, bestCandidate?.candidateId ?? null);
  const reason = reasonForCandidate({
    candidateId: bestCandidate?.candidateId ?? null,
    evaluations: diagnostics?.evaluations,
    material: selection?.gainMaterial,
  }) || (bestCandidate && candidateProvesNoImprovement(bestCandidate) ? CALIBRATION_NO_IMPROVEMENT_REASON : null);

  const tested = num(diagnostics?.coarseCount) != null || num(diagnostics?.retained) != null
    || num(diagnostics?.confirmed) != null || Boolean(attempt) || Boolean(accepted);
  const notApplicableReason = gainAdjustable === false
    ? (typeof diagnostics?.reason === "string" ? diagnostics.reason : null)
    : null;

  return leverRecord({
    lever: "gain",
    tested,
    candidateCount: num(diagnostics?.retained) ?? num(diagnostics?.confirmed),
    candidateCounts: diagnostics ? {
      coarse: num(diagnostics.coarseCount),
      fine: num(diagnostics.fineCount),
      retained: num(diagnostics.retained),
      confirmed: num(diagnostics.confirmed),
      valid: num(diagnostics.valid),
      invalid: num(diagnostics.invalid),
    } : null,
    grouping: diagnostics
      ? {
        status: diagnostics.groupingStatus ?? diagnostics.grouping?.status ?? null,
        reason: diagnostics.reason ?? diagnostics.grouping?.reason ?? null,
        groups: Array.isArray(diagnostics.groups)
          ? diagnostics.groups.map((group) => ({ id: group?.id ?? null, label: group?.label ?? null, role: null }))
          : compactGrouping(diagnostics.grouping)?.groups || [],
      }
      : null,
    testedRange: null,
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("gain"),
      tradeOff: Boolean(accepted?.tradeOff) || evaluation?.status === "trade-off",
      material: selection?.gainMaterial,
      bestCandidate,
      tested,
    }),
    reason: tested ? reason : notApplicableReason,
    scope: gainAdjustable === false ? "Gain cannot be adjusted for this layout" : null,
  });
}

/** The polarity lever: explored inside the grouped phase/polarity search. */
function buildPolarityEvidence({ selection, baseline, appliedLevers }) {
  const phase = selection?.phaseDiagnostics || null;
  const combined = selection?.combinedResult || null;
  const optionCount = num(phase?.optionCount);
  const bestCandidate = combined
    ? candidateRecord({ candidateId: combined.candidateId, result: combined, baseline })
    : null;

  const reason = typeof selection?.combinedMaterial?.reason === "string"
    ? selection.combinedMaterial.reason
    : (combined?.tradeOff?.reason || null);

  const tested = optionCount != null ? optionCount > 0 : Boolean(bestCandidate);

  return leverRecord({
    lever: "polarity",
    tested,
    candidateCount: optionCount,
    candidateCounts: { groupedSearchOptions: optionCount },
    grouping: compactGrouping(phase?.grouping),
    testedRange: ledgerRange(phase?.ledger),
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("polarity"),
      tradeOff: Boolean(combined?.tradeOff),
      material: selection?.combinedMaterial,
      bestCandidate,
      tested,
    }),
    reason,
    scope: POLARITY_NOT_EVALUATED_REASON,
  });
}

/** The phase lever: the subwoofer-only all-pass search, and what it does not cover. */
function buildPhaseEvidence({ selection, baseline, appliedLevers }) {
  const phase = selection?.phaseDiagnostics || null;
  const result = selection?.phaseResult || null;
  const optionCount = num(phase?.optionCount);
  const referenceHz = num(phase?.phaseReferenceHz);
  const bestCandidate = result
    ? candidateRecord({ candidateId: result.candidateId, result, baseline })
    : null;

  const scope = [
    `Subwoofer-only all-pass alignment${referenceHz != null ? ` referenced at ${referenceHz} Hz` : ""}`,
    "the speaker/sub crossover region is not evaluated",
  ].join(" — ");

  const tested = optionCount != null ? optionCount > 0 : Boolean(bestCandidate);

  return leverRecord({
    lever: "phase",
    tested,
    candidateCount: optionCount,
    candidateCounts: { groupedSearchOptions: optionCount },
    grouping: compactGrouping(phase?.grouping),
    testedRange: ledgerRange(phase?.ledger),
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("phase"),
      tradeOff: Boolean(result?.tradeOff),
      material: selection?.phaseMaterial,
      bestCandidate,
      tested,
    }),
    reason: typeof selection?.phaseMaterial?.reason === "string"
      ? selection.phaseMaterial.reason
      : (phase?.grouping?.reason || null),
    scope,
  });
}

/**
 * Build the compact calibration evidence for a completed run.
 *
 * @param {object} params
 * @param {object|null} params.selection - the run's own selection
 * @param {object|null} [params.baseline] - the run's baseline result
 * @param {string[]} [params.appliedLevers] - levers the saved plan offers to apply
 * @returns {object|null} null when the run retained nothing to read
 */
export function buildCalibrationEvidence({ selection = null, baseline = null, appliedLevers = [] } = {}) {
  if (!selection || typeof selection !== "object") return null;
  const baselineResult = baseline || selection.currentResult || null;
  const applied = Array.isArray(appliedLevers) ? appliedLevers.filter(Boolean) : [];

  const levers = {
    delay: buildDelayEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
    gain: buildGainEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
    polarity: buildPolarityEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
    phase: buildPhaseEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
  };

  // Nothing at all was retained: the record is absent rather than empty, so the
  // panel states the missing-evidence message instead of an empty table.
  if (!CALIBRATION_EVIDENCE_LEVERS.some((key) => levers[key].evidenceStatus === CALIBRATION_EVIDENCE_STATUS.RETAINED)) {
    return null;
  }

  return {
    schemaVersion: CALIBRATION_EVIDENCE_SCHEMA_VERSION,
    recordedAt: new Date().toISOString(),
    levers,
  };
}

/** One lever's record from a persisted evidence block, or null. */
export function calibrationEvidenceFor(evidence, leverKey) {
  if (!evidence || typeof evidence !== "object") return null;
  const record = evidence.levers?.[leverKey] || null;
  return record && typeof record === "object" ? record : null;
}

/** "+2 ms · P19 ±4 dB → ±4 dB · P20 ±5 dB → ±4 dB · No useful improvement" */
export function describeCalibrationLever(record) {
  if (!record || record.evidenceStatus !== CALIBRATION_EVIDENCE_STATUS.RETAINED) return null;
  const label = (record.label || CALIBRATION_EVIDENCE_LABEL[record.lever] || record.lever || "").toLowerCase();
  const parts = [];
  const best = record.bestCandidate || null;

  if (best) {
    const value = record.lever === "delay"
      ? signedText(best.signedOffsetMs, "ms")
      : (record.lever === "gain" ? signedText(best.adjustmentDb, "dB") : null);
    parts.push(`Best ${label}${value ? ` ${value}` : ""}`);
    const p19 = pairText("P19", best.p19Before, best.p19After);
    const p20 = pairText("P20", best.p20Before, best.p20After);
    if (p19) parts.push(p19);
    if (p20) parts.push(p20);
  } else if (num(record.candidateCount) != null) {
    parts.push(`${record.candidateCount} candidates tested`);
  }

  const outcome = RESULT_LABEL[record.result] || null;
  if (outcome) parts.push(outcome);
  if (!best && !record.tested && record.reason) parts.push(record.reason);
  else if (record.reason) parts.push(record.reason);

  return parts.length ? parts.join(" · ") : null;
}

/**
 * What the panel may state about calibration, read from the saved evidence.
 *
 * A lever's own search is proven only when the record kept its count or its best
 * confirmed candidate. The no-improvement sentence may be shown only when every
 * named lever is proven and none of them found a trade-off or an unapplied
 * improvement; otherwise the panel states what the evidence actually supports.
 */
export function resolveCalibrationEvidenceState(evidence) {
  const missingLevers = CALIBRATION_CLAIM_LEVERS
    .filter((key) => calibrationEvidenceFor(evidence, key)?.evidenceStatus !== CALIBRATION_EVIDENCE_STATUS.RETAINED);

  if (missingLevers.length > 0) {
    return {
      evidenceRetained: false,
      missingLevers,
      message: CALIBRATION_EVIDENCE_MISSING_MESSAGE,
      anyTested: false,
      noImprovementProven: false,
      tradeOffHeld: false,
      tradeOffMessage: null,
      improvementHeld: false,
      leverLines: [],
    };
  }

  const records = CALIBRATION_CLAIM_LEVERS.map((key) => calibrationEvidenceFor(evidence, key));
  const tested = records.filter((record) => record.tested === true);
  const tradeOffHeld = tested.some((record) => record.result === CALIBRATION_EVIDENCE_RESULT.TRADE_OFF);
  const improvementHeld = tested.some((record) => record.result === CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED);

  // The no-improvement sentence is proven only when every lever that was tested
  // kept the best candidate it confirmed AND that candidate's own values show no
  // useful improvement.
  const noImprovementProven = tested.length > 0
    && !tradeOffHeld
    && !improvementHeld
    && tested.every((record) => record.result === CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT
      && record.bestCandidate != null);

  return {
    evidenceRetained: true,
    missingLevers: [],
    message: null,
    anyTested: tested.length > 0,
    noImprovementProven,
    tradeOffHeld,
    tradeOffMessage: tradeOffHeld ? CALIBRATION_TRADE_OFF_MESSAGE : null,
    improvementHeld,
    leverLines: CALIBRATION_EVIDENCE_LEVERS
      .map((key) => calibrationEvidenceFor(evidence, key))
      .filter(Boolean)
      .map((record) => ({ lever: record.lever, label: record.label, text: describeCalibrationLever(record) }))
      .filter((line) => Boolean(line.text)),
  };
}